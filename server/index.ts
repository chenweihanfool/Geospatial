import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// This app is deployed under a URL subpath (BASE_PATH, e.g. "/geospatial")
// rather than domain root, since it shares its self-hosted domain with other
// apps. Apache forwards the full incoming path unstripped (no ProxyPath path
// rewriting), so every route below would otherwise need to be defined under
// that prefix. Instead, strip it here, once, so every route/middleware below
// (including third-party ones like express.static) can stay written exactly
// as if the app were served from root -- client/src/lib/basePath.ts is what
// makes the *browser* aware of the real prefix for asset URLs, routing, and
// its own fetch() calls. Empty in local dev, where the app is served from root.
const BASE_PATH = process.env.BASE_PATH || "";
if (BASE_PATH) {
  app.use((req, _res, next) => {
    if (req.url === BASE_PATH || req.url.startsWith(BASE_PATH + "/")) {
      req.url = req.url.slice(BASE_PATH.length) || "/";
    }
    next();
  });
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serves both the API and the client.
  const port = parseInt(process.env.PORT || "5000", 10);
  const listenOptions: { port: number; host: string; reusePort?: true } = {
    port,
    host: "0.0.0.0",
  };
  if (process.platform !== "win32") {
    listenOptions.reusePort = true;
  }
  server.listen(listenOptions, () => {
    log(`serving on port ${port}`);
  });
})();
