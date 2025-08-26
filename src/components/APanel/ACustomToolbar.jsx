import React from "react";
import { ReactSVG } from "react-svg";
import arrow from "../../assets/svg/arrow-s.svg";
import add from "../../assets/svg/add-s.svg";
import { openPopup } from "../Utils/popupStore";

function ACustomToolbar({ label, onView, views, view, onNavigate }) {
   return (
      <div className="rbc-toolbar">
         <span className="rbc-btn-group">
            <button onClick={() => onNavigate("TODAY")}>Astăzi</button>
            <button onClick={() => onNavigate("PREV")}>
               <ReactSVG className="rbc-btn-group__icon" src={arrow} />
            </button>
            <button onClick={() => onNavigate("NEXT")}>
               <ReactSVG className="rbc-btn-group__icon deg180" src={arrow} />
            </button>
         </span>

         <span className="rbc-toolbar-label">{label}</span>

         <span className="rbc-btn-group">
            {views.includes("month") && (
               <button
                  onClick={() => onView("month")}
                  disabled={view === "month"}
               >
                  Lună
               </button>
            )}
            {views.includes("week") && (
               <button
                  onClick={() => onView("week")}
                  disabled={view === "week"}
               >
                  Săptămână
               </button>
            )}
            {views.includes("day") && (
               <button onClick={() => onView("day")} disabled={view === "day"}>
                  Zi
               </button>
            )}

            {/* Butonul pentru popup programări */}
            <button
               className="react-icon"
               onClick={() => openPopup("sAddProg")}
            >
               <ReactSVG src={add} />
            </button>
         </span>
      </div>
   );
}

export default ACustomToolbar;
