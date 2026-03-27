/**
 * Local-first client for the NugLabs strain dataset.
 *
 * Constructor:
 * `new NugLabsClient(options?)`
 *
 * Common options:
 * - `apiBaseUrl?`: defaults to `https://strains.nuglabs.co`
 * - `cacheInMemory?`: defaults to `true`
 * - `storageDir?`: optional Node-only persistence directory
 * - `useBrowserStorage?`: optional, defaults to `false`, overrides `storageDir`
 * - `browserStorageKey?`: optional, defaults to `nuglabs.dataset`
 * - `browserStorage?`: optional custom browser storage adapter
 * - `syncIntervalMs?`: optional, defaults to `43200000` (12 hours)
 * - `fetchImpl?`: optional custom `fetch` implementation
 */
export { NugLabsClient } from "./src/client";

/**
 * Initializes the module-level singleton client.
 *
 * Accepts the same options as `new NugLabsClient(options?)`.
 * Returns a `Promise<NugLabsClient>`.
 */
export { initialize } from "./src/client";

/**
 * Exact case-insensitive lookup on the singleton client.
 *
 * Parameter:
 * - `name`: strain name or alias
 *
 * Returns:
 * - `Promise<Strain | null>`
 */
export { getStrain } from "./src/client";

/**
 * Returns all locally available strains from the singleton client.
 *
 * Returns:
 * - `Promise<Strain[]>`
 */
export { getAllStrains } from "./src/client";

/**
 * Partial case-insensitive search on the singleton client.
 *
 * Parameter:
 * - `query`: partial search text
 *
 * Returns:
 * - `Promise<Strain[]>`
 */
export { searchStrains } from "./src/client";

/**
 * Manually refreshes the singleton client's local dataset from the remote API.
 *
 * Returns:
 * - `Promise<NugLabsSyncResult>`
 */
export { forceResync } from "./src/client";

/**
 * Stops background sync and resets the singleton client.
 *
 * Returns:
 * - `void`
 */
export { shutdown } from "./src/client";

/**
 * A single strain record from the NugLabs dataset.
 *
 * Common fields:
 * - `id`
 * - `name`
 * - `akas`
 * - `type`
 * - `thc`
 * - `description`
 */
export type { Strain } from "./src/types";

/**
 * Convenience alias for `Strain[]`.
 */
export type { StrainDataset } from "./src/types";

/**
 * Minimal browser storage contract used by the SDK.
 */
export type { BrowserStorageAdapter } from "./src/types";

/**
 * Configuration for a `NugLabsClient` instance.
 */
export type { NugLabsClientOptions } from "./src/types";

/**
 * Result returned after a successful remote sync.
 */
export type { NugLabsSyncResult } from "./src/types";
