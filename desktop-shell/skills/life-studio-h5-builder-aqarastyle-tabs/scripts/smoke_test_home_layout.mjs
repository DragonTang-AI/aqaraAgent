#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {DEFAULT_HOME_MODULE_ORDER as base,resolveHomeModuleOrder,reorderHomeModules,validateHomeModuleOrder} from './home-layout.mjs';
const scripts=dirname(fileURLToPath(import.meta.url)),skill=resolve(scripts,'..'),temp=mkdtempSync(join(tmpdir(),'life-home-layout-')),template=readFileSync(join(skill,'assets/dashboard-template/index.html'),'utf8');
const run=(name,args,ok=true)=>{const r=spawnSync(process.execPath,[join(scripts,name),...args],{encoding:'utf8'});assert.equal(r.status===0,ok,r.stdout+r.stderr);return r;};
const permutations=arr=>arr.length?arr.flatMap((id,i)=>permutations(arr.filter((_,j)=>i!==j)).map(rest=>[id,...rest])):[[]];
for(const order of permutations([...base])){const html=reorderHomeModules(template,order);assert.deepEqual(validateHomeModuleOrder(html,order),order);assert.equal(reorderHomeModules(html,base),template,'permutation must preserve all module and system bytes');}
assert.deepEqual(resolveHomeModuleOrder(undefined),base);assert.deepEqual(resolveHomeModuleOrder('favoriteScenes'),['favoriteScenes','overview','aiAssistant','devices','spaceControl']);
for(const invalid of ['',[],null,'overview,overview','ai','devices,,overview','notice'])assert.throws(()=>resolveHomeModuleOrder(invalid));
for(const [i,mode,tabs,order] of [[0,'space','home',undefined],[1,'favorites','home,devices,automation','favoriteScenes,overview,aiAssistant,devices,spaceControl'],[2,'space','home,automation','spaceControl,devices,aiAssistant,favoriteScenes,overview'],[3,'favorites','home,devices','aiAssistant']]){
 const root=join(temp,String(i));run('generate_h5.mjs',['--output',root,'--home-device-mode',mode,'--tabs',tabs,...(order?['--home-module-order',order]:[])]);run('validate_h5.mjs',[root]);run('validate_aqara_style.mjs',[root]);
 const configFile=join(root,'config.js'),config=JSON.parse(readFileSync(configFile,'utf8').match(/Object\.freeze\(([\s\S]*)\);/)[1]);assert.deepEqual(config.homeModuleOrder,resolveHomeModuleOrder(order));
 const before=readFileSync(join(root,'dashboard.js'),'utf8');run('configure_home_layout.mjs',[root,'--order','devices,spaceControl,overview,favoriteScenes,aiAssistant']);run('validate_h5.mjs',[root]);assert.equal(readFileSync(join(root,'dashboard.js'),'utf8'),before);const next=JSON.parse(readFileSync(configFile,'utf8').match(/Object\.freeze\(([\s\S]*)\);/)[1]);const {homeModuleOrder:a,...rest}=config,{homeModuleOrder:b,...restNext}=next;assert.deepEqual(restNext,rest);
 const html=readFileSync(join(root,'index.html'),'utf8');next.homeModuleOrder=[...base];writeFileSync(configFile,'window.__LIFE_STUDIO_DASHBOARD_CONFIG__ = Object.freeze('+JSON.stringify(next)+');');run('validate_h5.mjs',[root],false);writeFileSync(join(root,'index.html'),html);
}
const bad=join(temp,'invalid');run('generate_h5.mjs',['--output',bad,'--home-module-order','overview,overview'],false);assert.equal(existsSync(bad),false);
const legacy=join(temp,'legacy');run('generate_h5.mjs',['--output',legacy]);const legacyHtml=join(legacy,'index.html');writeFileSync(legacyHtml,readFileSync(legacyHtml,'utf8').replace(/\s*<!-- home-module:[^>]+-->/g,''));const legacyBefore=readFileSync(legacyHtml,'utf8'),legacyConfig=readFileSync(join(legacy,'config.js'),'utf8');run('configure_home_layout.mjs',[legacy,'--order','devices'],false);assert.equal(readFileSync(legacyHtml,'utf8'),legacyBefore);assert.equal(readFileSync(join(legacy,'config.js'),'utf8'),legacyConfig);
console.log('HOME LAYOUT SMOKE PASS: 120 permutations; generated modes/tabs; partial/default/invalid; configure preservation; mismatches rejected; legacy edit fails without writes. '+temp);
