import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Project subagents live in .claude/agents/*.md. Their tool allowlist IS the enforcement:
// a read-only agent has no editing tool in its frontmatter, and a writing agent names the
// one file it may touch. This test pins those scopes so a later edit cannot quietly widen
// an agent (see docs/superpowers/specs/2026-09-02-automation-and-hooks-brainstorm.md §G).

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const agentsDir = path.join(repo, '.claude', 'agents');

const EDITING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const MODELS = new Set(['sonnet', 'opus', 'haiku', 'inherit']);

// name -> contract. Every agent file must have a row here; an unlisted agent fails the
// test so that adding one is a deliberate, reviewed decision.
const CONTRACTS = {
  'evidence-verifier': {
    readOnly: false,
    // Edit only — no Write, so the agent cannot create files; the body scopes Edit to one file.
    // The PubMed connector surfaces as mcp__PubMed__* on the web and mcp__claude_ai_PubMed__*
    // on a desktop with the claude.ai connector; both must be allowlisted or the agent silently
    // loses its core tools on one host.
    mustHave: ['Read', 'Grep', 'Edit', 'Bash', 'mcp__PubMed__get_article_metadata', 'mcp__claude_ai_PubMed__get_article_metadata'],
    mustNotHave: ['Write', 'MultiEdit', 'NotebookEdit'],
    bodyMustMention: ['evidence_annotations.json', 'sourceSpan', 'C5', 'Never'],
  },
  'deploy-verifier': {
    // "readOnly" pins the absence of editing tools. Bash is allowed (curl, the canary), so
    // the read-only guarantee beyond that is the agent's instruction, not the allowlist.
    //
    // The two Netlify readers are the egress-blocked fallback: when the environment denies
    // CONNECT to *.netlify.app (as Claude Code on the web does), the HTTP runbook cannot run at
    // all, and without them the agent returns a wall of UNVERIFIED. They are read-only
    // operations on Netlify's deploy record. Like the PubMed connector above, the server
    // surfaces under two prefixes depending on host, and both must be allowlisted or the
    // fallback silently disappears on one of them.
    //
    // These readers must NOT grow into the updater services (netlify-*-updater), which can
    // change a site: this agent never deploys, never clears a cache, never edits.
    readOnly: true,
    mustHave: [
      'Bash', 'Read',
      'mcp__Netlify__netlify-project-services-reader',
      'mcp__Netlify__netlify-deploy-services-reader',
      'mcp__claude_ai_Netlify__netlify-project-services-reader',
      'mcp__claude_ai_Netlify__netlify-deploy-services-reader',
    ],
    mustNotHave: [
      'mcp__Netlify__netlify-deploy-services-updater',
      'mcp__Netlify__netlify-project-services-updater',
      'mcp__claude_ai_Netlify__netlify-deploy-services-updater',
      'mcp__claude_ai_Netlify__netlify-project-services-updater',
    ],
    bodyMustMention: [
      'production_canary.py', 'git-lfs', 'crisis-block-hook', 'Never',
      // the fallback must keep saying what it does NOT prove
      'DEPLOY VERIFIED · CONTENT UNVERIFIED', 'commit_ref',
    ],
  },
};

function parseFrontmatter(text, file) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  assert.ok(match, `${file}: missing YAML frontmatter block`);
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    assert.ok(m, `${file}: frontmatter line is not "key: value": ${line}`);
    fields[m[1]] = m[2].trim();
  }
  return { fields, body: match[2] };
}

const files = fs.existsSync(agentsDir)
  ? fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md')).sort()
  : [];

test('every agent in .claude/agents has a contract row and every contract has a file', () => {
  const names = files.map((f) => f.replace(/\.md$/, ''));
  assert.deepEqual(names, Object.keys(CONTRACTS).sort());
});

for (const file of files) {
  const name = file.replace(/\.md$/, '');
  const contract = CONTRACTS[name];
  if (!contract) continue; // reported by the test above

  test(`${name}: frontmatter is well-formed and matches its filename`, () => {
    const { fields, body } = parseFrontmatter(
      fs.readFileSync(path.join(agentsDir, file), 'utf8'),
      file,
    );
    assert.equal(fields.name, name, 'frontmatter name must equal the filename');
    assert.ok(fields.description && fields.description.length > 40, 'description too short');
    assert.match(fields.description, /^Use (when|after|for|whenever|before)/, 'description must say when to delegate');
    assert.ok(MODELS.has(fields.model), `model must be one of ${[...MODELS].join(', ')}`);
    assert.ok(fields.tools, 'tools must be an explicit comma-separated allowlist');
    assert.ok(!fields.tools.startsWith('['), 'tools is a comma-separated string, not a YAML list');
    assert.ok(body.trim().length > 500, 'system prompt body is too short to be a real agent');
  });

  test(`${name}: tool allowlist matches its read/write contract`, () => {
    const { fields, body } = parseFrontmatter(
      fs.readFileSync(path.join(agentsDir, file), 'utf8'),
      file,
    );
    const tools = fields.tools.split(',').map((t) => t.trim()).filter(Boolean);
    const toolSet = new Set(tools);
    assert.equal(tools.length, toolSet.size, 'duplicate tool in allowlist');

    if (contract.readOnly) {
      for (const t of toolSet) {
        assert.ok(!EDITING_TOOLS.has(t), `read-only agent lists editing tool ${t}`);
      }
    }
    for (const t of contract.mustHave) assert.ok(toolSet.has(t), `missing required tool ${t}`);
    for (const t of contract.mustNotHave) assert.ok(!toolSet.has(t), `forbidden tool ${t} present`);
    for (const phrase of contract.bodyMustMention) {
      assert.ok(body.includes(phrase), `body must mention "${phrase}"`);
    }
  });
}

test('agent bodies carry no hard-coded crisis numbers or machine paths', () => {
  for (const file of files) {
    const text = fs.readFileSync(path.join(agentsDir, file), 'utf8');
    assert.doesNotMatch(text, /\b988\b/, `${file}: crisis contacts live in crisis_resources.json only`);
    assert.doesNotMatch(text, /\/(Users|sessions)\/[a-z]/, `${file}: no machine-specific paths`);
  }
});
