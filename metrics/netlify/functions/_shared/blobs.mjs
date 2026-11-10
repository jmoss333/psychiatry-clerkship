/** A failed SDK write is terminal, not another application-level conflict retry. */
export class CounterWriteError extends Error {
  constructor(status) {
    super(status ? `counter write failed (HTTP ${status})` : 'counter write failed');
    this.name = 'CounterWriteError';
  }
}

/**
 * @netlify/blobs 11.0.2 reports modified:true for conditional HTTP errors other
 * than 412. Validate the final HTTP status AFTER its operation returns instead
 * of throwing into its fetch retry loop (which would retry even 403/404).
 *
 * Each write gets its own SDK client and captured status, so concurrent calls
 * cannot validate one another's response. The SDK retains its normal retry and
 * rate-limit behavior; this does not impose a whole-request timeout.
 */
export function createCounterStore(getStore, name, fetch = globalThis.fetch) {
  const reader = getStore({ name, fetch });
  return {
    getWithMetadata: (...args) => reader.getWithMetadata(...args),
    async setJSON(...args) {
      let status;
      let result;
      try {
        const writer = getStore({ name, fetch: async (input, init) => {
          const response = await fetch(input, init);
          if ((init?.method ?? input?.method ?? 'GET').toUpperCase() === 'PUT') {
            status = response.status;
          }
          return response;
        } });
        result = await writer.setJSON(...args);
      } catch {
        // An uncertain transport outcome must not re-run the whole increment.
        // Do not retain request URLs, headers, payloads or response bodies.
        throw new CounterWriteError(status !== 200 && status !== 412 ? status : undefined);
      }
      if (status !== 200 && status !== 412) throw new CounterWriteError(status);
      return result;
    },
  };
}
