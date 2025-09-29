import React from "react";
import { ReactSVG } from "react-svg";
import successIcon from "../../assets/svg/success.svg";
import cancelIcon from "../../assets/svg/cancel.svg";
import clockIcon from "../../assets/svg/clock.svg";
import addIcon from "../../assets/svg/add-s.svg";
import { openPopup } from "../Utils/popupStore"; // ✅ import openPopup

function ReservationHistory({ formattedReservations = [] }) {
   return (
      <div className="history">
         <div className="history__header">
            <h2>Istoric Programări</h2>
            <button className="react-icon" onClick={() => openPopup("addProg")}>
               <ReactSVG src={addIcon} />
            </button>
         </div>
         <div className="history__grid-wrapper">
            <div className="history__grid">
               {formattedReservations.map((entry, index) => (
                  <div
                     key={entry.id + "-" + index}
                     className={`history__item history__item--${entry.status}`}
                  >
                     <div className="history__item-left">
                        <h3>{entry.person}</h3>
                        <p>
                           {entry.instructor
                              ? `cu ${entry.instructor}`
                              : "fără instructor"}
                        </p>
                        <span>{entry.time}</span>
                     </div>
                     <div className="history__item-right">
                        {entry.status === "completed" && (
                           <ReactSVG
                              className="history__item-icon completed"
                              src={successIcon}
                           />
                        )}
                        {entry.status === "cancelled" && (
                           <ReactSVG
                              className="history__item-icon cancelled"
                              src={cancelIcon}
                           />
                        )}
                        {entry.status === "pending" && (
                           <ReactSVG
                              className="history__item-icon pending"
                              src={clockIcon}
                           />
                        )}
                     </div>
                  </div>
               ))}
            </div>
         </div>
      </div>
   );
}

export default ReservationHistory;
