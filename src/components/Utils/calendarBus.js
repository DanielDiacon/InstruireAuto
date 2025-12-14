// Singleton very-light event bus pentru refresh calendar
const listeners = new Set();

export function triggerCalendarRefresh(payload) {
   // coalesce în microtask ca să nu spamăm
   Promise.resolve().then(() => {
      for (const fn of Array.from(listeners)) {
         try {
            fn(payload);
         } catch {
            /* no-op */
         }
      }
   });

   // fallback: event nativ – util dacă există code-splitting
   try {
      window.dispatchEvent(
         new CustomEvent("dv-calendar-refresh", {
            detail: payload || null,
         })
      );
   } catch {}
}

export function listenCalendarRefresh(cb) {
   listeners.add(cb);

   const onWin = (ev) => {
      // ev?.detail conține payload-ul
      cb(ev?.detail);
   };

   window.addEventListener("dv-calendar-refresh", onWin);

   return () => {
      listeners.delete(cb);
      window.removeEventListener("dv-calendar-refresh", onWin);
   };
}
