/**
 * Local-first client for the NugLabs strain dataset.
 */
export { NugLabsClient } from "./src/client";

/**
 * Initializes the module-level singleton client.
 */
export { initialize } from "./src/client";

/**
 * Exact case-insensitive lookup on the singleton client.
 */
export { getStrain } from "./src/client";

/**
 * Returns all locally available strains from the singleton client.
 */
export { getAllStrains } from "./src/client";

/**
 * Partial case-insensitive search on the singleton client.
 */
export { searchStrains } from "./src/client";

/**
 * Manually refreshes the singleton client's local dataset from the remote API.
 */
export { forceResync } from "./src/client";

/**
 * Stops background sync and resets the singleton client.
 */
export { shutdown } from "./src/client";

/**
 * A single strain record from the NugLabs dataset.
 */
export type { Strain } from "./src/types";

/**
 * The full locally loaded strain dataset.
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
