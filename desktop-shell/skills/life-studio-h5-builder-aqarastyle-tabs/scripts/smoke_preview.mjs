#!/usr/bin/env node
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync,cpSync,mkdtempSync,writeFileSync,rmSync,mkdirSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkScenario,validateWorkspace,refreshPreview } from './preview-package.mjs';
const root=resolve(process.argv[2]);validateWorkspace(root);
const data=JSON.parse(readFileSync(join(root,'preview/scenarios/typical.json'),'utf8'));checkScenario(data);
const context={window:{}};vm.createContext(context);vm.runInContext(readFileSync(join(root,'preview/mock-studio.js'),'utf8'),context);
const model=context.window.PreviewStudio.create(data);
const call=(path,method='GET',params={},body)=>JSON.parse(JSON.stringify(model.request({url:'/open/api/v1'+path,method,params,data:body}).data));
assert.equal(call('/devices','GET',{pageNum:1,pageSize:12}).data.length,12);
assert.equal(call('/devices','GET',{pageNum:2,pageSize:12}).data.length,Math.min(12,Math.max(0,data.devices.length-12)));assert.equal(call('/devices','GET',{pageNum:3,pageSize:12}).data.length,Math.min(12,Math.max(0,data.devices.length-24)));
assert.equal(call('/devices','GET',{deviceName:'not-found'}).totalCount,0);
const target={deviceId:'mock-device-0',endpointId:1,functionCode:'Light',traitCode:'CurrentLevel'};
call('/devices/trait/execute','POST',{}, {data:[{...target,value:25}]});
assert.equal(call('/devices/trait/read','POST',{}, {data:[{...target,traitCodes:['CurrentLevel']}]} )[0].value,25);
assert.throws(()=>call('/devices/trait/execute','POST',{}, {data:[{...target,value:40},{...target,value:1000}]}));
assert.equal(call('/devices/trait/read','POST',{}, {data:[{...target,traitCodes:['CurrentLevel']}]} )[0].value,25,'invalid batches must not partially mutate');
call('/automations/status','POST',{}, {automationIds:['mock-auto-0'],enabled:false});
assert.equal(call('/automations/manual-triggers','GET',{enabledOnly:true}).length,0);
assert.throws(()=>call('/automations/manual-triggers/execute','POST',{}, {automationId:'mock-auto-0',triggerNodeId:'mock-trigger-home'}));
assert.throws(()=>call('/unknown'));assert.throws(()=>model.request({url:'https://real-studio.invalid/',method:'GET'}));
const clean=context.window.PreviewStudio.create(data);assert.equal(clean.request({url:'/open/api/v1/automations',method:'GET',params:{}}).data.data[0].enabled,true,'reset restores original fixture state');
const temp=mkdtempSync(join(tmpdir(),'life-preview-smoke-'));
try{
 cpSync(root,temp,{recursive:true});
 const html=join(temp,'runtime/index.html');const original=readFileSync(html,'utf8');writeFileSync(html,original+'\n');assert.throws(()=>validateWorkspace(temp),/Runtime changed/);
 refreshPreview(temp);validateWorkspace(temp);
 writeFileSync(join(temp,'runtime/mock-studio.js'),'// forbidden');assert.throws(()=>validateWorkspace(temp),/Unexpected runtime/);rmSync(join(temp,'runtime/mock-studio.js'));
 mkdirSync(join(temp,'runtime/assets'),{recursive:true});writeFileSync(join(temp,'runtime/assets/icon.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7"/></svg>');refreshPreview(temp);assert.ok(validateWorkspace(temp).app.files.some(item=>item.path==='assets/icon.svg'));
 writeFileSync(join(temp,'runtime/assets/extra.js'),'// executable asset');assert.throws(()=>refreshPreview(temp),/Unsupported production asset/);rmSync(join(temp,'runtime/assets/extra.js'));
 const manifestPath=join(temp,'manifest.json'),manifest=JSON.parse(readFileSync(manifestPath,'utf8'));manifest.app.files[0].path='../preview/mock-studio.js';writeFileSync(manifestPath,JSON.stringify(manifest));assert.throws(()=>validateWorkspace(temp));
}finally{rmSync(temp,{recursive:true,force:true});}
console.log('PREVIEW SMOKE PASS: page/search, typed readback, atomic failure, linked scenes, resets, unsupported routes, stale manifests and export path injection');
