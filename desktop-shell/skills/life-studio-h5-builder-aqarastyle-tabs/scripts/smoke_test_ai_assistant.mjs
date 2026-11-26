#!/usr/bin/env node
// QA fixtures only: exercise raw public definitions, not fabricated presentation flags.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import vm from 'node:vm';

const root=resolve(process.argv[2]);
const source=readFileSync(join(root,'studio-runtime.js'),'utf8');
const clean=value=>JSON.parse(JSON.stringify(value));
const device=(id,types=['Sensor'],space='living',name='客厅')=>({deviceId:id,deviceName:'返回设备 '+id,deviceTypesList:types,state:true,space:{spaceId:space,name}});
const definition=(id,traits)=>({deviceId:id,endpoints:[{endpointId:1,functions:[{functionCode:'ReturnedFunction',traits,commands:[]}]}]});
const presence=(code='OccupancySensed',value=false,type='Bool',readable=true)=>({traitCode:code,value,parameter:{type,readable,writable:false}});
const range=(code='CurrentLevel',writable=true)=>({traitCode:code,value:45,parameter:{type:'Integer',min:0,max:100,step:1,readable:true,writable}});
async function run(devices,definitions,spaces=[{spaceId:'living',name:'客厅'}],options={}) {
 const calls=[];
 const roomTree=[{spaceId:'home',name:'测试家庭',children:spaces}];
 const window={__LIFE_STUDIO_DASHBOARD_CONFIG__:{apiPath:'/open/api/v1',scope:'studio',backendPageSize:4,enableOverviewIndex:true},setTimeout,
  LifeBridge:{supports:()=>true,launchContext:()=>({}),nativeHttpRequest:async request=>{
   calls.push(request);let data;
   if(request.url.endsWith('/devices'))data={data:devices.slice((request.params.pageNum-1)*request.params.pageSize,request.params.pageNum*request.params.pageSize),totalCount:devices.length};
   else if(request.url.endsWith('/definitions'))data=definitions.filter(d=>request.params.deviceIds.split(',').includes(d.deviceId));
   else if(request.url.endsWith('/spaces'))data=roomTree;
   else data=[];
   return {code:0,data};
  }}};
 vm.runInNewContext(source,{window,URLSearchParams,setTimeout,clearTimeout});
 const snapshot=await window.StudioRuntime.load();
 const before=calls.length;
 const hints=clean(window.StudioRuntime.deriveAssistantHints(snapshot.devices,snapshot.spaces));
 for(let i=0;i<10;i++)window.StudioRuntime.deriveAssistantHints(snapshot.devices,snapshot.spaces);
 assert.equal(calls.length,before,'projection must issue zero requests');
 if(options.overview)return {hints,overview:clean(await window.StudioRuntime.loadOverviewIndex()),calls,snapshot};
 return {hints,calls,snapshot};
}
const no={presence:false,livingRoomDimming:false,offline:false,roomHints:{presence:[],dimming:[],offline:[],environment:[]}};
assert.deepEqual((await run([],[])).hints,no);
for(const code of ['OccupancySensed','PresenceDetected','HumanPresence','Presence','Occupancy']) {
 for(const value of [false,true,null]) {
  const result=await run([device('presence')],[definition('presence',[presence(code,value)])]);
  assert.equal(result.hints.presence,true,code+' establishes capability even without an occupied reading');
  assert.deepEqual(result.hints.roomHints.presence,['living'],'only the actual room of the confirmed sensor is eligible');
 }
}
for(const trait of [presence('MotionDetected'),presence('OccupancySensed','yes','String'),presence('OccupancySensed',true,'Bool',false)]) {
 assert.deepEqual((await run([device('presence')],[definition('presence',[trait])])).hints,no);
}
const light=device('light',['Light']);
assert.equal((await run([light],[definition('light',[range()])])).hints.livingRoomDimming,true);
assert.deepEqual((await run([light],[definition('light',[range()])])).hints.roomHints.dimming,['living']);
for(const traits of [[presence('OnOff',true)],[range('ColorTemperature')],[range('CurrentLevel',false)]]) {
 assert.equal((await run([light],[definition('light',traits)])).hints.livingRoomDimming,false);
}
assert.equal((await run([light],[definition('light',[range()])],[{spaceId:'living',name:'卧室'}])).hints.livingRoomDimming,false,'real space identity wins over device space label');
for(const name of ['客廳','Living Room','living room','Lounge'])assert.equal((await run([light],[definition('light',[range()])],[{spaceId:'living',name}])).hints.livingRoomDimming,true);
assert.equal((await run([{...light,state:false}],[definition('light',[range()])])).hints.livingRoomDimming,false);
assert.equal((await run([{...light,state:false}],[])).hints.offline,true);
assert.deepEqual((await run([{...light,state:false}],[])).hints.roomHints.offline,['living']);
assert.deepEqual((await run([light],[definition('light',[range()])],[{spaceId:'living',name:''}])).hints.roomHints.dimming,[],'unnamed rooms cannot produce contextual questions');
const metric=(code,value)=>({traitCode:code,value,parameter:{type:'Number',readable:true,writable:false}});
const temp={deviceId:'temp',endpoints:[{endpointId:1,deviceType:'TemperatureSensor',functions:[{functionCode:'Temperature',traits:[metric('CurrentTemperature',23)],commands:[]}]}]};
const humid={deviceId:'humid',endpoints:[{endpointId:1,deviceType:'HumiditySensor',functions:[{functionCode:'RelativeHumidity',traits:[metric('RelativeHumidity',48)],commands:[]}]}]};
assert.deepEqual((await run([device('temp'),device('humid')],[temp,humid])).hints.roomHints.environment,['living'],'separate real sensors in one room establish both ambient readings');
assert.deepEqual((await run([device('temp')],[temp])).hints.roomHints.environment,[],'temperature alone does not establish humidity');
const devices=Array.from({length:6},(_,i)=>device('later-'+i));
const defs=devices.map((d,i)=>definition(d.deviceId,i===5?[presence()]:[]));
const late=await run(devices,defs,undefined,{overview:true});
assert.equal(late.hints.presence,false);
assert.equal(late.overview.assistantHints.presence,true,'bounded overview finds a sensor outside the visible first page');
assert.deepEqual(late.overview.assistantHints.roomHints.presence,['living'],'bounded overview retains only confirmed room identity');
assert.equal(late.calls.filter(call=>call.url.endsWith('/devices')).length,2,'existing first page plus bounded overview only');
console.log('AI ASSISTANT SMOKE PASS: raw capability/space matching, false/null presence, motion and unsafe exclusion, dimming, offline, empty, late index and zero projection requests');
