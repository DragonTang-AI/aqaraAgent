(function (global) {
  'use strict';
  function create(source) {
    const state = JSON.parse(JSON.stringify(source));
    state.metadata=state.metadata || {};
    const failures = Object.assign({}, state.failures);
    const clone = value => JSON.parse(JSON.stringify(value));
    function fail(message) { throw new Error(message); }
    function definition(id) { return state.definitions.find(item => item.deviceId === id) || fail('Unknown mock device'); }
    function trait(item) {
      const endpoint = definition(item.deviceId).endpoints.find(value => value.endpointId === item.endpointId);
      const fn = endpoint && endpoint.functions.find(value => value.functionCode === item.functionCode);
      return fn && fn.traits.find(value => value.traitCode === item.traitCode) || fail('Unknown mock trait');
    }
    function page(items, params) {
      const number = Number(params.pageNum || 1), size = Number(params.pageSize || 12);
      if (!Number.isInteger(number) || number < 1 || !Number.isInteger(size) || size < 1 || size > 200) fail('Invalid pagination');
      return { data: items.slice((number - 1) * size, number * size), totalCount: items.length, pageNum: number, pageSize: size };
    }
    function spaceMatches(item,params){
      if(!params.spaceIds)return true;const chosen=new Set(String(params.spaceIds).split(','));
      if(params.needChildren===true){function walk(nodes,parentSelected){for(const node of nodes){const selected=parentSelected || chosen.has(String(node.spaceId));if(selected)chosen.add(String(node.spaceId));walk(node.children || [],selected);}}walk(state.spaces,false);}
      return chosen.has(String(item.space && item.space.spaceId || item.spaceId || ''));
    }
    function request(input) {
      if (!input || typeof input.url !== 'string' || !input.url.startsWith('/open/api/v1/')) fail('Only local simulated Studio routes are supported');
      const path = input.url.slice('/open/api/v1'.length), method = input.method;
      const params = input.params || {}, body = input.data || {};
      const key = method + ' ' + path;
      if (failures[key] > 0) { failures[key] -= 1; fail('Simulated failure; retry to recover'); }
      let result;
      if(key==='POST /users/me/metadata/query'){
        if(!Array.isArray(body.keys) || !body.keys.length || body.keys.some(key=>typeof key!=='string'))fail('Invalid metadata query');
        const metadata={};for(const name of body.keys)if(Object.hasOwn(state.metadata,name))metadata[name]=clone(state.metadata[name]);result={metadata};
      }else if(key==='POST /users/me/metadata/update'){
        if(!body.metadata || typeof body.metadata!=='object' || Array.isArray(body.metadata))fail('Invalid metadata update');
        state.metadata=clone(body.metadata);result={};
      }else if (key === 'GET /spaces') result = state.spaces;
      else if (key === 'GET /devices') result = page(state.devices.filter(item => spaceMatches(item,params) && (!params.deviceName || item.deviceName.toLowerCase().includes(String(params.deviceName).toLowerCase())) && (typeof params.state !== 'boolean' || item.state === params.state) && (!params.deviceTypesList || (item.deviceTypesList || []).some(type => String(params.deviceTypesList).split(',').includes(type)))), params);
      else if (key === 'GET /devices/definitions') {
        const ids = String(params.deviceIds || '').split(','); ids.forEach(id => definition(id)); result = state.definitions.filter(item => ids.includes(item.deviceId));
      } else if (key === 'GET /automations') result = page(state.automations.filter(item => spaceMatches(item,params) && (!params.automationName || item.name.toLowerCase().includes(String(params.automationName).toLowerCase()))), params);
      else if (key === 'GET /scenes') result = page(state.scenes, params);
      else if (key === 'GET /automations/manual-triggers') result = state.scenes.filter(item => !params.enabledOnly || item.enabled);
      else if (key === 'POST /automations/status') {
        if (!Array.isArray(body.automationIds) || !body.automationIds.length || typeof body.enabled !== 'boolean') fail('Invalid status write');
        const entries = body.automationIds.map(id => state.automations.find(item => item.automationId === id) || fail('Unknown automation'));
        entries.forEach(item => { item.enabled = body.enabled; state.scenes.filter(scene => scene.automationId === item.automationId).forEach(scene => { scene.enabled = body.enabled; }); });
        result = { successIds: body.automationIds, failedItems: [] };
      } else if (key === 'POST /devices/trait/execute') {
        if (!Array.isArray(body.data) || !body.data.length) fail('Invalid trait write');
        const writes = body.data.map(item => {
          const target = trait(item), parameter = target.parameter;
          if (!parameter.writable) fail('Trait is read-only');
          if (parameter.type === 'Bool' && typeof item.value !== 'boolean') fail('Expected Boolean');
          if (parameter.type === 'Integer' && (!Number.isInteger(item.value) || item.value < parameter.min || item.value > parameter.max)) fail('Invalid range');
          return { target, value: item.value, request:item };
        });
        writes.forEach(item => { item.target.value = item.value; if(item.request.functionCode==='MediaPlayback' && item.request.traitCode==='TargetPlaybackState' && [0,1,2].includes(Number(item.value))){const current=trait(Object.assign({},item.request,{traitCode:'CurrentPlaybackState'}));current.value=Number(item.value);} if(item.request.traitCode==='TargetPositionPercentage'){const actual=trait(Object.assign({},item.request,{traitCode:'CurrentPositionPercentage'}));actual.value=item.value;} }); result = [];
      } else if (key === 'POST /devices/command/execute') {
        if(!Array.isArray(body.data) || !body.data.length)fail('Missing command items');
        body.data.forEach(item=>{const def=definition(item.deviceId),ep=def.endpoints.find(v=>v.endpointId===item.endpointId),fn=ep && ep.functions.find(v=>v.functionCode===item.functionCode),cmd=fn && fn.commands.find(v=>v.commandCode===item.commandCode);if(!ep || ep.deviceType!=='WindowCovering' || !cmd || !['StopMotion','AutoControl'].includes(cmd.commandCode) || cmd.fields.length)fail('Unsupported simulated command');if(cmd.commandCode==='AutoControl'){const position=fn.traits.find(t=>t.traitCode==='CurrentPositionPercentage');if(position)position.value=position.value>0?0:100;}});result=[];
      } else if (key === 'POST /devices/trait/read') {
        if (!Array.isArray(body.data) || !body.data.length) fail('Invalid readback');
        result = []; body.data.forEach(item => { if (!Array.isArray(item.traitCodes)) fail('Missing trait codes'); item.traitCodes.forEach(code => { const target = trait(Object.assign({}, item, { traitCode: code })); result.push({ deviceId: item.deviceId, endpointId: item.endpointId, functionCode: item.functionCode, traitCode: code, value: target.value }); }); });
      } else if (key === 'POST /scenes/execute') {
        const scene=state.scenes.find(item=>String(item.sceneId)===body.sceneId);if(!scene || scene.enabled===false)fail('Scene is unavailable');result={};
      } else if (key === 'POST /automations/manual-triggers/execute') {
        const scene = state.scenes.find(item => item.automationId === body.automationId && item.triggerNodeId === body.triggerNodeId);
        if (!scene || !scene.enabled) fail('Scene is unavailable'); result = {};
      } else fail('Unsupported simulated route: ' + key);
      return { code: 0, data: clone(result) };
    }
    return Object.freeze({ request });
  }
  global.PreviewStudio = Object.freeze({ create });
})(window);
