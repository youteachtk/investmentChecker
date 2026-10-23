'use strict';
// Enforce preservation of the real, previously successful 2.7.1 collector.
// Feature UI and investment review can evolve, but not this mechanism.
const fs=require('node:fs'),assert=require('node:assert/strict');
const loc='browser/brave-extension/';
const fixture='tests/fixtures/';
const original=fs.readFileSync(fixture+'verified_2_7_1_background.js.txt','utf8');
const current=fs.readFileSync(loc+'background.js','utf8');
const cut=s=>s.slice(0,s.indexOf('async function route(msg,sender) {'));
assert.equal(cut(current),cut(original),
  'The proven quote uploader, temporary tabs or startSync were modified.');
const originalCollector=fs.readFileSync(fixture+'verified_2_7_1_collector.js.txt','utf8');
const collector=fs.readFileSync(loc+'collector.js','utf8');
assert.equal(collector,originalCollector,
  'The verified 145+56+25 Angular collector must remain unchanged.');
assert.match(current,/if \(msg\?\.type==='START_SYNC'\) return await startSync\(\)/);
assert.match(current,/importScripts\('private-sync\.js'\)/);
assert.match(current,/importScripts\('order-preflight\.js'\)/);
assert.ok(!current.includes('startQueuedManualSync'));
console.log('PASS immutable 2.7.1 quote capture with 2.8 order proposal routes');
