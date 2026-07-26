import { createRoot } from "react-dom/client";
import App from "./App";
import { BASE_PATH } from "./lib/basePath";
import "./index.css";

// This app is deployed under a URL subpath (see lib/basePath.ts). Rather than
// hunting down every root-relative fetch("/api/...") call scattered across
// the codebase, patch window.fetch once here so every request gets BASE_PATH
// prefixed automatically, regardless of which call site issued it.
if (BASE_PATH) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === "string" && input.startsWith("/") && !input.startsWith(BASE_PATH + "/")) {
      input = BASE_PATH + input;
    }
    return originalFetch(input, init);
  };
}

createRoot(document.getElementById("root")!).render(<App />);
