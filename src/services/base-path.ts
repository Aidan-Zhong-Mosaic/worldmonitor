/**
 * Serving the app under a sub-path (e.g. https://chat.example.com/worldmonitor/).
 *
 * Vite's `base` (VITE_BASE_PATH) already prefixes the bundle's own assets and chunks. The app also
 * makes several hundred requests to absolute same-origin paths (`/api/...`, `/data/...`,
 * `/build-hash.txt`), which would land on whatever else lives at the host root. This patch adds the
 * prefix to those requests. The reverse proxy in front strips it again before the request reaches the
 * container, which keeps serving at `/`.
 *
 * With the default base ('/') nothing is installed, so every other deployment is unchanged.
 */

const rawBase = (import.meta.env.BASE_URL || '/') as string;
/** '' when served at the root, otherwise '/worldmonitor' (no trailing slash). */
export const BASE_PATH = rawBase === '/' ? '' : rawBase.replace(/\/+$/, '');

/** Adds the prefix to an absolute same-origin path ('/api/x'); anything else is returned as is. */
export function withBasePath(path: string): string {
  if (!BASE_PATH || !path.startsWith('/') || path.startsWith('//')) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`) || path.startsWith(`${BASE_PATH}?`)) return path;
  return `${BASE_PATH}${path}`;
}

function rewriteUrlString(url: string): string {
  if (!BASE_PATH) return url;
  if (url.startsWith('/')) return withBasePath(url);
  if (/^https?:\/\//i.test(url) && typeof location !== 'undefined') {
    try {
      const u = new URL(url);
      if (u.origin === location.origin) {
        const prefixed = withBasePath(u.pathname);
        if (prefixed !== u.pathname) return `${u.origin}${prefixed}${u.search}${u.hash}`;
      }
    } catch { /* not a URL: leave it */ }
  }
  return url;
}

export function installBasePathPatch(): void {
  if (!BASE_PATH || typeof window === 'undefined') return;
  const w = window as unknown as Record<string, unknown>;
  if (w.__wmBasePathPatched) return;
  w.__wmBasePathPatched = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') return nativeFetch(rewriteUrlString(input), init);
    if (input instanceof URL) return nativeFetch(rewriteUrlString(input.toString()), init);
    if (typeof Request !== 'undefined' && input instanceof Request) {
      const next = rewriteUrlString(input.url);
      return nativeFetch(next === input.url ? input : new Request(next, input), init);
    }
    return nativeFetch(input, init);
  }) as typeof fetch;

  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function patchedOpen(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    const next = rewriteUrlString(typeof url === 'string' ? url : url.toString());
    return (nativeOpen as (...a: unknown[]) => void).call(this, method, next, ...rest);
  } as typeof XMLHttpRequest.prototype.open;

  if (typeof EventSource !== 'undefined') {
    const NativeEventSource = EventSource;
    const Patched = function (this: EventSource, url: string | URL, init?: EventSourceInit) {
      return new NativeEventSource(rewriteUrlString(typeof url === 'string' ? url : url.toString()), init);
    } as unknown as typeof EventSource;
    Patched.prototype = NativeEventSource.prototype;
    Object.assign(Patched, { CONNECTING: 0, OPEN: 1, CLOSED: 2 });
    window.EventSource = Patched;
  }

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) =>
      nativeBeacon(rewriteUrlString(typeof url === 'string' ? url : url.toString()), data);
  }
}
