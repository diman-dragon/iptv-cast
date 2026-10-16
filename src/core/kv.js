// Крупные данные (тексты плейлистов) — в IndexedDB: в localStorage им тесно (около 5 МБ).
const DB = 'iptvcast';
const STORE = 'kv';

let opening = null;

function open() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

async function run(mode, fn) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined; // нет IndexedDB — работаем без кэша
  }
}

export const kvGet = (key) => run('readonly', (s) => s.get(key));
export const kvSet = (key, value) => run('readwrite', (s) => s.put(value, key));
export const kvDel = (key) => run('readwrite', (s) => s.delete(key));
export const kvClear = () => run('readwrite', (s) => s.clear());
