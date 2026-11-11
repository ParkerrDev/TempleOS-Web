globalThis.atob=NativeAtob;
//JavaScriptCore supplies the language and WASM; Qt supplies these bounded transports.
globalThis.TextEncoder=class {encode(value=""){return NativeUtf8(String(value));}};
globalThis.TextDecoder=class {
  constructor(encoding="utf-8",options={}) {
    if(encoding!=="utf-8"||!options.fatal)throw Error("Native decoder requires strict UTF-8");
  }
  decode(bytes){return NativeDecode(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes));}
};
globalThis.crypto={subtle:{digest(kind,bytes){
  if(kind!=="SHA-256")throw Error("Unsupported native digest");
  return Promise.resolve(NativeHash(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes)).buffer);
}}};
globalThis.console={log:NativeLog,warn:NativeLog,error:NativeLog};
