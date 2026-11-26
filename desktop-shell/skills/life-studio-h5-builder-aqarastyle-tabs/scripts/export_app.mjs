#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateWorkspace } from './preview-package.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: export_app.mjs <workspace> <new-output-directory>');
const root=resolve(input),target=resolve(output);
if(existsSync(target))throw new Error('Export destination already exists');
const manifest=validateWorkspace(root);
const result=spawnSync(process.execPath,[fileURLToPath(new URL('./validate_h5.mjs',import.meta.url)),join(root,'runtime')],{stdio:'inherit'});
if(result.status!==0)throw new Error('Runtime validation failed');
mkdirSync(target,{recursive:true});
for(const item of manifest.app.files){const destination=join(target,item.path);mkdirSync(dirname(destination),{recursive:true});cpSync(join(root,'runtime',item.path),destination);}
console.log('APP EXPORT PASS: '+target+' (validated production inventory; no preview/server/QA assets)');
