#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {validatePresentation} from './role-profiles.mjs';
import {resolveHomeModuleOrder,reorderHomeModules,validateHomeModuleOrder} from './home-layout.mjs';
const [directory,flag,value,...extra]=process.argv.slice(2);
if(!directory||flag!=='--order'||value===undefined||extra.length)throw new Error('Usage: configure_home_layout.mjs <runtime-directory> --order <comma-separated-module-IDs>');
const root=resolve(directory),configPath=join(root,'config.js'),htmlPath=join(root,'index.html');
const source=readFileSync(configPath,'utf8'),match=source.match(/Object\.freeze\(([\s\S]*)\);/);
if(!match)throw new Error('Expected generated JSON config.js');
const config=JSON.parse(match[1]);config.homeModuleOrder=resolveHomeModuleOrder(value);
const html=reorderHomeModules(readFileSync(htmlPath,'utf8'),config.homeModuleOrder);validateHomeModuleOrder(html,config.homeModuleOrder);validatePresentation(config,html);
writeFileSync(configPath,source.replace(match[1],JSON.stringify(config,null,2)));writeFileSync(htmlPath,html);
console.log('HOME LAYOUT CONFIGURED: '+config.homeModuleOrder.join(' → '));
