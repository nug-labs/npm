/**
 * A single strain record from the NugLabs dataset.
 *
 * Common fields include:
 * - `id`
 * - `name`
 * - `akas`
 * - `type`
 * - `thc`
 * - `description`
 * - any additional fields present in the bundled dataset
 */
export interface Strain {
  /** Stable numeric identifier when present in the dataset. */
  id?: number;
  /** Primary display name for the strain. */
  name: string;
  /** Alternate names that should also resolve in exact and partial search. */
  akas?: string[];
  /** Additional dataset fields returned by NugLabs. */
  [key: string]: unknown;
}

/**
 * Convenience alias for `Strain[]`.
 *
 * This is the full locally loaded strain dataset.
 */
export type StrainDataset = Strain[];

/**
 * Minimal browser storage contract used by the SDK.
 */
export interface BrowserStorageAdapter {
  /**
   * Reads a string value for a given key.
   *
   * @param key Storage key to read.
   * @returns Stored string value, or `null` when missing.
   */
  getItem(key: string): string | null;

  /**
   * Writes a string value for a given key.
   *
   * @param key Storage key to update.
   * @param value Serialized payload to store.
   */
  setItem(key: string, value: string): void;
}

/**
 * Configuration for a `NugLabsClient` instance.
 */
export interface NugLabsClientOptions {
  /** Base URL used only for background sync and `forceResync()`. */
  apiBaseUrl?: string;
  /** Enables or disables the in-memory cache used for reads. Defaults to `true`. */
  cacheInMemory?: boolean;
  /** Node-only storage directory for persisted dataset overrides. Ignored when `useBrowserStorage` is `true`. */
  storageDir?: string;
  /** Enables browser storage persistence and overrides any `storageDir` value. */
  useBrowserStorage?: boolean;
  /** Browser storage key used when `useBrowserStorage` is enabled. */
  browserStorageKey?: string;
  /** Optional custom browser storage adapter. Useful for tests or non-DOM environments. */
  browserStorage?: BrowserStorageAdapter;
  /** Background sync interval in milliseconds. Defaults to 12 hours. */
  syncIntervalMs?: number;
  /** Custom fetch implementation used for sync requests. */
  fetchImpl?: typeof fetch;
}

/**
 * Result returned after a successful remote sync.
 */
export interface NugLabsSyncResult {
  /** ISO timestamp for when the dataset was refreshed. */
  updatedAt: string;
  /** Number of strain records loaded from the remote API. */
  count: number;
  /** Source of the new dataset. */
  source: "remote";
}
