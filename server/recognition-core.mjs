import wardrobeOptions from "../shared/wardrobe-options.json" with { type: "json" };

export const CATEGORY_OPTIONS = wardrobeOptions.subtypes;
export const COLOR_OPTIONS = wardrobeOptions.colorGroups.flatMap((group) => group.options);
export const MATERIAL_OPTIONS = ["棉", "亚麻", "羊毛", "牛仔", "聚酯纤维", "皮革", "混纺"];
export const VISUAL_ONLY_MATERIALS = ["牛仔", "皮革"];
export const THICKNESS_OPTIONS = ["薄", "适中", "厚"];

const subtypePrompt = Object.entries(CATEGORY_OPTIONS)
  .map(([category, options]) => `  - ${category}: ${options.join(", ")}`)
  .join("\n");

export const RECOGNITION_PROMPT = `你是一个帮助用户整理个人衣橱的图片识别助手。请分析用户提供的衣物主图，以及可选的水洗标或购买吊牌图片，并只输出一个 JSON 对象。

必须遵守：
1. 只填写图片中能够看清或从标签文字中读到的信息；无法确认时使用 null、空字符串或空数组。
2. 普通衣物照片不能证明棉、亚麻、羊毛、聚酯纤维或混纺等纤维成分。只有标签文字清楚写明时才能填写这些材质。
3. 牛仔或皮革外观可以作为待用户确认的候选。不要判断价格、质量、是否合身，也不要决定穿搭场景。
4. 主颜色必须选择最接近的一个；如果列表中没有合适颜色，选择“其他”。
5. category、subtype、color、material、thickness 只能使用下面列出的值，不要自行创造选项。
6. labelText 只收录标签中实际可读的文字。careNotes 用简洁中文整理洗护要求。
7. 输出必须是合法 JSON，不要输出 Markdown、解释或代码围栏。

可选值：
- category: top, bottom, shoes, socks, outer
- subtype:
${subtypePrompt}
- color: ${COLOR_OPTIONS.join(", ")}
- material: 棉, 亚麻, 羊毛, 牛仔, 聚酯纤维, 皮革, 混纺
- thickness: 薄, 适中, 厚

JSON 结构：
{
  "category": "top 或 null",
  "subtype": "T恤 或 null",
  "color": "黑色 或 null",
  "material": "棉 或 null",
  "thickness": "薄 或 null",
  "size": "标签中读到的尺码或空字符串",
  "careNotes": "简洁的中文洗护提醒或空字符串",
  "labelText": "标签原文或空字符串",
  "uncertaintyNotes": ["需要用户确认的内容"]
}`;

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function limitedText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function extractJson(text) {
  if (typeof text !== "string" || !text.trim()) throw new Error("模型没有返回识别结果");
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("识别结果不是有效 JSON");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

export function normalizeRecognition(value, { hasLabel = false } = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const category = Object.hasOwn(CATEGORY_OPTIONS, source.category) ? source.category : null;
  const subtypeCandidate = stringOrNull(source.subtype);
  const subtype = category && subtypeCandidate && CATEGORY_OPTIONS[category].includes(subtypeCandidate)
    ? subtypeCandidate
    : null;
  const colorCandidate = stringOrNull(source.color);
  const color = colorCandidate && COLOR_OPTIONS.includes(colorCandidate) ? colorCandidate : null;
  const materialCandidate = stringOrNull(source.material);
  const materialAllowed = hasLabel ? MATERIAL_OPTIONS : VISUAL_ONLY_MATERIALS;
  const material = materialCandidate && materialAllowed.includes(materialCandidate) ? materialCandidate : null;
  const thicknessCandidate = stringOrNull(source.thickness);
  const thickness = thicknessCandidate && THICKNESS_OPTIONS.includes(thicknessCandidate) ? thicknessCandidate : null;
  const uncertaintyNotes = Array.isArray(source.uncertaintyNotes)
    ? source.uncertaintyNotes.filter((item) => typeof item === "string" && item.trim()).slice(0, 5).map((item) => item.trim().slice(0, 160))
    : [];

  return {
    category,
    subtype,
    color,
    material,
    thickness,
    size: hasLabel ? limitedText(source.size, 60) : "",
    careNotes: hasLabel ? limitedText(source.careNotes, 500) : "",
    labelText: hasLabel ? limitedText(source.labelText, 4000) : "",
    uncertaintyNotes,
  };
}

export function validateImages(images) {
  if (!Array.isArray(images) || images.length < 1 || images.length > 3) {
    throw new Error("请提供一张衣物主图，最多再加两张标签图");
  }
  const validKinds = new Set(["garment", "care_label", "hangtag"]);
  const normalized = images.map((item) => {
    if (!item || !validKinds.has(item.kind) || typeof item.dataUrl !== "string") {
      throw new Error("图片信息不完整");
    }
    if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(item.dataUrl)) {
      throw new Error("只支持 JPG、PNG 或 WebP 图片");
    }
    if (Buffer.byteLength(item.dataUrl, "utf8") > 3_500_000) {
      throw new Error("单张图片过大，请压缩后再试");
    }
    return { kind: item.kind, dataUrl: item.dataUrl };
  });
  if (normalized[0].kind !== "garment") throw new Error("第一张必须是衣物主图");
  return normalized;
}
