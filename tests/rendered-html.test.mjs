import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders all four first-phase routes", async () => {
  for (const pathname of ["/", "/start", "/wardrobe/add", "/wardrobe/ready", "/today"]) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  }
});

test("uses the approved product language without internal product copy", async () => {
  const source = await readFile(new URL("../app/_components/WardrobeClient.tsx", import.meta.url), "utf8");
  assert.match(source, /今天建议穿这套/);
  assert.match(source, /为什么这样穿/);
  assert.match(source, /今天穿这套/);
  assert.match(source, /只使用你真实拥有/);
  assert.doesNotMatch(source, />[^<]*(?:MVP|Agent|Schema|规则 ID|置信度分数)[^<]*</i);
});

test("keeps unavailable clothing outside the recommendation pool", async () => {
  const source = await readFile(new URL("../app/_components/WardrobeClient.tsx", import.meta.url), "utf8");
  assert.match(source, /item\.state === "ready"/);
  assert.match(source, /item\.cleanCount \?\? 0/);
  assert.match(source, /我不会用不存在或正在洗的衣物补位/);
});
