#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const TABLE = 'sponsors';
const PAGE_SIZE = 50;
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

function loadDotEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && !(key in process.env)) process.env[key] = value;
  }
}

function requiredEnv(...names) {
  const value = names.map((name) => process.env[name]).find(Boolean);
  if (!value) throw new Error(`Missing env: ${names.join(' or ')}`);
  return value;
}

function asText(value) {
  return String(value || '').trim();
}

function toKb(bytes) {
  return Number((Number(bytes || 0) / 1024).toFixed(2));
}

function parseContentLength(value) {
  const parsed = Number.parseInt(asText(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function isLikelyUrl(text) {
  return /^https?:\/\//i.test(asText(text));
}

async function fetchSizeBytes(url) {
  const target = asText(url);
  if (!isLikelyUrl(target)) return null;

  try {
    const head = await fetch(target, { method: 'HEAD' });
    if (head.ok) {
      const fromHeader = parseContentLength(head.headers.get('content-length'));
      if (fromHeader) return fromHeader;
    }
  } catch {}

  try {
    const response = await fetch(target);
    if (!response.ok) return null;
    const fromHeader = parseContentLength(response.headers.get('content-length'));
    if (fromHeader) return fromHeader;
    const arrayBuffer = await response.arrayBuffer();
    const bytes = arrayBuffer.byteLength;
    return bytes > 0 ? bytes : null;
  } catch {
    return null;
  }
}

loadDotEnvFile();

const supabase = createClient(
  requiredEnv('VITE_SUPABASE_URL', 'SUPABASE_URL'),
  requiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_ANON_KEY')
);

async function fetchAllRows() {
  const rows = [];
  let from = 0;
  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(TABLE)
      .select('id,photo_url,size')
      .range(from, to);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function updateSize(rowId, sizeKb) {
  const { error } = await supabase.from(TABLE).update({ size: sizeKb }).eq('id', rowId);
  if (error) throw error;
}

function shouldProcessRow(row) {
  if (!isLikelyUrl(row.photo_url)) return false;
  if (FORCE) return true;
  const existing = Number(row.size);
  return !Number.isFinite(existing) || existing <= 0;
}

async function run() {
  const rows = await fetchAllRows();
  const targets = rows.filter(shouldProcessRow);

  console.log(`Total sponsor rows: ${rows.length}`);
  console.log(`Target rows: ${targets.length}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no DB update)' : 'LIVE UPDATE'}`);
  console.log(`Force mode: ${FORCE ? 'ON' : 'OFF (skip rows where size already set)'}`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of targets) {
    try {
      const bytes = await fetchSizeBytes(row.photo_url);
      if (!bytes) {
        skipped += 1;
        console.log(`SKIPPED ${row.id} -> Could not determine file size`);
        continue;
      }

      const sizeKb = toKb(bytes);
      if (!DRY_RUN) await updateSize(row.id, sizeKb);
      updated += 1;
      console.log(`UPDATED ${row.id} -> ${sizeKb} KB`);
    } catch (error) {
      failed += 1;
      console.error(`FAILED ${row.id}: ${error.message || error}`);
    }
  }

  console.log('--- Sponsors size backfill summary ---');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
