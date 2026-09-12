export interface MediaItem { id: string; name: string; originalName?: string; size: number; type: string; added: number; duration: number; position: number; favorite: boolean; lastPlayed: number; thumbnail?: string; thumbnailVersion?: number; blob?: Blob; native?: boolean; sessionUrl?: string }

// Media bytes are stored once. Library reads and progress updates only touch metadata.
const storedBlobs = new Set<string>();
const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('videe-library', 2);
  request.onupgradeneeded = () => {
    const db = request.result;
    const videos = db.objectStoreNames.contains('videos')
      ? request.transaction!.objectStore('videos')
      : db.createObjectStore('videos', { keyPath: 'id' });
    const media = db.createObjectStore('media', { keyPath: 'id' });
    const cursorRequest = videos.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      const { blob, sessionUrl, ...metadata } = cursor.value as MediaItem;
      if (blob) media.put({ id: metadata.id, blob });
      cursor.update(metadata);
      cursor.continue();
    };
  };
  request.onsuccess = () => {
    const db = request.result;
    db.onversionchange = () => db.close();
    resolve(db);
  };
  request.onerror = () => reject(request.error);
});
function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Storage transaction aborted'));
  });
}
export async function readLibrary(): Promise<MediaItem[]> {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const request = db.transaction('videos').objectStore('videos').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readMediaBlob(id: string): Promise<Blob | undefined> {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const request = db.transaction('media').objectStore('media').get(id);
    request.onsuccess = () => resolve(request.result?.blob);
    request.onerror = () => reject(request.error);
  });
}
export async function saveItem(item: MediaItem): Promise<void> {
  const db = await dbPromise;
  const { blob, sessionUrl, ...metadata } = item;
  const writeBlob = !!blob && !storedBlobs.has(item.id);
  const transaction = db.transaction(writeBlob ? ['videos', 'media'] : ['videos'], 'readwrite');
  const done = completed(transaction);
  transaction.objectStore('videos').put(metadata);
  if (writeBlob) transaction.objectStore('media').put({ id: item.id, blob });
  await done;
  if (writeBlob) storedBlobs.add(item.id);
}
export async function removeItem(id: string): Promise<void> {
  const db = await dbPromise;
  const transaction = db.transaction(['videos', 'media'], 'readwrite');
  const done = completed(transaction);
  transaction.objectStore('videos').delete(id);
  transaction.objectStore('media').delete(id);
  await done;
  storedBlobs.delete(id);
}

// Commit a rename batch atomically without rewriting video bytes.
export async function renameItems(names: Map<string,string>): Promise<void> {
  const db=await dbPromise; const transaction=db.transaction('videos','readwrite');const done=completed(transaction);const store=transaction.objectStore('videos');
  for(const [id,name] of names){const request=store.get(id);request.onsuccess=()=>{if(request.result)store.put({...request.result,originalName:request.result.originalName||request.result.name,name});};}
  await done;
}
