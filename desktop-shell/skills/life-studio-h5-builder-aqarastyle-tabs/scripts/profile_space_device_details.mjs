#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync,mkdirSync} from 'node:fs';
import {resolve,extname,sep,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateWorkspace} from './preview-package.mjs';
import {assertExternalQAOutput} from './qa-output.mjs';
const args=process.argv.slice(2),root=resolve(args[0]),opt=n=>args[args.indexOf(n)+1];validateWorkspace(root);
const qa=args.includes('--screenshots')?resolve(opt('--screenshots')):null;assertExternalQAOutput(root,qa);if(qa)mkdirSync(qa,{recursive:true});
const server=createServer((req,res)=>{try{const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+sep)||!existsSync(p)||!statSync(p).isFile())throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const imported=await import(args.includes('--playwright-module')?pathToFileURL(resolve(opt('--playwright-module'))).href:'playwright');
const browser=await(imported.default||imported).chromium.launch({headless:true,...(args.includes('--browser')?{executablePath:resolve(opt('--browser'))}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/preview/index.html');await page.waitForFunction(()=>document.querySelector('#app').getAttribute('aria-busy')==='false');
 const expected=await page.evaluate(()=>{const c=__LIFE_STUDIO_DASHBOARD_CONFIG__;return typeof c.enableSpaceDeviceDetails==='boolean'?c.enableSpaceDeviceDetails:!c.role||c.role==='male';});
 await page.locator('#device-grid .device-card').first().waitFor();
 if(expected){
  const card=page.locator('#device-grid .has-device-detail-action').first();await card.waitFor();await card.locator('.device-meta').click();await page.locator('.capability-sheet-layer.is-open').waitFor();await page.locator('.capability-sheet-close').click();await page.waitForTimeout(300);
  await card.press('Enter');await page.locator('.capability-sheet-layer.is-open').waitFor();await page.locator('.capability-sheet-close').click();await page.waitForTimeout(300);
 }else{
  assert.equal(await page.locator('#device-grid .has-device-detail-action').count(),0);assert.equal(await page.locator('#device-grid .capability-sheet-source:not(.light-adjust-source)').count(),0);
  assert.equal(await page.locator('#device-grid .device-card[tabindex],#device-grid .device-card[aria-haspopup],#device-grid .device-card[data-detail-action]').count(),0);
  await page.locator('#device-grid .device-meta').first().click();
  await page.locator('#device-grid .device-card').first().evaluate(n=>{n.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));n.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));});
  assert.equal(await page.locator('.capability-sheet-layer.is-open').count(),0);
 }
 await page.evaluate(()=>{const old=webkit.messageHandlers.nativeBridge.postMessage;window.__detailWrites=[];webkit.messageHandlers.nativeBridge.postMessage=m=>{if(m.action==='nativeHttpRequest'&&m.data.method==='POST')__detailWrites.push(m);old(m);};});
 const control=page.locator('#device-grid .device-toggle[data-allowed="true"]:not(:disabled)').first();await control.waitFor();await control.click();await page.waitForFunction(()=>window.__detailWrites.length>0);assert.equal(await page.evaluate(()=>__detailWrites.length),1,'inline switch still sends one existing device write');assert.equal(await page.locator('.capability-sheet-layer.is-open').count(),0);
 assert.deepEqual(errors,[]);console.log('SPACE DEVICE DETAILS BROWSER PASS: enabled='+expected+'; body/keyboard policy, affordances and inline switch preserved');
}finally{await browser.close();await new Promise(r=>server.close(r));}
