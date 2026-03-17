import type { NugLabsSyncResult, StrainDataset } from "./types";
import { LocalStore } from "./store";

const DEFAULT_BASE_URL = "https://strains.nuglabs.co";
const DEFAULT_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * Validates the remote API payload before it replaces local data.
 *
 * @param value Remote payload returned from the API.
 * @returns `true` when the payload is a valid strain array.
 */
function isValidDataset(value: unknown): value is StrainDataset {
  return Array.isArray(value) && value.every((entry) => Boolean(entry) && typeof entry === "object" && typeof entry.name === "string");
}

/**
 * Manages background and manual sync operations for the local-first store.
 */
export class SyncManager {
  private readonly store: LocalStore;
  private readonly apiBaseUrl: string;
  private readonly intervalMs: number;
  private readonly fetchImpl: typeof fetch;
  private timer: NodeJS.Timeout | null = null;

  /**
   * Creates a new sync manager.
   *
   * @param store Local store that receives refreshed datasets.
   * @param options Sync configuration overrides.
   */
  constructor(store: LocalStore, options: { apiBaseUrl?: string; syncIntervalMs?: number; fetchImpl?: typeof fetch } = {}) {
    this.store = store;
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_BASE_URL;
    this.intervalMs = options.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
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
   * Fetches the latest dataset from the API and stores it locally.
   *
   * @returns Metadata about the applied sync.
   */
  async forceResync(): Promise<NugLabsSyncResult> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}/api/v1/strains`);
    if (!response.ok) {
      throw new Error(`NugLabs sync failed with status ${response.status}`);
    }

    const data = (await response.json()) as unknown;
    if (!isValidDataset(data)) {
      throw new Error("NugLabs sync returned an invalid dataset");
    }

    await this.store.replaceDataset(data);
    return {
      updatedAt: new Date().toISOString(),
      count: data.length,
      source: "remote"
    };
  }
}
