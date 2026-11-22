/*
  The render cache, shared by the music maker (music.js) and
  the home page demo (music-demo.js). Rendering a loop is the
  expensive part of both pages, and a song's audio is fully
  determined by its parsed notes, so a finished render is
  stored in IndexedDB and read back on later visits instead
  of being rendered again. The demo plays the same Saria's
  Song the maker does, and because both pages derive the key
  the same way from the parsed song, a render stored by
  either page serves both.

  The key is a hash of a canonical listing of the parsed
  song: tempo, loop point, and every note's step, length,
  pitch, instrument and volume, prefixed with
  RENDER_CACHE_VERSION. Any edit changes a note and so
  changes the key, which makes stale reads impossible by
  construction. Bump RENDER_CACHE_VERSION whenever the
  engine, the instrument table, or the sample files change:
  entries written by the old code become unreachable and
  age out through the pruning below.

  Storage is two object stores: "renders" holds the audio
  (per-channel Float32Arrays, sample rate, duration, loop
  start) and "meta" holds a timestamp per key, so pruning
  never has to load the audio itself. At most MAX_ENTRIES
  renders are kept, least recently used first out; a write
  that hits the storage quota drops the oldest half and
  retries once. Every failure mode (no IndexedDB, private
  mode, quota, a blocked database) resolves quietly to a
  miss or a no-op: the cache is an optimisation, and both
  pages fall back to rendering exactly as they did before
  it existed.
*/

export const RENDER_CACHE_VERSION = 7;

const DB_NAME = "music-render-cache";
const MAX_ENTRIES = 16;
let dbPromise = null;

// cyrb53: a small, well-mixed string hash, plenty for telling
// a handful of songs apart.
function hashMaterial(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") +
    (h1 >>> 0).toString(16).padStart(8, "0");
}

// The one key derivation, used by both pages: a canonical
// listing of the parsed song, hashed. Two parses of the same
// song text list identically, which is what lets the maker
// and the demo share entries.
export function renderCacheKey(song) {
  let m = RENDER_CACHE_VERSION + "|t" + song.tempo +
    "|L" + song.loopStep + "|s" + song.steps;
  for (const ch of song.channels) {
    m += "|" + ch.letter + ":";
    for (const n of ch.notes) {
      m += n.step + "," + n.len + "," + n.midi + "," +
        n.inst + "," + n.vol + ";";
    }
  }
  return "v" + RENDER_CACHE_VERSION + "-" + hashMaterial(m);
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!window.indexedDB) { resolve(null); return; }
    let req;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("renders")) {
        db.createObjectStore("renders", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function requestDone(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
  });
}

function makeBuffer(entry) {
  let buffer;
  try {
    buffer = new AudioBuffer({
      length: entry.frames, numberOfChannels: 2, sampleRate: entry.sr,
    });
  } catch {
    buffer = new OfflineAudioContext(1, 1, entry.sr)
      .createBuffer(2, entry.frames, entry.sr);
  }
  for (let ch = 0; ch < 2; ch++) {
    buffer.getChannelData(ch).set(entry.ch[ch]);
  }
  return buffer;
}

// Mark a key as used now, so the pruning keeps the songs
// that actually get played. Fire and forget.
function touchMeta(db, key) {
  try {
    const tx = db.transaction("meta", "readwrite");
    const store = tx.objectStore("meta");
    const got = store.get(key);
    got.onsuccess = () => {
      if (got.result) store.put({ ...got.result, at: Date.now() });
    };
  } catch { /* a failed touch costs nothing */ }
}

// Read a stored render: { buffer, dur, loopStart }, or null
// on any miss or failure. Never rejects.
export async function readRender(key) {
  try {
    const db = await openDb();
    if (!db) return null;
    const entry = await requestDone(
      db.transaction("renders", "readonly").objectStore("renders").get(key));
    if (!entry || entry.v !== RENDER_CACHE_VERSION) return null;
    if (!entry.ch || entry.ch.length !== 2) return null;
    if (entry.ch[0].length !== entry.frames ||
        entry.ch[1].length !== entry.frames) return null;
    const buffer = makeBuffer(entry);
    touchMeta(db, key);
    return { buffer, dur: entry.dur, loopStart: entry.loopStart };
  } catch {
    return null;
  }
}

async function putEntry(db, entry, meta) {
  const tx = db.transaction(["renders", "meta"], "readwrite");
  tx.objectStore("renders").put(entry);
  tx.objectStore("meta").put(meta);
  await txDone(tx);
}

async function allMeta(db) {
  return requestDone(
    db.transaction("meta", "readonly").objectStore("meta").getAll());
}

async function deleteKeys(db, keys) {
  if (!keys.length) return;
  const tx = db.transaction(["renders", "meta"], "readwrite");
  for (const key of keys) {
    tx.objectStore("renders").delete(key);
    tx.objectStore("meta").delete(key);
  }
  await txDone(tx);
}

async function deleteOldest(db, count) {
  const metas = (await allMeta(db)).sort((a, b) => a.at - b.at);
  await deleteKeys(db, metas.slice(0, count).map((m) => m.key));
}

// Keep at most MAX_ENTRIES renders, oldest out first.
async function prune(db) {
  try {
    const metas = (await allMeta(db)).sort((a, b) => b.at - a.at);
    if (metas.length > MAX_ENTRIES) {
      await deleteKeys(db, metas.slice(MAX_ENTRIES).map((m) => m.key));
    }
  } catch { /* pruning is housekeeping; failure is silent */ }
}

// Store a render. Takes the renderer's own result object
// ({ buffer, dur, loopStart }); the channel data is copied
// out, so the caller keeps its buffer untouched. Never
// rejects: a failed write just means the next visit
// renders again.
export async function writeRender(key, rendered) {
  try {
    const db = await openDb();
    if (!db) return;
    const buf = rendered.buffer;
    const entry = {
      key, v: RENDER_CACHE_VERSION,
      sr: buf.sampleRate, frames: buf.length,
      dur: rendered.dur, loopStart: rendered.loopStart,
      ch: [
        new Float32Array(buf.getChannelData(0)),
        new Float32Array(buf.getChannelData(1)),
      ],
    };
    const meta = { key, at: Date.now(), bytes: entry.frames * 8 };
    try {
      await putEntry(db, entry, meta);
    } catch (err) {
      if (!err || err.name !== "QuotaExceededError") throw err;
      await deleteOldest(db, Math.ceil(MAX_ENTRIES / 2));
      await putEntry(db, entry, meta);
    }
    prune(db);
  } catch { /* the cache is an optimisation; silence is the fallback */ }
}
