# NugLabs JavaScript SDK

Local-first SDK for `https://strains.nuglabs.co`.

## Design

- Ships with a bundled `src/dataset.json`
- Loads bundled data on startup
- Uses persisted local data if a newer synced copy exists
- Performs all reads and searches against local data only
- Auto-syncs from the API every 12 hours
- Supports manual `forceResync()`
- Supports browser persistence with `useBrowserStorage: true`
- Falls back to memory-only mode if disk writes are not permitted

## Install

```bash
npm install nuglabs
```

## Usage

```ts
import { getStrain, getAllStrains, searchStrains, forceResync } from "nuglabs";

const blueDream = await getStrain("Blue Dream");
const allStrains = await getAllStrains();
const matches = await searchStrains("dream");
await forceResync();
```

```ts
import { NugLabsClient } from "nuglabs";

const client = new NugLabsClient();

const strain = await client.getStrain("Blue Dream");
const strains = await client.getAllStrains();
const matches = await client.searchStrains("dream");
await client.forceResync();
client.shutdown();
```

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
- Sync failures keep the last good local dataset
