(function installStudioRuntime(global) {
  'use strict';

  const config = global.__LIFE_STUDIO_DASHBOARD_CONFIG__ || {};
  const routes = Object.freeze({
    queryMetadata: Object.freeze({method:'POST',path:'/users/me/metadata/query',idempotent:true,retryable:false,sideEffect:'none'}),
    updateMetadata: Object.freeze({method:'POST',path:'/users/me/metadata/update',idempotent:false,retryable:false,sideEffect:'user_preferences'}),
    devices: Object.freeze({ method: 'GET', path: '/devices', idempotent: true, retryable: true, sideEffect: 'none' }),
    spaces: Object.freeze({ method: 'GET', path: '/spaces', idempotent: true, retryable: true, sideEffect: 'none' }),
    definitions: Object.freeze({ method: 'GET', path: '/devices/definitions', idempotent: true, retryable: true, sideEffect: 'none' }),
    scenes: Object.freeze({ method: 'GET', path: '/scenes', idempotent: true, retryable: true, sideEffect: 'none' }),
    executeTrait: Object.freeze({ method: 'POST', path: '/devices/trait/execute', idempotent: false, retryable: false, sideEffect: 'device_state_change' }),
    readTrait: Object.freeze({ method: 'POST', path: '/devices/trait/read', idempotent: true, retryable: false, sideEffect: 'none' }),
    executeCommand: Object.freeze({ method: 'POST', path: '/devices/command/execute', idempotent: false, retryable: false, sideEffect: 'device_state_change' }),
    executeManualScene: Object.freeze({ method: 'POST', path: '/automations/manual-triggers/execute', idempotent: false, retryable: false, sideEffect: 'write' }),
    executeScene: Object.freeze({ method: 'POST', path: '/scenes/execute', idempotent: false, retryable: false, sideEffect: 'write' }),
  });
  let homeSpaceId=String(config.homeSpaceId || ''),homeSpacePromise=null,homeSpaceEpoch=0;
  const cacheKey = () => `life-studio-dashboard:v8:${collectionScope}:${config.scope || 'studio'}:${selectedDeviceId() || 'all'}${config.role || homeSpaceId || config.homeSpaceRequired ? ':'+(config.role || '')+':'+homeSpaceId : ''}${config.homeSpaceSelection==='first-room'?':first-room':''}${config.overviewEnvironmentSpaceId?':env:'+config.overviewEnvironmentSpaceId:''}`;
  const cacheTtlMs = Math.max(30, Number(config.cacheTtlSeconds) || 300) * 1000;
  const safeCommandCodes = new Set(asArray(config.safeCommandCodes).map(String));
  const curtainPositionTraits = Object.freeze({ target: 'TargetPositionPercentage', current: 'CurrentPositionPercentage' });
  let latestControls = new Map();
  let activeSnapshot = null; let activeSnapshotScopeEpoch = -1; let activeSpaceRevision = 0; let spaceFullLimit=0; let spaceFullPromise=null;
  let loadRevision = 0;
  let nextPagePromise = null;
  let overviewPromise = null; let overviewIndexBuilding = false;
  let overviewCatalogPromise = null;
  let overviewCatalog = null;
  let capabilityModels = new Map();
  let capabilityPromises = new Map();
  const spaceObservations=new Map(), spaceObservationVersions=new Map();let spaceObservationGeneration=0,capabilityGeneration=0,spaceIndexCache=null;
  function invalidateSpaceObservations(ids){const keys=ids || [...capabilityModels.keys()];for(const id of keys){spaceObservations.delete(id);spaceObservationVersions.set(id,(spaceObservationVersions.get(id)||0)+1);}spaceObservationGeneration++;}
  let entitySequence=0; let entityVersions=new Map(); let favoriteCheckedAt=new Map(); let favoriteRefreshFlight=null; const favoriteWrites=new Set();
  const pushedTraitTimes=new Map();
  let favoriteSupplement = new Map(); let favoriteResolvePromise = null; let favoriteInvalidIds=new Set(); let favoriteRefreshRevision=0;

  function valueOr(value, fallback) { return value === null || value === undefined ? fallback : value; }
  function settle(promise) { return Promise.resolve(promise).then((value) => ({ status: 'fulfilled', value }), (reason) => ({ status: 'rejected', reason })); }
  function selectedDeviceId() {
    const bridge = global.LifeBridge;
    const launchContext = bridge && bridge.launchContext;
    const context = typeof launchContext === 'function' ? launchContext() : null;
    return String(context && context.deviceId || '');
  }
  function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function asArray(value) { if (Array.isArray(value)) return value; const object = asObject(value); return Array.isArray(object.data) ? object.data : []; }
  function errorMessage(value) { return value && typeof value.message==='string' ? value.message : 'Studio request failed'; }
  function apiURL(path) { return `${String(config.apiPath || '/open/api/v1').replace(/\/$/, '')}${path}`; }

  function unwrapEnvelope(response) {
    const envelope = asObject(response);
    if (Object.keys(envelope).length > 0 && 'code' in envelope && Number(envelope.code) !== 0) {
      const error = new Error(envelope.message || `Studio error ${envelope.code}`); error.code = envelope.code; error.data = envelope.data; throw error;
    }
    return 'data' in envelope ? envelope.data : response;
  }

  function addQuery(url, params) {
    const query = new URLSearchParams();
    Object.entries(asObject(params)).forEach(([key, raw]) => {
      const values = Array.isArray(raw) ? raw : [raw];
      values.forEach((value) => { if (value !== undefined && value !== null && value !== '') query.append(key, String(value)); });
    });
    const text = query.toString(); return text ? `${url}?${text}` : url;
  }

  async function directRequest(route, options) {
    if (!config.allowDirectFetch || !config.studioBaseUrl || !config.studioHost) throw new Error('Life native request bridge is unavailable');
    const auth = await global.LifeBridge.getStudioAuthInfo(config.studioHost);
    if (!auth || !auth.accessToken) throw new Error('Studio access token is unavailable');
    const base = `${String(config.studioBaseUrl).replace(/\/$/, '')}${apiURL(route.path)}`;
    const headers = { Accept: 'application/json', Authorization: `Bearer ${auth.accessToken}` };
    if (auth.clientId) headers.ClientId = String(auth.clientId);
    if (options && options.data !== undefined) headers['Content-Type'] = 'application/json';
    const response = await global.fetch(addQuery(base, options && options.params), {
      method: route.method, headers, body: !options || options.data === undefined ? undefined : JSON.stringify(options.data),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(asObject(payload).message || `HTTP ${response.status}`);
    return payload;
  }

  // Page-local read sharing. Definitions, writes and targeted readback never enter this cache.
  const collectionPaths=new Set(['/devices','/spaces','/scenes','/automations']);
  const collectionCache=new Map(),collectionFlights=new Map();let collectionScope='',collectionEpoch=0,collectionConfirmed=false;
  const cloneCollection=value=>JSON.parse(JSON.stringify(value));
  function invalidateCollections(paths){for(const [key,entry] of collectionCache)if(!paths || paths.includes(entry.path))collectionCache.delete(key);for(const [key,operation] of collectionFlights)if(!paths || paths.includes(operation.path))collectionFlights.delete(key);}
  function setCollectionScope(studioDid,userId){const next=studioDid?JSON.stringify([String(studioDid),String(userId || '')]):'';if(next===collectionScope)return false;const changed=Boolean(collectionScope) || Boolean(next && collectionConfirmed);collectionScope=next;collectionConfirmed=collectionConfirmed || Boolean(next);if(changed){collectionEpoch++;collectionCache.clear();collectionFlights.clear();spaceObservations.clear();spaceObservationVersions.clear();pushedTraitTimes.clear();}if(changed && global.dispatchEvent && typeof global.CustomEvent==='function')global.dispatchEvent(new global.CustomEvent('aqara:collection-scope-changed'));return changed;}
  function collectionReady(){return Boolean(collectionScope);}
  function collectionVersion(){return collectionEpoch;}
  async function readCollection(path,params,options){
    if(!collectionPaths.has(path))throw new Error('Unsupported collection read');
    const query=params || {},scope=collectionScope,epoch=collectionEpoch;
    const key=JSON.stringify([epoch,config.apiPath || '/open/api/v1',config.requestMode || 'sdkMode',path,Object.keys(query).sort().map(name=>[name,query[name]])]);
    if(options && options.fresh)invalidateCollections([path]);
    const cached=collectionCache.get(key);if(scope && cached && Date.now()-cached.at<30000)return cloneCollection(cached.value);
    const current=collectionFlights.get(key);if(current)return cloneCollection(await current);
    const operation=requestTransport({method:'GET',path},{params:query}).then(value=>{
      if(epoch!==collectionEpoch || scope && scope!==collectionScope)throw new Error('Studio collection scope changed');
      if(path==='/scenes'?!validScenePage(value):path==='/spaces'?!Array.isArray(value):!value || !Array.isArray(value.data))throw new Error('Invalid Studio collection');
      if(collectionScope && epoch===collectionEpoch && collectionFlights.get(key)===operation){collectionCache.delete(key);collectionCache.set(key,{path,at:Date.now(),value:cloneCollection(value)});while(collectionCache.size>32)collectionCache.delete(collectionCache.keys().next().value);}
      return value;
    }).finally(()=>{if(collectionFlights.get(key)===operation)collectionFlights.delete(key);});
    operation.path=path;collectionFlights.set(key,operation);return cloneCollection(await operation);
  }
  async function request(route,options){
    if(route===routes.devices && (homeSpaceId || config.homeSpaceRequired)){const scoped=await homeSpaceParams();if(scoped===null)return {data:[],totalCount:0,pageNum:options && options.params && options.params.pageNum || 1};options={...options,params:{...options && options.params,...scoped}};}
    if(route.method==='GET' && collectionPaths.has(route.path))return readCollection(route.path,options && options.params,options);
    const rows=asArray(options && options.data && options.data.data), revision=loadRevision, epoch=collectionEpoch;
    const versions=new Map(rows.map(row=>[String(row.deviceId || ''),spaceObservationVersions.get(String(row.deviceId || ''))||0]));
    if(route===routes.executeTrait || route===routes.executeCommand)invalidateSpaceObservations([...versions.keys()]);
    if(route===routes.executeScene || route===routes.executeManualScene)invalidateSpaceObservations();
    const value=await requestTransport(route,options);
    if(route===routes.readTrait && revision===loadRevision && epoch===collectionEpoch)for(const raw of asArray(value)){
      const id=String(raw.deviceId || '');if(!versions.has(id) || versions.get(id)!==(spaceObservationVersions.get(id)||0))continue;
      if(!rows.some(row=>String(row.deviceId)===id && Number(row.endpointId)===Number(raw.endpointId) && row.functionCode===raw.functionCode && asArray(row.traitCodes).includes(raw.traitCode)))continue;
      const model=capabilityModels.get(id), point=asArray(model && model.readings).find(row=>Number(row.endpointId)===Number(raw.endpointId) && row.functionCode===raw.functionCode && row.traitCode===raw.traitCode);
      if(point)rememberSpaceObservation(id,point,raw.value);
    }
    return value;
  }
  function rememberSpaceObservation(id,point,value){
    if(!/^(OnOff|Power|PowerState)$/.test(point.traitCode))return;
    if(value===null || value===undefined || value==='')return;
    if(/^(bool|boolean)$/i.test(point.type))value=parseBoolean(value);
    else if(/^(integer|float|number)$/i.test(point.type)){value=typeof value==='number'?value:typeof value==='string' && value.trim()?Number(value):NaN;if(!Number.isFinite(value) || Number.isFinite(point.min) && value<point.min || Number.isFinite(point.max) && value>point.max)return;}
    if(value===null)return;
    const points=spaceObservations.get(id)||new Map();points.set(point.id,{endpointId:point.endpointId,functionCode:point.functionCode,traitCode:point.traitCode,value,at:Date.now()});spaceObservations.set(id,points);spaceObservationGeneration++;
  }

  // Apply only known public-definition points; object changes still require a collection refresh.
  function applyPushedTraitValues(items) {
    const changed=new Set();
    if(!activeSnapshot || activeSnapshot.isCached || !Array.isArray(items))return {deviceIds:[],overview:activeSnapshot && activeSnapshot.overview || null};
    for(const item of items.slice(0,200)) {
      const id=String(item && item.deviceId || ''),endpoint=Number(item && item.endpointId),fn=String(item && item.functionCode || ''),code=String(item && item.traitCode || ''),raw=item && item.value;
      if(!id || !Number.isInteger(endpoint) || endpoint<0 || !fn || !code || raw===null || raw===undefined || raw==='')continue;
      const key=JSON.stringify([id,endpoint,fn,code]),time=Number(item.time),previous=pushedTraitTimes.get(key);
      if(previous && (!Number.isFinite(time) || time<=previous))continue;
      const models=[...new Set([capabilityModels.get(id),activeSnapshot.devices.find(device=>device.id===id),overviewCatalog && overviewCatalog.devices.find(device=>device.id===id)].filter(Boolean))];
      if(!models.length)continue;
      let accepted=false;
      for(const model of models){
        if(endpoint===0 && code==='Reachable'){const online=parseBoolean(raw);if(online!==null){model.online=online;model.favoriteOnline=online;accepted=true;}}
        if(endpoint===0 && code==='EndpointName' && typeof raw==='string' && raw.trim()){model.name=raw.trim();accepted=true;}
        for(const control of asArray(model.controls)){
          if(control.endpointId!==endpoint || control.functionCode!==fn || control.traitCode!==code || control.kind==='command')continue;
          const value=normalizeControlValue(control,raw);
          if(value===null || control.kind==='range' && (!Number.isFinite(value) || Number.isFinite(control.min) && value<control.min || Number.isFinite(control.max) && value>control.max) || control.kind==='enum' && asArray(control.options).length && !control.options.some(option=>String(option.value)===value))continue;
          control.value=value;accepted=true;
        }
        for(const point of asArray(model.readings)){
          if(point.endpointId!==endpoint || point.functionCode!==fn || point.traitCode!==code)continue;
          let value=raw;
          if(/^(bool|boolean)$/i.test(point.type)){value=parseBoolean(raw);if(value===null)continue;}
          if(/^(integer|float|number)$/i.test(point.type)){value=Number(raw);if(!Number.isFinite(value) || Number.isFinite(point.min) && value<point.min || Number.isFinite(point.max) && value>point.max)continue;}
          point.value=value;point.displayValue=displayValue(value,{type:point.type,unit:point.unit});rememberSpaceObservation(id,point,value);
          for(const telemetry of asArray(model.telemetry))if(telemetry.id===point.id)telemetry.value=point.displayValue;
          accepted=true;
        }
      }
      if(accepted){changed.add(id);if(Number.isFinite(time) && time>0){pushedTraitTimes.delete(key);pushedTraitTimes.set(key,time);if(pushedTraitTimes.size>5000)pushedTraitTimes.delete(pushedTraitTimes.keys().next().value);}}
    }
    if(changed.size){
      capabilityGeneration++;
      if(activeSnapshot.overview){const previous=activeSnapshot.overview;activeSnapshot.overview=deriveOverview(spaceControlIndex().devices,previous.deviceTotalCount,previous.failedDeviceCount,previous.status);}
    }
    return {deviceIds:[...changed],overview:activeSnapshot.overview || null};
  }

  function dashboardWatchedTraits() {
    if(!activeSnapshot || activeSnapshot.isCached || activeSnapshotScopeEpoch!==collectionEpoch)return [];
    const points=[],seen=new Set(),models=new Map();
    for(const device of activeSnapshot.devices)if(device && device.id)models.set(device.id,device);
    if(overviewCatalog)for(const device of overviewCatalog.devices)if(device && device.id)models.set(device.id,device);
    for(const [id,device] of capabilityModels)models.set(id,device);
    const add=(deviceId,endpointId,functionCode,traitCode)=>{
      if(!deviceId || !Number.isInteger(endpointId) || endpointId<0 || !functionCode || !traitCode)return;
      const key=JSON.stringify([deviceId,endpointId,functionCode,traitCode]);if(seen.has(key))return;seen.add(key);
      points.push({deviceId,endpointId,functionCode,traitCode});
    };
    for(const [id,device] of models){
      add(id,0,'EndpointLabel','EndpointName');add(id,0,'BasicInformation','Reachable');
      for(const point of asArray(device.controls).concat(asArray(device.readings)))if(point.kind!=='command')add(id,point.endpointId,point.functionCode,point.traitCode);
    }
    // A too-large Home requires explicit refresh; never silently expose an incomplete live subset.
    return points.length<=4096?points:[];
  }

  // An ACK confirms a subscription change, not a collection change. Reconcile
  // only mounted devices, with a fixed request budget, and keep the live snapshot.
  async function reconcileDashboardTraits(deviceIDs) {
    if(!activeSnapshot || activeSnapshot.isCached)return {deviceIds:[],overview:activeSnapshot && activeSnapshot.overview || null};
    const revision=loadRevision,epoch=collectionEpoch,ids=new Set(asArray(deviceIDs).map(String));
    const groups=new Map();
    for(const point of dashboardWatchedTraits()){
      if(!ids.has(point.deviceId) || groups.size>=96 && !groups.has(JSON.stringify([point.deviceId,point.endpointId,point.functionCode])))continue;
      const key=JSON.stringify([point.deviceId,point.endpointId,point.functionCode]);
      if(!groups.has(key))groups.set(key,{deviceId:point.deviceId,endpointId:point.endpointId,functionCode:point.functionCode,traitCodes:[]});
      const row=groups.get(key);if(row.traitCodes.length<12 && !row.traitCodes.includes(point.traitCode))row.traitCodes.push(point.traitCode);
    }
    const changed=new Set();let overview=activeSnapshot.overview || null;
    const rows=[...groups.values()];
    for(let start=0;start<rows.length;start+=32){
      const values=asArray(await request(routes.readTrait,{data:{data:rows.slice(start,start+32)}}));
      if(revision!==loadRevision || epoch!==collectionEpoch)return {deviceIds:[],overview:activeSnapshot && activeSnapshot.overview || null};
      const result=applyPushedTraitValues(values);result.deviceIds.forEach(id=>changed.add(id));overview=result.overview;
    }
    return {deviceIds:[...changed],overview};
  }

  async function refreshDashboardCollection(collection) {
    if(!activeSnapshot || activeSnapshot.isCached)return null;
    const revision=loadRevision,epoch=collectionEpoch;
    invalidateCollections([collection==='spaces'?'/spaces':'/scenes']);
    const value=collection==='spaces'?flattenSpaces(await request(routes.spaces)):await listScenes();
    if(revision!==loadRevision || epoch!==collectionEpoch || !activeSnapshot || activeSnapshot.isCached)return null;
    activeSnapshot={...activeSnapshot,[collection]:value,...(collection==='scenes'?{sceneCatalogStatus:'ready'}:{})};
    cacheStore(activeSnapshot);
    return value;
  }

  async function requestTransport(route, options, replayRecovered) {
    if (route.sideEffect && route.sideEffect !== 'none' && global.LifePhoneNetwork && global.LifePhoneNetwork.isOffline()) throw new Error(global.LifePhoneNetwork.errorText());
    const revision=loadRevision,epoch=collectionEpoch;
    try {
    const bridge = global.LifeBridge;
    const response = bridge && bridge.supports('nativeHttpRequest')
      ? await bridge.nativeHttpRequest({
        url: apiURL(route.path), method: route.method, params: options && options.params || {}, headers: { source: 'studio' },
        ...(!options || options.data === undefined ? {} : { data: options.data }), modeType: config.requestMode || 'sdkMode',
      })
      : await directRequest(route, options);
    if((route===routes.queryMetadata || route===routes.updateMetadata) && (!response || ![0,'0'].includes(response.code)))throw new Error('Invalid metadata response');
    return unwrapEnvelope(response);
    } catch(error) {
      if(route===routes.definitions && !replayRecovered && revision===loadRevision && epoch===collectionEpoch && /\bReplay request is rejected\b/i.test(errorMessage(error)))return requestTransport(route,options,true);
      throw error;
    }
  }

  function flattenSpaces(spaces, result, depth = 0, parentId = '') {
    const target = result || [];
    asArray(spaces).forEach((raw) => { const item = asObject(raw); const id = String(item.spaceId || item.id || ''); if (id) target.push({ id, name: String(item.name || ''), isRoot: depth === 0, parentId }); flattenSpaces(item.children, target, depth + 1, id); });
    return target;
  }

  function devicePage(value) {
    const object = asObject(value); const items = Array.isArray(value) ? value : asArray(object.data || value);
    return { items, totalCount: Number(object.totalCount), pageNum: Number(object.pageNum) };
  }

  function backendPageSize() { return Math.min(200, Math.max(4, Number(config.backendPageSize || config.devicePageSize) || 12)); }
  function overviewCatalogPageSize() { return Math.min(200, Math.max(40, Number(config.overviewCatalogPageSize) || 200)); }
  function overviewDefinitionBatchSize() { return Math.min(80, Math.max(10, Number(config.overviewDefinitionBatchSize || config.definitionBatchSize) || 40)); }
  function overviewMaxDevices() { return Math.max(spaceFullLimit,overviewCatalogPageSize(), Number(config.overviewMaxDevices) || 200); }

  function getHomeSpace(){return homeSpaceId;}
  function setHomeSpace(id){if(typeof id!=='string' || !id.trim() || id.length>256)throw new Error('Invalid Home space');homeSpaceId=id.trim();homeSpacePromise=null;activeSnapshot=null;latestControls=new Map();overviewCatalog=null;}
  async function homeSpaceParams(){
    const autoFirst=config.homeSpaceRequired && config.homeSpaceSelection==='first-room';
    if(!homeSpaceId && !autoFirst)return config.homeSpaceRequired?null:{};
    if(homeSpacePromise)return homeSpacePromise;
    const chosen=homeSpaceId,revision=loadRevision,epoch=collectionEpoch;
    homeSpacePromise=(async()=>{
      const spaces=flattenSpaces(await request(routes.spaces));
      if(chosen!==homeSpaceId || revision!==loadRevision || epoch!==collectionEpoch)throw new Error('Home space changed');
      const first=!chosen && spaces.find(row=>!row.isRoot && !spaces.some(child=>child.parentId===row.id));
      const resolved=chosen || first && first.id;
      if(!resolved)return null;
      if(!spaces.some(row=>row.id===resolved))throw new Error('Home space is unavailable');
      const ids=spaces.filter(row=>{let id=row.id;const seen=new Set();while(id && !seen.has(id)){if(id===resolved)return true;seen.add(id);const parent=spaces.find(s=>s.id===id);id=parent && parent.parentId;}return false;}).map(row=>row.id);
      if(!chosen)homeSpaceId=resolved;
      return {spaceIds:ids.join(','),needChildren:false};
    })();return homeSpacePromise;
  }
  async function loadDevicePage(pageNum) {
    const pageSize = backendPageSize();const spaceParams=await homeSpaceParams();if(spaceParams===null)return {items:[],totalCount:0,pageNum,pageSize};
    const page = devicePage(await request(routes.devices, { params: { pageNum, pageSize, includeSpace:true, ...spaceParams } }));
    return { ...page, pageNum: Number.isFinite(page.pageNum) && page.pageNum > 0 ? page.pageNum : pageNum, pageSize };
  }

  async function loadInitialDevicePage() {
    if (config.scope !== 'selected-device') return loadDevicePage(1);
    const targetId = selectedDeviceId();
    if (!targetId) throw new Error('Life 插件入口未提供 did，无法打开单设备控制页');
    for (let pageNum = 1; pageNum <= 100; pageNum += 1) {
      const page = await loadDevicePage(pageNum);
      const selected = page.items.find((raw) => String(asObject(raw).deviceId || asObject(raw).id || '') === targetId);
      if (selected) return { ...page, items: [selected], totalCount: 1, selectedLookup: true };
      if (page.items.length < page.pageSize || (Number.isFinite(page.totalCount) && pageNum * page.pageSize >= page.totalCount)) break;
    }
    throw new Error('当前 Studio 中未找到插件入口指定的设备');
  }

  function classifyDevice(types, name) {
    if (asArray(types).some(type => /^(?:AirConditioner|SingleSetpointAC)$/i.test(String(type)))) return 'climate';
    const value = `${asArray(types).join(' ')} ${name}`.toLowerCase();
    if (/light|lamp|bulb|灯|照明/.test(value)) return 'light';
    if (/curtain|blind|shade|cover|窗帘|卷帘/.test(value)) return 'curtain';
    if (/outlet|plug|socket|switch|插座|开关/.test(value)) return 'outlet';
    if (/therm|climate|aircondition|heater|fan|purifier|温控|空调|风扇|净化/.test(value)) return 'climate';
    if (/lock|门锁|锁/.test(value)) return 'lock';
    if (/camera|doorbell|摄像|门铃/.test(value)) return 'camera';
    if (/smoke|gas|leak|water|alarm|safety|烟|燃气|水浸|报警/.test(value)) return 'safety';
    if (/sensor|motion|presence|contact|lux|weather|传感|人体|存在|门窗/.test(value)) return 'sensor';
    if (/vacuum|sweep|robot|扫地|清洁/.test(value)) return 'vacuum';
    if (/speaker|media|audio|tv|音响|电视/.test(value)) return 'media';
    if (/hub|gateway|bridge|网关/.test(value)) return 'hub';
    return 'device';
  }

  function strictOnline(item) {
    const parse=value=>value===true || value===1 || value==='true' || value==='1'?true:value===false || value===0 || value==='false' || value==='0'?false:null;
    const state=parse(item.state),online=parse(item.online);return state===false || online===false?false:state!==null?state:online;
  }
  function normalizeDevice(raw) {
    const item = asObject(raw); const space = asObject(item.space); const types = Array.isArray(item.deviceTypesList) ? item.deviceTypesList.map(String) : [];
    const name = String(item.deviceName || item.name || '');
    return { id: String(item.deviceId || item.id || ''), name, types, category: classifyDevice(types, name), model: item.model ? String(item.model) : '', online: item.state !== false && item.online !== false, favoriteOnline: strictOnline(item), favoriteSummaryVersion: ++entitySequence, spaceId: String(space.spaceId || space.id || ''), spaceName: String(space.name || ''), control: null, telemetry: [] };
  }

  function applyDeviceScope(devices) {
    const selectedId = selectedDeviceId();
    if (!selectedId) { if (config.scope === 'selected-device') throw new Error('Life 插件入口未提供 did，无法打开单设备控制页'); return devices; }
    const selected = devices.filter((device) => device.id === selectedId);
    if (config.scope === 'selected-device') { if (!selected.length) throw new Error('当前 Studio 中未找到插件入口指定的设备'); return selected; }
    return selected.concat(devices.filter((device) => device.id !== selectedId));
  }

  function parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 1 || value === '1') return true;
    if (value === 'false' || value === 0 || value === '0') return false;
    return null;
  }

  function normalizedSupportedValues(parameter) {
    return asArray(parameter.supportedValues).map((raw) => {
      const item = asObject(raw); return { label: String(valueOr(item.key, valueOr(item.name, valueOr(item.value, '')))), value: String(valueOr(item.value, valueOr(item.key, ''))) };
    }).filter((item) => item.value !== '');
  }

  function normalizedTraitCode(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function isOperationalMetadataCode(value) {
    const code = normalizedTraitCode(value);
    if (!code) return true;
    return /^(?:deviceid|nodeid|rootnodeid|mac|macaddress|eui|eui64|ieee|ieeeaddress|networkid|productid|vendorid|serial|serialnumber|uuid)$/.test(code)
      || /(?:firmware|hardware|software|manufacturer|vendor|productmodel|modelnumber|serialnumber|endpointname|endpointicon|endpointroom|identify|calibr|transitiontime|factory|debug|configuration|config)/.test(code)
      || /^(?:connectionstatus|connectstatus|connectivity|linkstatus|linkquality|networkstatus|reachable|online)$/.test(code);
  }

  function traitControl(deviceId, endpoint, deviceFunction, trait, fallbackValue) {
    const parameter = asObject(trait.parameter); if (parameter.writable !== true || parameter.dynamicSchema) return null;
    const type = String(parameter.type || '').toLowerCase(); const effectiveValue = trait.value === null || trait.value === undefined || trait.value === '' ? fallbackValue : trait.value; const base = {
      id: `${endpoint.endpointId}:${deviceFunction.functionCode}:${trait.traitCode}`, deviceId, endpointDeviceType:String(endpoint.deviceType || ''), endpointId: Number(endpoint.endpointId), functionCode: String(deviceFunction.functionCode || ''), traitCode: String(trait.traitCode || ''), label: String(trait.pointName || trait.traitCode || ''), value: effectiveValue,
    };
    if (!Number.isFinite(base.endpointId) || !base.functionCode || !base.traitCode) return null;
    if (isOperationalMetadataCode(base.traitCode)) return null;
    const bool = parseBoolean(effectiveValue);
    if ((type === 'bool' || type === 'boolean') && bool !== null) return { ...base, kind: 'boolean', value: bool };
    const options = normalizedSupportedValues(parameter);
    if ((type === 'enum' || options.length) && options.length) return { ...base, kind: 'enum', value: String(valueOr(effectiveValue, '')), options };
    const min = Number(parameter.min); const max = Number(parameter.max); const step = Number(parameter.step);
    if ((type === 'integer' || type === 'float' || type === 'number') && Number.isFinite(min) && Number.isFinite(max) && max > min && Number.isFinite(Number(effectiveValue))) {
      return { ...base, kind: 'range', value: Number(effectiveValue), min, max, step: Number.isFinite(step) && step > 0 ? step : (type === 'integer' ? 1 : (max - min) / 100), unit: String(parameter.unit || '') };
    }
    return null;
  }

  function commandControl(deviceId, endpoint, deviceFunction, command) {
    const fields = asArray(command.fields); const commandCode = String(command.commandCode || '');
    if (fields.length !== 0 || !safeCommandCodes.has(commandCode)) return null;
    const endpointId = Number(endpoint.endpointId); const functionCode = String(deviceFunction.functionCode || '');
    if (!Number.isFinite(endpointId) || !functionCode || !commandCode) return null;
    return { id: `${endpointId}:${functionCode}:command:${commandCode}`, kind: 'command', deviceId, endpointId, functionCode, commandCode, label: String(command.pointName || command.description || commandCode) };
  }

  const cameraProtocolCodes = Object.freeze({
    offer: new Set(['WebRTCProvideOffer', '40336']),
    localIce: new Set(['WebRTCProvideICECandidates', '40338']),
    end: new Set(['WebRTCEndSession', '40339']),
    signaling: new Set(['WebRTCSignalingEvent', '20778']),
  });

  function exactProtocolCode(value, accepted) {
    const code = String(valueOr(value, '')).trim();
    return accepted.has(code) ? code : '';
  }

  function controlPriority(control, category) {
    const code = normalizedTraitCode(control.traitCode || control.commandCode);
    if (category === 'curtain') {
      if (control.kind === 'range' && code === normalizedTraitCode(curtainPositionTraits.target)) return 0;
      if (control.kind === 'range' && /target.*position|position.*percent|curtain.*position/.test(code)) return 1;
      if (control.kind === 'range' && /position|level|percent/.test(code)) return 2;
      if (control.kind === 'command') return 3;
      if (control.kind === 'enum') return 4;
      if (control.kind === 'boolean') return 5;
      if (control.kind === 'range') return 6;
      return 7;
    }
    if (/^(?:onoff|power|powerswitch|mainswitch)$/.test(code)) return 0;
    if (category === 'climate' && /^(?:fanswitch|fanonoff)$/.test(code)) return 1;
    if (control.kind === 'boolean') return 1;
    if (/currentlevel|brightness|position|temperature/.test(code)) return 2;
    if (control.kind === 'enum') return 3;
    if (control.kind === 'range') return 4;
    return 5;
  }

  function displayValue(value, parameter) {
    if (value === null || value === undefined || value === '') return '';
    const bool = parseBoolean(value); if (bool !== null && String(parameter.type || '').toLowerCase().includes('bool')) return bool ? 'On' : 'Off';
    const option = normalizedSupportedValues(parameter).find((item) => item.value === String(value));
    return `${option && option.label || value}${parameter.unit || ''}`;
  }

  function isPresentationReading(reading) {
    return !isOperationalMetadataCode(reading.traitCode);
  }

  function readingPriority(reading) {
    const code = String(reading.traitCode || '').toLowerCase();
    if (/currenttemperature|roomtemperature|currenthumidity|currentilluminance|airquality/.test(code)) return 0;
    if (/onoff|power|currentlevel|position|occupancy|contact|motion/.test(code)) return 1;
    if (/battery|reachable|alarm|smoke|gas|leak|status/.test(code)) return 2;
    return 3;
  }

  function definitionTypes(definition) {
    return asArray(asObject(definition).endpoints).map((raw) => String(asObject(raw).deviceType || '')).filter(Boolean);
  }

  function strongDefinitionCategory(definition) {
    const value = definitionTypes(definition).join(' ').toLowerCase();
    if (/curtain|blind|shade|window.?cover|窗帘|卷帘/.test(value)) return 'curtain';
    if (/thermostat|air.?condition|heater.?cooler|hvac|温控|空调/.test(value)) return 'climate';
    return '';
  }

  function siblingPositionValue(traits, trait) {
    if (String(trait.traitCode || '').toLowerCase() !== curtainPositionTraits.target.toLowerCase()) return undefined;
    const current = traits.find((raw) => String(asObject(raw).traitCode || '').toLowerCase() === curtainPositionTraits.current.toLowerCase());
    return Number.isFinite(Number(asObject(current).value)) ? Number(asObject(current).value) : undefined;
  }

  function inspectDefinition(definition, category) {
    const item = asObject(definition); const controls = []; const readings = []; const spaceCommands = []; const favoriteCommands = []; const favoriteEndpointMeta = []; let offerPoint = null; let localIcePoint = null; let endPoint = null; let signalingPoint = null;
    asArray(item.endpoints).forEach((endpointRaw) => { const endpoint = asObject(endpointRaw);
      const labels = asArray(endpoint.functions).filter(fn=>asObject(fn).functionCode==='EndpointLabel').flatMap(fn=>asArray(asObject(fn).traits));
      const nameLabel=labels.find(trait=>asObject(trait).traitCode==='EndpointName'),roomLabel=labels.find(trait=>asObject(trait).traitCode==='EndpointRoom');
      if(endpoint.endpointId!==null && endpoint.endpointId!=='' && Number.isInteger(Number(endpoint.endpointId)) && Number(endpoint.endpointId)>=0)favoriteEndpointMeta.push({endpointId:Number(endpoint.endpointId),deviceType:String(endpoint.deviceType || ''),speaker:config.homeDeviceMode==='favorites' && global.FavoriteSpeaker?global.FavoriteSpeaker.inspect(endpoint,String(item.deviceId || '')):[],capabilityTraits:config.homeDeviceMode==='favorites'?asArray(endpoint.functions).flatMap(raw=>{const fn=asObject(raw);return asArray(fn.traits).filter(raw=>/^(OnOff|CurrentPositionPercentage|LockState|ContactSensorState|Occupancy)$/.test(String(asObject(raw).traitCode || ''))).map(raw=>({functionCode:String(fn.functionCode || ''),traitCode:String(asObject(raw).traitCode || '')}));}):[],name:typeof asObject(nameLabel).value==='string'?asObject(nameLabel).value.trim():String(endpoint.endpointName || ''),hasRoomLabel:typeof asObject(roomLabel).value==='string',spaceId:typeof asObject(roomLabel).value==='string'?asObject(roomLabel).value:''});
      asArray(endpoint.functions).forEach((functionRaw) => { const deviceFunction = asObject(functionRaw);
        const traits = asArray(deviceFunction.traits);
        traits.forEach((traitRaw) => { const trait = asObject(traitRaw); const traitCode = exactProtocolCode(valueOr(trait.traitCode, valueOr(trait.specId, trait.aqaraSpecId)), cameraProtocolCodes.signaling); if (traitCode) signalingPoint = { endpointDeviceType:String(endpoint.deviceType || ''), endpointId: Number(endpoint.endpointId), functionCode: String(deviceFunction.functionCode || ''), traitCode: String(trait.traitCode || traitCode) }; const control = traitControl(String(item.deviceId || ''), endpoint, deviceFunction, trait, siblingPositionValue(traits, trait)); if (control) controls.push(control);
          const parameter = asObject(trait.parameter); if (parameter.readable !== false && trait.value !== null && trait.value !== undefined) { const value = displayValue(trait.value, parameter); if (value) { readings.push({ id: `${endpoint.endpointId}:${deviceFunction.functionCode}:${trait.traitCode}`, endpointDeviceType:String(endpoint.deviceType || ''), endpointId: Number(endpoint.endpointId), functionCode: String(deviceFunction.functionCode || ''), traitCode: String(trait.traitCode || ''), label: String(trait.pointName || trait.traitCode || ''), value: trait.value, displayValue: value, unit: String(parameter.unit || ''), type: String(parameter.type || ''), min:Number(parameter.min), max:Number(parameter.max) }); } }
        });
        asArray(deviceFunction.commands).forEach((commandRaw) => { const command = asObject(commandRaw); const commandCode = String(valueOr(command.commandCode, valueOr(command.specId, valueOr(command.aqaraSpecId, '')))).trim(); const point = { endpointDeviceType:String(endpoint.deviceType || ''), endpointId: Number(endpoint.endpointId), functionCode: String(deviceFunction.functionCode || ''), commandCode: String(command.commandCode || commandCode), fields: asArray(command.fields).map((raw) => String(asObject(raw).fieldCode || '')).filter(Boolean) }; if (exactProtocolCode(commandCode, cameraProtocolCodes.offer)) offerPoint = point; if (exactProtocolCode(commandCode, cameraProtocolCodes.localIce)) localIcePoint = point; if (exactProtocolCode(commandCode, cameraProtocolCodes.end)) endPoint = point; if (String(endpoint.deviceType || '') === 'WindowCovering' && String(deviceFunction.functionCode || '') === 'WindowCovering' && commandCode === 'StopMotion' && asArray(command.fields).length === 0) spaceCommands.push({id:point.endpointId+':'+point.functionCode+':command:'+commandCode, deviceId:String(item.deviceId || ''), kind:'command', ...point}); if (/^(WindowCovering|Curtain|Blind|Shade)$/i.test(String(endpoint.deviceType || '')) && command.commandCode === 'AutoControl' && (command.fields==null || Array.isArray(command.fields) && command.fields.length===0) && Number.isInteger(point.endpointId) && point.endpointId>=0 && point.functionCode) favoriteCommands.push({id:point.endpointId+':'+point.functionCode+':command:AutoControl',deviceId:String(item.deviceId || ''),kind:'command',...point}); const control = commandControl(String(item.deviceId || ''), endpoint, deviceFunction, command); if (control) controls.push(control); });
      });
    });
    controls.sort((a, b) => controlPriority(a, category) - controlPriority(b, category));
    const presentationReadings = readings.filter(isPresentationReading).sort((a, b) => readingPriority(a) - readingPriority(b));
    const controlIds = new Set(controls.map((item) => item.id));
    const cameraStream = offerPoint && signalingPoint && Number.isFinite(offerPoint.endpointId) && offerPoint.functionCode && offerPoint.commandCode && Number.isFinite(signalingPoint.endpointId) && signalingPoint.functionCode && signalingPoint.traitCode ? { protocol: 'aqara-spec-webrtc-v1', offer: offerPoint, localIce: localIcePoint, end: endPoint, signaling: signalingPoint } : null;
    const presenceCapability = asArray(item.endpoints).some((endpoint) => asArray(asObject(endpoint).functions).some((fn) => asArray(asObject(fn).traits).some((raw) => {
      const trait = asObject(raw); const parameter = asObject(trait.parameter);
      return parameter.readable !== false && /^(bool|boolean)$/i.test(String(parameter.type || '')) &&
        ['occupancysensed', 'presencedetected', 'humanpresence', 'presence', 'occupancy'].includes(normalizedTraitCode(trait.traitCode));
    })));
    return { control: controls[0] || null, controls, readings, presentationReadings, telemetry: presentationReadings.filter((item) => !controlIds.has(item.id)).slice(0, 2).map((item) => ({ id: item.id, label: item.label, value: item.displayValue })), cameraStream, spaceCommands, favoriteCommands, favoriteEndpointMeta, assistantCapabilities: { presence: presenceCapability } };
  }

  async function loadDefinitions(deviceIds) {
    const batchSize = Math.min(80, Math.max(10, Number(config.definitionBatchSize || config.capabilityBatchSize) || 40));
    const batches = []; for (let index = 0; index < deviceIds.length; index += batchSize) batches.push(deviceIds.slice(index, index + batchSize));
    const result = []; let cursor = 0;
    async function worker() {
      while (cursor < batches.length) {
        const batch = batches[cursor]; cursor += 1;
        result.push(...asArray(await request(routes.definitions, { params: { deviceIds: batch.join(',') } })));
      }
    }
    const concurrency = Math.min(4, Math.max(1, Number(config.definitionConcurrency) || 2));
    await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()));
    return result;
  }

  function mergeCapabilities(devices, rawDefinitions, activateControls = true, resetControls = false) {
    const definitions = new Map(asArray(rawDefinitions).map((raw) => [String(asObject(raw).deviceId || ''), asObject(raw)]));
    if (activateControls && resetControls) latestControls = new Map();
    return devices.map((device) => { const definition = definitions.get(device.id); const category = strongDefinitionCategory(definition) || classifyDevice([...device.types, ...definitionTypes(definition)], device.name); const capability = inspectDefinition(definition, category); if (activateControls && capability.controls.length) latestControls.set(device.id, capability.controls); return { ...device, category, endpointTypes:definitionTypes(definition), ...capability }; });
  }

  function rememberCapabilityModels(devices, token) {
    const stamp=token || ++entitySequence;
    return devices.map(device=>{
      if(!device || !device.id)return device;
      if((entityVersions.get(device.id) || 0)>stamp || favoriteWrites.has(device.id))return capabilityModels.get(device.id) || device;
      const previous=capabilityModels.get(device.id);
      if(previous && (previous.favoriteSummaryVersion || 0)>(device.favoriteSummaryVersion || 0))device=Object.assign({},device,{online:previous.online,favoriteOnline:previous.favoriteOnline,name:previous.name,spaceId:previous.spaceId,spaceName:previous.spaceName,favoriteSummaryVersion:previous.favoriteSummaryVersion});
      capabilityModels.set(device.id,device);capabilityGeneration++;entityVersions.set(device.id,stamp);
      invalidateSpaceObservations([device.id]);for(const point of asArray(device.readings))rememberSpaceObservation(device.id,point,point.value);
      latestControls.set(device.id,asArray(device.controls));if(asArray(device.favoriteEndpointMeta).length)favoriteCheckedAt.set(device.id,Date.now());return device;
    });
  }

  function capabilityBatch(devices, revision) {
    const pending = devices.filter((device) => device && device.id && !capabilityModels.has(device.id) && !capabilityPromises.has(device.id));
    if (!pending.length) return null;
    const token=++entitySequence; let operation;
    operation = (async () => {
      const definitions = asArray(await request(routes.definitions, { params: { deviceIds: pending.map((device) => device.id).join(',') } }));
      if (revision !== loadRevision) throw new Error('A newer Studio refresh replaced this request');
      const defined=new Set(definitions.map(row=>String(asObject(row).deviceId || '')));
      return rememberCapabilityModels(mergeCapabilities(pending.filter(device=>defined.has(device.id)), definitions, false),token);
    })().finally(() => { pending.forEach((device) => { if (capabilityPromises.get(device.id) === operation) capabilityPromises.delete(device.id); }); });
    pending.forEach((device) => capabilityPromises.set(device.id, operation));
    return operation;
  }

  async function ensureCapabilityModels(devices, revision) {
    const waitFor = new Set();
    devices.forEach((device) => { const pending = capabilityPromises.get(device.id); if (pending) waitFor.add(pending); });
    const missing = devices.filter((device) => device && device.id && !capabilityModels.has(device.id) && !capabilityPromises.has(device.id));
    if (missing.length) waitFor.add(capabilityBatch(missing, revision));
    if (waitFor.size) await Promise.all([...waitFor]);
    if (revision !== loadRevision) throw new Error('A newer Studio refresh replaced this request');
    return devices.map((device) => capabilityModels.get(device.id) || device);
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
  function rounded(value) { return Number.isFinite(value) ? Math.round(value * 10) / 10 : null; }

  function environmentReading(device, codes, kind) {
    const internalSource=kind!=='presence' && /(?:箱子内部|箱体|设备内部|机身|芯片|电池温|马达温|(?:internal|enclosure|device|chip|cpu|battery|motor)[\s_-]*(?:temperature|humidity|temp)|(?:temperature|humidity|temp)[\s_-]*(?:internal|enclosure|device|chip|cpu|battery|motor))/i.test(String(device.name || device.deviceName || ''));
    const readings = asArray(device.readings).filter((reading) => !/(?:机身|设备|芯片|电池|马达|device|internal|chip|cpu|battery|motor)/i.test(String(asObject(reading).label || ''))).map((reading) => ({ reading, code: normalizedTraitCode(asObject(reading).traitCode) }));
    const candidates=readings.filter(entry=>codes.includes(entry.code)).sort((a,b)=>codes.indexOf(a.code)-codes.indexOf(b.code));
    for(const found of candidates){
      const dedicated=kind==='temperature' && found.reading.endpointDeviceType==='TemperatureSensor' && found.reading.functionCode==='Temperature' || kind==='humidity' && found.reading.endpointDeviceType==='HumiditySensor' && found.reading.functionCode==='RelativeHumidity';
      if(internalSource && !dedicated)continue;
      if(kind==='presence'){const value=parseBoolean(found.reading.value);if(value!==null)return value;continue;}
      if(found.reading.value==null || !['number','string'].includes(typeof found.reading.value) || typeof found.reading.value==='string'&&!found.reading.value.trim())continue;
      let value=Number(found.reading.value);if(!Number.isFinite(value))continue;
      const unit=String(found.reading.unit || '').toLowerCase();
      if(kind==='temperature' && /(?:°f|fahrenheit|\bf\b)/.test(unit))value=(value-32)*5/9;
      if(kind==='temperature' && (value < -50 || value > 80) || kind==='humidity' && (value < 0 || value > 100))continue;
      return value;
    }
    return null;
  }

  // Positive evidence only; partial catalogs never imply household-wide absence.
  // Reuses existing normalized definitions and performs no network operations.
  function deriveAssistantHints(devices, spaces) {
    const names = new Map(asArray(spaces).filter(space=>space && space.id && (!space.isRoot || space.isScopeRoom)).map(space=>[String(space.id),String(space.name || '').trim()]));
    const roomHints={presence:[],dimming:[],offline:[],environment:[]};
    const seen=Object.fromEntries(Object.keys(roomHints).map(key=>[key,new Set()]));
    const temperatures=new Set(),humidities=new Set();
    const add=(key,id)=>{if(!names.get(id)||seen[key].has(id))return;seen[key].add(id);roomHints[key].push(id);};
    let presence=false,livingRoomDimming=false,offline=false;
    for(const device of asArray(devices)){
      const id=String(device && device.spaceId || '');
      const room=names.get(id);
      if(device.online===false){offline=true;add('offline',id);continue;}
      if(device.online!==true)continue;
      if(asObject(device.assistantCapabilities).presence===true){presence=true;add('presence',id);}
      if(device.category==='light' && asArray(device.controls).some(control=>control.kind==='range' && ['currentlevel','brightness','brightnesslevel','targetbrightness'].includes(normalizedTraitCode(control.traitCode)))){
        add('dimming',id);if(/^(客厅|客廳|living\s*room|lounge)$/i.test(room || ''))livingRoomDimming=true;
      }
      if(environmentReading(device,['currenttemperature','roomtemperature','ambienttemperature','airtemperature'],'temperature')!==null)temperatures.add(id);
      if(environmentReading(device,['currenthumidity','relativehumidity','roomhumidity','ambienthumidity'],'humidity')!==null)humidities.add(id);
    }
    for(const id of temperatures)if(humidities.has(id))add('environment',id);
    return {presence,livingRoomDimming,offline,roomHints};
  }

  function deriveOverview(devices, totalCount, failedDeviceCount, status, summaryDevices) {
    const temperatureCodes = ['currenttemperature', 'roomtemperature', 'ambienttemperature', 'airtemperature'];
    const humidityCodes = ['currenthumidity', 'relativehumidity', 'roomhumidity', 'ambienthumidity'];
    const presenceCodes = ['occupancysensed', 'presencedetected', 'humanpresence', 'presence', 'occupancy'];
    const temperatureBySpace = new Map(); const humidityBySpace = new Map(); const presenceBySpace = new Map();
    let temperatureSamples = 0; let humiditySamples = 0; const onlineDeviceCount = (summaryDevices || activeSnapshot && activeSnapshot.devices || []).filter((device) => device.online === true).length;
    const sourceSpace=String(config.overviewEnvironmentSpaceId || '');
    const environmentSource=device=>{if(!sourceSpace)return true;if(!(activeSnapshot && activeSnapshot.spaces || []).some(space=>space.id===sourceSpace))return false;let id=device.spaceId;const visited=new Set();while(id&&!visited.has(id)){if(id===sourceSpace)return true;visited.add(id);const row=(activeSnapshot && activeSnapshot.spaces || []).find(space=>space.id===id);id=row && row.parentId;}return false;};
    devices.filter((device) => device.online).forEach((device) => {
      const spaceKey = device.spaceId || 'unassigned';
      const temperature = environmentSource(device)?environmentReading(device, temperatureCodes, 'temperature'):null;
      if (temperature !== null) { const values = temperatureBySpace.get(spaceKey) || []; values.push(temperature); temperatureBySpace.set(spaceKey, values); temperatureSamples += 1; }
      const humidity = environmentSource(device)?environmentReading(device, humidityCodes, 'humidity'):null;
      if (humidity !== null) { const values = humidityBySpace.get(spaceKey) || []; values.push(humidity); humidityBySpace.set(spaceKey, values); humiditySamples += 1; }
      if (device.spaceId) { const presence = environmentReading(device, presenceCodes, 'presence'); if (presence !== null) presenceBySpace.set(device.spaceId, Boolean(presence) || presenceBySpace.get(device.spaceId) === true); }
    });
    const temperatureSpaceValues = [...temperatureBySpace.values()].map(median).filter(Number.isFinite);
    const humiditySpaceValues = [...humidityBySpace.values()].map(median).filter(Number.isFinite);
    return {
      status,
      indexedDeviceCount: devices.length,
      deviceTotalCount: Number(totalCount) || devices.length,
      failedDeviceCount,
      onlineDeviceCount,
      onlineDeviceCountSource: 'device-list',
      assistantHints: deriveAssistantHints(devices, activeSnapshot && activeSnapshot.spaces),
      temperature: { value: rounded(mean(temperatureSpaceValues)), sampleCount: temperatureSamples, spaceCount: temperatureSpaceValues.length },
      humidity: { value: rounded(mean(humiditySpaceValues)), sampleCount: humiditySamples, spaceCount: humiditySpaceValues.length },
      presence: { occupiedSpaceCount: [...presenceBySpace.values()].filter(Boolean).length, monitoredSpaceCount: presenceBySpace.size },
    };
  }

  function publishOverview(callback, revision, overview, persist = false) {
    if (revision !== loadRevision) return;
    if(overview.status !== 'loading')overviewIndexBuilding=false;
    // Loading samples are incomplete and must never replace the last displayed
    // complete index or the runtime snapshot used by other Home modules.
    if (activeSnapshot && overview.status !== 'loading') activeSnapshot = { ...activeSnapshot, overview };
    if (typeof callback === 'function') callback({ type: 'overview', value: overview, revision });
    if (persist && activeSnapshot) cacheStore(activeSnapshot);
  }

  async function loadOverviewCatalog(revision) {
    if (overviewCatalog) return overviewCatalog;
    if (overviewCatalogPromise) return overviewCatalogPromise;
    overviewCatalogPromise = (async () => {
      const spaceParams=await homeSpaceParams();if(spaceParams===null){overviewCatalog={lookupDevices:[],devices:[],totalCount:0,truncated:false};return overviewCatalog;}
      const pageSize = overviewCatalogPageSize(); const maximum = overviewMaxDevices(); const collected = []; const known = new Set(); let totalCount = 0;
      for (let pageNum = 1; collected.length < maximum; pageNum += 1) {
        const page = devicePage(await request(routes.devices, { params: { pageNum, pageSize, includeSpace:true, ...spaceParams } }));
        if (revision !== loadRevision) throw new Error('A newer Studio refresh replaced this request');
        const normalized = page.items.map(normalizeDevice).filter((device) => device.id && !known.has(device.id));
        normalized.forEach((device) => { known.add(device.id); collected.push(device); });
        totalCount = Number.isFinite(page.totalCount) ? page.totalCount : Math.max(totalCount, collected.length);
        if (page.items.length < pageSize || collected.length >= totalCount) break;
      }
      const truncated = collected.length < totalCount; const safeLimit = truncated ? Math.max(backendPageSize(), Math.floor(Math.min(collected.length, maximum) / backendPageSize()) * backendPageSize()) : Math.min(collected.length, maximum);
      overviewCatalog = { lookupDevices:collected, devices: collected.slice(0, safeLimit), totalCount: Math.max(totalCount, collected.length), truncated };
      return overviewCatalog;
    })();
    return overviewCatalogPromise;
  }

  async function loadOverviewIndex(options) {
    if (config.scope === 'selected-device' || (config.enableOverviewIndex === false && !spaceFullLimit)) return activeSnapshot && activeSnapshot.overview || null;
    if (overviewPromise) return overviewPromise;
    if (!activeSnapshot || activeSnapshot.isCached) throw new Error('请等待当前 Studio 数据刷新完成');
    const revision = loadRevision; const callback = options && options.onProgress;
    overviewIndexBuilding=true;
    overviewPromise = (async () => {
      let catalog;
      try { catalog = await loadOverviewCatalog(revision); }
      catch (error) { const overview = deriveOverview([...capabilityModels.values()], activeSnapshot && activeSnapshot.deviceTotalCount, 0, 'unavailable'); publishOverview(callback, revision, { ...overview, message: errorMessage(error) }, true); return overview; }
      let failedDeviceCount = 0;
      const publish = (status, persist = false) => {
        const indexed = catalog.devices.map((device) => capabilityModels.get(device.id)).filter(Boolean);
        const overview = deriveOverview(indexed, catalog.totalCount, failedDeviceCount, status, catalog.lookupDevices); publishOverview(callback, revision, overview, persist); return overview;
      };
      publish('loading');
      const missing = catalog.devices.filter((device) => !capabilityModels.has(device.id)); const batchSize = overviewDefinitionBatchSize();
      for (let index = 0; index < missing.length; index += batchSize) {
        if (revision !== loadRevision) throw new Error('A newer Studio refresh replaced this request');
        const batch = missing.slice(index, index + batchSize);
        try { await ensureCapabilityModels(batch, revision); }
        catch { /* missing IDs are counted below; completed peers remain reusable */ }
        failedDeviceCount = missing.slice(0, index + batch.length).filter((device) => !capabilityModels.has(device.id)).length;
        publish('loading');
      }
      const status = failedDeviceCount || catalog.truncated ? 'partial' : 'complete';
      return publish(status, true);
    })().finally(() => { if (revision === loadRevision) { overviewPromise = null; overviewIndexBuilding=false; } });
    return overviewPromise;
  }

  const sceneListKeys = ['data','list','scenes','records','items','children'];
  const sceneString = value => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  function sceneNumber(value) { const number=typeof value==='number'?value:typeof value==='string' && value.trim()?Number(value):NaN;return Number.isFinite(number)?number:undefined; }
  function sceneIdentity(scene) { return sceneString(scene.sceneId) || sceneString(scene.id) || [sceneString(scene.automationId),sceneString(scene.triggerNodeId)].filter(Boolean).join('#'); }
  function canExecuteScene(scene) { return Boolean(scene && (sceneString(scene.sceneId).trim() || sceneString(scene.automationId).trim() && sceneString(scene.triggerNodeId).trim())); }
  function validScenePage(value) { return Array.isArray(value) || Boolean(value && typeof value==='object' && (sceneListKeys.some(key=>Array.isArray(value[key])) || ['sceneId','id','automationId','triggerNodeId','name','sceneName','triggerName','automationName'].some(key=>sceneString(value[key])))); }
  function normalizeScenes(value) {
    const object=asObject(value), records=Array.isArray(value)?value:sceneListKeys.map(key=>object[key]).find(Array.isArray) || (validScenePage(value)?[object]:[]), result=[];
    function collect(items,depth) { for(const raw of items) { if(!raw || typeof raw!=='object' || Array.isArray(raw))continue;
      const id=sceneIdentity(raw), enabled=raw.enabled==null?true:typeof raw.enabled==='boolean'?raw.enabled:typeof raw.enabled==='number'?raw.enabled!==0:raw.enabled==='true' || raw.enabled==='1';
      const time=sceneNumber(raw.createTime);
      if(id)result.push({id,name:sceneString(raw.name)||sceneString(raw.sceneName)||sceneString(raw.triggerName)||sceneString(raw.automationName),sceneId:sceneString(raw.sceneId)||undefined,automationId:sceneString(raw.automationId),triggerNodeId:sceneString(raw.triggerNodeId),enabled,createTime:Number.isFinite(time)?time:undefined,definitionType:sceneString(raw.definitionType)||undefined,...((raw.space && typeof raw.space==='object') || sceneString(raw.spaceId)?{spaceId:sceneString(raw.space && raw.space.spaceId)||sceneString(raw.spaceId),spaceName:sceneString(raw.space && raw.space.name)||sceneString(raw.spaceName),space:raw.space && typeof raw.space==='object'?raw.space:{spaceId:sceneString(raw.spaceId),name:sceneString(raw.spaceName)}}:{})});
      if(depth<8 && Array.isArray(raw.children))collect(raw.children,depth+1);
    } }
    collect(records,0); return result;
  }

  function cacheStore(snapshot) {
    if (!collectionScope) return;
    try { const storage = global.sessionStorage; if (storage && typeof storage.setItem === 'function') storage.setItem(cacheKey(), JSON.stringify({ version: 7, savedAt: Date.now(), snapshot: { ...snapshot, warnings: [], isCached: true } })); } catch { /* cache is optional */ }
  }

  function loadCached() {
    if (!collectionScope) return null;
    try {
      const storage = global.sessionStorage; const record = JSON.parse(storage && typeof storage.getItem === 'function' ? storage.getItem(cacheKey()) || 'null' : 'null');
      if (!record || record.version !== 7 || Date.now() - Number(record.savedAt) > cacheTtlMs) return null;
      latestControls = new Map();
      activeSnapshot = { ...record.snapshot, isCached: true, cachedAt: Number(record.savedAt) };
      return activeSnapshot;
    } catch { return null; }
  }

  function emitProgress(callback, revision, type, value) {
    if (revision === loadRevision && typeof callback === 'function') callback({ type, value, revision });
  }

  async function load(options) {
    if(config.homeSpaceSelection==='first-room' && !config.homeSpaceId && homeSpaceEpoch!==collectionEpoch){homeSpaceId='';homeSpaceEpoch=collectionEpoch;}
    if(options && options.homeSpaceChange)invalidateCollections(['/devices']);else invalidateCollections();homeSpacePromise=null;spaceObservations.clear();spaceObservationVersions.clear();
    const revision = ++loadRevision; entityVersions=new Map();favoriteCheckedAt=new Map();favoriteRefreshFlight=null;favoriteWrites.clear(); spaceFullLimit=0; favoriteSupplement=new Map(); favoriteResolvePromise=null; favoriteInvalidIds=new Set(); favoriteRefreshRevision++; const onProgress = options && options.onProgress;
    nextPagePromise = null; overviewPromise = null; overviewIndexBuilding=false; overviewCatalogPromise = null; overviewCatalog = null; latestControls=new Map();capabilityModels = new Map(); capabilityPromises = new Map();
    const deviceTask = (async () => {
      const token=++entitySequence; const page = await loadInitialDevicePage();
      if(revision!==loadRevision)throw new Error('A newer Studio refresh replaced this request');
      let devices = applyDeviceScope(page.items.map(normalizeDevice).filter((item) => item.id));
      let capabilityWarning = '';
      if (devices.length && config.homeDeviceMode!=='favorites') {
        try { const definitions=await loadDefinitions(devices.map((item)=>item.id));if(revision!==loadRevision)throw new Error('A newer Studio refresh replaced this request');const defined=new Set(definitions.map(row=>String(asObject(row).deviceId || '')));const loaded=rememberCapabilityModels(mergeCapabilities(devices.filter(device=>defined.has(device.id)),definitions,false),token);const models=new Map(loaded.map(device=>[device.id,device]));devices=devices.map(device=>models.get(device.id)||device);if(loaded.length<devices.length)capabilityWarning='部分设备控制能力尚未读取，暂不可控制'; }
        catch (error) { if(revision!==loadRevision)throw error;latestControls = new Map(); capabilityWarning = `设备控制能力读取失败，已切换为只读：${errorMessage(error)}`; }
      } else latestControls = new Map();
      const totalCount = Number.isFinite(page.totalCount) ? page.totalCount : devices.length;
      const pagination = { deviceTotalCount: totalCount, devicePageNum: page.pageNum, devicePageSize: page.pageSize, hasMoreDevices: config.scope === 'selected-device' ? false : devices.length < totalCount && page.items.length >= page.pageSize };
      const value = { devices, capabilityWarning, ...pagination };
      if(config.homeDeviceMode==='favorites')activeSnapshot={...value,spaces:[],scenes:[],warnings:[],isCached:false,connectedAt:Date.now()};
      emitProgress(onProgress, revision, 'devices', value);
      return value;
    })();
    const spaceTask = request(routes.spaces).then((value) => { const spaces = flattenSpaces(value); emitProgress(onProgress, revision, 'spaces', spaces); return spaces; });
    const needsScenes=!Array.isArray(config.homeModules) || config.homeModules.includes('favoriteScenes') || config.homeModules.includes('overview') && asArray(config.overviewMetrics).includes('scenes');
    const sceneTask = (needsScenes?listScenes():Promise.resolve([])).then((scenes) => { emitProgress(onProgress, revision, 'scenes', scenes); return scenes; });
    const [deviceResult, spaceResult, sceneResult] = await Promise.all([
      settle(deviceTask), settle(spaceTask), settle(sceneTask),
    ]);
    if (revision !== loadRevision) throw new Error('A newer Studio refresh replaced this request');
    if (deviceResult.status === 'rejected') throw deviceResult.reason;
    const warnings = [];
    if (spaceResult.status === 'rejected') warnings.push(`空间读取失败：${errorMessage(spaceResult.reason)}`);
    if (sceneResult.status === 'rejected') warnings.push(`场景读取失败：${errorMessage(sceneResult.reason)}`);
    const { devices, capabilityWarning, deviceTotalCount, devicePageNum, devicePageSize, hasMoreDevices } = deviceResult.value;
    if (capabilityWarning) warnings.push(capabilityWarning);
    const snapshot = { devices, sceneCatalogStatus:sceneResult.status==='fulfilled'?'ready':'error', spaces: spaceResult.status === 'fulfilled' ? spaceResult.value : [], scenes: sceneResult.status === 'fulfilled' ? sceneResult.value : [], warnings, selectedDeviceId: selectedDeviceId(), connectedAt: Date.now(), isCached: false, deviceTotalCount, devicePageNum, devicePageSize, hasMoreDevices };
    activeSnapshot = snapshot; activeSnapshotScopeEpoch=collectionEpoch; activeSpaceRevision=loadRevision; cacheStore(snapshot); emitProgress(onProgress, revision, 'complete', snapshot); return snapshot;
  }

  async function loadNextPage() {
    if (nextPagePromise) return nextPagePromise;
    if (!activeSnapshot || activeSnapshot.isCached) throw new Error('请等待当前 Studio 数据刷新完成');
    if (config.scope === 'selected-device' || !activeSnapshot.hasMoreDevices) return { snapshot: activeSnapshot, appendedDevices: [] };
    const revision = loadRevision; const requestedPage = Number(activeSnapshot.devicePageNum || 1) + 1;
    nextPagePromise = (async () => {
      if (overviewCatalogPromise || overviewCatalog) {
        const joinedCatalog = !overviewCatalog; const catalog = overviewCatalog || await overviewCatalogPromise;
        if (joinedCatalog) await new Promise((resolve) => global.setTimeout(resolve, 0));
        if (revision !== loadRevision) throw new Error('A newer Studio refresh replaced this request');
        const known = new Set(activeSnapshot.devices.map((device) => device.id)); const start = activeSnapshot.devices.length;
        const summaries = catalog.devices.slice(start, start + Number(activeSnapshot.devicePageSize || backendPageSize())).filter((device) => !known.has(device.id));
        if (summaries.length) {
          let appendedDevices = summaries; let capabilityWarning = '';
          try { appendedDevices = await ensureCapabilityModels(summaries, revision); }
          catch (error) { capabilityWarning = `新增设备控制能力读取失败，已切换为只读：${errorMessage(error)}`; }
          const devices = activeSnapshot.devices.concat(appendedDevices); const totalCount = catalog.totalCount;
          const warnings = capabilityWarning ? [...activeSnapshot.warnings, capabilityWarning] : activeSnapshot.warnings;
          activeSnapshot = { ...activeSnapshot, devices, warnings, deviceTotalCount: totalCount, devicePageNum: Math.ceil(devices.length / Number(activeSnapshot.devicePageSize || backendPageSize())), hasMoreDevices: devices.length < totalCount, connectedAt: Date.now() };
          cacheStore(activeSnapshot); return { snapshot: activeSnapshot, appendedDevices, warning: capabilityWarning, reusedOverviewIndex: true };
        }
      }
      const page = await loadDevicePage(requestedPage);
      if (revision !== loadRevision) throw new Error('A newer Studio refresh replaced this request');
      const known = new Set(activeSnapshot.devices.map((device) => device.id));
      let appendedDevices = page.items.map(normalizeDevice).filter((device) => device.id && !known.has(device.id));
      let capabilityWarning = '';
      if (appendedDevices.length) {
        try { appendedDevices = await ensureCapabilityModels(appendedDevices, revision); }
        catch (error) { capabilityWarning = `新增设备控制能力读取失败，已切换为只读：${errorMessage(error)}`; }
      }
      if (revision !== loadRevision) throw new Error('A newer Studio refresh replaced this request');
      const devices = activeSnapshot.devices.concat(appendedDevices);
      const totalCount = Number.isFinite(page.totalCount) ? page.totalCount : Number(activeSnapshot.deviceTotalCount) || devices.length;
      const hasMoreDevices = devices.length < totalCount && page.items.length >= page.pageSize;
      const warnings = capabilityWarning ? [...activeSnapshot.warnings, capabilityWarning] : activeSnapshot.warnings;
      activeSnapshot = { ...activeSnapshot, devices, warnings, deviceTotalCount: totalCount, devicePageNum: page.pageNum, devicePageSize: page.pageSize, hasMoreDevices, connectedAt: Date.now() };
      cacheStore(activeSnapshot);
      return { snapshot: activeSnapshot, appendedDevices, warning: capabilityWarning };
    })().finally(() => { nextPagePromise = null; });
    return nextPagePromise;
  }

  function validateControlValue(control, nextValue) {
    if (control.kind === 'boolean') { const value = parseBoolean(nextValue); if (value === null) throw new Error('Value is not a Boolean'); return value; }
    if (control.kind === 'enum') { const value = String(nextValue); if (!control.options.some((item) => item.value === value)) throw new Error('Value is not allowed by the Studio definition'); return value; }
    if (control.kind === 'range') { const value = Number(nextValue); if (!Number.isFinite(value) || value < control.min || value > control.max) throw new Error('Value is outside the Studio range'); return value; }
    throw new Error('Unsupported trait control');
  }

  function throwWriteFailures(value) {
    const failures = asArray(value); if (!failures.length) return;
    const failure = asObject(failures[0]); const error = new Error(failure.message || `Studio write failed${failure.code === undefined ? '' : ` (${failure.code})`}`);
    error.code = failure.code; error.data = failures; throw error;
  }

  function resolveControl(deviceId, controlId) {
    const controls = asArray(latestControls.get(deviceId));
    return controlId ? controls.find((item) => item.id === controlId) : controls[0];
  }

  async function executeDevice(deviceId, nextValue, controlId) {
    const control = resolveControl(deviceId, controlId); if (!control) throw new Error('当前 Studio 定义未提供安全快捷控制');
    if (control.kind === 'command') {
      const result = await request(routes.executeCommand, { data: { data: [{ deviceId, endpointId: control.endpointId, functionCode: control.functionCode, commandCode: control.commandCode }] } });
      throwWriteFailures(result); return { control, accepted: true };
    }
    const value = validateControlValue(control, nextValue);
    const result = await request(routes.executeTrait, { data: { data: [{ deviceId, endpointId: control.endpointId, functionCode: control.functionCode, traitCode: control.traitCode, value }] } });
    throwWriteFailures(result); return { control, expected: value };
  }

  function normalizeControlValue(control, value) {
    if (control.kind === 'boolean') return parseBoolean(value);
    if (control.kind === 'range') return Number(value);
    if (control.kind === 'enum') return String(value);
    return value;
  }

  function controlMatches(control, expected, actual) {
    if (control.kind === 'range') return Number.isFinite(actual) && Math.abs(Number(actual) - Number(expected)) <= Math.max(Number(control.step) || 0, 0.001);
    return actual === expected;
  }

  async function readBackDevice(deviceId, expected, controlId, options) {
    const control = resolveControl(deviceId, controlId); if (!control || control.kind === 'command') throw new Error('Trait readback is unavailable');
    const delay = options && options.immediate === true ? 0 : Math.min(5000, Math.max(500, Number(config.controlReadbackDelayMs) || 2000));
    if (delay) await new Promise((resolve) => global.setTimeout(resolve, delay));
    const values = asArray(await request(routes.readTrait, { data: { data: [{ deviceId, endpointId: control.endpointId, functionCode: control.functionCode, traitCodes: [control.traitCode] }] } }));
    const result = values.find((raw) => { const item = asObject(raw); return String(item.deviceId || '') === deviceId && Number(item.endpointId) === control.endpointId && String(item.functionCode || '') === control.functionCode && String(item.traitCode || '') === control.traitCode; });
    if (!result) throw new Error('Studio did not return the requested trait value');
    const actual = normalizeControlValue(control, asObject(result).value);
    if (actual === null || (control.kind === 'range' && !Number.isFinite(actual))) throw new Error('Studio returned an invalid trait value');
    return { confirmed: controlMatches(control, expected, actual), actual };
  }

  async function executeScene(scene) {
    if(!canExecuteScene(scene))throw new Error('场景缺少 Studio 执行标识');
    const sceneId=sceneString(scene.sceneId).trim();
    if(sceneId)await request(routes.executeScene,{data:{sceneId}});
    else await request(routes.executeManualScene,{data:{automationId:sceneString(scene.automationId).trim(),triggerNodeId:sceneString(scene.triggerNodeId).trim()}});
  }

  async function completeSpaceControlIndex(options) {
    if(spaceFullPromise)return spaceFullPromise;
    if(!activeSnapshot || activeSnapshot.isCached)throw new Error('请等待 Studio 连接完成');
    if(activeSnapshot.deviceTotalCount>5000)throw new Error('设备规模超过空间控制读取上限，请缩小设备范围');
    const revision=loadRevision;spaceFullPromise=(async()=>{if(overviewPromise)await overviewPromise;if(revision!==loadRevision)throw new Error('A newer Studio refresh replaced this index');spaceFullLimit=Math.max(overviewMaxDevices(),activeSnapshot.deviceTotalCount);overviewCatalog=null;overviewCatalogPromise=null;await loadOverviewIndex(options);return spaceControlIndex();})().finally(()=>spaceFullPromise=null);
    return spaceFullPromise;
  }

  function spaceControlIndex() {
    const source = overviewCatalog ? overviewCatalog.devices : activeSnapshot && activeSnapshot.devices || [];
    const allSpaces=activeSnapshot && activeSnapshot.spaces || [];
    if(!spaceIndexCache || spaceIndexCache.source!==source || spaceIndexCache.allSpaces!==allSpaces || spaceIndexCache.homeSpaceId!==homeSpaceId || spaceIndexCache.capabilityModels!==capabilityModels || spaceIndexCache.capabilityGeneration!==capabilityGeneration || spaceIndexCache.observationGeneration!==spaceObservationGeneration || spaceIndexCache.epoch!==collectionEpoch){
      const bySpace=new Map(allSpaces.map(row=>[row.id,row]));
      const spaces=homeSpaceId?allSpaces.filter(row=>{let id=row.id;const seen=new Set();while(id && !seen.has(id)){if(id===homeSpaceId)return true;seen.add(id);const parent=bySpace.get(id);id=parent && parent.parentId;}return false;}).map(row=>row.id===homeSpaceId?{...row,isScopeRoom:!row.isRoot,isRoot:true,parentId:''}:{...row,isRoot:false}):config.homeSpaceRequired?[]:allSpaces;
      const devices=source.map(device=>({...capabilityModels.get(device.id) || device,spaceObservations:[...(spaceObservations.get(device.id)||new Map()).values()]}));
      spaceIndexCache={source,allSpaces,homeSpaceId,capabilityModels,capabilityGeneration,observationGeneration:spaceObservationGeneration,epoch:collectionEpoch,spaces,devices};
    }
    return {devices:spaceIndexCache.devices,spaces:spaceIndexCache.spaces,complete:Boolean(activeSnapshot && !activeSnapshot.isCached && !overviewIndexBuilding && activeSpaceRevision===loadRevision && activeSnapshot.overview && activeSnapshot.overview.status==='complete'),building:overviewIndexBuilding,cached:!activeSnapshot || activeSnapshot.isCached,revision:loadRevision};
  }

  function favoriteReading(reading) {
    const point={...reading},type=String(reading.type || '').toLowerCase();
    if(/^(bool|boolean)$/.test(type)){const value=parseBoolean(reading.value);if(value!==null)point.value=value;}
    else if(/^(integer|float|number)$/.test(type) && (typeof reading.value==='number' || typeof reading.value==='string' && reading.value.trim()!=='')){const value=Number(reading.value);if(Number.isFinite(value))point.value=value;}
    return point;
  }
  function favoriteDeviceIndex() {
    const base=spaceControlIndex(),items=[],seen=new Set();
    for(const source of base.devices.concat([...favoriteSupplement.values()])){const model=capabilityModels.get(source.id) || source;for(const meta of asArray(model.favoriteEndpointMeta)) {
      const key=JSON.stringify([model.id,meta.endpointId]);if(seen.has(key))continue;seen.add(key);
      const spaceId=meta.hasRoomLabel?meta.spaceId:model.spaceId,space=base.spaces.find(row=>row.id===spaceId);
      items.push({deviceId:model.id,endpointId:meta.endpointId,name:String(model.name || '').trim() || String(meta.name || '').trim(),deviceName:model.name,deviceType:meta.deviceType || '',speaker:meta.speaker || [],capabilityTraits:meta.capabilityTraits || [],online:model.favoriteOnline===true,onlineKnown:typeof model.favoriteOnline==='boolean',fresh:!favoriteInvalidIds.has(model.id),spaceId:spaceId || '',spaceName:space?space.name:'',controls:asArray(model.controls).filter(c=>c.endpointId===meta.endpointId),readings:asArray(model.readings).filter(r=>r.endpointId===meta.endpointId).map(favoriteReading),commands:asArray(model.favoriteCommands).filter(c=>c.endpointId===meta.endpointId)});
    }
    }
    return {items,spaces:base.spaces,complete:base.complete,cached:base.cached,settled:Boolean(activeSnapshot && activeSnapshot.overview && ['complete','partial','unavailable'].includes(activeSnapshot.overview.status)),error:Boolean(activeSnapshot && activeSnapshot.overview && ['partial','unavailable'].includes(activeSnapshot.overview.status)),revision:base.revision};
  }

  async function loadFavoriteDeviceIndex(options) {
    if(!spaceControlIndex().complete)await completeSpaceControlIndex(options);
    const candidates=global.FavoriteDevices;
    if(!candidates || typeof candidates.isCandidate!=='function')throw new Error('Favorite device candidate adapter is unavailable');
    // Match the selector's first rendered page: eligibility precedes the row limit and TTL check.
    const choices=favoriteDeviceIndex().items.filter(candidates.isCandidate).slice(0,200).filter(item=>Date.now()-(favoriteCheckedAt.get(item.deviceId) || 0)>10000);
    // A selector reopens immediately from the shared entities; one bounded background pass refreshes its visible page.
    if(choices.length)await refreshFavoriteDevices(choices,{limit:200,isCurrent:options && options.isCurrent});
    return favoriteDeviceIndex();
  }

  async function resolveFavoriteDevices(choices) {
    if(config.homeDeviceMode!=='favorites' || !activeSnapshot || activeSnapshot.isCached)return favoriteDeviceIndex();
    if(favoriteResolvePromise){await favoriteResolvePromise;return resolveFavoriteDevices(choices);}
    const revision=loadRevision,ids=[...new Set(asArray(choices).slice(0,10).map(v=>String(asObject(v).deviceId || '')).filter(Boolean))];
    const needed=new Set(ids.filter(id=>!capabilityModels.has(id)));
    if(!needed.size)return favoriteDeviceIndex();
    let operation;
    operation=(async()=>{
      if(overviewCatalogPromise)await overviewCatalogPromise;
      if(revision!==loadRevision)throw new Error('A newer Studio refresh replaced this request');
      const found=new Map(),catalog=overviewCatalog,source=catalog?(catalog.lookupDevices || catalog.devices):activeSnapshot.devices;
      source.forEach(d=>{if(needed.has(d.id))found.set(d.id,d);});
      const pageSize=overviewCatalogPageSize(),total=catalog?catalog.totalCount:activeSnapshot.deviceTotalCount;
      // Skip only whole catalog pages already fetched; no definitions for unrelated devices.
      const start=catalog?Math.ceil(source.length/pageSize)+1:1;
      for(let pageNum=start;found.size<needed.size && (pageNum-1)*pageSize<Math.min(total,5000);pageNum++){
        const page=devicePage(await request(routes.devices,{params:{pageNum,pageSize,includeSpace:true}}));
        if(revision!==loadRevision)throw new Error('A newer Studio refresh replaced this request');
        page.items.map(normalizeDevice).forEach(d=>{if(needed.has(d.id))found.set(d.id,d);});
        if(page.items.length<pageSize)break;
      }
      const models=await ensureCapabilityModels([...found.values()],revision);
      if(revision!==loadRevision)throw new Error('A newer Studio refresh replaced this request');
      models.forEach(d=>favoriteSupplement.set(d.id,{id:d.id}));
      return favoriteDeviceIndex();
    })().finally(()=>{if(favoriteResolvePromise===operation)favoriteResolvePromise=null;});
    favoriteResolvePromise=operation;return operation;
  }

  async function refreshFavoriteDevices(choices,options) {
    if(config.homeDeviceMode!=='favorites' || !activeSnapshot || activeSnapshot.isCached)throw new Error('Favorite state is unavailable');
    invalidateCollections(['/devices']);
    const revision=loadRevision,ids=[...new Set(asArray(choices).slice(0,options && options.limit===200?200:10).map(v=>String(asObject(v).deviceId || '')).filter(Boolean))];
    const valid=()=>revision===loadRevision && (!options || typeof options.isCurrent!=='function' || options.isCurrent());
    if(!valid())throw new Error('Favorite refresh replaced');if(!ids.length)return favoriteDeviceIndex();
    // Join an identical read; serialize differing targets so catalog scans never compete.
    if(favoriteRefreshFlight){const previous=favoriteRefreshFlight;await previous.promise;if(!valid())return favoriteDeviceIndex();if(previous.committed && previous.key===ids.slice().sort().join('|'))return favoriteDeviceIndex();if(favoriteRefreshFlight===previous)favoriteRefreshFlight=null;return refreshFavoriteDevices(choices,options);}
    const token=++entitySequence,flight={key:ids.slice().sort().join('|'),promise:null};
    flight.promise=(async()=>{
      const found=[],needed=new Set(ids),pageSize=200;let exhausted=false;
      try {
        for(let pageNum=1;(pageNum-1)*pageSize<5000 && needed.size;pageNum++){
          const page=devicePage(await request(routes.devices,{params:{pageNum,pageSize,includeSpace:true}}));
          if(!valid())return favoriteDeviceIndex();
          for(const raw of page.items){const device=normalizeDevice(raw);if(needed.has(device.id)){found.push(device);needed.delete(device.id);}}
          exhausted=page.items.length<pageSize || Number.isFinite(page.totalCount) && pageNum*pageSize>=page.totalCount;if(exhausted)break;
        }
        const definitions=found.length?await loadDefinitions(found.map(d=>d.id)):[];
        if(!valid())return favoriteDeviceIndex();
        const defined=new Set(definitions.map(d=>String(d.deviceId || '')));
        const models=rememberCapabilityModels(mergeCapabilities(found.filter(d=>defined.has(d.id)),definitions,false),token);
        for(const model of models){favoriteSupplement.set(model.id,{id:model.id});if((entityVersions.get(model.id) || 0)===token){favoriteInvalidIds.delete(model.id);favoriteCheckedAt.set(model.id,Date.now());}}
        for(const id of ids){
          if((entityVersions.get(id) || 0)>token || favoriteWrites.has(id))continue;
          if(needed.has(id) && exhausted){entityVersions.set(id,token);const old=capabilityModels.get(id);if(old){capabilityModels.set(id,Object.assign({},old,{favoriteEndpointMeta:[],favoriteCommands:[],controls:[],readings:[],control:null}));capabilityGeneration++;}latestControls.delete(id);favoriteSupplement.delete(id);}
          else if(!defined.has(id))favoriteInvalidIds.add(id);
        }
        flight.committed=true;return favoriteDeviceIndex();
      } catch(error){if(valid())for(const id of ids)if((entityVersions.get(id) || 0)<=token && !favoriteWrites.has(id))favoriteInvalidIds.add(id);throw error;}
    })();
    favoriteRefreshFlight=flight;
    try{return await flight.promise;}finally{if(favoriteRefreshFlight===flight)favoriteRefreshFlight=null;}
  }

  async function readFavoriteCurtainPosition(model,item,functionCode,revision) {
    if(revision!==loadRevision)return {accepted:true,stale:true};
    const position=asArray(model.readings).find(r=>r.endpointId===item.endpointId && r.functionCode===functionCode && r.traitCode==='CurrentPositionPercentage');
    if(!position)return {accepted:true,unconfirmed:true};
    await new Promise(resolve=>global.setTimeout(resolve,Math.min(5000,Math.max(500,Number(config.controlReadbackDelayMs)||2000))));
    if(revision!==loadRevision)return {accepted:true,stale:true};
    try{
      const values=await request(routes.readTrait,{data:{data:[{deviceId:item.deviceId,endpointId:position.endpointId,functionCode:position.functionCode,traitCodes:[position.traitCode]}]}});
      if(revision!==loadRevision)return {accepted:true,stale:true};
      const row=asArray(values).find(v=>String(v.deviceId || '')===item.deviceId && Number(v.endpointId)===position.endpointId && v.functionCode===position.functionCode && v.traitCode===position.traitCode);
      const value=row && favoriteReading(Object.assign({},position,{value:row.value})).value;
      if(typeof value!=='number' || !Number.isFinite(value) || value<0 || value>100)return {accepted:true,unconfirmed:true};
      position.value=value;position.displayValue=String(value)+'%';
      return {accepted:true,observed:true,actual:value};
    }catch(_){return {accepted:true,unconfirmed:true};}
  }

  async function executeFavoriteDevice(item,controlId,nextValue) {
    if(favoriteWrites.has(item.deviceId))throw new Error('Device control is already pending');
    const revision=loadRevision;favoriteWrites.add(item.deviceId);entityVersions.set(item.deviceId,++entitySequence);
    try{return await executeFavoriteDeviceTransaction(item,controlId,nextValue);}
    finally{if(revision===loadRevision){entityVersions.set(item.deviceId,++entitySequence);favoriteWrites.delete(item.deviceId);}}
  }

  async function executeFavoriteDeviceTransaction(item,controlId,nextValue) {
    if(config.homeDeviceMode!=='favorites' || !config.enableDeviceWrites || !activeSnapshot || activeSnapshot.isCached)throw new Error('常用设备控制暂不可用');
    const revision=loadRevision,model=capabilityModels.get(item.deviceId);
    if(!model || model.favoriteOnline!==true || favoriteInvalidIds.has(item.deviceId) || !asArray(model.favoriteEndpointMeta).some(meta=>meta.endpointId===item.endpointId))throw new Error('设备状态或端点定义已变化');
    const speakerMeta=asArray(model.favoriteEndpointMeta).find(meta=>meta.endpointId===item.endpointId && meta.deviceType==='Speaker');
    if(speakerMeta && global.FavoriteSpeaker)return executeFavoriteSpeaker(model,item,speakerMeta,controlId,nextValue,revision);
    const command=asArray(model.favoriteCommands).find(c=>c.id===controlId && c.endpointId===item.endpointId);
    if(command) {
      const failures=await request(routes.executeCommand,{data:{data:[{deviceId:item.deviceId,endpointId:command.endpointId,functionCode:command.functionCode,commandCode:command.commandCode}]}});
      if(!Array.isArray(failures))throw new Error('Invalid Studio command response');throwWriteFailures(failures);
      return readFavoriteCurtainPosition(model,item,command.functionCode,revision);
    }
    const control=asArray(model.controls).find(c=>c.id===controlId && c.endpointId===item.endpointId && c.kind==='boolean' && /^(OnOff|Power|PowerState)$/.test(c.traitCode));
    if(!control || typeof nextValue!=='boolean')throw new Error('当前端点未提供安全快捷控制');
    const failures=await request(routes.executeTrait,{data:{data:[{deviceId:item.deviceId,endpointId:control.endpointId,functionCode:control.functionCode,traitCode:control.traitCode,value:nextValue}]}});
    if(!Array.isArray(failures))throw new Error('Invalid Studio trait response');throwWriteFailures(failures);
    if(revision!==loadRevision)return {accepted:true,stale:true};
    try{const result=await readBackDevice(item.deviceId,nextValue,control.id);if(revision!==loadRevision)return {accepted:true,stale:true};control.value=result.actual;for(const reading of asArray(model.readings))if(reading.id===control.id)reading.value=result.actual;return {accepted:true,confirmed:result.confirmed,actual:result.actual};}
    catch(_){return {accepted:true,unconfirmed:true,stale:revision!==loadRevision};}
  }

  async function executeFavoriteSpeaker(model,item,meta,id,value,revision) {
    const adapter=global.FavoriteSpeaker,source={deviceType:'Speaker',speaker:meta.speaker || []},point=adapter.validate(source,id,value);
    const failures=await request(routes.executeTrait,{data:{data:[{deviceId:item.deviceId,endpointId:point.endpointId,functionCode:point.functionCode,traitCode:point.traitCode,value}]}});
    if(!Array.isArray(failures))throw new Error('Invalid Studio speaker response');throwWriteFailures(failures);
    if(revision!==loadRevision)return {accepted:true,stale:true};
    const readable=source.speaker.filter(p=>p.parameter.readable!==false),groups=[];
    for(const p of readable){let group=groups.find(g=>g.functionCode===p.functionCode);if(!group){group={deviceId:item.deviceId,endpointId:item.endpointId,functionCode:p.functionCode,traitCodes:[]};groups.push(group);}if(!group.traitCodes.includes(p.traitCode))group.traitCodes.push(p.traitCode);}
    if(!groups.length)return {accepted:true,unconfirmed:true};
    await new Promise(resolve=>global.setTimeout(resolve,Math.min(5000,Math.max(500,Number(config.controlReadbackDelayMs)||2000))));
    if(revision!==loadRevision)return {accepted:true,stale:true};
    try{
      const rows=await request(routes.readTrait,{data:{data:groups}});if(revision!==loadRevision)return {accepted:true,stale:true};let observed=false;
      const valid=new Set();for(const p of readable){const row=asArray(rows).find(r=>String(r.deviceId || '')===item.deviceId && Number(r.endpointId)===item.endpointId && r.functionCode===p.functionCode && r.traitCode===p.traitCode);if(!row || !adapter.observe(p,row.value))continue;observed=true;valid.add(p.id);for(const r of asArray(model.readings))if(r.id===p.id){r.value=p.value;r.displayValue=String(p.value)+(r.unit || '');}}
      if(!observed)return {accepted:true,unconfirmed:true};
      if(point.traitCode==='TargetPlaybackState'){
        const current=readable.find(p=>p.traitCode==='CurrentPlaybackState');
        if([0,1].includes(Number(value)))return current && valid.has(current.id)?{accepted:true,confirmed:Number(current.value)===Number(value)}:{accepted:true,unconfirmed:true};
        return {accepted:true,observed:true};
      }
      return valid.has(point.id)?{accepted:true,confirmed:point.traitCode==='Volume'?Math.abs(Number(point.value)-Number(value))<.001:point.value===value}:{accepted:true,unconfirmed:true};
    }catch(_){return {accepted:true,unconfirmed:true,stale:revision!==loadRevision};}
  }

  async function executeSpaceControls(items) {
    if (!config.enableDeviceWrites || !spaceControlIndex().complete) throw new Error('请等待完整空间数据读取完成');
    if(!Array.isArray(items) || !items.length || items.length>overviewMaxDevices()*4)throw new Error('Invalid space control plan');
    const revision=loadRevision, accepted=[], failures=[];
    const groups={trait:[],command:[]}, seen=new Set();
    for(const item of items) {
      const model=capabilityModels.get(item.deviceId);const controls=asArray(model && model.controls).concat(asArray(model && model.spaceCommands));
      const control=controls.find(value=>value.id===item.controlId);
      if(!model || !model.online || !control)throw new Error('空间控制定义已变化');
      const key=JSON.stringify([item.deviceId,control.id]);if(seen.has(key))continue;seen.add(key);
      groups[control.kind==='command'?'command':'trait'].push({deviceId:item.deviceId,control,value:control.kind==='command'?undefined:validateControlValue(control,item.value)});
    }
    for(const kind of ['trait','command']) for(let offset=0;offset<groups[kind].length;offset+=40) {
      if(revision!==loadRevision)throw new Error('A newer Studio refresh replaced this command plan');
      const batch=groups[kind].slice(offset,offset+40),data=batch.map(item=>({deviceId:item.deviceId,endpointId:item.control.endpointId,functionCode:item.control.functionCode,...(kind==='command'?{commandCode:item.control.commandCode}:{traitCode:item.control.traitCode,value:item.value})}));
      try {
        const value=await request(kind==='command'?routes.executeCommand:routes.executeTrait,{data:{data}});if(!Array.isArray(value))throw new Error('Invalid Studio batch response');
        const unknownFailure=value.some(f=>!batch.some(item=>String(f.deviceId || '')===item.deviceId && Number(f.endpointId)===item.control.endpointId && String(f.functionCode || '')===item.control.functionCode && String(f.traitCode || f.commandCode || '')===String(item.control.traitCode || item.control.commandCode)));
        for(const item of batch) { if(unknownFailure || value.some(f=>String(f.deviceId || '')===item.deviceId && Number(f.endpointId)===item.control.endpointId && String(f.functionCode || '')===item.control.functionCode && String(f.traitCode || f.commandCode || '')===String(item.control.traitCode || item.control.commandCode)))failures.push(item.deviceId);else accepted.push(item); }
      }catch(_){batch.forEach(item=>failures.push(item.deviceId));}
    }
    if(revision!==loadRevision)return {accepted:accepted.length,failed:failures.length,unconfirmed:accepted.length,stale:true};
    // Confirm through one targeted batched read pass, never optimistic group counts.
    const reads=[], keys=new Set();
    for(const item of accepted){const model=capabilityModels.get(item.deviceId);let points=[];
      if(item.control.kind!=='command')points.push(item.control);
      if(model && model.category==='curtain')points=points.concat(asArray(model.readings).filter(point=>point.traitCode==='CurrentPositionPercentage'));
      for(const point of points){const key=JSON.stringify([item.deviceId,point.endpointId,point.functionCode,point.traitCode]);if(!keys.has(key)){keys.add(key);reads.push({deviceId:item.deviceId,endpointId:point.endpointId,functionCode:point.functionCode,traitCodes:[point.traitCode]});}}
    }
    let unconfirmed=0;
    if(reads.length){await new Promise(resolve=>global.setTimeout(resolve,Math.max(500,Number(config.controlReadbackDelayMs)||2000)));
      for(let offset=0;offset<reads.length;offset+=40){if(revision!==loadRevision)break;const batch=reads.slice(offset,offset+40);
        try{const values=asArray(await request(routes.readTrait,{data:{data:batch}}));if(revision!==loadRevision)break;
          for(const requested of batch){const value=values.find(v=>String(v.deviceId || '')===requested.deviceId && Number(v.endpointId)===requested.endpointId && v.functionCode===requested.functionCode && v.traitCode===requested.traitCodes[0]);const model=capabilityModels.get(requested.deviceId);
            if(!value || !model || value.value===null || value.value===undefined){unconfirmed++;continue;}
            const control=asArray(model.controls).find(c=>c.endpointId===requested.endpointId && c.functionCode===requested.functionCode && c.traitCode===requested.traitCodes[0]);
            if(control){const actual=normalizeControlValue(control,value.value);if(actual===null || (control.kind==='range'&&!Number.isFinite(actual))){unconfirmed++;continue;}control.value=actual;}
            for(const point of asArray(model.readings)){if(point.endpointId===requested.endpointId && point.functionCode===requested.functionCode && point.traitCode===requested.traitCodes[0])point.value=value.value;}
          }
        }catch(_){unconfirmed+=batch.length;}
      }
    }
    return {accepted:accepted.length,failed:failures.length,unconfirmed,stale:revision!==loadRevision};
  }

  async function listScenes() {
    const epoch=collectionVersion(), scenes=[], seen=new Set();
    for(let pageNum=1;pageNum<=100;pageNum++) {
      const value=await request(routes.scenes,{params:{pageNum,pageSize:200,needChildren:true}});
      if(epoch!==collectionVersion())throw new Error('Studio collection scope changed');
      const page=normalizeScenes(value), before=scenes.length;
      for(const scene of page)if(!seen.has(scene.id)){seen.add(scene.id);scenes.push(scene);}
      const object=asObject(value), paginated=['totalCount','pageNum','pageSize'].some(key=>object[key]!=null), parsedTotal=sceneNumber(object.totalCount), total=parsedTotal===undefined?page.length:parsedTotal;
      if(total>0 && scenes.length>=total || !paginated || !page.length || page.length<200 || scenes.length===before)break;
    }
    return scenes;
  }

  global.StudioRuntime = Object.freeze({ queryFavoriteMetadata: keys=>requestTransport(routes.queryMetadata,{data:{keys}}), updateFavoriteMetadata: metadata=>requestTransport(routes.updateMetadata,{data:{metadata}}), getHomeSpace, setHomeSpace, readCollection, invalidateCollections, setCollectionScope, collectionReady, collectionVersion, favoriteDeviceIndex, loadFavoriteDeviceIndex, resolveFavoriteDevices, refreshFavoriteDevices, applyPushedTraitValues, dashboardWatchedTraits, reconcileDashboardTraits, refreshDashboardCollection, executeFavoriteDevice, completeSpaceControlIndex, spaceControlIndex, executeSpaceControls, sceneIdentity, canExecuteScene, listScenes, load, loadOverviewIndex, loadNextPage, loadCached, executeDevice, readBackDevice, executeScene, routes, classifyDevice, deriveAssistantHints });
})(window);
