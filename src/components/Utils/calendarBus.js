// src/components/Utils/calendarBus.js

const EVT = "calendar:refresh";

let rafId = 0;
let queuedDetail = null;

export function triggerCalendarRefresh(detail = {}) {
   if (typeof window === "undefined") return;
   window.dispatchEvent(new CustomEvent(EVT, { detail }));
}

// coalesced (1 refresh / frame)
export function scheduleCalendarRefresh(detail = {}) {
   if (typeof window === "undefined") return;

   queuedDetail = queuedDetail ? { ...queuedDetail, ...detail } : { ...detail };

   if (rafId) return;

   rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      const d = queuedDetail || {};
      queuedDetail = null;
      triggerCalendarRefresh(d);
   });
}

export function listenCalendarRefresh(cb) {
   if (typeof window === "undefined") return () => {};

   const handler = (e) => {
      try {
         cb?.(e?.detail || {});
      } catch (err) {
         console.warn("listenCalendarRefresh cb error:", err);
      }
   };

   window.addEventListener(EVT, handler);
   return () => window.removeEventListener(EVT, handler);
}
