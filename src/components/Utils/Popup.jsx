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
import { ReactSVG } from "react-svg";
import addIcon from "../../assets/svg/add-s.svg"; // <-- aici importi iconul X (sau îl redenumești)
import ReservationEdit from "../Popups/EditReservation";

export default function Popup() {
   const [popupState, setPopupState] = useState({
      type: getCurrentPopup()?.type || null,
      props: getCurrentPopup()?.props || {},
   });
   const [exiting, setExiting] = useState(false);
   const panelRef = useRef(null);

   useEffect(() => {
      const unsubscribe = subscribePopup(({ detail }) => {
         if (detail) {
            setExiting(false);
            document.body.classList.add("popup-open");
            setPopupState({ type: detail.type, props: detail.props || {} });
         } else if (panelRef.current) {
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
      if (popupState.type) {
         //console.log("Popup props:", popupState.props);
      }
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
         default:
            return null;
      }
   };

   return (
      <>
         <div className="popup-panel__overlay" onClick={closePopupStore} />
         <div
            className={`popup-panel ${exiting ? "popup-exit" : ""}`}
            ref={panelRef}
         >
            <ReactSVG
               onClick={closePopupStore}
               className="popup-panel__close react-icon rotate45"
               src={addIcon}
            />
            <div className="popup-panel__inner">{renderContent()}</div>
         </div>
      </>
   );
}
