export function countWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

export function estimateDurationSec(wordCount) {
  const wordsPerSecond = 2.2;
  return Math.min(30, Math.max(8, Math.round(Number(wordCount || 0) / wordsPerSecond)));
}

export function badRequest(res, message) {
  return res.status(400).json({ error: message });
}
