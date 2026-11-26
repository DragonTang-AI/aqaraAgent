#!/usr/bin/env node
import { resolve,join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateWorkspace } from './preview-package.mjs';
const root=resolve(process.argv[2]||'.');validateWorkspace(root);
for(const name of ['validate_h5.mjs','validate_aqara_style.mjs']){
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./'+name,import.meta.url)),join(root,'runtime')],{stdio:'inherit'});if(result.status!==0)throw new Error(name+' failed');
}
console.log('PREVIEW VALID: API fixture identities, shared page entry, runtime hashes and export isolation');
