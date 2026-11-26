#!/usr/bin/env node
import { resolve } from 'node:path';
import { refreshPreview,validateWorkspace } from './preview-package.mjs';
if(!process.argv[2])throw new Error('Usage: refresh_preview.mjs <workspace>');
const root=resolve(process.argv[2]);refreshPreview(root);validateWorkspace(root);
console.log('PREVIEW REFRESHED: derived entry, fixtures and artifact hashes');
