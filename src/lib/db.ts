import type { Project } from '../types';

const DB_NAME = 'dovetail-patch-bench';
const STORE = 'projects';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(project: Project): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...project, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }).finally(() => db.close());
}

export async function loadProject(id: string): Promise<Project | null> {
  const db = await openDb();
  try {
    return await new Promise<Project | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => resolve((request.result as Project | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function listProjects(): Promise<Project[]> {
  const db = await openDb();
  try {
    return await new Promise<Project[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result as Project[]) ?? []);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
