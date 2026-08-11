import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/outfit-engine.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const engine = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const defaults = {
  top: { subtype: "T恤" },
  bottom: { subtype: "休闲裤" },
  shoes: { subtype: "运动鞋" },
  socks: { subtype: "短袜", totalCount: 3, cleanCount: 3 },
  outer: { subtype: "夹克" },
};

function garment(id, category, overrides = {}) {
  return {
    id,
    category,
    color: "黑色",
    state: "ready",
    photo: "data:image/png;base64,demo",
    material: "不知道",
    thickness: "不知道",
    size: "",
    careNotes: "",
    labelText: "",
    careLabelPhoto: "",
    hangtagPhoto: "",
    scenes: [],
    createdAt: "2026-08-11T00:00:00.000Z",
    ...defaults[category],
    ...overrides,
  };
}

const warmWeather = { apparentTemperature: 30, rainProbability: 10 };

test("chooses a coordinated complete outfit instead of independent item winners", () => {
  const redTop = garment("a-red-top", "top", { color: "红色" });
  const blackTop = garment("z-black-top", "top");
  const blueSocks = garment("a-blue-socks", "socks", { color: "蓝色" });
  const blackSocks = garment("z-black-socks", "socks");
  const garments = [
    redTop,
    blackTop,
    garment("bottom", "bottom"),
    garment("shoes", "shoes"),
    blueSocks,
    blackSocks,
  ];

  assert.equal(engine.scoreItem(redTop, "casual", 30), engine.scoreItem(blackTop, "casual", 30));
  assert.equal(engine.scoreItem(blueSocks, "casual", 30), engine.scoreItem(blackSocks, "casual", 30));

  const outfit = engine.buildOutfit(garments, "casual", warmWeather, {}, []);
  assert.equal(outfit.items.find((item) => item.category === "top").id, blackTop.id);
  assert.equal(outfit.items.find((item) => item.category === "socks").id, blackSocks.id);
});

test("keeps the only available shoe and explains the compromise", () => {
  const garments = [
    garment("top", "top"),
    garment("bottom", "bottom", { subtype: "运动裤" }),
    garment("only-shoe", "shoes", { subtype: "休闲鞋", color: "棕色" }),
    garment("socks", "socks"),
  ];
  const outfit = engine.buildOutfit(garments, "gym", warmWeather, {}, []);

  assert.equal(outfit.items.find((item) => item.category === "shoes").id, "only-shoe");
  assert.match(outfit.limitation, /仍选了现有鞋中相对合适的一双/);
});

test("never recommends laundry or paused garments", () => {
  const garments = [
    garment("ready-top", "top"),
    garment("laundry-shirt", "top", { subtype: "长袖衬衫", state: "laundry", scenes: ["meeting"] }),
    garment("paused-polo", "top", { subtype: "Polo", state: "paused", scenes: ["meeting"] }),
    garment("bottom", "bottom"),
    garment("shoes", "shoes"),
    garment("socks", "socks"),
  ];
  const outfit = engine.buildOutfit(garments, "meeting", warmWeather, {}, []);

  assert.equal(outfit.items.find((item) => item.category === "top").id, "ready-top");
  assert.ok(outfit.items.every((item) => item.state === "ready"));
});

test("does not invent temperature suitability when material and thickness are unknown", () => {
  const outfit = engine.buildOutfit([
    garment("top", "top"),
    garment("bottom", "bottom"),
    garment("shoes", "shoes"),
    garment("socks", "socks"),
  ], "work", { apparentTemperature: 35, rainProbability: 0 }, {}, []);

  assert.match(outfit.reasons[1], /材质和厚度尚未确认/);
  assert.doesNotMatch(outfit.reasons[1], /更适合/);
});

test("explains the actual shoe and sock color relationship", () => {
  const outfit = engine.buildOutfit([
    garment("top", "top"),
    garment("bottom", "bottom"),
    garment("shoes", "shoes"),
    garment("socks", "socks"),
  ], "casual", warmWeather, {}, []);

  assert.match(outfit.reasons[2], /黑色袜子和黑色运动鞋同色/);
  assert.match(outfit.reasons[2], /全黑搭配不会杂乱/);
});

test("changes one garment and recalculates the rest of the outfit", () => {
  const garments = [
    garment("black-top", "top"),
    garment("white-top", "top", { color: "白色" }),
    garment("bottom", "bottom"),
    garment("shoes", "shoes"),
    garment("socks", "socks"),
  ];
  const current = engine.buildOutfit(garments, "casual", warmWeather, {}, []);
  const swap = engine.findBestSingleSwap(garments, current, "casual", warmWeather, []);

  assert.equal(swap.category, "top");
  assert.equal(swap.garmentId, "white-top");
  assert.equal(swap.outfit.items.find((item) => item.category === "top").id, "white-top");
});
