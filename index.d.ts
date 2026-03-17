/**
 * A single strain record from the NugLabs dataset.
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
 * The full locally loaded strain dataset.
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
   * @returns Nothing.
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

/**
 * Local-first client for the NugLabs strain dataset.
 */
export class NugLabsClient {
  /**
   * Creates a new SDK client instance.
   *
   * @param options Runtime configuration for storage, caching, and sync.
   */
  constructor(options?: NugLabsClientOptions);

  /**
   * Loads the bundled or persisted dataset and starts background sync.
   *
   * @returns A promise that resolves when the local dataset is ready.
   */
  initialize(): Promise<void>;

  /**
   * Returns a single strain by exact case-insensitive match on `name` or `akas`.
   *
   * @param name Strain name or alias to resolve.
   * @returns The matching strain or `null`.
   */
  getStrain(name: string): Promise<Strain | null>;

  /**
   * Returns the full locally available strain dataset.
   *
   * @returns All currently available local strains.
   */
  getAllStrains(): Promise<StrainDataset>;

  /**
   * Performs a case-insensitive partial search against `name` and `akas`.
   *
   * @param query Partial query to search for.
   * @returns All matching strains.
   */
  searchStrains(query: string): Promise<StrainDataset>;

  /**
   * Fetches the latest remote dataset and replaces the local copy.
   *
   * @returns Metadata about the applied sync.
   */
  forceResync(): Promise<NugLabsSyncResult>;

  /**
   * Stops background sync for this client instance.
   *
   * @returns Nothing.
   */
  shutdown(): void;
}

/**
 * Initializes the module-level singleton client.
   *
   * @param options Optional runtime configuration for the singleton client.
   * @returns The initialized singleton client.
 */
export function initialize(options?: NugLabsClientOptions): Promise<NugLabsClient>;

/**
 * Exact case-insensitive lookup on the singleton client.
 *
 * @param name Strain name or alias to resolve.
 * @returns The matching strain or `null`.
 */
export function getStrain(name: string): Promise<Strain | null>;

/**
 * Returns all locally available strains from the singleton client.
 *
 * @returns All currently available local strains.
 */
export function getAllStrains(): Promise<StrainDataset>;

/**
 * Partial case-insensitive search on the singleton client.
 *
 * @param query Partial query to search for.
 * @returns All matching strains.
 */
export function searchStrains(query: string): Promise<StrainDataset>;

/**
 * Manually refreshes the singleton client's local dataset from the remote API.
 *
 * @returns Metadata about the applied sync.
 */
export function forceResync(): Promise<NugLabsSyncResult>;

/**
 * Stops background sync and resets the singleton client.
 *
 * @returns Nothing.
 */
export function shutdown(): void;
