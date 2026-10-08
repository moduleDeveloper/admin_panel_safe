#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TABLE = 'sponsors';
const BUCKET = 'sponsors';
const MAX_FILE_BYTES = 25 * 1024;
const PAGE_SIZE = 50;
const DRY_RUN = process.argv.includes('--dry-run');

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

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(...names) {
  const value = names.map((name) => process.env[name]).find(Boolean);
  if (!value) throw new Error(`Missing env: ${names.join(' or ')}`);
  return value;
}

function asText(v) {
  return String(v || '');
}

function isDataUrl(text) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(text);
}

function isLikelyUrl(text) {
  return /^https?:\/\//i.test(text);
}

function normalizeRawBase64(text = '') {
  const value = asText(text).trim();
  if (!value) return '';
  if (value.startsWith('data:')) return '';
  if (!/^[a-zA-Z0-9+/=\r\n]+$/.test(value)) return '';
  return value.replace(/\s+/g, '');
}

function dataUrlToBuffer(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(asText(dataUrl));
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const b64 = match[2];
  return { buffer: Buffer.from(b64, 'base64'), mime };
}

function rawBase64ToBuffer(text) {
  const normalized = normalizeRawBase64(text);
  if (!normalized || normalized.length < 128) return null;
  try {
    const buffer = Buffer.from(normalized, 'base64');
    if (!buffer?.length) return null;
    return { buffer, mime: null };
  } catch {
    return null;
  }
}

function inferImageTypeFromMagic(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

function mimeToExt(mime = '') {
  const m = asText(mime).toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  return 'jpg';
}

function formatKb(bytes) {
  return Number((Number(bytes || 0) / 1024).toFixed(2));
}

function buildStoragePath(row, ext) {
  const trustId = asText(row.trust_id).replace(/[^a-zA-Z0-9_-]/g, '') || 'misc';
  const idPart = asText(row.id).slice(0, 8) || 'sponsor';
  return `${trustId}/${Date.now()}-${idPart}.${ext}`;
}

async function getSharp() {
  try {
    const mod = await import('sharp');
    return mod.default || mod;
  } catch {
    return null;
  }
}

async function optimizeImageBuffer(buffer, mimeHint) {
  const sharp = await getSharp();
  if (!sharp) {
    const guessed = inferImageTypeFromMagic(buffer);
    const ext = guessed?.ext || mimeToExt(mimeHint);
    const mime = guessed?.mime || mimeHint || 'image/jpeg';
    return { buffer, ext, mime, optimized: false };
  }

  const source = sharp(buffer, { failOnError: false }).rotate();
  const metadata = await source.metadata();
  const width = metadata.width || null;
  const height = metadata.height || null;
  const scales = [1, 0.9, 0.82, 0.74, 0.66, 0.58, 0.5];
  const qualities = [86, 80, 74, 68, 62, 56, 50, 44, 38];

  let best = { buffer, ext: mimeToExt(mimeHint), mime: mimeHint || 'image/jpeg', optimized: false };

  for (const scale of scales) {
    const w = width ? Math.max(160, Math.round(width * scale)) : null;
    const h = height ? Math.max(160, Math.round(height * scale)) : null;

    for (const q of qualities) {
      const base = sharp(buffer, { failOnError: false }).rotate();
      const resized = w && h ? base.resize({ width: w, height: h, fit: 'inside', withoutEnlargement: true }) : base;
      const webpBuffer = await resized.webp({ quality: q, effort: 4 }).toBuffer();

      if (!best || webpBuffer.length < best.buffer.length) {
        best = { buffer: webpBuffer, ext: 'webp', mime: 'image/webp', optimized: true };
      }
      if (webpBuffer.length <= MAX_FILE_BYTES) return best;
    }
  }

  return best;
}

async function fetchUrlToBuffer(url) {
  const target = asText(url);
  if (!isLikelyUrl(target)) return null;
  try {
    const response = await fetch(target);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length) return null;
    const contentType = asText(response.headers.get('content-type')).toLowerCase();
    const mime = contentType.startsWith('image/') ? contentType : null;
    return { buffer, mime };
  } catch {
    return null;
  }
}

function needsMigration(row) {
  const photoUrl = asText(row.photo_url);
  if (!photoUrl) return false;
  if (isDataUrl(photoUrl)) return true;
  if (rawBase64ToBuffer(photoUrl)?.buffer?.length) return true;
  return false;
}

async function decodeSourceBuffer(row) {
  const photoUrl = asText(row.photo_url);
  if (!photoUrl) return null;
  if (isDataUrl(photoUrl)) return dataUrlToBuffer(photoUrl);
  const raw = rawBase64ToBuffer(photoUrl);
  if (raw?.buffer?.length) return raw;
  if (isLikelyUrl(photoUrl) && process.argv.includes('--include-remote-url')) {
    const remote = await fetchUrlToBuffer(photoUrl);
    if (remote?.buffer?.length) return remote;
  }
  return null;
}

loadDotEnvFile();

const supabase = createClient(
  requiredEnv('VITE_SUPABASE_URL', 'SUPABASE_URL'),
  requiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_ANON_KEY')
);

async function ensureBucket() {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;
  const exists = (buckets || []).some((bucket) => bucket.name === BUCKET || bucket.id === BUCKET);
  if (exists) return;
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (error) throw error;
}

async function fetchAllSponsorRows() {
  const rows = [];
  let from = 0;
  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(TABLE)
      .select('id,trust_id,photo_url')
      .range(from, to);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function uploadToBucket(storagePath, buffer, mime) {
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: mime,
    upsert: false,
    cacheControl: '3600',
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data?.publicUrl || null;
}

async function updateSponsorPhoto(rowId, publicUrl, sizeKb) {
  const { error } = await supabase
    .from(TABLE)
    .update({ photo_url: publicUrl, size: sizeKb })
    .eq('id', rowId);
  if (error) throw error;
}

async function migrateRow(row) {
  const decoded = await decodeSourceBuffer(row);
  if (!decoded?.buffer?.length) {
    return { status: 'skipped', reason: 'No decodable base64 image found in photo_url.' };
  }

  const optimized = await optimizeImageBuffer(decoded.buffer, decoded.mime);
  const ext = optimized.ext || mimeToExt(optimized.mime);
  const storagePath = buildStoragePath(row, ext);
  const publicUrl = await uploadToBucket(storagePath, optimized.buffer, optimized.mime || decoded.mime);

  const sizeKb = formatKb(optimized.buffer.length);
  if (!DRY_RUN) await updateSponsorPhoto(row.id, publicUrl, sizeKb);

  return {
    status: 'migrated',
    storagePath,
    publicUrl,
    size: sizeKb,
    optimized: optimized.optimized === true,
  };
}

async function runMigration() {
  await ensureBucket();
  const allRows = await fetchAllSponsorRows();
  const targets = allRows.filter(needsMigration);

  console.log(`Total sponsor rows: ${allRows.length}`);
  console.log(`Needs migration: ${targets.length}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no DB update)' : 'LIVE UPDATE'}`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of targets) {
    try {
      const result = await migrateRow(row);
      if (result.status === 'migrated') {
        migrated += 1;
        console.log(`MIGRATED ${row.id} -> ${result.storagePath} (${result.size} KB)`);
      } else {
        skipped += 1;
        console.log(`SKIPPED ${row.id} -> ${result.reason}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`FAILED ${row.id}: ${error.message || error}`);
    }
  }

  console.log('--- Sponsors migration summary ---');
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

const isMainModule = (() => {
  if (!process.argv[1]) return false;
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(currentFile) === path.resolve(process.argv[1]);
})();

if (isMainModule) {
  runMigration().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
