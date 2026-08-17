#!/usr/bin/env node

import { createServer } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  RECOGNITION_PROMPT,
  extractJson,
  normalizeRecognition,
  validateImages,
} from "./recognition-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_ENV_PATH = path.join(ROOT, ".env.ai.local");
const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

async function loadLocalEnv() {
  let text = "";
  try {
    text = await fs.readFile(LOCAL_ENV_PATH, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

function sendJson(response, status, payload, origin = "") {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(payload));
}

async function readRequestJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8_000_000) throw new Error("上传内容过大");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function imageLabel(kind) {
  if (kind === "care_label") return "水洗标";
  if (kind === "hangtag") return "购买吊牌";
  return "衣物主图";
}

async function recognize(images) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    const error = new Error("本机尚未配置千问密钥");
    error.code = "API_NOT_CONFIGURED";
    throw error;
  }
  const model = process.env.QWEN_VISION_MODEL || "qwen3.6-flash";
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
      const error = new Error(payload?.error?.message || payload?.message || `千问请求失败（${upstream.status}）`);
      error.code = providerCode === "AllocationQuota.FreeTierOnly" ? "FREE_QUOTA_EXHAUSTED" : "UPSTREAM_ERROR";
      error.status = upstream.status;
      throw error;
    }
    const raw = payload?.choices?.[0]?.message?.content;
    const parsed = extractJson(raw);
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

await loadLocalEnv();
const port = Number(process.env.AI_API_PORT || 8787);

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    sendJson(response, 403, { error: { code: "ORIGIN_NOT_ALLOWED", message: "当前网页不能调用本机识别服务" } });
    return;
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    });
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true, configured: Boolean(process.env.DASHSCOPE_API_KEY) }, origin);
    return;
  }
  if (request.method !== "POST" || request.url !== "/api/recognize") {
    sendJson(response, 404, { error: { code: "NOT_FOUND", message: "页面不存在" } }, origin);
    return;
  }

  try {
    const body = await readRequestJson(request);
    const images = validateImages(body?.images);
    sendJson(response, 200, await recognize(images), origin);
  } catch (error) {
    const code = error?.code || "BAD_REQUEST";
    const status = code === "FREE_QUOTA_EXHAUSTED" ? 429 : code === "UPSTREAM_ERROR" ? 502 : code === "TIMEOUT" ? 504 : 400;
    sendJson(response, status, { error: { code, message: error?.message || "识别失败" } }, origin);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`衣物识别服务已启动：http://127.0.0.1:${port}`);
});

