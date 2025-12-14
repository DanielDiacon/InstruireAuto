const OPEN_EVT = "dv:presence-open";
const CLOSE_EVT = "dv:presence-close";

export function emitPresenceOpen(detail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_EVT, { detail }));
}

export function emitPresenceClose(detail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CLOSE_EVT, { detail }));
}

export function listenPresenceOpen(fn) {
  if (typeof window === "undefined") return () => {};
  const h = (e) => fn?.(e?.detail || {});
  window.addEventListener(OPEN_EVT, h);
  return () => window.removeEventListener(OPEN_EVT, h);
}

export function listenPresenceClose(fn) {
  if (typeof window === "undefined") return () => {};
  const h = (e) => fn?.(e?.detail || {});
  window.addEventListener(CLOSE_EVT, h);
  return () => window.removeEventListener(CLOSE_EVT, h);
}
