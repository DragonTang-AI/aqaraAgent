#!/usr/bin/env node
// QA resources stay in a caller-selected directory outside all generated packages.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync,spawn} from 'node:child_process';
const args=process.argv.slice(2), option=name=>args[args.indexOf(name)+1];
const qa=args.includes('--qa-output')?resolve(option('--qa-output')):mkdtempSync(join(tmpdir(),'aqara-theme-skins-'));
const scripts=dirname(fileURLToPath(import.meta.url));
assert.ok(!qa.startsWith(resolve(scripts,'..')+'/'),'QA must stay outside the skill');
mkdirSync(qa,{recursive:true});
const browserOptions=['--playwright-module','--browser'].flatMap(name=>args.includes(name)?[name,resolve(option(name))]:[]);
function run(name,parameters,expectSuccess=true) {
 const result=spawnSync(process.execPath,[join(scripts,name+'.mjs'),...parameters],{encoding:'utf8'});
 assert.equal(result.status===0,expectSuccess,result.stdout+result.stderr);return result;
}
const tokens={light:{'--canvas':'#f5f4f0','--aqara-card-primary':'#fff','--aqara-card-inactive':'#e9e6df','--aqara-card-offline':'#e9e6df','--aqara-action':'#79502b','--aqara-action-on':'#79502b','--aqara-slider-fill':'#79502b'},dark:{'--canvas':'#191714','--aqara-card-primary':'#38332d','--aqara-card-inactive':'#25211d','--aqara-card-offline':'#25211d','--aqara-action':'#e3ba89','--aqara-action-on':'#79502b','--aqara-slider-fill':'#e3ba89'}};
const tokenFile=join(qa,'paint-tokens.json');writeFileSync(tokenFile,JSON.stringify(tokens));
for(const [i,bad] of [{light:tokens.light},{light:{width:'400px'},dark:tokens.dark},{light:{'--canvas':'#fff;display:none'},dark:tokens.dark}].entries()) {
 const file=join(qa,'invalid-'+i+'.json'), output=join(qa,'rejected-'+i);writeFileSync(file,JSON.stringify(bad));
 run('generate_h5',['--output',output,'--style','custom','--theme-tokens',file],false);
 assert.equal(existsSync(output),false,'invalid skin must be rejected before writing a package');
}
const jobs=[];
for(const style of ['aqara','apple','ha','custom']) {
 const root=join(qa,'packages',style);
 run('generate_h5',['--output',root,'--style',style,'--tabs','home,devices,automation','--title','我的家','--with-preview',...(style==='custom'?['--theme-tokens',tokenFile]:[])]);
 for(const gate of ['validate_h5','validate_aqara_style','smoke_test_h5','smoke_test_tabs','smoke_test_ai_assistant'])run(gate,[join(root,'runtime')]);
 run('validate_preview',[root]);
 const css=join(root,'runtime/styles.css'), original=readFileSync(css,'utf8');
 writeFileSync(css,original+'\n:root[data-style="'+style+'"][data-theme="light"]{width:500px;}\n');
 try {run('validate_aqara_style',[join(root,'runtime')],false);}finally{writeFileSync(css,original);}
 for(const theme of ['light','dark'])jobs.push({style,theme,root,platform:style==='ha'||style==='custom'?'android':'ios'});
}
const reports=[];
async function profile(job) {
 const screenshot=join(qa,job.style+'-'+job.theme+'.png');
 const output=await new Promise((accept,reject)=>{
  const child=spawn(process.execPath,[join(scripts,'profile_h5.mjs'),join(job.root,'runtime'),'--platform',job.platform,'--theme',job.theme,'--screenshot',screenshot,...browserOptions]);let stdout='',stderr='';
  child.stdout.on('data',value=>stdout+=value);child.stderr.on('data',value=>stderr+=value);child.on('error',reject);
  child.on('close',code=>code===0?accept(stdout):reject(new Error(job.style+'/'+job.theme+': '+stderr+stdout)));
 });
 const report=JSON.parse(output);writeFileSync(join(qa,job.style+'-'+job.theme+'.json'),output);
 reports.push({...job,report});console.log('THEME PASS '+job.style+' '+job.theme+' '+job.platform);
}
// Two independent browser fixtures at a time avoid oversubscribing the machine.
for(let i=0;i<jobs.length;i+=2)await Promise.all(jobs.slice(i,i+2).map(profile));
const geometry=report=>({gridColumns:report.visualContract.gridColumns,gridGap:report.visualContract.gridGap,cards:report.visualContract.cards,icon:report.visualContract.icon});
const expected=geometry(reports[0].report);
for(const {report} of reports) {
 assert.deepEqual(geometry(report),expected,'theme paint changes must preserve identical S/M/L/XL geometry');
 assert.deepEqual(report.action.routes,['/open/api/v1/devices/trait/execute','/open/api/v1/devices/trait/read']);
}
console.log('THEME MATRIX PASS: 4 skins × 2 modes, identical geometry/actions, raw capability controls, safe custom colors, preview isolation and rejected layout overrides; QA '+qa);
