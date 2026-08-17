#!/usr/bin/env node

import { createServer } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  validateImages,
} from "./recognition-core.mjs";
import { recognizeGarment } from "./recognition-service.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_ENV_PATH = path.join(ROOT, ".env.ai.local");
const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

function isAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

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
  if (origin && isAllowedOrigin(origin)) {
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

await loadLocalEnv();
const port = Number(process.env.AI_API_PORT || 8787);

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  if (origin && !isAllowedOrigin(origin)) {
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
    sendJson(response, 200, await recognizeGarment(images), origin);
  } catch (error) {
    const code = error?.code || "BAD_REQUEST";
    const status = code === "FREE_QUOTA_EXHAUSTED" ? 429 : code === "UPSTREAM_ERROR" ? 502 : code === "TIMEOUT" ? 504 : 400;
    sendJson(response, status, { error: { code, message: error?.message || "识别失败" } }, origin);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`衣物识别服务已启动：http://127.0.0.1:${port}`);
});
