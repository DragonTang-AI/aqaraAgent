// Generation-only vector art. No network, DOM, device state or animation loop.
const svgURL=(width,height,body)=>`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`)}")`;
function artwork(role,dark){
 const ink=dark?'#d6edff':'#285d80',line=dark?'#83b8e7':'#6399c7',gold=dark?'#e6bd7b':'#f4c96e',pink=dark?'#ce9eb8':'#edb3ca',mint=dark?'#78b4ac':'#9dd8c7';
 const star=(x,y,s,c)=>`<path d="M${x} ${y-s}Q${x+s/4} ${y-s/4} ${x+s} ${y}Q${x+s/4} ${y+s/4} ${x} ${y+s}Q${x-s/4} ${y+s/4} ${x-s} ${y}Q${x-s/4} ${y-s/4} ${x} ${y-s}" fill="${c}"/>`;
 if(role==='male')return `<g fill="none" stroke="${line}" stroke-width="1.5"><ellipse cx="80" cy="45" rx="64" ry="21" transform="rotate(-22 80 45)"/><ellipse cx="80" cy="45" rx="44" ry="31" transform="rotate(24 80 45)"/><path d="M58 47l22-19 22 19v24H58zM74 71V53h12v18" stroke="${ink}" stroke-width="2"/><path d="M16 64h20m-10-10v20m101-58h17m-8-8v16"/></g><circle cx="22" cy="64" r="4" fill="${gold}"/><circle cx="136" cy="27" r="5" fill="${line}"/>${star(119,66,5,gold)}`;
 if(role==='female')return `<g stroke="${mint}" stroke-width="3" fill="none" stroke-linecap="round"><path d="M35 80Q63 40 48 14M117 81Q97 50 124 16"/></g><g fill="${mint}"><ellipse cx="43" cy="49" rx="15" ry="7" transform="rotate(35 43 49)"/><ellipse cx="57" cy="30" rx="14" ry="7" transform="rotate(-40 57 30)"/><ellipse cx="112" cy="54" rx="14" ry="7" transform="rotate(-35 112 54)"/><ellipse cx="119" cy="30" rx="14" ry="7" transform="rotate(30 119 30)"/></g><g fill="${pink}"><circle cx="80" cy="27" r="12"/><circle cx="94" cy="39" r="12"/><circle cx="88" cy="56" r="12"/><circle cx="70" cy="56" r="12"/><circle cx="65" cy="39" r="12"/></g><circle cx="80" cy="42" r="10" fill="${gold}"/>${star(138,59,6,gold)}`;
 if(role==='senior')return `<circle cx="114" cy="26" r="16" fill="${gold}"/><path d="M13 75l36-43 23 27 17-19 57 35" fill="${mint}"/><path d="M37 75l41-47 41 47" fill="${line}" opacity=".65"/><path d="M21 81h121M24 20q6-7 12 0m4 0q6-7 12 0" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>`;
 const sky=dark?'#444864':'#d9e9f6',window=dark?'#252b45':'#f5eddc',wood=dark?'#b7a0c6':'#bc9b82';
 return `<rect x="4" y="8" width="152" height="78" rx="18" fill="${dark?'#554a68':'#f0e4f1'}"/><rect x="98" y="16" width="45" height="46" rx="16" fill="${sky}" stroke="${window}" stroke-width="4"/><path d="M120 18v42M100 39h40" stroke="${window}" stroke-width="3"/>${dark?`<path d="M133 22a9 9 0 1 0 0 17 11 11 0 0 1 0-17" fill="${gold}"/>`:`<circle cx="132" cy="27" r="7" fill="${gold}"/>`}<path d="M16 67h84v6H16zM23 73v11M91 73v11" fill="${wood}" stroke="${wood}" stroke-width="3"/><path d="M32 44h21l7 17H25z" fill="${gold}"/><path d="M42 60v7" stroke="${wood}" stroke-width="4"/><path d="M62 58l13 3 13-3v9l-13 3-13-3z" fill="${mint}"/><path d="M75 61v9" stroke="${wood}"/><rect x="108" y="70" width="34" height="14" rx="7" fill="${pink}"/>${star(15,22,5,gold)}`;

}
export function roleIllustrationsCSS(role){
 if(role==='none')return '';
 const base=`:root[data-role-skin="${role}"]`;
 const vars=['light','dark'].map(mode=>{
  const art=artwork(role,mode==='dark');
  const scene=svgURL(400,640,`<defs><g id="theme-motif">${art}</g></defs><use xlink:href="#theme-motif" transform="translate(222 12) scale(1.15)" opacity="${role==='senior'?'.04':'.08'}"/>`);
  const circuit=role==='male'?svgURL(120,80,`<g fill="none" stroke="${mode==='dark'?'#83b8e7':'#387ba8'}" stroke-width="1.25" opacity="${mode==='dark'?'.24':'.19'}"><path d="M120 12H101L87 26H77M120 42H107L95 54H82M120 70H103L94 78H75"/><circle cx="76" cy="26" r="2.5"/><circle cx="81" cy="54" r="2.5"/><circle cx="74" cy="78" r="2.5"/></g>`):'none';
  return `${base}[data-theme="${mode}"]{--role-scene-art:${scene};--role-motif-art:${svgURL(160,90,art)};--role-overview-tile-art:${circuit};--role-art-opacity:${role==='senior'?'.17':role==='child'?'.47':role==='female'&&mode==='dark'?'.33':mode==='dark'?'.25':'.29'}}`;
 }).join('\n');
 return `\n/* Role SVG illustrations: decorative image paints, theme-reactive and inert. */\n${vars}
${base} body{background-image:var(--role-scene-art),radial-gradient(ellipse at 100% 0%,var(--role-aura),transparent 65%);background-size:400px 640px,auto;background-position:center calc(var(--safe-top) + 160px),center top;background-repeat:no-repeat,no-repeat}
${base} .hero-card::before{content:"";position:absolute;top:0;right:0;bottom:0;left:0;pointer-events:none;background-image:var(--role-motif-art);background-repeat:no-repeat;background-size:190px 107px;background-position:right -18px top -9px;opacity:var(--role-art-opacity)}
@media(max-width:350px){${base} .hero-card::before{background-size:142px 80px;background-position:right -20px top -10px}}
${base} .space-summary-card{position:relative}
${base} .space-summary-top,${base} .space-summary-copy,${base} .space-stat-chips{position:relative;z-index:1}
@media(max-width:350px){${base} .space-summary-card::after{display:none}}
`;
}
