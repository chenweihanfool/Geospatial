// This app is deployed under a URL subpath (e.g. https://host/geospatial) rather
// than domain root, since it shares its self-hosted domain with other apps.
// VITE_BASE_PATH is set at build time (see vite.config.ts's `base` option, which
// must stay in sync with this) and is empty for local dev, where the app is
// served from root.
export const BASE_PATH = (import.meta.env.VITE_BASE_PATH as string | undefined) ?? "";

// Prefixes a root-relative path (e.g. "/api/survey-points") with BASE_PATH.
// Leaves already-absolute (http://...) or relative paths untouched.
export function withBasePath(path: string): string {
  return path.startsWith("/") ? BASE_PATH + path : path;
}
