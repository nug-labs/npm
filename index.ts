/**
 * Local-first client for the NugLabs strain dataset.
 *
 * @packageDocumentation
 *
 * @example
 * ```ts
 * import { NugLabsClient } from "nuglabs";
 *
 * const client = await NugLabsClient.init({ storageDir: "./.nuglabs" });
 * const strain = await client.getStrain("gelato 33"); // can match "Gelato #33"
 * client.shutdown();
 * ```
 *
 * Configuration is fully described on {@link NugLabsClientOptions}.
 */
export { NugLabsClient, normalize } from "./src/client";
export { NugLabsWasmEngine } from "./src/wasm-engine";

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
 * Manually refreshes dataset + rules from the remote API.
 *
 * Returns:
 * - `Promise<NugLabsSyncResult>`
 */
export { forceResync } from "./src/client";
export { forceResyncDataset, forceResyncRules } from "./src/client";

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
export type { NugLabsArtifactSyncResult, NugLabsSyncAction, NugLabsSyncArtifact, NugLabsSyncResult } from "./src/types";

/** Canonical API origin — matches `nuglabs_core::NUGLABS_API_ORIGIN`. */
export { NUGLABS_API_ORIGIN, NUGLABS_RULES_URL, NUGLABS_STRAINS_DATASET_URL } from "./src/constants";
