import { findExactStrain, findMatchingStrains } from "./search";
import { LocalStore } from "./store";
import { SyncManager } from "./sync";
import type { NugLabsArtifactSyncResult, NugLabsClientOptions, NugLabsSyncResult, Strain, StrainDataset } from "./types";
import { NugLabsWasmEngine } from "./wasm-engine";

const DEFAULT_SYNC_MS = 12 * 60 * 60 * 1000;

/**
 * Local-first client for the NugLabs strain dataset.
 *
 * @remarks
 * **Lifecycle**
 * 1. `new NugLabsClient(options)` — configure storage and sync.
 * 2. `await client.initialize()` — load bundled or persisted data, start WASM (unless `useWasm: false`), start sync timer.
 * 3. Query with {@link NugLabsClient.getStrain}, {@link NugLabsClient.searchStrains}, etc.
 * 4. `client.shutdown()` when done (stops sync, frees WASM).
 *
 * Prefer {@link NugLabsClient.init} for a one-liner that constructs and initializes.
 *
 * **Lookup behavior**
 * Exact match uses the same normalization as the Rust core (trim, lowercase, strip `#`, collapse
 * whitespace). For example, `"Gelato33"`, `"gelato 33"`, and `"Gelato #33"` can all resolve to the
 * canonical strain name `Gelato #33` when that record exists in the dataset.
 *
 * **Rules**
 * Initial normalization rules are bundled in the wrapper package (`src/rules.json`) and loaded into
 * WASM at startup. Background sync can replace them with a newer API payload.
 */
export class NugLabsClient {
  private readonly store: LocalStore;
  private readonly syncManager: SyncManager;
  private readonly options: NugLabsClientOptions;
  private readonly useWasm: boolean;
  private wasm: NugLabsWasmEngine | null = null;
  private initializePromise: Promise<void> | null = null;

  /**
   * Creates a client. Does not load data or WASM until {@link NugLabsClient.initialize} (or {@link NugLabsClient.init}).
   *
   * @param options - See {@link NugLabsClientOptions}. All fields are optional; sensible defaults apply for sync URL and intervals.
   */
  constructor(options: NugLabsClientOptions = {}) {
    this.options = options;
    this.useWasm = options.useWasm !== false;
    this.store = new LocalStore(options);
    this.syncManager = new SyncManager(this.store, {
      syncIntervalMs: options.syncIntervalMs,
      fetchImpl: options.fetchImpl,
      onDatasetUpdated: (dataset) => this.onRemoteDataset(dataset),
      onRulesUpdated: (rulesJson) => this.onRemoteRules(rulesJson)
    });
  }

  /**
   * Constructs a client, awaits `initialize()`, and returns it (ergonomic alias for apps).
   *
   * @param options Same options as the constructor.
   * @returns A ready client instance.
   */
  static async init(options?: NugLabsClientOptions): Promise<NugLabsClient> {
    const client = new NugLabsClient(options);
    await client.initialize();
    return client;
  }

  /**
   * Loads the bundled or persisted dataset, instantiates the WASM engine when enabled, and starts background sync.
   *
   * @returns A promise that resolves when the local dataset and engine are ready.
   */
  async initialize(): Promise<void> {
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        await this.store.initialize();
        if (this.useWasm) {
          this.wasm = await NugLabsWasmEngine.create();
          const dataset = await this.store.getDataset();
          const rulesJson = await this.store.getRules();
          this.wasm.loadRules(rulesJson);
          this.wasm.loadDataset(JSON.stringify(dataset));
          this.wasm.setSyncIntervalMs(this.options.syncIntervalMs ?? DEFAULT_SYNC_MS);
          this.wasm.markDatasetSynced(Date.now());
          this.wasm.markRulesSynced(Date.now());
        }
      })().finally(() => {
        this.syncManager.start();
      });
    }

    await this.initializePromise;
  }

  /**
   * Applies a remote rules JSON payload (same schema as `app/strain-data/normalization/rules.json`).
   * Persistence is left to the host if needed; this updates the in-memory WASM ruleset only.
   *
   * @param rulesJson Raw rules JSON string.
   */
  loadRulesOverride(rulesJson: string): void {
    this.wasm?.loadRules(rulesJson);
  }

  /**
   * Returns a single strain by normalized exact match on `name` and `akas` (WASM ruleset).
   *
   * @param name Strain name or alias to resolve.
   * @returns A `Strain` object, or `null` when nothing matches.
   */
  async getStrain(name: string): Promise<Strain | null> {
    await this.initialize();
    if (this.wasm) {
      return this.wasm.getStrain(name);
    }

    const dataset = await this.readDataset();
    return findExactStrain(dataset, name);
  }

  /**
   * Returns the full locally available strain dataset.
   */
  async getAllStrains(): Promise<Strain[]> {
    await this.initialize();
    if (this.wasm) {
      return this.wasm.getAllStrains();
    }

    return this.readDataset();
  }

  /**
   * Performs partial search across `name` and `akas` using the WASM normalization pipeline.
   *
   * @param query Partial query to search for.
   */
  async searchStrains(query: string): Promise<Strain[]> {
    await this.initialize();
    if (this.wasm) {
      return this.wasm.searchStrains(query);
    }

    const dataset = await this.readDataset();
    return findMatchingStrains(dataset, query);
  }

  /**
   * Recursively normalizes strings (and recurses arrays/objects) using the active WASM ruleset.
   *
   * @param input Any JSON-serializable value.
   */
  async normalize(input: unknown): Promise<unknown> {
    await this.initialize();
    if (!this.wasm) {
      throw new Error("normalize() requires WASM (set useWasm: true)");
    }

    return this.wasm.normalize(input);
  }

  /**
   * Exports the lookup map as JSON (`normalizedKey` → dataset index) for persistence or tooling.
   */
  async exportLookupJson(): Promise<string> {
    await this.initialize();
    if (!this.wasm) {
      throw new Error("exportLookupJson() requires WASM (set useWasm: true)");
    }

    return this.wasm.exportLookupJson();
  }

  /**
   * Runs the WASM sync scheduler and syncs due artifacts.
   */
  async tick(): Promise<void> {
    await this.initialize();
    if (!this.wasm) {
      return;
    }

    const now = Date.now();
    const actions = this.wasm.tickActions(now);
    for (const action of actions) {
      if (action.artifact === "dataset") {
        await this.forceResyncDataset();
      } else if (action.artifact === "rules") {
        await this.forceResyncRules();
      }
    }
  }

  /**
   * Fetches and applies dataset + rules. Equivalent to calling both `forceResyncDataset()` and
   * `forceResyncRules()`.
   */
  async forceResync(): Promise<NugLabsSyncResult> {
    await this.initialize();
    return this.syncManager.forceResync();
  }

  /**
   * Fetches and applies only the remote dataset artifact.
   */
  async forceResyncDataset(): Promise<NugLabsArtifactSyncResult> {
    await this.initialize();
    return this.syncManager.forceResyncDataset();
  }

  /**
   * Fetches and applies only the remote rules artifact.
   */
  async forceResyncRules(): Promise<NugLabsArtifactSyncResult> {
    await this.initialize();
    return this.syncManager.forceResyncRules();
  }

  /**
   * Stops background sync and releases the WASM engine.
   */
  shutdown(): void {
    this.syncManager.stop();
    this.wasm?.destroy();
    this.wasm = null;
    this.initializePromise = null;
  }

  private async onRemoteDataset(dataset: StrainDataset): Promise<void> {
    if (!this.useWasm || !this.wasm) {
      return;
    }

    this.wasm.loadDataset(JSON.stringify(dataset));
    this.wasm.markDatasetSynced(Date.now());
  }

  private async onRemoteRules(rulesJson: string): Promise<void> {
    if (!this.useWasm || !this.wasm) {
      return;
    }
    this.wasm.loadRules(rulesJson);
    this.wasm.markRulesSynced(Date.now());
  }

  private async readDataset(): Promise<StrainDataset> {
    await this.initialize();
    return this.store.getDataset();
  }
}

let defaultClient: NugLabsClient | null = null;

function getDefaultClient(): NugLabsClient {
  defaultClient ??= new NugLabsClient();
  return defaultClient;
}

/**
 * Initializes the module-level singleton client.
 */
export async function initialize(options?: NugLabsClientOptions): Promise<NugLabsClient> {
  if (options) {
    defaultClient?.shutdown();
    defaultClient = new NugLabsClient(options);
  }

  const client = getDefaultClient();
  await client.initialize();
  return client;
}

export async function getStrain(name: string): Promise<Strain | null> {
  return getDefaultClient().getStrain(name);
}

export async function getAllStrains(): Promise<Strain[]> {
  return getDefaultClient().getAllStrains();
}

export async function searchStrains(query: string): Promise<Strain[]> {
  return getDefaultClient().searchStrains(query);
}

export async function forceResync(): Promise<NugLabsSyncResult> {
  return getDefaultClient().forceResync();
}

export async function forceResyncDataset(): Promise<NugLabsArtifactSyncResult> {
  return getDefaultClient().forceResyncDataset();
}

export async function forceResyncRules(): Promise<NugLabsArtifactSyncResult> {
  return getDefaultClient().forceResyncRules();
}

/**
 * Recursively normalizes values using the WASM ruleset (singleton client).
 */
export async function normalize(input: unknown): Promise<unknown> {
  return getDefaultClient().normalize(input);
}

export function shutdown(): void {
  defaultClient?.shutdown();
  defaultClient = null;
}
