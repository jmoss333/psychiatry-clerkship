import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const preview = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exec = promisify(execFile);

// Each browser worker owns its public assets and private source pack until teardown.
export async function buildPreviewFixture() {
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'preview-browser-build-'));
  const cleanup = () => rm(outputRoot, {recursive: true, force: true});
  try {
    await exec(process.execPath, [path.join(preview, 'build.mjs'), '--output-root', outputRoot], {cwd: preview});
    return {
      dist: path.join(outputRoot, 'dist'),
      sourcePack: path.join(outputRoot, 'generated/reading-companion.json'),
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
