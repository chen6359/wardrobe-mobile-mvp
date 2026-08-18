import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { handler } from "../server/fc-handler.mjs";

function event({ method = "GET", path = "/health", origin = "https://chen6359.github.io", body = {} } = {}) {
  return JSON.stringify({
    rawPath: path,
    body: JSON.stringify(body),
    isBase64Encoded: false,
    headers: { origin, "x-forwarded-for": "203.0.113.10" },
    requestContext: { http: { method, path, sourceIp: "203.0.113.10" } },
  });
}

test("function health endpoint is public only to approved origins", async () => {
  const result = await handler(event());
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers["Access-Control-Allow-Origin"], "https://chen6359.github.io");
  assert.equal(JSON.parse(result.body).ok, true);

  const rejected = await handler(event({ origin: "https://example.com" }));
  assert.equal(rejected.statusCode, 403);
});

test("web server event shape preserves the request path", async () => {
  const result = await handler({
    httpMethod: "GET",
    path: "/health",
    headers: { origin: "https://chen6359.github.io" },
    body: "",
  });

  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).ok, true);
});

test("function accepts local development ports and handles preflight", async () => {
  const result = await handler(event({ method: "OPTIONS", origin: "http://127.0.0.1:5174" }));
  assert.equal(result.statusCode, 204);
  assert.equal(result.headers["Access-Control-Allow-Origin"], "http://127.0.0.1:5174");
});

test("function rejects malformed recognition requests before calling the model", async () => {
  const result = await handler(event({ method: "POST", path: "/api/recognize", body: { images: [] } }));
  assert.equal(result.statusCode, 400);
  assert.match(JSON.parse(result.body).error.message, /衣物主图/);
});

test("web function entry delegates requests to the secured handler", async () => {
  const source = await readFile(new URL("../server/fc-web-server.mjs", import.meta.url), "utf8");
  assert.match(source, /import \{ handler \} from "\.\/fc-handler\.mjs"/);
  assert.match(source, /0\.0\.0\.0/);
  assert.match(source, /process\.env\.PORT \|\| 9000/);
  assert.match(source, /MAX_BODY_BYTES/);
});
