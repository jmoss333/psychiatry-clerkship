import { createHash } from 'node:crypto';

import { operationalError } from './sp-http.mjs';

const PACK_UNAVAILABLE = Object.freeze({
  status: 502,
  code: 'pack_unavailable',
  message: 'The reviewed case pack is unavailable.',
});

const PACK_INVALID = Object.freeze({
  status: 502,
  code: 'pack_invalid',
  message: 'The reviewed case pack is invalid.',
});

function packError(contract) {
  return operationalError(contract.status, contract.code, contract.message);
}

export function createPackLoader({
  url,
  token,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  ttlMs = 300_000,
}) {
  if (
    typeof url !== 'string'
    || !url
    || typeof fetchImpl !== 'function'
    || typeof now !== 'function'
    || !Number.isFinite(ttlMs)
    || ttlMs < 0
  ) {
    throw operationalError(500, 'invalid_configuration', 'The pack loader is not configured.');
  }

  let cached = null;

  async function load() {
    const fetchedAt = now();
    if (
      cached
      && Number.isFinite(fetchedAt)
      && fetchedAt >= cached.fetchedAt
      && fetchedAt - cached.fetchedAt < ttlMs
    ) {
      return cached;
    }

    const headers = { 'User-Agent': 'sp-proxy' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      headers.Accept = 'application/vnd.github.raw';
    }

    let response;
    let rawBytes;
    try {
      response = await fetchImpl(url, { headers });
      if (!response?.ok) throw new Error('pack response was not successful');
      rawBytes = Buffer.from(await response.arrayBuffer());
    } catch {
      throw packError(PACK_UNAVAILABLE);
    }

    const packHash = createHash('sha256').update(rawBytes).digest('hex');
    let pack;
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(rawBytes);
      pack = JSON.parse(text);
      if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error('invalid pack');
    } catch {
      throw packError(PACK_INVALID);
    }

    cached = { pack, packHash, fetchedAt };
    return cached;
  }

  return { load };
}
