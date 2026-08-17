import {
  RECOGNITION_PROMPT,
  extractJson,
  normalizeRecognition,
} from "./recognition-core.mjs";

function imageLabel(kind) {
  if (kind === "care_label") return "水洗标";
  if (kind === "hangtag") return "购买吊牌";
  return "衣物主图";
}

export async function recognizeGarment(images, {
  apiKey = process.env.DASHSCOPE_API_KEY,
  model = process.env.QWEN_VISION_MODEL || "qwen3.6-flash",
} = {}) {
  if (!apiKey) {
    const error = new Error("识别服务尚未配置");
    error.code = "API_NOT_CONFIGURED";
    throw error;
  }
  const content = [{ type: "text", text: RECOGNITION_PROMPT }];
  images.forEach((image, index) => {
    content.push({ type: "text", text: `图片 ${index + 1}：${imageLabel(image.kind)}` });
    content.push({ type: "image_url", image_url: { url: image.dataUrl } });
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65_000);
  const startedAt = performance.now();
  try {
    const upstream = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        enable_thinking: false,
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 1200,
        messages: [{ role: "user", content }],
      }),
      signal: controller.signal,
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const providerCode = payload?.error?.code || payload?.code || "UPSTREAM_ERROR";
      const error = new Error(payload?.error?.message || payload?.message || `识别请求失败（${upstream.status}）`);
      error.code = providerCode === "AllocationQuota.FreeTierOnly" ? "FREE_QUOTA_EXHAUSTED" : "UPSTREAM_ERROR";
      error.status = upstream.status;
      throw error;
    }
    const parsed = extractJson(payload?.choices?.[0]?.message?.content);
    return {
      result: normalizeRecognition(parsed, { hasLabel: images.some((item) => item.kind !== "garment") }),
      meta: {
        model,
        elapsedMs: Math.round(performance.now() - startedAt),
        usage: payload.usage || null,
      },
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("识别等待时间过长");
      timeoutError.code = "TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
