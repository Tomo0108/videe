export interface MediaItem { id: string; name: string; size: number; type: string; added: number; duration: number; position: number; favorite: boolean; lastPlayed: number; thumbnail?: string; blob?: Blob; native?: boolean; sessionUrl?: string }
const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open('videe-library', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('videos', { keyPath: 'id' });
  req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
});
export async function readLibrary(): Promise<MediaItem[]> { const db = await dbPromise; return new Promise((resolve,reject) => { const req = db.transaction('videos').objectStore('videos').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
export async function saveItem(item: MediaItem) { const db = await dbPromise; return new Promise<void>((resolve,reject) => { const tx = db.transaction('videos','readwrite'); const { sessionUrl, ...record } = item; tx.objectStore('videos').put(record); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
export async function removeItem(id: string) { const db = await dbPromise; return new Promise<void>((resolve,reject) => { const tx = db.transaction('videos','readwrite'); tx.objectStore('videos').delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
