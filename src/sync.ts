import { NUGLABS_RULES_URL, NUGLABS_STRAINS_DATASET_URL } from "./constants";
import type { NugLabsArtifactSyncResult, NugLabsSyncResult, StrainDataset } from "./types";
import { LocalStore } from "./store";

const DEFAULT_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * Called after the remote dataset is validated and persisted (background or manual sync).
 */
export type DatasetUpdatedListener = (dataset: StrainDataset) => void | Promise<void>;
/** Called after the remote rules payload is validated and persisted. */
export type RulesUpdatedListener = (rulesJson: string) => void | Promise<void>;

/**
 * Validates the remote API payload before it replaces local data.
 *
 * @param value Remote payload returned from the API.
 * @returns `true` when the payload is a valid strain array.
 */
function isValidDataset(value: unknown): value is StrainDataset {
  return Array.isArray(value) && value.every((entry) => Boolean(entry) && typeof entry === "object" && typeof entry.name === "string");
}

function parseRules(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return JSON.stringify(value);
}

/**
 * Manages background and manual sync operations for the local-first store.
 */
export class SyncManager {
  private readonly store: LocalStore;
  private readonly intervalMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly onDatasetUpdated?: DatasetUpdatedListener;
  private readonly onRulesUpdated?: RulesUpdatedListener;
  private timer: NodeJS.Timeout | null = null;

  /**
   * Creates a new sync manager.
   *
   * @param store Local store that receives refreshed datasets.
   * @param options Sync configuration overrides.
   */
  constructor(
    store: LocalStore,
    options: {
      syncIntervalMs?: number;
      fetchImpl?: typeof fetch;
      onDatasetUpdated?: DatasetUpdatedListener;
      onRulesUpdated?: RulesUpdatedListener;
    } = {}
  ) {
    this.store = store;
    this.intervalMs = options.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.onDatasetUpdated = options.onDatasetUpdated;
    this.onRulesUpdated = options.onRulesUpdated;
  }

  /**
   * Starts the 12-hour background sync timer.
   */
  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.forceResync();
    }, this.intervalMs);

    this.timer.unref?.();
  }

  /**
   * Stops the background sync timer.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Fetches dataset + rules from the API and applies changed artifacts.
   */
  async forceResync(): Promise<NugLabsSyncResult> {
    const [dataset, rules] = await Promise.all([this.forceResyncDataset(), this.forceResyncRules()]);
    return { dataset, rules };
  }

  /**
   * Fetches the dataset endpoint with ETag conditional headers.
   */
  async forceResyncDataset(): Promise<NugLabsArtifactSyncResult> {
    const etag = await this.store.getSyncEtag("dataset");
    const response = await this.fetchImpl(NUGLABS_STRAINS_DATASET_URL, {
      headers: etag ? { "If-None-Match": etag } : undefined
    });
    if (response.status === 304) {
      return {
        artifact: "dataset",
        changed: false,
        count: undefined,
        etag,
        source: "not-modified",
        updatedAt: new Date().toISOString()
      };
    }
    if (!response.ok) {
      throw new Error(`NugLabs dataset sync failed with status ${response.status}`);
    }
    const data = (await response.json()) as unknown;
    if (!isValidDataset(data)) {
      throw new Error("NugLabs sync returned an invalid dataset");
    }
    const nextEtag = response.headers.get("etag");
    await this.store.replaceDataset(data);
    await this.store.setSyncEtag("dataset", nextEtag);
    await Promise.resolve(this.onDatasetUpdated?.(data));
    return {
      artifact: "dataset",
      changed: true,
      count: data.length,
      etag: nextEtag,
      source: "remote",
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Fetches the rules endpoint with ETag conditional headers.
   */
  async forceResyncRules(): Promise<NugLabsArtifactSyncResult> {
    const etag = await this.store.getSyncEtag("rules");
    const response = await this.fetchImpl(NUGLABS_RULES_URL, {
      headers: etag ? { "If-None-Match": etag } : undefined
    });
    if (response.status === 304) {
      return {
        artifact: "rules",
        changed: false,
        etag,
        source: "not-modified",
        updatedAt: new Date().toISOString()
      };
    }
    if (response.status === 404) {
      // Backward compatibility: older API deployments might not expose a rules endpoint yet.
      return {
        artifact: "rules",
        changed: false,
        etag,
        source: "not-modified",
        updatedAt: new Date().toISOString()
      };
    }
    if (!response.ok) {
      throw new Error(`NugLabs rules sync failed with status ${response.status}`);
    }
    const payload = parseRules((await response.json()) as unknown);
    if (!payload) {
      throw new Error("NugLabs sync returned invalid rules");
    }
    const nextEtag = response.headers.get("etag");
    await this.store.replaceRules(payload);
    await this.store.setSyncEtag("rules", nextEtag);
    await Promise.resolve(this.onRulesUpdated?.(payload));
    return {
      artifact: "rules",
      changed: true,
      etag: nextEtag,
      updatedAt: new Date().toISOString(),
      source: "remote"
    };
  }
}
