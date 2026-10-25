const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),manifest=require('../manifest.json');
if(manifest.manifest_version!==3)throw Error('Manifest must be V3');
if(JSON.stringify(manifest.permissions)!=='["storage"]')throw Error('Unexpected permission');
const paths=[manifest.background.service_worker,manifest.action.default_popup,manifest.options_page,...Object.values(manifest.icons),...manifest.content_scripts.flatMap(s=>[...s.js,...s.css])];
for(const p of paths)if(!fs.existsSync(path.join(root,p)))throw Error('Missing '+p);
for(const p of fs.readdirSync(path.join(root,'src')).filter(p=>p.endsWith('.js')))cp.execFileSync(process.execPath,['--check',path.join(root,'src',p)]);
console.log('Manifest, packaged assets and JavaScript syntax: PASS');
