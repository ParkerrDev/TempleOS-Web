import {spawnSync} from 'node:child_process';
const root=new URL("../../",import.meta.url);
const tests=[['tools/hemu/snapshot-format.test.mjs',{}],['tools/hemu/worker-snapshot.test.mjs',{HEMU_BUS_PROTOCOL:'1'}],
 ['tools/hemu/worker-patch-pause.test.mjs',{}],['tools/hemu/worker-fault.test.mjs',{}],
 ['tools/hemu/worker-legacy-fault.test.mjs',{}],['tools/hemu/worker-legacy-fault.test.mjs',{HEMU_BUS_PROTOCOL:'1'}],
 ['tools/browser/snapshot.mjs',{}],['tools/browser/snapshot.mjs',{HEMU_LEGACY:'1'}],['tools/browser/fault.mjs',{}]];
for(const [path,env] of tests){console.log('CHECK',path,JSON.stringify(env));const run=spawnSync(process.execPath,[path],{cwd:root,env:{...process.env,...env},stdio:'inherit'});if(run.error)throw run.error;if(run.signal)throw Error(path+' stopped by '+run.signal);if(run.status)process.exit(run.status);}
console.log('PASS all nine shared Snapshot/DocClip web worker/browser checks');
