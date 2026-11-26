#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const root=resolve(process.argv[2]);
const calls=[];
const window={
  __LIFE_STUDIO_DASHBOARD_CONFIG__:{scope:'studio',apiPath:'/open/api/v1',devicePageSize:12,homeModules:['spaceControl'],enableOverviewIndex:false},
  location:{search:'',pathname:'/index.html'},setTimeout,clearTimeout,
  sessionStorage:{getItem:()=>null,setItem(){}},
  LifeBridge:{launchContext:()=>({}),supports:()=>true,nativeHttpRequest:async request=>{
    calls.push(request.url);
    const path=request.url.split('/open/api/v1')[1];
    if(path==='/devices')return {code:0,data:{data:[{deviceId:'push-light',deviceName:'灯',deviceTypesList:['Light'],state:true,space:{spaceId:'room',name:'客厅'}}],totalCount:1,pageNum:1}};
    if(path==='/spaces')return {code:0,data:[{spaceId:'home',name:'家',children:[{spaceId:'room',name:'客厅'}]}]};
    if(path==='/devices/definitions')return {code:0,data:[{deviceId:'push-light',endpoints:[{endpointId:1,deviceType:'Light',functions:[{functionCode:'Output',traits:[{traitCode:'OnOff',parameter:{type:'Bool',readable:true,writable:true},value:true}],commands:[]}]}]}]};
    throw new Error('Unexpected Studio request: '+path);
  }},
};
vm.runInContext(readFileSync(join(root,'studio-runtime.js'),'utf8'),vm.createContext({window,URLSearchParams,console,setTimeout,clearTimeout}));
await window.StudioRuntime.load();
const watches=JSON.parse(JSON.stringify(window.StudioRuntime.dashboardWatchedTraits()));
assert.ok(watches.some(point=>point.deviceId==='push-light' && point.endpointId===1 && point.functionCode==='Output' && point.traitCode==='OnOff'));
assert.ok(watches.some(point=>point.deviceId==='push-light' && point.endpointId===0 && point.functionCode==='BasicInformation' && point.traitCode==='Reachable'));
assert.equal(new Set(watches.map(point=>JSON.stringify(point))).size,watches.length,'watch coordinates must be deduplicated');
const before=calls.length;
const changed=window.StudioRuntime.applyPushedTraitValues([{deviceId:'push-light',endpointId:1,functionCode:'Output',traitCode:'OnOff',value:'false'}]);
assert.deepEqual(Array.from(changed.deviceIds),['push-light']);
assert.equal(window.StudioRuntime.spaceControlIndex().devices[0].control.value,false);
assert.equal(window.StudioRuntime.spaceControlIndex().devices[0].readings[0].displayValue,'Off','boolean telemetry keeps its reviewed display wording');
assert.equal(calls.length,before,'trait push must update known card state without a Studio request');
window.StudioRuntime.applyPushedTraitValues([{deviceId:'push-light',endpointId:1,functionCode:'Output',traitCode:'OnOff',value:'invalid'}]);
assert.equal(window.StudioRuntime.spaceControlIndex().devices[0].control.value,false,'invalid push must not overwrite a known state');
window.StudioRuntime.applyPushedTraitValues([{deviceId:'push-light',endpointId:1,functionCode:'Output',traitCode:'OnOff',value:'false',time:200}]);
window.StudioRuntime.applyPushedTraitValues([{deviceId:'push-light',endpointId:1,functionCode:'Output',traitCode:'OnOff',value:'true',time:100}]);
assert.equal(window.StudioRuntime.spaceControlIndex().devices[0].control.value,false,'older push must not overwrite a newer value');
console.log('DASHBOARD PUSH PROJECTION PASS');
