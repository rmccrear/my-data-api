import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import worker from "../src/index.js";
import { filterRecords, parseCsv } from "../src/datasets.js";

const root = resolve(import.meta.dirname, "..");
const env = {
  ASSETS: {
    async fetch(input) {
      const url = new URL(input.url ?? input);
      try {
        const body = await readFile(resolve(root, url.pathname.slice(1)));
        return new Response(body, { status: 200 });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    },
  },
};

test("CSV parsing supports quoted commas and empty values", () => {
  const records = parseCsv('name,tags,note\nAda,"math, code",\n');
  assert.deepEqual(records, [{ name: "Ada", tags: "math, code", note: "" }]);
});

test("record filtering searches every field and paginates", () => {
  const records = [
    { artist: "Dolly Parton", song: "Jolene" },
    { artist: "Dolly Parton", song: "9 to 5" },
    { artist: "Prince", song: "1999" },
  ];
  const result = filterRecords(records, { search: "dolly", limit: 1, offset: 1 });
  assert.equal(result.total, 2);
  assert.deepEqual(result.records, [{ artist: "Dolly Parton", song: "9 to 5" }]);
});

test("lists configured datasets", async () => {
  const response = await worker.fetch(new Request("https://example.com/api/v1/datasets"), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.datasets.map(({ id }) => id), ["cats", "board-games", "viral-50-usa"]);
});

test("returns searched dataset records", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/v1/datasets/viral-50-usa/records?search=Dolly&limit=2&offset=1"),
    env,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.dataset, "viral-50-usa");
  assert.equal(body.count, 2);
  assert.match(body.records[0].Artist, /Dolly Parton/);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
});

test("returns a useful unknown dataset error", async () => {
  const response = await worker.fetch(new Request("https://example.com/api/v1/datasets/nope/records"), env);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "dataset_not_found");
});

test("chat works in mock mode without an AI binding", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/v1/datasets/viral-50-usa/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Which Dolly Parton songs appear?" }),
    }),
    env,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, "mock");
  assert.equal(body.tool_calls[0].tool, "query_dataset");
  assert.match(body.response, /Dolly/i);
});
