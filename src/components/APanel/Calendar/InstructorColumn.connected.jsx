import React, { useMemo, useContext } from "react";
import { useSelector, shallowEqual } from "react-redux";
import EventCard from "./EventCard.connected";
import EmptySlot from "./EmptySlot";
import { CalendarBusCtx } from "./CalendarBus";

function toDateLike(v) {
   if (!v) return null;
   if (v instanceof Date) return v;
   return new Date(v);
}

function overlaps(aStart, aEnd, bStart, bEnd) {
   const aS = +aStart,
      aE = +aEnd,
      bS = +bStart,
      bE = +bEnd;
   return Math.max(aS, bS) < Math.min(aE, bE);
}

export default React.memo(
   function InstructorColumnConnected({
      dayTs,
      instId,
      eventIds, // <- listă stabilă (vine din cache-ul DayView)
      slots,
      editMode,
      highlightTokens,
   }) {
      const bus = useContext(CalendarBusCtx);

      const instructor = useSelector(
         (s) =>
            (s.instructors?.list ?? []).find(
               (i) => String(i.id) === String(instId)
            ),
         shallowEqual
      );

      const title = useMemo(() => {
         if (!instructor) return "Necunoscut";
         return (
            `${instructor.firstName ?? ""} ${
               instructor.lastName ?? ""
            }`.trim() || "Necunoscut"
         );
      }, [instructor]);

      const events = useSelector(
         (s) =>
            eventIds
               .map((id) =>
                  (s.reservations?.list ?? []).find(
                     (r) => String(r.id) === String(id)
                  )
               )
               .filter(Boolean)
               .map((r) => {
                  const start = toDateLike(
                     r.startTime ?? r.start ?? r.startedAt
                  );
                  const end =
                     toDateLike(r.endTime ?? r.end ?? r.end_at) ||
                     new Date(start.getTime() + 90 * 60000);
                  return { id: String(r.id), start, end, raw: r };
               }),
         shallowEqual
      );

      return (
         <div className="dayview__column">
            <header className="dayview__inst-name">{title || "—"}</header>

            <div className="dayview__grid">
               {slots.map((slot, idx) => {
                  const slotStart = new Date(slot.start);
                  const slotEnd = new Date(slot.end);
                  const slotEvents = events.filter((e) =>
                     overlaps(e.start, e.end, slotStart, slotEnd)
                  );

                  return (
                     <div key={idx} className="dayview__cell">
                        {slotEvents.length === 0 ? (
                           <EmptySlot
                              slot={slot}
                              onCreate={() =>
                                 bus.createFromEmpty?.({
                                    instructorId: instId,
                                    start: slotStart,
                                    end: slotEnd,
                                 })
                              }
                           />
                        ) : (
                           slotEvents.map((e) => (
                              <EventCard
                                 key={`${e.id}-${idx}`}
                                 eventId={e.id}
                                 editMode={editMode}
                                 highlightTokens={highlightTokens}
                              />
                           ))
                        )}
                     </div>
                  );
               })}
            </div>
         </div>
      );
   },
   (prev, next) => {
      if (prev.instId !== next.instId) return false;
      if (prev.editMode !== next.editMode) return false;
      if (prev.eventIds !== next.eventIds) return false; // listă stabilă din cache
      if (prev.dayTs !== next.dayTs) return false;
      return true;
   }
);
