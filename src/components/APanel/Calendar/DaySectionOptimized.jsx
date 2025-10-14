import React, { useMemo } from "react";
import InstructorColumn from "./InstructorColumn.connected";

export default function DaySectionOptimized({
   dayTs,
   instIds,
   groupedEventIds, // Map<instId, string[]>
   slots,
   editMode,
   highlightTokens,
   onCreateFromEmpty,
}) {
   const shortTitle = useMemo(() => {
      const d = new Date(dayTs);
      return new Intl.DateTimeFormat("ro-RO", {
         weekday: "short",
         day: "2-digit",
         month: "short",
      })
         .format(d)
         .replace(",", "");
   }, [dayTs]);

   return (
      <section
         className="dayview__group-wrap"
         style={{ flex: "0 0 auto" }}
         aria-label={shortTitle}
         data-dayid={`day_${dayTs}`}
         data-active="1"
      >
         <header className="dayview__group-header">
            <div className="dayview__group-title">{shortTitle}</div>
         </header>

         <div className="dayview__group-content dayview__group-content--row">
            <div className="dayview__columns" style={{ "--cols": 3 }}>
               {instIds.map((instId) => (
                  <InstructorColumn
                     key={`${dayTs}-${instId}`}
                     dayTs={dayTs}
                     instId={instId}
                     eventIds={groupedEventIds.get(instId) ?? []}
                     slots={slots}
                     editMode={editMode}
                     highlightTokens={highlightTokens}
                     onCreateFromEmpty={onCreateFromEmpty}
                  />
               ))}
            </div>
         </div>
      </section>
   );
}
