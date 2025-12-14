// src/components/Utils/Popup.jsx
import React, { useEffect, useState, useRef } from "react";
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

// 🔹 noul popup pentru creare rezervare în pas unic
import CreateRezervation from "../Popups/CreateRezervation";

// ✅ NOU: popup pentru categorii întrebări
import QuestionCategoriesPopup from "../Popups/QuestionCategories";

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
   const hasHistoryEntryRef = useRef(0); // 0 = niciuna, altfel = id sesiune
   const historySessionRef = useRef(0); // sesiunea care a făcut push
   const closingByPopstateRef = useRef(false);

   const handleCloseClick = () => {
      if (getCurrentSubPopup()) {
         requestCloseSubPopup();
         return;
      }
      if (
         isMobile() &&
         hasHistoryEntryRef.current === sessionIdRef.current &&
         !closingByPopstateRef.current
      ) {
         if (typeof window !== "undefined") window.history.back();
      } else {
         closePopupStore();
      }
   };

   useEffect(() => {
      const onPopState = () => {
         if (getCurrentSubPopup()) return;
         const st = typeof window !== "undefined" ? window.history.state : null;
         if (st && st.__subpopup_dummy) return;
         if (!isMobile()) return;
         if (!hasHistoryEntryRef.current) return;

         if (historySessionRef.current !== sessionIdRef.current) {
            try {
               if (typeof window !== "undefined") window.history.forward();
            } catch {}
            return;
         }

         hasHistoryEntryRef.current = 0;
         closingByPopstateRef.current = true;
         closePopupStore();
         setTimeout(() => (closingByPopstateRef.current = false), 0);
      };

      window.addEventListener("popstate", onPopState);
      return () => window.removeEventListener("popstate", onPopState);
   }, []);

   useEffect(() => {
      const unsubscribe = subscribePopup(({ detail }) => {
         if (detail) {
            // ===== OPEN =====
            sessionIdRef.current += 1;
            const sid = sessionIdRef.current;

            setOpenKey(sid);

            setExiting(false);
            document.body.classList.add("popup-open");
            setPopupState({
               type: detail.type,
               props: { ...(detail.props || {}) },
            });

            if (isMobile()) {
               window.history.pushState(
                  { __popup_dummy: true, sid },
                  "",
                  window.location.href
               );
               hasHistoryEntryRef.current = sid;
               historySessionRef.current = sid;
            }
         } else if (panelRef.current) {
            // ===== CLOSE =====
            if (
               isMobile() &&
               hasHistoryEntryRef.current === sessionIdRef.current &&
               !closingByPopstateRef.current
            ) {
               if (typeof window !== "undefined") window.history.back();
               return;
            }

            setExiting(true);
            document.body.classList.remove("popup-open");

            const handleTransitionEnd = (e) => {
               if (e.target === panelRef.current && exiting) {
                  setPopupState({ type: null, props: {} });
                  panelRef.current.removeEventListener(
                     "transitionend",
                     handleTransitionEnd
                  );
               }
            };

            panelRef.current.addEventListener(
               "transitionend",
               handleTransitionEnd
            );
         }
      });

      return unsubscribe;
   }, [exiting]);

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

         // ✅ NOU: Question Categories
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
         <div className="popup-panel__overlay" onClick={handleCloseClick} />
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
