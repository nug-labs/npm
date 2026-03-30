import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";
import { NugLabsClient } from "../src/client";
import { NUGLABS_RULES_URL, NUGLABS_STRAINS_DATASET_URL } from "../src/constants";

const clients: NugLabsClient[] = [];

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.shutdown();
  }
});

async function createClient(fetchImpl?: typeof fetch): Promise<{ client: NugLabsClient; storageDir: string }> {
  const storageDir = await mkdtemp(path.join(os.tmpdir(), "nuglabs-test-"));
  const client = new NugLabsClient({
    storageDir,
    syncIntervalMs: 24 * 60 * 60 * 1000,
    fetchImpl
  });

  clients.push(client);
  await client.initialize();
  return { client, storageDir };
}

test("getStrain matches name case-insensitively", async () => {
  const { client } = await createClient();
  const strain = await client.getStrain("blue dream");

  assert.ok(strain);
  assert.equal(strain?.name, "Blue Dream");
});

test("getStrain matches aliases exactly", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify([
        {
          name: "Blue Dream",
          akas: ["Azure Dream"]
        }
      ])
    );

  const { client } = await createClient(fetchImpl);
  await client.forceResyncDataset();

  const strain = await client.getStrain("azure dream");
  assert.ok(strain);
  assert.equal(strain?.name, "Blue Dream");
});

test("searchStrains performs case-insensitive partial search", async () => {
  const { client } = await createClient();
  const results = await client.searchStrains("dream");

  assert.ok(results.length > 0);
  assert.ok(results.some((strain) => strain.name === "Blue Dream"));
});

test("getStrain resolves Gelato #33 from compact, spaced, and hash-prefixed queries", async () => {
  const { client } = await createClient();
  const canonical = "Gelato #33";

  const fromCompact = await client.getStrain("Gelato33");
  const fromSpaced = await client.getStrain("gelato 33");
  const fromHash = await client.getStrain("gelato#33");
  const fromCanonical = await client.getStrain("Gelato #33");

  assert.ok(fromCompact, "Gelato33 should match canonical name Gelato #33");
  assert.ok(fromSpaced, "gelato 33 should normalize to the same lookup key");
  assert.ok(fromHash, "gelato#33 strips # then collapses to gelato33");
  assert.equal(fromCompact?.name, canonical);
  assert.equal(fromSpaced?.name, canonical);
  assert.equal(fromHash?.name, canonical);
  assert.equal(fromCanonical?.name, canonical);
});

test("forceResync updates persisted dataset", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url === NUGLABS_RULES_URL) {
      return new Response(
        JSON.stringify({
          version: 1,
          trim: true,
          lowercase: true,
          steps: [{ id: "collapse_whitespace", pattern: "\\s+", replace: "" }]
        })
      );
    }
    return new Response(
      JSON.stringify([
        {
          name: "Test Strain",
          akas: ["TS"]
        }
      ])
    );
  };

  const { client, storageDir } = await createClient(fetchImpl);
  const result = await client.forceResync();

  assert.equal(result.dataset.count, 1);
  assert.equal(result.rules.artifact, "rules");

  const persisted = JSON.parse(await readFile(path.join(storageDir, "dataset.json"), "utf8")) as Array<{ name: string }>;
  assert.equal(persisted[0]?.name, "Test Strain");

  const strain = await client.getStrain("ts");
  assert.ok(strain);
  assert.equal(strain?.name, "Test Strain");
});

test("useBrowserStorage persists through the configured browser adapter", async () => {
  const browserState = new Map<string, string>();
  const browserStorage = {
    getItem(key: string) {
      return browserState.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      browserState.set(key, value);
    }
  };

  const client = new NugLabsClient({
    useBrowserStorage: true,
    storageDir: "/should-be-ignored",
    browserStorage,
    browserStorageKey: "nuglabs.test.browser",
    fetchImpl: async () =>
      new Response(
        JSON.stringify([
          {
            name: "Browser Strain",
            akas: ["Front End"]
          }
        ])
      )
  });

  clients.push(client);
  await client.initialize();
  await client.forceResyncDataset();

  assert.equal(JSON.parse(browserState.get("nuglabs.test.browser") ?? "[]")[0]?.name, "Browser Strain");

  const byAlias = await client.getStrain("front end");
  assert.ok(byAlias);
  assert.equal(byAlias?.name, "Browser Strain");
});

test("forceResync uses ETag conditional requests and skips unchanged payloads", async () => {
  let datasetEtag = "dataset-v1";
  let rulesEtag = "rules-v1";
  const dataset = [{ name: "Blue Dream", akas: ["BD"] }];
  const rules = {
    version: 1,
    trim: true,
    lowercase: true,
    steps: [{ id: "collapse_whitespace", pattern: "\\s+", replace: "" }]
  };
  let seenDatasetIfNoneMatch: string | null = null;
  let seenRulesIfNoneMatch: string | null = null;

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const ifNoneMatch = new Headers(init?.headers).get("If-None-Match");
    if (url === NUGLABS_STRAINS_DATASET_URL) {
      seenDatasetIfNoneMatch = ifNoneMatch;
      if (ifNoneMatch === datasetEtag) {
        return new Response(null, { status: 304 });
      }
      return new Response(JSON.stringify(dataset), {
        status: 200,
        headers: { etag: datasetEtag, "content-type": "application/json" }
      });
    }
    if (url === NUGLABS_RULES_URL) {
      seenRulesIfNoneMatch = ifNoneMatch;
      if (ifNoneMatch === rulesEtag) {
        return new Response(null, { status: 304 });
      }
      return new Response(JSON.stringify(rules), {
        status: 200,
        headers: { etag: rulesEtag, "content-type": "application/json" }
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const { client } = await createClient(fetchImpl);
  const first = await client.forceResync();
  assert.equal(first.dataset.changed, true);
  assert.equal(first.rules.changed, true);
  assert.equal(first.dataset.etag, "dataset-v1");
  assert.equal(first.rules.etag, "rules-v1");

  const second = await client.forceResync();
  assert.equal(second.dataset.changed, false);
  assert.equal(second.rules.changed, false);
  assert.equal(seenDatasetIfNoneMatch, "dataset-v1");
  assert.equal(seenRulesIfNoneMatch, "rules-v1");
});
