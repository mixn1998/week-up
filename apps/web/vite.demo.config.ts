import { defineConfig } from "vite";

const CANONICAL_HOST = "127.0.0.1";
const CANONICAL_PORT = 4173;

function canonicalEntry() {
  const middleware = () => (request: { headers: { host?: string }; url?: string }, response: { statusCode: number; setHeader(name: string, value: string): void; end(): void }, next: () => void) => {
    const hostname = request.headers.host?.split(":")[0]?.toLowerCase();
    if (hostname === "localhost") {
      response.statusCode = 307;
      response.setHeader("Location", `http://${CANONICAL_HOST}:${CANONICAL_PORT}${request.url ?? "/"}`);
      response.setHeader("Cache-Control", "no-store");
      response.end();
      return;
    }
    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    next();
  };
  return {
    name: "week-up-canonical-entry",
    configureServer(server: { middlewares: { use(handler: ReturnType<typeof middleware>): void } }) { server.middlewares.use(middleware()); },
    configurePreviewServer(server: { middlewares: { use(handler: ReturnType<typeof middleware>): void } }) { server.middlewares.use(middleware()); },
  };
}

export default defineConfig({
  plugins: [canonicalEntry()],
  server: {
    host: "127.0.0.1",
    port: CANONICAL_PORT,
    strictPort: true,
    proxy: {
      "/learning-more-api": {
        target: "http://127.0.0.1:43120",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/learning-more-api/, ""),
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: CANONICAL_PORT,
    strictPort: true,
  },
  build: {
    outDir: "demo-dist",
    emptyOutDir: true,
  },
});
