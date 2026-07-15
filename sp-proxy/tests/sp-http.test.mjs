import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createHttp,
  readEnv,
} from '../netlify/functions/_shared/sp-http.mjs';

const STUDENT_KEY = 'student-secret';
const OPERATIONS_KEY = 'operations-secret';
const ALLOWED_ORIGIN = 'https://learn.example.test';

function request({ origin = ALLOWED_ORIGIN, studentKey, operationsKey, method = 'GET' } = {}) {
  const headers = new Headers();
  if (origin !== null) headers.set('origin', origin);
  if (studentKey !== undefined) headers.set('x-student-key', studentKey);
  if (operationsKey !== undefined) headers.set('x-operations-key', operationsKey);
  return new Request('https://proxy.example.test/api/sp/voice', { method, headers });
}

function createProductionHttp(overrides = {}) {
  return createHttp({
    studentKey: STUDENT_KEY,
    operationsKey: OPERATIONS_KEY,
    allowedOrigins: [ALLOWED_ORIGIN],
    production: true,
    ...overrides,
  });
}

function assertOperationalError(error, { status, code, message }) {
  assert.equal(error?.status, status);
  assert.equal(error?.code, code);
  assert.equal(error?.message, message);
  return true;
}

test('production configuration fails closed for missing, wildcard, and local origins', () => {
  for (const allowedOrigins of [undefined, [], '', '*', ['*']]) {
    assert.throws(
      () => createProductionHttp({ allowedOrigins }),
      (error) => assertOperationalError(error, {
        status: 500,
        code: 'invalid_configuration',
        message: 'Production CORS origins must be explicit.',
      }),
    );
  }

  for (const localOrigin of [
    'http://localhost:3000',
    'https://localhost',
    'http://localhost.:3000',
    'http://127.0.0.1:8888',
    'http://127.0.0.2:8888',
    'http://0.0.0.0:8888',
    'http://[::1]:9999',
    'http://[::ffff:127.0.0.1]:9999',
  ]) {
    assert.throws(
      () => createProductionHttp({ allowedOrigins: [localOrigin] }),
      (error) => assertOperationalError(error, {
        status: 500,
        code: 'invalid_configuration',
        message: 'Production CORS origins cannot be local.',
      }),
    );
  }

  assert.doesNotThrow(() => createHttp({
    studentKey: STUDENT_KEY,
    operationsKey: OPERATIONS_KEY,
    allowedOrigins: ['http://localhost:3000'],
    production: false,
  }));
});

test('student and operations credentials must be configured and distinct', () => {
  for (const config of [
    { studentKey: '', operationsKey: OPERATIONS_KEY },
    { studentKey: STUDENT_KEY, operationsKey: '' },
    { studentKey: STUDENT_KEY, operationsKey: STUDENT_KEY },
  ]) {
    assert.throws(
      () => createProductionHttp(config),
      (error) => assertOperationalError(error, {
        status: 500,
        code: 'invalid_configuration',
        message: 'Student and operations credentials must be present and distinct.',
      }),
    );
  }
});

test('student authorization returns the exact allowed origin and emits scoped CORS', async () => {
  const http = createProductionHttp();
  const auth = http.requireStudent(request({ studentKey: STUDENT_KEY }));
  assert.deepEqual(auth, { origin: ALLOWED_ORIGIN });

  const response = http.json({ ok: true }, { status: 200, origin: auth.origin });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
  assert.equal(
    response.headers.get('access-control-allow-headers'),
    'Content-Type, x-student-key',
  );
  assert.equal(response.headers.get('vary'), 'Origin');
  assert.deepEqual(await response.json(), { ok: true });

  const preflight = http.preflight(request({ method: 'OPTIONS' }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
});

test('student authorization rejects disallowed origins before credentials', async () => {
  const http = createProductionHttp();
  assert.throws(
    () => http.requireStudent(request({
      origin: 'https://attacker.example.test',
      studentKey: STUDENT_KEY,
    })),
    (error) => assertOperationalError(error, {
      status: 403,
      code: 'origin_not_allowed',
      message: 'This origin is not allowed.',
    }),
  );

  const response = http.preflight(request({
    origin: 'https://attacker.example.test',
    method: 'OPTIONS',
  }));
  assert.equal(response.status, 403);
  assert.equal(response.headers.has('access-control-allow-origin'), false);
  assert.deepEqual(await response.json(), {
    error: { code: 'origin_not_allowed', message: 'This origin is not allowed.' },
  });
});

test('student authorization uses a stable unauthorized error for wrong-length keys', () => {
  const http = createProductionHttp();
  for (const studentKey of [undefined, '', 'x', `${STUDENT_KEY}-but-longer`]) {
    assert.throws(
      () => http.requireStudent(request({ studentKey })),
      (error) => assertOperationalError(error, {
        status: 401,
        code: 'unauthorized',
        message: 'Unauthorized.',
      }),
    );
  }
});

test('operations authorization is distinct and usage responses never emit browser CORS', async () => {
  const http = createProductionHttp();
  const operations = http.requireOperations(request({
    origin: 'https://attacker.example.test',
    operationsKey: OPERATIONS_KEY,
  }));
  assert.deepEqual(operations, { origin: null });

  const response = http.json(
    { spendMicros: 123 },
    { status: 200, origin: operations.origin },
  );
  assert.equal(response.headers.has('access-control-allow-origin'), false);
  assert.equal(response.headers.has('access-control-allow-methods'), false);
  assert.deepEqual(await response.json(), { spendMicros: 123 });

  for (const operationsKey of [undefined, STUDENT_KEY, 'wrong']) {
    assert.throws(
      () => http.requireOperations(request({ operationsKey })),
      (error) => assertOperationalError(error, {
        status: 401,
        code: 'unauthorized',
        message: 'Unauthorized.',
      }),
    );
  }
});

test('typed error responses retain the stable code without exposing internals', async () => {
  const http = createProductionHttp();
  const response = http.error(
    { status: 409, code: 'speech_in_progress', message: 'Speech is already in progress.' },
    { origin: ALLOWED_ORIGIN },
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: { code: 'speech_in_progress', message: 'Speech is already in progress.' },
  });

  const internal = http.error(new Error('credential leaked here'), { origin: null });
  assert.equal(internal.status, 500);
  assert.deepEqual(await internal.json(), {
    error: { code: 'internal_error', message: 'Internal server error.' },
  });
});

test('readEnv prefers Netlify.env.get and uses process.env only when Netlify is unavailable', () => {
  const previousNetlify = globalThis.Netlify;
  const previousProcessValue = process.env.SP_TEST_ENV;
  process.env.SP_TEST_ENV = 'process-value';

  try {
    const reads = [];
    globalThis.Netlify = {
      env: {
        get(name) {
          reads.push(name);
          return name === 'SP_TEST_ENV' ? 'netlify-value' : undefined;
        },
      },
    };
    assert.equal(readEnv('SP_TEST_ENV'), 'netlify-value');
    assert.equal(readEnv('SP_MISSING_ENV'), undefined);
    assert.deepEqual(reads, ['SP_TEST_ENV', 'SP_MISSING_ENV']);

    delete globalThis.Netlify;
    assert.equal(readEnv('SP_TEST_ENV'), 'process-value');
  } finally {
    if (previousNetlify === undefined) delete globalThis.Netlify;
    else globalThis.Netlify = previousNetlify;
    if (previousProcessValue === undefined) delete process.env.SP_TEST_ENV;
    else process.env.SP_TEST_ENV = previousProcessValue;
  }
});
