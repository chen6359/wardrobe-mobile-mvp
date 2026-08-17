import assert from "node:assert/strict";
import test from "node:test";
import {
  CATEGORY_OPTIONS,
  COLOR_OPTIONS,
  RECOGNITION_PROMPT,
  extractJson,
  normalizeRecognition,
  validateImages,
} from "../server/recognition-core.mjs";

test("extracts JSON even when a provider wraps it in a code fence", () => {
  assert.deepEqual(extractJson('```json\n{"category":"top"}\n```'), { category: "top" });
});

test("keeps only form-supported values", () => {
  const result = normalizeRecognition({
    category: "top",
    subtype: "T恤",
    color: "白色",
    materials: ["棉", "氨纶"],
    pattern: "纯色",
    thickness: "薄",
    size: "L",
    careNotes: "不可烘干",
    labelText: "100% COTTON",
    uncertaintyNotes: ["请确认"],
  }, { hasLabel: true });
  assert.equal(result.category, "top");
  assert.equal(result.subtype, "T恤");
  assert.equal(result.material, "混纺");
  assert.deepEqual(result.materials, ["棉", "氨纶"]);
  assert.equal(result.pattern, "纯色");
  assert.equal(result.size, "L");
});

test("supports the expanded garment and color dictionaries", () => {
  assert.ok(CATEGORY_OPTIONS.top.includes("连帽卫衣"));
  assert.ok(CATEGORY_OPTIONS.bottom.includes("工装裤"));
  assert.ok(CATEGORY_OPTIONS.shoes.includes("乐福鞋"));
  assert.ok(CATEGORY_OPTIONS.socks.includes("隐形袜"));
  assert.ok(CATEGORY_OPTIONS.outer.includes("冲锋衣"));
  assert.ok(COLOR_OPTIONS.includes("米白"));
  assert.ok(COLOR_OPTIONS.includes("牛仔蓝"));
  assert.ok(COLOR_OPTIONS.includes("橄榄绿"));
  assert.ok(COLOR_OPTIONS.length >= 40);
  assert.match(RECOGNITION_PROMPT, /莱赛尔/);
  assert.match(RECOGNITION_PROMPT, /千鸟格/);
  assert.match(RECOGNITION_PROMPT, /连帽卫衣/);
  assert.match(RECOGNITION_PROMPT, /牛仔蓝/);

  const result = normalizeRecognition({
    category: "outer",
    subtype: "冲锋衣",
    color: "橄榄绿",
  });
  assert.equal(result.subtype, "冲锋衣");
  assert.equal(result.color, "橄榄绿");
});

test("does not infer fiber content from a garment photo without a label", () => {
  const result = normalizeRecognition({
    category: "bottom",
    subtype: "牛仔裤",
    color: "蓝色",
    material: "棉",
    thickness: "适中",
    size: "32",
  }, { hasLabel: false });
  assert.equal(result.material, null);
  assert.equal(result.size, "");
  assert.equal(result.labelText, "");
});

test("allows visible denim as a correctable material candidate", () => {
  const result = normalizeRecognition({ category: "bottom", subtype: "牛仔裤", material: "牛仔" });
  assert.equal(result.material, "牛仔");
  assert.deepEqual(result.materials, ["牛仔"]);
});

test("requires the garment image first and rejects unsupported payloads", () => {
  const image = "data:image/jpeg;base64,ZmFrZQ==";
  assert.deepEqual(validateImages([{ kind: "garment", dataUrl: image }]), [{ kind: "garment", dataUrl: image }]);
  assert.throws(() => validateImages([{ kind: "care_label", dataUrl: image }]), /第一张必须是衣物主图/);
  assert.throws(() => validateImages([{ kind: "garment", dataUrl: "https://example.com/a.jpg" }]), /只支持/);
});
