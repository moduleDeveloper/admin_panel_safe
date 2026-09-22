#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const TABLE = 'member_profiles';
const PAGE_SIZE = 50;
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

const TARGET_MIN_BYTES = 20 * 1024;
const TARGET_MAX_BYTES = 25 * 1024;
const TARGET_MID_BYTES = (TARGET_MIN_BYTES + TARGET_MAX_BYTES) / 2;
const WIDTH_STEPS = [1600, 1200, 1000, 900, 800, 700, 600, 500, 450, 400, 350, 300, 250, 225, 200, 180, 160, 140, 120, 100];

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

function isLikelyUrl(text) {
  return /^https?:\/\//i.test(asText(text));
}

function normalizeBaseUrl(url) {
  return asText(url).replace(/\/+$/, '');
}

function parseStoragePublicUrl(url, expectedBaseUrl) {
  const target = asText(url);
  if (!isLikelyUrl(target)) return null;

  const normalizedBase = normalizeBaseUrl(expectedBaseUrl);
  const prefix = `${normalizedBase}/storage/v1/object/public/`;
  if (!target.startsWith(prefix)) return null;

  const suffix = target.slice(prefix.length);
  const slash = suffix.indexOf('/');
  if (slash <= 0) return null;

  const bucket = decodeURIComponent(suffix.slice(0, slash));
  const objectPath = decodeURIComponent(suffix.slice(slash + 1));
  if (!bucket || !objectPath) return null;

  return { bucket, objectPath };
}

function rankCandidate(bytes) {
  const distanceFromMid = Math.abs(bytes - TARGET_MID_BYTES);
  const rangePenalty = bytes >= TARGET_MIN_BYTES && bytes <= TARGET_MAX_BYTES ? 0 : 1_000_000;
  return rangePenalty + distanceFromMid;
}

async function fetchTransformedBinary(baseUrl, bucket, objectPath, quality, width) {
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  const query = new URLSearchParams({
    format: 'webp',
    quality: String(quality),
    width: String(width),
  });

  const url = `${normalizeBaseUrl(baseUrl)}/storage/v1/render/image/public/${encodeURIComponent(bucket)}/${encodedPath}?${query.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Transform failed (${response.status}): ${body.slice(0, 180)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = arrayBuffer.byteLength;
  if (!bytes) throw new Error('Transform returned empty image');

  return {
    quality,
    width,
    bytes,
    contentType: response.headers.get('content-type') || 'image/webp',
    buffer: Buffer.from(arrayBuffer),
  };
}

async function findByQualityBinarySearch(baseUrl, bucket, objectPath, width) {
  const lowCandidate = await fetchTransformedBinary(baseUrl, bucket, objectPath, 30, width);
  const highCandidate = await fetchTransformedBinary(baseUrl, bucket, objectPath, 100, width);

  let best = rankCandidate(lowCandidate.bytes) < rankCandidate(highCandidate.bytes) ? lowCandidate : highCandidate;

  if (highCandidate.bytes < TARGET_MIN_BYTES) {
    return { best, canStillHitRange: false };
  }

  if (lowCandidate.bytes > TARGET_MAX_BYTES) {
    return { best, canStillHitRange: true };
  }

  let lo = 30;
  let hi = 100;
  for (let i = 0; i < 7; i += 1) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = await fetchTransformedBinary(baseUrl, bucket, objectPath, mid, width);
    if (rankCandidate(candidate.bytes) < rankCandidate(best.bytes)) best = candidate;
    if (candidate.bytes >= TARGET_MIN_BYTES && candidate.bytes <= TARGET_MAX_BYTES) {
      return { best: candidate, canStillHitRange: true };
    }
    if (candidate.bytes > TARGET_MAX_BYTES) {
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  return { best, canStillHitRange: true };
}

async function getBestCompressedVariant(baseUrl, bucket, objectPath) {
  let best = null;

  for (const width of WIDTH_STEPS) {
    let result;
    try {
      result = await findByQualityBinarySearch(baseUrl, bucket, objectPath, width);
    } catch {
      continue;
    }

    if (!result?.best) continue;
    if (!best || rankCandidate(result.best.bytes) < rankCandidate(best.bytes)) {
      best = result.best;
    }

    if (result.best.bytes >= TARGET_MIN_BYTES && result.best.bytes <= TARGET_MAX_BYTES) {
      return result.best;
    }

    if (result.canStillHitRange === false) {
      return result.best;
    }
  }

  return best;
}

loadDotEnvFile();

const SUPABASE_URL = requiredEnv('VITE_SUPABASE_URL', 'SUPABASE_URL');
const supabase = createClient(
  SUPABASE_URL,
  requiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_ANON_KEY')
);

async function fetchAllRows() {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(TABLE)
      .select('id,profile_photo_url,size')
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

async function uploadCompressed(bucket, objectPath, contentType, buffer) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(objectPath, buffer, {
      upsert: true,
      contentType,
      cacheControl: '3600',
    });

  if (error) throw error;
}

function shouldProcessRow(row) {
  if (!isLikelyUrl(row.profile_photo_url)) return false;
  if (FORCE) return true;
  const existing = Number(row.size);
  return !Number.isFinite(existing) || existing < 20 || existing > 25;
}

async function run() {
  const rows = await fetchAllRows();
  const targets = rows.filter(shouldProcessRow);

  console.log(`Total member profile rows: ${rows.length}`);
  console.log(`Target rows: ${targets.length}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no upload/update)' : 'LIVE UPDATE'}`);
  console.log(`Force mode: ${FORCE ? 'ON' : 'OFF (skip rows already in 20-25 KB range)'}`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of targets) {
    try {
      const parsed = parseStoragePublicUrl(row.profile_photo_url, SUPABASE_URL);
      if (!parsed) {
        skipped += 1;
        console.log(`SKIPPED ${row.id} -> Unsupported profile_photo_url`);
        continue;
      }

      const compressed = await getBestCompressedVariant(SUPABASE_URL, parsed.bucket, parsed.objectPath);
      if (!compressed) {
        skipped += 1;
        console.log(`SKIPPED ${row.id} -> Could not compress image`);
        continue;
      }

      const sizeKb = toKb(compressed.bytes);
      const inRange = compressed.bytes >= TARGET_MIN_BYTES && compressed.bytes <= TARGET_MAX_BYTES;

      if (!DRY_RUN) {
        await uploadCompressed(parsed.bucket, parsed.objectPath, compressed.contentType, compressed.buffer);
        await updateSize(row.id, sizeKb);
      }

      updated += 1;
      console.log(`UPDATED ${row.id} -> ${sizeKb} KB (q=${compressed.quality}, w=${compressed.width}, range=${inRange ? 'OK' : 'NEAREST'})`);
    } catch (error) {
      failed += 1;
      console.error(`FAILED ${row.id}: ${error.message || error}`);
    }
  }

  console.log('--- Member profile compression summary ---');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});