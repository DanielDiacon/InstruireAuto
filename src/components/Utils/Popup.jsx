import React, { useEffect, useState, useRef } from "react";
import {
   subscribePopup,
   getCurrentPopup,
   closePopup as closePopupStore,
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

export default function Popup() {
   const [popupState, setPopupState] = useState({
      type: getCurrentPopup()?.type || null,
      props: getCurrentPopup()?.props || {},
   });
   const [exiting, setExiting] = useState(false);
   const panelRef = useRef(null);

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
      // pe mobil, dacă intrarea din istorie aparține sesiunii active → consumă Back
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
         if (!isMobile()) return;
         if (!hasHistoryEntryRef.current) return;

         // dacă popstate vine de la o sesiune veche, ignorăm (anti-race)
         if (historySessionRef.current !== sessionIdRef.current) {
            try {
               if (typeof window !== "undefined") window.history.forward();
            } catch {}
            return;
         }

         // ok, aparține sesiunii active → închidem
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

            setExiting(false);
            document.body.classList.add("popup-open");
            setPopupState({ type: detail.type, props: detail.props || {} });

            // pune intrare în istorie DOAR pe mobil
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
            // dacă avem intrare pentru sesiunea activă și NU venim din popstate, consumă Back (mobil)
            if (
               isMobile() &&
               hasHistoryEntryRef.current === sessionIdRef.current &&
               !closingByPopstateRef.current
            ) {
               if (typeof window !== "undefined") window.history.back();
               return; // popstate va continua închiderea
            }

            setExiting(true);
            document.body.classList.remove("popup-open");

            const handleTransitionEnd = (e) => {
               if (e.target === panelRef.current && exiting) {
                  setPopupState((prev) => ({ ...prev, type: null }));
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
            return <AAddProg {...popupState.props} />;
         case "sAddProg":
            return <SAddProg {...popupState.props} />;
         case "addInstr":
            return <AddInstr {...popupState.props} />;
         case "dayInfo":
            return <ADayInfoPopup {...popupState.props} />;
         case "studentDetails":
            return <StudentInfo {...popupState.props} />;
         case "reservationEdit":
            return <ReservationEdit {...popupState.props} />;
         case "profile":
            return <Profile {...popupState.props} />;
         case "eventInfo":
            return <EventInfoPopup {...popupState.props} />;
         case "instrEventInfo":
            return <InstrEventInfoPopup {...popupState.props} />;
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
