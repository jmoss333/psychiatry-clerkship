import assert from 'node:assert/strict';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function createFakeBlobStore({
  onlyIfNewConflicts = 0,
  onlyIfMatchConflicts = 0,
  terminalOnMatchConflict = null,
  mutateOnMatchConflict = null,
  nonStrongReadsReturnNull = false,
  unavailable = false,
} = {}) {
  const records = new Map();
  const calls = [];
  let etagSequence = 0;
  let remainingNewConflicts = onlyIfNewConflicts;
  let remainingMatchConflicts = onlyIfMatchConflicts;
  let matchConflictCount = 0;

  const nextEtag = () => `etag-${++etagSequence}`;

  const store = {
    async getWithMetadata(key, options) {
      calls.push({ method: 'getWithMetadata', key, options: clone(options) });
      if (unavailable) throw new Error('fake store unavailable');
      if (options?.consistency !== 'strong' && nonStrongReadsReturnNull) return null;
      assert.deepEqual(options, { type: 'json', consistency: 'strong' });
      const record = records.get(key);
      if (!record) return null;
      return {
        data: JSON.parse(record.value),
        etag: record.etag,
        metadata: clone(record.metadata),
      };
    },

    async set(key, value, options = {}) {
      assert.equal(typeof value, 'string');
      JSON.parse(value);
      calls.push({
        method: 'set',
        key,
        value,
        options: clone(options),
      });
      if (unavailable) throw new Error('fake store unavailable');

      // Yield once so Promise.all claim tests exercise the conditional-write path.
      await Promise.resolve();
      const current = records.get(key);
      if (options.onlyIfNew && remainingNewConflicts > 0) {
        remainingNewConflicts -= 1;
        return { modified: false };
      }
      if (options.onlyIfNew && current) return { modified: false };

      if (options.onlyIfMatch !== undefined) {
        if (!current || current.etag !== options.onlyIfMatch) return { modified: false };
        if (remainingMatchConflicts > 0) {
          remainingMatchConflicts -= 1;
          matchConflictCount += 1;
          if (typeof mutateOnMatchConflict === 'function') {
            const replacement = mutateOnMatchConflict({
              key,
              current: current ? JSON.parse(current.value) : null,
              attempted: JSON.parse(value),
              matchConflictCount,
            });
            if (replacement !== undefined && current) {
              current.value = JSON.stringify(replacement);
              current.etag = nextEtag();
            }
          }
          if (matchConflictCount === terminalOnMatchConflict) {
            current.value = JSON.stringify({ ...JSON.parse(value), status: 'succeeded' });
            current.etag = nextEtag();
          }
          return { modified: false };
        }
      }

      const etag = nextEtag();
      records.set(key, {
        value,
        metadata: clone(options.metadata ?? null),
        etag,
      });
      return { modified: true, etag };
    },
  };

  return {
    store,
    calls,
    read(key) {
      const record = records.get(key);
      return record ? JSON.parse(record.value) : null;
    },
    etag(key) {
      return records.get(key)?.etag ?? null;
    },
    replace(key, value, { etag = records.get(key)?.etag ?? nextEtag() } = {}) {
      records.set(key, {
        value: JSON.stringify(value),
        metadata: null,
        etag,
      });
    },
  };
}
