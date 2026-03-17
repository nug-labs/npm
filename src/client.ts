import { findExactStrain, findMatchingStrains } from "./search";
import { LocalStore } from "./store";
import { SyncManager } from "./sync";
import type { NugLabsClientOptions, NugLabsSyncResult, Strain, StrainDataset } from "./types";

/**
 * Local-first client for the NugLabs strain dataset.
 */
export class NugLabsClient {
  private readonly store: LocalStore;
  private readonly syncManager: SyncManager;
  private initializePromise: Promise<void> | null = null;

  /**
   * Creates a new SDK client instance.
   *
   * @param options Runtime configuration for storage, caching, and sync.
   */
  constructor(options: NugLabsClientOptions = {}) {
    this.store = new LocalStore(options);
    this.syncManager = new SyncManager(this.store, options);
  }

  /**
   * Loads the bundled or persisted dataset and starts background sync.
   *
   * @returns A promise that resolves when the local dataset is ready.
   */
  async initialize(): Promise<void> {
    if (!this.initializePromise) {
      this.initializePromise = this.store.initialize().finally(() => {
        this.syncManager.start();
      });
    }

    await this.initializePromise;
  }

  /**
   * Returns a single strain by exact case-insensitive match on `name` or `akas`.
   *
   * @param name Strain name or alias to resolve.
   * @returns The matching strain or `null`.
   */
  async getStrain(name: string): Promise<Strain | null> {
    const dataset = await this.readDataset();
    return findExactStrain(dataset, name);
  }

  /**
   * Returns the full locally available strain dataset.
   *
   * @returns All currently available local strains.
   */
  async getAllStrains(): Promise<StrainDataset> {
    return this.readDataset();
  }

  /**
   * Performs a case-insensitive partial search against `name` and `akas`.
   *
   * @param query Partial query to search for.
   * @returns All matching strains.
   */
  async searchStrains(query: string): Promise<StrainDataset> {
    const dataset = await this.readDataset();
    return findMatchingStrains(dataset, query);
  }

  /**
   * Fetches the latest remote dataset and replaces the local copy.
   *
   * @returns Metadata about the applied sync.
   */
  async forceResync(): Promise<NugLabsSyncResult> {
    await this.initialize();
    return this.syncManager.forceResync();
  }

  /**
   * Stops background sync for this client instance.
   *
   * @returns Nothing.
   */
  shutdown(): void {
    this.syncManager.stop();
  }

  /**
   * Loads the current dataset from memory or persistence.
   */
  private async readDataset(): Promise<StrainDataset> {
    await this.initialize();
    return this.store.getDataset();
  }
}

let defaultClient: NugLabsClient | null = null;

/**
 * Returns the module-level singleton client used by functional exports.
 */
function getDefaultClient(): NugLabsClient {
  defaultClient ??= new NugLabsClient();
  return defaultClient;
}

/**
 * Initializes the module-level singleton client.
 *
 * @param options Optional runtime configuration for the singleton client.
 * @returns The initialized singleton client.
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

/**
 * Exact case-insensitive lookup on the singleton client.
 *
 * @param name Strain name or alias to resolve.
 * @returns The matching strain or `null`.
 */
export async function getStrain(name: string): Promise<Strain | null> {
  return getDefaultClient().getStrain(name);
}

/**
 * Returns all locally available strains from the singleton client.
   *
   * @returns All currently available local strains.
 */
export async function getAllStrains(): Promise<StrainDataset> {
  return getDefaultClient().getAllStrains();
}

/**
 * Partial case-insensitive search on the singleton client.
 *
 * @param query Partial query to search for.
 * @returns All matching strains.
 */
export async function searchStrains(query: string): Promise<StrainDataset> {
  return getDefaultClient().searchStrains(query);
}

/**
 * Manually refreshes the singleton client's local dataset from the remote API.
   *
   * @returns Metadata about the applied sync.
 */
export async function forceResync(): Promise<NugLabsSyncResult> {
  return getDefaultClient().forceResync();
}

/**
 * Stops background sync and resets the singleton client.
   *
   * @returns Nothing.
 */
export function shutdown(): void {
  defaultClient?.shutdown();
  defaultClient = null;
}
