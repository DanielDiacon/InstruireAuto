import React, { useContext, useMemo } from "react";
import { useSelector, shallowEqual } from "react-redux";
import { CalendarBusCtx } from "./CalendarBus";

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

export default React.memo(function EventCardConnected({
   eventId,
   editMode,
   highlightTokens,
}) {
   const bus = useContext(CalendarBusCtx);

   const ev = useSelector(
      (s) =>
         (s.reservations?.list ?? []).find(
            (r) => String(r.id) === String(eventId)
         ),
      shallowEqual
   );

   const person = useMemo(() => {
      const raw = (ev?.clientName ?? ev?.customerName ?? ev?.title ?? "") || "";
      return (
         (typeof raw === "string" ? raw.trim() : String(raw).trim()) ||
         "Programare"
      );
   }, [ev]);

   const colorClass = useMemo(() => {
      const token = normalizeColor(ev?.color);
      return colorClassMap[token] ?? colorClassMap["--default"];
   }, [ev]);

   const timeFmt = useMemo(
      () =>
         new Intl.DateTimeFormat("ro-RO", {
            timeZone: "Europe/Chisinau",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
         }),
      []
   );
   const hhmm = (val) => timeFmt.format(val ? new Date(val) : new Date());

   if (!ev) return null;

   const openReservation = () => {
      if (editMode || !ev.id) return;
      bus.editReservation?.({ id: ev.id });
   };

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
         <span className="dayview__event-person-name">
            {highlightTokens ? highlightTokens(person) : person}
         </span>

         <div
            className="dv-meta-row"
            onDoubleClick={(e) => {
               e.stopPropagation();
               openReservation();
            }}
         >
            <span className="dv-meta-pill">{ev.isConfirmed ? "Da" : "Nu"}</span>
            <span className="dv-meta-pill">
               {hhmm(ev.startTime ?? ev.start)}
            </span>
         </div>

         {ev.privateMessage && (
            <p
               className="dayview__event-note"
               onClick={(e) => {
                  if (!editMode) openReservation();
               }}
            >
               {highlightTokens
                  ? highlightTokens(ev.privateMessage)
                  : ev.privateMessage}
            </p>
         )}
      </div>
   );
});
