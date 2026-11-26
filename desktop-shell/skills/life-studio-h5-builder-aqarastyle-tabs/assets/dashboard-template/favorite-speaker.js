(function(global,document){
  'use strict';
  const list=value=>Array.isArray(value)?value:[];
  const number=value=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value))?Number(value):null;
  function inspect(endpoint,deviceId){
    if(endpoint.deviceType!=='Speaker'||!deviceId||!Number.isInteger(Number(endpoint.endpointId))||Number(endpoint.endpointId)<0)return [];
    const points=[];
    for(const fn of list(endpoint.functions))for(const trait of list(fn.traits)){
      const code=trait.traitCode,parameter=trait.parameter || {};
      if(!(fn.functionCode==='MediaPlayback' && ['CurrentPlaybackState','TargetPlaybackState'].includes(code) || fn.functionCode==='Speaker' && code==='Volume' || code==='OnOff'))continue;
      if(!fn.functionCode || parameter.dynamicSchema)continue;
      const entry={id:endpoint.endpointId+':'+fn.functionCode+':'+code,deviceId,endpointId:Number(endpoint.endpointId),functionCode:fn.functionCode,traitCode:code,parameter:JSON.parse(JSON.stringify(parameter)),value:parameter.readable===false?undefined:trait.value};observe(entry,entry.value);points.push(entry);
    }
    return points;
  }
  function points(item){return list(item.speaker);}
  function candidate(item){return item.deviceType==='Speaker' && points(item).length>0;}
  function point(item,code){return points(item).find(p=>p.traitCode===code);}
  function allowed(p,value){
    if(!p || p.parameter.writable!==true)return false;
    const type=String(p.parameter.type || '').toLowerCase();
    if(p.traitCode==='OnOff')return /^(bool|boolean)$/.test(type)&&typeof value==='boolean';
    if(p.traitCode==='Volume'){
      const a=p.parameter,min=number(a.min),max=number(a.max),step=a.step==null?null:number(a.step);
      return /^(integer|float|number)$/.test(type)&&typeof value==='number'&&Number.isFinite(value)&&min!==null&&max!==null&&max>min&&value>=min&&value<=max&&(type!=='integer'||Number.isInteger(value))&&(step===null||step>0&&Math.abs((value-min)/step-Math.round((value-min)/step))<1e-6);
    }
    if(p.traitCode==='TargetPlaybackState'){
      if(!/^(enum|integer|float|number)$/.test(type))return false;
      if(![0,1,6,7].includes(number(value)))return false;
      const options=list(p.parameter.supportedValues);
      if(options.length)return type==='enum'?options.some(o=>typeof o.value===typeof value && o.value===value):typeof value==='number'&&options.some(o=>number(o.value)===value);
      return /^(integer|float|number)$/.test(type)&&typeof value==='number'&&number(p.parameter.min)!==null&&number(p.parameter.max)!==null&&value>=Number(p.parameter.min)&&value<=Number(p.parameter.max);
    }
    return false;
  }
  function playback(item,code){const p=point(item,'TargetPlaybackState');if(!p)return null;const options=list(p.parameter.supportedValues);const entry=options.find(o=>number(o.value)===code);const value=String(p.parameter.type || '').toLowerCase()==='enum'&&entry?entry.value:code;return allowed(p,value)?{control:p,value}:null;}
  function action(item,name){
    if(name==='power'){const p=point(item,'OnOff');return p&&typeof p.value==='boolean'&&allowed(p,!p.value)?{control:p,value:!p.value}:null;}
    return playback(item,({play:0,pause:1,previous:6,next:7})[name]);
  }
  function validate(item,id,value){const p=points(item).find(p=>p.id===id);if(!allowed(p,value))throw new Error('Speaker capability or value is unavailable');return p;}
  function observe(p,value){const code=p.traitCode;if(code==='OnOff'){if(value===true||value===1||value==='1'||value==='true')p.value=true;else if(value===false||value===0||value==='0'||value==='false')p.value=false;else return false;return true;}const n=number(value);if(n===null)return false;if(code==='CurrentPlaybackState'&&![0,1,2,3,4,5].includes(n))return false;if(code==='TargetPlaybackState'&&!list(p.parameter.supportedValues).some(o=>number(o.value)===n)&&!allowed(p,n))return false;if(code==='Volume'&&(number(p.parameter.min)===null||number(p.parameter.max)===null||n<Number(p.parameter.min)||n>Number(p.parameter.max)))return false;p.value=code==='TargetPlaybackState'?value:n;return true;}
  function status(item,t){if(item.missing)return t('fdUnavailable');if(item.onlineKnown===false)return t('unknownValue');if(!item.online)return t('offline');const power=point(item,'OnOff');if(power&&power.value===false)return t('off');const p=point(item,'CurrentPlaybackState'),value=p?number(p.value):null;if(!p){const volume=point(item,'Volume');if(volume){const reading=Object.assign({},volume);return t('speakerVolume')+(observe(reading,volume.value)?' '+reading.value+String(volume.parameter.unit||''):'');}return t('speakerPlaybackControl');}return t(value===0?'speakerPlaying':value===1?'speakerPaused':value===2?'speakerStopped':value===3?'speakerBuffering':'unknownValue');}
  const paths={speaker:'M7 4h10v16H7z M10 8h4 M10 15a2 2 0 1 0 4 0a2 2 0 1 0-4 0',power:'M12 3v9 M6 5a9 9 0 1 0 12 0',previous:'M5 5v14 M19 5l-12 7 12 7z',next:'M19 5v14 M5 5l12 7-12 7z',play:'M8 5l11 7-11 7z',pause:'M8 5v14 M16 5v14',volume:'M4 10h4l4-4v12l-4-4H4z M16 8q5 4 0 8'};
  function svg(name){const el=document.createElementNS('http://www.w3.org/2000/svg','svg');el.setAttribute('viewBox','0 0 24 24');el.setAttribute('aria-hidden','true');const path=document.createElementNS(el.namespaceURI,'path');path.setAttribute('d',paths[name]);el.append(path);return el;}
  function create(options){
    const card=document.createElement('article');card.className='fd-card fd-speaker-card';card.dataset.endpointKey=JSON.stringify([options.item.deviceId,options.item.endpointId]);
    const header=document.createElement('div');header.className='fd-speaker-header';const entry=document.createElement('button');entry.type='button';entry.className='fd-speaker-entry';entry.append(svg('speaker'));const copy=document.createElement('span'),title=document.createElement('strong'),state=document.createElement('span');copy.append(title,state);entry.append(copy);entry.addEventListener('click',()=>options.onPlugin(view.item));header.append(entry);
    const power=document.createElement('button');power.type='button';power.className='fd-speaker-power';power.append(svg('power'));header.append(power);power.addEventListener('click',()=>run('power'));
    const transport=document.createElement('div');transport.className='fd-speaker-transport';const buttons={};
    for(const name of ['previous','play','pause','next']){const b=document.createElement('button');b.type='button';b.dataset.speakerAction=name;b.append(svg(name));b.addEventListener('click',()=>run(name));buttons[name]=b;transport.append(b);}
    const volume=document.createElement('label');volume.className='fd-speaker-volume';const label=document.createElement('span'),range=document.createElement('input'),value=document.createElement('span');range.type='range';range.dataset.speakerAction='volume';volume.append(svg('volume'),label,range,value);
    range.addEventListener('input',()=>{view.dragging=true;range.style.setProperty('--range-progress',((Number(range.value)-Number(range.min))/(Number(range.max)-Number(range.min))*100)+'%');value.textContent=range.value+(view.unit || '');});
    range.addEventListener('change',()=>{view.dragging=false;const p=point(view.item,'Volume');if(p&&number(p.value)===Number(range.value)){patch(view,view.item,view.context);return;}if(p&&allowed(p,Number(range.value)))options.onAction(view.item,{control:p,value:Number(range.value)});else patch(view,view.item,view.context);});
    for(const event of ['pointercancel','touchcancel'])range.addEventListener(event,()=>{view.dragging=false;patch(view,view.item,view.context);});
    range.addEventListener('blur',()=>{if(view.dragging){view.dragging=false;patch(view,view.item,view.context);}});
    const hint=document.createElement('span');hint.className='fd-speaker-hint';card.append(header,transport,volume,hint);
    const view={speaker:true,card,entry,title,state,power,transport,buttons,volume,label,range,value,hint,item:options.item,context:null,dragging:false,t:options.translate};
    function run(name){const next=action(view.item,name);if(next)options.onAction(view.item,next);}
    return view;
  }
  function patch(view,item,context){
    view.item=item;view.context=context;const t=view.t,blocked=item.missing||!item.online||item.onlineKnown===false||item.fresh===false||context.busy||!context.canWrite;
    view.card.classList.toggle('is-offline',item.onlineKnown!==false&&!item.online);view.card.setAttribute('aria-busy',String(Boolean(context.busy)));view.title.textContent=item.name||t('unnamedDevice');view.title.title=view.title.textContent;view.state.textContent=(item.spaceId?item.spaceName||t('fdUnknownRoom'):t('unassigned'))+'｜'+(context.busy?t('speakerUpdating'):status(item,t))+(item.fresh===false?' · '+t('fdStale'):'');view.entry.setAttribute('aria-label',view.title.textContent+', '+view.state.textContent+', '+t('fdOpenPlugin'));
    const p=point(item,'OnOff');view.power.hidden=!action(item,'power');view.power.disabled=blocked;view.power.classList.toggle('is-on',Boolean(p&&p.value===true));view.power.setAttribute('aria-label',global.LifeI18n.functionText(p&&p.value===true?'device.off':'device.on',{form:'full'}));
    const current=point(item,'CurrentPlaybackState'),playing=current&&number(current.value)===0,known=current&&[0,1,2].includes(number(current.value));
    for(const name of Object.keys(view.buttons)){const b=view.buttons[name];b.hidden=!action(item,name)||(known&&(name==='play'&&playing||name==='pause'&&!playing));b.disabled=blocked||Boolean(p&&p.value===false);b.setAttribute('aria-label',global.LifeI18n.functionText('speaker.'+name,{form:'full'}));}
    view.transport.hidden=Object.values(view.buttons).every(b=>b.hidden);const vol=point(item,'Volume'),raw=vol&&number(vol.value),writable=vol&&raw!==null&&allowed(vol,raw);view.volume.hidden=!writable;view.card.classList.toggle('is-compact',view.transport.hidden&&!writable);view.card.dataset.speakerLayout=view.transport.hidden?(writable?'volume':'readonly'):(writable?'full':'transport');view.range.disabled=blocked||Boolean(p&&p.value===false);view.label.textContent=t('speakerVolume');
    if(writable&&!view.dragging){view.range.min=String(vol.parameter.min);view.range.max=String(vol.parameter.max);view.range.step=String(vol.parameter.step || (String(vol.parameter.type).toLowerCase()==='integer'?1:'any'));view.range.value=String(raw);view.unit=String(vol.parameter.unit||'');view.value.textContent=raw+view.unit;view.range.style.setProperty('--range-progress',((raw-Number(vol.parameter.min))/(Number(vol.parameter.max)-Number(vol.parameter.min))*100)+'%');}
    view.range.setAttribute('aria-label',global.LifeI18n.functionText('speaker.volume',{form:'full'}));view.hint.textContent=item.missing?t('fdUnavailable'):item.fresh===false?t('fdStale'):view.card.classList.contains('is-compact')?t('fdViewDetails'):'';view.hint.hidden=!view.hint.textContent;
  }
  global.FavoriteSpeaker=Object.freeze({inspect,candidate,action,validate,observe,status,create,patch});
})(window,document);
