async function DbRun(mode,Action)
{//A reload is safe only after the whole transaction commits.
  let db=await new Promise(function (Resolve,Reject) {
    let req=indexedDB.open("hemu",1),blocked=false;
    req.onupgradeneeded=function () {
      req.result.createObjectStore("kv");
    };
    req.onblocked=function () {
      blocked=true;
      Reject(new Error("Close other TempleOS tabs and try again."));
    };
    req.onerror=function () {Reject(req.error);};
    req.onsuccess=function () {
      if (blocked)
        req.result.close();
      else
        Resolve(req.result);
    };
  });
  db.onversionchange=function () {db.close();};
  try {
    return await new Promise(function (Resolve,Reject) {
      let tx=db.transaction("kv",mode),Result;
      tx.oncomplete=function () {Resolve(Result?.());};
      tx.onabort=function () {
        Reject(tx.error || new Error("Browser storage transaction aborted."));
      };
      try {
        Result=Action(tx.objectStore("kv"));
      } catch (e) {
        tx.abort();
        Reject(e);
      }
    });
  } finally {
    db.close();
  }
}

export function BootFileSave(kind,bytes)
{
  if (!["snapshot","disk"].includes(kind))
    throw new Error("Unknown boot file type.");
  return DbRun("readwrite",function (store) {
    store.put({token:crypto.randomUUID(),kind,bytes},"import");
    store.delete("importSnap");
    store.delete("importDisk");
  });
}

export function BootFileRead()
{
  return DbRun("readonly",function (store) {
    let cur=store.get("import"),snap=store.get("importSnap"),
      disk=store.get("importDisk");
    return function () {
      if (cur.result)
        return cur.result;
      if (snap.result || disk.result)
        return {token:null,snapshot:snap.result,disk:disk.result};
      return null;
    };
  });
}

export function BootFileClear(file)
{//Do not erase a newer import made while the previous machine was loading.
  return DbRun("readwrite",function (store) {
    let req=store.get("import");
    req.onsuccess=function () {
      if (req.result?.token==file.token)
        store.delete("import");
      if (file.token===null) {
        store.delete("importSnap");
        store.delete("importDisk");
      }
    };
  });
}
