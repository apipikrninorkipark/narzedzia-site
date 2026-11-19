// Produce a single file for the Supabase Dashboard editor (no local imports).
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=path.join(root,'supabase/functions/workspace-api');
const api=fs.readFileSync(path.join(source,'index.ts'),'utf8');
const validator=fs.readFileSync(path.join(source,'granada.ts'),'utf8').replace(/^export /gm,'');
const output=process.argv[2];
if(!output)throw new Error('Usage: node scripts/build-workspace-api.cjs /absolute/output.ts');
fs.writeFileSync(output,api.replace("import { validGranada } from './granada.ts';",validator));
console.log('Prepared single-file Edge Function: '+output);
