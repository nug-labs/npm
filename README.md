# NugLabs JavaScript SDK

Local-first SDK for `https://strains.nuglabs.co`.

Current npm package version: `1.3.1`.

## Design

- Ships with a bundled `src/dataset.json`
- Ships with a bundled `src/rules.json`
- Loads bundled data on startup
- Uses persisted local data if a newer synced copy exists
- Performs all reads and searches against local data only
- Auto-syncs from the API every 12 hours
- Supports manual `forceResync()` (`dataset` + `rules`)
- Supports targeted `forceResyncDataset()` and `forceResyncRules()`
- Uses ETag conditional requests (`If-None-Match`) for sync efficiency
- Supports browser persistence with `useBrowserStorage: true`
- Falls back to memory-only mode if disk writes are not permitted

## Install

```bash
npm install nuglabs
```

## Usage

```ts
import {
  getStrain,
  getAllStrains,
  searchStrains,
  forceResync,
  forceResyncDataset,
  forceResyncRules
} from "nuglabs";

const blueDream = await getStrain("Blue Dream");
const allStrains = await getAllStrains();
const matches = await searchStrains("dream");
const sync = await forceResync();
await forceResyncDataset();
await forceResyncRules();
console.log(sync.dataset.changed, sync.rules.changed);
```

```ts
import { NugLabsClient } from "nuglabs";

const client = new NugLabsClient();

const strain = await client.getStrain("Blue Dream");
const strains = await client.getAllStrains();
const matches = await client.searchStrains("dream");
await client.forceResync(); // dataset + rules
await client.forceResyncDataset();
await client.forceResyncRules();
client.shutdown();
```

## Constructor Options

```ts
const client = new NugLabsClient({
  cacheInMemory: true,
  storageDir: "/tmp/nuglabs",
  useBrowserStorage: false,
  browserStorageKey: "nuglabs.dataset",
  browserStorage: window.localStorage,
  syncIntervalMs: 12 * 60 * 60 * 1000,
  fetchImpl: fetch
});
```

Sync always uses the canonical dataset URL (see `NUGLABS_STRAINS_DATASET_URL` in the package exports; matches Rust `nuglabs_core::strains_dataset_url()`).
Rules sync uses `NUGLABS_RULES_URL` (matches Rust `nuglabs_core::rules_url()`).

- `cacheInMemory`: enables the in-memory read cache
- `storageDir`: Node-only persistence directory
- `useBrowserStorage`: uses browser storage and ignores `storageDir`
- `browserStorageKey`: key used in browser storage
- `browserStorage`: custom storage adapter with `getItem()` / `setItem()`
- `syncIntervalMs`: background sync interval in milliseconds
- `fetchImpl`: custom fetch implementation for sync

## Return Shapes

- `getStrain(name)`: returns a single `Strain | null`
- `getAllStrains()`: returns `Strain[]`
- `searchStrains(query)`: returns `Strain[]`
- `forceResync()`: returns `{ dataset: NugLabsArtifactSyncResult, rules: NugLabsArtifactSyncResult }`
- `forceResyncDataset()`: returns `NugLabsArtifactSyncResult`
- `forceResyncRules()`: returns `NugLabsArtifactSyncResult`

Typical `Strain` fields include:

- `id`
- `name`
- `akas`
- `type`
- `thc`
- `description`
- plus any additional dataset fields bundled with NugLabs

```ts
import { NugLabsClient } from "nuglabs";

const client = new NugLabsClient({
  useBrowserStorage: true,
  browserStorageKey: "nuglabs.dataset"
});
```

## Behavior

- `getStrain(name)` does case-insensitive exact matching against `name` and `akas[]`
- `searchStrains(query)` does case-insensitive partial matching against `name` and `akas[]`
- `getAllStrains()` returns the full locally loaded dataset
- Reads never call the API directly
- Sync failures keep the last good local artifacts
- Rules endpoint `404` is treated as `not-modified` for backward-compatible deployments
