// Faculty attestation — serverless commit-on-save (Netlify Functions v2, ESM).
//
// Security model:
//   • The GitHub token lives ONLY here, in the server env (GITHUB_TOKEN). The browser never sees it.
//   • Every request must carry the shared faculty key (FACULTY_ATTEST_PASSWORD), compared in constant time.
//   • The token should be a FINE-GRAINED PAT scoped to this ONE repo, Contents: Read and write — nothing else.
//
// Endpoints (config.path = "/api/attest"):
//   GET   → returns current attestation state (reviewed.json + attestable page/tool list + qbank summary)
//   POST  → applies changes and commits the single target file, triggering the normal Netlify deploy
//
// Required env vars (set in the Netlify UI for the faculty site, never in code):
//   GITHUB_TOKEN              fine-grained PAT, this repo, Contents RW
//   FACULTY_ATTEST_PASSWORD   shared faculty key
// Optional:
//   GITHUB_REPO   default "jmoss333/psychiatry-clerkship"
//   GIT_BRANCH    default "main"
//   ALLOWED_ORIGIN  restrict CORS to the faculty site origin (default "*")

const REPO = process.env.GITHUB_REPO || 'jmoss333/psychiatry-clerkship';
const BRANCH = process.env.GIT_BRANCH || 'main';
const TOKEN = process.env.GITHUB_TOKEN;
const KEY = process.env.FACULTY_ATTEST_PASSWORD;
const ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const ATTESTER_EMAIL = process.env.ATTESTER_EMAIL || 'faculty@clerkship.local';
// Student site the console deep-links to for "View" (read the page you're attesting).
// Override per deployment; defaults to the MS3 site.
const STUDENT = (process.env.STUDENT_SITE_URL || 'https://une-ms3-psychiatry.netlify.app').replace(/\/+$/, '');

const REVIEWED_PATH = '13_Faculty_Resources/reviewed.json';
const MANIFEST_PATH = '13_Faculty_Resources/_automation/site_build/site_manifest.json';
const QBANK_PATH = 'question_bank.json';

const GH = 'https://api.github.com';

function cors() {
  return {
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-faculty-key',
    'Content-Type': 'application/json',
  };
}
function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: cors() });
}
// constant-time string compare (avoids leaking key length/prefix via timing)
function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function authed(request, bodyKey) {
  const k = bodyKey != null ? bodyKey : request.headers.get('x-faculty-key');
  return KEY && safeEqual(k, KEY);
}
function today() { return new Date().toISOString().slice(0, 10); }

async function ghGet(path) {
  const r = await fetch(`${GH}/repos/${REPO}/contents/${path}?ref=${BRANCH}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'faculty-attest' },
  });
  if (!r.ok) throw new Error(`GitHub GET ${path} → ${r.status}`);
  const data = await r.json();
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return { json: JSON.parse(content), sha: data.sha };
}
async function ghPut(path, obj, sha, message, indent) {
  // Preserve each file's existing indentation so an attest doesn't reformat the whole file
  // (reviewed.json is 1-space, question_bank.json is 2-space).
  const content = Buffer.from(JSON.stringify(obj, null, indent || 1) + '\n', 'utf8').toString('base64');
  const r = await fetch(`${GH}/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'faculty-attest' },
    body: JSON.stringify({
      message, content, sha, branch: BRANCH,
      committer: { name: 'Faculty Attestation Console', email: ATTESTER_EMAIL },
    }),
  });
  if (r.status === 409) { const e = new Error('sha-conflict'); e.conflict = true; throw e; }
  if (!r.ok) throw new Error(`GitHub PUT ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function buildState() {
  const [reviewed, manifest, qbank] = await Promise.all([
    ghGet(REVIEWED_PATH), ghGet(MANIFEST_PATH), ghGet(QBANK_PATH),
  ]);
  const rev = reviewed.json;
  const items = [];
  for (const [src, slug, title] of manifest.json.md || []) {
    const r = rev[slug] || {};
    items.push({ slug, title, kind: 'page', status: r.status || 'unreviewed', at: r.at || '', by: r.by || '' });
  }
  for (const [src, slug, title] of manifest.json.tools || []) {
    const r = rev[slug] || {};
    items.push({ slug, title, kind: 'tool', status: r.status || 'unreviewed', at: r.at || '', by: r.by || '' });
  }
  const qitems = (qbank.json.items || [])
    .filter((it) => !it.retired)   // retired items are excluded from the attestable set
    .map((it) => ({
      id: it.id, category: it.category, difficulty: it.difficulty,
      status: it.status || 'draft',
      stem: (it.stem || '').slice(0, 120),
    }));
  return { student: STUDENT, items, qbank: qitems, counts: {
    pagesReviewed: items.filter((i) => i.status === 'reviewed').length,
    pagesTotal: items.length,
    qbankAttested: qitems.filter((q) => q.status === 'attested').length,
    qbankTotal: qitems.length,
  } };
}

async function withRetry(fn) {
  try { return await fn(); }
  catch (e) { if (e.conflict) return await fn(); throw e; }
}

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: cors() });
  if (!TOKEN || !KEY) return json(500, { error: 'server not configured (missing GITHUB_TOKEN or FACULTY_ATTEST_PASSWORD)' });

  try {
    if (request.method === 'GET') {
      if (!authed(request)) return json(401, { error: 'unauthorized' });
      return json(200, await buildState());
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!authed(request, body.key)) return json(401, { error: 'unauthorized' });
      const attester = (body.attester || 'Joshua Moss, MD').toString().slice(0, 80);
      const target = body.target;
      const changes = body.changes || {};
      const at = today();

      if (target === 'content') {
        // changes: { "<slug>": true|false }  true = reviewed, false = clear to pending
        const result = await withRetry(async () => {
          const { json: rev, sha } = await ghGet(REVIEWED_PATH);
          let n = 0;
          for (const [slug, on] of Object.entries(changes)) {
            if (on) { rev[slug] = { status: 'reviewed', at, by: attester }; n++; }
            else { rev[slug] = { status: 'pending', at, by: 'Pending faculty review' }; n++; }
          }
          const commit = await ghPut(REVIEWED_PATH, rev, sha, `attest: ${n} content item(s) by ${attester} (${at})`, 1);
          return { n, commit: commit.commit && commit.commit.html_url };
        });
        return json(200, { ok: true, target, updated: result.n, commit: result.commit });
      }

      if (target === 'qbank') {
        // changes: { "<id>": true|false }  true = attested, false = draft
        const result = await withRetry(async () => {
          const { json: qb, sha } = await ghGet(QBANK_PATH);
          const byId = new Map((qb.items || []).map((it) => [it.id, it]));
          let n = 0;
          for (const [id, on] of Object.entries(changes)) {
            const it = byId.get(id);
            if (!it || it.retired) continue;   // retired items cannot be (re-)attested
            it.status = on ? 'attested' : 'draft'; n++;
          }
          const commit = await ghPut(QBANK_PATH, qb, sha, `attest: ${n} question(s) by ${attester} (${at})`, 2);
          return { n, commit: commit.commit && commit.commit.html_url };
        });
        return json(200, { ok: true, target, updated: result.n, commit: result.commit });
      }

      return json(400, { error: 'unknown target (expected "content" or "qbank")' });
    }

    return json(405, { error: 'method not allowed' });
  } catch (e) {
    return json(502, { error: String(e.message || e) });
  }
};

export const config = { path: '/api/attest' };
