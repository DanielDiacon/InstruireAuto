// src/components/Calendar/Day/EventCard.jsx
import React from "react";
import { openPopup } from "../../Utils/popupStore";

const colorClassMap = {
   "--default": "dayview__event--default",
   "--yellow": "dayview__event--yellow",
   "--green": "dayview__event--green",
   "--red": "dayview__event--red",
   "--orange": "dayview__event--orange",
   "--purple": "dayview__event--purple",
   "--pink": "dayview__event--pink",
   "--blue": "dayview__event--blue",
   "--indigo": "dayview__event--indigo",
};

function normalizeColor(t) {
   const s = String(t || "")
      .trim()
      .replace(/^var\(/, "")
      .replace(/\)$/, "")
      .replace(/^--event-/, "--");
   return colorClassMap[s] ? s : "--default";
}

function EventCard({
   ev,
   editMode,
   highlightTokens,
   tokens,
   onOpenReservation,
}) {
   const colorToken = normalizeColor(ev.color);
   const colorClass = colorClassMap[colorToken];
   const MOLDOVA_TZ = "Europe/Chisinau";
   const fmtHHMM_MD = (val) =>
      new Intl.DateTimeFormat("ro-RO", {
         timeZone: MOLDOVA_TZ,
         hour: "2-digit",
         minute: "2-digit",
         hour12: false,
      }).format(val ? new Date(val) : new Date());

   const strictHHMM = (val) => {
      if (typeof val === "string") {
         const m = val.match(/T(\d{2}):(\d{2})/);
         if (m) return `${m[1]}:${m[2]}`; // păstrează HH:mm exact din string
      }
      return fmtHHMM_MD(val);
   };
   const person = `${ev.studentFirst || ""} ${ev.studentLast || ""}`.trim();
   const studentObj = ev.studentId
      ? {
           id: ev.studentId,
           firstName: ev.studentFirst,
           lastName: ev.studentLast,
           phone: ev.studentPhone,
           isConfirmed: ev.isConfirmed,
        }
      : null;

   const reservationId = ev.raw?.id ?? ev.id;

   const openReservation = () => {
      if (editMode) return;
      if (typeof onOpenReservation === "function") {
         onOpenReservation(reservationId);
      } else {
         openPopup("reservationEdit", { reservationId });
      }
   };

   const openStudent = () => {
      if (editMode || !studentObj) return;
      openPopup("studentDetails", { student: studentObj });
   };

   const stopAll = (e) => e.stopPropagation();

   return (
      <div
         className={`eventcard dayview__event ${colorClass}`}
         role="button"
         tabIndex={0}
         draggable={false}
         style={{ pointerEvents: "auto" }}
         onPointerDown={stopAll}
         onMouseDown={stopAll}
         onMouseUp={stopAll}
         onDoubleClick={(e) => {
            if (e.target.closest(".dayview__event-person-name")) return;
            e.stopPropagation();
            openReservation();
         }}
      >
         <span
            type="button"
            className="dayview__event-person-name dayview__event-person-name--link"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
               e.stopPropagation();
               openStudent();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
         >
            {highlightTokens(person, tokens)}
         </span>

         {ev.studentPhone && (
            <span
               className="dv-phone"
               onDoubleClick={(e) => {
                  if (editMode) return;
                  e.stopPropagation();
                  openReservation();
               }}
               onPointerDown={(e) => e.stopPropagation()}
               onMouseDown={(e) => e.stopPropagation()}
            >
               {highlightTokens(ev.studentPhone, tokens)}
            </span>
         )}

         <div
            className="dv-meta-row"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
               if (editMode) return;
               e.stopPropagation();
               openReservation();
            }}
         >
            <span className="dv-meta-pill">{ev.isConfirmed ? "Da" : "Nu"}</span>
            <span className="dv-meta-pill">
               {strictHHMM(ev.raw?.startTime ?? ev.start)}
            </span>
            {ev.gearboxLabel && (
               <span className="dv-meta-pill">{ev.gearboxLabel}</span>
            )}
         </div>

         {ev.privateMessage && (
            <p
               className="dayview__event-note"
               onClick={(e) => {
                  if (editMode) return;
                  e.stopPropagation();
                  openReservation();
               }}
               onPointerDown={(e) => e.stopPropagation()}
               onMouseDown={(e) => e.stopPropagation()}
            >
               {highlightTokens(ev.privateMessage, tokens)}
            </p>
         )}
      </div>
   );
}

export default React.memo(EventCard);
