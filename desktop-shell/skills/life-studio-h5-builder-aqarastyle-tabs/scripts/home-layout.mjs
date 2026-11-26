// Generation-time layout only. This module is not shipped in the App runtime.
export const DEFAULT_HOME_MODULE_ORDER = Object.freeze(['overview','aiAssistant','favoriteScenes','devices','spaceControl']);
export function resolveHomeModuleOrder(input) {
  if(input===undefined)return [...DEFAULT_HOME_MODULE_ORDER];
  const requested=typeof input==='string'?input.split(',').map(id=>id.trim()):input;
  if(!Array.isArray(requested)||!requested.length||requested.some(id=>!DEFAULT_HOME_MODULE_ORDER.includes(id))||new Set(requested).size!==requested.length)throw new Error('Home module order must contain unique IDs: '+DEFAULT_HOME_MODULE_ORDER.join(','));
  return requested.concat(DEFAULT_HOME_MODULE_ORDER.filter(id=>!requested.includes(id)));
}
const pattern=()=>/<!-- home-module:(\w+):start -->[\s\S]*?<!-- home-module:\1:end -->/g;
function blocks(html){const result=[...html.matchAll(pattern())];if(result.length!==5||new Set(result.map(m=>m[1])).size!==5||result.some(m=>!DEFAULT_HOME_MODULE_ORDER.includes(m[1])))throw new Error('Home module boundaries are missing or duplicated; use the current template');return result;}
export function reorderHomeModules(html,input){const order=resolveHomeModuleOrder(input),byId=new Map(blocks(html).map(m=>[m[1],m[0]]));let slot=0;return html.replace(pattern(),()=>byId.get(order[slot++])).replace(/(<section id="home-panel")(?: data-home-leading-module="[^"]*")?/, '$1 data-home-leading-module="'+order[0]+'"');}
export function validateHomeModuleOrder(html,input){
  const order=resolveHomeModuleOrder(input);
  if(input!==undefined&&(!Array.isArray(input)||input.length!==5))throw new Error('config.homeModuleOrder must contain all five module IDs');
  const matches=[...html.matchAll(pattern())];
  if(matches.length){if(!html.includes('data-home-leading-module="'+order[0]+'"'))throw new Error('Home leading module differs from config');const actual=blocks(html).map(m=>m[1]);if(actual.join(',')!==order.join(','))throw new Error('Home HTML order differs from config.homeModuleOrder');
    const sections={overview:['dashboard-content'],aiAssistant:['ai-assistant-section'],favoriteScenes:['scene-section'],devices:['device-section','favorite-devices-section'],spaceControl:['space-control-section']};
    for(const match of matches)for(const id of sections[match[1]])if(!match[0].includes('id="'+id+'"'))throw new Error('Home module boundary has wrong contents: '+match[1]);
  }else if(input!==undefined)throw new Error('Configured Home module order requires generated module boundaries');
  // Legacy unconfigured packages retain their existing default structure.
  return order;
}
