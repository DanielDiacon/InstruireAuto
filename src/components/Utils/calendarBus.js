// src/components/APanel/Utils/calendarBus.js
const EVT = "ia:calendar-refresh";

let rafId = 0;
let pendingDetail = null;

export function triggerCalendarRefresh(detail = {}) {
   if (typeof window === "undefined") return;
   window.dispatchEvent(new CustomEvent(EVT, { detail }));
}

/**
 * Coalesce într-un singur frame: nu spammează redraw-ul.
 * IMPORTANT: DayviewCanvasTrack ascultă exact acest EVT.
 */
export function scheduleCalendarRefresh(detail = {}) {
   if (typeof window === "undefined") return;

   pendingDetail = { ...(pendingDetail || {}), ...(detail || {}) };

   if (rafId) return;
   rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      const d = pendingDetail || {};
      pendingDetail = null;
      triggerCalendarRefresh(d);
   });
}

export function listenCalendarRefresh(cb) {
   if (typeof window === "undefined") return () => {};
   const handler = (e) => cb?.(e?.detail || {});
   window.addEventListener(EVT, handler);
   return () => window.removeEventListener(EVT, handler);
}
