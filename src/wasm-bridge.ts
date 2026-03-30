/**
 * Low-level loader and helpers for the `nuglabs_core` WASM module (C ABI from `app/sdk/core`).
 */

export type NugLabsWasmExports = {
  memory: WebAssembly.Memory;
  nuglabs_alloc: (len: number) => number;
  nuglabs_dealloc: (ptr: number, len: number) => void;
  nuglabs_engine_create: () => number;
  nuglabs_engine_destroy: (handle: number) => void;
  nuglabs_engine_load_dataset: (handle: number, ptr: number, len: number) => number;
  nuglabs_engine_load_rules: (handle: number, ptr: number, len: number) => number;
  nuglabs_engine_rebuild_lookup: (handle: number) => number;
  nuglabs_engine_get_strain: (handle: number, ptr: number, len: number, outPtr: number, outLen: number) => number;
  nuglabs_engine_search: (handle: number, ptr: number, len: number, outPtr: number, outLen: number) => number;
  nuglabs_engine_get_all_strains: (handle: number, outPtr: number, outLen: number) => number;
  nuglabs_engine_normalize: (handle: number, ptr: number, len: number, outPtr: number, outLen: number) => number;
  nuglabs_engine_normalize_text: (handle: number, ptr: number, len: number, outPtr: number, outLen: number) => number;
  nuglabs_engine_export_lookup: (handle: number, outPtr: number, outLen: number) => number;
  nuglabs_engine_set_sync_interval: (handle: number, intervalMs: bigint) => number;
  nuglabs_engine_mark_synced: (handle: number, atMs: bigint) => number;
  nuglabs_engine_mark_dataset_synced?: (handle: number, atMs: bigint) => number;
  nuglabs_engine_mark_rules_synced?: (handle: number, atMs: bigint) => number;
  nuglabs_engine_set_dataset_sync_interval?: (handle: number, intervalMs: bigint) => number;
  nuglabs_engine_set_rules_sync_interval?: (handle: number, intervalMs: bigint) => number;
  nuglabs_engine_tick: (handle: number, nowMs: bigint) => number;
  nuglabs_engine_tick_actions?: (handle: number, nowMs: bigint) => number;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Loads the WASM module bytes. Resolves `../wasm/nuglabs_core.wasm` relative to this module.
 */
export async function loadWasmBytes(): Promise<Uint8Array> {
  const url = new URL("../wasm/nuglabs_core.wasm", import.meta.url);
  if (url.protocol === "file:") {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    return readFile(fileURLToPath(url));
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load nuglabs_core.wasm (${response.status} ${response.statusText})`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Instantiates the module with no imports (Rust C ABI only).
 */
export async function instantiateNugLabsWasm(bytes: ArrayBuffer | Uint8Array): Promise<WebAssembly.Instance> {
  const out = await WebAssembly.instantiate(bytes, {});
  if (out instanceof WebAssembly.Instance) {
    return out;
  }
  return (out as WebAssembly.WebAssemblyInstantiatedSource).instance;
}

function viewMemory(memory: WebAssembly.Memory): DataView {
  return new DataView(memory.buffer);
}

/**
 * Writes a UTF-8 string into WASM memory via `nuglabs_alloc` and returns pointer/length.
 */
export function writeString(exports: NugLabsWasmExports, value: string): { ptr: number; len: number } {
  const encoded = textEncoder.encode(value);
  const ptr = exports.nuglabs_alloc(encoded.length);
  if (ptr === 0 && encoded.length > 0) {
    throw new Error("nuglabs_alloc failed");
  }
  new Uint8Array(exports.memory.buffer, ptr, encoded.length).set(encoded);
  return { ptr, len: encoded.length };
}

/**
 * Reads a UTF-8 string from WASM memory and frees it with `nuglabs_dealloc`.
 */
export function readAndFreeString(exports: NugLabsWasmExports, ptr: number, len: number): string {
  if (len === 0) {
    return "";
  }
  const slice = new Uint8Array(exports.memory.buffer, ptr, len);
  const text = textDecoder.decode(slice);
  exports.nuglabs_dealloc(ptr, len);
  return text;
}

/**
 * Invokes a function that writes JSON output into two out-slots (pointer + length), then decodes JSON.
 */
export function callJsonOut<T>(
  exports: NugLabsWasmExports,
  invoke: (outPtrSlot: number, outLenSlot: number) => number
): T {
  const outPtrSlot = exports.nuglabs_alloc(4);
  const outLenSlot = exports.nuglabs_alloc(4);
  if (outPtrSlot === 0 || outLenSlot === 0) {
    throw new Error("nuglabs_alloc failed for out slots");
  }

  try {
    const status = invoke(outPtrSlot, outLenSlot);
    if (status !== 0) {
      throw new Error(`nuglabs wasm call failed with code ${status}`);
    }

    const mem = viewMemory(exports.memory);
    const resultPtr = mem.getUint32(outPtrSlot, true);
    const resultLen = mem.getUint32(outLenSlot, true);
    const raw = readAndFreeString(exports, resultPtr, resultLen);
    return JSON.parse(raw) as T;
  } finally {
    exports.nuglabs_dealloc(outPtrSlot, 4);
    exports.nuglabs_dealloc(outLenSlot, 4);
  }
}
