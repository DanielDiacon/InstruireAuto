// src/components/APanel/Calendar/EventCard.jsx
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

function getStudentPrivateMessage(ev) {
   const v =
      ev?.studentPrivateMessage ??
      ev?.student?.privateMessage ??
      ev?.student?.privateMessaje ??
      ev?.raw?.student?.privateMessage ??
      ev?.raw?.student?.privateMessaje ??
      ev?.raw?.user?.privateMessage ??
      ev?.raw?.user?.privateMessaje ??
      ev?.raw?.privateMessage ??
      ev?.raw?.privateMessaje ??
      "";

   return typeof v === "string" ? v : String(v ?? "");
}

export default function EventCard({ ev, onOpenReservation, isBlackout }) {
   if (!ev) return null;

   const colorClass =
      colorClassMap[normalizeColor(ev.color)] ?? colorClassMap["--default"];
   const startLabel = HHMM(ev.start);

   const fallbackName =
      ev.raw?.clientName ||
      ev.raw?.customerName ||
      ev.raw?.name ||
      ev.title ||
      "Programare";

   const person = (
      `${ev.studentFirst || ""} ${ev.studentLast || ""}`.trim() || fallbackName
   ).trim();

   const phoneVal =
      ev.studentPhone ||
      ev.raw?.clientPhone ||
      ev.raw?.phoneNumber ||
      ev.raw?.phone ||
      "";

   const reservationId = ev.raw?.id ?? ev.id;

   const noteFromEvent = (
      ev.privateMessage ||
      ev.raw?.note ||
      ev.raw?.comment ||
      ev.raw?.privateMessage ||
      ev.raw?.privateMessaje ||
      ""
   )
      .toString()
      .trim();

   const noteFromProfile = (getStudentPrivateMessage(ev) || "")
      .toString()
      .trim();

   const bothNotes = [
      noteFromEvent && `${noteFromEvent}`,
      noteFromProfile && `${noteFromProfile}`,
   ]
      .filter(Boolean)
      .join(" — ");

   const openReservation = () => {
      if (typeof onOpenReservation === "function") {
         onOpenReservation(reservationId);
      } else {
         openPopup("reservationEdit", { reservationId });
      }
   };

   const openStudent = () => {
      const userIdRaw =
         ev?.raw?.userId ??
         ev?.userId ??
         ev?.raw?.user_id ??
         ev?.raw?.user?.id ??
         null;

      const emailRaw =
         ev?.raw?.user?.email ?? ev?.raw?.email ?? ev?.studentEmail ?? "";

      const firstNameSeed =
         (ev.studentFirst || "").trim() || fallbackName.split(" ")[0] || "";
      const lastNameSeed = (ev.studentLast || "").trim();

      if (ev.studentId || userIdRaw) {
         openPopup("studentDetails", {
            student: {
               id: ev.studentId ?? null,
               userId: userIdRaw ?? null,
               firstName: firstNameSeed,
               lastName: lastNameSeed,
               phone: phoneVal || "",
               email: emailRaw || "",
               privateMessage: noteFromProfile,
               isConfirmed: !!ev.isConfirmed,
            },
            noteFromEvent,
            studentPrivateMessage: noteFromProfile,
            fromReservationId: reservationId,
            fromReservationStartISO:
               ev.raw?.startTime || ev.raw?.start || ev.start || null,
         });
      } else {
         openReservation();
      }
   };

   return (
      <div
         className={`eventcard dayview__event ${colorClass} ${
            isBlackout ? "dayview__event--blocked" : ""
         }`}
         role="button"
         tabIndex={0}
         draggable={false}
         data-reservation-id={reservationId}
         onDoubleClick={(e) => {
            e.stopPropagation();
            openReservation();
         }}
         onClick={() => {
            console.log(ev);
         }}
      >
         <div
            className="dv-meta-row"
            onDoubleClick={(e) => {
               e.stopPropagation();
               openReservation();
            }}
         >
            <span className="dv-meta-pill">{startLabel}</span>
            {ev.gearboxLabel ? (
               <span className="dv-meta-pill">{ev.gearboxLabel}</span>
            ) : null}
         </div>

         <span
            className="dayview__event-person-name"
            onDoubleClick={(e) => {
               e.stopPropagation();
               openStudent();
            }}
            title="Deschide profil elev"
         >
            {person}
         </span>

         {phoneVal ? (
            <div
               className="dayview__event-phone"
               onDoubleClick={(e) => {
                  e.stopPropagation();
                  openReservation();
               }}
            >
               {phoneVal}
            </div>
         ) : null}

         {bothNotes ? (
            <p
               className="dayview__event-note"
               onDoubleClick={(e) => {
                  e.stopPropagation();
                  openReservation();
               }}
            >
               {bothNotes}
            </p>
         ) : null}
      </div>
   );
}
