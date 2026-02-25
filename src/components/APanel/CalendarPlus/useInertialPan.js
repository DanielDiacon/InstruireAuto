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
 *  - inertiaBoostX?: number
 *  - inertiaBoostY?: number
 *  - frictionX?: number
 *  - frictionY?: number
 *  - stopSpeedX?: number
 *  - stopSpeedY?: number
 *  - maxInertiaX?: number
 *  - maxInertiaY?: number
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
      inertiaBoostX = 1.4,
      inertiaBoostY = 1.4,
      frictionX = 0.9,
      frictionY = 0.9,
      stopSpeedX = 0.05,
      stopSpeedY = 0.05,
      maxInertiaX = 70,
      maxInertiaY = 70,
   } = {}
) {
   const isDown = useRef(false);
   const isPanning = useRef(false);
   const panInputTypeRef = useRef("");
   const last = useRef({ x: 0, y: 0 });
   const vel = useRef({ x: 0, y: 0 });
   const inertiaRaf = useRef(null);
   const moveRafRef = useRef(null);
   const pendingMoveRef = useRef(null);

   const suppressClickOnce = useRef(false);
   const capturedIdRef = useRef(null);
   const pointerTypeRef = useRef("");

   const SLOP_PX = slopPx;
   const MIN_PENDING_MOVE_DELTA_PX = 0.2;

   const ignoreRef = useRef(shouldIgnore);
   useEffect(() => {
      ignoreRef.current = shouldIgnore;
   }, [shouldIgnore]);

   // 🔑 CHEIA: urmărim scrollRef.current; când apare elementul, rulăm din nou efectul
   const targetEl = scrollRef?.current || null;

   useEffect(() => {
      const el = targetEl;
      if (!el) return;

      const endInteraction = (panDetail = null) => {
         if (suspendFlagsRef?.current) {
            suspendFlagsRef.current.isInteracting = false;
            suspendFlagsRef.current.panPhase = "idle";
         }
         el.classList?.remove?.("is-panning");
         if (panDetail && typeof panDetail === "object") {
            el.dispatchEvent(new CustomEvent("dvpanend", { detail: panDetail }));
         } else {
            el.dispatchEvent(new CustomEvent("dvpanend"));
         }
      };

      const stopInertiaNow = () => {
         if (inertiaRaf.current) {
            cancelAnimationFrame(inertiaRaf.current);
            inertiaRaf.current = null;
         }
         if (moveRafRef.current) {
            cancelAnimationFrame(moveRafRef.current);
            moveRafRef.current = null;
         }
         pendingMoveRef.current = null;
         vel.current.x = 0;
         vel.current.y = 0;
         isPanning.current = false;
         isDown.current = false;
         if (el.style.cursor !== "grab") el.style.cursor = "grab";
         endInteraction({ pointerType: panInputTypeRef.current || "mouse" });
         panInputTypeRef.current = "";
      };

      const onCancelInertia = () => {
         stopInertiaNow();
      };

      const processMoveSample = (sample) => {
         if (!sample || !isDown.current) return;
         if (!isPanning.current && ignoreRef.current?.(sample.target)) return;

         const cx = sample.x;
         const cy = sample.y;

         const dx = (cx - last.current.x) / (pixelScaleX || 1);
         const dy = (cy - last.current.y) / (pixelScaleY || 1);
         if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;

         if (!isPanning.current) {
            const panPointerType = String(pointerTypeRef.current || "").toLowerCase();
            const dynamicSlop =
               panPointerType === "touch"
                  ? Math.max(SLOP_PX, 10)
                  : panPointerType === "mouse"
                    ? Math.max(5, Math.min(SLOP_PX + 1, 9))
                    : Math.max(4, Math.min(SLOP_PX, 7));
            if (Math.hypot(dx, dy) < dynamicSlop) return;
            isPanning.current = true;
            suppressClickOnce.current = true;
            const pointerType = panPointerType || "mouse";
            panInputTypeRef.current = pointerType;
            el.dispatchEvent(
               new CustomEvent("dvpanstart", {
                  detail: { pointerType },
               }),
            );
            if (suspendFlagsRef?.current) {
               suspendFlagsRef.current.isInteracting = true;
               suspendFlagsRef.current.panPhase = "drag";
               suspendFlagsRef.current.suspendScrollSnap = true;
               suspendFlagsRef.current.suspendAutoJump = true;
            }
            if (capturedIdRef.current == null && sample.pointerId != null) {
               try {
                  el.setPointerCapture?.(sample.pointerId);
                  capturedIdRef.current = sample.pointerId;
               } catch {}
            }
            el.classList?.add?.("is-panning");
         }

         last.current.x = cx;
         last.current.y = cy;
         if (Math.abs(dx) >= 0.01) {
            el.scrollLeft -= dx;
         }
         if (Math.abs(dy) >= 0.01) {
            el.scrollTop -= dy;
         }

         const panPointerType = String(pointerTypeRef.current || "").toLowerCase();
         const blend = panPointerType === "touch" ? 0.24 : 0.2;
         vel.current.x = vel.current.x * (1 - blend) + dx * blend;
         vel.current.y = vel.current.y * (1 - blend) + dy * blend;
      };

      const flushPendingMove = () => {
         moveRafRef.current = null;
         const sample = pendingMoveRef.current;
         pendingMoveRef.current = null;
         if (!sample) return;
         processMoveSample(sample);
      };

      const schedulePendingMove = () => {
         if (moveRafRef.current) return;
         moveRafRef.current = requestAnimationFrame(flushPendingMove);
      };

      const onPointerDown = (e) => {
         if (ignoreRef.current?.(e.target)) return;
         if (e.button !== undefined && e.button !== 0) return;

         isDown.current = true;
         isPanning.current = false;
         suppressClickOnce.current = false;

         pointerTypeRef.current = String(e.pointerType || "");
         panInputTypeRef.current = pointerTypeRef.current || "mouse";

         const coalesced = e.getCoalescedEvents?.();
         const c =
            coalesced && coalesced.length
               ? coalesced[coalesced.length - 1]
               : e;
         last.current.x = c.clientX;
         last.current.y = c.clientY;
         pendingMoveRef.current = null;
         if (moveRafRef.current) {
            cancelAnimationFrame(moveRafRef.current);
            moveRafRef.current = null;
         }

         if (el.style.cursor !== "grabbing") el.style.cursor = "grabbing";

         if (inertiaRaf.current) {
            cancelAnimationFrame(inertiaRaf.current);
            inertiaRaf.current = null;
         }
         vel.current.x = 0;
         vel.current.y = 0;
      };

      const onPointerMove = (e) => {
         if (!isDown.current) return;
         if (!isPanning.current && ignoreRef.current?.(e.target)) return;

         const coalesced = e.getCoalescedEvents?.();
         const c =
            coalesced && coalesced.length
               ? coalesced[coalesced.length - 1]
               : e;
         const nextX = c.clientX;
         const nextY = c.clientY;
         const pointerId = e.pointerId ?? null;
         const pending = pendingMoveRef.current;
         if (
            pending &&
            pending.pointerId === pointerId &&
            Math.abs(nextX - pending.x) < MIN_PENDING_MOVE_DELTA_PX &&
            Math.abs(nextY - pending.y) < MIN_PENDING_MOVE_DELTA_PX
         ) {
            if (
               isPanning.current &&
               String(pointerTypeRef.current || "").toLowerCase() === "touch" &&
               e.cancelable
            ) {
               e.preventDefault();
            }
            return;
         }
         pendingMoveRef.current = {
            x: nextX,
            y: nextY,
            pointerId,
            target: e.target,
         };
         if (
            isPanning.current &&
            String(pointerTypeRef.current || "").toLowerCase() === "touch"
         ) {
            if (e.cancelable) e.preventDefault();
         }
         schedulePendingMove();
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

         if (moveRafRef.current) {
            cancelAnimationFrame(moveRafRef.current);
            moveRafRef.current = null;
         }
         if (pendingMoveRef.current) {
            const pending = pendingMoveRef.current;
            pendingMoveRef.current = null;
            processMoveSample(pending);
         }

         const pointerType = panInputTypeRef.current || pointerTypeRef.current || "mouse";
         isDown.current = false;
         releaseCaptureIfAny();
         pointerTypeRef.current = "";
         if (el.style.cursor !== "grab") el.style.cursor = "grab";
         el.classList?.remove?.("is-panning");

         if (!isPanning.current) {
            endInteraction({ pointerType });
            panInputTypeRef.current = "";
            return;
         }

         // clamp viteză maximă, să nu facă salturi
         let vx = inertiaX ? vel.current.x * inertiaBoostX : 0;
         let vy = inertiaY ? vel.current.y * inertiaBoostY : 0;
         vx = Math.max(-maxInertiaX, Math.min(maxInertiaX, vx));
         vy = Math.max(-maxInertiaY, Math.min(maxInertiaY, vy));

         const tooSlowX = !inertiaX || Math.abs(vx) < stopSpeedX;
         const tooSlowY = !inertiaY || Math.abs(vy) < stopSpeedY;

         if (tooSlowX && tooSlowY) {
            inertiaRaf.current = null;
            isPanning.current = false;
            endInteraction({ pointerType });
            panInputTypeRef.current = "";
            return;
         }

         if (suspendFlagsRef?.current) {
            suspendFlagsRef.current.isInteracting = true;
            suspendFlagsRef.current.panPhase = "inertia";
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
               endInteraction({ pointerType });
               panInputTypeRef.current = "";
               return;
            }

            inertiaRaf.current = requestAnimationFrame(tick);
         };

         inertiaRaf.current = requestAnimationFrame(tick);
         isPanning.current = false;
      };

      const onClickCapture = (e) => {
         if (!suppressClickOnce.current) return;
         e.preventDefault();
         e.stopPropagation();
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

      el.addEventListener("click", onClickCapture, { capture: true });
      el.addEventListener("dblclick", onDblClickCapture, { capture: true });
      el.addEventListener("wheel", onWheel, { passive: true });

      el.addEventListener("dvcancelinertia", onCancelInertia);
      window.addEventListener("dvcancelinertia-all", onCancelInertia);

      return () => {
         if (inertiaRaf.current) cancelAnimationFrame(inertiaRaf.current);
         if (moveRafRef.current) cancelAnimationFrame(moveRafRef.current);
         pendingMoveRef.current = null;

         el.removeEventListener("pointerdown", onPointerDown);
         el.removeEventListener("pointermove", onPointerMove);
         el.removeEventListener("pointerup", onPointerUp);
         el.removeEventListener("pointercancel", onPointerUp);

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
      SLOP_PX,
      pixelScaleX,
      pixelScaleY,
      slopPx,
      inertiaX,
      inertiaY,
      inertiaBoostX,
      inertiaBoostY,
      frictionX,
      frictionY,
      stopSpeedX,
      stopSpeedY,
      maxInertiaX,
      maxInertiaY,
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
