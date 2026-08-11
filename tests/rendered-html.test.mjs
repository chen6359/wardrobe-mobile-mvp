import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

test("builds a self-contained static entry for GitHub Pages", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const assets = await readdir(new URL("../dist/assets/", import.meta.url));
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /\.\/assets\/.+\.js/);
  assert.match(html, /\.\/assets\/.+\.css/);
  assert.ok(assets.some((file) => file.endsWith(".js")));
  assert.ok(assets.some((file) => file.endsWith(".css")));
});

test("keeps the full wardrobe loop behind share-safe hash routes", async () => {
  const source = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
  for (const pathname of [
    "/",
    "/start",
    "/wardrobe/add",
    "/wardrobe/ready",
    "/wear/status",
    "/wardrobe/laundry",
    "/wardrobe",
    "/purchase",
    "/today",
  ]) {
    assert.match(source, new RegExp(`"${pathname.replaceAll("/", "\\/")}"`), pathname);
  }
  assert.match(source, /hashchange/);
});

test("uses the approved product language without internal product copy", async () => {
  const source = await readFile(new URL("../src/WardrobeClient.tsx", import.meta.url), "utf8");
  assert.match(source, /今天穿什么，/);
  assert.match(source, /让衣橱帮你想/);
  assert.match(source, /今天建议穿这套/);
  assert.match(source, /为什么这样穿/);
  assert.match(source, /今天穿这套/);
  assert.match(source, /这套穿完了，整理一下/);
  assert.match(source, /挂回衣架/);
  assert.match(source, /放进脏衣篓/);
  assert.match(source, /洗净并晾干，放回衣架/);

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
    "维修中",
    "需求说明",
    "数据不足",
    "数据门槛",
    "判断逻辑",
    "反馈记录",
    "个性化",
    "推荐池",
    "衣橱判断",
    "暂时不替你判断",
    "参与推荐",
  ];
  for (const phrase of forbiddenUiPhrases) {
    assert.doesNotMatch(source, new RegExp(phrase), `界面中不应出现团队语言：${phrase}`);
  }
});

test("keeps unavailable clothing outside the recommendation pool", async () => {
  const source = await readFile(new URL("../src/WardrobeClient.tsx", import.meta.url), "utf8");
  assert.match(source, /item\.state === "ready"/);
  assert.match(source, /item\.cleanCount \?\? 0/);
  assert.match(source, /衣橱里还没有能穿的/);
  assert.match(source, /applyWearPlacements/);
  assert.match(source, /state: "laundry"/);
  assert.match(source, /restoreCleanGarments/);
  assert.match(source, /needsSorting: false/);
});

test("uses explicit real city selection and optional device location", async () => {
  const source = await readFile(new URL("../src/WardrobeClient.tsx", import.meta.url), "utf8");
  assert.match(source, /geocoding-api\.open-meteo\.com\/v1\/search/);
  assert.match(source, /count: "6"/);
  assert.match(source, /trimmed\.endsWith\("市"\)/);
  assert.match(source, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(source, /请从搜索结果里选中一个城市/);
});

test("reads one or two garment labels and keeps the result correctable", async () => {
  const source = await readFile(new URL("../src/WardrobeClient.tsx", import.meta.url), "utf8");
  assert.match(source, /import\("tesseract\.js"\)/);
  assert.match(source, /careLabelPhoto/);
  assert.match(source, /hangtagPhoto/);
  assert.match(source, /上传一张或两张都可以/);
  assert.match(source, /不准确的地方可以直接改/);
  assert.match(source, /item\.careNotes/);
});

test("keeps recent scenes dynamic and filters the wardrobe by category", async () => {
  const source = await readFile(new URL("../src/WardrobeClient.tsx", import.meta.url), "utf8");
  assert.match(source, /recentScenes: \[next, \.\.\.previous\.recentScenes/);
  assert.match(source, /全部场景/);
  assert.match(source, /已按\$\{sceneLabels\[next\]\}更新今天的搭配/);
  assert.match(source, /visibleItems = data\.garments\.filter/);
  assert.match(source, /data-garment-category/);
  assert.match(source, /保存修改/);
});

test("learns from lightweight recommendation feedback", async () => {
  const source = await readFile(new URL("../src/WardrobeClient.tsx", import.meta.url), "utf8");
  assert.match(source, /feedbackHistory/);
  assert.match(source, /preferenceAdjustment/);
  assert.match(source, /action: "adopted"/);
  assert.match(source, /addFeedback\("swapped"\)/);
  assert.match(source, /addFeedback\("skipped", reason\)/);
  assert.match(source, /这套不合适/);
  assert.match(source, /颜色不喜欢/);
  assert.match(source, /穿着不舒服/);
});

test("keeps garment entry continuous without forcing a page change", async () => {
  const source = await readFile(new URL("../src/WardrobeClient.tsx", import.meta.url), "utf8");
  assert.match(source, /nextUsefulCategory/);
  assert.match(source, /继续拍同类/);
  assert.match(source, /刚才选过的信息会继续保留/);
  assert.doesNotMatch(source, /if \(readiness\(nextGarments\)\.ready\) \{\s*navigate\("\/wardrobe\/ready"\)/);
});

test("provides a real pre-purchase comparison with an honest data threshold", async () => {
  const source = await readFile(new URL("../src/WardrobeClient.tsx", import.meta.url), "utf8");
  assert.match(source, /analyzePurchase/);
  assert.match(source, /garments\.length < 15/);
  assert.match(source, /item\.state !== "paused"/);
  assert.match(source, /建议先不买/);
  assert.match(source, /值得考虑/);
  assert.match(source, /等你再添几件常穿的衣服/);
  assert.match(source, /买了，放进衣橱/);
  assert.match(source, /下单前，记得再确认尺码、上身效果和价格/);
});
