// useInertialPan (drag smooth, click-safe)
import { useEffect, useRef } from "react";

/**
 * options:
 *  - suspendFlagsRef?: React.MutableRefObject<any>
 *  - shouldIgnore?: (eventTarget: Element) => boolean  // ex: isInteractiveTarget
 */
export default function useInertialPan(
   scrollRef,
   { suspendFlagsRef, shouldIgnore } = {}
) {
   const isDown = useRef(false);
   const isPanning = useRef(false);
   const last = useRef({ x: 0, y: 0 });
   const vel = useRef({ x: 0, y: 0 });
   const raf = useRef(null);
   const acc = useRef({ dx: 0, dy: 0 });
   const inertiaRaf = useRef(null);

   // suprimă primul click care vine imediat după un pan
   const suppressClickOnce = useRef(false);

   const SLOP_PX = 12; // prag pentru a separa click de drag (mai safe)

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

   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;

      const onPointerDown = (e) => {
         // lasă elementele interactive în pace (buton, link, input, event card)
         if (shouldIgnore?.(e.target)) return;
         // doar primary / touch / pen
         if (e.button !== undefined && e.button !== 0) return;

         isDown.current = true;
         isPanning.current = false;
         suppressClickOnce.current = false;

         const c = e.getCoalescedEvents?.()?.at(-1) ?? e;
         last.current.x = c.clientX;
         last.current.y = c.clientY;

         // oprește inerția dacă există
         if (inertiaRaf.current) {
            cancelAnimationFrame(inertiaRaf.current);
            inertiaRaf.current = null;
         }
         vel.current.x = 0;
         vel.current.y = 0;
      };

      const onPointerMove = (e) => {
         if (!isDown.current) return;
         if (shouldIgnore?.(e.target)) return;

         const c = e.getCoalescedEvents?.()?.at(-1) ?? e;
         const cx = c.clientX;
         const cy = c.clientY;

         const dx = cx - last.current.x;
         const dy = cy - last.current.y;

         // declanșăm pan abia după SLOP_PX
         if (!isPanning.current) {
            if (Math.hypot(dx, dy) < SLOP_PX) return;
            isPanning.current = true;
            suppressClickOnce.current = true; // vom mânca PRIMUL click după pan
            try {
               el.setPointerCapture?.(e.pointerId);
            } catch {}
            // semnalăm UI-ului să suspende snap/auto-jump dacă vrei
            if (suspendFlagsRef?.current) {
               suspendFlagsRef.current.suspendScrollSnap = true;
               suspendFlagsRef.current.suspendAutoJump = true;
            }
         }

         // când panăm, prevenim default-ul (oprește selectarea/elastic scroll)
         e.preventDefault();

         last.current.x = cx;
         last.current.y = cy;

         acc.current.dx += dx;
         acc.current.dy += dy;

         // viteză filtrată (pt. inerție)
         vel.current.x = vel.current.x * 0.7 + dx * 0.3;
         vel.current.y = vel.current.y * 0.7 + dy * 0.3;

         scheduleApply();
      };

      const onPointerUp = (e) => {
         if (!isDown.current) return;
         if (shouldIgnore?.(e.target)) {
            isDown.current = false;
            isPanning.current = false;
            return;
         }

         isDown.current = false;

         try {
            el.releasePointerCapture?.(e.pointerId);
         } catch {}

         if (!isPanning.current) {
            // a fost click / tap simplu => nu porni inerția, nu suprima click
            return;
         }

         // inerție
         const friction = 0.95;
         const stopSpeed = 0.05;
         let vx = vel.current.x;
         let vy = vel.current.y;

         const tick = () => {
            vx *= friction;
            vy *= friction;
            if (Math.abs(vx) < stopSpeed && Math.abs(vy) < stopSpeed) {
               inertiaRaf.current = null;
               return;
            }
            el.scrollLeft -= vx;
            el.scrollTop -= vy;
            inertiaRaf.current = requestAnimationFrame(tick);
         };
         inertiaRaf.current = requestAnimationFrame(tick);

         // resetăm starea panning; suppressClickOnce rămâne true până la primul click
         isPanning.current = false;
      };

      // Suprimă primul click/dblclick care vine imediat după un pan
      const onClickCapture = (e) => {
         if (suppressClickOnce.current) {
            e.stopPropagation();
            e.preventDefault();
            suppressClickOnce.current = false; // doar primul click este mâncat
         }
      };
      const onDblClickCapture = (e) => {
         if (suppressClickOnce.current) {
            e.stopPropagation();
            e.preventDefault();
            suppressClickOnce.current = false;
         }
      };

      const onWheel = () => {
         // orice interacțiune de tip wheel anulează inerția (opțional, dar util)
         if (inertiaRaf.current) {
            cancelAnimationFrame(inertiaRaf.current);
            inertiaRaf.current = null;
         }
      };

      el.addEventListener("pointerdown", onPointerDown, { passive: true });
      el.addEventListener("pointermove", onPointerMove, { passive: false });
      el.addEventListener("pointerup", onPointerUp, { passive: true });
      el.addEventListener("pointercancel", onPointerUp, { passive: true });
      el.addEventListener("pointerleave", onPointerUp, { passive: true });

      // capture: să “mâncăm” click-ul înainte să ajungă la EventCard etc.
      el.addEventListener("click", onClickCapture, { capture: true });
      el.addEventListener("dblclick", onDblClickCapture, { capture: true });
      el.addEventListener("wheel", onWheel, { passive: true });

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
      };
   }, [scrollRef, suspendFlagsRef, shouldIgnore]);

   // API-ul rămâne pentru compatibilitate (nu e necesar să-l apelezi)
   return {
      onPointerDown: () => {},
      onPointerMove: () => {},
      onPointerUp: () => {},
      onPointerCancel: () => {},
      onClickCapture: () => {},
      onDoubleClickCapture: () => {},
   };
}
