import {makeDisk} from "./QCow2.js";

export async function DiskStoreOpen(Notice)
{//One writer per browser profile; disk sectors commit together after each guest turn.
  let db,write=false,dirty=new Map(),queued=false,active=0,pending=Promise.resolve(),failed=null;
  function Status(state,msg) {Notice({cmd:"diskSave",state,msg});}
  try {
    if (!globalThis.indexedDB || !globalThis.navigator?.locks)
      throw Error("Browser storage is unavailable.");
    await new Promise(function (Resolve,Reject) {
      navigator.locks.request("templeos-C",{ifAvailable:true},function (lock) {
        write=!!lock;Resolve();
        if (lock) return new Promise(function () {});
      }).catch(Reject);
    });
    db=await new Promise(function (Resolve,Reject) {
      let req=indexedDB.open("templeos-C",1);
      req.onupgradeneeded=function () {req.result.createObjectStore("disk");};
      req.onsuccess=function () {Resolve(req.result);};
      req.onerror=function () {Reject(req.error);};
      req.onblocked=function () {Reject(Error("Close other TempleOS tabs and retry."));};
    });
    db.onversionchange=function () {db.close();Status("error","C: autosave stopped. Reload this tab.");};
  } catch (e) {
    Status("error","C: is not being saved: "+e.message+" Export a disk backup.");
    return null;
  }
  function Run(mode,Action)
  {
    return new Promise(function (Resolve,Reject) {
      let tx=db.transaction("disk",mode,{durability:"strict"}),result;
      tx.oncomplete=function () {Resolve(result?.());};
      tx.onabort=function () {Reject(tx.error || Error("Disk save aborted."));};
      try {result=Action(tx.objectStore("disk"));}
      catch (e) {tx.abort();Reject(e);}
    });
  }
  function ErrorShow(e)
  {
    failed=e;write=false;Status("error","C: autosave failed: "+e.message+" Export a disk backup.");
  }
  function Flush()
  {
    queued=false;
    if (!write || !dirty.size) return pending;
    let batch=dirty;dirty=new Map();active++;
    Status("saving","Saving C:…");
    pending=pending.then(function () {
      if (failed) throw failed;
      return Run("readwrite",function (store) {
        for (let [lba,bytes] of batch) store.put(bytes,lba);
      });
    }).then(function () {
      failed=null;

    }).catch(function (e) {
      for (let [lba,bytes] of batch) if (!dirty.has(lba)) dirty.set(lba,bytes);
      ErrorShow(e);
    }).finally(function () {
      active--;
      if (!active && !dirty.size && !failed) Status("saved","C: saved in this browser.");
    });
    return pending;
  }
  return {
    async Load() {
      let record=await Run("readonly",function (store) {
        let base=store.get("base"),keys=store.getAllKeys(),values=store.getAll();
        return function () {return {base:base.result,keys:keys.result,values:values.result};};
      });
      if (!record.base) return null;
      let disk=makeDisk(new Uint8Array(await record.base.arrayBuffer()));
      record.keys.forEach(function (key,i) {
        if (typeof key=="number") {
          let bytes=record.values[i];
          if (!Number.isInteger(key) || key<0 || key*512+512>disk.virtualSize || bytes.length!=512)
            throw Error("Saved C: contains an invalid sector.");
          disk.overlay.set(key,bytes);
        }
      });
      return disk;
    },
    async Attach(disk,restored=false) {
      await Flush();
      if (!write) {
        if (failed) {ErrorShow(failed);return;}
        Status("error","C: autosave is active in another tab. Changes here are not saved; export a backup.");
        return;
      }
      try {
        if (!restored) {
          let parts=[],bytes;
          if (disk.base) parts.push(disk.base);
          else for (let off=0;off<disk.virtualSize;off+=1048576) {
            bytes=new Uint8Array(Math.min(1048576,disk.virtualSize-off));
            disk.readInto(off/512,bytes.length/512,bytes,0);parts.push(bytes);
          }
          let base=new Blob(parts);
          await Run("readwrite",function (store) {
            store.clear();store.put(base,"base");
            for (let [lba,bytes] of disk.overlay) store.put(bytes,lba);
          });
        }
        dirty.clear();failed=null;
        let Write=disk.writeInto;
        disk.writeInto=function (lba,count,src,off) {
          Write.call(disk,lba,count,src,off);
          for (let i=0;i<count;i++) dirty.set(lba+i,disk.overlay.get(lba+i));
          if (!queued) {queued=true;queueMicrotask(Flush);}
        };
        Status("saved","C: saved in this browser.");
      } catch (e) {ErrorShow(e);}
    },
    async Flush() {
      await Flush();
      if (failed) throw failed;
    }
  };
}
