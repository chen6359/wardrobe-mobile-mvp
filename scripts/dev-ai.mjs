import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const api = spawn(process.execPath, [fileURLToPath(new URL("../server/recognition-server.mjs", import.meta.url))], {
  stdio: "inherit",
});
const web = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)), "--host", "127.0.0.1"], {
  stdio: "inherit",
});

let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  api.kill("SIGTERM");
  web.kill("SIGTERM");
  setTimeout(() => process.exit(code), 100);
}

api.on("exit", (code) => {
  if (!closing) close(code || 1);
});
web.on("exit", (code) => {
  if (!closing) close(code || 1);
});
process.on("SIGINT", () => close(0));
process.on("SIGTERM", () => close(0));

