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
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/preview/index.html');await page.waitForFunction(()=>document.querySelector('#app').getAttribute('aria-busy')==='false'&&StudioRuntime.spaceControlIndex().complete);
 const senior=await page.evaluate(()=>document.documentElement.dataset.role==='senior');
 for(const width of [390,320])for(const theme of ['light','dark'])for(const locale of ['zh-CN','zh-TW','en']){
  await page.setViewportSize({width,height:1000});await page.evaluate(({theme,locale})=>{document.documentElement.dataset.theme=theme;LifeI18n.setLocale(locale);},{theme,locale});
  for(const scope of ['*','mock-living']){
   await page.locator('#space-control-tabs [data-space-room="'+scope+'"]').click();await page.locator('.space-summary-card').first().waitFor();
   const geometry=await page.evaluate(()=>[...document.querySelectorAll('.space-summary-card')].map(card=>{
    const title=card.querySelector('.space-summary-copy strong'),status=card.querySelector('.space-summary-copy>span');title.textContent='Very long space name 超长空间名称测试 '.repeat(4);status.textContent='Unknown status / 状态未知 '.repeat(6);
    const r=n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};const c=r(card),icon=r(card.querySelector('.space-category-icon')),copy=r(card.querySelector('.space-summary-copy')),buttons=[...card.querySelectorAll('.space-circle-action')].map(r),chips=card.querySelector('.space-stat-chips');return {category:card.dataset.spaceCategory,scope:card.dataset.scope,card:c,icon,copy,buttons,chips:chips?r(chips):null,order:[...card.children].map(n=>n.className),copyPosition:getComputedStyle(card.querySelector('.space-summary-copy')).position};
   }));assert.equal(geometry.length,3);
   for(const item of geometry){const {card:c,icon,copy,buttons,chips}=item;assert.equal(c.height,senior?(width<=350?(scope==='*'?268:216):(scope==='*'?204:160)):(scope==='*'?172:126));assert.equal(c.width,width-(width<350?24:32));assert.equal(icon.x-c.x,16);assert.equal(icon.y-c.y,senior&&width>350?18:16);assert.equal(copy.x-c.x,16);assert.equal(copy.y-c.y,senior?(width<=350?136:80):68);assert.equal(copy.height,senior?52:42);assert.notEqual(item.copyPosition,'absolute');assert.equal(item.order[0],'space-summary-top');assert.equal(item.order[1],'space-summary-copy');
    for(const b of buttons){assert.ok(b.width>=44&&b.height>=44);assert.ok(b.x>=c.x&&b.right<=c.right&&b.y>=c.y&&b.bottom<=c.bottom);assert.ok(senior&&width<=350?b.y>=icon.bottom+8:b.x>=icon.right+11);assert.ok(b.bottom<=copy.y);}
    if(chips){assert.equal(chips.y-c.y,senior?(width<=350?200:144):122);assert.equal(chips.height,senior?40:34);assert.ok(copy.bottom<=chips.y);assert.ok(chips.right<=c.right);}
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   if(qa&&locale==='en'&&scope==='*'){await page.locator('#space-control-section').scrollIntoViewIfNeeded();await page.screenshot({path:join(qa,theme+'-'+width+'.png')});}
  }
 }
 await page.locator('.space-summary-card[data-space-category="shade"] .space-summary-copy').click();await page.locator('.space-detail').waitFor();assert.equal(await page.locator('.space-detail footer button').count(),3);await page.locator('.space-detail-back').click();assert.equal(await page.locator('.space-detail').count(),0);
 assert.deepEqual(errors,[]);console.log('SPACE SUMMARY LAYOUT PASS: three categories, shared rows, 172/126 scopes, 320/390px, three languages, themes, long text, containment, hit targets and detail navigation');
}finally{await browser.close();await new Promise(r=>server.close(r));}
