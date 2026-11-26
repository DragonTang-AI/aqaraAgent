#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const assets=join(dirname(fileURLToPath(import.meta.url)),'../assets');
const fixture=JSON.parse(readFileSync(join(assets,'preview-template/scenarios/typical.json'),'utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));
function create(overrides={},scenario=fixture,gate){
 const calls=[];let mock;
 const host={__LIFE_STUDIO_DASHBOARD_CONFIG__:{role:'child',scope:'studio',homeSpaceRequired:true,homeSpaceSelection:'first-room',homeDeviceMode:'space',homeModules:['overview','devices'],overviewMetrics:['temperature'],...overrides},setTimeout,LifeBridge:{supports:()=>true,nativeHttpRequest:async req=>{calls.push(req);return gate?gate(req,()=>mock.request(req)):mock.request(req);}}};
 const ctx=vm.createContext({window:host,URLSearchParams,console,setTimeout,clearTimeout});
 vm.runInContext(readFileSync(join(assets,'preview-template/mock-studio.js'),'utf8'),ctx);
 const setScenario=value=>{mock=host.PreviewStudio.create(value);};setScenario(scenario);
 vm.runInContext(readFileSync(join(assets,'dashboard-template/studio-runtime.js'),'utf8'),ctx);
 return {api:host.StudioRuntime,calls,setScenario};
}
const deviceCalls=h=>h.calls.filter(r=>r.url.endsWith('/devices'));
const nested=clone(fixture);nested.spaces[0].children=[{spaceId:'floor',name:'一层',children:nested.spaces[0].children}];
const auto=create({},nested);const initial=await auto.api.load();await auto.api.loadOverviewIndex();
assert.equal(auto.api.getHomeSpace(),'mock-living','startup chooses an actual leaf room, not the floor/root');
assert.ok(initial.devices.length>0,'first load has devices without a selection action');
assert.ok(initial.devices.every(d=>d.spaceId==='mock-living'));
assert.equal(auto.calls.filter(r=>r.url.endsWith('/spaces')).length,1,'bootstrap and UI share one spaces read');
assert.ok(deviceCalls(auto).every(r=>r.params.spaceIds==='mock-living'&&r.params.needChildren===false));
auto.api.setHomeSpace('mock-bedroom');await auto.api.load();await auto.api.load();
assert.equal(auto.api.getHomeSpace(),'mock-bedroom','refresh preserves the explicit in-session room choice');
assert.equal(deviceCalls(auto).at(-1).params.spaceIds,'mock-bedroom');
const bound=create({homeSpaceId:'mock-bedroom'});await bound.api.load();assert.equal(bound.api.getHomeSpace(),'mock-bedroom','configured scope wins');
assert.ok(deviceCalls(bound).every(r=>r.params.spaceIds==='mock-bedroom'));
const invalid=create({homeSpaceId:'missing'});await assert.rejects(invalid.api.load(),/unavailable/);assert.equal(deviceCalls(invalid).length,0);
const manual=create({homeSpaceSelection:'manual'});await manual.api.load();assert.equal(manual.api.getHomeSpace(),'');assert.equal(deviceCalls(manual).length,0);
for(const spaces of [[],[{spaceId:'root-only',name:'全屋'}]]){
 const empty=create({}, {...clone(fixture),spaces});await empty.api.load();await empty.api.loadOverviewIndex();assert.equal(empty.api.getHomeSpace(),'');assert.equal(deviceCalls(empty).length,0,'missing rooms never fall back to all devices');
}
const emptyRoomFixture=clone(fixture);emptyRoomFixture.devices=emptyRoomFixture.devices.filter(d=>d.space?.spaceId!=='mock-living');
const emptyRoom=create({},emptyRoomFixture);const emptySnapshot=await emptyRoom.api.load();assert.equal(emptyRoom.api.getHomeSpace(),'mock-living');assert.equal(emptySnapshot.devices.length,0);assert.equal(deviceCalls(emptyRoom).length,1,'an empty room is not a reason to scan other rooms');
const failed=create({},fixture,(req,next)=>{if(req.url.endsWith('/spaces'))throw new Error('Space service unavailable');return next();});
await assert.rejects(failed.api.load(),/Space service unavailable/);assert.equal(deviceCalls(failed).length,0);
let release,started;const waiting=new Promise(resolve=>started=resolve),blocked=new Promise(resolve=>release=resolve);let first=true;
const racing=create({},fixture,async(req,next)=>{if(req.url.endsWith('/spaces')&&first){first=false;started();await blocked;}return next();});
const old=racing.api.load().then(()=>null,error=>error);await waiting;racing.api.setHomeSpace('mock-bedroom');const current=racing.api.load();release();
assert.match(String((await old)?.message),/replaced|changed/,'stale startup must not publish');await current;assert.equal(racing.api.getHomeSpace(),'mock-bedroom');assert.ok(deviceCalls(racing).every(r=>r.params.spaceIds==='mock-bedroom'));
const switched=create();switched.api.setCollectionScope('studio-a','user');await switched.api.load();
const other=clone(fixture);other.spaces[0].children[0].spaceId='new-room';for(const device of other.devices)if(device.space?.spaceId==='mock-living')device.space.spaceId='new-room';
switched.api.setCollectionScope('studio-b','user');switched.setScenario(other);const second=await switched.api.load();assert.equal(switched.api.getHomeSpace(),'new-room');assert.ok(second.devices.every(d=>d.spaceId==='new-room'),'Studio changes do not inherit the previous room');
console.log('HOME SPACE STARTUP PASS: automatic scoped first paint, one spaces read, real leaf order, configured/manual priority, refresh, empty/failure, stale-load and Studio isolation.');
