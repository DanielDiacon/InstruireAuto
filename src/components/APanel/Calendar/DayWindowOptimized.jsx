import React, { useMemo } from "react";
import DaySection from "./DaySectionOptimized";
import { useSelector, shallowEqual } from "react-redux";
import { makeSelEventIdsByInstructorForDay } from "./calendarSelectors";

function ConnectedDaySection({
   dayTs,
   sectorNorm,
   mkStandardSlotsForDay,
   editMode,
   highlightTokens,
   onCreateFromEmpty,
}) {
   const selByDay = useMemo(() => makeSelEventIdsByInstructorForDay(), []);
   const { grouped, instIds } = useSelector(
      (s) => selByDay(s, dayTs, sectorNorm),
      shallowEqual
   );

   const slots = useMemo(
      () => mkStandardSlotsForDay(new Date(dayTs)),
      [mkStandardSlotsForDay, dayTs]
   );

   return (
      <DaySection
         dayTs={dayTs}
         instIds={instIds}
         groupedEventIds={grouped}
         slots={slots}
         editMode={editMode}
         highlightTokens={highlightTokens}
         onCreateFromEmpty={onCreateFromEmpty}
      />
   );
}

export default function DayWindow({
   visibleDayTs,
   winStart,
   WINDOW,
   DAY_W,
   DAY_GAP,
   mkStandardSlotsForDay,
   sectorNorm,
   editMode,
   highlightTokens,
   onCreateFromEmpty,
}) {
   return (
      <div
         className="dv-window"
         style={{
            position: "absolute",
            left: `${winStart * DAY_W}px`,
            top: 0,
            display: "flex",
            gap: `${DAY_GAP}px`,
            width: `${WINDOW * DAY_W - DAY_GAP}px`,
            willChange: "transform",
            transform: "translateZ(0)",
         }}
      >
         {Array.from({ length: WINDOW }).map((_, slotIdx) => {
            const dayIdx = winStart + slotIdx;
            const inRange = dayIdx >= 0 && dayIdx < visibleDayTs.length;
            const style = { flex: "0 0 auto", width: `${DAY_W - 20}px` };

            if (!inRange) return <div key={`wslot-${slotIdx}`} style={style} />;

            const dayTs = visibleDayTs[dayIdx];
            return (
               <div key={`wslot-${slotIdx}`} style={style}>
                  <ConnectedDaySection
                     dayTs={dayTs}
                     sectorNorm={sectorNorm}
                     mkStandardSlotsForDay={mkStandardSlotsForDay}
                     editMode={editMode}
                     highlightTokens={highlightTokens}
                     onCreateFromEmpty={onCreateFromEmpty}
                  />
               </div>
            );
         })}
      </div>
   );
}
