// src/components/Calendar/usePinchZoom.js
import { useRef, useEffect } from "react";

/**
 * Pinch-zoom pe containerul scrollabil (touch/pen). Nu atinge mouse-ul.
 */
export default function usePinchZoom({
   scrollRef,
   getZoom,
   setZoomClamped,
   getContentWidthPx,
}) {
   const pointers = useRef(new Map());
   const pinchState = useRef(null);

   const getMid = () => {
      const vals = Array.from(pointers.current.values());
      if (vals.length < 2) return null;
      return {
         x: (vals[0].clientX + vals[1].clientX) / 2,
         y: (vals[0].clientY + vals[1].clientY) / 2,
      };
   };
   const getDist = () => {
      const vals = Array.from(pointers.current.values());
      if (vals.length < 2) return 0;
      const dx = vals[0].clientX - vals[1].clientX;
      const dy = vals[0].clientY - vals[1].clientY;
      return Math.hypot(dx, dy);
   };

   const zoomAt = (factor, clientX) => {
      const el = scrollRef.current;
      if (!el) return;
      const oldZ = getZoom();
      const newZ = setZoomClamped(oldZ * factor);
      const s = newZ / oldZ;
      const x = clientX - el.getBoundingClientRect().left;
      el.scrollLeft = (el.scrollLeft + x) * s - x;
   };

   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;

      const onPointerDown = (e) => {
         // IMPORTANT: pe desktop (mouse) nu facem nimic — lăsăm click-urile în pace
         if (e.pointerType === "mouse") return;

         pointers.current.set(e.pointerId, {
            clientX: e.clientX,
            clientY: e.clientY,
         });

         // când apar EXACT 2 pointers -> inițiem pinch
         if (pointers.current.size === 2) {
            const mid = getMid();
            pinchState.current = {
               startDist: getDist(),
               startZoom: getZoom(),
               anchorX:
                  mid?.x ??
                  el.getBoundingClientRect().left + el.clientWidth / 2,
            };
         }
      };

      const onPointerMove = (e) => {
         if (!pointers.current.has(e.pointerId)) return;

         // mouse out — nu intervenim
         if (e.pointerType === "mouse") return;

         pointers.current.set(e.pointerId, {
            clientX: e.clientX,
            clientY: e.clientY,
         });

         // pinch activ doar când avem 2 pointers și stare inițiată
         if (pointers.current.size === 2 && pinchState.current) {
            e.preventDefault(); // oprește gestul implicit
            const dist = getDist();
            const { startDist, startZoom, anchorX } = pinchState.current;
            if (startDist > 0) {
               const scale = dist / startDist;
               const oldZ = getZoom();
               const newZ = setZoomClamped(startZoom * scale);
               const s = newZ / oldZ;

               const x = anchorX - el.getBoundingClientRect().left;
               el.scrollLeft = (el.scrollLeft + x) * s - x;
            }
         }
      };

      const endPointer = (e) => {
         if (pointers.current.has(e.pointerId)) {
            pointers.current.delete(e.pointerId);
         }
         // dacă a rămas mai puțin de 2 degete -> ieșim din modul pinch
         if (pointers.current.size < 2) {
            pinchState.current = null;
         }
      };

      // Safari (gesture events) — nu afectează mouse-ul
      const onGesture = (evt) => {
         evt.preventDefault();
         const factor = evt.scale;
         const clientX =
            evt.clientX ?? el.getBoundingClientRect().left + el.clientWidth / 2;
         zoomAt(factor, clientX);
      };

      el.addEventListener("pointerdown", onPointerDown, { passive: true });
      el.addEventListener("pointermove", onPointerMove, { passive: false });
      el.addEventListener("pointerup", endPointer, { passive: true });
      el.addEventListener("pointercancel", endPointer, { passive: true });
      el.addEventListener("pointerleave", endPointer, { passive: true });

      el.addEventListener("gesturechange", onGesture, { passive: false });
      el.addEventListener("gesturestart", (e) => e.preventDefault(), {
         passive: false,
      });
      el.addEventListener("gestureend", (e) => e.preventDefault(), {
         passive: false,
      });

      return () => {
         el.removeEventListener("pointerdown", onPointerDown);
         el.removeEventListener("pointermove", onPointerMove);
         el.removeEventListener("pointerup", endPointer);
         el.removeEventListener("pointercancel", endPointer);
         el.removeEventListener("pointerleave", endPointer);

         el.removeEventListener("gesturechange", onGesture);
         el.removeEventListener("gesturestart", (e) => e.preventDefault());
         el.removeEventListener("gestureend", (e) => e.preventDefault());
      };
   }, [scrollRef, getZoom, setZoomClamped, getContentWidthPx]);
}
