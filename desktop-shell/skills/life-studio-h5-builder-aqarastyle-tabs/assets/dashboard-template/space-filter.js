(function(global,document){
  'use strict';
  function build(tree){
    const nodes=new Map(),parents=new Map(),paths=new Map(),roots=[],order=[];
    function visit(raw,parent,path,depth){if(!raw || depth>64)return;const id=String(raw.spaceId==null?'':raw.spaceId).trim();if(!id || nodes.has(id))return;const node={id,name:String(raw.name || '').trim() || id,children:[]};nodes.set(id,node);order.push(id);if(parent)parents.set(id,parent);else roots.push(id);paths.set(id,path.concat(node.name).join(' / '));for(const child of Array.isArray(raw.children)?raw.children:[]){const next=visit(child,id,path.concat(node.name),depth+1);if(next)node.children.push(next);}return id;}
    for(const raw of Array.isArray(tree)?tree:[])visit(raw,'',[],0);
    return {nodes,parents,paths,roots,order};
  }
  function descendants(index,id){const result=[],seen=new Set(),queue=[id];while(queue.length){const next=queue.pop();if(seen.has(next))continue;seen.add(next);result.push(next);const node=index.nodes.get(next);if(node)for(let i=node.children.length-1;i>=0;i--)queue.push(node.children[i]);}return result;}
  function toggle(ids,id,index){
    if(!index.nodes.has(id))return ids.slice();const set=new Set(ids),branch=descendants(index,id);
    if(set.has(id)){for(const next of branch)set.delete(next);let parent=index.parents.get(id);while(parent){set.delete(parent);parent=index.parents.get(parent);}return ids.filter(next=>set.has(next));}
    const next=ids.slice();for(const child of branch)if(!set.has(child)){set.add(child);next.push(child);}let parent=index.parents.get(id);while(parent){const node=index.nodes.get(parent);if(!node.children.length || !node.children.every(child=>set.has(child)))break;if(!set.has(parent)){set.add(parent);next.push(parent);}parent=index.parents.get(parent);}return next;
  }
  function compact(ids,index){const set=new Set(ids);return ids.filter(id=>!set.has(index.parents.get(id)));}
  function reconcile(ids,index){const result=new Set();for(const id of compact(ids,index))for(const child of descendants(index,id))result.add(child);return [...result];}
  function stats(ids,index){const selected=new Set(ids),counts=new Map();for(let i=index.order.length-1;i>=0;i--){const id=index.order[i],node=index.nodes.get(id);let count=selected.has(id)?1:0;for(const child of node.children)count+=counts.get(child)||0;counts.set(id,count);}return id=>selected.has(id)?'true':counts.get(id)>0?'mixed':'false';}
  const words={
    'zh-CN':{all:'全部空间',title:'选择空间',room:'选择房间',search:'搜索空间',close:'关闭',reset:'重置',apply:'确定',selected:'已选 {n} 个空间',none:'未限制空间',empty:'没有匹配的空间',more:'显示更多',expand:'展开',collapse:'收起',missing:'空间已不可用',retry:'空间读取失败，点击重试'},
    'zh-TW':{all:'全部空間',title:'選擇空間',room:'選擇房間',search:'搜尋空間',close:'關閉',reset:'重置',apply:'確定',selected:'已選 {n} 個空間',none:'未限制空間',empty:'沒有符合的空間',more:'顯示更多',expand:'展開',collapse:'收起',missing:'空間已不可用',retry:'空間讀取失敗，點擊重試'},
    en:{all:'All spaces',title:'Select spaces',room:'Choose rooms',search:'Search spaces',close:'Close',reset:'Reset',apply:'Apply',selected:'{n} spaces selected',none:'All spaces included',empty:'No matching spaces',more:'Show more',expand:'Expand',collapse:'Collapse',missing:'Unavailable space',retry:'Could not load spaces. Tap to retry.'}
  };
  function text(key,n){const locale=global.LifeI18n?global.LifeI18n.getLocale():'zh-CN';return (words[locale] || words.en)[key].replace('{n}',String(n));}
  function label(ids,index){const top=compact(ids,index);return !top.length?text('all'):top.length===1?(index.nodes.get(top[0]) || {name:text('missing')}).name:text('selected',top.length);}
  function open(options){
    const index=options.index;let draft=options.ids.slice(),expanded=new Set(index.roots),query='',composing=false,timer=null,limit=200,closed=false;
    for(const id of draft){let parent=index.parents.get(id);while(parent){expanded.add(parent);parent=index.parents.get(parent);}}
    const el=(tag,cls,value)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(value!==undefined)node.textContent=value;return node;};
    const btn=(name,fn,cls)=>{const node=el('button',cls,name);node.type='button';node.addEventListener('click',fn);return node;};
    const layer=el('div','directory-filter-layer space-filter-layer'),backdrop=el('div','directory-filter-backdrop'),panel=el('section','directory-filter-panel space-filter-panel');
    panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',text('title'));panel.tabIndex=-1;
    if(options.role)panel.dataset.role=options.role;
    const header=el('header','space-filter-heading'),title=el('h2','',text(options.role==='child'?'room':'title')),dismiss=btn('×',()=>close(),'space-filter-close');dismiss.setAttribute('aria-label',text('close'));header.append(title,dismiss);
    const input=el('input','space-filter-search');input.type='search';input.placeholder=text('search');input.setAttribute('aria-label',text('search'));input.autocomplete='off';
    const list=el('div','space-filter-list'),summary=el('div','space-filter-selected'),actions=el('footer','directory-filter-actions');
    const reset=btn(text('reset'),()=>{draft=[];render();},'directory-filter-reset'),apply=btn(text('apply'),()=>{const next=draft.slice();close();options.apply(next);},'directory-filter-apply');actions.append(reset,apply);panel.append(header,input,list,summary,actions);layer.append(backdrop,panel);
    const background=['app','topbar','studio-tabbar'].map(id=>document.getElementById(id)).filter(Boolean).map(node=>[node,node.inert]);for(const pair of background)pair[0].inert=true;
    const position=global.scrollY,style=document.body.style,saved={position:style.position,top:style.top,width:style.width,overflow:style.overflow};style.position='fixed';style.top=-position+'px';style.width='100%';style.overflow='hidden';
    function close(restore=true){if(closed)return;closed=true;clearTimeout(timer);layer.remove();document.removeEventListener('keydown',key);if(global.visualViewport)global.visualViewport.removeEventListener('resize',size);for(const pair of background)pair[0].inert=pair[1];Object.keys(saved).forEach(name=>{style[name]=saved[name];});if(restore){global.scrollTo(0,position);if(options.trigger.isConnected)options.trigger.focus({preventScroll:true});}options.closed();}
    function key(event){if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}if(event.key!=='Tab')return;const nodes=[...panel.querySelectorAll('button,input')].filter(node=>!node.disabled && node.getClientRects().length);const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey && (document.activeElement===first || document.activeElement===panel)){event.preventDefault();last.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}}
    function size(){const height=global.visualViewport?global.visualViewport.height:global.innerHeight;layer.style.height=height+'px';layer.style.top=(global.visualViewport?global.visualViewport.offsetTop:0)+'px';layer.style.bottom='auto';panel.style.maxHeight=Math.max(160,height-32)+'px';}
    function render(){
      const focus=document.activeElement,focusId=focus && focus.dataset.spaceId,focusKind=focus && focus.dataset.action,scroll=list.scrollTop;while(list.firstChild)list.firstChild.remove();while(summary.firstChild)summary.firstChild.remove();const mark=stats(draft,index),ids=[];
      function walk(id,depth){const node=index.nodes.get(id);ids.push({id,depth});if(expanded.has(id))for(const child of node.children)walk(child,depth+1);}
      if(query){for(const id of index.order)if(index.paths.get(id).toLocaleLowerCase().includes(query))ids.push({id,depth:0});}else for(const id of index.roots)walk(id,0);
      // Missing selected IDs remain explicit removable choices, never become an unfiltered query.
      for(const id of compact(draft,index))if(!index.nodes.has(id))ids.push({id,depth:0});
      for(const row of ids.slice(0,limit)){
        const node=index.nodes.get(row.id),line=el('div','space-filter-row');line.style.paddingLeft=Math.min(row.depth,6)*16+'px';
        const choose=btn('',()=>{draft=node?toggle(draft,row.id,index):draft.filter(id=>id!==row.id);render();},'space-filter-choice');choose.dataset.spaceId=row.id;choose.dataset.action='select';choose.setAttribute('role','checkbox');choose.setAttribute('aria-checked',node?mark(row.id):'true');choose.setAttribute('aria-label',index.paths.get(row.id)||text('missing'));
        const check=el('span','space-filter-mark');check.setAttribute('aria-hidden','true');check.textContent=choose.getAttribute('aria-checked')==='mixed'?'−':choose.getAttribute('aria-checked')==='true'?'✓':'';
        choose.append(check,el('span','space-filter-name',node?(query?index.paths.get(row.id):node.name):text('missing')));line.append(choose);
        if(node && node.children.length && !query){const branch=btn(expanded.has(row.id)?'⌃':'⌄',()=>{if(expanded.has(row.id))expanded.delete(row.id);else expanded.add(row.id);render();},'space-filter-expand');branch.dataset.spaceId=row.id;branch.dataset.action='expand';branch.setAttribute('aria-expanded',String(expanded.has(row.id)));branch.setAttribute('aria-label',text(expanded.has(row.id)?'collapse':'expand')+' '+node.name);line.append(branch);}list.append(line);
      }
      if(!ids.length)list.append(el('p','directory-message',text('empty')));if(ids.length>limit)list.append(btn(text('more'),()=>{limit+=200;render();},'directory-action'));
      const top=compact(draft,index);summary.append(el('span','space-filter-summary',top.length?text('selected',top.length):text('none')));
      for(const id of top.slice(0,8)){const chip=btn((index.nodes.get(id)||{name:text('missing')}).name+' ×',()=>{draft=index.nodes.has(id)?toggle(draft,id,index):draft.filter(value=>value!==id);render();},'space-filter-selected-chip');chip.title=index.paths.get(id)||text('missing');chip.setAttribute('aria-label',text('reset')+' '+chip.title);summary.append(chip);}
      reset.disabled=!draft.length;list.scrollTop=scroll;if(focusId){const target=[...list.querySelectorAll('button')].find(node=>node.dataset.spaceId===focusId && node.dataset.action===focusKind);if(target)target.focus({preventScroll:true});}
    }
    input.addEventListener('input',()=>{clearTimeout(timer);if(composing)return;timer=setTimeout(()=>{query=input.value.trim().toLocaleLowerCase();limit=200;list.scrollTop=0;render();},150);});input.addEventListener('compositionstart',()=>{composing=true;clearTimeout(timer);});input.addEventListener('compositionend',()=>{composing=false;input.dispatchEvent(new Event('input'));});
    backdrop.addEventListener('click',()=>close());document.addEventListener('keydown',key);if(global.visualViewport)global.visualViewport.addEventListener('resize',size);document.body.append(layer);size();render();panel.focus({preventScroll:true});return {close};
  }
  global.StudioSpaceFilter=Object.freeze({build,toggle,compact,reconcile,stats,label,text,open});
})(window,document);
