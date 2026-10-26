'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const manifest=JSON.parse(fs.readFileSync('browser/brave-extension/manifest.json','utf8'));
const background=fs.readFileSync('browser/brave-extension/background.js','utf8');

assert.equal(manifest.action.default_popup,'popup.html',
  'The toolbar icon must use the normal Brave popup, as in v2.8.29');
assert.equal(manifest.action.default_title,'investmentChecker');
assert.doesNotMatch(background,/chrome\.action\?\.onClicked\?\.addListener/,
  'The toolbar must not open a separate window');
assert.doesNotMatch(background,/openInvestmentCheckerPanel|investmentCheckerPanelId|chrome\.windows\.create/,
  'Persistent panel machinery must not remain in the worker');

console.log('PASS classic Brave action popup restored');
