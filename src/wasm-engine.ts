/**
 * Thin wrapper around the Rust `nuglabs_core` WASM module.
 */

import {
  callJsonOut,
  instantiateNugLabsWasm,
  loadWasmBytes,
  type NugLabsWasmExports,
  readAndFreeString,
  writeString
} from "./wasm-bridge";
import type { NugLabsSyncAction, Strain } from "./types";

export class NugLabsWasmEngine {
  private readonly exports: NugLabsWasmExports;
  private handle = 0;
  private datasetSyncIntervalMs = 12 * 60 * 60 * 1000;
  private rulesSyncIntervalMs = 12 * 60 * 60 * 1000;

  private constructor(exports: NugLabsWasmExports) {
    this.exports = exports;
  }

  /**
   * Loads the default WASM binary and constructs an engine handle.
   */
  static async create(): Promise<NugLabsWasmEngine> {
    const bytes = await loadWasmBytes();
    return NugLabsWasmEngine.fromBytes(bytes);
  }

  /**
   * Instantiates from raw WASM bytes (tests or custom builds).
   */
  static async fromBytes(bytes: ArrayBuffer | Uint8Array): Promise<NugLabsWasmEngine> {
    const instance = await instantiateNugLabsWasm(bytes);
    const exports = instance.exports as unknown as NugLabsWasmExports;
    if (!exports.memory || typeof exports.nuglabs_engine_create !== "function") {
      throw new Error("Invalid nuglabs_core WASM exports");
    }

    const engine = new NugLabsWasmEngine(exports);
    engine.handle = exports.nuglabs_engine_create();
    if (engine.handle === 0) {
      throw new Error("nuglabs_engine_create returned 0");
    }
    return engine;
  }

  /** @internal */
  get wasmExports(): NugLabsWasmExports {
    return this.exports;
  }

  /**
   * Loads/replaces the strain dataset JSON (array of strain objects).
   */
  loadDataset(json: string): void {
    const { ptr, len } = writeString(this.exports, json);
    try {
      const code = this.exports.nuglabs_engine_load_dataset(this.handle, ptr, len);
      if (code !== 0) {
        throw new Error(`nuglabs_engine_load_dataset failed: ${code}`);
      }
    } finally {
      this.exports.nuglabs_dealloc(ptr, len);
    }
  }

  /**
   * Replaces normalization rules (remote override). Same schema as `app/strain-data/normalization/rules.json`.
   */
  loadRules(json: string): void {
    const { ptr, len } = writeString(this.exports, json);
    try {
      const code = this.exports.nuglabs_engine_load_rules(this.handle, ptr, len);
      if (code !== 0) {
        throw new Error(`nuglabs_engine_load_rules failed: ${code}`);
      }
    } finally {
      this.exports.nuglabs_dealloc(ptr, len);
    }
  }

  /**
   * Exact lookup using the engine normalization pipeline.
   */
  getStrain(name: string): Strain | null {
    const { ptr, len } = writeString(this.exports, name);
    try {
      const strain = callJsonOut<Strain | null>(this.exports, (outP, outL) =>
        this.exports.nuglabs_engine_get_strain(this.handle, ptr, len, outP, outL)
      );
      return strain;
    } finally {
      this.exports.nuglabs_dealloc(ptr, len);
    }
  }

  /**
   * Partial search across names and aliases.
   */
  searchStrains(query: string): Strain[] {
    const { ptr, len } = writeString(this.exports, query);
    try {
      return callJsonOut<Strain[]>(this.exports, (outP, outL) =>
        this.exports.nuglabs_engine_search(this.handle, ptr, len, outP, outL)
      );
    } finally {
      this.exports.nuglabs_dealloc(ptr, len);
    }
  }

  /**
   * Returns all strains currently loaded in the engine.
   */
  getAllStrains(): Strain[] {
    return callJsonOut<Strain[]>(this.exports, (outP, outL) =>
      this.exports.nuglabs_engine_get_all_strains(this.handle, outP, outL)
    );
  }

  /**
   * Recursive JSON normalization using active rules.
   */
  normalize(input: unknown): unknown {
    const raw = JSON.stringify(input);
    const { ptr, len } = writeString(this.exports, raw);
    try {
      return callJsonOut<unknown>(this.exports, (outP, outL) =>
        this.exports.nuglabs_engine_normalize(this.handle, ptr, len, outP, outL)
      );
    } finally {
      this.exports.nuglabs_dealloc(ptr, len);
    }
  }

  /**
   * Normalizes a single string using the same rules as search keys.
   */
  normalizeText(text: string): string {
    const { ptr, len } = writeString(this.exports, text);
    try {
      return callJsonOut<string>(this.exports, (outP, outL) =>
        this.exports.nuglabs_engine_normalize_text(this.handle, ptr, len, outP, outL)
      );
    } finally {
      this.exports.nuglabs_dealloc(ptr, len);
    }
  }

  /**
   * Serializes the lookup map (normalized key → dataset index) as JSON.
   */
  exportLookupJson(): string {
    const outPtrSlot = this.exports.nuglabs_alloc(4);
    const outLenSlot = this.exports.nuglabs_alloc(4);
    if (outPtrSlot === 0 || outLenSlot === 0) {
      throw new Error("nuglabs_alloc failed");
    }
    try {
      const code = this.exports.nuglabs_engine_export_lookup(this.handle, outPtrSlot, outLenSlot);
      if (code !== 0) {
        throw new Error(`nuglabs_engine_export_lookup failed: ${code}`);
      }
      const mem = new DataView(this.exports.memory.buffer);
      const resultPtr = mem.getUint32(outPtrSlot, true);
      const resultLen = mem.getUint32(outLenSlot, true);
      return readAndFreeString(this.exports, resultPtr, resultLen);
    } finally {
      this.exports.nuglabs_dealloc(outPtrSlot, 4);
      this.exports.nuglabs_dealloc(outLenSlot, 4);
    }
  }

  setSyncIntervalMs(ms: number): void {
    const code = this.exports.nuglabs_engine_set_sync_interval(this.handle, BigInt(ms));
    if (code !== 0) {
      throw new Error(`nuglabs_engine_set_sync_interval failed: ${code}`);
    }
    this.datasetSyncIntervalMs = ms;
    this.rulesSyncIntervalMs = ms;
  }

  markSynced(atMs: number): void {
    const code = this.exports.nuglabs_engine_mark_synced(this.handle, BigInt(Math.trunc(atMs)));
    if (code !== 0) {
      throw new Error(`nuglabs_engine_mark_synced failed: ${code}`);
    }
  }

  markDatasetSynced(atMs: number): void {
    if (!this.exports.nuglabs_engine_mark_dataset_synced) {
      this.markSynced(atMs);
      return;
    }
    const code = this.exports.nuglabs_engine_mark_dataset_synced(this.handle, BigInt(Math.trunc(atMs)));
    if (code !== 0) {
      throw new Error(`nuglabs_engine_mark_dataset_synced failed: ${code}`);
    }
  }

  markRulesSynced(atMs: number): void {
    if (!this.exports.nuglabs_engine_mark_rules_synced) {
      this.markSynced(atMs);
      return;
    }
    const code = this.exports.nuglabs_engine_mark_rules_synced(this.handle, BigInt(Math.trunc(atMs)));
    if (code !== 0) {
      throw new Error(`nuglabs_engine_mark_rules_synced failed: ${code}`);
    }
  }

  setDatasetSyncIntervalMs(ms: number): void {
    if (!this.exports.nuglabs_engine_set_dataset_sync_interval) {
      this.setSyncIntervalMs(ms);
      return;
    }
    const code = this.exports.nuglabs_engine_set_dataset_sync_interval(this.handle, BigInt(ms));
    if (code !== 0) {
      throw new Error(`nuglabs_engine_set_dataset_sync_interval failed: ${code}`);
    }
    this.datasetSyncIntervalMs = ms;
  }

  setRulesSyncIntervalMs(ms: number): void {
    if (!this.exports.nuglabs_engine_set_rules_sync_interval) {
      this.setSyncIntervalMs(ms);
      return;
    }
    const code = this.exports.nuglabs_engine_set_rules_sync_interval(this.handle, BigInt(ms));
    if (code !== 0) {
      throw new Error(`nuglabs_engine_set_rules_sync_interval failed: ${code}`);
    }
    this.rulesSyncIntervalMs = ms;
  }

  /**
   * Returns `true` when a background sync is due (host may call `forceResync`).
   */
  tick(nowMs: number): boolean {
    return this.tickActions(nowMs).length > 0;
  }

  /**
   * Returns one action per sync artifact due (`dataset`, `rules`).
   */
  tickActions(nowMs: number): NugLabsSyncAction[] {
    const mask = this.exports.nuglabs_engine_tick_actions
      ? this.exports.nuglabs_engine_tick_actions(this.handle, BigInt(Math.trunc(nowMs)))
      : this.exports.nuglabs_engine_tick(this.handle, BigInt(Math.trunc(nowMs)));
    const out: NugLabsSyncAction[] = [];
    if ((mask & 1) !== 0) {
      out.push({ artifact: "dataset", minIntervalMs: this.datasetSyncIntervalMs });
    }
    if ((mask & 2) !== 0) {
      out.push({ artifact: "rules", minIntervalMs: this.rulesSyncIntervalMs });
    }
    return out;
  }

  destroy(): void {
    if (this.handle !== 0) {
      this.exports.nuglabs_engine_destroy(this.handle);
      this.handle = 0;
    }
  }
}
