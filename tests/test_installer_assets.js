// Regression: all extension readers are included by the Windows updater and ZIP build.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ps=fs.readFileSync('browser/brave-extension/ACTUALIZAR.ps1','utf8');
const yml=fs.readFileSync('.github/workflows/package-extension.yml','utf8');
const required=['order-preflight.js','order-ui-probe.js','orders-history-probe.js'];
for(const f of required){
  assert.ok(fs.existsSync(path.join('browser/brave-extension',f)),f+' is missing');
  assert.ok(ps.includes("'"+f+"'"),'PowerShell updater does not require '+f);
  assert.ok(yml.includes(f),'Brave release packaging omits '+f);
}
assert.ok(ps.includes("Get-ChildItem -LiteralPath $source -File"),'Updater must include new script files automatically');
assert.ok(ps.includes("$_.Extension -in @('.js','.json','.html','.md')"),'Updater asset allowlist not found');
assert.ok(ps.includes("@('manifest.json')"),'Manifest must be copied after all scripts');
console.log('PASS all current and future extension script assets are included');
