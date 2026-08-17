import { validateImages } from "./recognition-core.mjs";
import { recognizeGarment } from "./recognition-service.mjs";

const ALLOWED_ORIGINS = new Set([
  "https://chen6359.github.io",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);
const WINDOW_MS = 30 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 12;
const buckets = new Map();

function isAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

function response(statusCode, body, origin = "") {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return { statusCode, headers, body: JSON.stringify(body) };
}

function readEvent(event) {
  const value = typeof event === "string" ? JSON.parse(event) : event;
  const headers = Object.fromEntries(Object.entries(value?.headers || {}).map(([key, item]) => [key.toLowerCase(), item]));
  const bodyText = value?.isBase64Encoded
    ? Buffer.from(value.body || "", "base64").toString("utf8")
    : value?.body || "{}";
  if (Buffer.byteLength(bodyText, "utf8") > 8_000_000) throw new Error("上传内容过大");
  return {
    method: value?.requestContext?.http?.method || value?.httpMethod || "GET",
    path: value?.rawPath || value?.requestContext?.http?.path || "/",
    origin: headers.origin || "",
    forwardedFor: headers["x-forwarded-for"] || value?.requestContext?.http?.sourceIp || "unknown",
    body: JSON.parse(bodyText),
  };
}

function allowRequest(key) {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || now - existing.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  existing.count += 1;
  return existing.count <= MAX_REQUESTS_PER_WINDOW;
}

export async function handler(event) {
  let request;
  try {
    request = readEvent(event);
  } catch (error) {
    return response(400, { error: { code: "BAD_REQUEST", message: error?.message || "请求内容无法读取" } });
  }
  const { method, path, origin } = request;
  if (origin && !isAllowedOrigin(origin)) {
    return response(403, { error: { code: "ORIGIN_NOT_ALLOWED", message: "当前网页不能使用识别服务" } });
  }
  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
      body: "",
    };
  }
  if (method === "GET" && path.endsWith("/health")) {
    return response(200, { ok: true, configured: Boolean(process.env.DASHSCOPE_API_KEY) }, origin);
  }
  if (method !== "POST" || !path.endsWith("/api/recognize")) {
    return response(404, { error: { code: "NOT_FOUND", message: "页面不存在" } }, origin);
  }
  const requester = String(request.forwardedFor).split(",")[0].trim();
  if (!allowRequest(requester)) {
    return response(429, { error: { code: "RATE_LIMITED", message: "今天识别得有点多，请稍后再试" } }, origin);
  }

  try {
    const images = validateImages(request.body?.images);
    return response(200, await recognizeGarment(images), origin);
  } catch (error) {
    const code = error?.code || "BAD_REQUEST";
    const status = code === "FREE_QUOTA_EXHAUSTED" || code === "RATE_LIMITED"
      ? 429
      : code === "UPSTREAM_ERROR"
        ? 502
        : code === "TIMEOUT"
          ? 504
          : 400;
    return response(status, { error: { code, message: error?.message || "识别失败" } }, origin);
  }
}
