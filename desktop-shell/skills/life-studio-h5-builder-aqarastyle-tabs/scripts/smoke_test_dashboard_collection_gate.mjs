#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const source = readFileSync(join(resolve(process.argv[2]), 'dashboard.js'), 'utf8');
const runtimeSource = readFileSync(join(resolve(process.argv[2]), 'studio-runtime.js'), 'utf8');
const writeGateSource=source.slice(source.indexOf('  function setBusy('),source.indexOf('  function showToast('))+
  source.slice(source.indexOf('  function disableMountedWrites('),source.indexOf('  function captureLayoutAnchor('));
const sceneButton={dataset:{writeAction:'scene',allowed:'true'},disabled:false};
const deviceButton={dataset:{writeAction:'device',allowed:'true'},disabled:false};
const writeGateContext={busy:false,loadMoreBusy:false,favoriteDevices:null,favorites:{availability(){}},
  elements:{app:{setAttribute(){}},loadMore:{disabled:false}},isCachedSnapshot:()=>false,hasMoreDevices:()=>false,
  document:{querySelectorAll:selector=>selector==='[data-write-action="scene"]'?[sceneButton]:[sceneButton,deviceButton]}};
const writeGate=vm.runInNewContext(`${writeGateSource}\n({setBusy,disableMountedWrites})`,writeGateContext);
writeGate.setBusy(true);writeGate.disableMountedWrites();writeGate.setBusy(false);
assert.equal(sceneButton.dataset.allowed,'true','a refresh must preserve the scene capability flag');
assert.equal(sceneButton.disabled,false,'an unchanged scene card becomes actionable after refresh');
assert.equal(deviceButton.dataset.allowed,'false','device writes remain blocked until their controls are refreshed');
const gridRender=source.slice(source.indexOf('  function renderDevices('),source.indexOf('  function renderAIAssistant('));
assert.ok(gridRender.indexOf("querySelectorAll('.empty-card,.loading-card')")>=0 && gridRender.indexOf("querySelectorAll('.empty-card,.loading-card')")<gridRender.indexOf('visible.forEach('), 'remove loading skeletons before keyed cards are inserted');
const declaration = source.match(/  function createCollectionEventGate\([\s\S]*?\n  const nativeCollectionGate =/);
assert.ok(declaration, 'Home must install the native collection burst gate');
const createGate = vm.runInNewContext(`${declaration[0].slice(0, -'\n  const nativeCollectionGate ='.length)}\ncreateCollectionEventGate`);

let now = 0, nextId = 0;
const tasks = new Map();
const timers = {
  setTimeout(callback, delay) { const id = ++nextId; tasks.set(id, { at: now + delay, callback }); return id; },
  clearTimeout(id) { tasks.delete(id); },
};
function advance(ms) {
  const until = now + ms;
  while (true) {
    const due = [...tasks].filter(([, task]) => task.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
    if (!due) break;
    now = due[1].at; tasks.delete(due[0]); due[1].callback();
  }
  now = until;
}

let refreshes = 0;
const gate = createGate(() => { refreshes++; }, timers);
for (let index = 0; index < 71; index++) { gate.push(); advance(400); }
assert.equal(refreshes, 1, 'a sustained native collection storm must not repeat full Home loads');
advance(1399);
assert.equal(refreshes, 1);
advance(1);
assert.equal(refreshes, 2, 'the final state is read once after the storm becomes quiet');
gate.push();
assert.equal(refreshes, 3, 'a later isolated collection change still refreshes Home');
gate.push();
gate.reset();
advance(5000);
assert.equal(refreshes, 3, 'a disposed or changed Studio must cancel trailing work');
const startupGate=createGate(()=>{refreshes++;},timers);
startupGate.hold();
startupGate.push(); advance(400); startupGate.push();
assert.equal(refreshes,3,'subscription resyncs must not start another load during initial loading');
startupGate.release();
advance(1799);
assert.equal(refreshes,3,'startup reconciliation waits for the subscription to settle');
advance(1);
assert.equal(refreshes,4,'startup subscription resyncs require at most one reconciliation');
startupGate.reset();
const settledGate=createGate(()=>{refreshes++;},timers);
settledGate.hold();settledGate.push();advance(1800);settledGate.release();
assert.equal(refreshes,5,'an event already quiet when initial loading ends is reconciled once');
settledGate.reset();

const watchDeclaration = source.match(/  function syncDashboardDataWatches\(\)\{[\s\S]*?\n  \}/);
assert.ok(watchDeclaration, 'Home must reconcile native watch points');
const watchPoints = new Map();
const updates = [];
let currentPoints = [];
const watchContext = {
  Map,
  JSON,
  dashboardWatchPoints: watchPoints,
  disposeDashboardData: { updateWatchedTraits(points) { updates.push(points); } },
  global: { StudioRuntime: { dashboardWatchedTraits() { return currentPoints; } } },
};
const syncWatches = vm.runInNewContext(`${watchDeclaration[0]}\nsyncDashboardDataWatches`, watchContext);
const point = index => ({ deviceId: `device-${index}`, endpointId: 0, functionCode: 'BasicInformation', traitCode: 'Reachable' });
currentPoints = [point(1), point(2)]; syncWatches();
currentPoints = Array.from({ length: 55 }, (_, index) => point(index + 1)); syncWatches();
currentPoints = [point(1), point(2)]; syncWatches();
assert.deepEqual(updates.map(points => points.length), [2, 55], 'a transiently smaller overview must not shrink the native watch set');
watchPoints.clear();
currentPoints = [point(1)]; syncWatches();
assert.equal(updates.at(-1).length, 1, 'a Studio change starts a fresh watch set');

const publishSource=runtimeSource.slice(runtimeSource.indexOf('  function publishOverview('),runtimeSource.indexOf('  async function loadOverviewCatalog('));
assert.ok(publishSource.includes('function publishOverview'), 'overview publisher exists');
const overviewState={activeSnapshot:{overview:{status:'complete',onlineDeviceCount:12}},overviewIndexBuilding:true,loadRevision:3,cacheStore(){}};
const publishOverview=vm.runInNewContext(`${publishSource}\npublishOverview`,overviewState);
publishOverview(null,3,{status:'loading',onlineDeviceCount:0});
assert.equal(overviewState.activeSnapshot.overview.onlineDeviceCount,12,'partial loading must not replace the complete overview');
publishOverview(null,3,{status:'complete',onlineDeviceCount:11});
assert.equal(overviewState.activeSnapshot.overview.onlineDeviceCount,11,'completed index may replace the displayed overview');
assert.equal(overviewState.overviewIndexBuilding,false,'finished indexing releases the space-control gate');

const reconcileSource=runtimeSource.slice(runtimeSource.indexOf('  async function reconcileDashboardTraits('),runtimeSource.indexOf('  async function refreshDashboardCollection('));
assert.ok(reconcileSource.includes('async function reconcileDashboardTraits'), 'bounded ACK reconciliation exists');
const traitRequests=[];
const points=Array.from({length:150},(_,index)=>({deviceId:'visible',endpointId:index,functionCode:'OnOff',traitCode:'OnOff'}));
points.push({deviceId:'unrelated',endpointId:1,functionCode:'OnOff',traitCode:'OnOff'});
const reconcileContext={activeSnapshot:{isCached:false,overview:{status:'complete'}},loadRevision:1,collectionEpoch:1,asArray:value=>Array.isArray(value)?value:[],dashboardWatchedTraits:()=>points,JSON,Set,Map,
  routes:{readTrait:{path:'/devices/trait/read'}},request:async(route,options)=>{traitRequests.push({route,options});return [];},applyPushedTraitValues:()=>({deviceIds:[],overview:{status:'complete'}})};
const reconcile=vm.runInNewContext(`${reconcileSource}\nreconcileDashboardTraits`,reconcileContext);
await reconcile(['visible']);
assert.deepEqual(traitRequests.map(item=>item.options.data.data.length),[32,32,32],'ACK reads are capped and batched');
assert.ok(traitRequests.every(item=>item.route.path==='/devices/trait/read' && item.options.data.data.every(row=>row.deviceId==='visible')),'ACK cannot scan unrelated devices or collections');

const scopedSource=runtimeSource.slice(runtimeSource.indexOf('  async function refreshDashboardCollection('),runtimeSource.indexOf('  async function requestTransport('));
assert.ok(scopedSource.includes('async function refreshDashboardCollection'), 'typed object refresh exists');
const invalidated=[],requested=[];
const scopedContext={activeSnapshot:{isCached:false,spaces:[],scenes:[]},loadRevision:1,collectionEpoch:1,
  invalidateCollections:paths=>invalidated.push(paths),routes:{spaces:{path:'/spaces'}},request:async route=>{requested.push(route.path);return [{id:'room'}];},flattenSpaces:value=>value,listScenes:async()=>[{id:'scene'}],cacheStore(){}};
const refreshScoped=vm.runInNewContext(`${scopedSource}\nrefreshDashboardCollection`,scopedContext);
await refreshScoped('spaces');await refreshScoped('scenes');
assert.deepEqual(invalidated.map(row=>[...row]),[['/spaces'],['/scenes']],'object events invalidate only their own collection');
assert.deepEqual(requested,['/spaces'],'space event does not request device or scene lists');

const dataSource=source.slice(source.indexOf('  function scheduleDashboardData(){'),source.indexOf('  function setBusy('));
assert.ok(dataSource.includes('function scheduleDashboardData'), 'Home data scheduler exists');
const scheduled=[];let fullLoads=0,applied=0,dirtyMarks=0;
const tabs={tab:'devices',active(){return this.tab;},markHomeDirty(){dirtyMarks++;}};
const dataContext={dashboardDataTimer:null,dashboardDataDid:'studio',dashboardPageVisible:true,document:{hidden:false},
  dashboardCollectionsDirty:false,dashboardCollectionTargets:new Set(),dashboardCollectionResults:new Map(),dashboardCollectionFlight:false,dashboardRefreshSerial:0,
  dashboardTraitItems:[{deviceId:'d',endpointId:1,functionCode:'OnOff',traitCode:'OnOff',value:true}],
  busy:false,pendingControls:new Set(),pendingScenes:new Set(),spaceControl:{busy:()=>false},favoriteDevices:null,
  currentSnapshot:{isCached:false,devices:[{id:'d',controls:[{id:'on'}]}]},
  global:{setTimeout(callback){scheduled.push(callback);return scheduled.length;},StudioTabs:tabs,
    StudioRuntime:{applyPushedTraitValues(){applied++;return {deviceIds:['d'],overview:{status:'complete'}};}}},
  refresh(){fullLoads++;},renderSummary(){},renderFilters(){},renderDevices(){},renderScenes(){},applyDashboardCollection(){},updateDeviceCardState(){},setDeviceControlPending(){},controlKey:(id,control)=>`${id}:${control}`,captureViewportAnchor(){},scheduleDashboardData:null};
const scheduleData=vm.runInNewContext(`${dataSource}\nscheduleDashboardData`,dataContext);
scheduleData();scheduled.shift()();
assert.equal(dirtyMarks,0,'ordinary Trait pushes on Devices must not mark Home for full refresh');
assert.equal(dataContext.dashboardTraitItems.length,1,'hidden Home retains bounded pushes until return');
tabs.tab='home';scheduleData();scheduled.shift()();
assert.equal(applied,1,'return to Home applies retained Trait points');
assert.equal(fullLoads,0,'return to Home must not reload all collections for Trait changes');
tabs.tab='devices';dataContext.dashboardCollectionsDirty=true;scheduleData();scheduled.shift()();
assert.equal(dirtyMarks,1,'true collection recovery still marks Home for a full refresh');

let resolveScene,appliedScenes=0;
dataContext.dashboardCollectionsDirty=false;
dataContext.dashboardCollectionTargets.add('scenes');
dataContext.global.StudioRuntime.refreshDashboardCollection=()=>new Promise(resolve=>{resolveScene=resolve;});
dataContext.applyDashboardCollection=()=>{appliedScenes++;};
tabs.tab='home';scheduleData();scheduled.shift()();
tabs.tab='devices';resolveScene([{id:'scene'}]);
for(let index=0;index<10 && dataContext.dashboardCollectionFlight;index++)await Promise.resolve();
assert.equal(dataContext.dashboardCollectionFlight,false,'scoped flight settles before the deferred Home render');
assert.equal(appliedScenes,0,'a scoped response must not render Home after leaving its tab');
assert.equal(dataContext.dashboardCollectionResults.size,1,'scoped response is retained for Home');
tabs.tab='home';if(!scheduled.length)scheduleData();scheduled.shift()();
assert.equal(appliedScenes,1,'return to Home commits the retained scoped result without another request');
assert.equal(fullLoads,0,'a scoped response never triggers a full Home load');
dataContext.dashboardCollectionTargets.add('scenes');
scheduleData();scheduled.shift()();
dataContext.dashboardRefreshSerial++;
resolveScene([{id:'obsolete'}]);
for(let index=0;index<10 && dataContext.dashboardCollectionFlight;index++)await Promise.resolve();
assert.equal(dataContext.dashboardCollectionResults.size,0,'a completed full refresh discards an older scoped response');
assert.equal(appliedScenes,1,'obsolete scoped response cannot repaint Home');

const ackSource=source.slice(source.indexOf('  function scheduleDashboardAckReconcile(){'),source.indexOf('  function queueDashboardCollectionRefresh('));
assert.ok(ackSource.includes('function scheduleDashboardAckReconcile'), 'ACK scheduler exists');
let ackTimers=0;
const ackContext={initialLoadSettled:true,currentSnapshot:{isCached:false},snapshotScopeDid:'studio',dashboardDataDid:'studio',lastDashboardAckRead:0,Date,
  global:{StudioTabs:tabs,setTimeout(){ackTimers++;return ackTimers;},clearTimeout(){}},dashboardAckTimer:null};
const scheduleAck=vm.runInNewContext(`${ackSource}\nscheduleDashboardAckReconcile`,ackContext);
tabs.tab='devices';scheduleAck();
assert.equal(ackTimers,0,'ACK from leaving Home must not schedule a read on the next tab return');
console.log('DASHBOARD COLLECTION BURST PASS');
