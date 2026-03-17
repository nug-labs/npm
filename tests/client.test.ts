import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";
import { NugLabsClient } from "../src/client";

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
  await client.forceResync();

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

test("forceResync updates persisted dataset", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify([
        {
          name: "Test Strain",
          akas: ["TS"]
        }
      ])
    );

  const { client, storageDir } = await createClient(fetchImpl);
  const result = await client.forceResync();

  assert.equal(result.count, 1);

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
  await client.forceResync();

  assert.equal(JSON.parse(browserState.get("nuglabs.test.browser") ?? "[]")[0]?.name, "Browser Strain");

  const byAlias = await client.getStrain("front end");
  assert.ok(byAlias);
  assert.equal(byAlias?.name, "Browser Strain");
});
