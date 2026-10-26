import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const html=readFileSync(new URL('../dist/prototype.html',import.meta.url),'utf8');

test('the portable prototype embeds its images and has no external file dependencies',()=>{
  assert.ok(html.includes('data:image/png;base64,'));
  assert.equal(/<(?:script|link)[^>]+(?:src|href)=/.test(html),false);
  assert.equal(/(?:src|href)="\.\//.test(html),false);
  assert.equal(/url\(['"]?\.\//.test(html),false);
});
test('the combined portable game module parses without duplicate declarations or missing imports',()=>{
  const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);assert.equal(/^import\s/m.test(script),false);
  const result=spawnSync(process.execPath,['--check','--input-type=module'],{input:script,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
