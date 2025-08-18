// components/popupContents/ADayInfoPopup.jsx
import React, { useEffect, useState } from "react";
import format from "date-fns/format";
import isSameDay from "date-fns/isSameDay";
import ro from "date-fns/locale/ro";

export default function ADayInfoPopup({ selectedDate, programari, onClose }) {
   const intervals = [
      { label: "08:00–11:00", start: 8, end: 11 },
      { label: "11:00–14:00", start: 11, end: 14 },
      { label: "14:00–17:00", start: 14, end: 17 },
      { label: "17:00–20:00", start: 17, end: 20 },
   ];

   const [selectedInterval, setSelectedInterval] = useState(null);

   useEffect(() => {
      if (
         selectedDate instanceof Date &&
         !isNaN(selectedDate.getTime()) &&
         (selectedDate.getHours() !== 0 || selectedDate.getMinutes() !== 0)
      ) {
         const hour = selectedDate.getHours();
         const interval = intervals.find(
            (intv) => hour >= intv.start && hour < intv.end
         );
         setSelectedInterval(interval || null);
      } else {
         setSelectedInterval(null);
      }
   }, [selectedDate]);

   const selected =
      typeof selectedDate === "string" ? new Date(selectedDate) : selectedDate;
   const hasTime = selectedInterval !== null;

   const eventsToDisplay = (() => {
      if (hasTime) {
         return programari.filter((event) => {
            const eventDate = new Date(event.start);
            if (!isSameDay(eventDate, selected)) return false;
            const eventHour = eventDate.getHours();
            return (
               eventHour >= selectedInterval.start &&
               eventHour < selectedInterval.end
            );
         });
      } else {
         return programari.filter((event) =>
            isSameDay(new Date(event.start), selected)
         );
      }
   })();

   const headerText = (() => {
      const baseDate = format(selected, "dd MMMM yyyy", { locale: ro });
      if (hasTime) {
         const startHourFormatted =
            selectedInterval.start.toString().padStart(2, "0") + ":00";
         return `${baseDate}, ora ${startHourFormatted}`;
      }
      return baseDate;
   })();

   const resetToDayView = () => {
      setSelectedInterval(null);
   };

   const selectInterval = (interval) => {
      setSelectedInterval(interval);
   };

   return (
      <div className="popup-panel__inner">
         <div className="popup-panel__header">
            <h3 className="popup-panel__title">{headerText}</h3>
         
         </div>

         <div className="popup-panel__content">
            {hasTime && (
               <button
                  onClick={resetToDayView}
                  style={{
                     marginBottom: "1rem",
                     backgroundColor: "#584B00",
                     color: "#fff",
                     border: "none",
                     borderRadius: "24px",
                     cursor: "pointer",
                     padding: ".8rem 1.4rem",
                  }}
               >
                  Vezi toată ziua
               </button>
            )}

            <div
               style={{
                  marginBottom: "1rem",
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
               }}
            >
               {intervals.map((interval, i) => {
                  const isActive =
                     selectedInterval &&
                     selectedInterval.start === interval.start;
                  return (
                     <button
                        key={i}
                        onClick={() => selectInterval(interval)}
                        className={isActive ? "active" : ""}
                        style={{
                           padding: ".8rem 1.4rem",
                           backgroundColor: isActive ? "#584B00" : "#e0e0e0",
                           color: isActive ? "#fff" : "#000",
                           border: "none",
                           borderRadius: "24px",
                           cursor: "pointer",
                        }}
                     >
                        {interval.label}
                     </button>
                  );
               })}
            </div>

            {eventsToDisplay.length > 0 ? (
               <ul>
                  {eventsToDisplay.map((event, index) => {
                     const oraStart = format(new Date(event.start), "HH:mm");
                     const oraEnd = format(new Date(event.end), "HH:mm");
                     return (
                        <li key={index} style={{ marginBottom: "1rem" }}>
                           <p>
                              <strong>Persoană:</strong> {event.person}
                           </p>
                           <p>
                              <strong>Instructor:</strong> {event.instructor}
                           </p>
                           <p>
                              <strong>Interval:</strong> {oraStart} - {oraEnd}
                           </p>
                        </li>
                     );
                  })}
               </ul>
            ) : (
               <p>Nu există programări pentru selecția actuală.</p>
            )}
         </div>
      </div>
   );
}
