(function (global, document) {
  'use strict';
  const LIMIT = 10;
  function clear(element) { while(element.firstChild) element.removeChild(element.firstChild); }
  const identity = scene => global.StudioRuntime && global.StudioRuntime.sceneIdentity ? global.StudioRuntime.sceneIdentity(scene) : String(scene.sceneId || scene.id || [scene.automationId,scene.triggerNodeId].filter(Boolean).join('#'));
  const legacyPair = scene => scene && scene.automationId && scene.triggerNodeId ? JSON.stringify([scene.automationId,scene.triggerNodeId]) : '';
  // Original, theme-tinted symbols with a shared 24px grid and optical stroke.
  // Names choose decorative imagery only; scene identity and execution still use Studio data.
  const sceneSymbols = [
    ['nightlight',/起夜|夜灯|night.?light|night.?walk/i,'<path d="M4 18.5h16M7 18.5v-3a5 5 0 0 1 10 0v3M10 21h4"/><path d="M17.2 3.8a4.7 4.7 0 0 0 2.1 6.3 5 5 0 0 1-5.7-5.7 4.7 4.7 0 0 0 3.6-.6Z"/>'],
    ['morning',/起床|早安|清晨|morning|wake.?up|sunrise/i,'<path d="M3 18h18M7 15a5 5 0 0 1 10 0M12 3v2M4.6 7.1l1.5 1.5M19.4 7.1l-1.5 1.5"/><path d="M5 21h14" opacity=".5"/>'],
    ['night',/晚安|睡眠|睡觉|夜间|good.?night|sleep|bedtime/i,'<path d="M20.4 15.1A8.3 8.3 0 0 1 8.9 3.6 8.5 8.5 0 1 0 20.4 15.1Z"/><path d="m17.5 3 .5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5Z" opacity=".65"/>'],
    ['nap',/午休|小憩|休息|nap|rest/i,'<path d="M3 17.5h18M5.5 17.5v-5h13v5M5.5 13.3h13M7.3 10.5h3.8v2.8H7.3z"/><path d="m17.5 3 .5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5Z" opacity=".65"/>'],
    ['home',/回家|到家|回房|归家|arriv|return.?home|welcome.?home/i,'<path d="m3 10 9-7 9 7M5 9.5V21h14V9.5M9.3 21v-6.8h5.4V21"/><path d="M16.4 4.5V3h2v3" opacity=".55"/>'],
    ['away',/离家|出门|外出|away|leave|depart/i,'<path d="M4 20V4h10v16H4ZM7.5 12h.1M16 12h5m-2.5-2.5L21 12l-2.5 2.5"/>'],
    ['study',/学习|學习|作业|study|homework/i,'<path d="M3.5 6c3-.5 5.9-.1 8.5 1.4 1.8-1 3.7-1.5 5.8-1.5M3.5 6v13c3-.4 5.9-.1 8.5 1.4 2.6-1.5 5.5-1.8 8.5-1.4v-7M12 7.4v13"/><path d="m16.5 4 3.5 3.5-5.6 5.6-3.9.4.4-3.9L16.5 4Z"/>'],
    ['reading',/阅读|讀书|读书|read|book/i,'<path d="M12 6c-2.6-1.5-5.5-1.8-8.5-1.4v14c3-.4 5.9-.1 8.5 1.4 2.6-1.5 5.5-1.8 8.5-1.4v-14c-3-.4-5.9-.1-8.5 1.4ZM12 6v14"/><path d="M6.5 9c1.3 0 2.3.2 3.2.6M14.3 9.6c.9-.4 1.9-.6 3.2-.6" opacity=".5"/>'],
    ['relax',/温馨|放松|舒适|cozy|relax|comfort/i,'<path d="M5 18.5c6.6 0 11.3-3.6 13.3-11.5-6.8.2-11.8 4-13.3 11.5ZM5 18.5c3.4-4.2 6.8-6.8 11-8.8"/><path d="M18.5 17v3M17 18.5h3" opacity=".65"/>'],
    ['movie',/观影|影音|电影|影院|movie|cinema|theater/i,'<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m10 9 5 3-5 3V9ZM3 8h18"/>'],
    ['dining',/用餐|吃饭|做饭|烹饪|dining|dinner|cook|meal/i,'<path d="M5 3v6a3 3 0 0 0 6 0V3M8 3v18M16 21V4.5a4 4 0 0 1 4 4V14h-4"/>'],
    ['play',/玩耍|游戏|亲子|play|game|family.?time/i,'<path d="m12 3 8.5 8.5L12 20 3.5 11.5 12 3ZM12 20v2M18.5 5.5l.5-1.3.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5Z"/><path d="M7.5 11.5h9" opacity=".5"/>'],
    ['guest',/会客|聚会|访客|guest|party|visitor/i,'<circle cx="9" cy="8" r="2.6"/><path d="M3.5 19v-1.2a5.5 5.5 0 0 1 11 0V19M16.7 5.7a2.6 2.6 0 0 1 0 4.9M16.8 13.2a4.8 4.8 0 0 1 3.7 4.6V19"/>'],
    ['lights',/灯光|照明|开灯|关灯|light|lamp/i,'<path d="M9 18h6m-5 3h4M8.4 14.2C5.5 10.8 7.1 5 10 3.8a5.3 5.3 0 0 1 6.9 6.9c-.4 1.4-1.3 2.4-2.4 3.5l-.8 2.1h-5l-.3-2.1Z"/><path d="M12 1.5v1" opacity=".55"/>'],
    ['shade',/窗帘|遮阳|百叶|curtain|shade|blind/i,'<path d="M3 4h18M5.5 5.5V20l6.5-3 6.5 3V5.5M12 5.5V17M4 21h16"/>'],
    ['climate',/空调|暖气|冷暖|温控|climate|heat|cool/i,'<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 5.5 12 8l2.5-2.5M9.5 18.5 12 16l2.5 2.5"/>'],
    ['security',/安防|警戒|守护|security|guard|protect/i,'<path d="M12 2.5 20 6v5.5c0 4.3-3.1 7.7-8 10-4.9-2.3-8-5.7-8-10V6l8-3.5Z"/><path d="m8.5 12 2.3 2.3 4.7-4.7"/>'],
    ['cleaning',/清洁|打扫|扫地|clean|vacuum/i,'<path d="m12 2 1.5 5 5 1.5-5 1.5-1.5 5-1.5-5-5-1.5 5-1.5L12 2ZM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/><path d="M4 17h7" opacity=".55"/>']
  ];
  const genericSceneSymbol = ['scene','<path d="M12 2.5 14.8 9.2 21.5 12l-6.7 2.8L12 21.5l-2.8-6.7L2.5 12l6.7-2.8L12 2.5Z"/><path d="M19 2.5v3M17.5 4h3" opacity=".55"/>'];
  function symbolFor(name) { return sceneSymbols.find(item => item[1].test(name)) || genericSceneSymbol; }
  // View-only ranking of real catalog records; names suggest relevance, never action safety or permissions.
  const roleHints = {
    male: [/回家|离家|away|arriv|return home/i,/晚安|睡眠|good.?night|sleep/i,/观影|影音|movie|cinema/i,/阅读|工作|read|work/i,/会客|聚会|guest|party/i],
    female: [/回家|arriv|return home/i,/温馨|舒适|放松|cozy|comfort|relax/i,/晚安|睡眠|good.?night|sleep/i,/阅读|read/i,/用餐|做饭|dining|dinner|cook/i],
    senior: [/起夜|夜灯|night.?light|night.?walk/i,/起床|早安|wake|morning/i,/晚安|睡眠|good.?night|sleep/i,/阅读|read/i,/休息|午休|rest|nap/i,/回家|arriv|return home/i],
    child: [/学习|作业|study|homework/i,/阅读|read/i,/起床|早安|wake|morning/i,/晚安|睡眠|good.?night|sleep/i,/玩耍|亲子|play|family/i,/回家|arriv|return home/i]
  };
  function defaults(catalog, enabled, confirmedIds, role) {
    if(!enabled)return {items:[],needsChoice:false};
    const seen=new Set(),items=[];
    for(const scene of catalog || []){const id=typeof scene.sceneId==='string'?scene.sceneId.trim():'';if(!id||seen.has(id))continue;seen.add(id);items.push(scene);}
    const ids=Array.isArray(confirmedIds)?confirmedIds:[];
    if(items.length>6 && ids.length===6 && new Set(ids).size===6){const result=ids.map(id=>items.find(scene=>scene.sceneId===id));if(result.every(Boolean))return {items:result,needsChoice:false};}
    const hints=roleHints[role] || [];
    if(!hints.length&&items.length<=6)return {items,needsChoice:false};
    const ranked=items.map((scene,index)=>{const name=String(scene.name || scene.sceneName || scene.triggerName || '');const match=hints.findIndex(pattern=>pattern.test(name));return {scene,index,rank:match<0?hints.length:match};});
    ranked.sort((a,b)=>Number(a.scene.enabled===false)-Number(b.scene.enabled===false)||a.rank-b.rank||a.index-b.index);
    return {items:ranked.slice(0,6).map(item=>item.scene),needsChoice:false};
  }
  // Role-local selection uses the real scene catalog only; never reads official favorite metadata.
  function automaticScenes(catalog,role){
    const hints=roleHints[role] || [],buckets=hints.map(()=>[]),seen=new Set();
    const unsuitable=/开锁|解锁|撤防|布防|离家|全屋关闭|全部关闭|unlock|disarm|arm security|away|all.?off|摄像|录像|camera|record video/i;
    for(const scene of catalog || []){if(!scene || scene.enabled===false)continue;const id=identity(scene),name=String(scene.name || scene.sceneName || scene.triggerName || '');if(!id || seen.has(id) || unsuitable.test(name))continue;seen.add(id);const rank=hints.findIndex(pattern=>pattern.test(name));if(rank>=0 && buckets[rank].length<6)buckets[rank].push(scene);}
    return [].concat(...buckets).slice(0,6);
  }
  function emptyMessageKey({scope,state,catalogReady,catalogError,defaultSelection,needsDefaultChoice}){
    if(!scope)return 'favoriteStudioUnavailable';
    if(state.error)return state.error;
    if(!state.loaded)return 'favoriteLoading';
    if(catalogError && !catalogReady)return 'favoriteLoadFailed';
    if(!catalogReady && defaultSelection)return 'favoriteLoading';
    return needsDefaultChoice?'favoriteDefaultChoose':'favoriteEmpty';
  }
  function create(options) {
    let selected = [], catalog = [], scope = '', snapshot = {}, editor = null, draft = [], revision = 0, scopeRevision = 0, disposed = false;
    const states = new Map(), timers = new Map();
    let catalogReady=false,needsDefaultChoice=false,automaticCatalog=null,automaticSelection=[],renderSignature='';
    const t = options.translate, grid = options.grid, edit = options.edit;
    function storageKey(){return options.metadata.get().scope;}
    function load(){
      if(options.automatic){if(!scope){selected=[];return;}if(!catalogReady)return;if(automaticCatalog!==catalog){automaticCatalog=catalog;automaticSelection=sanitize(automaticScenes(catalog,options.role));}selected=automaticSelection;return;}
      const state=options.metadata.get();if(!state.loaded||state.loading||state.error)return;
      needsDefaultChoice=false;
      if(typeof state.has!=='function'||state.has('favoriteScenes')){selected=sanitize(state.items('favoriteScenes'));return;}
      if(!catalogReady){selected=[];return;}
      const recommendation=defaults(catalog,options.defaultSelection===true,options.defaultSceneIds,options.role);selected=sanitize(recommendation.items);needsDefaultChoice=recommendation.needsChoice;
    }
    function metadataChanged(state){if(state.scope!==scope){scopeRevision++;for(const timer of timers.values())clearTimeout(timer);timers.clear();states.clear();close(true);selected=[];catalog=[];catalogReady=false;needsDefaultChoice=false;automaticCatalog=null;automaticSelection=[];scope=state.scope;}load();render();}
    function sanitize(items) {
      const result = [], seen = new Set();
      for (const s of items) { if(!s || typeof s!=='object')continue;
        const record={}; for(const field of ['sceneId','id','automationId','triggerNodeId'])if(typeof s[field]==='string' && s[field])record[field]=s[field];
        if(!record.sceneId && !record.id && !(record.automationId && record.triggerNodeId))continue;
        const key=identity(record);if(!seen.has(key)){seen.add(key);result.push(record);}if(result.length===LIMIT)break;
      }
      return result;
    }
    function available(item) { return catalog.find(s=>identity(s)===identity(item)) || (!item.sceneId && legacyPair(item) ? catalog.find(s=>legacyPair(s)===legacyPair(item)) : undefined); }
    function resolved(items){return sanitize(items.map(item=>available(item)||item));}
    function allowed(scene) { return Boolean(scene && (global.StudioRuntime && global.StudioRuntime.canExecuteScene ? global.StudioRuntime.canExecuteScene(scene) : Boolean(scene.sceneId || scene.automationId && scene.triggerNodeId)) && scene.enabled !== false && !snapshot.cached && options.canExecute() && !(states.get(identity(scene)) || {}).pending); }
    function feedback(button, scene) {
      const state = states.get(identity(scene)); const status = button.querySelector('.favorite-scene-status');
      clear(status); status.className = 'favorite-scene-status';
      button.dataset.executionState = state && state.pending ? 'pending' : state && state.result || 'idle';
      if(state && state.pending)delete button.dataset.pressed;
      button.dataset.allowed = String(allowed(scene)); button.disabled = !allowed(scene) || options.isBusy(); button.setAttribute('aria-busy', String(Boolean((state && state.pending))));
      const label = (state && state.pending) ? t('executing', {name:scene.name}) : (state && state.result) === 'success' ? t('favoriteSucceeded') : (state && state.result) === 'failed' ? t('sceneFailed') : '';
      status.setAttribute('aria-label', label); status.setAttribute('role','status');
      if ((state && state.pending) || (state && state.result) === 'failed') { const img = document.createElement('img'); img.src = state.pending?'assets/icon-loading.svg':'assets/favorite-scene-failed.svg'; img.alt = ''; img.width = 20; img.height = 20; status.append(img); }
      else if ((state && state.result) === 'success') { status.textContent = '✓'; status.classList.add('is-success'); }
      button.setAttribute('aria-label', [scene.name || t('unnamedScene'), label || (scene.enabled === false ? t('favoriteDisabled') : t('execute'))].join(', '));
    }
    function repaint(key) { grid.querySelectorAll('.favorite-scene').forEach(button => { if (button.dataset.sceneKey === key) { const scene = available(selected.find(s => identity(available(s) || s) === key) || {}); if (scene) feedback(button, scene); } }); }
    async function execute(scene, button) {
      const epoch=scopeRevision; const key = identity(scene); if (disposed || !allowed(scene) || options.isBusy()) return;
      clearTimeout(timers.get(key)); states.set(key,{pending:true}); options.pending(key,true); feedback(button,scene);
      try { await options.execute(scene); if(epoch!==scopeRevision || disposed)return; states.set(key,{result:'success'}); }
      catch (_) { if(epoch!==scopeRevision || disposed)return; states.set(key,{result:'failed'}); options.notify(t('sceneFailed')); }
      finally { options.pending(key,false); if(epoch!==scopeRevision || disposed)return; repaint(key); timers.set(key,setTimeout(()=>{states.delete(key);timers.delete(key);repaint(key);},2000)); }
    }
    function render() {
      const metadata=options.metadata.get();
      const signature=JSON.stringify({scope,catalogReady,catalogError:Boolean(snapshot.catalogError),cached:Boolean(snapshot.cached),needsDefaultChoice,loaded:metadata.loaded,loading:metadata.loading,error:metadata.error,canEdit:options.canEdit() && metadata.canEdit,selected:selected.map(item=>{const scene=available(item);return [identity(item),scene && scene.name,scene && scene.enabled];})});
      if(signature===renderSignature)return;
      renderSignature=signature;
      clear(grid); edit.hidden=Boolean(options.automatic);edit.setAttribute('aria-label',t('favoriteSelect')); edit.disabled = Boolean(options.automatic) || !options.canEdit() || !metadata.canEdit;
      if (!selected.length && options.automatic){const empty=document.createElement('p');empty.className='favorite-scenes-empty';empty.textContent=t(!scope?'favoriteStudioUnavailable':snapshot.catalogError?'favoriteLoadFailed':!catalogReady?'favoriteLoading':'emptyScenes');grid.append(empty);return;}
      if (!selected.length) { const empty = document.createElement('button'); empty.type='button';empty.className='favorite-scenes-empty';const state=options.metadata.get();empty.textContent=t(emptyMessageKey({scope,state,catalogReady,catalogError:snapshot.catalogError,defaultSelection:options.defaultSelection,needsDefaultChoice}));empty.disabled=state.loaded && !state.error?edit.disabled:!scope || state.loading;empty.addEventListener('click',()=>state.error || !state.loaded?options.metadata.load(true).catch(()=>{}):open());grid.append(empty);return; }
      for (const item of selected) {
        const scene = available(item), button = document.createElement('button');button.type='button';button.className='favorite-scene';button.dataset.sceneKey=identity(scene || item);button.dataset.writeAction='scene';
        const title=document.createElement('span');title.className='favorite-scene-name';title.textContent=scene ? (scene.name || t('unnamedScene')) + (scene.enabled===false ? ' · '+t('favoriteDisabled') : '') : t('favoriteUnavailable');
        title.title=title.textContent;
        // Decorative recognizability only; never infer an execution mode or rename a real scene.
        const glyph=document.createElement('span');glyph.className='favorite-scene-icon';glyph.setAttribute('aria-hidden','true');
        const symbol=symbolFor(scene && scene.name || '');glyph.dataset.sceneSymbol=symbol[0];
        if(options.role==='child'){
          button.classList.add('is-child-art');glyph.classList.add('is-child-art');
          const art=document.createElementNS('http://www.w3.org/2000/svg','svg');art.setAttribute('viewBox','0 0 64 64');art.setAttribute('focusable','false');art.setAttribute('aria-hidden','true');
          const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','#'+symbol[0]);use.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href','#'+symbol[0]);art.append(use);glyph.append(art);
        }else glyph.innerHTML='<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">'+(symbol[2] || symbol[1])+'</svg>';
        button.append(glyph);
        const status=document.createElement('span');status.className='favorite-scene-status';button.append(title,status);
        if(scene){
          feedback(button,scene);
          button.addEventListener('pointerdown',event=>{if(event.isPrimary && !button.disabled)button.dataset.pressed='true';});
          for(const type of ['pointerup','pointercancel','pointerleave','blur'])button.addEventListener(type,()=>{delete button.dataset.pressed;});
          button.addEventListener('click',()=>execute(scene,button));
        }else{button.disabled=true;button.setAttribute('aria-label',t('favoriteUnavailable'));}
        grid.append(button);
      }
    }
    function close(force=false) {
      if (!editor || editor.saving && !force) return; revision++; const saved = editor; editor=null;saved.layer.remove();document.body.classList.remove('is-favorite-editor-open');
      options.app.inert=saved.appInert;document.body.style.overflow=saved.overflow;
      edit.focus({preventScroll:true});global.scrollTo(0,saved.scrollY);
    }
    function editorText() { if (!editor) return;editor.title.textContent=t('favoriteSelect');editor.back.setAttribute('aria-label',t('favoriteBack'));editor.confirm.textContent=editor.saving?t('favoriteSaving'):t('favoriteConfirm',{count:draft.length,max:LIMIT}); }
    function rows() {
      if (!editor) return;clear(editor.list);editorText();
      const selectedKeys=new Set(resolved(draft).map(identity)); const current=new Set(catalog.map(identity));
      const items=[...catalog,...resolved(draft).filter(s=>!current.has(identity(s))).map(s=>({...s,name:t('favoriteUnavailable'),missing:true}))];
      if(!items.length){editor.list.textContent=t('emptyScenes');return;}
      for(const scene of items.slice(0,editor.visibleCount)){const row=document.createElement('button');row.type='button';row.className='favorite-choice';row.setAttribute('role','checkbox');row.dataset.sceneKey=identity(scene);row.setAttribute('aria-checked',String(selectedKeys.has(identity(scene))));
        const name=document.createElement('span');name.textContent=scene.name || t('unnamedScene');const check=document.createElement('span');check.className='favorite-choice-check';check.textContent=selectedKeys.has(identity(scene))?'✓':'';check.setAttribute('aria-hidden','true');row.append(name,check);
        if(scene.enabled===false || scene.missing){const label=document.createElement('small');label.textContent=scene.missing?t('favoriteUnavailable'):t('favoriteDisabled');row.insertBefore(label,check);}
        row.addEventListener('click',()=>{if(!editor || editor.saving)return;const key=identity(scene),index=draft.findIndex(s=>identity(available(s)||s)===key);if(index>=0)draft.splice(index,1);else if(draft.length===LIMIT){options.notify(t('favoriteLimit',{max:LIMIT}));return;}else if(!scene.missing)draft.push(scene);const checked=draft.some(s=>identity(available(s)||s)===key);row.setAttribute('aria-checked',String(checked));check.textContent=checked?'✓':'';editorText();});editor.list.append(row);
      }
      if(items.length>editor.visibleCount){const more=document.createElement('button');more.type='button';more.textContent=t('favoriteMore');more.addEventListener('click',()=>{if(editor.saving)return;editor.visibleCount+=200;rows();});editor.list.append(more);}
    }
    async function open() {
      if(options.automatic)return;
      if(editor || edit.disabled)return; draft=selected.map(s=>({...s}));const ticket=++revision;
      const layer=document.createElement('section');layer.className='favorite-editor';layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-labelledby','favorite-editor-title');
      const header=document.createElement('header'),back=document.createElement('button'),title=document.createElement('h2');title.id='favorite-editor-title';back.type='button';back.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';back.addEventListener('click',()=>close());header.append(back,title);
      const list=document.createElement('div');list.className='favorite-choice-list';const footer=document.createElement('footer'),confirm=document.createElement('button');confirm.type='button';footer.append(confirm);layer.append(header,list,footer);
      editor={layer,back,title,list,confirm,saving:false,base:options.metadata.base('favoriteScenes'),visibleCount:200,scrollY:global.scrollY,overflow:document.body.style.overflow,appInert:options.app.inert};options.app.inert=true;document.body.style.overflow='hidden';document.body.append(layer);document.body.classList.add('is-favorite-editor-open');editorText();list.textContent=t('favoriteLoading');confirm.disabled=true;layer.tabIndex=-1;layer.focus({preventScroll:true});
      layer.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}if(event.key==='Tab'){const focusable=[...layer.querySelectorAll('button:not(:disabled)')];const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&(document.activeElement===first||document.activeElement===layer)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
      confirm.addEventListener('click',async()=>{if(!editor || editor.saving)return;const current=editor,ownerScope=scope,next=resolved(draft);if(next.some(item=>!item.sceneId)){options.notify(t('favoriteMetadataInvalid'));return;}current.saving=true;confirm.disabled=true;back.disabled=true;list.inert=true;confirm.textContent=t('favoriteSaving');try{await options.metadata.save('favoriteScenes',next,current.base);if(disposed || ownerScope!==scope || editor!==current)return;current.saving=false;load();close();render();}catch(error){if(ownerScope!==scope || editor!==current)return;options.notify(t(error.favoriteCode || 'favoriteSaveFailed'));if(error.favoriteCode==='favoriteMetadataConflict'){current.base=options.metadata.base('favoriteScenes');draft=selected.map(item=>({...item}));rows();}}finally{if(editor===current){current.saving=false;confirm.disabled=!options.metadata.get().canEdit;back.disabled=false;list.inert=false;editorText();}}});
      try{const result=await options.load();if(ticket!==revision||!editor)return;catalog=result;catalogReady=true;load();draft=selected.map(s=>({...s}));rows();confirm.disabled=false;}
      catch(_){if(ticket!==revision||!editor)return;clear(list);const retry=document.createElement('button');retry.type='button';retry.textContent=t('favoriteLoadFailed');retry.addEventListener('click',()=>{close();open();});list.append(retry);}
    }
    const unsubscribeMetadata=options.metadata.subscribe(metadataChanged);metadataChanged(options.metadata.get());
    edit.addEventListener('click',open);
    global.addEventListener('pagehide',()=>{disposed=true;unsubscribeMetadata();scopeRevision++;revision++;for(const timer of timers.values())clearTimeout(timer);close(true);});
    return Object.freeze({ update(value){const next=storageKey(value.spaces);if(next!==scope){scopeRevision++;for(const timer of timers.values())clearTimeout(timer);timers.clear();states.clear();close();scope=next;load();catalog=[];}snapshot=value;catalog=value.scenes || [];catalogReady=value.catalogReady===true && !value.cached;load();render();}, availability(){edit.disabled=Boolean(options.automatic)||!options.canEdit() || !options.metadata.get().canEdit;const empty=grid.querySelector('.favorite-scenes-empty'),state=options.metadata.get();if(empty)empty.disabled=state.error || !state.loaded?!scope || state.loading:edit.disabled;}, language(){renderSignature='';render();if(editor)rows();}, busy(){return [...states.values()].some(s=>s.pending);}, close });
  }
  global.FavoriteScenes=Object.freeze({create,identity,defaults,automaticScenes,limit:LIMIT});
})(window,document);
