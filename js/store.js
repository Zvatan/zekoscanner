// Belgelerin cihazda kalıcı saklanması (IndexedDB).
//
// docs  : { id, title, createdAt, updatedAt, pageIds[] }
// pages : { id, docId, corners, autoCorners, rotation, filter, srcW, srcH, outW, outH, ... }
// blobs : anahtar "<sayfaId>:src|out|thumb" -> { buf: ArrayBuffer, type }
//
// Büyük görüntüler ayrı depoda durur; liste ekranları yalnız küçük resimleri
// okur. Görüntüler Blob yerine ArrayBuffer olarak saklanır: Safari'nin bazı
// sürümlerinde IndexedDB'den okunan Blob'lar sonradan okunamaz hale gelebiliyor.

const DB_NAME = 'zeko-tara';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('pages')) {
          db.createObjectStore('pages', { keyPath: 'id' }).createIndex('docId', 'docId');
        }
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Veritabanı başka bir sekmede açık'));
    });
  }
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('İşlem iptal edildi'));
  });
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function pack(blob) {
  return { buf: await blob.arrayBuffer(), type: blob.type || 'image/jpeg' };
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export async function listDocs() {
  const db = await open();
  const docs = await request(db.transaction('docs').objectStore('docs').getAll());
  return docs.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDoc(id) {
  const db = await open();
  return request(db.transaction('docs').objectStore('docs').get(id));
}

export async function saveDoc(doc) {
  const db = await open();
  const tx = db.transaction('docs', 'readwrite');
  tx.objectStore('docs').put(doc);
  return done(tx);
}

export async function getPages(ids) {
  const db = await open();
  const store = db.transaction('pages').objectStore('pages');
  const pages = await Promise.all(ids.map((id) => request(store.get(id))));
  return pages.filter(Boolean);
}

export async function getBlob(key) {
  const db = await open();
  const v = await request(db.transaction('blobs').objectStore('blobs').get(key));
  return v ? new Blob([v.buf], { type: v.type }) : null;
}

// Sayfayı (ve görüntülerini) belgeyle birlikte tek işlemde kaydeder.
// blobs: { src?, out?, thumb? } — verilmeyenler değişmez.
export async function savePage(doc, page, blobs = {}) {
  const packed = {};
  for (const [kind, blob] of Object.entries(blobs)) if (blob) packed[kind] = await pack(blob);
  const db = await open();
  const tx = db.transaction(['docs', 'pages', 'blobs'], 'readwrite');
  tx.objectStore('docs').put(doc);
  tx.objectStore('pages').put(page);
  const bs = tx.objectStore('blobs');
  for (const [kind, value] of Object.entries(packed)) bs.put(value, `${page.id}:${kind}`);
  return done(tx);
}

function deletePageRecords(tx, pageId) {
  tx.objectStore('pages').delete(pageId);
  const bs = tx.objectStore('blobs');
  for (const kind of ['src', 'out', 'thumb']) bs.delete(`${pageId}:${kind}`);
}

export async function deletePage(doc, pageId) {
  const db = await open();
  const tx = db.transaction(['docs', 'pages', 'blobs'], 'readwrite');
  doc.pageIds = doc.pageIds.filter((id) => id !== pageId);
  doc.updatedAt = Date.now();
  tx.objectStore('docs').put(doc);
  deletePageRecords(tx, pageId);
  return done(tx);
}

export async function deleteDoc(doc) {
  const db = await open();
  const tx = db.transaction(['docs', 'pages', 'blobs'], 'readwrite');
  tx.objectStore('docs').delete(doc.id);
  for (const id of doc.pageIds) deletePageRecords(tx, id);
  return done(tx);
}

// Tarayıcıdan verileri silmemesini ister (iOS 17+ destekler).
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* desteklenmiyor */
  }
}

export async function usage() {
  try {
    const e = await navigator.storage.estimate();
    return e.usage || 0;
  } catch {
    return null;
  }
}
