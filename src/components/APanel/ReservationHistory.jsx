// src/components/APanel/ReservationHistory.jsx
import React, { useMemo } from "react";
import { ReactSVG } from "react-svg";
import successIcon from "../../assets/svg/success.svg";
import cancelIcon from "../../assets/svg/cancel.svg";
import clockIcon from "../../assets/svg/clock.svg";
import addIcon from "../../assets/svg/add-s.svg";
import { openPopup } from "../Utils/popupStore";

/* ===== Time helpers (floating MD time) ===== */
const MOLDOVA_TZ = "Europe/Chisinau";
// "YYYY-MM-DDTHH:MM:SSZ" -> "DD MM YYYY" (fără schimbare de oră)
const fmtIsoDateDMY = (val) => {
   if (!val) return "—";
   if (typeof val === "string") {
      const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[3]} ${m[2]} ${m[1]}`;
      return String(val);
   }
   const d = val instanceof Date ? val : new Date(val);
   if (isNaN(d)) return "—";
   const pad = (n) => String(n).padStart(2, "0");
   return `${pad(d.getUTCDate())} ${pad(
      d.getUTCMonth() + 1
   )} ${d.getUTCFullYear()}`;
};

const toFloating = (val) => {
   if (!val) return null;
   if (val instanceof Date) return val;
   const s = String(val || "");
   // extrage Y-M-D [T ]HH:mm(:ss)? și IGNORĂ orice fus (Z, +02:00 etc.)
   const m = s.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/
   );
   if (m)
      return new Date(
         +m[1],
         +m[2] - 1,
         +m[3],
         +(m[4] || 0),
         +(m[5] || 0),
         +(m[6] || 0),
         0
      );
   const d = new Date(s);
   return isNaN(d) ? null : d;
};

const addMinutes = (d, minutes) => new Date(d.getTime() + minutes * 60000);

const HHMM = (d) =>
   new Intl.DateTimeFormat("ro-RO", {
      timeZone: MOLDOVA_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
   }).format(d);

/* ============================================================= */

function ReservationHistory({
   // NOU: putem primi brute și le formatăm aici:
   reservations = [],
   users = [],
   instructors = [],
   durationMinDefault = 90,

   // compatibilitate veche: dacă e dat, îl folosim
   formattedReservations = [],
}) {
   const openReservation = (id) =>
      openPopup("reservationEdit", { reservationId: id });

   const onKeyOpen = (e, id) => {
      if (e.key === "Enter" || e.key === " ") {
         e.preventDefault();
         openReservation(id);
      }
   };

   const list = useMemo(() => {
      // dacă vin deja formate, păstrăm comportamentul vechi
      if (formattedReservations?.length) return formattedReservations;

      const uMap = new Map((users || []).map((u) => [String(u.id), u]));
      const iMap = new Map((instructors || []).map((i) => [String(i.id), i]));

      const norm = (x) => (x || "").toString().trim();

      return (
         (reservations || [])
            .map((r) => {
               const startRaw =
                  r.startTime ??
                  r.start ??
                  r.startedAt ??
                  r.start_at ??
                  r.startDate ??
                  r.start_date;
               const start = toFloating(startRaw) || new Date();

               const endRaw =
                  r.endTime ??
                  r.end ??
                  r.end_at ??
                  r.endDate ??
                  r.end_date ??
                  null;
               const end = endRaw
                  ? toFloating(endRaw)
                  : addMinutes(
                       start,
                       Number(r.durationMinutes ?? durationMinDefault)
                    );

               const u =
                  uMap.get(String(r.userId ?? r.studentId ?? "")) ||
                  r.user ||
                  null;
               const inst =
                  iMap.get(String(r.instructorId ?? r.instructor_id ?? "")) ||
                  r.instructor ||
                  null;

               // „person” și „instructor” exact ca în DayView (preferăm prenume+nume din store)
               const person =
                  norm(
                     `${u?.firstName ?? ""} ${u?.lastName ?? ""}` ||
                        `${r.studentFirst ?? ""} ${r.studentLast ?? ""}`
                  ) ||
                  norm(r.clientName ?? r.customerName ?? r.name ?? "Anonim");

               const instructor =
                  norm(`${inst?.firstName ?? ""} ${inst?.lastName ?? ""}`) ||
                  norm(r.instructorName ?? "Necunoscut");

               // status coerent
               const statusRaw =
                  r.status ??
                  (r.isCancelled
                     ? "cancelled"
                     : r.isCompleted
                     ? "completed"
                     : "pending");
               const status = String(statusRaw || "pending").toLowerCase();

               const time = `${fmtIsoDateDMY(startRaw)} - ${HHMM(start)}`;
               return {
                  id: r.id,
                  start,
                  end,
                  time,
                  person,
                  instructor,
                  status,
               };
            })
            // ordonăm descrescător (cele mai recente sus) — poți schimba după preferință
            .sort((a, b) => b.start - a.start)
      );
   }, [
      reservations,
      users,
      instructors,
      durationMinDefault,
      formattedReservations,
   ]);

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
               {list.map((entry, index) => (
                  <div
                     key={entry.id + "-" + index}
                     className={`history__item history__item--${entry.status} is-clickable`}
                     role="button"
                     tabIndex={0}
                     onClick={() => openReservation(entry.id)}
                     onKeyDown={(e) => onKeyOpen(e, entry.id)}
                     title="Deschide editarea programării"
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
