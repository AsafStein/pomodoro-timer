import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../out/", import.meta.url));
const port = Number(process.env.PORT || 43123);
const host = "127.0.0.1";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function contentType(filePath, urlPath) {
  if (urlPath === "/icon" || urlPath === "/apple-icon") return "image/png";
  return types[extname(filePath)] ?? "application/octet-stream";
}

function insideRoot(filePath) {
  const base = root.endsWith(sep) ? root : `${root}${sep}`;
  const normalized = normalize(filePath);
  return normalized === base.slice(0, -1) || normalized.startsWith(base);
}

async function resolveFile(urlPath) {
  const relative = urlPath.replace(/^\/+/, "");
  const candidate = join(root, relative);
  if (!insideRoot(candidate)) return null;

  try {
    const info = await stat(candidate);
    if (info.isDirectory()) {
      const index = join(candidate, "index.html");
      await access(index);
      return index;
    }
    return candidate;
  } catch {
    if (!extname(candidate)) {
      const html = `${candidate}.html`;
      try {
        await access(html);
        return html;
      } catch {
        return null;
      }
    }
    return null;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}`);
  const urlPath = decodeURIComponent(url.pathname);
  if (urlPath.includes("\0")) {
    response.writeHead(400).end();
    return;
  }

  const file = (await resolveFile(urlPath)) ?? join(root, "404.html");
  if (!insideRoot(file)) {
    response.writeHead(403).end();
    return;
  }

  const missing = file.endsWith(`${sep}404.html`) && urlPath !== "/404.html";
  const headers = {
    "Content-Type": contentType(file, urlPath),
    "Cache-Control": "no-cache",
  };
  response.writeHead(missing ? 404 : 200, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
});

try {
  await access(root);
} catch {
  console.error("Missing out/. Run npm run build first.");
  process.exit(1);
}

server.listen(port, host, () => {
  console.log(`Serving out/ at http://${host}:${port}`);
});
