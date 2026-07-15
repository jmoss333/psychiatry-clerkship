import { createHash, timingSafeEqual } from 'node:crypto';

const UNAUTHORIZED = Object.freeze({
  status: 401,
  code: 'unauthorized',
  message: 'Unauthorized.',
});

const ORIGIN_NOT_ALLOWED = Object.freeze({
  status: 403,
  code: 'origin_not_allowed',
  message: 'This origin is not allowed.',
});

export class OperationalError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'OperationalError';
    this.status = status;
    this.code = code;
  }
}

export function operationalError(status, code, message) {
  return new OperationalError(status, code, message);
}

function configurationError(message) {
  return operationalError(500, 'invalid_configuration', message);
}

function digest(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest();
}

function secureEqual(left, right) {
  return timingSafeEqual(digest(left), digest(right));
}

function normalizeOrigins(allowedOrigins) {
  const values = Array.isArray(allowedOrigins)
    ? allowedOrigins
    : typeof allowedOrigins === 'string'
      ? allowedOrigins.split(',')
      : [];
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function isLocalOrigin(origin) {
  try {
    const hostname = new URL(origin).hostname
      .replace(/^\[|\]$/g, '')
      .replace(/\.$/, '')
      .toLowerCase();
    return hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname === '0.0.0.0'
      || /^127(?:\.|$)/.test(hostname)
      || hostname === '::1'
      || /^::ffff:7f[0-9a-f]{2}(?::|$)/.test(hostname);
  } catch {
    return false;
  }
}

function isHttpOrigin(origin) {
  if (origin === 'null') return false;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.origin === origin
      && url.username === ''
      && url.password === '';
  } catch {
    return false;
  }
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-student-key',
    Vary: 'Origin',
  };
}

function asOperationalError(error) {
  if (error instanceof OperationalError) return error;
  return operationalError(500, 'internal_error', 'Internal server error.');
}

export function readEnv(name) {
  if (typeof globalThis.Netlify?.env?.get === 'function') {
    return globalThis.Netlify.env.get(name);
  }
  return process.env[name];
}

export function createHttp({
  studentKey,
  operationsKey,
  allowedOrigins,
  production,
}) {
  if (
    typeof studentKey !== 'string'
    || studentKey.length === 0
    || typeof operationsKey !== 'string'
    || operationsKey.length === 0
    || secureEqual(studentKey, operationsKey)
  ) {
    throw configurationError('Student and operations credentials must be present and distinct.');
  }
  if (typeof production !== 'boolean') {
    throw configurationError('Production mode must be explicitly configured.');
  }

  const origins = normalizeOrigins(allowedOrigins);
  if (production && (origins.length === 0 || origins.includes('*'))) {
    throw configurationError('Production CORS origins must be explicit.');
  }
  if (production && origins.some(isLocalOrigin)) {
    throw configurationError('Production CORS origins cannot be local.');
  }
  if (production && origins.some((origin) => !isHttpOrigin(origin))) {
    throw configurationError('Production CORS origins must be valid HTTP(S) origins.');
  }
  if (!production && origins.length === 0) origins.push('*');
  const originSet = new Set(origins);

  function requireOrigin(request) {
    const origin = request?.headers?.get?.('origin') ?? '';
    if (!origin || (!originSet.has('*') && !originSet.has(origin))) {
      throw operationalError(
        ORIGIN_NOT_ALLOWED.status,
        ORIGIN_NOT_ALLOWED.code,
        ORIGIN_NOT_ALLOWED.message,
      );
    }
    return origin;
  }

  function requireCredential(request, header, configured) {
    const supplied = request?.headers?.get?.(header) ?? '';
    if (!secureEqual(supplied, configured)) {
      throw operationalError(UNAUTHORIZED.status, UNAUTHORIZED.code, UNAUTHORIZED.message);
    }
  }

  function json(body, { status = 200, origin = null } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (origin !== null) {
      if (!originSet.has('*') && !originSet.has(origin)) {
        throw operationalError(
          ORIGIN_NOT_ALLOWED.status,
          ORIGIN_NOT_ALLOWED.code,
          ORIGIN_NOT_ALLOWED.message,
        );
      }
      Object.assign(headers, corsHeaders(origin));
    }
    return new Response(JSON.stringify(body), { status, headers });
  }

  function error(err, { origin = null } = {}) {
    const normalized = asOperationalError(err);
    return json(
      { error: { code: normalized.code, message: normalized.message } },
      { status: normalized.status, origin },
    );
  }

  function preflight(request) {
    try {
      const origin = requireOrigin(request);
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    } catch (err) {
      return error(err, { origin: null });
    }
  }

  function requireStudent(request) {
    const origin = requireOrigin(request);
    requireCredential(request, 'x-student-key', studentKey);
    return { origin };
  }

  function requireOperations(request) {
    requireCredential(request, 'x-operations-key', operationsKey);
    return { origin: null };
  }

  return {
    preflight,
    requireStudent,
    requireOperations,
    json,
    error,
  };
}
