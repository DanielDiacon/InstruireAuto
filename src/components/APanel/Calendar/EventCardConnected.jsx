// src/components/APanel/Calendar/EventCardConnected.jsx
import React from "react";

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

const timeFmt = new Intl.DateTimeFormat("ro-RO", {
   timeZone: "Europe/Chisinau",
   hour: "2-digit",
   minute: "2-digit",
   hour12: false,
});
const hhmm = (val) => timeFmt.format(val instanceof Date ? val : new Date(val));

export default function EventCardConnected({
   ev,
   editMode,
   highlightTokens,
   onOpenReservation,
}) {
   // fără hook-uri → nimic condițional
   const person = ev
      ? (
           `${ev.studentFirst || ""} ${ev.studentLast || ""}`.trim() ||
           ev?.raw?.clientName ||
           ev?.raw?.customerName ||
           ev?.title ||
           "Programare"
        ).trim()
      : "";

   const phone =
      ev?.studentPhone ||
      ev?.raw?.clientPhone ||
      ev?.raw?.phone ||
      ev?.raw?.phoneNumber ||
      "";

   const colorClass =
      colorClassMap[normalizeColor(ev?.color)] ?? colorClassMap["--default"];

   const startLabel = ev ? hhmm(ev.start) : "";
   const endLabel = ev ? hhmm(ev.end) : "";
   const groupLabel = ev?.groupName || "";

   const openReservation = () => {
      if (editMode || !ev) return;
      const reservationId = ev.raw?.id ?? ev.id;
      if (reservationId && typeof onOpenReservation === "function") {
         onOpenReservation(reservationId);
      }
   };

   const H = (t) => (highlightTokens ? highlightTokens(t) : t);

   if (!ev) return null;

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
         onClick={() => {}}
      >
         <span className="dayview__event-person-name">{H(person)}</span>

         <div
            className="dv-meta-row"
            onDoubleClick={(e) => {
               e.stopPropagation();
               openReservation();
            }}
         >
            <span className="dv-meta-pill">
               {ev.isConfirmed ? "Confirmat" : "Neconfirmat"}
            </span>
            <span className="dv-meta-pill">
               {startLabel}–{endLabel}
            </span>
            {groupLabel ? (
               <span className="dv-meta-pill">{H(groupLabel)}</span>
            ) : null}
            {ev.gearboxLabel ? (
               <span className="dv-meta-pill">{ev.gearboxLabel}</span>
            ) : null}
         </div>

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

         {ev.privateMessage ? (
            <p
               className="dayview__event-note"
               onClick={() => {
                  if (!editMode) openReservation();
               }}
            >
               {H(ev.privateMessage)}
            </p>
         ) : null}
      </div>
   );
}
