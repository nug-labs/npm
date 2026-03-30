/**
 * Canonical NugLabs API URLs — keep in sync with `nuglabs_core::constants` (`app/sdk/core/src/constants.rs`).
 */
export const NUGLABS_API_ORIGIN = "https://strains.nuglabs.co";

/** `GET` JSON strain list used by {@link SyncManager}. */
export const NUGLABS_STRAINS_DATASET_URL = `${NUGLABS_API_ORIGIN}/api/v1/strains`;
/** `GET` JSON normalization rules used by {@link SyncManager}. */
export const NUGLABS_RULES_URL = `${NUGLABS_API_ORIGIN}/api/v1/strains/rules`;
