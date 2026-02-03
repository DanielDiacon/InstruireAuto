import React, {
   useEffect,
   useMemo,
   useRef,
   useState,
   useCallback,
   useSyncExternalStore,
} from "react";

import {
   subscribePopup,
   getCurrentPopup,
   closePopup as closePopupStore,
   getCurrentSubPopup,
   closeSubPopup as requestCloseSubPopup,
} from "../Common/popupUIStore";

import { ReactSVG } from "react-svg";
import addIcon from "../../assets/svg/add-s.svg";
import StudentProfileUI from "../Popups/StudentProfileUI";

// ține-l egal cu durata din CSS
const ANIM_MS = 300;

// aici pui tipurile unde vrei “fără animație de conținut” (dar panel-ul rămâne animat)
const NO_CONTENT_MOTION_TYPES = new Set(["studentDetails"]);

// ✅ marker pt history state
const POPUP_HISTORY_MARK = "__popup_ui_guard__";

export default function PopupUI() {
   const panelRef = useRef(null);

   const raf1Ref = useRef(null);
   const raf2Ref = useRef(null);
   const clearContentTimerRef = useRef(null);

   const seqRef = useRef(0); // anti-race: open/close rapid

   // ✅ history refs
   const backArmedRef = useRef(false);
   const ignoreNextPopRef = useRef(false);

   // ✅ store snapshot stabil (nu ratează primul click)
   const storePopup = useSyncExternalStore(
      subscribePopup,
      getCurrentPopup,
      getCurrentPopup,
   );

   // panel state (container rămâne montat mereu)
   const [isOpen, setIsOpen] = useState(false);

   // conținutul curent (îl păstrăm în timpul “closing”)
   const [shownPopup, setShownPopup] = useState(null);

   const clearTimers = useCallback(() => {
      if (raf1Ref.current) cancelAnimationFrame(raf1Ref.current);
      if (raf2Ref.current) cancelAnimationFrame(raf2Ref.current);
      raf1Ref.current = null;
      raf2Ref.current = null;

      if (clearContentTimerRef.current)
         clearTimeout(clearContentTimerRef.current);
      clearContentTimerRef.current = null;
   }, []);

   const scheduleClearContent = useCallback((seq) => {
      clearContentTimerRef.current = setTimeout(() => {
         if (seqRef.current !== seq) return;
         if (getCurrentPopup()) return;
         setShownPopup(null);
      }, ANIM_MS + 60);
   }, []);

   // ✅ arm back-guard (pushState) când deschizi popup
   const armBackGuard = useCallback(() => {
      if (typeof window === "undefined") return;
      if (backArmedRef.current) return;

      try {
         // duplicăm intrarea curentă (URL identic) dar cu state marker
         window.history.pushState(
            { [POPUP_HISTORY_MARK]: true, t: Date.now() },
            "",
            window.location.href,
         );
         backArmedRef.current = true;
      } catch {
         // ignore
      }
   }, []);

   // ✅ la “back gesture / back button” închide popup-ul, nu naviga
   useEffect(() => {
      if (typeof window === "undefined") return;

      const onPopState = () => {
         if (ignoreNextPopRef.current) {
            ignoreNextPopRef.current = false;
            return;
         }

         const hasPopup = Boolean(getCurrentPopup());
         const hasSub = Boolean(getCurrentSubPopup());

         if (!hasPopup && !hasSub) return;

         // 1) dacă e subpopup -> închide doar subpopup și RE-ARMEAZĂ guard-ul
         if (hasSub) {
            requestCloseSubPopup();

            // am consumat entry-ul guard; îl punem la loc ca să nu ieși din pagină la următorul back
            try {
               window.history.pushState(
                  { [POPUP_HISTORY_MARK]: true, t: Date.now() },
                  "",
                  window.location.href,
               );
               backArmedRef.current = true;
            } catch {}

            return;
         }

         // 2) altfel -> închide popup-ul principal
         closePopupStore();
         backArmedRef.current = false;
      };

      window.addEventListener("popstate", onPopState);
      return () => window.removeEventListener("popstate", onPopState);
   }, []);

   // OPEN/CLOSE driven de storePopup
   useEffect(() => {
      clearTimers();
      seqRef.current += 1;
      const seq = seqRef.current;

      if (storePopup) {
         // ===== OPEN =====
         setShownPopup(storePopup);

         // ✅ important: armăm back-guard aici
         armBackGuard();

         setIsOpen(false);
         raf1Ref.current = requestAnimationFrame(() => {
            raf2Ref.current = requestAnimationFrame(() => {
               if (seqRef.current !== seq) return;
               setIsOpen(true);
            });
         });

         return;
      }

      // ===== CLOSE =====
      setIsOpen(false);
      scheduleClearContent(seq);

      // ✅ popup închis -> considerăm guard dezarmat
      backArmedRef.current = false;
   }, [storePopup, clearTimers, scheduleClearContent, armBackGuard]);

   // close handler (click X / overlay)
   const handleClose = useCallback(() => {
      // dacă ai subpopup -> închide subpopup și gata (nu umblăm la history)
      if (getCurrentSubPopup()) {
         requestCloseSubPopup();
         return;
      }

      closePopupStore();

      // ✅ scoate entry-ul dummy ca să nu fie nevoie de încă un back după
      if (typeof window !== "undefined") {
         const st = window.history.state;
         if (st && st[POPUP_HISTORY_MARK]) {
            ignoreNextPopRef.current = true;
            window.history.back();
         }
      }

      backArmedRef.current = false;
   }, []);

   // content motion toggle (panel motion rămâne mereu ON)
   const contentMotionOn = useMemo(() => {
      const t = shownPopup?.type;
      if (!t) return true;
      return !NO_CONTENT_MOTION_TYPES.has(t);
   }, [shownPopup?.type]);

   const content = useMemo(() => {
      const type = shownPopup?.type;
      const props = shownPopup?.props || {};

      switch (type) {
         case "studentDetails":
            return <StudentProfileUI key={shownPopup?.id} {...props} />;
         default:
            return null;
      }
   }, [shownPopup]);

   const hasContent = Boolean(shownPopup);

   return (
      <>
         {(isOpen || hasContent) && (
            <div
               className={`popupPanelUI__overlay ${isOpen ? "is-open" : ""}`}
               style={{ pointerEvents: isOpen ? "auto" : "none" }}
               onPointerDown={(e) => {
                  if (typeof e.button === "number" && e.button !== 0) return;
                  handleClose();
               }}
            />
         )}

         <div
            ref={panelRef}
            className={`popupPanelUI ${isOpen ? "is-open" : ""}`}
            data-content-motion={contentMotionOn ? "on" : "off"}
            aria-hidden={!isOpen}
         >
            {hasContent && (
               <ReactSVG
                  onClick={handleClose}
                  className="popupPanelUI__close react-icon rotate45"
                  src={addIcon}
               />
            )}

            <div className="popupPanelUI__inner">
               <div className="popupPanelUI__content">{content}</div>
            </div>
         </div>
      </>
   );
}
