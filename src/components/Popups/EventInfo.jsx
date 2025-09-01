import React from "react";

export default function EventInfoPopup({ event }) {
   if (!event) return null;

   const format = (date) =>
      new Date(date).toLocaleString("ro-RO", {
         dateStyle: "medium",
      });
   const fmt = (d) =>
      new Date(d).toLocaleTimeString("ro-RO", {
         hour: "2-digit",
         minute: "2-digit",
      });

   return (
      <div className="event-info">
         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Detalii Programare</h3>
         </div>

         <div className="popup-panel__content">
            <div className="row">
               <strong>Zi:</strong> <span>{format(event.start)}</span>
            </div>{" "}
            <div className="row">
               <strong>Interval:</strong>{" "}
               <span>
                  {fmt(event.start)} – {fmt(event.end)}
               </span>
            </div>
            <div className="row">
               <strong>Instructor:</strong>{" "}
               <span>
                  {event.instructor?.firstName} {event.instructor?.lastName}
               </span>
            </div>
            <div className="row">
               <strong>Telefon:</strong>{" "}
               <span>{event.phone || event.instructor?.phone || "-"}</span>
            </div>
            <div className="row">
               <strong>Confirmat:</strong>{" "}
               <span>{event.isConfirmed ? "Da" : "Nu"}</span>
            </div>
            <div className="row">
               <strong>Cutie:</strong> <span>{event.gearbox || "–"}</span>
            </div>
            <div className="row">
               <strong>Sector:</strong> <span>{event.sector || "-"}</span>
            </div>
         </div>
      </div>
   );
}
