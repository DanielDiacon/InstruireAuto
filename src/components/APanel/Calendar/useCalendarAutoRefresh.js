import { useEffect, useMemo, useRef, useCallback } from "react";
import { useDispatch } from "react-redux";
import { fetchAllReservations } from "../../../store/reservationsSlice";

// Utils locale
const DAY_MS = 24 * 60 * 60 * 1000;

export default function useCalendarAutoRefresh({
   // timeline
   rangeStartTs,
   rangeDays,
   // fereastra de virtualizare (din CustomDayView)
   winStart,
   WINDOW,
   // triggere externe (sector, zoom etc.)
   deps = [],
   // setări
   refreshMs = 45000,
   scrollIdleMs = 500,
   // dacă backend-ul suportă filtrare după interval
   backendSupportsWindow = true,
}) {
   const dispatch = useDispatch();

   // calculează intervalul vizibil curent (extins cu un „buffer” de 1 zi)
   const visibleWindow = useMemo(() => {
      const startIdx = Math.max(0, winStart);
      const endIdx = Math.min(
         rangeDays - 1,
         startIdx + Math.max(1, WINDOW) - 1
      );
      const fromTs = rangeStartTs + startIdx * DAY_MS - DAY_MS; // buffer
      const toTs = rangeStartTs + endIdx * DAY_MS + DAY_MS; // buffer
      return { from: new Date(fromTs), to: new Date(toTs) };
   }, [rangeStartTs, rangeDays, winStart, WINDOW]);

   // dedupe & throttling
   const inFlightRef = useRef(false);
   const lastRunRef = useRef(0);

   const revalidate = useCallback(async () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (inFlightRef.current || now - lastRunRef.current < 1000) return;
      inFlightRef.current = true;
      try {
         if (backendSupportsWindow) {
            await dispatch(
               fetchAllReservations({
                  scope: "window",
                  from: visibleWindow.from.toISOString(),
                  to: visibleWindow.to.toISOString(),
                  pageSize: 5000,
               })
            );
         } else {
            // fallback rar și sigur pe backend
            await dispatch(
               fetchAllReservations({ scope: "all", pageSize: 5000 })
            );
         }
         lastRunRef.current = Date.now();
      } finally {
         inFlightRef.current = false;
      }
   }, [dispatch, visibleWindow, backendSupportsWindow]);

   // 1) interval periodic când tab-ul e activ
   useEffect(() => {
      if (document.visibilityState !== "visible") return;
      const id = setInterval(revalidate, refreshMs);
      return () => clearInterval(id);
   }, [revalidate, refreshMs]);

   // 2) revalidează la revenire în tab
   useEffect(() => {
      const onFocus = () => revalidate();
      const onVis = () =>
         document.visibilityState === "visible" ? revalidate() : null;
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onVis);
      return () => {
         window.removeEventListener("focus", onFocus);
         document.removeEventListener("visibilitychange", onVis);
      };
   }, [revalidate]);

   // 3) revalidează debounced după scroll (expune un handler către părinte)
   const scrollTimerRef = useRef(null);
   const onScrollIdle = useCallback(() => {
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => revalidate(), scrollIdleMs);
   }, [revalidate, scrollIdleMs]);

   // 4) revalidează la schimbări relevante (sector, zoom, query etc.)
   useEffect(() => {
      revalidate();
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, deps);

   return { revalidate, onScrollIdle };
}
