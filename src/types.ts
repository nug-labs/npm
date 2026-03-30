/**
 * A single strain record from the NugLabs dataset.
 *
 * The WASM engine preserves whatever fields appear in JSON; these are the fields
 * callers most often rely on.
 */
export interface Strain {
  /** Stable numeric identifier when present in the dataset. */
  id?: number;
  /**
   * Primary display name as stored in the dataset (e.g. `"Gelato #33"`).
   * Exact lookup compares **normalized** keys derived from `name` and `akas`.
   */
  name: string;
  /**
   * Alternate strings that resolve to this strain on exact lookup, after the same
   * normalization rules as `name` (hash stripping, lowercasing, whitespace collapse).
   */
  akas?: string[];
  /** Additional dataset fields returned by NugLabs. */
  [key: string]: unknown;
}

/**
 * The full locally loaded strain dataset (`Strain[]`).
 */
export type StrainDataset = Strain[];

/**
 * Minimal browser storage contract used by the SDK for `localStorage`-style persistence.
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
 * Options for constructing {@link NugLabsClient} and the module `initialize()` helper.
 *
 * @remarks
 * **Typical usage**
 * - **Node**: pass `storageDir` so sync can persist `dataset.json` under that folder.
 * - **Browser**: set `useBrowserStorage: true` (and optionally `browserStorage` for tests).
 *
 * **Normalization** rules are bundled in this wrapper package (`src/rules.json`) and loaded into
 * the Rust WASM engine at startup. Remote rules updates are applied during sync.
 */
export interface NugLabsClientOptions {
  /**
   * When `true` (default), the in-memory store keeps a copy of the dataset for fast reads.
   * Set to `false` if you only want filesystem/browser reads on each access.
   */
  cacheInMemory?: boolean;
  /**
   * **Node:** directory where `dataset.json` is written after a successful sync.
   * Ignored when `useBrowserStorage` is `true`.
   */
  storageDir?: string;
  /**
   * **Browser:** persist the dataset in `localStorage` (or {@link browserStorage}) instead of Node disk.
   * When `true`, `storageDir` is ignored.
   */
  useBrowserStorage?: boolean;
  /**
   * Key used for browser storage when `useBrowserStorage` is enabled. Default: `"nuglabs.dataset"`.
   */
  browserStorageKey?: string;
  /**
   * Inject a custom storage backend (e.g. in-memory map in tests, or a wrapped `localStorage`).
   */
  browserStorage?: BrowserStorageAdapter;
  /**
   * Interval in milliseconds between automatic background sync attempts. Default: 12 hours.
   */
  syncIntervalMs?: number;
  /**
   * `fetch` used for sync (Node 18+ / browsers). Inject a mock in tests to avoid the network.
   */
  fetchImpl?: typeof fetch;
  /**
   * When `true` (default), loads `wasm/nuglabs_core.wasm` for `getStrain`, `searchStrains`, and `normalize`.
   * Set to `false` only if the `.wasm` file is unavailable and you fall back to the legacy TS search helpers.
   */
  useWasm?: boolean;
}

/**
 * Distinct sync artifact identifiers used by tick actions and manual resync methods.
 */
export type NugLabsSyncArtifact = "dataset" | "rules";

/**
 * Host action emitted by the WASM scheduler (`tickActions`).
 */
export interface NugLabsSyncAction {
  artifact: NugLabsSyncArtifact;
  /** Earliest recommended interval between sync checks for this artifact. */
  minIntervalMs: number;
}

/**
 * Result of synchronizing one artifact.
 */
export interface NugLabsArtifactSyncResult {
  artifact: NugLabsSyncArtifact;
  /** `true` when remote bytes were downloaded and applied; `false` for HTTP 304. */
  changed: boolean;
  /** Number of dataset entries when artifact is `dataset`. */
  count?: number;
  /** Response ETag when provided by the server. */
  etag?: string | null;
  /** Sync source (`remote` on 200, `not-modified` on 304). */
  source: "remote" | "not-modified";
  /** ISO-8601 timestamp when this artifact sync completed. */
  updatedAt: string;
}

/**
 * Combined sync result returned by `forceResync()`.
 */
export interface NugLabsSyncResult {
  dataset: NugLabsArtifactSyncResult;
  rules: NugLabsArtifactSyncResult;
}
