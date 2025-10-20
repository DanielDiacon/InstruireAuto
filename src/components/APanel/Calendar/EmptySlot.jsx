import React from "react";

const MOLDOVA_TZ = "Europe/Chisinau";

function formatHMChisinau(dateLike) {
   const d = new Date(dateLike);
   return new Intl.DateTimeFormat("ro-RO", {
      timeZone: MOLDOVA_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
   }).format(d);
}

// ⬇️ doar am adăugat isBlackout (implicit false)
export default function EmptySlot({ slot, onCreate, isBlackout = false }) {
   const label = slot?.start ? formatHMChisinau(slot.start) : "--:--";

   return (
      <div
         className={
            // ⬇️ păstrez clasele tale EXACT și adaug condițional marcajul vizual
            `eventcard dayview__event dayview__event--default${
               isBlackout ? " dayview__event--blocked" : ""
            }`
         }
         data-empty="1"
         role="button"
         tabIndex={0}
         title={isBlackout ? "Oră blocată (vizual)" : "Slot liber"}
         onDoubleClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onCreate();
         }}
         onClick={(e) => {
            e.stopPropagation();
            if (e.detail >= 2) {
               e.preventDefault();
               onCreate();
            }
         }}
         onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
               e.preventDefault();
               onCreate();
            }
         }}
         draggable={false}
      >
         <div className="dv-meta-row dv-meta-row--solo">
            <span className="dv-meta-pill">{label}</span>
         </div>
      </div>
   );
}
