// In-memory Blobs contract: snapshots have ETags; conditional writes are atomic.
export function fakeStore() {
  const data = new Map();
  const etags = new Map();
  let version = 0;
  return {
    data,
    async get(key) { return data.has(key) ? JSON.parse(data.get(key)) : null; },
    async getWithMetadata(key) {
      return data.has(key)
        ? { data: JSON.parse(data.get(key)), etag: etags.get(key), metadata: {} } : null;
    },
    async setJSON(key, value, options = {}) {
      if ((options.onlyIfNew && data.has(key)) ||
          (options.onlyIfMatch && options.onlyIfMatch !== etags.get(key))) {
        return { modified: false };
      }
      const etag = String(++version);
      data.set(key, JSON.stringify(value));
      etags.set(key, etag);
      return { modified: true, etag };
    },
    async list() { return { blobs: [...data.keys()].map((key) => ({ key })) }; },
  };
}
