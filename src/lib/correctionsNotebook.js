const KEY = 'nativa-corrections-notebook';
const MAX = 200;
const IDB_NAME = 'nativa-expressions-audio';
const IDB_VERSION = 1;
const IDB_STORE = 'blobs';

function openAudioDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      event.target.result.createObjectStore(IDB_STORE);
    };
  });
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putBlob(key, blob) {
  const db = await openAudioDb();
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(blob, key);
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function getBlob(key) {
  const db = await openAudioDb();
  try {
    const tx = db.transaction(IDB_STORE, 'readonly');
    return idbRequest(tx.objectStore(IDB_STORE).get(key));
  } finally {
    db.close();
  }
}

async function deleteBlob(key) {
  const db = await openAudioDb();
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function loadCorrections() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveCorrection({
  original,
  corrected,
  translation = null,
  narratorId = 'lea',
  originalAudioBlob = null,
  correctedAudioBuffer = null,
}) {
  const id = Date.now();
  const entry = {
    id,
    original: original.trim(),
    corrected: corrected.trim(),
    translation: translation?.trim() || null,
    narratorId: narratorId || 'lea',
    savedAt: new Date().toISOString(),
    hasOriginalAudio: Boolean(originalAudioBlob),
    hasCorrectedAudio: Boolean(correctedAudioBuffer),
  };

  const entries = loadCorrections();
  const dropped = entries.slice(MAX - 1);
  entries.unshift(entry);
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));

  await Promise.all([
    originalAudioBlob ? putBlob(`${id}-original`, originalAudioBlob) : Promise.resolve(),
    correctedAudioBuffer
      ? putBlob(`${id}-corrected`, new Blob([correctedAudioBuffer], { type: 'audio/mpeg' }))
      : Promise.resolve(),
    ...dropped.map((old) => Promise.all([
      deleteBlob(`${old.id}-original`),
      deleteBlob(`${old.id}-corrected`),
    ])),
  ]);

  return entry;
}

export async function loadExpressionAudio(id, kind) {
  const blob = await getBlob(`${id}-${kind}`);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function deleteCorrection(id) {
  const entries = loadCorrections().filter((e) => e.id !== id);
  localStorage.setItem(KEY, JSON.stringify(entries));
  await Promise.all([
    deleteBlob(`${id}-original`),
    deleteBlob(`${id}-corrected`),
  ]);
}
