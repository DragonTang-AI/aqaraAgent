#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import vm from 'node:vm';

const source=readFileSync(join(resolve(process.argv[2]),'dashboard.js'),'utf8');
const policy=source.slice(source.indexOf('  function shouldRefreshOnResume('),source.indexOf('  function queueDashboardCollectionRefresh('));
const resume=source.slice(source.indexOf('  function resumeDashboard('),source.indexOf("  document.addEventListener('visibilitychange'"));
assert.ok(policy.includes('function shouldRefreshOnResume') && resume.includes('function resumeDashboard'),'foreground policy must be present');

let now=1000,tab='home',offline=false,full=0,reconciled=0,typed=0;
const context={config:{cacheTtlSeconds:300},Date:{now:()=>now},Number,
  dashboardCollectionsDirty:false,dashboardCollectionTargets:new Set(),dashboardCollectionResults:new Map(),dashboardTraitItems:[],
  dashboardWasHidden:true,dashboardPageVisible:true,dashboardResumeReconcilePending:false,dashboardResumeOfflinePending:false,
  dashboardDataDid:'studio-A',snapshotScopeDid:'studio-A',currentSnapshot:{connectedAt:1000,isCached:false},busy:false,
  document:{hidden:false},global:{StudioTabs:{active:()=>tab}},phoneOffline:()=>offline,
  queueDashboardCollectionRefresh(){full++;},scheduleDashboardAckReconcile(){reconciled++;},scheduleDashboardData(){typed++;}};
const api=vm.runInNewContext(`${policy}\n${resume}\n({resumeDashboard,flushResumeReconcile})`,context);

api.resumeDashboard();
assert.equal(full,0,'brief foreground return must not reload all collections');
assert.equal(reconciled,1,'brief return reconciles bounded live traits');
api.resumeDashboard();assert.equal(reconciled,1,'duplicate native and DOM visibility events must coalesce');

context.dashboardWasHidden=true;context.document.hidden=true;api.resumeDashboard();
assert.equal(reconciled,1,'native visible event waits for document visibility');
context.document.hidden=false;api.resumeDashboard();assert.equal(reconciled,2,'document visibility completes the deferred resume once');
// This stub counts scheduling; the production reconciliation function owns its six-second cooldown.
assert.equal(full,0);

tab='devices';context.dashboardWasHidden=true;api.resumeDashboard();
assert.equal(reconciled,2,'a return on another tab defers Home reconciliation');
assert.equal(context.dashboardResumeReconcilePending,true);
tab='home';api.flushResumeReconcile();assert.equal(reconciled,3,'Home reconciles when selected');

now=301001;context.dashboardWasHidden=true;api.resumeDashboard();
assert.equal(full,1,'expired snapshot requires one full reload');
now=2000;context.dashboardWasHidden=true;context.dashboardCollectionsDirty=true;api.resumeDashboard();
assert.equal(full,2,'true native recovery still forces a full reload');
context.dashboardCollectionsDirty=false;context.dashboardWasHidden=true;context.snapshotScopeDid='studio-B';api.resumeDashboard();
assert.equal(full,3,'Studio identity change cannot reuse the previous snapshot');
context.snapshotScopeDid='studio-A';context.dashboardWasHidden=true;offline=true;api.resumeDashboard();
assert.equal(full,3,'offline return does not start a failing full reload');
assert.equal(context.dashboardResumeOfflinePending,true);
const ackSource=source.slice(source.indexOf('  function scheduleDashboardAckReconcile('),source.indexOf('  function shouldRefreshOnResume('));
let ackTimer,readIds=[];
const ackContext={initialLoadSettled:true,currentSnapshot:{isCached:false,devices:Array.from({length:30},(_,i)=>({id:`device-${i}`}))},
  snapshotScopeDid:'studio-A',dashboardDataDid:'studio-A',lastDashboardAckRead:0,dashboardAckTimer:null,
  dashboardPageVisible:true,document:{hidden:false},busy:false,Date:{now:()=>10000},
  mountedDeviceCards:new Map([['mounted',{}]]),favoriteDevices:{visibleDeviceIds:()=>['favorite']},
  global:{StudioTabs:{active:()=> 'home'},setTimeout:callback=>{ackTimer=callback;return 1;},clearTimeout(){},StudioRuntime:{reconcileDashboardTraits:async ids=>{readIds=ids;return {deviceIds:[],overview:null};}}}};
const scheduleAck=vm.runInNewContext(`${ackSource}\nscheduleDashboardAckReconcile`,ackContext);
scheduleAck();await ackTimer();
assert.equal(readIds[0],'favorite','visible favorite controls receive first bounded reconciliation');
assert.equal(readIds[1],'mounted','mounted space cards remain in the reconciliation set');
assert.equal(readIds.length,24,'foreground reconciliation keeps its existing 24-device cap');
console.log('FOREGROUND RESUME PASS: brief/duplicate/tab-deferred/expired/recovery/scope/offline');
