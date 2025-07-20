import React, { useEffect } from "react";
import format from "date-fns/format";
import isSameDay from "date-fns/isSameDay";
import ro from "date-fns/locale/ro";

function ADayInfo({
   showDayPopup,
   selectedDate,
   selectedEvent,
   programari,
   selectedHourEvents = [],
}) {
   const closePanel = () => {
      document.body.classList.remove("popup-day-info");
   };
   const eventsAtSelectedTime = programari.filter((event) => {
      const selectedHour = format(selectedDate, "yyyy-MM-dd HH");
      const eventHour = format(new Date(event.start), "yyyy-MM-dd HH");
      return selectedHour === eventHour;
   });

   useEffect(() => {
      const active = document.body.classList.contains("popup-day-info");
      document.body.style.overflow = active ? "hidden" : "";
      document.body.style.paddingRight = active ? "16px" : "0px";
   }, [showDayPopup]);

   const ziuaFormatata = format(selectedDate, "dd MMMM yyyy", { locale: ro });

   // 🔍 Filtrăm toate evenimentele din acea zi
   const dayEvents = programari.filter((event) =>
      isSameDay(event.start, selectedDate)
   );

   // 🔢 Ce afișăm: ora sau ziua
   const eventsToDisplay =
      eventsAtSelectedTime.length > 0 ? eventsAtSelectedTime : dayEvents;

   return showDayPopup ? (
      <>
         <div
            className="popup-panel__overlay popup-day-info"
            onClick={closePanel}
         />
         <div className="popup-panel popup-day-info">
            <div className="popup-panel__inner">
               <div className="popup-panel__header">
                  <h3 className="popup-panel__title">
                     {selectedDate
                        ? typeof selectedDate === "string" ||
                          selectedDate.getHours?.() === 0
                           ? format(selectedDate, "dd MMMM yyyy", {
                                locale: ro,
                             }) // doar data
                           : format(selectedDate, "dd MMMM yyyy, HH:mm", {
                                locale: ro,
                             }) // data și ora
                        : "Detalii programare"}
                  </h3>
                  <button className="popup-panel__close" onClick={closePanel}>
                     &times;
                  </button>
               </div>

               <div className="popup-panel__content">
                  {eventsToDisplay.length > 0 ? (
                     <ul>
                        {eventsToDisplay.map((event, index) => {
                           const oraStart = format(event.start, "HH:mm");
                           const oraEnd = format(event.end, "HH:mm");
                           return (
                              <li key={index} style={{ marginBottom: "1rem" }}>
                                 <strong>{event.title}</strong>
                                 <br />
                                 Ora: {oraStart} - {oraEnd}
                              </li>
                           );
                        })}
                     </ul>
                  ) : (
                     <p>Nu există programări pentru această zi.</p>
                  )}
               </div>
            </div>
         </div>
      </>
   ) : null;
}

export default ADayInfo;
