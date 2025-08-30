// Minimal chrome.storage shim for running side panel code on the web.
// Uses localStorage under the hood and best-effort onChanged events.

const __listeners = new Set();
const AREA = 'local';
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
// In-memory store for large payloads (e.g., base64 images)
const __mem = Object.create(null);
// Threshold: if JSON string exceeds this length, keep in memory only
const LARGE_JSON_LEN = 1_500_000; // ~1.5 MB of text

function readKey(k) {
  if (Object.prototype.hasOwnProperty.call(__mem, k)) return __mem[k];
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function writeKey(k, v) {
  if (v === undefined) {
    delete __mem[k];
    try { localStorage.removeItem(k); } catch { /* ignore */ }
    return;
  }
  // Prefer localStorage for small items; keep large JSON in memory
  try {
    const s = JSON.stringify(v);
    if (s.length > LARGE_JSON_LEN) {
      __mem[k] = v;
      // Best-effort: store a small marker to indicate presence
      try { localStorage.setItem(k, JSON.stringify({ __mem__: true })); } catch { /* ignore */ }
    } else {
      try { localStorage.setItem(k, s); } catch {
        // Fallback to memory if quota exceeded
        __mem[k] = v;
      }
    }
  } catch {
    // Non-serializable: keep in memory
    __mem[k] = v;
  }
}

function notify(changes) {
  for (const fn of __listeners) {
    try { fn(changes, AREA); } catch { /* ignore */ }
  }
}

async function getImpl(keys) {
  // Behavior compatible with chrome.storage: accepts string | array | object | null
  if (keys == null) {
    // Return everything — not needed by our code; keep minimal
    const out = {};
    // Merge mem and localStorage keys
    for (const k of Object.keys(__mem)) out[k] = __mem[k];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || Object.prototype.hasOwnProperty.call(out, k)) continue;
      out[k] = readKey(k);
    }
    return out;
  }
  if (typeof keys === 'string') {
    return { [keys]: readKey(keys) };
  }
  if (Array.isArray(keys)) {
    const out = {};
    for (const k of keys) out[k] = readKey(k);
    return out;
  }
  if (isObject(keys)) {
    const out = {};
    for (const k of Object.keys(keys)) {
      const v = readKey(k);
      out[k] = v === undefined ? keys[k] : v;
    }
    return out;
  }
  return {};
}

async function setImpl(items) {
  if (!isObject(items)) return;
  const changes = {};
  for (const [k, v] of Object.entries(items)) {
    const oldValue = readKey(k);
    writeKey(k, v);
    changes[k] = { oldValue, newValue: v };
  }
  if (Object.keys(changes).length) notify(changes);
}

async function removeImpl(keys) {
  const arr = Array.isArray(keys) ? keys : [keys];
  const changes = {};
  for (const k of arr) {
    const oldValue = readKey(k);
    if (oldValue !== undefined) {
      localStorage.removeItem(k);
      changes[k] = { oldValue, newValue: undefined };
    }
  }
  if (Object.keys(changes).length) notify(changes);
}

// Expose a chrome-like API if not present
if (typeof window.chrome === 'undefined') {
  window.chrome = {};
}
if (!window.chrome.storage) {
  window.chrome.storage = {};
}
if (!window.chrome.storage.local) {
  window.chrome.storage.local = {
    get: (keys) => getImpl(keys),
    set: (items) => setImpl(items),
    remove: (keys) => removeImpl(keys)
  };
}
if (!window.chrome.storage.onChanged) {
  window.chrome.storage.onChanged = {
    addListener(fn) { __listeners.add(fn); },
    removeListener(fn) { __listeners.delete(fn); }
  };
}

// Note: background/context menus are not supported on the web version.
