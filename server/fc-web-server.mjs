import { createServer } from "node:http";
import process from "node:process";
import { handler } from "./fc-handler.mjs";

const MAX_BODY_BYTES = 8 * 1024 * 1024;

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("请求体过大");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (request, response) => {
  try {
    const result = await handler({
      httpMethod: request.method,
      path: request.url?.split("?", 1)[0] || "/",
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? "" : await readBody(request),
    });
    response.writeHead(result.statusCode, result.headers);
    response.end(request.method === "HEAD" ? "" : result.body);
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    response.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(JSON.stringify({ error: { code: "SERVER_ERROR", message: statusCode === 413 ? "上传图片过大" : "识别服务暂时不可用" } }));
  }
});

const port = Number(process.env.PORT || 9000);
server.listen(port, "0.0.0.0", () => {
  console.log(`Wardrobe AI recognition service listening on ${port}`);
});
