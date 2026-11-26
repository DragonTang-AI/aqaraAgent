#!/usr/bin/env node
// Browser-only visual states. QA output is external; no real device writes are made.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateWorkspace} from './preview-package.mjs';
import {assertExternalQAOutput,startQAStaticServer} from './qa-output.mjs';
const args=process.argv.slice(2),opt=n=>args[args.indexOf(n)+1],root=resolve(args[0]),qa=resolve(opt('--qa-output'));
validateWorkspace(root);assertExternalQAOutput(root,qa);mkdirSync(qa,{recursive:true});
const server=await startQAStaticServer(root);
const mod=await import(pathToFileURL(resolve(opt('--playwright-module')))),browser=await(mod.default||mod).chromium.launch({headless:true,executablePath:resolve(opt('--browser'))}),reports=[];
try {
 for(const width of [320,390]) for(const theme of ['light','dark']) {
  const page=await browser.newPage({viewport:{width:1100,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/preview/canvas.html');await page.locator('#width').selectOption(String(width));await page.locator('#theme').selectOption(theme);
  const frame=page.frameLocator('main > iframe');await frame.locator('.device-card.category-light .light-adjust').first().waitFor();const child=page.frames().find(f=>f.url().includes('/preview/index.html'));
  await child.waitForFunction(()=>window.StudioRuntime.spaceControlIndex().complete);
  const cards=await frame.locator('.device-card.category-light').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),g=e.parentElement.getBoundingClientRect();return{size:e.dataset.cardSize,width:r.width,grid:g.width,inline:e.querySelectorAll('input').length,adjust:e.querySelector('.light-adjust')?.getBoundingClientRect().height,power:e.querySelector('.device-toggle')?.getBoundingClientRect().height};}));
  assert.ok(cards.length);assert.ok(cards.every(c=>c.size==='M'&&c.width<c.grid*.6&&c.inline===0&&(!c.adjust||c.adjust>=44)&&(!c.power||c.power>=44)),JSON.stringify(cards));
  const before=await frame.locator('.device-card.category-light').first().boundingBox();
  const button=frame.locator('.light-adjust').first();await button.click();await frame.locator('.capability-sheet-layer.is-open').waitFor();
  const panel=frame.locator('#capability-sheet-dialog');const inputs=panel.locator('input[type=range]');assert.ok(await inputs.count()>0);
  for(const progress of [0,.5,1]){const states=await inputs.evaluateAll((es,p)=>es.map(e=>{e.value=String(+e.min+(e.max-e.min)*p);e.dispatchEvent(new Event('input',{bubbles:true}));const r=e.getBoundingClientRect(),c=e.closest('.capability-body').getBoundingClientRect();return{fits:r.left>=c.left-1&&r.right<=c.right+1,width:r.width,height:r.height};}),progress);assert.ok(states.every(s=>s.fits&&s.width>=80&&s.height>=44-0.01),JSON.stringify(states));}
  await panel.screenshot({path:qa+'/'+width+'-'+theme+'-adjust.png'});
  await panel.press('Escape');await frame.locator('.capability-sheet-layer.is-open').waitFor({state:'detached'});
  const after=await frame.locator('.device-card.category-light').first().boundingBox();assert.equal(after.width,before.width);assert.equal(after.height,before.height);
  // Every adjustable fixture must expose exactly its model-backed range count, without mounting another card's controls.
  const adjusters=frame.locator('.light-adjust');let maxRanges=0;
  for(let n=0;n<await adjusters.count();n++){
   await adjusters.nth(n).click();await frame.locator('.capability-sheet-layer.is-open').waitFor();
   const count=await panel.locator('input[type=range]').count();assert.ok(count>=1&&count<=2);maxRanges=Math.max(maxRanges,count);
   assert.equal(await panel.locator('.device-toggle,select').count(),0,'adjust sheet must not bypass the general details policy');
   await panel.press('Escape');await frame.locator('.capability-sheet-layer.is-open').waitFor({state:'detached'});
  }
  assert.equal(maxRanges,2,'preview must exercise brightness plus color temperature');
  await frame.locator('.device-card.category-light').first().scrollIntoViewIfNeeded();await child.evaluate(()=>window.scrollBy(0,-80));await frame.locator('.device-card.category-light').first().screenshot({path:qa+'/'+width+'-'+theme+'-cards.png'});assert.deepEqual(errors,[]);reports.push({width,theme,cards,stable:true});await page.close();
 }
 writeFileSync(qa+'/results.json',JSON.stringify(reports,null,2));console.log('COMPACT LIGHT PASS: two-column M, lazy real ranges, 320/390 light/dark, touch targets, stable close');
}finally{await browser.close();server.close();}
