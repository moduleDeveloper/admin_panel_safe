const responseCache = new Map();
const inflightCache = new Map();
const STORAGE_KEY = 'admin_panel_response_cache_v1';
let storageLoaded = false;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function hasValidEntry(entry) {
  return Boolean(entry) && entry.expiresAt > Date.now();
}

function loadCacheFromStorage() {
  if (storageLoaded || !canUseStorage()) return;
  storageLoaded = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    parsed.forEach(([key, entry]) => {
      if (key && hasValidEntry(entry)) {
        responseCache.set(key, entry);
      }
    });
  } catch {
    // Ignore storage parse failures and continue with in-memory cache only.
  }
}

function persistCacheToStorage() {
  if (!canUseStorage()) return;
  try {
    const serializable = [];
    for (const [key, entry] of responseCache.entries()) {
      if (hasValidEntry(entry)) {
        serializable.push([key, entry]);
      }
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // Ignore quota/storage failures.
  }
}

export async function cachedQuery(key, queryFn, ttlMs = 15000) {
  loadCacheFromStorage();
  if (!key || typeof queryFn !== 'function') {
    return queryFn();
  }

  const cached = responseCache.get(key);
  if (hasValidEntry(cached)) {
    return cached.value;
  }

  if (inflightCache.has(key)) {
    return inflightCache.get(key);
  }

  const promise = (async () => {
    try {
      const result = await queryFn();
      if (!result?.error) {
        responseCache.set(key, {
          value: result,
          expiresAt: Date.now() + Math.max(500, Number(ttlMs) || 15000),
        });
        persistCacheToStorage();
      } else {
        responseCache.delete(key);
        persistCacheToStorage();
      }
      return result;
    } finally {
      inflightCache.delete(key);
    }
  })();

  inflightCache.set(key, promise);
  return promise;
}

export function getCachedQueryValue(key) {
  loadCacheFromStorage();
  if (!key) return null;
  const cached = responseCache.get(String(key));
  if (!hasValidEntry(cached)) return null;
  return cached.value;
}

export function invalidateCache(keyPrefix) {
  loadCacheFromStorage();
  if (!keyPrefix) return;
  const prefix = String(keyPrefix);
  for (const key of responseCache.keys()) {
    if (String(key).startsWith(prefix)) {
      responseCache.delete(key);
    }
  }
  for (const key of inflightCache.keys()) {
    if (String(key).startsWith(prefix)) {
      inflightCache.delete(key);
    }
  }
  persistCacheToStorage();
}

export function invalidateAllCache() {
  responseCache.clear();
  inflightCache.clear();
  if (canUseStorage()) {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore remove failures.
    }
  }
}
