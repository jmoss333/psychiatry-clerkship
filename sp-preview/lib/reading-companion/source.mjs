import fs from 'node:fs';
const bundledPath = new URL('../../generated/reading-companion.json', import.meta.url);
export function loadReadingPack(input = {}) {
  if (input.version === 1) return input;
  const {path = bundledPath} = input;
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch { throw new Error('source_unavailable'); }
}
export function selectPreset(pack, presetId) {
  if (!pack || pack.available === false || !Array.isArray(pack.units) || !Array.isArray(pack.presets)) throw new Error('source_unavailable');
  const preset = pack.presets.find(p => p.id === presetId);
  if (!preset) throw new Error('unknown_preset');
  const ids = new Set(preset.unitIds);
  const units = pack.units.filter(u => ids.has(u.id));
  if (!ids.size || units.length !== ids.size) throw new Error('source_unavailable');
  return {...preset, units};
}
