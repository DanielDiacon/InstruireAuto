import React, { useEffect, useRef, useState } from "react";
import {
   subscribeSubPopup,
   getCurrentSubPopup,
   closeSubPopup as requestCloseSubPopup,
   popSubPopup,
} from "./popupStore";
import { ReactSVG } from "react-svg";
import addIcon from "../../assets/svg/add-s.svg";
import ReservationEditPopup from "../Popups/EditReservation";

export default function SubPopup() {
   const [popupState, setPopupState] = useState({
      type: getCurrentSubPopup()?.type || null,
      props: getCurrentSubPopup()?.props || {},
   });
   const [exiting, setExiting] = useState(false);
   const [armed, setArmed] = useState(false);
   const panelRef = useRef(null);

   // 🔑 cheie care forțează remount la fiecare OPEN de subpopup
   const [openKey, setOpenKey] = useState(0);

   const isMobile = () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 860px)").matches;

   // starea SubPopup în history
   const subSessionIdRef = useRef(0);
   const subDepthRef = useRef(0);

   // back inițiat de gest (popstate) ca să NU mai dăm încă un history.back() după animație
   const closingByPopstateRef = useRef(false);

   // când închidem top-ul și reapare precedentul (nu mai push-uim history)
   const revealingPrevRef = useRef(false);

   const handleClose = () => {
      requestCloseSubPopup();
   };

   // Back/gest — dacă există un SubPopup deschis, îl închidem noi (nu Popup)
   useEffect(() => {
      const onPopState = () => {
         if (getCurrentSubPopup()) {
            closingByPopstateRef.current = true;
            requestCloseSubPopup();
            return;
         }
      };
      window.addEventListener("popstate", onPopState);
      return () => window.removeEventListener("popstate", onPopState);
   }, []);

   useEffect(() => {
      const unsub = subscribeSubPopup(({ detail }) => {
         if (detail) {
            // ===== OPEN =====
            setExiting(false);
            setArmed(false);
            document.body.classList.add("subpopup-open");
            setPopupState({
               type: detail.type,
               props: { ...(detail.props || {}) },
            });

            // 🔄 forțează remount DOAR când deschidem ceva nou (nu când „reapare” precedentul)
            if (!revealingPrevRef.current) {
               subSessionIdRef.current += 1;
               setOpenKey(subSessionIdRef.current);
            }

            requestAnimationFrame(() =>
               requestAnimationFrame(() => setArmed(true))
            );

            // fiecare SubPopup deschis împinge o intrare separată în istorie (stack)
            if (isMobile() && !revealingPrevRef.current) {
               const sid = subSessionIdRef.current;
               window.history.pushState(
                  { __subpopup_dummy: true, sid },
                  "",
                  window.location.href
               );
               subDepthRef.current += 1;
            }
            revealingPrevRef.current = false;
         } else if (panelRef.current) {
            // ===== CLOSE (instant) =====
            setExiting(false);
            document.body.classList.remove("subpopup-open");

            // scoatem top-ul din stivă imediat
            revealingPrevRef.current = true;
            popSubPopup();

            // curățăm complet starea
            setPopupState({ type: null, props: {} });

            // pe mobil: consumăm o intrare din istorie DOAR dacă închiderea NU a venit din popstate
            if (isMobile() && subDepthRef.current > 0) {
               if (!closingByPopstateRef.current) {
                  window.history.back();
               }
               subDepthRef.current -= 1;
            }
            // reset flag
            closingByPopstateRef.current = false;
         }
      });

      return () => {
         document.body.classList.remove("subpopup-open");
         unsub();
      };
   }, []);

   const renderContent = () => {
      switch (popupState.type) {
         case "reservationEdit":
            return (
               <ReservationEditPopup
                  key={openKey}
                  onClose={handleClose}
                  {...popupState.props}
               />
            );
         default: {
            const Cmp = popupState.props?.component;
            return Cmp ? (
               <Cmp key={openKey} onClose={handleClose} {...popupState.props} />
            ) : null;
         }
      }
   };

   if (!popupState.type) return null;

   return (
      <>
         <div
            className={`subpopup-panel__overlay ${armed ? "is-armed" : ""}`}
            onClick={handleClose}
         />
         <div
            className={`subpopup-panel ${exiting ? "subpopup-exit" : ""}`}
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
         >
            <ReactSVG
               onClick={handleClose}
               className="subpopup-panel__close react-icon rotate45"
               src={addIcon}
            />
            <div className="subpopup-panel__inner">{renderContent()}</div>
         </div>
      </>
   );
}
