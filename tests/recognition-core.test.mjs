import assert from "node:assert/strict";
import test from "node:test";
import {
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
    material: "棉",
    thickness: "薄",
    size: "L",
    careNotes: "不可烘干",
    labelText: "100% COTTON",
    uncertaintyNotes: ["请确认"],
  }, { hasLabel: true });
  assert.equal(result.category, "top");
  assert.equal(result.subtype, "T恤");
  assert.equal(result.material, "棉");
  assert.equal(result.size, "L");
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
});

test("requires the garment image first and rejects unsupported payloads", () => {
  const image = "data:image/jpeg;base64,ZmFrZQ==";
  assert.deepEqual(validateImages([{ kind: "garment", dataUrl: image }]), [{ kind: "garment", dataUrl: image }]);
  assert.throws(() => validateImages([{ kind: "care_label", dataUrl: image }]), /第一张必须是衣物主图/);
  assert.throws(() => validateImages([{ kind: "garment", dataUrl: "https://example.com/a.jpg" }]), /只支持/);
});

