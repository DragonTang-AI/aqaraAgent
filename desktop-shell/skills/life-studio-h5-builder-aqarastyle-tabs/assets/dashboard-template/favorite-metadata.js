(function(global){
  'use strict';
  const keys=Object.freeze(['favoriteDevices','favoriteScenes']);
  const copy=value=>JSON.parse(JSON.stringify(value));
  const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
  function error(code){const value=new Error(code);value.favoriteCode=code;return value;}
  function map(data){if(!object(data))throw error('favoriteMetadataInvalid');if(Object.prototype.hasOwnProperty.call(data,'metadata')){if(!object(data.metadata))throw error('favoriteMetadataInvalid');return copy(data.metadata);}return copy(data);}
  function list(value,key){
    if(value==null)return [];
    if(typeof value==='string'){try{value=JSON.parse(value);}catch(_){throw error('favoriteMetadataInvalid');}}
    if(!Array.isArray(value))throw error('favoriteMetadataInvalid');
    const result=[],seen=new Set();
    for(const item of value){let normalized;
      if(key==='favoriteDevices'){
        if(!object(item) || !['string','number'].includes(typeof item.did) || !['string','number'].includes(typeof item.endpointId))throw error('favoriteMetadataInvalid');
        const did=String(item.did).trim(),endpointId=String(item.endpointId).trim();if(!did || !endpointId)throw error('favoriteMetadataInvalid');normalized={did,endpointId};
      }else{if(!['string','number'].includes(typeof item))throw error('favoriteMetadataInvalid');normalized=String(item).trim();if(!normalized)throw error('favoriteMetadataInvalid');}
      const id=JSON.stringify(normalized);if(!seen.has(id)){seen.add(id);result.push(normalized);}
    }
    // Never silently truncate a server-owned list and overwrite its remainder.
    if(result.length>10)throw error('favoriteMetadataInvalid');return result;
  }
  function same(a,b,key){if((a==null)!==(b==null))return false;try{return JSON.stringify(list(a,key))===JSON.stringify(list(b,key));}catch(_){return JSON.stringify(a)===JSON.stringify(b);}}
  function endpoint(value){return /^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value))?Number(value):value;}
  function create(options){
    const wanted=keys.filter(key=>options.keys.includes(key)),listeners=new Set();let scope='',epoch=0,metadata={},loaded=false,loading=false,failure='',flight=null,queue=Promise.resolve(),saving=0,serial=0,disposed=false;
    const snapshot=()=>({scope,epoch,loaded,loading,error:failure,saving:saving>0,serial,has:key=>Object.prototype.hasOwnProperty.call(metadata,key),canEdit:Boolean(scope && loaded && !loading && !failure && !saving),items:key=>{try{const values=list(metadata[key],key);return key==='favoriteDevices'?values.map(ref=>({deviceId:ref.did,endpointId:endpoint(ref.endpointId)})):values.map(sceneId=>({sceneId}));}catch(_){return [];}}});
    function emit(){if(!disposed)for(const listener of listeners)listener(snapshot());}
    function valid(owner){return !disposed && owner===epoch && Boolean(scope);}
    function commit(value){for(const key of wanted)list(value[key],key);metadata=value;loaded=true;failure='';serial++;}
    async function load(force=false){
      if(!scope || !wanted.length || disposed)return;if(saving)return queue;if(flight)return flight;if(loaded && !force && !failure)return;
      const owner=epoch,readSerial=serial;loading=true;failure='';emit();
      const operation=(async()=>{try{const value=map(await Promise.resolve().then(()=>options.query(wanted)));if(!valid(owner) || readSerial!==serial)return;commit(value);}catch(e){if(valid(owner))failure=e.favoriteCode || 'favoriteMetadataLoadFailed';throw e;}finally{if(valid(owner)){loading=false;emit();}if(flight===operation)flight=null;}})();flight=operation;return operation;
    }
    function save(key,items,base){
      if(!wanted.includes(key) || !scope || !loaded || loading || failure)return Promise.reject(error('favoriteMetadataLoadFailed'));
      const next=key==='favoriteDevices'?items.map(item=>({did:item.deviceId,endpointId:String(item.endpointId)})):items.map(item=>String(item.sceneId || '').trim());
      list(next,key);const owner=epoch,expected=copy(base);saving++;emit();
      const operation=queue.catch(()=>{}).then(async()=>{
        if(!valid(owner))throw error('favoriteMetadataScopeChanged');
        const latest=map(await options.query(keys));if(!valid(owner))throw error('favoriteMetadataScopeChanged');
        // Same-key edits are conflicts. Other keys are preserved from this fresh read.
        if(!same(latest[key],expected,key)){commit(latest);emit();throw error('favoriteMetadataConflict');}
        const payload={...latest,[key]:next};
        try{await options.update(payload);}catch(e){
          if(!valid(owner))throw error('favoriteMetadataScopeChanged');
          // A lost response may follow an accepted write. Read once; never replay the write.
          try{const observed=map(await options.query(keys));if(!valid(owner))throw error('favoriteMetadataScopeChanged');if(same(observed[key],next,key)){commit(observed);return;}commit(observed);}catch(check){if(check.favoriteCode==='favoriteMetadataScopeChanged')throw check;failure='favoriteMetadataUnconfirmed';}
          throw error(failure || 'favoriteSaveFailed');
        }
        if(!valid(owner))throw error('favoriteMetadataScopeChanged');commit({...latest,[key]:next});
      }).finally(()=>{if(valid(owner)){saving--;emit();}});
      queue=operation;return operation;
    }
    return Object.freeze({get:snapshot,base:key=>copy(metadata[key]==null?null:metadata[key]),subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},setScope(studio,user){const next=studio?JSON.stringify([String(studio),String(user || '')]):'';if(next===scope)return;epoch++;scope=next;metadata={};loaded=false;loading=false;failure='';flight=null;saving=0;queue=Promise.resolve();serial++;emit();},load,save,dispose(){disposed=true;epoch++;listeners.clear();}});
  }
  global.FavoriteMetadata=Object.freeze({create,keys,readMap:map,readList:list});
})(window);
