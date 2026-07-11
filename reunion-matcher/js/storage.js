/* IndexedDB opslag voor klasgenoten.
   Elk record: { id, name, thumb (dataURL), descriptor (Array<128 number>), createdAt } */
const Store = (() => {
  const DB_NAME = 'reunion76';
  const STORE = 'people';
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function tx(mode) {
    return open().then(db => db.transaction(STORE, mode).objectStore(STORE));
  }

  return {
    async all() {
      const os = await tx('readonly');
      return new Promise((res, rej) => {
        const r = os.getAll();
        r.onsuccess = () => res(r.result || []);
        r.onerror = () => rej(r.error);
      });
    },
    async add(person) {
      const os = await tx('readwrite');
      return new Promise((res, rej) => {
        const r = os.add({ ...person, createdAt: Date.now() });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    async addMany(people) {
      const os = await tx('readwrite');
      return new Promise((res, rej) => {
        let n = 0;
        os.transaction.oncomplete = () => res(n);
        os.transaction.onerror = () => rej(os.transaction.error);
        for (const p of people) { os.add({ ...p, createdAt: Date.now() }); n++; }
      });
    },
    async remove(id) {
      const os = await tx('readwrite');
      return new Promise((res, rej) => {
        const r = os.delete(id);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      });
    },
    async clear() {
      const os = await tx('readwrite');
      return new Promise((res, rej) => {
        const r = os.clear();
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      });
    },
    async count() {
      const os = await tx('readonly');
      return new Promise((res, rej) => {
        const r = os.count();
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
  };
})();
