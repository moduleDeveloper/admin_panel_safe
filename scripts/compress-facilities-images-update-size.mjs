#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const TABLE = 'facilities';
const PAGE_SIZE = 50;
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

const TARGET_MIN_BYTES = 20 * 1024;
const TARGET_MAX_BYTES = 25 * 1024;
const TARGET_MID_BYTES = (TARGET_MIN_BYTES + TARGET_MAX_BYTES) / 2;
const WIDTH_STEPS = [1600, 1200, 1000, 900, 800, 700, 600, 500, 450, 400, 350, 300, 250, 225, 200, 180, 160, 140, 120, 100];
const FACILITIES_BUCKET = String(process.env.VITE_FACILITIES_BUCKET || 'facilities').trim() || 'facilities';
const LEGACY_BUCKETS = new Set(['facilities', 'facility', 'facilites']);

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

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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

function normalizeBaseUrl(url) {
  return asText(url).replace(/\/+$/, '');
}

function isLikelyUrl(value) {
  return /^https?:\/\//i.test(asText(value));
}

function isLikelyImageUrl(value) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(asText(value));
}

function parseContentLength(value) {
  const parsed = Number.parseInt(asText(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseStorageUrl(rawUrl, expectedBaseUrl) {
  const target = asText(rawUrl);
  if (!isLikelyUrl(target)) return null;

  const normalizedBase = normalizeBaseUrl(expectedBaseUrl);
  if (!target.startsWith(normalizedBase)) return null;

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return null;
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  const objectIndex = parts.findIndex((part, idx) =>
    part === 'object' &&
    parts[idx - 2] === 'storage' &&
    parts[idx - 1] === 'v1'
  );

  if (objectIndex < 0) return null;

  const mode = asText(parts[objectIndex + 1]);
  const bucket = asText(parts[objectIndex + 2]);
  const objectPath = decodeURIComponent(parts.slice(objectIndex + 3).join('/'));
  if (!bucket || !objectPath) return null;

  const normalizedBucket = bucket !== FACILITIES_BUCKET && LEGACY_BUCKETS.has(bucket)
    ? FACILITIES_BUCKET
    : bucket;

  if (mode !== 'public' && mode !== 'sign') return null;
  return { bucket: normalizedBucket, objectPath };
}

function buildPublicObjectUrl(baseUrl, bucket, objectPath) {
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  return `${normalizeBaseUrl(baseUrl)}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}

async function fetchSizeBytes(url) {
  const target = asText(url);
  if (!isLikelyUrl(target)) return null;

  try {
    const head = await fetch(target, { method: 'HEAD' });
    if (head.ok) {
      const fromHead = parseContentLength(head.headers.get('content-length'));
      if (fromHead) return fromHead;
    }
  } catch {
    // continue with GET fallback
  }

  try {
    const response = await fetch(target, { method: 'GET' });
    if (!response.ok) return null;
    const fromHeader = parseContentLength(response.headers.get('content-length'));
    if (fromHeader) return fromHeader;
    const buffer = await response.arrayBuffer();
    return buffer.byteLength > 0 ? buffer.byteLength : null;
  } catch {
    return null;
  }
}

function rankCandidate(bytes) {
  const distance = Math.abs(bytes - TARGET_MID_BYTES);
  const penalty = bytes >= TARGET_MIN_BYTES && bytes <= TARGET_MAX_BYTES ? 0 : 1_000_000;
  return penalty + distance;
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
    const text = await response.text().catch(() => '');
    throw new Error(`Transform failed (${response.status}): ${text.slice(0, 180)}`);
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

  if (highCandidate.bytes < TARGET_MIN_BYTES) return { best, canStillHitRange: false };
  if (lowCandidate.bytes > TARGET_MAX_BYTES) return { best, canStillHitRange: true };

  let lo = 30;
  let hi = 100;
  for (let i = 0; i < 7; i += 1) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = await fetchTransformedBinary(baseUrl, bucket, objectPath, mid, width);
    if (rankCandidate(candidate.bytes) < rankCandidate(best.bytes)) best = candidate;
    if (candidate.bytes >= TARGET_MIN_BYTES && candidate.bytes <= TARGET_MAX_BYTES) {
      return { best: candidate, canStillHitRange: true };
    }
    if (candidate.bytes > TARGET_MAX_BYTES) hi = mid - 1;
    else lo = mid + 1;
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
      .select('id,attachments,size')
      .range(from, to);

    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function shouldProcessRow(row) {
  const attachments = Array.isArray(row?.attachments) ? row.attachments : [];
  const hasImage = attachments.some((value) => isLikelyUrl(value) && isLikelyImageUrl(value));
  if (!hasImage) return false;

  if (FORCE) return true;
  if (row?.size === null || row?.size === undefined || row?.size === '') return true;
  const size = Number(row.size);
  return !Number.isFinite(size) || size > 25;
}

async function uploadCompressed(bucket, objectPath, contentType, buffer) {
  const { error } = await supabase.storage.from(bucket).upload(objectPath, buffer, {
    upsert: true,
    cacheControl: '3600',
    contentType,
  });
  if (error) throw error;
}

async function updateFacilitySize(rowId, sizeKb) {
  const { error } = await supabase
    .from(TABLE)
    .update({ size: sizeKb })
    .eq('id', rowId);
  if (error) throw error;
}

async function run() {
  const rows = await fetchAllRows();
  const targets = rows.filter(shouldProcessRow);

  console.log(`Total facilities rows: ${rows.length}`);
  console.log(`Target rows: ${targets.length}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no upload/update)' : 'LIVE UPDATE'}`);
  console.log(`Force mode: ${FORCE ? 'ON' : 'OFF (skip rows with size <= 25 KB)'}`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of targets) {
    try {
      const attachments = Array.isArray(row.attachments) ? row.attachments : [];
      const imageAttachments = attachments
        .map((rawUrl) => ({ rawUrl: asText(rawUrl), parsed: parseStorageUrl(rawUrl, SUPABASE_URL) }))
        .filter((item) => item.parsed && isLikelyImageUrl(item.rawUrl));

      if (!imageAttachments.length) {
        skipped += 1;
        console.log(`SKIPPED ${row.id} -> No supported image attachments`);
        continue;
      }

      let maxImageBytesAfter = 0;

      for (const item of imageAttachments) {
        const { bucket, objectPath } = item.parsed;
        const publicUrl = buildPublicObjectUrl(SUPABASE_URL, bucket, objectPath);
        let currentBytes = await fetchSizeBytes(publicUrl);
        if (!currentBytes) continue;

        if (FORCE || currentBytes > TARGET_MAX_BYTES) {
          const compressed = await getBestCompressedVariant(SUPABASE_URL, bucket, objectPath);
          if (!compressed) continue;

          if (!DRY_RUN) {
            await uploadCompressed(bucket, objectPath, compressed.contentType, compressed.buffer);
          }

          currentBytes = compressed.bytes;
        }

        if (currentBytes > maxImageBytesAfter) {
          maxImageBytesAfter = currentBytes;
        }
      }

      if (!maxImageBytesAfter) {
        skipped += 1;
        console.log(`SKIPPED ${row.id} -> Could not determine image size`);
        continue;
      }

      const sizeKb = toKb(maxImageBytesAfter);
      if (!DRY_RUN) {
        await updateFacilitySize(row.id, sizeKb);
      }

      updated += 1;
      const range = maxImageBytesAfter >= TARGET_MIN_BYTES && maxImageBytesAfter <= TARGET_MAX_BYTES ? 'OK' : 'NEAREST';
      console.log(`UPDATED ${row.id} -> ${sizeKb} KB (${range})`);
    } catch (error) {
      failed += 1;
      console.error(`FAILED ${row.id}: ${error.message || error}`);
    }
  }

  console.log('--- Facilities compression summary ---');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
