/**
 * IndexedDB wrapper for scene-builder persistence.
 *
 * Provides a minimal async API over IndexedDB. One shared connection
 * is reused for all operations (singleton pattern).
 */

const DB_NAME = "sajou-scene-builder";
const DB_VERSION = 1;

/** Object stores — one per persistent state domain. */
const STORES = [
  "scene",
  "entities",
  "choreographies",
  "wires",
  "bindings",
  "timeline",
  "assets",
] as const;

export type StoreName = (typeof STORES)[number];

// ---------------------------------------------------------------------------
// Connection singleton
// ---------------------------------------------------------------------------

let dbInstance: IDBDatabase | null = null;

/** Open (or return) the single shared IndexedDB connection. */
export function openDb(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      }
    };

    req.onsuccess = () => {
      dbInstance = req.result;

      // Reset singleton on unexpected close so next call reopens.
      dbInstance.onclose = () => {
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    req.onerror = () => {
      reject(req.error);
    };
  });
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

/** Write a single value into a store under the given key. */
export async function dbPut(store: StoreName, key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Read a single value from a store by key. Returns undefined if missing. */
export async function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Read all values from a store. */
export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

/** Read all keys from a store. */
export async function dbGetAllKeys(store: StoreName): Promise<IDBValidKey[]> {
  const db = await openDb();
  return new Promise<IDBValidKey[]>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Clear all entries from a store. */
export async function dbClear(store: StoreName): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Clear all stores (used by "New Scene"). */
export async function dbClearAll(): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([...STORES], "readwrite");
    for (const name of STORES) {
      tx.objectStore(name).clear();
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
