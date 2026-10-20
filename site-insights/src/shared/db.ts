import type { Visit } from './types';

const DB_NAME = 'site-insights';
const STORE = 'visits';

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('startedAt', 'startedAt');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function putVisits(visits: Visit[]): Promise<void> {
  if (!visits.length) return;
  const tx = (await open()).transaction(STORE, 'readwrite');
  for (const v of visits) tx.objectStore(STORE).put(v);
  await done(tx);
}

export async function getVisitsSince(since: number): Promise<Visit[]> {
  const tx = (await open()).transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).index('startedAt').getAll(IDBKeyRange.lowerBound(since));
  await done(tx);
  return req.result as Visit[];
}

export async function deleteVisitsBefore(before: number): Promise<void> {
  const tx = (await open()).transaction(STORE, 'readwrite');
  tx.objectStore(STORE).index('startedAt').openCursor(IDBKeyRange.upperBound(before)).onsuccess = (e) => {
    const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
    if (cur) {
      cur.delete();
      cur.continue();
    }
  };
  await done(tx);
}

export async function clearVisits(): Promise<void> {
  const tx = (await open()).transaction(STORE, 'readwrite');
  tx.objectStore(STORE).clear();
  await done(tx);
}
