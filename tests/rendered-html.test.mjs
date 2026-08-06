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
  assert.match(source, /今天穿什么，/);
  assert.match(source, /让衣橱帮你想/);
  assert.match(source, /今天建议穿这套/);
  assert.match(source, /为什么这样穿/);
  assert.match(source, /今天穿这套/);

  const forbiddenUiPhrases = [
    "先录几件",
    "开始录入",
    "录入",
    "最低衣橱",
    "必要品类",
    "品类",
    "比较空间",
    "类别、颜色和状态",
    "齐了就先推荐",
    "补录",
    "系统",
    "MVP",
    "Agent",
    "Schema",
    "规则 ID",
    "置信度",
    "产品北极星",
    "候选组合",
    "验收",
  ];
  for (const phrase of forbiddenUiPhrases) {
    assert.doesNotMatch(source, new RegExp(phrase), `界面中不应出现团队语言：${phrase}`);
  }
});

test("keeps unavailable clothing outside the recommendation pool", async () => {
  const source = await readFile(new URL("../app/_components/WardrobeClient.tsx", import.meta.url), "utf8");
  assert.match(source, /item\.state === "ready"/);
  assert.match(source, /item\.cleanCount \?\? 0/);
  assert.match(source, /衣橱里还没有能穿的/);
});
