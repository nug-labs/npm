import type { BrowserStorageAdapter, NugLabsClientOptions, Strain, StrainDataset } from "./types";

/**
 * Validates that an unknown value looks like a strain record.
 *
 * @param value Candidate record to inspect.
 * @returns `true` when the value has the minimum supported strain shape.
 */
function isStrainRecord(value: unknown): value is Strain {
  return Boolean(value) && typeof value === "object" && typeof (value as Strain).name === "string";
}

/**
 * Parses and validates a serialized dataset payload.
 *
 * @param raw Serialized JSON payload.
 * @returns Parsed strain dataset.
 * @throws When the payload is not a valid strain array.
 */
function parseDataset(raw: string): StrainDataset {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || !parsed.every(isStrainRecord)) {
    throw new Error("Invalid strain dataset");
  }

  return parsed;
}

function getBundledDatasetUrl(): URL {
  // `src/dataset.json` is shipped as a package asset (not bundled into JS).
  // `dist/src/store.js` lives two levels deeper than `src/dataset.json`.
  return new URL("../../src/dataset.json", import.meta.url);
}

async function loadBundledDataset(): Promise<StrainDataset> {
  const url = getBundledDatasetUrl();

  if (typeof (globalThis as { fetch?: unknown }).fetch === "function") {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load bundled dataset (${response.status} ${response.statusText})`);
    }

    const text = await response.text();
    return parseDataset(text);
  }

  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const raw = await readFile(fileURLToPath(url), "utf8");
  return parseDataset(raw);
}

function getGlobalBrowserStorage(): BrowserStorageAdapter | null {
  const candidate = globalThis.localStorage as BrowserStorageAdapter | undefined;
  if (!candidate || typeof candidate.getItem !== "function" || typeof candidate.setItem !== "function") {
    return null;
  }

  return candidate;
}

async function resolveDefaultStorageDir(): Promise<string> {
  const os = await import("node:os");
  const path = await import("node:path");
  return path.join(os.tmpdir(), "nuglabs");
}

/**
 * Handles local persistence for the bundled dataset plus any refreshed overrides.
 */
export class LocalStore {
  private readonly storageDir?: string;
  private readonly cacheInMemory: boolean;
  private readonly useBrowserStorage: boolean;
  private readonly browserStorageKey: string;
  private readonly browserStorage: BrowserStorageAdapter | null;
  private bundledDataset: StrainDataset | null = null;
  private memoryDataset: StrainDataset | null;
  private writeEnabled = true;
  private storageFile: string | null = null;

  /**
   * Creates a new local store.
   *
   * @param options Store and sync options passed from the client.
   */
  constructor(options: NugLabsClientOptions = {}) {
    this.storageDir = options.storageDir;
    this.cacheInMemory = options.cacheInMemory ?? true;
    this.useBrowserStorage = options.useBrowserStorage ?? false;
    this.browserStorageKey = options.browserStorageKey ?? "nuglabs.dataset";
    this.browserStorage = options.browserStorage ?? getGlobalBrowserStorage();
    this.memoryDataset = null;
  }

  /**
   * Loads the best available dataset into memory.
   */
  async initialize(): Promise<void> {
    const persistedDataset = await this.readPersistedOverride();
    if (persistedDataset) {
      this.setMemoryDataset(persistedDataset);
      return;
    }

    const bundled = await this.getBundledDataset();
    this.setMemoryDataset(bundled);
  }

  /**
   * Returns the current dataset from memory or persistence.
   */
  async getDataset(): Promise<StrainDataset> {
    if (this.cacheInMemory && this.memoryDataset) {
      return [...this.memoryDataset];
    }

    const persistedDataset = await this.readPersistedOverride();
    if (persistedDataset) {
      return [...persistedDataset];
    }

    const bundled = await this.getBundledDataset();
    return [...bundled];
  }

  /**
   * Replaces the active dataset and persists it when possible.
   *
   * @param dataset Dataset to persist and optionally cache.
   */
  async replaceDataset(dataset: StrainDataset): Promise<void> {
    await this.persist(dataset);
    this.setMemoryDataset(dataset);
  }

  /**
   * Persists the dataset to the selected storage backend.
   *
   * @param dataset Dataset to serialize locally.
   */
  async persist(dataset: StrainDataset): Promise<void> {
    if (this.useBrowserStorage) {
      this.persistToBrowserStorage(dataset);
      return;
    }

    try {
      const storageDir = this.storageDir ?? await resolveDefaultStorageDir();
      const path = await import("node:path");
      const fs = await import("node:fs/promises");
      const storageFile = path.join(storageDir, "dataset.json");

      await fs.mkdir(storageDir, { recursive: true });
      await fs.writeFile(storageFile, JSON.stringify(dataset), "utf8");
      this.storageFile = storageFile;
      this.writeEnabled = true;
    } catch {
      this.writeEnabled = false;
    }
  }

  /**
   * Indicates whether the in-memory read cache is enabled.
   */
  isMemoryCacheEnabled(): boolean {
    return this.cacheInMemory;
  }

  /**
   * Returns the active persistence target.
   */
  getPersistencePath(): string {
    if (this.useBrowserStorage) {
      return this.browserStorageKey;
    }

    return this.storageFile ?? this.storageDir ?? "memory-only";
  }

  /**
   * Indicates whether the most recent persist attempt succeeded.
   */
  canPersist(): boolean {
    return this.writeEnabled;
  }

  /**
   * Reads the best available persisted override for the current runtime.
   */
  private async readPersistedOverride(): Promise<StrainDataset | null> {
    if (this.useBrowserStorage) {
      return this.readBrowserOverride();
    }

    return this.readDiskOverride();
  }

  /**
   * Reads a browser-stored override from `localStorage` or a custom adapter.
   */
  private readBrowserOverride(): StrainDataset | null {
    try {
      const raw = this.browserStorage?.getItem(this.browserStorageKey);
      if (!raw) {
        return null;
      }

      return parseDataset(raw);
    } catch {
      return null;
    }
  }

  /**
   * Persists the dataset to browser storage.
   *
   * @param dataset Dataset to serialize.
   */
  private persistToBrowserStorage(dataset: StrainDataset): void {
    try {
      this.browserStorage?.setItem(this.browserStorageKey, JSON.stringify(dataset));
      this.writeEnabled = Boolean(this.browserStorage);
    } catch {
      this.writeEnabled = false;
    }
  }

  /**
   * Reads a Node.js filesystem override from disk.
   */
  private async readDiskOverride(): Promise<StrainDataset | null> {
    try {
      const storageDir = this.storageDir ?? await resolveDefaultStorageDir();
      const path = await import("node:path");
      const fs = await import("node:fs/promises");
      const storageFile = path.join(storageDir, "dataset.json");
      const raw = await fs.readFile(storageFile, "utf8");
      this.storageFile = storageFile;
      return parseDataset(raw);
    } catch {
      return null;
    }
  }

  /**
   * Updates the in-memory cache when it is enabled.
   *
   * @param dataset Dataset to copy into memory.
   */
  private setMemoryDataset(dataset: StrainDataset): void {
    if (this.cacheInMemory) {
      this.memoryDataset = [...dataset];
    }
  }

  private async getBundledDataset(): Promise<StrainDataset> {
    this.bundledDataset ??= await loadBundledDataset();
    return this.bundledDataset;
  }
}
