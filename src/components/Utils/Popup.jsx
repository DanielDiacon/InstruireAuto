// src/components/Utils/Popup.jsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import {
   subscribePopup,
   getCurrentPopup,
   closePopup as closePopupStore,
   getCurrentSubPopup,
   closeSubPopup as requestCloseSubPopup,
} from "./popupStore";

import AAddProg from "../Popups/AAddProg";
import SAddProg from "../Popups/SAddProg";
import AddInstr from "../Popups/AddInstr";
import ADayInfoPopup from "../Popups/ADayInfo";
import StudentInfo from "../Popups/StudentInfo";
import ReservationEdit from "../Popups/EditReservation";
import { ReactSVG } from "react-svg";
import addIcon from "../../assets/svg/add-s.svg";
import Profile from "../Popups/Profile";
import EventInfoPopup from "../Popups/EventInfo";
import InstrEventInfoPopup from "../Popups/InstrEventInfo";
import AddManager from "../Popups/AddManager";
import StudentsMultiSelectPopup from "../Popups/StudentsMultiSelectPopup";
import CreateRezervation from "../Popups/CreateRezervation";
import QuestionCategoriesPopup from "../Popups/QuestionCategories";
import AddProfessor from "../Popups/AddProfessor";

export default function Popup() {
   const [popupState, setPopupState] = useState({
      type: getCurrentPopup()?.type || null,
      props: getCurrentPopup()?.props || {},
   });

   const [exiting, setExiting] = useState(false);
   const panelRef = useRef(null);

   // 🔑 cheie care forțează remount pe fiecare OPEN
   const [openKey, setOpenKey] = useState(0);

   // --- mobil doar (pentru back care închide popup-ul)
   const isMobile = () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 860px)").matches;

   // guard anti-race între sesiuni (deschidere/închidere rapidă)
   const sessionIdRef = useRef(0); // crește la fiecare OPEN
   const closingByPopstateRef = useRef(false);

   // ✅ guard: nu da back() de două ori pentru același close
   const didPopHistoryRef = useRef(false);

   // ✅ IMPORTANT: management corect pentru transitionend + fallback timeout
   const pendingCloseRef = useRef({
      sid: null,
      handler: null,
   });
   const closeTimerRef = useRef(null);

   const clearPendingClose = useCallback(() => {
      // scoate listener-ul vechi (dacă există)
      const { handler } = pendingCloseRef.current || {};
      if (handler && panelRef.current) {
         panelRef.current.removeEventListener("transitionend", handler);
      }
      pendingCloseRef.current = { sid: null, handler: null };

      // scoate timeout-ul vechi (dacă există)
      if (closeTimerRef.current) {
         clearTimeout(closeTimerRef.current);
         closeTimerRef.current = null;
      }
   }, []);

   const isPopupDummyOnTop = (sid) => {
      if (typeof window === "undefined") return false;
      const st = window.history.state;
      return !!(
         st &&
         st.__popup_dummy === true &&
         String(st.sid) === String(sid)
      );
   };

   const pushOrReplacePopupDummy = (sid) => {
      if (typeof window === "undefined") return;
      const marker = { __popup_dummy: true, sid };

      const st = window.history.state;
      if (st && st.__popup_dummy) {
         window.history.replaceState(marker, "", window.location.href);
      } else {
         window.history.pushState(marker, "", window.location.href);
      }
   };

   const maybePopPopupDummy = (sid) => {
      if (typeof window === "undefined") return;
      if (!isMobile()) return;
      if (closingByPopstateRef.current) return;
      if (didPopHistoryRef.current) return;

      if (!isPopupDummyOnTop(sid)) return;

      didPopHistoryRef.current = true;
      closingByPopstateRef.current = true;

      window.history.back();

      setTimeout(() => {
         closingByPopstateRef.current = false;
      }, 0);
   };

   const confirmCloseCurrentPopup = useCallback(() => {
      if (popupState?.type !== "sAddProg") return true;
      if (typeof window === "undefined") return true;
      return window.confirm("Sigur doriți să ieșiți din acest popup?");
   }, [popupState?.type]);

   const handleCloseClick = useCallback(() => {
      if (!confirmCloseCurrentPopup()) return;

      // dacă ai subpopup (stack), îl închizi separat
      if (getCurrentSubPopup()) {
         requestCloseSubPopup();
         return;
      }

      // închidem UI imediat (store)
      closePopupStore();

      // pe mobil, scoatem dummy-ul doar dacă e pe top
      const sid = sessionIdRef.current;
      maybePopPopupDummy(sid);
   }, [confirmCloseCurrentPopup]);

   // ✅ Back hardware / gesture: dacă popup e deschis, îl închidem
   useEffect(() => {
      const onPopState = () => {
         if (!isMobile()) return;

         if (!getCurrentPopup()) return;

         if (!confirmCloseCurrentPopup()) {
            // păstrăm popup-ul deschis dacă userul anulează close-ul
            pushOrReplacePopupDummy(sessionIdRef.current);
            return;
         }

         if (getCurrentSubPopup()) {
            requestCloseSubPopup();
            return;
         }

         closingByPopstateRef.current = true;
         didPopHistoryRef.current = true;
         closePopupStore();
         setTimeout(() => {
            closingByPopstateRef.current = false;
         }, 0);
      };

      window.addEventListener("popstate", onPopState);
      return () => window.removeEventListener("popstate", onPopState);
   }, [confirmCloseCurrentPopup]);

   useEffect(() => {
      const unsubscribe = subscribePopup(({ detail }) => {
         if (detail) {
            // ===== OPEN =====
            // ✅ CRUCIAL: anulează orice "close pending" rămas din sesiunea precedentă
            clearPendingClose();

            sessionIdRef.current += 1;
            const sid = sessionIdRef.current;

            didPopHistoryRef.current = false;

            setOpenKey(sid);
            setExiting(false);
            document.body.classList.add("popup-open");

            setPopupState({
               type: detail.type,
               props: { ...(detail.props || {}) },
            });

            if (isMobile()) {
               pushOrReplacePopupDummy(sid);
            }
         } else if (panelRef.current) {
            // ===== CLOSE =====
            // ✅ evită handler stacking
            clearPendingClose();

            setExiting(true);
            document.body.classList.remove("popup-open");

            const sidAtClose = sessionIdRef.current;
            pendingCloseRef.current.sid = sidAtClose;

            const finalizeClose = () => {
               // ✅ închide DOAR dacă close-ul încă aparține aceleiași sesiuni
               if (pendingCloseRef.current.sid !== sidAtClose) return;

               setPopupState({ type: null, props: {} });
               setExiting(false);

               // cleanup (o dată)
               clearPendingClose();
            };

            const handleTransitionEnd = (e) => {
               if (e.target !== panelRef.current) return;
               finalizeClose();
            };

            pendingCloseRef.current.handler = handleTransitionEnd;
            panelRef.current.addEventListener(
               "transitionend",
               handleTransitionEnd,
            );

            // ✅ fallback: dacă transitionend nu vine / vine ciudat, închidem după X ms
            // (setează valoarea aprox. la durata animației tale CSS)
            closeTimerRef.current = setTimeout(finalizeClose, 260);

            // ✅ dacă cineva a închis popup-ul direct (closePopupStore) fără handleCloseClick,
            // scoatem dummy-ul, DAR doar dacă e pe top.
            const sid = sessionIdRef.current;
            maybePopPopupDummy(sid);
         } else {
            // edge: panelRef null -> închide direct
            clearPendingClose();
            setPopupState({ type: null, props: {} });
            setExiting(false);
            document.body.classList.remove("popup-open");
         }
      });

      return () => {
         clearPendingClose();
         unsubscribe?.();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

   const renderContent = () => {
      switch (popupState.type) {
         case "addProg":
            return (
               <AAddProg
                  key={openKey}
                  {...popupState.props}
                  onClose={handleCloseClick}
               />
            );
         case "sAddProg":
            return (
               <SAddProg
                  key={openKey}
                  {...popupState.props}
                  onClose={handleCloseClick}
               />
            );
         case "addInstr":
            return <AddInstr key={openKey} {...popupState.props} />;
         case "dayInfo":
            return <ADayInfoPopup key={openKey} {...popupState.props} />;
         case "studentDetails":
            return <StudentInfo key={openKey} {...popupState.props} />;
         case "reservationEdit":
            return (
               <ReservationEdit
                  key={openKey}
                  {...popupState.props}
                  onClose={handleCloseClick}
               />
            );
         case "profile":
            return <Profile key={openKey} {...popupState.props} />;
         case "eventInfo":
            return <EventInfoPopup key={openKey} {...popupState.props} />;
         case "instrEventInfo":
            return <InstrEventInfoPopup key={openKey} {...popupState.props} />;
         case "addManager":
            return <AddManager key={openKey} {...popupState.props} />;
         case "addProfessor":
            return <AddProfessor key={openKey} {...popupState.props} />;
         case "startExam":
            return (
               <StudentsMultiSelectPopup key={openKey} {...popupState.props} />
            );
         case "createRezervation":
            return (
               <CreateRezervation
                  key={openKey}
                  {...popupState.props}
                  onClose={handleCloseClick}
               />
            );
         case "questionCategories":
            return (
               <QuestionCategoriesPopup
                  key={openKey}
                  {...popupState.props}
                  onClose={handleCloseClick}
               />
            );
         default:
            return null;
      }
   };

   if (!popupState.type) return null;

   return (
      <>
         <div
            className="popup-panel__overlay"
            onPointerDown={(e) => {
               if (typeof e.button === "number" && e.button !== 0) return;
               handleCloseClick();
            }}
         />
         <div
            className={`popup-panel ${exiting ? "popup-exit" : ""}`}
            ref={panelRef}
         >
            <ReactSVG
               onClick={handleCloseClick}
               className="popup-panel__close react-icon rotate45"
               src={addIcon}
            />
            <div className="popup-panel__inner">{renderContent()}</div>
         </div>
      </>
   );
}
