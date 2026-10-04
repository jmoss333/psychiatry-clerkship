import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';

const root = new URL('../', import.meta.url);
const ordinary = 'Ordinary prose from the script is recovered once.';
const excluded = 'Excluded pack prose must never leak into generic extraction.';
const differentId = 'Different case ID remains ordinary recoverable prose.';

function extract(raw, excludedIds = []) {
  return JSON.parse(execFileSync('python3', ['-B', '-c', `
import json,sys,tempfile
from pathlib import Path
sys.path.insert(0,'13_Faculty_Resources/_automation')
from export_curriculum_review import tool_text
fixture=json.load(sys.stdin)
with tempfile.TemporaryDirectory() as directory:
    path=Path(directory)/'tool.html'
    path.write_text(fixture['raw'],encoding='utf-8')
    visible,prose=tool_text(path,exclude_script_ids=tuple(fixture['excludedIds']))
    print(json.dumps({'visible':visible,'prose':prose}))
`], {cwd:root, encoding:'utf8', input:JSON.stringify({raw, excludedIds})}));
}

const variants = [
  {name:'lowercase', script:'script', scriptClose:'script', style:'style', styleClose:'style', id:'id', type:'type'},
  {name:'uppercase', script:'SCRIPT', scriptClose:'SCRIPT', style:'STYLE', styleClose:'STYLE', id:'ID', type:'TYPE'},
  {name:'mixed-case', script:'sCrIpT', scriptClose:'ScRiPt', style:'sTyLe', styleClose:'StYlE', id:'Id', type:'TyPe'},
];

for (const tag of variants) {
  test(`${tag.name} script and style stay out of visible text while script prose is recovered once`, () => {
    const raw = `<${tag.style}>.panel { content: "Style prose must stay outside visible text."; }</${tag.styleClose}>
<p>Visible shell text remains available.</p>
<${tag.script}>const first = "${ordinary}"; const repeated = "${ordinary}";</${tag.scriptClose}>`;
    assert.deepEqual(extract(raw), {
      visible:['Visible shell text remains available.'],
      prose:[ordinary],
    });
  });

  test(`${tag.name} excluded JSON never leaks and a differently cased ID remains included`, () => {
    const raw = `<${tag.script} ${tag.id}="pft-data" ${tag.type}="application/json">{"teaching":"${excluded}"}</${tag.scriptClose}>
<p>Visible shell text remains available.</p>
<${tag.script}>const first = "${ordinary}"; const repeated = "${ordinary}";</${tag.scriptClose}>
<${tag.script} ${tag.id}="PFT-DATA" ${tag.type}="application/json">{"teaching":"${differentId}"}</${tag.scriptClose}>`;
    assert.deepEqual(extract(raw, ['pft-data']), {
      visible:['Visible shell text remains available.'],
      prose:[ordinary, differentId],
    });
  });
}
