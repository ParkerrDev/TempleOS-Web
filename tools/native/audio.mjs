import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve,join} from "node:path";
import {tmpdir} from "node:os";
import {createInterface} from "node:readline";

const directory=mkdtempSync(join(tmpdir(),"hemu-audio-")),evidence=resolve(process.env.HEMU_NATIVE_AUDIO_EVIDENCE||"build/native/evidence/audio");
mkdirSync(evidence,{recursive:true});
const env={...process.env,XDG_RUNTIME_DIR:directory,PIPEWIRE_RUNTIME_DIR:directory,
  XDG_CONFIG_HOME:join(directory,"config"),XDG_STATE_HOME:join(directory,"state"),XDG_CACHE_HOME:join(directory,"cache"),
  PULSE_SERVER:"unix:"+join(directory,"pulse-native"),PULSE_SINK:"hemu-test",PULSE_SOURCE:"hemu-test.monitor",
  QT_QPA_PLATFORM:"offscreen",QT_QUICK_BACKEND:"software",GIO_USE_VFS:"local"},children=[];
const Sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function Child(name,command,args=[],json=false) {
  const proc=spawn(command,args,{env,detached:true,stdio:["pipe","pipe","pipe"]}),events=[],waiters=[],chunks=[];
  let log="";proc.stderr.on("data",bytes=>{log+=bytes;});
  const exited=new Promise(resolve=>proc.once("exit",(code,signal)=>resolve({code,signal})));
  if(json)createInterface({input:proc.stdout}).on("line",line=>{
    let value;try{value=JSON.parse(line);}catch{log+=line+"\n";return;}
    events.push(value);for(const waiter of [...waiters])if(waiter.predicate(value))waiter.done(value);
  });else proc.stdout.on("data",bytes=>chunks.push(bytes));
  const child={name,proc,events,chunks,exited,send:value=>proc.stdin.write(JSON.stringify(value)+"\n"),
    wait(predicate,at=events.length,timeout=30000){
      const found=events.slice(at).find(predicate);if(found)return Promise.resolve(found);
      return new Promise((resolve,reject)=>{
        const waiter={predicate,done:value=>{clearTimeout(timer);waiters.splice(waiters.indexOf(waiter),1);resolve(value);}},
          timer=setTimeout(()=>{waiters.splice(waiters.indexOf(waiter),1);reject(Error(`${name}: event timeout\n${log}\n${JSON.stringify(events.slice(-8))}`));},timeout);
        waiters.push(waiter);
      });
    },save(){writeFileSync(join(evidence,name+".log"),log);if(json)writeFileSync(join(evidence,name+"-events.json"),JSON.stringify(events,null,2)+"\n");}};
  children.push(child);return child;
}
function Run(command,args) {
  const result=spawnSync(command,args,{env,encoding:"utf8",timeout:10000});
  assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout;
}
async function Command(child,value,predicate) {
  const at=child.events.length;child.send(value);
  return child.wait(predicate|| (event=>event.event==="command"&&event.cmd===value.cmd),at);
}
async function Ports() {
  let outputs=[],inputs=[];
  for(let i=0;i<100;i++) {
    outputs=Run("pw-link",["-o"]).trim().split("\n");inputs=Run("pw-link",["-i"]).trim().split("\n");
    const play=outputs.find(name=>name.startsWith("hemu-audio-test:output_")),
      record=inputs.find(name=>name!=="hemu-test:playback_MONO"&&name.endsWith(":input_MONO"));
    if(play&&record) {
      return {outputs,inputs};
    }
    await Sleep(20);
  }
  writeFileSync(join(evidence,"graph.json"),Run("pw-dump",[]));
  writeFileSync(join(evidence,"nodes.log"),Run("pw-cli",["ls","Node"]));
  writeFileSync(join(evidence,"pulse.log"),Run("pactl",["list"]));
  throw Error("Missing isolated audio ports: "+JSON.stringify({outputs,inputs}));
}
function Pcm(child){const bytes=Buffer.concat(child.chunks);return new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length-bytes.length%4));}
const Hash=file=>createHash("sha256").update(readFileSync(file)).digest("hex");
async function Finish(child) {
  if(child.proc.exitCode!==null||child.proc.signalCode!==null)return;
  try{process.kill(-child.proc.pid,"SIGTERM");}catch(error){if(error.code!=="ESRCH")throw error;}
  const timer=setTimeout(()=>{try{process.kill(-child.proc.pid,"SIGKILL");}catch(error){if(error.code!=="ESRCH")throw error;}},5000);
  try{await child.exited;}finally{clearTimeout(timer);}
}

writeFileSync(join(directory,"pipewire.conf"),JSON.stringify({
  "context.properties":{"core.daemon":true,"core.name":"pipewire-0","support.dbus":false,"default.clock.rate":48000,"default.clock.quantum":256},
  "context.spa-libs":{"support.*":"support/libspa-support","audio.convert.*":"audioconvert/libspa-audioconvert"},
  "context.modules":["protocol-native","spa-node-factory","client-node","adapter","metadata","link-factory","access","protocol-pulse"].map(name=>({name:"libpipewire-module-"+name,
    ...name==="access"?{args:{"access.socket":{"pipewire-0":"unrestricted","pipewire-0-manager":"unrestricted"}}}:name==="protocol-pulse"?{args:{"server.address":[env.PULSE_SERVER]}}:{}})),
  "context.objects":[{factory:"spa-node-factory",args:{"factory.name":"support.node.driver","node.name":"Dummy-Driver","priority.driver":20000}},
    {factory:"adapter",args:{"factory.name":"support.null-audio-sink","node.name":"hemu-test","node.description":"HEMU Test","media.class":"Audio/Sink","audio.position":["MONO"],"adapter.auto-port-config":{mode:"dsp",monitor:true,position:"preserve"}}}]
},null,2));
try {
  writeFileSync(join(evidence,"inputs.json"),JSON.stringify({platform:process.platform,arch:process.arch,
    binary:Hash("build/native/audio/audio-test"),runtime:Hash("build/native/Runtime.js"),
    app:Hash("engine/native/App.hpp"),speaker:Hash("engine/native/Speaker.hpp"),test:Hash("tools/native/audio.mjs"),
    pipewire:Run("pipewire",["--version"]).trim(),wireplumber:Run("wireplumber",["--version"]).trim()},null,2)+"\n");
  const server=Child("pipewire","pipewire",["-c",join(directory,"pipewire.conf")]);
  let ready=false;
  for(let i=0;i<100;i++) {
    const result=spawnSync("pactl",["list","short","sinks"],{env,encoding:"utf8"});
    if(result.status===0&&result.stdout.includes("hemu-test")){ready=true;break;}
    assert.equal(server.proc.exitCode,null,"private audio server exited");await Sleep(20);
  }
  assert.ok(ready,"private audio server did not start");
  Child("policy","dbus-run-session",["--","wireplumber","--profile=policy"]);
  const recorder=Child("capture","parec",["--device=hemu-test.monitor","--format=float32le","--rate=48000","--channels=1","--latency-msec=10","--process-time-msec=5"]),
    mixer=Child("mixer",resolve("build/native/audio/audio-test"),["mixer"],true);
  await mixer.wait(event=>event.event==="ready",0);const ports=await Ports();
  for(let i=0;i<250&&Pcm(recorder).length<2048;i++)await Sleep(20);
  assert.ok(Pcm(recorder).length>=2048,"capture clock did not start");
  await Command(mixer,{cmd:"start"});
  const changes=Array.from({length:420},(_,i)=>[i%3===2?0:i%3?1920:960,(BigInt(i)*1000000000n/140n).toString()]);
  let sent=0;
  async function Feed(count) {
    const events=changes.slice(sent,count);sent=count;
    const reply=await Command(mixer,{cmd:"packet",packet:{timed:true,frequency:changes[count-1][0],end:(BigInt(count)*1000000000n/140n).toString(),events}});
    assert.equal(reply.state.error,"");assert.equal(reply.state.overruns,0);
  }
  await Feed(42);const started=performance.now();
  for(let count=56;count<=420;count+=14){await Sleep(Math.max(0,(count-42)/14*100-(performance.now()-started)));await Feed(count);}
  await Sleep(550);
  const pcm=Pcm(recorder),nonzero=pcm.filter(value=>Math.abs(value)>0.001).length;
  const state=await Command(mixer,{cmd:"status"});
  writeFileSync(join(evidence,"probe.f32"),Buffer.from(pcm.buffer));
  writeFileSync(join(evidence,"probe.json"),JSON.stringify({ports,samples:pcm.length,nonzero,state},null,2)+"\n");
  writeFileSync(join(evidence,"links.log"),Run("pw-link",["-l"]));
  writeFileSync(join(evidence,"pulse.log"),Run("pactl",["list"]));
  const first=pcm.findIndex(value=>Math.abs(value)>0.001);assert.ok(first>=0,"Qt sink was silent");
  assert.ok(pcm.length>=first+144000,"recording ended before the complete cadence");
  let phase=0,index=0,hz=0;
  for(let sample=0;sample<144000;sample++) {
    while(index<changes.length&&Number(BigInt(changes[index][1])*48000n/1000000000n)<=sample)hz=changes[index++][0];
    const expected=hz?(phase<0.5?Math.fround(0.04):-Math.fround(0.04)):0;
    assert.equal(pcm[first+sample],expected,`actual output changed at sample ${sample}`);
    phase+=hz/48000;phase-=Math.floor(phase);
  }
  assert.equal(state.state.overruns,0);assert.equal(state.state.underruns,1,"only the deliberate end of the stream may underrun");
  console.log("Actual Qt/PipeWire PCM preserves 420 ordered 140 Hz tones/silent intervals across 144,000 exact samples.");
  await Command(mixer,{cmd:"quit"});assert.deepEqual(await mixer.exited,{code:0,signal:null});
  if(!process.argv.includes("--mixer-only")) {
    const input=process.env.HEMU_NATIVE_FIXTURE||resolve("build/native/TempleOS-audio.hemu"),fixtures={},proof={input:Hash(input),sources:{},phases:[]};
    for(const name of ["Tone","Pulse","Fault"]) {
      const source=resolve(`tools/native/tests/Audio${name}.HC`),path=join(directory,name+".hemu");
      const prepared=spawnSync(resolve("build/native/audio/audio-test"),["prepare",input,path,source],{env,encoding:"utf8",timeout:120000});
      writeFileSync(join(evidence,"prepare-"+name+".log"),prepared.stdout+prepared.stderr);
      assert.equal(prepared.status,0,prepared.stdout+prepared.stderr||prepared.error?.message);
      const result=JSON.parse(prepared.stdout.trim());assert.equal(result.event,"prepared");
      if(proof.timed!==undefined)assert.equal(result.timed,proof.timed);proof.timed=result.timed;
      fixtures[name]=path;proof.sources[name]=Hash(source);
    }
    const client=Child("backend",resolve("build/native/audio/audio-test"),[],true);
    await client.wait(event=>event.event==="ready",0);await Ports();
    const State=predicate=>event=>event.event==="state"&&predicate(event);
    async function Open(path) {
      const busy=await Command(client,{cmd:"open",path},State(state=>state.busy));
      return client.wait(State(state=>state.ready&&!state.busy),client.events.indexOf(busy)+1);
    }
    async function Phase(name,audible) {
      await Sleep(350);const pcm=Pcm(recorder),tail=pcm.slice(-4800),rms=Math.sqrt(tail.reduce((sum,value)=>sum+value*value,0)/tail.length);
      proof.phases.push({name,samples:pcm.length,rms});
      assert.ok(audible?rms>0.02:rms<0.00001,`${name}: unexpected recorded RMS ${rms}`);
    }
    let current=await Open(fixtures.Tone);assert.equal(current.paused,true);await Phase("open paused",false);
    await Command(client,{cmd:"pause"},State(state=>!state.paused));await Phase("resume",true);
    await Command(client,{cmd:"pause"},State(state=>state.paused));await Phase("pause",false);
    const saved=join(directory,"saved.hemu");
    await Command(client,{cmd:"save",path:saved},State(state=>!state.busy&&state.status.startsWith("Saved ")));await Phase("saved paused",false);
    current=await Open(saved);assert.equal(current.paused,true);await Phase("restored paused",false);
    await Command(client,{cmd:"pause"},State(state=>!state.paused));await Phase("restored resume",true);
    const bad=join(directory,"bad.hemu");writeFileSync(bad,"invalid");current=await Open(bad);
    assert.equal(current.path,saved);assert.equal(current.paused,true);await Phase("failed replacement",false);
    current=await Open(fixtures.Fault);assert.equal(current.paused,true);
    await Command(client,{cmd:"pause"},State(state=>!state.paused));await Phase("before fault",true);
    current=await client.wait(State(state=>state.fault));assert.match(current.status,/CPU 0 stopped/);await Phase("fault",false);
    await Command(client,{cmd:"pause"});await Phase("fault cannot resume",false);
    if(proof.timed) {
    current=await Open(fixtures.Pulse);assert.equal(current.paused,true);const before=Pcm(recorder).length;
    await Command(client,{cmd:"pause"},State(state=>!state.paused));await Sleep(5200);
    const pulse=Pcm(recorder).slice(before),runs=[];
    let begin=-1;
    for(let i=0;i<=pulse.length;i++) {
      if(i<pulse.length&&pulse[i]!==0){if(begin<0)begin=i;}
      else if(begin>=0){runs.push([begin,i]);begin=-1;}
    }
    proof.pulse={samples:pulse.length,runs};
    writeFileSync(join(evidence,"backend-pulse.f32"),Buffer.from(pulse.buffer));
    writeFileSync(join(evidence,"backend.json"),JSON.stringify({...proof,states:client.events},null,2)+"\n");
    assert.equal(runs.length,140,"native 140 Hz task must preserve all tone/silent groups");
    for(let i=0;i<runs.length;i++) {
      const width=runs[i][1]-runs[i][0];assert.ok(width>=480&&width<=960,`native sound group ${i}: ${width} samples`);
      if(i){const gap=runs[i][0]-runs[i-1][1];assert.ok(gap>=192&&gap<=576,`native silent group ${i}: ${gap} samples`);}
      for(const [begin,end,periods]of [[runs[i][0],runs[i][0]+Math.floor(width/3),[25,26]],[runs[i][1]-Math.floor(width/3),runs[i][1],[12,13]]]) {
        let previous=-1,edges=0;
        for(let at=begin+1;at<end;at++)if(pulse[at]!==pulse[at-1]) {
          if(previous>=0)assert.ok(periods.includes(at-previous),`native group ${i}: unexpected PIT half-period ${at-previous}`);
          previous=at;edges++;
        }
        assert.ok(edges>=5,`native group ${i}: missing pitch transitions`);
      }
    }
    await Phase("native sequence completed",false);
    }
    await Command(client,{cmd:"quit"});assert.deepEqual(await client.exited,{code:0,signal:null});
    writeFileSync(join(evidence,"backend.json"),JSON.stringify({...proof,states:client.events},null,2)+"\n");
    console.log("Actual native Backend PCM: paused open/save/restore, resume, replacement failure, retained fault and blocked resume passed; "+(proof.timed?"140 native tone/silence groups retain both PIT pitches.":"legacy input remains explicitly untimed."));
  }
} finally {
  for(const child of children.reverse()) {
    await Finish(child);
    child.save();
  }
  rmSync(directory,{recursive:true,force:true});
}
