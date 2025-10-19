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

function HHMM(val) {
   return new Intl.DateTimeFormat("ro-RO", {
      timeZone: "Europe/Chisinau",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
   }).format(val instanceof Date ? val : new Date(val));
}

export default function EventCard({
   ev,
   editMode,
   highlightTokens,
   onOpenReservation,
}) {
   if (!ev) return null;

   const colorClass =
      colorClassMap[normalizeColor(ev.color)] ?? colorClassMap["--default"];
   const startLabel = HHMM(ev.raw?.startTime ?? ev.start);
   const endLabel = HHMM(ev.raw?.endTime ?? ev.end);

   const fallbackName =
      ev.raw?.clientName ||
      ev.raw?.customerName ||
      ev.raw?.name ||
      ev.title ||
      "Programare";

   const person = (
      `${ev.studentFirst || ""} ${ev.studentLast || ""}`.trim() || fallbackName
   ).trim();

   const phone =
      ev.studentPhone ||
      ev.raw?.clientPhone ||
      ev.raw?.phoneNumber ||
      ev.raw?.phone ||
      "";

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
      if (editMode) return;
      if (ev.studentId) {
         openPopup("studentDetails", {
            student: {
               id: ev.studentId,
               firstName: ev.studentFirst || "",
               lastName: ev.studentLast || "",
               phone: phone || "",
               isConfirmed: !!ev.isConfirmed,
            },
         });
      }
   };

   const H = (t) =>
      typeof highlightTokens === "function" ? highlightTokens(t) : t;

   return (
      <div
         className={`eventcard dayview__event ${colorClass}`}
         role="button"
         tabIndex={0}
         draggable={false}
         onDoubleClick={(e) => {
            e.stopPropagation();
            openReservation();
         }}
      >
         <span
            className="dayview__event-person-name"
            onDoubleClick={(e) => {
               e.stopPropagation();
               openStudent();
            }}
         >
            {H(person)}
         </span>

         {phone ? (
            <div
               className="dayview__event-phone"
               onDoubleClick={(e) => {
                  e.stopPropagation();
                  openReservation();
               }}
            >
               {H(phone)}
            </div>
         ) : null}

         <div
            className="dv-meta-row"
            onDoubleClick={(e) => {
               e.stopPropagation();
               openReservation();
            }}
         >
            <span className="dv-meta-pill">{ev.isConfirmed ? "DA" : "Nu"}</span>
            <span className="dv-meta-pill">
               {startLabel}–{endLabel}
            </span>
            {ev.gearboxLabel ? (
               <span className="dv-meta-pill">{ev.gearboxLabel}</span>
            ) : null}
         </div>

         {ev.privateMessage ? (
            <p
               className="dayview__event-note"
               onDoubleClick={(e) => {
                  e.stopPropagation();
                  openReservation();
               }}
            >
               {H(ev.privateMessage)}
            </p>
         ) : null}
      </div>
   );
}
