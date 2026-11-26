(function startDashboard(global, document) {
  'use strict';

  const config = global.__LIFE_STUDIO_DASHBOARD_CONFIG__ || {};
  const allowSpaceDeviceDetails = typeof config.enableSpaceDeviceDetails === 'boolean' ? config.enableSpaceDeviceDetails : !config.role || config.role === 'male';
  const moduleEnabled=id=>!Array.isArray(config.homeModules)||config.homeModules.includes(id);const spaceEnabled=moduleEnabled('spaceControl') || moduleEnabled('overview') && config.overviewCategories!==false;const idleModule={update(){},availability(){},language(){},openDetail(){},busy:()=>false};
  const favoriteDeviceMode = config.homeDeviceMode === 'favorites';
  const t = (key, values) => global.LifeI18n.t(key, values);
  const ft = (key, form) => global.LifeI18n.functionText(key, {form:form});
  const controlText = (control, device, form) => global.LifeI18n.controlText(control, device.category, form);
  const powerText = (device, control) => ['onoff','power','powerswitch'].includes(normalizedTraitCode(control.traitCode)) ? ft((device.category==='light'?'light':device.category==='climate'?'climate':'device')+(control.value?'.off':'.on'),'full') : (control.value?t('off'):t('on'))+' '+(control.label || control.traitCode || '');
  const $ = (selector) => document.querySelector(selector);
  const elements = {
    app: $('#app'), topbar: $('#topbar'), title: $('#dashboard-title'), banner: $('#connection-banner'), connectionText: $('#connection-text'), mine: $('#mine-button'), retry: $('#retry-button'),
    summaryLabel: $('#summary-label'), summaryGrid: $('#summary-grid'), summaryHeading: $('#summary-heading'), summaryDetail: $('#summary-detail'), onlineCount: $('#online-count'), onlineLabel: $('#online-label'), spaceCount: $('#space-count'), spaceLabel: $('#space-label'), sceneCount: $('#scene-count'), sceneLabel: $('#scene-label'), temperatureValue: $('#temperature-value'), temperatureLabel: $('#temperature-label'), humidityValue: $('#humidity-value'), humidityLabel: $('#humidity-label'), presenceValue: $('#presence-value'), presenceLabel: $('#presence-label'), overviewCoverage: $('#overview-coverage'), updatedAt: $('#updated-at'),
    notice: $('#notice'), noticeText: $('#notice-text'), sceneGrid: $('#scene-grid'), sceneSection: $('#scene-section'), sceneEyebrow: $('#scene-eyebrow'), sceneHeading: $('#scene-heading'), sceneNote: $('#scene-note'),
    deviceGrid: $('#device-grid'), deviceSection: $('#device-section'), deviceEyebrow: $('#device-eyebrow'), deviceHeading: $('#device-heading'), deviceNote: $('#device-note'), filters: $('#device-filters'), loadMore: $('#load-more-button'),
    fatalState: $('#fatal-state'), fatalHeading: $('#fatal-heading'), fatalMessage: $('#fatal-message'), toast: $('#toast'), pull: $('#pull-indicator'), pullText: $('#pull-text'),
    aiSection: $('#ai-assistant-section'), aiButton: $('#ai-assistant-button'), aiTitle: $('#ai-assistant-title'), aiIconPath: $('.ai-assistant-icon path'), aiSuggestions: $('#ai-assistant-suggestions'),
  };
  let studioHeaderStatus = null; let disposeStudioStatus = null; let disposeAiAgentStatus = null; let aiAgentEnabled = false; let disposeDashboardData = null; let dashboardDataDid = '';
  let dashboardDataTimer = null; let dashboardCollectionsDirty = false; let dashboardTraitItems = []; let dashboardPageVisible = true;
  let dashboardWasHidden = false, dashboardResumeReconcilePending = false, dashboardResumeOfflinePending = false;
  const dashboardCollectionTargets = new Set(); const dashboardCollectionResults = new Map(); let dashboardCollectionFlight = false; let dashboardRefreshSerial = 0; let dashboardAckTimer = null; let lastDashboardAckRead = 0;
  let currentSnapshot = null; let busy = false; let loadMoreBusy = false; let toastTimer = null; let activeSpace = '*';
  const pendingControls = new Set(); const controlOperations = new Map(); const confirmedControlValues = new Map(); const pendingScenes = new Set();
  let layoutRevision = 0; let activeGridHeightKey = ''; let transitionGridHeight = 0; const stableDeviceGridHeights = new Map();
  let overviewScheduleRevision = 0;
  const mountedDeviceCards = new Map();
  const mountedDeviceSignatures = new Map();
  const automaticRoleCollections=['senior','child'].includes(config.role);
  const favoriteKeys=automaticRoleCollections?[]:[...(moduleEnabled('favoriteScenes')?['favoriteScenes']:[]),...(favoriteDeviceMode && moduleEnabled('devices')?['favoriteDevices']:[])];
  const favoriteMetadata=global.FavoriteMetadata.create({keys:favoriteKeys,query:keys=>global.StudioRuntime.queryFavoriteMetadata(keys),update:metadata=>global.StudioRuntime.updateFavoriteMetadata(metadata)});
  const favorites = moduleEnabled('favoriteScenes') ? global.FavoriteScenes.create({ grid:elements.sceneGrid, edit:$('#scene-edit'), app:elements.app, translate:t, notify:showToast,
    role:config.role,automatic:automaticRoleCollections,defaultSelection:config.favoriteSceneDefaults===true,defaultSceneIds:config.defaultFavoriteSceneIds,metadata:favoriteMetadata,config, canEdit:()=>!busy && !isCachedSnapshot(), canExecute:()=>config.enableSceneExecution===true && !isCachedSnapshot(), isBusy:()=>busy,
    load:()=>global.StudioRuntime.listScenes(), execute:scene=>{requirePhoneNetwork();return global.StudioRuntime.executeScene(scene);}, pending:(key,value)=>value?pendingScenes.add(key):pendingScenes.delete(key) }) : idleModule;
  const bulkControlOwners = new Map();
  const spaceControl = spaceEnabled ? global.SpaceControl.create({section:$('#space-control-section'),list:$('#space-control-list'),tabs:$('#space-control-tabs'),overview:$('#space-overview-links'),app:elements.app,translate:t,notify:showToast,
    getIndex:()=>global.StudioRuntime.spaceControlIndex(),loadAll:()=>global.StudioRuntime.completeSpaceControlIndex({onProgress:event=>{if(currentSnapshot && event.value && event.value.status!=='loading'){currentSnapshot={...currentSnapshot,overview:event.value};renderSummary(currentSnapshot);}}}),canWrite:()=>config.enableDeviceWrites===true && global.StudioRuntime.spaceControlIndex().complete && !busy && !isCachedSnapshot() && pendingControls.size===0 && pendingScenes.size===0 && (!favoriteDevices || !favoriteDevices.busy()),
    execute:items=>{requirePhoneNetwork();return global.StudioRuntime.executeSpaceControls(items);},pending:(items,value,task)=>items.forEach(item=>{const key=controlKey(item.deviceId,item.controlId);const device=currentSnapshot && currentSnapshot.devices.find(d=>d.id===item.deviceId),control=device && (device.controls || []).find(c=>c.id===item.controlId);if(value){bulkControlOwners.set(key,task);pendingControls.add(key);controlOperations.set(key,(controlOperations.get(key)||0)+1);}else{if(bulkControlOwners.get(key)!==task)return;bulkControlOwners.delete(key);if(task.revision!==global.StudioRuntime.spaceControlIndex().revision)return;pendingControls.delete(key);}if(device && control)setDeviceControlPending(device,control,value);}),
    changed:(items,task)=>{if(task.revision!==global.StudioRuntime.spaceControlIndex().revision)return;items.forEach(item=>{const device=currentSnapshot && currentSnapshot.devices.find(d=>d.id===item.deviceId),control=device && (device.controls || []).find(c=>c.id===item.controlId);if(device && control){confirmedControlValues.delete(controlKey(device.id,control.id));updateDeviceCardState(device,control);}});}
  }) : idleModule;
  const favoriteDevices = favoriteDeviceMode && moduleEnabled('devices') ? global.FavoriteDevices.create({
    grid:$('#favorite-devices-grid'),edit:$('#favorite-devices-edit'),heading:$('#favorite-devices-heading'),app:elements.app,translate:t,notify:showToast,
    metadata:favoriteMetadata,config,automatic:automaticRoleCollections,
    getIndex:()=>global.StudioRuntime.favoriteDeviceIndex(),resolve:choices=>global.StudioRuntime.resolveFavoriteDevices(choices),reconcile:(choices,isCurrent)=>global.StudioRuntime.refreshFavoriteDevices(choices,{isCurrent}),load:isCurrent=>global.StudioRuntime.loadFavoriteDeviceIndex({isCurrent,onProgress:event=>{if(currentSnapshot){currentSnapshot={...currentSnapshot,overview:event.value};renderSummary(currentSnapshot);}}}),execute:(item,id,value)=>{requirePhoneNetwork();return global.StudioRuntime.executeFavoriteDevice(item,id,value);},
    canEdit:()=>Boolean(currentSnapshot) && !busy && !isCachedSnapshot(),canWrite:()=>Boolean(currentSnapshot) && config.enableDeviceWrites===true && !busy && !isCachedSnapshot() && !spaceControl.busy() && pendingControls.size===0 && pendingScenes.size===0,
    openPlugin:item=>global.StudioTabsRuntime.openDevice({deviceId:item.deviceId,deviceName:item.deviceName || item.name}),changed:()=>{if(currentSnapshot)renderSummary(currentSnapshot);}
  }) : null;
  document.documentElement.dataset.homeDeviceMode=favoriteDeviceMode?'favorites':'space';
  elements.deviceSection.hidden=favoriteDeviceMode;$('#favorite-devices-section').hidden=!favoriteDeviceMode;
  let capabilitySheet = null; let capabilitySheetCloseTimer = null; let capabilitySheetScrollY = 0;
  let capabilitySheetBodyStyles = null;

  const requestedStyle = ['aqara', 'apple', 'ha', 'custom'].includes(config.style) ? config.style : 'aqara';
  document.documentElement.dataset.style = requestedStyle;
  document.documentElement.dataset.uiProfile = 'aqara';

  function valueOr(value, fallback) { return value === null || value === undefined ? fallback : value; }
  function clearChildren(target) { while (target.firstChild) target.removeChild(target.firstChild); }
  function isCachedSnapshot() { return Boolean(currentSnapshot && currentSnapshot.isCached); }
  function phoneOffline() { return Boolean(global.LifePhoneNetwork && global.LifePhoneNetwork.isOffline()); }
  function requirePhoneNetwork() { if (phoneOffline()) throw new Error(global.LifePhoneNetwork.errorText()); }
  function hasMoreDevices() { return Boolean(currentSnapshot && currentSnapshot.hasMoreDevices); }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
    const themeMeta = $('meta[name="theme-color"]'); if (themeMeta) themeMeta.setAttribute('content', global.getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() || (theme === 'dark' ? '#15161a' : '#f3f4f8'));
  }

  function icon(kind) {
    const paths = {
      scene: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M18.4 5.6l-2.2 2.2M7.8 16.2l-2.2 2.2"/><circle cx="12" cy="12" r="4"/>',
      light: '<path d="M9 18h6M10 22h4M8.5 14.5A6 6 0 1 1 15.5 14.5C14.6 15.2 14 16 14 17h-4c0-1-.6-1.8-1.5-2.5Z"/>',
      outlet: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 9v3M15 9v3M9 17h6"/>',
      climate: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z"/><path d="M12 9v7"/>',
      curtain: '<path d="M5 4h14M7 5v15M17 5v15M7 17c2-1 3-4 3-7M17 17c-2-1-3-4-3-7"/>',
      lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
      camera: '<rect x="3" y="6" width="18" height="13" rx="3"/><circle cx="12" cy="12.5" r="3.5"/><path d="M7 6 8.5 3h7L17 6"/>',
      sensor: '<path d="M4 18a10 10 0 0 1 16 0M7 15a6 6 0 0 1 10 0M10 12a2 2 0 0 1 4 0"/><circle cx="12" cy="19" r="1"/>',
      safety: '<path d="M12 3 3 7v5c0 5 3.8 8 9 9 5.2-1 9-4 9-9V7l-9-4Z"/><path d="M12 8v5M12 16v.2"/>',
      vacuum: '<circle cx="12" cy="12" r="8"/><path d="M8 16c2 1 6 1 8 0M9 8h6"/>',
      media: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3V9Z"/>',
      hub: '<rect x="5" y="3" width="14" height="18" rx="4"/><circle cx="12" cy="16" r="1"/><path d="M9 8c2-2 4-2 6 0"/>',
      device: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 7h6M9 17h6"/>',
      command: '<path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"/>',
      power: '<path d="M12 3v8"/><path d="M7.1 6.5a7 7 0 1 0 9.8 0"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[kind] || paths.device}</svg>`;
  }

  function renderStudioHeader() {
    const status = studioHeaderStatus, kind = status && status.connectStatus || 'unknown';
    if(global.LifePhoneNetwork && global.LifePhoneNetwork.setStudioUnavailable)global.LifePhoneNetwork.setStudioUnavailable(kind === 'error' && status.errorCode === 60102);
    favoriteMetadata.setScope(status && status.studioDid || '',(global.LifeBridge.nativeContext() || {}).userId);
    if(status && status.studioDid && !phoneOffline() && !favoriteMetadata.get().loaded && !favoriteMetadata.get().error)void favoriteMetadata.load().catch(()=>{});
    if(status && global.StudioRuntime.setCollectionScope)global.StudioRuntime.setCollectionScope(status.studioDid,(global.LifeBridge.nativeContext() || {}).userId);
    elements.title.textContent = status && status.studioName || t('currentStudio'); document.title = elements.title.textContent;
    elements.banner.dataset.connectStatus = kind;
    elements.banner.classList.toggle('is-connected', kind === 'local' || kind === 'cloud');
    elements.banner.classList.toggle('is-error', kind === 'error');
    if (status && Number.isInteger(status.errorCode)) elements.banner.dataset.errorCode = String(status.errorCode); else delete elements.banner.dataset.errorCode;
    elements.connectionText.textContent = phoneOffline() ? global.LifePhoneNetwork.unavailableText() : !status ? t('studioStatusLoading') : kind === 'local' ? t('studioLocal') : kind === 'cloud' ? t('studioCloud') : kind === 'error' ? t(status.errorCode === 60101 ? 'studioCertificateError' : 'studioUnavailable') : t('studioStatusUnknown');
    elements.title.title = elements.title.textContent;
    if(favoriteDevices){favoriteDevices.update(global.StudioRuntime.favoriteDeviceIndex());if(!phoneOffline() && currentSnapshot && !currentSnapshot.isCached)void favoriteDevices.prepare().catch(()=>{});}
  }
  function startStudioStatus() {
    if (disposeStudioStatus) disposeStudioStatus();
    studioHeaderStatus = null; renderStudioHeader();
    const host = global.LifeBridge;
    if (!host || typeof host.subscribeStudioConnectStatus !== 'function') { studioHeaderStatus = { connectStatus: 'unknown' }; renderStudioHeader(); return; }
    disposeStudioStatus = host.subscribeStudioConnectStatus(status => {
      const previousDid=dashboardDataDid;
      studioHeaderStatus = status; renderStudioHeader();
      if(status && status.studioDid && !currentSnapshot){const cached=global.StudioRuntime.loadCached();if(cached)renderSnapshot(cached);}
      bindDashboardData(status && status.studioDid || '');
      if(previousDid && previousDid!==dashboardDataDid)queueDashboardCollectionRefresh();
    });
  }
  function setAiAgentEnabled(enabled) {
    aiAgentEnabled = enabled === true;
    const hidden = !moduleEnabled('aiAssistant') || !aiAgentEnabled;
    const order = Array.isArray(config.homeModuleOrder) ? config.homeModuleOrder : [];
    const homePanel = elements.aiSection.parentElement;
    const leading = order[0] === 'aiAssistant'
      ? (hidden ? order.find(id => id !== 'aiAssistant' && moduleEnabled(id)) || 'aiAssistant' : 'aiAssistant')
      : null;
    if (elements.aiSection.hidden === hidden && (!leading || homePanel.dataset.homeLeadingModule === leading)) return;
    const anchor = captureViewportAnchor();
    if (leading) homePanel.dataset.homeLeadingModule = leading;
    elements.aiSection.hidden = hidden;
    if (!hidden) renderAIAssistant(currentSnapshot);
    restoreLayoutAnchor(anchor);
  }
  function startAiAgentStatus() {
    if (disposeAiAgentStatus) disposeAiAgentStatus();
    disposeAiAgentStatus = null;
    setAiAgentEnabled(false);
    if (!moduleEnabled('aiAssistant')) return;
    const host = global.LifeBridge;
    if (host && typeof host.subscribeUserAIAgentStatus === 'function') {
      disposeAiAgentStatus = host.subscribeUserAIAgentStatus(setAiAgentEnabled);
    }
  }
  function bindDashboardData(studioDid) {
    if(studioDid===dashboardDataDid)return;
    const firstIdentity=!dashboardDataDid;
    dashboardRefreshSerial++;
    nativeCollectionGate.reset();
    if(dashboardDataDid)initialLoadSettled=false;
    if(dashboardAckTimer){global.clearTimeout(dashboardAckTimer);dashboardAckTimer=null;}
    dashboardCollectionTargets.clear();dashboardCollectionResults.clear();lastDashboardAckRead=0;
    dashboardWatchPoints.clear();
    snapshotScopeDid='';
    if(disposeDashboardData)disposeDashboardData();disposeDashboardData=null;
    dashboardDataDid=studioDid;dashboardCollectionsDirty=false;dashboardTraitItems=[];
    // The native identity can arrive after the initial HTTP load has settled.
    if(firstIdentity && studioDid && initialLoadSettled && currentSnapshot && !currentSnapshot.isCached)snapshotScopeDid=studioDid;
    if(!studioDid || !global.LifeBridge || typeof global.LifeBridge.subscribeDataChanges!=='function')return;
    if(!initialLoadSettled)nativeCollectionGate.hold();
    const initialWatches=global.StudioRuntime.dashboardWatchedTraits();
    initialWatches.forEach(point=>dashboardWatchPoints.set(JSON.stringify(point),point));
    disposeDashboardData=global.LifeBridge.subscribeDataChanges(change=>{
      if(change.studioDid!==dashboardDataDid)return;
      if(change.kind==='collections'){
        if(change.reason==='subscriptionAck')scheduleDashboardAckReconcile();
        else if(change.reason==='object' && change.collection){dashboardCollectionTargets.add(change.collection);scheduleDashboardData();}
        else nativeCollectionGate.push();
      }
      else if(change.kind==='device' && change.items.length){dashboardTraitItems.push(...change.items);dashboardTraitItems=dashboardTraitItems.slice(-500);scheduleDashboardData();}
    },{studioDid,watchedTraits:initialWatches});
  }
  // A full load temporarily clears the overview catalog. Keep already watched
  // coordinates for this Studio document so the native subscription cannot
  // oscillate between a partial and complete set after its own resync ACK.
  const dashboardWatchPoints = new Map();
  function syncDashboardDataWatches(){
    if(!disposeDashboardData || typeof disposeDashboardData.updateWatchedTraits!=='function')return;
    const next=global.StudioRuntime.dashboardWatchedTraits();
    if(!next.length)return;
    const merged=new Map(dashboardWatchPoints);
    for(const point of next){
      const key=JSON.stringify(point);
      if(!merged.has(key))merged.set(key,point);
    }
    if(merged.size>4096 || merged.size===dashboardWatchPoints.size)return;
    dashboardWatchPoints.clear();
    merged.forEach((point,key)=>dashboardWatchPoints.set(key,point));
    disposeDashboardData.updateWatchedTraits([...dashboardWatchPoints.values()]);
  }
  // Native push recovery and object events can arrive continuously. One burst gets
  // one immediate refresh and, after it becomes quiet, at most one final refresh.
  function createCollectionEventGate(onRefresh, timers, quietMs = 1800) {
    let active = false, pending = false, held = false, quietTimer = null, quiet = false;
    return {
      hold() { held = true; },
      release() {
        held = false;
        if(quiet && pending){pending=false;active=false;quiet=false;onRefresh();}
      },
      push() {
        if (!active) { active = true; if(held)pending=true;else onRefresh(); }
        else pending = true;
        if (quietTimer !== null) timers.clearTimeout(quietTimer);
        quiet=false;
        quietTimer = timers.setTimeout(() => {
          quietTimer = null; quiet=true;
          if(held)return;
          active = false; quiet=false;
          if (pending) { pending = false; onRefresh(); }
        }, quietMs);
      },
      reset() {
        if (quietTimer !== null) timers.clearTimeout(quietTimer);
        quietTimer = null; active = false; pending = false; held=false;quiet=false;
      }
    };
  }
  const nativeCollectionGate = createCollectionEventGate(() => queueDashboardCollectionRefresh(), global);
  let initialLoadSettled=false;
  let snapshotScopeDid='';
  function applyDashboardCollection(target,value){
    if(!currentSnapshot)return;
    currentSnapshot={...currentSnapshot,[target]:value,...(target==='scenes'?{sceneCatalogStatus:'ready'}:{})};
    renderSummary(currentSnapshot);
    renderScenes(currentSnapshot.scenes);
    if(target==='spaces'){renderFilters(currentSnapshot.devices);renderDevices();}
  }
  function scheduleDashboardAckReconcile(){
    // Initial HTTP and definition reads already supply the startup snapshot.
    if(!initialLoadSettled || !currentSnapshot || currentSnapshot.isCached || snapshotScopeDid!==dashboardDataDid || Date.now()-lastDashboardAckRead<6000)return;
    if(global.StudioTabs && global.StudioTabs.active()!=='home')return;
    if(dashboardAckTimer)global.clearTimeout(dashboardAckTimer);
    dashboardAckTimer=global.setTimeout(async()=>{
      dashboardAckTimer=null;
      if(!dashboardPageVisible || document.hidden || busy || !currentSnapshot || currentSnapshot.isCached)return;
      if(global.StudioTabs && global.StudioTabs.active()!=='home')return;
      const scope=dashboardDataDid;lastDashboardAckRead=Date.now();
      const favoriteIds=favoriteDevices && favoriteDevices.visibleDeviceIds ? favoriteDevices.visibleDeviceIds() : [];
      const ids=[...new Set([...favoriteIds,...mountedDeviceCards.keys(),...currentSnapshot.devices.map(item=>String(item.id))])].slice(0,24);
      try{
        const result=await global.StudioRuntime.reconcileDashboardTraits(ids);
        if(scope!==dashboardDataDid || !currentSnapshot || currentSnapshot.isCached || !result.deviceIds.length)return;
        currentSnapshot.overview=result.overview;
        for(const id of result.deviceIds){const device=currentSnapshot.devices.find(item=>item.id===id);if(device)for(const control of device.controls || [])updateDeviceCardState(device,control);}
        renderSummary(currentSnapshot);
      }catch(_){/* Keep the last confirmed snapshot; explicit refresh remains available. */}
    },700);
  }
  function shouldRefreshOnResume(snapshot, now){
    const maxAge=Math.max(30,Number(config.cacheTtlSeconds)||300)*1000;
    return dashboardCollectionsDirty || !snapshot || snapshot.isCached || !snapshotScopeDid || snapshotScopeDid!==dashboardDataDid || !Number.isFinite(snapshot.connectedAt) || now-snapshot.connectedAt>=maxAge;
  }
  function flushResumeReconcile(){
    if(!dashboardResumeReconcilePending || busy || document.hidden || !dashboardPageVisible || global.StudioTabs && global.StudioTabs.active()!=='home')return;
    dashboardResumeReconcilePending=false;
    scheduleDashboardAckReconcile();
  }
  function queueDashboardCollectionRefresh(){dashboardCollectionsDirty=true;scheduleDashboardData();}
  function scheduleDashboardData(){
    if(dashboardDataTimer || !dashboardDataDid)return;
    dashboardDataTimer=global.setTimeout(()=>{
      dashboardDataTimer=null;
      if(!dashboardDataDid || document.hidden || !dashboardPageVisible)return;
      if(global.StudioTabs && global.StudioTabs.active()!=='home'){
        // Keep bounded Trait pushes and scoped object changes for the next Home
        // activation. Only a real recovery/legacy event invalidates the page.
        if(dashboardCollectionsDirty){
          if(global.StudioTabs.markHomeDirty)global.StudioTabs.markHomeDirty();
          dashboardCollectionsDirty=false;dashboardCollectionTargets.clear();dashboardTraitItems=[];
        }
        return;
      }
      if(busy || dashboardCollectionFlight || pendingControls.size || pendingScenes.size || spaceControl.busy() || favoriteDevices && favoriteDevices.busy()){
        if(!busy)scheduleDashboardData();return;
      }
      if(dashboardCollectionsDirty){dashboardCollectionsDirty=false;dashboardTraitItems=[];void refresh({quiet:true});return;}
      if(dashboardCollectionResults.size){
        for(const [target,value] of dashboardCollectionResults)if(!dashboardCollectionTargets.has(target))applyDashboardCollection(target,value);
        dashboardCollectionResults.clear();
      }
      if(dashboardCollectionTargets.size){
        const targets=[...dashboardCollectionTargets];dashboardCollectionTargets.clear();dashboardCollectionFlight=true;
        const scope=dashboardDataDid,serial=dashboardRefreshSerial;
        void (async()=>{for(const target of targets){
          try{const value=await global.StudioRuntime.refreshDashboardCollection(target);if(!value || scope!==dashboardDataDid || serial!==dashboardRefreshSerial || !currentSnapshot)continue;
            if(document.hidden || !dashboardPageVisible || global.StudioTabs && global.StudioTabs.active()!=='home')dashboardCollectionResults.set(target,value);
            else applyDashboardCollection(target,value);
          }catch(_){queueDashboardCollectionRefresh();break;}
        }})().finally(()=>{dashboardCollectionFlight=false;if(dashboardCollectionsDirty || dashboardCollectionTargets.size || dashboardCollectionResults.size || dashboardTraitItems.length)scheduleDashboardData();});
        return;
      }
      if(!dashboardTraitItems.length || !currentSnapshot || currentSnapshot.isCached){dashboardTraitItems=[];return;}
      const items=dashboardTraitItems.splice(0);
      const cameraOnline=new Map(currentSnapshot.devices.filter(device=>device.category==='camera').map(device=>[device.id,device.online]));
      const result=global.StudioRuntime.applyPushedTraitValues(items);
      if(!result.deviceIds.length)return;
      currentSnapshot.overview=result.overview;
      for(const id of result.deviceIds){const device=currentSnapshot.devices.find(item=>item.id===id);if(device){updateDeviceCardState(device,null);for(const control of device.controls || []){updateDeviceCardState(device,control);setDeviceControlPending(device,control,pendingControls.has(controlKey(device.id,control.id)));}}}
      if(items.some(item=>item.endpointId===0 && item.traitCode==='Reachable' && cameraOnline.has(item.deviceId) && currentSnapshot.devices.some(device=>device.id===item.deviceId && device.online!==cameraOnline.get(item.deviceId))))renderDevices(captureViewportAnchor());
      renderSummary(currentSnapshot);
    },250);
  }
  function setBusy(value) { busy = value; elements.app.setAttribute('aria-busy', String(value)); favorites.availability(); if(favoriteDevices)favoriteDevices.availability(); elements.loadMore.disabled = value || loadMoreBusy || isCachedSnapshot() || !hasMoreDevices(); document.querySelectorAll('[data-write-action="scene"]').forEach((control) => { control.disabled = value || control.dataset.allowed !== 'true'; }); }
  function showToast(message) { clearTimeout(toastTimer); elements.toast.textContent = phoneOffline() ? global.LifePhoneNetwork.errorText() : message; elements.toast.hidden = false; toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 2800); }
  function deviceCard(deviceId) { return mountedDeviceCards.get(String(deviceId)) || null; }
  function controlTargets(deviceId, controlId) {
    const roots = [deviceCard(deviceId)];
    if (capabilitySheet && capabilitySheet.deviceId === String(deviceId)) roots.push(capabilitySheet.body);
    return [...new Set(roots.filter(Boolean).flatMap((root) => [...root.querySelectorAll('[data-control-id]')].filter((item) => item.dataset.controlId === String(controlId))))];
  }
  function controlKey(deviceId, controlId) { return `${deviceId}:${controlId}`; }
  function initializeConfirmedValues(devices) { devices.forEach((device) => (device.controls || []).forEach((control) => { const key = controlKey(device.id, control.id); if (!confirmedControlValues.has(key)) confirmedControlValues.set(key, control.value); })); }
  function disableMountedWrites() { document.querySelectorAll('[data-write-action]').forEach((control) => { if(control.dataset.writeAction !== 'scene')control.dataset.allowed = 'false'; control.disabled = true; }); }
  function captureLayoutAnchor(kind = 'scroll', value) {
    const target = kind === 'filters' ? elements.filters : kind === 'device' ? deviceCard(value) : null;
    return { kind, value: value === undefined ? null : String(value), viewportTop: target ? target.getBoundingClientRect().top : null, scrollY: global.scrollY };
  }
  function captureViewportAnchor() {
    // At the document start, preserve the page origin rather than a lower section.
    if (global.scrollY <= 1) return captureLayoutAnchor();
    const headerBottom = elements.topbar.getBoundingClientRect().bottom; const cards = [...elements.deviceGrid.querySelectorAll('.device-card')];
    const visibleCard = cards.find((card) => { const rect = card.getBoundingClientRect(); return rect.bottom > headerBottom + 8 && rect.top < global.innerHeight; });
    if (visibleCard) return captureLayoutAnchor('device', visibleCard.dataset.deviceId);
    const filterRect = elements.filters.getBoundingClientRect(); if (filterRect.bottom > headerBottom && filterRect.top < global.innerHeight) return captureLayoutAnchor('filters');
    return captureLayoutAnchor();
  }
  function restoreLayoutAnchor(anchor, revision = layoutRevision) {
    if (!anchor) return;
    const align = () => {
      if (revision !== layoutRevision || (global.StudioTabs && global.StudioTabs.active() !== 'home')) return;
      const target = anchor.kind === 'filters' ? elements.filters : anchor.kind === 'device' ? deviceCard(anchor.value) : null;
      const delta = target && Number.isFinite(anchor.viewportTop) ? target.getBoundingClientRect().top - anchor.viewportTop : Number(anchor.scrollY) - global.scrollY;
      if (Number.isFinite(delta) && Math.abs(delta) > 0.5) global.scrollBy(0, delta);
    };
    align(); global.requestAnimationFrame(() => { align(); global.requestAnimationFrame(align); });
  }
  function activateDeviceGridHeight() {
    const columns = Math.max(1, global.getComputedStyle(elements.deviceGrid).gridTemplateColumns.split(' ').filter(Boolean).length); const key = `${columns}:${elements.deviceGrid.clientWidth}:${activeSpace}:${filteredDevices().length}:${global.LifeI18n.getLocale()}`;
    activeGridHeightKey = key;
    const temporaryHeight = Math.max(stableDeviceGridHeights.get(key) || 0, transitionGridHeight);
    if (temporaryHeight > 0) elements.deviceGrid.style.minHeight = `${temporaryHeight}px`; else elements.deviceGrid.style.removeProperty('min-height');
    return key;
  }
  function deviceGridContentHeight() {
    const grid = elements.deviceGrid.getBoundingClientRect();
    return Math.max(0, ...[...elements.deviceGrid.children].map((card) => Math.ceil(card.getBoundingClientRect().bottom - grid.top)));
  }
  function lockDeviceGridHeight() {
    const key = activateDeviceGridHeight(); const height = deviceGridContentHeight();
    stableDeviceGridHeights.delete(key); stableDeviceGridHeights.set(key, height);
    if (stableDeviceGridHeights.size > 32) stableDeviceGridHeights.delete(stableDeviceGridHeights.keys().next().value);
    elements.deviceGrid.style.minHeight = `${Math.max(height, transitionGridHeight)}px`;
    return key;
  }
  function releaseDeviceGridHeight(anchor, revision, key) {
    global.requestAnimationFrame(() => global.requestAnimationFrame(() => {
      if (revision !== layoutRevision || key !== activeGridHeightKey) return;
      transitionGridHeight = 0; elements.deviceGrid.style.removeProperty('min-height'); restoreLayoutAnchor(anchor, revision);
    }));
  }
  function loadingCards(target, count) { clearChildren(target); for (let i = 0; i < count; i += 1) { const card = document.createElement('div'); card.className = 'loading-card'; card.setAttribute('aria-hidden', 'true'); target.append(card); } }
  function emptyCard(message) { const card = document.createElement('div'); card.className = 'empty-card'; card.textContent = message; return card; }
  function localTime(value) { return new Date(value).toLocaleTimeString(global.LifeI18n.getLocale() === 'en' ? 'en' : global.LifeI18n.getLocale(), { hour: '2-digit', minute: '2-digit' }); }

  function renderStaticLanguage() {
    renderStudioHeader();
    if($('#overview-details-label'))$('#overview-details-label').textContent=t('overviewDetails');
    elements.summaryLabel.textContent = config.homeSpaceRequired || config.homeSpaceId ? (global.StudioRuntime.getHomeSpace()?((currentSnapshot && currentSnapshot.spaces || []).find(s=>s.id===global.StudioRuntime.getHomeSpace()) || {}).name || global.LifeI18n.overviewTitle():t('chooseHomeSpace')) : global.LifeI18n.overviewTitle(); elements.onlineLabel.textContent = t('onlineDevices'); elements.spaceLabel.textContent = t('spaces'); elements.sceneLabel.textContent = t('scenes'); elements.temperatureLabel.textContent = t('indoorTemperature'); elements.humidityLabel.textContent = t('indoorHumidity'); elements.presenceLabel.textContent = t('occupiedSpaces'); elements.summaryGrid.setAttribute('aria-label', global.LifeI18n.overviewTitle());
    $('#space-control-heading').textContent=t('spaceControl'); elements.sceneEyebrow.textContent = t('quickActions'); elements.sceneHeading.textContent = t('favoriteTitle'); elements.sceneNote.textContent = t('sceneNote');
    elements.deviceEyebrow.textContent = t('smartDevices'); elements.deviceHeading.textContent = t('deviceTitle'); elements.retry.textContent = t('retry'); elements.loadMore.textContent = t('loadMore', { shown: 0, total: 0 });
    elements.mine.setAttribute('aria-label', t('openMine')); elements.mine.title = t('mine');
    const aiCopy=global.LifeI18n.aiPresentation(config.role);
    elements.aiSection.setAttribute('aria-label', t('aiAssistant')); elements.aiTitle.textContent=aiCopy.title;elements.aiButton.setAttribute('aria-label',aiCopy.openLabel);elements.aiIconPath.setAttribute('d',aiCopy.iconPath);
    renderAIAssistant(currentSnapshot);
    elements.fatalHeading.textContent = t('fatalTitle'); elements.pullText.textContent = t('pull');
  }

  function renderScenes(scenes) {
    favorites.update({ scenes, catalogReady:currentSnapshot && currentSnapshot.sceneCatalogStatus==='ready',catalogError:currentSnapshot && currentSnapshot.sceneCatalogStatus==='error', spaces:currentSnapshot && currentSnapshot.spaces || [], cached:isCachedSnapshot() });
  }

  function childRoomPlan(){if(!config.roleRecommendations || config.role!=='child' || config.homeSpaceRequired || config.homeSpaceId)return null;const spaces=currentSnapshot && currentSnapshot.spaces || [],pref=global.FavoriteDevices.roomPreference(config,favoriteMetadata.get().scope,spaces);return global.FavoriteDevices.roleRooms(spaces,'child',pref.value);}
  function childDeviceKind(device) {
    const types=[...(device.types || []),...(device.favoriteEndpointMeta || []).map(item=>item.deviceType)].join(' ').toLowerCase();
    if(/camera|doorbell|lock|alarm|smoke|gas|leak|contact|outlet|plug|socket|switch|speaker|media|television|hub|gateway/.test(types))return '';
    if(device.category==='light'&&/light|lamp|bulb|dimmer|照明|灯/.test(types))return 'light';
    if(device.category==='curtain'&&/curtain|blind|shade|windowcovering|cover|窗帘|卷帘/.test(types))return 'curtain';
    if(device.category==='climate'&&/thermostat|aircondition|climate|heater|fan|purifier|hvac|温控|空调|风扇|净化/.test(types))return 'climate';
    if(device.category==='sensor'&&(device.readings || []).some(item=>/^(temperature|currenttemperature|relativehumidity|humidity|currenthumidity|occupancy|occupancysensed|presencedetected|humanpresence|presence)$/i.test(String(item.traitCode || ''))))return 'sensor';
    if(device.category==='sensor'&&device.assistantCapabilities && device.assistantCapabilities.presence===true)return 'sensor';
    return '';
  }
  function filteredDevices() {
    const devices=currentSnapshot && currentSnapshot.devices || [],plan=childRoomPlan();
    if(!plan)return devices.filter(item=>activeSpace==='*'||item.spaceId===activeSpace);
    const index=global.StudioRuntime.spaceControlIndex();
    const candidates=index && index.devices && index.devices.length ? index.devices.concat(devices) : devices;
    const rooms=new Map(),seen=new Set();
    for(const item of candidates){const id=String(item.id),room=String(item.spaceId || '');if(seen.has(id)||!plan.rank.has(room))continue;seen.add(id);const kind=childDeviceKind(item);if(!kind)continue;if(!rooms.has(room))rooms.set(room,[]);rooms.get(room).push({item,kind});}
    const order=['light','curtain','climate','sensor'];
    const select=room=>{const available=rooms.get(room)||[],chosen=[],used=new Set();for(const kind of order){const found=available.find(row=>row.kind===kind&&!used.has(row.item.id));if(found){chosen.push(found.item);used.add(found.item.id);}}for(const row of available){if(chosen.length===4)break;if(!used.has(row.item.id)){chosen.push(row.item);used.add(row.item.id);}}return chosen;};
    return activeSpace==='*'?[...plan.rank.keys()].flatMap(select):select(activeSpace);
  }
  function updateFilterSelection() {
    elements.filters.querySelectorAll('.filter-chip').forEach((button) => { const selected = button.dataset.spaceId === ((config.homeSpaceRequired || config.homeSpaceId)?global.StudioRuntime.getHomeSpace():activeSpace); button.classList.toggle('is-active', selected); button.setAttribute('aria-pressed', String(selected)); });
  }
  function changeHomeSpace(id) {
    if(busy || pendingControls.size || pendingScenes.size || spaceControl.busy() || favoriteDevices && favoriteDevices.busy())return;
    const chosen=(currentSnapshot && currentSnapshot.spaces || []).find(space=>space.id===id);
    const height=deviceGridContentHeight();
    global.StudioRuntime.setHomeSpace(id);activeSpace='*';currentSnapshot=null;
    closeCapabilitySheet({immediate:true,restoreFocus:false});
    if(global.CameraWebRTCRuntime)void global.CameraWebRTCRuntime.stopAll();
    mountedDeviceCards.clear();mountedDeviceSignatures.clear();loadingCards(elements.deviceGrid,2);
    if(height>0)elements.deviceGrid.style.minHeight=height+'px';
    elements.summaryLabel.textContent=chosen?chosen.name:t('chooseHomeSpace');
    [elements.temperatureValue,elements.humidityValue,elements.presenceValue,elements.onlineCount,elements.spaceCount,elements.sceneCount].forEach(element=>element.textContent='—');
    if(favoriteDevices)favoriteDevices.update(global.StudioRuntime.favoriteDeviceIndex());
    spaceControl.update(global.StudioRuntime.spaceControlIndex());updateFilterSelection();
    void refresh({quiet:true,homeSpaceChange:true});
  }
  function renderFilters(devices) {
    if(favoriteDeviceMode)return;
    const spaceList = currentSnapshot && currentSnapshot.spaces || [];
    const roots = spaceList.filter(space => space.isRoot === true);
    const wholeSpace = roots.length === 1 ? roots[0] : null;
    const spaces = new Map();
    for (const space of spaceList) if (space.id) spaces.set(String(space.id), space.name || t('unnamedSpace'));
    for (const device of devices) if (!spaces.has(device.spaceId)) spaces.set(device.spaceId, device.spaceId ? device.spaceName || t('unnamedSpace') : t('unassigned'));
    if (wholeSpace) spaces.delete(String(wholeSpace.id));
    const scoped=config.homeSpaceRequired || config.homeSpaceId;let entries = scoped?spaceList.filter(space=>!space.isRoot).map(space=>[space.id,space.name]):[['*', wholeSpace ? wholeSpace.name || t('unnamedSpace') : t('all')], ...spaces];
    if(config.roleRecommendations && config.role==='child' && !scoped){
      const plan=childRoomPlan();entries=spaceList.filter(space=>plan.rank.has(space.id)).sort((a,b)=>plan.rank.get(a.id)-plan.rank.get(b.id)).map(space=>[space.id,space.name]);if(!entries.some(entry=>entry[0]===activeSpace))activeSpace=plan.rest || (entries[0] && entries[0][0]) || '*';const pref=global.FavoriteDevices.roomPreference(config,favoriteMetadata.get().scope,currentSnapshot && currentSnapshot.spaces || []);
      global.FavoriteDevices.roomPicker(elements.filters.parentElement,global.FavoriteDevices.roleRooms(spaceList,'child',pref.value),t,id=>{pref.save(id);activeSpace=id;renderFilters(devices);renderDevices();renderAIAssistant(currentSnapshot);});
    }
    const existing = [...elements.filters.querySelectorAll('.filter-chip')];
    const sameSpaces = existing.length === entries.length && existing.every((button, index) => button.dataset.spaceId === entries[index][0]);
    elements.filters.hidden = false; elements.filters.setAttribute('aria-label', t('spaceFilter'));
    if (!sameSpaces) {
      const fragment = document.createDocumentFragment();
      entries.forEach(([id]) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'filter-chip'; button.dataset.spaceId = id; button.addEventListener('click', () => { if (activeSpace === id) return; const anchor = captureLayoutAnchor('filters'); if(config.homeSpaceRequired || config.homeSpaceId){changeHomeSpace(id);return;} activeSpace = id; updateFilterSelection(); renderDevices(anchor); renderAIAssistant(currentSnapshot); }); fragment.append(button); });
      clearChildren(elements.filters); elements.filters.append(fragment);
    }
    elements.filters.querySelectorAll('.filter-chip').forEach((button, index) => { button.textContent = entries[index][1]; }); updateFilterSelection();
  }

  function stateText(device) { if (!device.control) return isCachedSnapshot() ? t('cachedReadOnly') : t('readOnly'); if (device.control.kind === 'boolean') return device.control.value ? t('on') : t('off'); if (device.control.kind === 'range') return `${device.control.value}${device.control.unit || ''}`; if (device.control.kind === 'enum') { const option = device.control.options.find((item) => item.value === String(device.control.value)); return option && option.label || String(device.control.value || t('readOnly')); } return t('execute'); }
  function deviceDetailText(device) {
    let status = device.online ? stateText(device) : t('offline');
    if (device.category === 'light' && device.online) {
      const power = findControl(device, ['OnOff', 'Power'], 'boolean');
      const brightness = findControl(device, ['CurrentLevel', 'Brightness', 'BrightnessLevel', 'TargetBrightness'], 'range');
      status = power && power.value === false ? t('off') : brightness ? `${brightness.value}${brightness.unit || ''}` : t('on');
    } else if (device.online && !device.control) {
      const firstTelemetry = compactTelemetry(device)[0]; status = firstTelemetry && firstTelemetry.value || status;
    }
    return `${device.spaceName || t('unassigned')}｜${status}`;
  }

  function normalizedTraitCode(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function findControl(device, traitCodes, kind) {
    const codes = new Set((Array.isArray(traitCodes) ? traitCodes : [traitCodes]).map(normalizedTraitCode));
    return (device.controls || []).find((item) => codes.has(normalizedTraitCode(item.traitCode)) && (!kind || item.kind === kind));
  }
  function findReading(device, traitCodes) {
    const codes = new Set((Array.isArray(traitCodes) ? traitCodes : [traitCodes]).map(normalizedTraitCode));
    return (device.readings || []).find((item) => codes.has(normalizedTraitCode(item.traitCode)));
  }

  function makeControl(device, selectedControl, modifier) {
    const control = selectedControl || device.control; const enabled = config.enableDeviceWrites === true && device.online && !isCachedSnapshot();
    if (!control) { const badge = document.createElement('span'); badge.className = 'read-only-badge'; badge.textContent = isCachedSnapshot() ? t('cachedReadOnly') : t('readOnly'); return badge; }
    const allowed = enabled && !pendingControls.has(controlKey(device.id, control.id));
    if (control.kind === 'boolean') { const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = `device-toggle${modifier ? ` ${modifier}` : ''}`; toggle.dataset.writeAction = 'device'; toggle.dataset.controlId = String(control.id); toggle.dataset.allowed = String(allowed); toggle.innerHTML = icon('power'); toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-checked', String(control.value)); toggle.setAttribute('aria-label', `${powerText(device, control)} ${device.name || t('unnamedDevice')}`); toggle.disabled = !allowed; toggle.addEventListener('click', (event) => { event.stopPropagation(); handleDevice(device, !control.value, control); }); return toggle; }
    if (control.kind === 'enum') { const select = document.createElement('select'); select.className = `device-select${modifier ? ` ${modifier}` : ''}`; select.dataset.writeAction = 'device'; select.dataset.controlId = String(control.id); select.dataset.allowed = String(allowed); select.setAttribute('aria-label', `${device.name} ${controlText(control, device, 'full')}`); select.disabled = !allowed; const hasCurrentOption = control.options.some((option) => option.value === String(control.value)); if (!hasCurrentOption) { const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = t('unknownValue'); placeholder.disabled = true; placeholder.selected = true; select.append(placeholder); } control.options.forEach((option) => { const element = document.createElement('option'); element.value = option.value; element.textContent = option.label; element.selected = hasCurrentOption && option.value === String(control.value); select.append(element); }); select.addEventListener('change', (event) => handleDevice(device, event.target.value, control)); return select; }
    if (control.kind === 'range') {
      const wrap = document.createElement('label'); wrap.className = `range-control${device.category === 'curtain' ? ' is-curtain' : ''}${modifier ? ` ${modifier}` : ''}`;
      if (['ColorTemperature','ColorTemperatureMireds','TargetColorTemperature'].includes(control.traitCode)) wrap.classList.add('is-color-temperature');
      const value = document.createElement('span'); value.textContent = `${control.value}${control.unit || ''}`;
      const input = document.createElement('input'); input.type = 'range'; input.dataset.writeAction = 'device'; input.dataset.controlId = String(control.id); input.dataset.allowed = String(allowed); input.min = String(control.min); input.max = String(control.max); input.step = String(control.step); input.value = String(control.value); input.disabled = !allowed; input.setAttribute('aria-label', `${device.name} ${controlText(control, device, 'full')}`); input.setAttribute('aria-valuetext', value.textContent);
      const initialValue = Number(control.value); let interacting = false; let lastCommittedValue = Number.isFinite(initialValue) ? initialValue : null;
      const updatePreview = () => { value.textContent = `${input.value}${control.unit || ''}`; input.setAttribute('aria-valuetext', value.textContent); const ratio = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)); const progress = Math.max(0, Math.min(1, ratio)) * 100; const thumbBottom = Math.max(0, Math.min(76, progress * 1.08 - 16)); wrap.style.setProperty('--range-progress', `${progress}%`); wrap.style.setProperty('--range-thumb-bottom', `${thumbBottom}px`); };
      const commit = () => { const nextValue = Number(input.value); if (!Number.isFinite(nextValue) || nextValue === lastCommittedValue) return; lastCommittedValue = nextValue; handleDevice(device, nextValue, control); };
      const begin = () => { interacting = true; };
      const finish = () => { if (!interacting) return; interacting = false; commit(); };
      const cancel = () => { if (!interacting) return; interacting = false; input.value = String(control.value); updatePreview(); };
      updatePreview(); input.addEventListener('input', updatePreview);
      input.addEventListener('pointerdown', begin); input.addEventListener('touchstart', begin, { passive: true }); input.addEventListener('mousedown', begin);
      input.addEventListener('pointerup', finish); input.addEventListener('touchend', finish, { passive: true }); input.addEventListener('mouseup', finish);
      input.addEventListener('pointercancel', cancel); input.addEventListener('touchcancel', cancel, { passive: true });
      input.addEventListener('keydown', (event) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) interacting = true; if (event.key === 'Escape') cancel(); });
      input.addEventListener('keyup', finish); input.addEventListener('blur', finish); input.addEventListener('change', () => { if (!interacting) commit(); });
      input.__lifeSetCommittedValue = (nextValue) => { const numeric = Number(nextValue); if (Number.isFinite(numeric)) lastCommittedValue = numeric; input.value = String(nextValue); updatePreview(); };
      const verticalVisual = document.createElement('span'); verticalVisual.className = 'range-vertical-visual'; verticalVisual.setAttribute('aria-hidden', 'true');
      const verticalThumb = document.createElement('span'); verticalThumb.className = 'range-vertical-thumb'; verticalVisual.append(verticalThumb);
      wrap.append(value, input, verticalVisual); return wrap;
    }
    const button = document.createElement('button'); button.type = 'button'; button.className = 'command-button'; button.dataset.writeAction = 'device'; button.dataset.controlId = String(control.id); button.dataset.allowed = String(allowed); button.innerHTML = `${icon('command')}<span>${t('execute')}</span>`; button.disabled = !allowed; button.setAttribute('aria-label', `${t('execute')} ${device.name} ${controlText(control, device, 'full')}`); button.addEventListener('click', () => handleDevice(device, null, control)); return button;
  }

  function climateControls(device) {
    const mode = findControl(device, 'HeaterCoolerMode', 'enum'); const modeValue = String(valueOr(mode && mode.value, ''));
    const cooling = findControl(device, 'CoolingTemperature', 'range'); const heating = findControl(device, 'HeatingTemperature', 'range');
    return { power: findControl(device, ['OnOff', 'Power'], 'boolean'), mode, fan: findControl(device, 'FanMode', 'enum') || findControl(device, ['FanSwitch', 'FanOnOff'], 'boolean'), target: modeValue === '1' ? (heating || cooling) : modeValue === '0' ? (cooling || heating) : (cooling || heating), current: findReading(device, ['CurrentTemperature', 'RoomTemperature']) };
  }

  function lightDirectControls(device) {
    const brightness = findControl(device, ['CurrentLevel', 'Brightness', 'BrightnessLevel', 'TargetBrightness'], 'range');
    const colorTemperature = findControl(device, ['ColorTemperature', 'ColorTemperatureMireds', 'TargetColorTemperature'], 'range');
    return [...new Map([brightness, colorTemperature].filter(Boolean).map((control) => [control.id, control])).values()];
  }

  function directControlsModel(device) {
    if (device.category === 'light') return lightDirectControls(device);
    if (device.category === 'curtain' && device.control && device.control.kind === 'range') return [device.control];
    return [];
  }

  function isScalarPresentationReading(reading) {
    const value = reading && reading.value;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return true;
    if (typeof value !== 'string') return false;
    const text = value.trim();
    if (!text) return false;
    if (/^[\[{]/.test(text)) {
      try { if (typeof JSON.parse(text) === 'object') return false; } catch { /* ordinary text beginning with a bracket remains readable */ }
    }
    return true;
  }

  function isAqaraPresentationMetadataReading(reading) {
    const code = normalizedTraitCode(reading && reading.traitCode); const label = String(reading && reading.label || '').toLowerCase().replace(/\s+/g, '');
    return /^(?:productname|productlabel|matterrole|matterroles|supportedmatterrole|supportedmatterroles)$/.test(code)
      || (/(?:根节点|rootnode)/.test(label) && /(?:产品名称|productname|matter角色|matterrole)/.test(label));
  }

  function usefulPresentationReadings(device) {
    const readings = device.presentationReadings || [];
    return readings.filter((item) => isScalarPresentationReading(item) && !isAqaraPresentationMetadataReading(item));
  }

  function compactTelemetry(device) {
    const controlIds = new Set((device.controls || []).map((item) => item.id));
    return usefulPresentationReadings(device).filter((item) => !controlIds.has(item.id)).slice(0, 2).map((item) => ({ id: item.id, label: item.label, value: item.displayValue }));
  }

  function makeDirectControls(device, controls) {
    if (!controls.length) return null;
    const panel = document.createElement('div'); panel.className = 'device-direct-controls';
    controls.forEach((control) => { const row = document.createElement('div'); const code = normalizedTraitCode(control.traitCode); row.className = `device-direct-control${['currentlevel', 'brightness', 'brightnesslevel', 'targetbrightness'].includes(code) ? ' is-brightness' : ''}${['colortemperature', 'colortemperaturemireds', 'targetcolortemperature'].includes(code) ? ' is-color-temperature' : ''}`; const label = document.createElement('span'); label.textContent = controlText(control, device); row.append(label, makeControl(device, control, 'is-direct')); panel.append(row); });
    return panel;
  }

  function makeClimatePanel(device, climate) {
    if (!climate.current && !climate.target && !climate.mode && !climate.fan) return null;
    const panel = document.createElement('div'); panel.className = 'climate-panel';
    const current = document.createElement('div'); current.className = 'climate-current'; const currentLabel = document.createElement('span'); currentLabel.textContent = t('currentTemperature'); const currentValue = document.createElement('strong'); currentValue.textContent = climate.current ? climate.current.displayValue : '—'; current.append(currentLabel, currentValue); panel.append(current);
    if (climate.target) { const target = document.createElement('div'); target.className = 'climate-target'; const label = document.createElement('span'); label.textContent = ft('climate.target'); target.append(label, makeControl(device, climate.target, 'is-climate')); panel.append(target); }
    if (climate.mode || climate.fan) { const selectors = document.createElement('div'); selectors.className = 'climate-selectors'; if (climate.mode) { const group = document.createElement('label'); const label = document.createElement('span'); label.textContent = ft('climate.mode'); group.append(label, makeControl(device, climate.mode, 'is-climate')); selectors.append(group); } if (climate.fan) { const group = document.createElement('label'); const label = document.createElement('span'); label.textContent = ft('climate.fan'); group.append(label, makeControl(device, climate.fan, 'is-climate')); selectors.append(group); } panel.append(selectors); }
    return panel;
  }

  function capabilityDetailsModel(device, climate, directControls, telemetryShownOnCard) {
    const usedControlIds = new Set([device.control, ...(directControls || []), ...(climate ? [climate.power, climate.target, climate.mode, climate.fan] : [])].filter(Boolean).map((item) => item.id));
    const allControlIds = new Set((device.controls || []).map((item) => item.id));
    const shownReadingIds = new Set((telemetryShownOnCard || []).map((item) => item.id));
    if (climate && climate.current) shownReadingIds.add(climate.current.id);
    return {
      controls: (device.controls || []).filter((item) => !usedControlIds.has(item.id)),
      readings: usefulPresentationReadings(device).filter((item) => !allControlIds.has(item.id) && !shownReadingIds.has(item.id)),
    };
  }

  function ensureCapabilitySheet() {
    if (capabilitySheet) return capabilitySheet;
    const layer = document.createElement('div'); layer.className = 'capability-sheet-layer'; layer.hidden = true; layer.setAttribute('aria-hidden', 'true');
    const backdrop = document.createElement('div'); backdrop.className = 'capability-sheet-backdrop'; backdrop.setAttribute('aria-hidden', 'true');
    const panel = document.createElement('section'); panel.id = 'capability-sheet-dialog'; panel.className = 'capability-sheet-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'capability-sheet-title'); panel.tabIndex = -1;
    const handle = document.createElement('span'); handle.className = 'capability-sheet-handle'; handle.setAttribute('aria-hidden', 'true');
    const header = document.createElement('header'); header.className = 'capability-sheet-header';
    const identity = document.createElement('div'); identity.className = 'capability-sheet-identity';
    const iconBox = document.createElement('span'); iconBox.className = 'capability-sheet-icon';
    const copy = document.createElement('div'); copy.className = 'capability-sheet-copy';
    const eyebrow = document.createElement('span'); eyebrow.className = 'capability-sheet-eyebrow';
    const title = document.createElement('strong'); title.id = 'capability-sheet-title';
    const subtitle = document.createElement('span'); subtitle.className = 'capability-sheet-subtitle';
    copy.append(eyebrow, title, subtitle); identity.append(iconBox, copy);
    const close = document.createElement('button'); close.type = 'button'; close.className = 'capability-sheet-close'; close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
    header.append(identity, close);
    const content = document.createElement('div'); content.className = 'capability-sheet-content'; content.tabIndex = 0;
    panel.append(handle, header, content); layer.append(backdrop, panel); document.documentElement.append(layer);
    capabilitySheet = { layer, backdrop, panel, handle, header, iconBox, eyebrow, title, subtitle, close, content, details: null, body: null, trigger: null, deviceId: '' };
    const containSheetGesture = (event) => event.stopPropagation();
    ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel'].forEach((type) => layer.addEventListener(type, containSheetGesture, { passive: true }));
    backdrop.addEventListener('click', () => closeCapabilitySheet()); close.addEventListener('click', () => closeCapabilitySheet());
    layer.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeCapabilitySheet(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...panel.querySelectorAll('button:not([disabled]),select:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((item) => !item.hidden);
      if (!focusable.length) { event.preventDefault(); panel.focus(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    return capabilitySheet;
  }

  function lockCapabilitySheetScroll() {
    if (capabilitySheetBodyStyles) return;
    capabilitySheetScrollY = global.scrollY;
    capabilitySheetBodyStyles = { position: document.body.style.position, top: document.body.style.top, width: document.body.style.width, overflow: document.body.style.overflow };
    document.body.classList.add('is-capability-sheet-open'); document.body.style.position = 'fixed'; document.body.style.top = `${-capabilitySheetScrollY}px`; document.body.style.width = '100%'; document.body.style.overflow = 'hidden';
  }

  function unlockCapabilitySheetScroll() {
    if (!capabilitySheetBodyStyles) return;
    const saved = capabilitySheetBodyStyles; capabilitySheetBodyStyles = null;
    document.body.classList.remove('is-capability-sheet-open'); document.body.style.position = saved.position; document.body.style.top = saved.top; document.body.style.width = saved.width; document.body.style.overflow = saved.overflow;
    global.scrollTo(0, capabilitySheetScrollY);
  }

  function closeCapabilitySheet(options = {}) {
    if (!capabilitySheet || !capabilitySheet.details) return;
    clearTimeout(capabilitySheetCloseTimer);
    const sheet = capabilitySheet; const { details, body, trigger } = sheet;
    details.classList.remove('is-open'); trigger.setAttribute('aria-expanded', 'false'); sheet.layer.classList.remove('is-open'); sheet.layer.setAttribute('aria-hidden', 'true'); unlockCapabilitySheetScroll();
    const finish = () => {
      if (sheet.details !== details) return;
      body.hidden = true; details.append(body); clearChildren(sheet.content); sheet.layer.hidden = true; sheet.panel.removeAttribute('data-device-id');
      sheet.details = null; sheet.body = null; sheet.trigger = null; sheet.deviceId = '';
      if (options.restoreFocus !== false && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
    if (options.immediate) finish(); else capabilitySheetCloseTimer = global.setTimeout(finish, 260);
  }

  function openCapabilitySheet(device, details, body, trigger, mountBody, lightAdjustment = false) {
    if (!allowSpaceDeviceDetails && !lightAdjustment) return;
    const sheet = ensureCapabilitySheet();
    if (sheet.details === details && sheet.layer.classList.contains('is-open')) { closeCapabilitySheet(); return; }
    if (sheet.details) closeCapabilitySheet({ immediate: true, restoreFocus: false });
    clearTimeout(capabilitySheetCloseTimer); mountBody(); body.hidden = false;
    sheet.details = details; sheet.body = body; sheet.trigger = trigger; sheet.deviceId = String(device.id); sheet.panel.dataset.deviceId = String(device.id);
    sheet.eyebrow.textContent = lightAdjustment ? ft('light.adjust','full') : t('capabilitySheetLabel'); sheet.title.textContent = device.name || t('unnamedDevice'); sheet.subtitle.textContent = deviceDetailText(device); sheet.close.setAttribute('aria-label', t('closeDetails')); sheet.iconBox.innerHTML = icon(device.category);
    clearChildren(sheet.content); sheet.content.append(body); details.classList.add('is-open'); trigger.setAttribute('aria-expanded', 'true');
    sheet.layer.hidden = false; sheet.layer.setAttribute('aria-hidden', 'false');
    const panelStyle = global.getComputedStyle(sheet.panel); const viewportHeight = global.visualViewport && global.visualViewport.height || global.innerHeight;
    const desiredHeight = sheet.handle.offsetHeight + sheet.header.offsetHeight + body.scrollHeight + 34 + parseFloat(panelStyle.paddingBottom || '0');
    sheet.panel.style.height = `${Math.max(196, Math.min(viewportHeight - 16, desiredHeight))}px`;
    lockCapabilitySheetScroll();
    global.requestAnimationFrame(() => { sheet.layer.classList.add('is-open'); global.requestAnimationFrame(() => sheet.panel.focus({ preventScroll: true })); });
  }

  function makeCapabilityDetails(device, model, lightAdjustment = false) {
    if (lightAdjustment && (device.category !== 'light' || model.readings.length || model.controls.some(control => !lightDirectControls(device).includes(control)))) return null;
    const count = model.controls.length + model.readings.length; if (!count) return null;
    const details = document.createElement('section'); details.className = 'capability-details capability-sheet-source' + (lightAdjustment ? ' light-adjust-source' : ''); details.hidden = true;
    const body = document.createElement('div'); body.className = 'capability-body';
    let mounted = false;
    const mountBody = () => {
    if (mounted) return; mounted = true;
    if (model.controls.length) { const heading = document.createElement('strong'); heading.className = 'capability-heading'; heading.textContent = t('availableControls'); body.append(heading); model.controls.forEach((control) => { const row = document.createElement('div'); row.className = 'capability-control-row'; const label = document.createElement('span'); label.textContent = controlText(control, device); row.append(label, makeControl(device, control, 'is-capability')); body.append(row); }); }
    if (model.readings.length) { const heading = document.createElement('strong'); heading.className = 'capability-heading'; heading.textContent = t('deviceReadings'); body.append(heading); const readings = document.createElement('dl'); readings.className = 'capability-readings'; model.readings.forEach((reading) => { const group = document.createElement('div'); const dt = document.createElement('dt'); dt.textContent = reading.label; const dd = document.createElement('dd'); dd.textContent = reading.displayValue; group.append(dt, dd); readings.append(group); }); body.append(readings); }
    };
    const setOpen = (open, trigger) => { if (open && trigger) openCapabilitySheet(device, details, body, trigger, mountBody, lightAdjustment); else if (capabilitySheet && capabilitySheet.details === details) closeCapabilitySheet(); };
    body.hidden = true; body.dataset.deviceId = String(device.id); details.__lifeSetOpen = setOpen;
    details.append(body); return details;
  }

  function cardClickIsControl(target) {
    return target instanceof Element && Boolean(target.closest('button,input,select,a,label,[data-write-action],.device-direct-controls,.climate-panel'));
  }

  function controlValuesEqual(control, left, right) {
    if (control.kind === 'range') {
      const leftNumber = Number(left); const rightNumber = Number(right); const step = Math.abs(Number(control.step)) || 0;
      return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && Math.abs(leftNumber - rightNumber) <= Math.max(step / 2, 0.000001);
    }
    if (control.kind === 'enum') return String(valueOr(left, '')) === String(valueOr(right, ''));
    return left === right;
  }

  function lightFixturePresentation(device) {
    const presentationText = [device.name, device.model, ...(device.types || [])].filter(Boolean).join(' ').toLowerCase();
    if (/(?:吊灯|吊线灯|吊杆灯|pendant|chandelier)/i.test(presentationText)) return 'pendant';
    if (/(?:顶灯|吸顶灯|ceiling[\s_-]*light|flush[\s_-]*mount)/i.test(presentationText)) return 'ceiling';
    return 'unspecified';
  }

  function aqaraCardProfile(device, hasClimatePanel, directControls, telemetry) {
    if (device.cameraStream) return { size: 'xl', source: 'aqara-camera-webrtc' };
    if (device.category === 'light') {
      return { size: 'm', source: 'aqara-confirmed-light' };
    }
    if (hasClimatePanel) return { size: 'xl', source: 'aqara-adapted' };
    if (device.category === 'curtain' && device.control && device.control.kind === 'range') return { size: 'l', source: 'aqara-adapted' };
    if (device.category === 'sensor') return { size: telemetry.length > 1 ? 'm' : 's', source: 'aqara-adapted' };
    if (device.category === 'hub') return { size: device.control || telemetry.length > 1 ? 'm' : 's', source: 'aqara-adapted' };
    return { size: device.control || telemetry.length > 1 ? 'm' : 's', source: 'aqara-adapted' };
  }

  function makeCameraStream(device) {
    if (!device.cameraStream) return null;
    const panel = document.createElement('section'); panel.className = 'camera-stream'; panel.dataset.cameraDeviceId = String(device.id);
    const viewport = document.createElement('div'); viewport.className = 'camera-stream-viewport';
    const video = document.createElement('video'); video.className = 'camera-stream-video'; video.playsInline = true; video.muted = true; video.disablePictureInPicture = true; video.setAttribute('aria-label', `${device.name || t('unnamedDevice')} · ${t('cameraLive')}`);
    const placeholder = document.createElement('span'); placeholder.className = 'camera-stream-placeholder'; placeholder.innerHTML = icon('camera');
    const controls = document.createElement('div'); controls.className = 'camera-stream-controls';
    const status = document.createElement('span'); status.className = 'camera-stream-status';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'camera-stream-button'; button.dataset.writeAction = 'camera-stream';
    const cameraRuntime = global.CameraWebRTCRuntime; const offline = !device.online; const available = Boolean(!offline && !isCachedSnapshot() && cameraRuntime && cameraRuntime.isAvailable());
    let state = 'idle';
    panel.dataset.streamAvailability = offline ? 'offline' : available ? 'available' : 'unavailable';
    const render = (next, error) => { const phase = error && error.phase; const phaseKey = { prepare: 'cameraPhasePrepare', signaling: 'cameraPhaseSignaling', answer: 'cameraPhaseAnswer', media: 'cameraPhaseMedia' }[phase]; const phaseText = phaseKey ? t(phaseKey) : ''; state = next; panel.dataset.streamState = next; panel.dataset.streamPhase = phase || ''; status.textContent = next === 'connecting' ? [t('cameraConnecting'), phaseText].filter(Boolean).join(' · ') : next === 'connected' ? t('cameraConnected') : next === 'paused' ? t('cameraPaused') : next === 'failed' ? [t('cameraFailed'), phaseText, error && error.iceServerStatus === 'unavailable' ? t('cameraIceUnavailable') : ''].filter(Boolean).join(' · ') : offline ? t('offline') : available ? t('cameraLive') : t('cameraUnavailable'); button.textContent = next === 'connected' ? t('cameraPause') : next === 'paused' ? t('cameraResume') : offline ? t('offline') : t('cameraPlay'); button.disabled = !available || next === 'connecting'; button.setAttribute('aria-label', `${device.name || t('unnamedDevice')} · ${button.textContent}`); button.title = error instanceof Error ? error.message : ''; };
    button.addEventListener('click', async (event) => { event.stopPropagation(); try { if (state === 'connected') global.CameraWebRTCRuntime.pause(device.id); else if (state === 'paused') await global.CameraWebRTCRuntime.resume(device.id); else await global.CameraWebRTCRuntime.start(device.id, video, render); } catch { /* status is emitted by the runtime */ } });
    viewport.append(video, placeholder); controls.append(status, button); panel.append(viewport, controls); render('idle'); return panel;
  }

  function makeDeviceCard(device) {
    const climate = device.category === 'climate' ? climateControls(device) : null; const curtainRange = device.category === 'curtain' && device.control && device.control.kind === 'range' ? device.control : null; const headerControl = device.category === 'light' ? (device.controls || []).find(control => control.kind === 'boolean' && ['OnOff', 'Power', 'PowerSwitch'].includes(control.traitCode)) || (device.control && device.control.kind === 'boolean' ? device.control : null) : climate && climate.power || (curtainRange ? null : device.control); const fanId = climate && climate.fan && climate.fan.id; const headerId = headerControl && headerControl.id; const panelClimate = climate ? { ...climate, fan: fanId === headerId ? null : climate.fan } : null; const hasClimatePanel = Boolean(panelClimate && (panelClimate.current || panelClimate.target || panelClimate.mode || panelClimate.fan)); const lightAdjustControls = device.category === 'light' ? lightDirectControls(device) : []; const directControls = device.category === 'light' ? [] : directControlsModel(device); const telemetry = compactTelemetry(device); const aqaraProfile = aqaraCardProfile(device, hasClimatePanel, directControls, telemetry);
    let telemetryShownOnCard = !hasClimatePanel && telemetry.length && !((device.category === 'light' || aqaraProfile && aqaraProfile.size === 'l' || aqaraProfile && aqaraProfile.size === 'xl')) ? telemetry : [];
    const compactAqaraNonLight = device.category !== 'light' && aqaraProfile && ['s', 'm'].includes(aqaraProfile.size);
    if (compactAqaraNonLight) telemetryShownOnCard = aqaraProfile.size === 'm' ? telemetryShownOnCard.slice(0, 1) : [];
    const telemetryShownInStatus = compactAqaraNonLight && aqaraProfile.size === 's' && !device.control ? telemetry.slice(0, 1) : [];
    let capabilityModel = capabilityDetailsModel(device, climate, directControls, [...telemetryShownOnCard, ...telemetryShownInStatus]);
    if (compactAqaraNonLight && telemetryShownOnCard.length && capabilityModel.controls.length + capabilityModel.readings.length > 0) {
      telemetryShownOnCard = [];
      capabilityModel = capabilityDetailsModel(device, climate, directControls, telemetryShownOnCard);
    }
    const hasCapabilityDetails = capabilityModel.controls.length + capabilityModel.readings.length > 0; const booleanStateClass = device.control && device.control.kind === 'boolean' ? (device.control.value ? ' is-on' : ' is-off') : ''; const card = document.createElement('article'); card.className = `device-card category-${device.category}${aqaraProfile ? ` aqara-size-${aqaraProfile.size}` : ''}${device.category === 'light' ? ` aqara-light-controls-${directControls.length}` : ''}${booleanStateClass}${curtainRange ? ' has-curtain-range' : ''}${hasClimatePanel ? ' has-climate-panel' : ''}${hasCapabilityDetails ? ' has-capability-details' : ''}${device.online ? '' : ' is-offline'}`; card.dataset.deviceId = String(device.id); if (aqaraProfile) { card.dataset.designSource = aqaraProfile.source; card.dataset.cardSize = aqaraProfile.size.toUpperCase(); } card.setAttribute('aria-label', `${device.name || t('unnamedDevice')}，${device.online ? t('online') : t('offline')}`);
    const row = document.createElement('div'); row.className = 'device-row'; const iconBox = document.createElement('span'); iconBox.className = 'device-icon'; iconBox.innerHTML = icon(device.category); const headerNode = curtainRange || (device.category === 'light' && !headerControl) ? document.createElement('span') : makeControl(device, headerControl); if (curtainRange || (device.category === 'light' && !headerControl)) { headerNode.className = 'card-control-spacer'; headerNode.setAttribute('aria-hidden', 'true'); } row.append(iconBox, headerNode);
    const meta = document.createElement('div'); meta.className = 'device-meta'; const title = document.createElement('strong'); title.textContent = device.name || t('unnamedDevice'); const detail = document.createElement('span'); detail.textContent = deviceDetailText(device); meta.append(title, detail);
    if (telemetryShownOnCard.length) { const metrics = document.createElement('dl'); metrics.className = 'device-metrics'; telemetryShownOnCard.forEach((item) => { const group = document.createElement('div'); const dt = document.createElement('dt'); dt.textContent = item.label; const dd = document.createElement('dd'); dd.textContent = item.value; group.append(dt, dd); metrics.append(group); }); meta.append(metrics); }
    card.append(row, meta); const cameraStream = makeCameraStream(device); if (cameraStream) card.append(cameraStream); const directPanel = makeDirectControls(device, directControls); if (directPanel) card.append(directPanel); const climatePanel = hasClimatePanel && makeClimatePanel(device, panelClimate); if (climatePanel) card.append(climatePanel); const capabilityDetails = allowSpaceDeviceDetails ? makeCapabilityDetails(device, capabilityModel) : null; if (capabilityDetails) card.append(capabilityDetails);
    if (lightAdjustControls.length) {
      const adjustment = makeCapabilityDetails(device, { controls: lightAdjustControls, readings: [] }, true);
      const adjust = document.createElement('button'); adjust.type = 'button'; adjust.className = 'light-adjust';
      adjust.setAttribute('aria-label', `${ft('light.adjust','full')} ${device.name || t('unnamedDevice')}`); adjust.setAttribute('aria-haspopup', 'dialog'); adjust.setAttribute('aria-expanded', 'false'); adjust.setAttribute('aria-controls', 'capability-sheet-dialog');
      const label = document.createElement('span'); label.textContent = ft('light.adjust'); iconBox.replaceWith(adjust); adjust.append(iconBox, label); card.append(adjustment);
      adjust.addEventListener('click', event => { event.stopPropagation(); adjustment.__lifeSetOpen(true, adjust); });
    }
    if (capabilityDetails) {
      card.classList.add('has-device-detail-action'); card.dataset.detailAction = 'true'; card.tabIndex = 0; card.setAttribute('aria-haspopup', 'dialog'); card.setAttribute('aria-controls', 'capability-sheet-dialog'); card.setAttribute('aria-expanded', 'false'); card.setAttribute('aria-label', `${card.getAttribute('aria-label')}，${t('openDeviceDetails')}`);
      const openDetails = () => capabilityDetails.__lifeSetOpen(true, card);
      card.addEventListener('click', (event) => { if (!cardClickIsControl(event.target)) openDetails(); });
      card.addEventListener('keydown', (event) => { if (event.target !== card || !['Enter', ' '].includes(event.key)) return; event.preventDefault(); openDetails(); });
    }
    const status = document.createElement('span'); status.className = 'device-action-status'; status.setAttribute('aria-live', 'polite'); card.append(status); return card;
  }

  function setDeviceActionStatus(device, message) {
    const card = deviceCard(device.id); const status = card && card.querySelector('.device-action-status'); if (status) status.textContent = message || '';
  }

  function setDeviceControlPending(device, control, pending) {
    const card = deviceCard(device.id); if (!card) return;
    controlTargets(device.id, control.id).forEach((element) => {
      const allowed = config.enableDeviceWrites === true && device.online && !isCachedSnapshot() && !pending;
      element.dataset.allowed = String(allowed); element.disabled = !allowed;
      if (pending) element.setAttribute('aria-busy', 'true'); else element.removeAttribute('aria-busy');
    });
  }

  function updateDeviceCardState(device, control) {
    const card = deviceCard(device.id); if (!card) return;
    if(control)controlTargets(device.id, control.id).forEach((target) => {
      if (control.kind === 'boolean') { target.setAttribute('aria-checked', String(control.value)); target.setAttribute('aria-label', `${powerText(device, control)} ${device.name || t('unnamedDevice')}`); }
      else if (control.kind === 'enum') target.value = String(valueOr(control.value, ''));
      else if (control.kind === 'range') {
        if (typeof target.__lifeSetCommittedValue === 'function') target.__lifeSetCommittedValue(control.value);
        else { target.value = String(control.value); const range = target.closest('.range-control'); const value = range && range.querySelector('span'); if (value) value.textContent = `${control.value}${control.unit || ''}`; }
      }
    });
    card.classList.toggle('is-on', device.control && device.control.kind === 'boolean' && device.control.value === true); card.classList.toggle('is-off', device.control && device.control.kind === 'boolean' && device.control.value === false);
    card.classList.toggle('is-offline',!device.online);
    const title=card.querySelector('.device-meta > strong');if(title && title.textContent!==device.name)title.textContent=device.name || t('unnamedDevice');
    const cardLabel=`${device.name || t('unnamedDevice')}，${device.online ? t('online') : t('offline')}${card.classList.contains('has-device-detail-action') ? `，${t('openDeviceDetails')}` : ''}`;
    if(card.getAttribute('aria-label')!==cardLabel)card.setAttribute('aria-label',cardLabel);
    const detail = card.querySelector('.device-meta > span'); const detailText=deviceDetailText(device);if(detail && detail.textContent!==detailText)detail.textContent=detailText;
  }

  function renderDevices(anchor = captureLayoutAnchor(), appendOnly = false) {
    if(favoriteDeviceMode || !moduleEnabled('devices'))return;
    transitionGridHeight = deviceGridContentHeight(); const revision = ++layoutRevision;
    if (childRoomPlan()) appendOnly=false;
    const visible = filteredDevices(); initializeConfirmedValues(visible);
    const wanted=new Set(visible.map(device=>String(device.id)));
    const removeCard=id=>{const card=mountedDeviceCards.get(id);if(!card)return;if(capabilitySheet && String(capabilitySheet.deviceId)===id)closeCapabilitySheet({immediate:true,restoreFocus:false});if(global.CameraWebRTCRuntime && card.querySelector('.camera-stream'))void global.CameraWebRTCRuntime.stop(id);card.remove();mountedDeviceCards.delete(id);mountedDeviceSignatures.delete(id);};
    if(!appendOnly)for(const id of [...mountedDeviceCards.keys()])if(!wanted.has(id))removeCard(id);
    if(!visible.length) { closeCapabilitySheet({immediate:true,restoreFocus:false});for(const id of [...mountedDeviceCards.keys()])removeCard(id);clearChildren(elements.deviceGrid); elements.deviceGrid.append(emptyCard(t(config.homeSpaceRequired && !global.StudioRuntime.getHomeSpace()?((currentSnapshot && currentSnapshot.spaces || []).some(space=>!space.isRoot)?'chooseHomeSpace':'noHomeSpaces'):activeSpace === '*' ? 'emptyDevices' : hasMoreDevices() && !(childRoomPlan() && global.StudioRuntime.spaceControlIndex().complete) ? 'spaceDevicesNotLoaded' : 'emptySpaceDevices'))); elements.loadMore.hidden = !hasMoreDevices() || Boolean(childRoomPlan() && global.StudioRuntime.spaceControlIndex().complete); elements.loadMore.disabled = busy || loadMoreBusy || isCachedSnapshot() || !hasMoreDevices(); elements.loadMore.textContent = t('loadMore', { shown: currentSnapshot && currentSnapshot.devices.length || 0, total: currentSnapshot && currentSnapshot.deviceTotalCount || 0 }); const key = lockDeviceGridHeight(); restoreLayoutAnchor(anchor, revision); releaseDeviceGridHeight(anchor, revision, key); return; }
    elements.deviceGrid.querySelectorAll('.empty-card,.loading-card').forEach(card=>card.remove());
    visible.forEach((device,position)=>{
      const id=String(device.id),signature=JSON.stringify(device);let card=mountedDeviceCards.get(id);
      if(card && mountedDeviceSignatures.get(id)!==signature){removeCard(id);card=null;}
      if(!card){card=makeDeviceCard(device);mountedDeviceCards.set(id,card);mountedDeviceSignatures.set(id,signature);}
      if(elements.deviceGrid.children[position]!==card){if(card.querySelector('.camera-stream') && card.isConnected && global.CameraWebRTCRuntime)void global.CameraWebRTCRuntime.stop(id);elements.deviceGrid.insertBefore(card,elements.deviceGrid.children[position] || null);}
    });
    elements.loadMore.hidden = !hasMoreDevices() || Boolean(childRoomPlan() && global.StudioRuntime.spaceControlIndex().complete); elements.loadMore.disabled = busy || loadMoreBusy || isCachedSnapshot() || !hasMoreDevices(); if (!elements.loadMore.hidden) transitionGridHeight = 0; elements.loadMore.textContent = loadMoreBusy ? t('loadingMore') : t('loadMore', { shown: currentSnapshot && currentSnapshot.devices.length || visible.length, total: currentSnapshot && (currentSnapshot.deviceTotalCount || currentSnapshot.devices.length) || visible.length }); const key = lockDeviceGridHeight(); restoreLayoutAnchor(anchor, revision); releaseDeviceGridHeight(anchor, revision, key);
  }

  function renderAIAssistant(snapshot) {
    if(!moduleEnabled('aiAssistant') || !aiAgentEnabled)return;
    const hints=snapshot && !snapshot.isCached?global.StudioRuntime.deriveAssistantHints(snapshot.devices,snapshot.spaces):{};
    const indexed=snapshot && !snapshot.isCached && snapshot.overview && snapshot.overview.assistantHints || {};
    const rooms=new Map((snapshot && snapshot.spaces || []).filter(space=>space.id && (!space.isRoot || space.isScopeRoom) && typeof space.name==='string' && space.name.trim() && space.name.length<=32 && !/[\u0000-\u001f]/.test(space.name)).map(space=>[String(space.id),space.name.trim()]));
    const preferred=(config.role==='senior'||config.role==='child'||config.role==='female')?global.FavoriteDevices.roomPreference(config,favoriteMetadata.get().scope,snapshot && snapshot.spaces || []).value:'';
    const rolePlan=(config.role==='senior'||config.role==='child')?global.FavoriteDevices.roleRooms(snapshot && snapshot.spaces || [],config.role,preferred):null;
    const roleRanks=(config.role==='female')?global.FavoriteDevices.roleRooms(snapshot && snapshot.spaces || [],config.role,preferred).rank:null;
    const living=/^(客厅|客廳|起居室|living\s*room|lounge)$/i;
    const pick=key=>{
      const ids=[...new Set([...(hints.roomHints && hints.roomHints[key] || []),...(indexed.roomHints && indexed.roomHints[key] || [])].map(String))].filter(id=>rooms.has(id) && (!rolePlan || rolePlan.rank.has(id)));
      ids.sort((a,b)=>{
        const rank=id=>activeSpace!=='*' && id===activeSpace?-2:id===preferred?-1:rolePlan?rolePlan.rank.get(id):roleRanks && roleRanks.has(id)?roleRanks.get(id):living.test(rooms.get(id))?1:2;
        return rank(a)-rank(b);
      });
      return ids[0] ? rooms.get(ids[0]) : '';
    };
    const order=config.role==='senior'||config.role==='child'||config.role==='female'?['environment','dimming','presence','offline']:['presence','dimming','offline','environment'];
    const aiCopy=global.LifeI18n.aiPresentation(config.role);
    const questions=order.map(key=>aiCopy.question(key,pick(key))).filter(Boolean).slice(0,3);
    const signature = `${global.LifeI18n.getLocale()}:${JSON.stringify(questions)}`;
    if (elements.aiSuggestions.dataset.signature === signature) return;
    const anchor = captureViewportAnchor(); const hadSuggestions = !elements.aiSuggestions.hidden;
    clearChildren(elements.aiSuggestions);
    questions.forEach((question) => { const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'ai-assistant-chip'; chip.textContent = question; chip.disabled = elements.aiButton.disabled; chip.addEventListener('click', () => { void openAIAssistant(chip.textContent); }); elements.aiSuggestions.append(chip); });
    elements.aiSuggestions.hidden = !questions.length; elements.aiSuggestions.dataset.signature = signature;
    elements.aiButton.setAttribute('aria-label', aiCopy.openLabel);
    if (hadSuggestions !== Boolean(questions.length)) restoreLayoutAnchor(anchor);
  }

  function renderSummary(snapshot) {
    const spaceIndex=global.StudioRuntime.spaceControlIndex();
    if(!spaceIndex.building)spaceControl.update(spaceIndex);
    if(favoriteDevices)favoriteDevices.update(global.StudioRuntime.favoriteDeviceIndex());
    syncDashboardDataWatches();
    const overview = snapshot.overview; const listedOnline = overview && overview.onlineDeviceCountSource === 'device-list' && typeof overview.onlineDeviceCount === 'number' ? overview.onlineDeviceCount : NaN; const online = Number.isFinite(listedOnline) ? listedOnline : snapshot.devices.filter((device) => device.online === true).length; const loaded = snapshot.devices.length; const total = Number(snapshot.deviceTotalCount) || loaded;
    elements.onlineCount.textContent = String(online); elements.spaceCount.textContent = String((config.homeSpaceRequired || config.homeSpaceId)?global.StudioRuntime.spaceControlIndex().spaces.length:snapshot.spaces.length); elements.sceneCount.textContent = String(snapshot.scenes.length);
    elements.summaryHeading.textContent = !loaded ? t('waiting') : snapshot.hasMoreDevices ? t('partiallyLoaded') : online === loaded ? t('allGood') : t('attention'); elements.summaryDetail.textContent = snapshot.hasMoreDevices ? t('deviceSummaryLoaded', { loaded, total, online }) : t('deviceSummary', { total: loaded, online });
    elements.updatedAt.textContent = snapshot.isCached ? t('cachedAt', { time: localTime(snapshot.cachedAt || snapshot.connectedAt) }) : t('lastSync', { time: localTime(snapshot.connectedAt || Date.now()) });
    const controlCount = snapshot.devices.filter((device) => device.control).length; elements.deviceNote.textContent = snapshot.hasMoreDevices ? t('deviceNoteLoaded', { loaded, total }) : t('deviceNote', { count: loaded });
    elements.deviceNote.title = controlCount ? t('controlCount', { count: controlCount }) : t('noControl');
    if(config.homeSpaceRequired || config.homeSpaceId){const chosen=(snapshot.spaces || []).find(s=>s.id===global.StudioRuntime.getHomeSpace());elements.summaryLabel.textContent=chosen?chosen.name:t('chooseHomeSpace');}
    renderOverviewSummary(snapshot.overview);
    renderAIAssistant(snapshot);
  }

  function renderOverviewSummary(overview) {
    const rawTemperature = overview && overview.temperature && overview.temperature.value; const rawHumidity = overview && overview.humidity && overview.humidity.value; const temperature = rawTemperature === null || rawTemperature === undefined ? NaN : Number(rawTemperature); const humidity = rawHumidity === null || rawHumidity === undefined ? NaN : Number(rawHumidity); const monitored = Number(overview && overview.presence && overview.presence.monitoredSpaceCount) || 0;
    elements.temperatureValue.textContent = Number.isFinite(temperature) ? `${temperature}°C` : '—'; elements.humidityValue.textContent = Number.isFinite(humidity) ? `${humidity}%` : '—'; elements.presenceValue.textContent = monitored ? String(Number(overview.presence.occupiedSpaceCount) || 0) : '—';
    elements.temperatureLabel.textContent = Number(overview && overview.temperature && overview.temperature.spaceCount) ? t('indoorTemperatureCovered', { count: overview.temperature.spaceCount }) : t('indoorTemperature');
    elements.humidityLabel.textContent = Number(overview && overview.humidity && overview.humidity.spaceCount) ? t('indoorHumidityCovered', { count: overview.humidity.spaceCount }) : t('indoorHumidity');
    elements.presenceLabel.textContent = monitored ? t('occupiedSpacesCovered', { count: monitored }) : t('occupiedSpaces');
    if(config.informationDensity==='simple'){elements.temperatureLabel.textContent=t('indoorTemperature');elements.humidityLabel.textContent=t('indoorHumidity');}
    if(config.role==='child' && !config.homeSpaceRequired && !config.homeSpaceId && !config.overviewEnvironmentSpaceId){elements.temperatureLabel.textContent=t('childHomeTemperature');elements.humidityLabel.textContent=t('childHomeHumidity');}
    if(config.homeSpaceRequired || config.homeSpaceId){elements.temperatureLabel.textContent=t('roomTemperature');elements.humidityLabel.textContent=t('roomHumidity');}
    if(config.overviewEnvironmentSpaceId){const source=(currentSnapshot && currentSnapshot.spaces || []).find(space=>space.id===config.overviewEnvironmentSpaceId);elements.temperatureLabel.textContent=t('sourceTemperature',{name:source?source.name:t('environmentSourceUnavailable')});elements.humidityLabel.textContent=t('sourceHumidity',{name:source?source.name:t('environmentSourceUnavailable')});}
    if (!overview) { elements.overviewCoverage.textContent = t('overviewDeferred'); return; }
    const values = { indexed: overview.indexedDeviceCount || 0, total: overview.deviceTotalCount || 0, failed: overview.failedDeviceCount || 0 };
    elements.overviewCoverage.textContent = overview.status === 'loading' ? t('overviewLoading', values) : overview.status === 'complete' ? t('overviewComplete', values) : overview.status === 'partial' ? t('overviewPartial', values) : t('overviewUnavailable');
  }

  function scheduleOverviewIndex() {
    if (config.scope === 'selected-device') return;
    const scheduled = ++overviewScheduleRevision;
    global.requestAnimationFrame(() => global.requestAnimationFrame(() => global.setTimeout(async () => {
      if (scheduled !== overviewScheduleRevision || !currentSnapshot || currentSnapshot.isCached) return;
      if(favoriteDevices)await favoriteDevices.prepare().catch(()=>{});
      if(scheduled!==overviewScheduleRevision || !currentSnapshot || currentSnapshot.isCached)return;
      if(global.StudioTabs && global.StudioTabs.prefetch)void global.StudioTabs.prefetch(()=>!busy && !pendingControls.size && !pendingScenes.size && (!favoriteDevices || !favoriteDevices.busy()) && !spaceControl.busy());
      if(config.enableOverviewIndex===false)return;
      global.StudioRuntime.loadOverviewIndex({ onProgress: (event) => {
        if (scheduled !== overviewScheduleRevision || event.type !== 'overview' || !currentSnapshot) return;
        // The index emits several partial loading snapshots. Keep the visible
        // overview steady and publish its finished result once.
        if(event.value.status==='loading')return;
        currentSnapshot = { ...currentSnapshot, overview: event.value }; renderSummary(currentSnapshot);
        if(childRoomPlan() && ['complete','partial'].includes(event.value.status))renderDevices();
      } }).catch(() => { if (scheduled === overviewScheduleRevision) renderOverviewSummary({ status: 'unavailable' }); });
    }, 0)));
  }

  function renderNotice(snapshot) {
    if (snapshot.warnings && snapshot.warnings.length) { elements.noticeText.textContent = snapshot.warnings.length === 1 ? snapshot.warnings[0] : t('warningMore', { first: snapshot.warnings[0], count: snapshot.warnings.length - 1 }); elements.notice.hidden = false; } else elements.notice.hidden = true;
  }

  function renderSnapshot(snapshot, anchor = captureViewportAnchor()) {
    stableDeviceGridHeights.clear(); confirmedControlValues.clear(); controlOperations.clear(); pendingControls.clear();
    currentSnapshot = snapshot; elements.sceneSection.hidden = false; elements.deviceSection.hidden = favoriteDeviceMode;
    renderSummary(snapshot); renderScenes(snapshot.scenes); renderFilters(snapshot.devices); renderDevices(anchor); elements.fatalState.hidden = true; renderNotice(snapshot);
    renderStudioHeader();
  }

  function renderFatal(error) { currentSnapshot = null; if(favoriteDevices)favoriteDevices.availability(); renderAIAssistant(null); elements.onlineCount.textContent = '—'; elements.spaceCount.textContent = '—'; elements.sceneCount.textContent = '—'; renderOverviewSummary({ status: 'unavailable' }); elements.updatedAt.textContent = t('neverSynced'); elements.notice.hidden = true; elements.summaryHeading.textContent = t('fatalTitle'); elements.summaryDetail.textContent = t('fatalDetail'); elements.sceneSection.hidden = true; elements.deviceSection.hidden = true; elements.fatalMessage.textContent = phoneOffline() ? global.LifePhoneNetwork.unavailableText() : error instanceof Error ? error.message : t('fatalFallback'); elements.fatalState.hidden = false; renderStudioHeader(); }

  async function refresh(options) {
    if (busy) return; dashboardRefreshSerial++; dashboardCollectionResults.clear(); overviewScheduleRevision += 1; setBusy(true); disableMountedWrites(); elements.fatalState.hidden = true; const hasRenderedContent = Boolean(currentSnapshot); const retainedOverview=hasRenderedContent && !currentSnapshot.isCached && snapshotScopeDid && snapshotScopeDid===dashboardDataDid && !(options && options.homeSpaceChange) ? currentSnapshot.overview : null; let deviceProgressRendered = false; const progress = { spaces: null, scenes: null };
    if (!options || !options.quiet) { elements.notice.hidden = true; elements.sceneSection.hidden = false; elements.deviceSection.hidden = favoriteDeviceMode; renderStudioHeader(); if (!hasRenderedContent) { renderScenes([]); if(!favoriteDeviceMode)loadingCards(elements.deviceGrid, 4); } }
    if(!phoneOffline())void favoriteMetadata.load(Boolean(hasRenderedContent && !(options && options.homeSpaceChange))).catch(()=>{});
    const onProgress = (event) => {
      if (event.type === 'spaces') { progress.spaces = event.value; elements.spaceCount.textContent = String(event.value.length); if (currentSnapshot) { currentSnapshot = { ...currentSnapshot, spaces: event.value }; renderSummary(currentSnapshot); renderFilters(currentSnapshot.devices); } return; }
      if (event.type === 'scenes') { progress.scenes = event.value; elements.sceneCount.textContent = String(event.value.length); renderScenes(event.value); if (currentSnapshot) currentSnapshot = { ...currentSnapshot, scenes: event.value }; return; }
      if (event.type !== 'devices') return;
      const value = event.value; const snapshot = { devices: value.devices, spaces: progress.spaces || currentSnapshot && currentSnapshot.spaces || [], scenes: progress.scenes || currentSnapshot && currentSnapshot.scenes || [], overview:retainedOverview, warnings: value.capabilityWarning ? [value.capabilityWarning] : [], selectedDeviceId: currentSnapshot && currentSnapshot.selectedDeviceId || '', connectedAt: Date.now(), isCached: false, deviceTotalCount: value.deviceTotalCount, devicePageNum: value.devicePageNum, devicePageSize: value.devicePageSize, hasMoreDevices: value.hasMoreDevices };
      const progressAnchor = captureViewportAnchor();
      currentSnapshot = snapshot; deviceProgressRendered = true; stableDeviceGridHeights.clear(); confirmedControlValues.clear(); controlOperations.clear(); pendingControls.clear(); renderFilters(snapshot.devices); renderDevices(progressAnchor); renderSummary(snapshot); renderNotice(snapshot); elements.fatalState.hidden = true; renderStudioHeader();
    };
    try {
      const snapshot = await global.StudioRuntime.load({ force: true, onProgress,homeSpaceChange:Boolean(options && options.homeSpaceChange) });
      const completionAnchor = captureViewportAnchor();
      if(retainedOverview && !snapshot.overview)snapshot.overview=retainedOverview;
      currentSnapshot = snapshot; snapshotScopeDid=dashboardDataDid; renderScenes(snapshot.scenes); renderSummary(snapshot); renderNotice(snapshot); elements.fatalState.hidden = true; renderStudioHeader();
      if (activeSpace !== '*' && !snapshot.hasMoreDevices && !snapshot.spaces.some(space => space.id === activeSpace) && !snapshot.devices.some(device => device.spaceId === activeSpace)) { activeSpace = '*'; renderDevices(completionAnchor); }
      renderFilters(snapshot.devices);
      if (!deviceProgressRendered) renderSnapshot(snapshot, completionAnchor);
      scheduleOverviewIndex();
    }
    catch (error) { if (currentSnapshot) { currentSnapshot = { ...currentSnapshot, warnings: phoneOffline() ? [] : [error instanceof Error ? error.message : t('fatalTitle')] }; renderNotice(currentSnapshot); renderStudioHeader(); if (!currentSnapshot.isCached) currentSnapshot.devices.forEach((device) => (device.controls || []).forEach((control) => setDeviceControlPending(device, control, false))); } else renderFatal(error); }
    finally { setBusy(false);if(currentSnapshot && !currentSnapshot.isCached)for(const device of currentSnapshot.devices)if(mountedDeviceCards.has(String(device.id))){const controls=new Map([...(device.controls || []),device.control].filter(Boolean).map(control=>[String(control.id),control]));for(const control of controls.values())setDeviceControlPending(device,control,pendingControls.has(controlKey(device.id,control.id)));const panel=mountedDeviceCards.get(String(device.id)).querySelector('.camera-stream');if(panel){const button=panel.querySelector('.camera-stream-button');if(button)button.disabled=panel.dataset.streamAvailability!=='available'||panel.dataset.streamState==='connecting';}} if(!initialLoadSettled){initialLoadSettled=true;nativeCollectionGate.release();} if(dashboardCollectionsDirty || dashboardCollectionTargets.size || dashboardTraitItems.length)scheduleDashboardData(); }
  }

  async function handleDevice(device, nextValue, selectedControl) {
    const control = selectedControl || device.control; if (phoneOffline()) { showToast(global.LifePhoneNetwork.errorText()); return; } if (isCachedSnapshot() || !control) return; const key = controlKey(device.id, control.id); if (pendingControls.has(key)) return;
    const revision = (controlOperations.get(key) || 0) + 1; controlOperations.set(key, revision); pendingControls.add(key); setDeviceActionStatus(device, '');
    const confirmed = confirmedControlValues.has(key) ? confirmedControlValues.get(key) : control.value;
    if (control.kind !== 'command') { control.value = nextValue; updateDeviceCardState(device, control); }
    setDeviceControlPending(device, control, true);
    try {
      const result = await global.StudioRuntime.executeDevice(device.id, nextValue, control.id);
      if (controlOperations.get(key) !== revision) return;
      pendingControls.delete(key); setDeviceControlPending(device, control, false);
      if (control.kind !== 'command') {
        const optimisticValue = control.value;
        global.StudioRuntime.readBackDevice(device.id, result.expected, control.id).then((readback) => {
          if (controlOperations.get(key) !== revision) return;
          confirmedControlValues.set(key, readback.actual);
          if (!controlValuesEqual(control, optimisticValue, readback.actual)) { control.value = readback.actual; updateDeviceCardState(device, control); setDeviceActionStatus(device, t('controlNotApplied')); }
        }).catch(() => { if (controlOperations.get(key) === revision) setDeviceActionStatus(device, t('stateUnconfirmed')); });
      }
    } catch {
      if (controlOperations.get(key) !== revision) return;
      pendingControls.delete(key); setDeviceControlPending(device, control, false);
      if (control.kind !== 'command') {
        try {
          const readback = await global.StudioRuntime.readBackDevice(device.id, nextValue, control.id, { immediate: true });
          if (controlOperations.get(key) === revision) { control.value = readback.actual; confirmedControlValues.set(key, readback.actual); updateDeviceCardState(device, control); }
        } catch { if (controlOperations.get(key) === revision) { control.value = confirmed; updateDeviceCardState(device, control); } }
      }
      if (controlOperations.get(key) === revision) setDeviceActionStatus(device, t('controlFailed'));
    }
  }

  async function loadMoreDevices() {
    if (busy || loadMoreBusy || isCachedSnapshot() || !hasMoreDevices()) return;
    const last = elements.deviceGrid.querySelector('.device-card:last-of-type'); const anchor = last ? captureLayoutAnchor('device', last.dataset.deviceId) : captureLayoutAnchor();
    loadMoreBusy = true; elements.loadMore.disabled = true; elements.loadMore.textContent = t('loadingMore');
    try {
      const result = await global.StudioRuntime.loadNextPage(); currentSnapshot = result.snapshot; renderFilters(currentSnapshot.devices); renderDevices(anchor, !childRoomPlan()); renderSummary(currentSnapshot); renderNotice(currentSnapshot); renderStudioHeader();
    } catch (error) { elements.noticeText.textContent = error instanceof Error ? error.message : t('loadMoreFailed'); elements.notice.hidden = false; }
    finally { loadMoreBusy = false; elements.loadMore.hidden = !hasMoreDevices() || Boolean(childRoomPlan() && global.StudioRuntime.spaceControlIndex().complete); elements.loadMore.disabled = busy || !hasMoreDevices(); elements.loadMore.textContent = hasMoreDevices() ? t('loadMore', { shown: currentSnapshot.devices.length, total: currentSnapshot.deviceTotalCount || currentSnapshot.devices.length }) : t('allDevicesLoaded'); }
  }

  // Gesture arbitration and presentation are shared; data callbacks retain their own ownership.
  function createPullRefreshController(global, document, options) {
    const app = options.app; const indicator = options.indicator; const text = options.text;
    const handlers = options.handlers; const active = options.active; const translate = options.translate;
    let content = app.querySelector('.pull-refresh-content');
    if (!content) {
      content = document.createElement('div'); content.className = 'pull-refresh-content';
      while (app.firstChild) content.appendChild(app.firstChild);
      app.appendChild(content);
    }
    let gesture = null; let pending = false; let revision = 0; let suppressClick = null;
    const listeners = [];
    function listen(target, type, callback, settings) { target.addEventListener(type, callback, settings); listeners.push([target, type, callback, settings]); }
    function present(distance, dragging) {
      content.classList.toggle('is-pulling', dragging);
      content.style.transform = distance > 0 ? 'translateY(' + distance + 'px)' : '';
      indicator.style.clip = distance > 0 ? 'rect(0px, 300px, ' + Math.min(40, distance + 4) + 'px, 0px)' : '';
      indicator.style.opacity = distance > 0 ? String(Math.min(1, distance / 44)) : '';
      indicator.classList.toggle('is-visible', distance > 0);
    }
    function clear(immediate) {
      gesture = null; revision += 1; present(0, immediate === true);
      if (immediate === true) global.requestAnimationFrame(() => { if (!gesture) content.classList.remove('is-pulling'); });
      indicator.classList.remove('is-ready', 'is-refreshing'); indicator.removeAttribute('aria-busy');
      text.textContent = translate('pull');
    }
    function blocked(target) {
      if (!target || target.nodeType !== 1 || !app.contains(target) || app.inert) return true;
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not([hidden]), .capability-sheet-layer:not([hidden])')) return true;
      if (target.closest('summary, input, select, textarea, label, video, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="switch"], [role="tab"], .device-direct-controls, .climate-panel, .camera-stream-controls, .studio-tabbar')) return true;
      const control = target.closest('button, a, [role="button"]');
      // List navigation and card details are taps, not continuous controls. A vertical drag can own them.
      if (control && !control.matches('.device-plugin-row, .device-card, .fd-entry, .fd-empty')) return true;
      for (let node = target; node && node !== app; node = node.parentElement) {
        const style = global.getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowX) || /(auto|scroll)/.test(style.overflowY)) return true;
      }
      return false;
    }
    function valid(event) {
      return gesture && event.touches.length === 1 && event.touches[0].identifier === gesture.id && active() === gesture.tab && global.scrollY <= 1 && !handlers[gesture.tab].busy();
    }
    listen(document, 'touchstart', event => {
      suppressClick = null;
      if (gesture) clear();
      const handler = handlers[active()];
      if (pending || !handler || handler.busy() || global.scrollY < -1 || global.scrollY > 1 || event.touches.length !== 1 || blocked(event.target)) return;
      const touch = event.touches[0];
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, tab: active(), target: event.target, locked: false, ready: false };
      event.stopPropagation();
    }, { passive: true, capture: true });
    listen(document, 'touchmove', event => {
      if (!gesture) return;
      if (!valid(event)) { clear(); return; }
      const dx = Math.abs(event.touches[0].clientX - gesture.x); const dy = event.touches[0].clientY - gesture.y;
      if (!gesture.locked) {
        if (Math.max(dx, Math.abs(dy)) < 8) return;
        if (dy < 8 || dy < dx * 1.5) { clear(); return; }
        gesture.locked = true;
      }
      if (dy <= 0 || dx > Math.max(24, dy * .8) || !event.cancelable) { clear(); return; }
      event.preventDefault(); event.stopPropagation();
      gesture.ready = dy >= 120;
      // Bounded resistance, no native bounce plus synthetic movement, and no tab-bar translation.
      present(Math.min(60, dy * .4), true);
      indicator.classList.toggle('is-ready', gesture.ready); text.textContent = translate(gesture.ready ? 'release' : 'pull');
    }, { passive: false, capture: true });
    listen(document, 'touchend', event => {
      if (!gesture) return;
      const ended = Array.prototype.some.call(event.changedTouches, touch => touch.identifier === gesture.id);
      const handler = handlers[gesture.tab];
      const ready = ended && event.touches.length === 0 && gesture.locked && gesture.ready && active() === gesture.tab && global.scrollY <= 1 && !handler.busy();
      if (gesture.locked) { suppressClick = { target: gesture.target, until: Date.now() + 500 }; event.stopPropagation(); }
      if (!ready) { clear(); return; }
      gesture = null; pending = true; const token = ++revision; present(44, false);
      indicator.classList.add('is-refreshing'); indicator.classList.remove('is-ready');
      indicator.setAttribute('aria-busy', 'true'); text.textContent = translate('refreshing');
      Promise.resolve().then(() => handler.refresh()).catch(() => {}).then(() => { pending = false; if (token === revision) clear(); });
    }, { passive: true, capture: true });
    listen(document, 'click', event => {
      if (!suppressClick || event.detail === 0 || Date.now() > suppressClick.until) return;
      const target = suppressClick.target; const row = target.closest('.device-plugin-row, .device-card, .fd-card');
      if (event.target === target || row && row.contains(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = null; }
    }, true);
    listen(document, 'touchcancel', () => { if (gesture) clear(); }, { passive: true, capture: true });
    listen(global, 'scroll', () => { if (gesture && global.scrollY > 1) clear(); }, { passive: true });
    listen(global, 'blur', () => clear(true));
    listen(document, 'visibilitychange', () => { if (document.hidden) clear(true); });
    return Object.freeze({ register: (tab, handler) => { handlers[tab] = handler; }, cancel: () => clear(true), dispose: () => { clear(true); listeners.forEach(item => item[0].removeEventListener(item[1], item[2], item[3])); } });
  }
  function installPullToRefresh() {
    global.StudioPullRefresh = createPullRefreshController(global, document, {
      app: elements.app, indicator: elements.pull, text: elements.pullText, translate: t,
      active: () => global.StudioTabs ? global.StudioTabs.active() : 'home',
      handlers: { home: { refresh: () => refresh({ quiet: true }), busy: () => busy || loadMoreBusy || pendingControls.size > 0 || pendingScenes.size > 0 || spaceControl.busy() || Boolean(favoriteDevices && favoriteDevices.busy()) } }
    });
  }

  global.StudioHomeRefresh = Object.freeze({
    refresh: () => {
      if(busy){queueDashboardCollectionRefresh();return;}
      dashboardCollectionTargets.clear();dashboardTraitItems=[];dashboardCollectionsDirty=false;
      return refresh();
    }, busy: () => busy,
    suspend: () => { if(dashboardAckTimer)global.clearTimeout(dashboardAckTimer);dashboardAckTimer=null; },
    flushPending: () => { if(dashboardCollectionTargets.size || dashboardCollectionResults.size || dashboardTraitItems.length || dashboardCollectionsDirty)scheduleDashboardData(); flushResumeReconcile(); },
    refreshScenes: () => { dashboardCollectionTargets.add('scenes');scheduleDashboardData(); }
  });
  elements.retry.addEventListener('click', () => refresh()); elements.loadMore.addEventListener('click', () => { elements.loadMore.blur(); loadMoreDevices(); });
  let chromeFrame = 0, chromeHeight = -1, chromeOpacity = -1;
  function updateScrollChrome() {
    const scrolled = global.scrollY > 8, opacity = Math.min(1, Math.max(0, global.scrollY) / 48);
    elements.topbar.classList.toggle('is-scrolled', scrolled);
    if (document.documentElement.dataset.pageScrolled !== String(scrolled)) document.documentElement.dataset.pageScrolled = String(scrolled);
    if (chromeOpacity !== opacity) { chromeOpacity = opacity; document.documentElement.style.setProperty('--top-chrome-opacity', String(opacity)); }
  }
  function updateChromeHeight() {
    const height = elements.topbar.hidden ? 0 : elements.topbar.getBoundingClientRect().height;
    if (height !== chromeHeight) { chromeHeight = height; document.documentElement.style.setProperty('--top-chrome-header-height', height + 'px'); }
  }
  global.addEventListener('scroll', () => { if (!chromeFrame) chromeFrame = global.requestAnimationFrame(() => { chromeFrame = 0; updateScrollChrome(); }); }, { passive: true });
  global.addEventListener('resize', updateChromeHeight);
  global.addEventListener('pageshow', () => { updateChromeHeight(); updateScrollChrome(); });
  if (typeof global.ResizeObserver === 'function') new global.ResizeObserver(updateChromeHeight).observe(elements.topbar);
  new MutationObserver(updateChromeHeight).observe(elements.topbar, { attributes: true, attributeFilter: ['hidden'] });
  updateChromeHeight(); updateScrollChrome();
  global.addEventListener('resize', () => { if(favoriteDeviceMode)return; if (global.StudioTabs && global.StudioTabs.active() !== 'home') return; const anchor = captureViewportAnchor(); transitionGridHeight = deviceGridContentHeight(); activeGridHeightKey = ''; const revision = ++layoutRevision; const key = lockDeviceGridHeight(); restoreLayoutAnchor(anchor, revision); releaseDeviceGridHeight(anchor, revision, key); }, { passive: true });
  elements.mine.addEventListener('click', async () => {
    if (elements.mine.disabled) return;
    const host = global.LifeBridge;
    if (!host || !host.capabilities().includes('openNavigationDrawer') || typeof host.openNavigationDrawer !== 'function') { showToast(t('drawerUnavailable')); return; }
    elements.mine.disabled = true; elements.mine.setAttribute('aria-busy', 'true');
    try { await host.openNavigationDrawer(); }
    catch (_) { showToast(t('drawerFailed')); }
    finally { elements.mine.disabled = false; elements.mine.removeAttribute('aria-busy'); }
  });
  async function openAIAssistant(content) {
    if (!aiAgentEnabled || elements.aiButton.disabled) return;
    const host = global.LifeBridge;
    if (!host || !host.capabilities().includes('openAIAssistant') || typeof host.openAIAssistant !== 'function') { showToast(t('aiUnavailable')); return; }
    const question = typeof content === 'string' ? content.trim() : '';
    if (question && !host.capabilities().includes('aiAssistantInitialMessage')) { showToast(t('aiQuestionUnavailable')); return; }
    const setAIBusy = value => { elements.aiButton.disabled = value; [elements.aiButton, elements.aiSection.querySelector('.ai-assistant-card')].forEach(node => { if (value) node.setAttribute('aria-busy', 'true'); else node.removeAttribute('aria-busy'); }); elements.aiSuggestions.querySelectorAll('button').forEach(button => { button.disabled = value; }); };
    setAIBusy(true);
    try { await host.openAIAssistant(question); }
    catch (error) {
      if (error && error.reason === 'disabled') { setAiAgentEnabled(false); showToast(t('aiDisabled')); }
      else showToast(t('aiFailed'));
    }
    finally { setAIBusy(false); }
  }
  elements.aiButton.addEventListener('click', () => { void openAIAssistant(); });
  const bridge = global.LifeBridge; if (bridge && typeof bridge.subscribeThemeMode === 'function') bridge.subscribeThemeMode(setTheme); if (bridge && typeof bridge.subscribeLanguage === 'function') bridge.subscribeLanguage((locale) => { global.LifeI18n.setLocale(locale); }); global.LifeI18n.onChange(() => { const anchor = captureViewportAnchor(); renderStaticLanguage(); if (currentSnapshot) renderSnapshot(currentSnapshot, anchor); favorites.language();spaceControl.language();if(favoriteDevices)favoriteDevices.language(); });
  global.LifeSpaceControl=Object.freeze({openDetail:spaceControl.openDetail});
  if(global.LifePhoneNetwork)global.LifePhoneNetwork.onChange(() => { renderStudioHeader(); if(phoneOffline()){if(currentSnapshot){currentSnapshot={...currentSnapshot,warnings:[]};renderNotice(currentSnapshot);}else if(!elements.fatalState.hidden)elements.fatalMessage.textContent=global.LifePhoneNetwork.unavailableText();}else if(dashboardResumeOfflinePending && !document.hidden && dashboardPageVisible){dashboardResumeOfflinePending=false;queueDashboardCollectionRefresh();} });
  setTheme(new URLSearchParams(global.location.search).get('themeMode') === 'dark' ? 'dark' : 'light'); renderStaticLanguage(); installPullToRefresh(); startAiAgentStatus(); startStudioStatus();
  global.addEventListener('pagehide', () => { if (disposeAiAgentStatus) disposeAiAgentStatus(); disposeAiAgentStatus = null; });
  global.addEventListener('pagehide', () => { if (disposeStudioStatus) disposeStudioStatus(); disposeStudioStatus = null; });
  global.addEventListener('pagehide', () => { nativeCollectionGate.reset();dashboardWatchPoints.clear();snapshotScopeDid='';if(disposeDashboardData)disposeDashboardData();disposeDashboardData=null;dashboardDataDid='';if(dashboardDataTimer)global.clearTimeout(dashboardDataTimer);dashboardDataTimer=null;if(dashboardAckTimer)global.clearTimeout(dashboardAckTimer);dashboardAckTimer=null;dashboardCollectionTargets.clear();dashboardCollectionResults.clear();dashboardTraitItems=[];dashboardCollectionsDirty=false;dashboardResumeReconcilePending=false;dashboardResumeOfflinePending=false; });
  global.addEventListener('pageshow', event => { if (event.persisted){dashboardWasHidden=false;dashboardResumeReconcilePending=false;startAiAgentStatus();startStudioStatus();queueDashboardCollectionRefresh();} });
  function resumeDashboard(){
    if(!dashboardWasHidden || document.hidden || !dashboardPageVisible)return;
    dashboardWasHidden=false;
    if(phoneOffline()){dashboardResumeOfflinePending=true;return;}
    if(busy)return;
    if(dashboardResumeOfflinePending || shouldRefreshOnResume(currentSnapshot,Date.now())){dashboardResumeOfflinePending=false;dashboardResumeReconcilePending=false;queueDashboardCollectionRefresh();return;}
    if(dashboardCollectionTargets.size || dashboardCollectionResults.size || dashboardTraitItems.length)scheduleDashboardData();
    dashboardResumeReconcilePending=true;flushResumeReconcile();
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)dashboardWasHidden=true;else resumeDashboard();});
  if(bridge && typeof bridge.subscribePageVisibility==='function')bridge.subscribePageVisibility(value=>{dashboardPageVisible=Boolean(value.visible);if(!value.visible)dashboardWasHidden=true;else{resumeDashboard();if(disposeAiAgentStatus && typeof disposeAiAgentStatus.refresh==='function')disposeAiAgentStatus.refresh();}});
  const cached = global.StudioRuntime.loadCached(); if (cached) { renderSnapshot(cached); setBusy(false); refresh({ quiet: true }); } else refresh();
})(window, document);
