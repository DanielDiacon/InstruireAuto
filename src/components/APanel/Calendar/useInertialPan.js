// src/components/APanel/Calendar/useInertialPan.js
import { useEffect, useRef } from "react";

/**
 * options:
 *  - suspendFlagsRef?: React.MutableRefObject<any>
 *  - shouldIgnore?: (eventTarget: Element) => boolean
 *  - pixelScaleX?: number  // compensare pentru zoom pe X
 *  - pixelScaleY?: number  // compensare pentru zoom pe Y
 *  - slopPx?: number       // prag de separare click/drag
 *  - inertiaX?: boolean    // inerție pe X (default true)
 *  - inertiaY?: boolean    // inerție pe Y (default false)
 */
export default function useInertialPan(
   scrollRef,
   {
      suspendFlagsRef,
      shouldIgnore,
      pixelScaleX = 1,
      pixelScaleY = 1,
      slopPx = 8,
      inertiaX = true,
      inertiaY = false,
   } = {}
) {
   const isDown = useRef(false);
   const isPanning = useRef(false);
   const last = useRef({ x: 0, y: 0 });
   const vel = useRef({ x: 0, y: 0 });
   const raf = useRef(null);
   const acc = useRef({ dx: 0, dy: 0 });
   const inertiaRaf = useRef(null);

   const suppressClickOnce = useRef(false);
   const capturedIdRef = useRef(null);

   const SLOP_PX = slopPx;

   const ignoreRef = useRef(shouldIgnore);
   useEffect(() => {
      ignoreRef.current = shouldIgnore;
   }, [shouldIgnore]);

   const scheduleApply = () => {
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
         raf.current = null;
         const el = scrollRef.current;
         if (!el) return;
         if (acc.current.dx || acc.current.dy) {
            el.scrollLeft -= acc.current.dx;
            el.scrollTop -= acc.current.dy;
            acc.current.dx = 0;
            acc.current.dy = 0;
         }
      });
   };

   // 🔑 CHEIA: urmărim scrollRef.current; când apare elementul, rulăm din nou efectul
   const targetEl = scrollRef?.current || null;

   useEffect(() => {
      const el = targetEl;
      if (!el) return;

      const endInteraction = () => {
         if (suspendFlagsRef?.current) {
            suspendFlagsRef.current.isInteracting = false;
         }
         el.classList?.remove?.("is-panning");
         el.dispatchEvent(new CustomEvent("dvpanend"));
      };

      const stopInertiaNow = () => {
         if (inertiaRaf.current) {
            cancelAnimationFrame(inertiaRaf.current);
            inertiaRaf.current = null;
         }
         vel.current.x = 0;
         vel.current.y = 0;
         isPanning.current = false;
         isDown.current = false;
         el.style.cursor = "grab";
         endInteraction();
      };

      const onCancelInertia = () => {
         stopInertiaNow();
      };

      const onPointerDown = (e) => {
         if (ignoreRef.current?.(e.target)) return;
         if (e.button !== undefined && e.button !== 0) return;

         isDown.current = true;
         isPanning.current = false;
         suppressClickOnce.current = false;

         if (suspendFlagsRef?.current) {
            suspendFlagsRef.current.isInteracting = true;
         }

         const c = e.getCoalescedEvents?.()?.at(-1) ?? e;
         last.current.x = c.clientX;
         last.current.y = c.clientY;

         el.style.cursor = "grabbing";

         if (inertiaRaf.current) {
            cancelAnimationFrame(inertiaRaf.current);
            inertiaRaf.current = null;
         }
         vel.current.x = 0;
         vel.current.y = 0;
      };

      const onPointerMove = (e) => {
         if (!isDown.current) return;
         if (ignoreRef.current?.(e.target)) return;

         const c = e.getCoalescedEvents?.()?.at(-1) ?? e;
         const cx = c.clientX;
         const cy = c.clientY;

         let dx = (cx - last.current.x) / (pixelScaleX || 1);
         let dy = (cy - last.current.y) / (pixelScaleY || 1);

         if (!isPanning.current) {
            if (Math.hypot(dx, dy) < SLOP_PX) return;
            isPanning.current = true;
            suppressClickOnce.current = true;
            el.dispatchEvent(new CustomEvent("dvpanstart"));
            if (suspendFlagsRef?.current) {
               suspendFlagsRef.current.suspendScrollSnap = true;
               suspendFlagsRef.current.suspendAutoJump = true;
            }
            if (capturedIdRef.current == null && e.pointerId != null) {
               try {
                  el.setPointerCapture?.(e.pointerId);
                  capturedIdRef.current = e.pointerId;
               } catch {}
            }
            el.classList?.add?.("is-panning");
         }

         e.preventDefault();

         last.current.x = cx;
         last.current.y = cy;

         acc.current.dx += dx;
         acc.current.dy += dy;

         // filtrează puțin mișcarea pentru viteză
         vel.current.x = vel.current.x * 0.7 + dx * 0.3;
         vel.current.y = vel.current.y * 0.7 + dy * 0.3;

         scheduleApply();
      };

      const releaseCaptureIfAny = () => {
         if (capturedIdRef.current != null) {
            try {
               el.releasePointerCapture?.(capturedIdRef.current);
            } catch {}
            capturedIdRef.current = null;
         }
      };

      const onPointerUp = () => {
         if (!isDown.current) return;

         isDown.current = false;
         releaseCaptureIfAny();
         el.style.cursor = "grab";
         el.classList?.remove?.("is-panning");

         if (!isPanning.current) {
            endInteraction();
            return;
         }

         // === INERȚIE OPTIMIZATĂ ===
         const frictionX = 0.9; // mai mare = se oprește mai repede
         const frictionY = 0.9;
         const stopSpeedX = 0.05;
         const stopSpeedY = 0.05;

         // clamp viteză maximă, să nu facă salturi
         let vx = inertiaX ? vel.current.x * 1.4 : 0;
         let vy = inertiaY ? vel.current.y * 1.4 : 0;
         const MAX_V = 70;
         vx = Math.max(-MAX_V, Math.min(MAX_V, vx));
         vy = Math.max(-MAX_V, Math.min(MAX_V, vy));

         const tooSlowX = !inertiaX || Math.abs(vx) < stopSpeedX;
         const tooSlowY = !inertiaY || Math.abs(vy) < stopSpeedY;

         if (tooSlowX && tooSlowY) {
            inertiaRaf.current = null;
            isPanning.current = false;
            endInteraction();
            return;
         }

         let lastTime = performance.now();

         const tick = () => {
            const now = performance.now();
            const dt = Math.min((now - lastTime) / 16.7 || 1, 4); // factor relativ la 60fps
            lastTime = now;

            // aplicăm fricțiunea în funcție de timp
            const fx = Math.pow(frictionX, dt);
            const fy = Math.pow(frictionY, dt);
            vx *= fx;
            vy *= fy;

            const smallX = !inertiaX || Math.abs(vx) < stopSpeedX;
            const smallY = !inertiaY || Math.abs(vy) < stopSpeedY;

            const beforeLeft = el.scrollLeft;
            const beforeTop = el.scrollTop;

            if (!smallX && vx) {
               el.scrollLeft -= vx;
            }
            if (!smallY && vy) {
               el.scrollTop -= vy;
            }

            const hitBoundaryX = el.scrollLeft === beforeLeft && !smallX;
            const hitBoundaryY = el.scrollTop === beforeTop && !smallY;

            if ((smallX && smallY) || (hitBoundaryX && hitBoundaryY)) {
               inertiaRaf.current = null;
               isPanning.current = false;
               endInteraction();
               return;
            }

            inertiaRaf.current = requestAnimationFrame(tick);
         };

         inertiaRaf.current = requestAnimationFrame(tick);
         isPanning.current = false;
      };

      const onClickCapture = (e) => {
         if (!suppressClickOnce.current) return;
         const t = e.target;
         const isCardOrSlot = t?.closest?.(".dayview__event");
         if (!isCardOrSlot) {
            e.stopPropagation();
         }
         suppressClickOnce.current = false;
      };

      const onDblClickCapture = () => {
         if (suppressClickOnce.current) suppressClickOnce.current = false;
      };

      const onWheel = (e) => {
         const magX = Math.abs(e?.deltaX ?? 0);
         const magY = Math.abs(e?.deltaY ?? 0);

         const shouldStop =
            (inertiaX && magX > 0.5) || (inertiaY && magY > 0.5);

         if (inertiaRaf.current && shouldStop) {
            // dacă userul dă cu rotița, oprim inerția imediat
            stopInertiaNow();
         }
      };

      el.addEventListener("pointerdown", onPointerDown, { passive: true });
      el.addEventListener("pointermove", onPointerMove, { passive: false });
      el.addEventListener("pointerup", onPointerUp, { passive: true });
      el.addEventListener("pointercancel", onPointerUp, { passive: true });
      el.addEventListener("pointerleave", onPointerUp, { passive: true });

      el.addEventListener("click", onClickCapture, { capture: true });
      el.addEventListener("dblclick", onDblClickCapture, { capture: true });
      el.addEventListener("wheel", onWheel, { passive: true });

      el.addEventListener("dvcancelinertia", onCancelInertia);
      window.addEventListener("dvcancelinertia-all", onCancelInertia);

      return () => {
         if (raf.current) cancelAnimationFrame(raf.current);
         if (inertiaRaf.current) cancelAnimationFrame(inertiaRaf.current);

         el.removeEventListener("pointerdown", onPointerDown);
         el.removeEventListener("pointermove", onPointerMove);
         el.removeEventListener("pointerup", onPointerUp);
         el.removeEventListener("pointercancel", onPointerUp);
         el.removeEventListener("pointerleave", onPointerUp);

         el.removeEventListener("click", onClickCapture, { capture: true });
         el.removeEventListener("dblclick", onDblClickCapture, {
            capture: true,
         });
         el.removeEventListener("wheel", onWheel);

         el.removeEventListener("dvcancelinertia", onCancelInertia);
         window.removeEventListener("dvcancelinertia-all", onCancelInertia);
      };
   }, [
      targetEl, // 👈 când se schimbă scrollRef.current, reatașăm handler-ele
      suspendFlagsRef,
      pixelScaleX,
      pixelScaleY,
      slopPx,
      inertiaX,
      inertiaY,
   ]);

   return {
      onPointerDown: () => {},
      onPointerMove: () => {},
      onPointerUp: () => {},
      onPointerCancel: () => {},
      onClickCapture: () => {},
      onDoubleClickCapture: () => {},
   };
}
