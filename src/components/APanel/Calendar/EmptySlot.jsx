// src/components/Calendar/Day/EmptySlot.jsx
import React from "react";

export default function EmptySlot({ slot, onCreate }) {
   return (
      <div
        className="eventcard dayview__event dayview__event--default"
         data-empty="1"
         role="button"
         tabIndex={0}
         onDoubleClick={(e) => {
            e.stopPropagation();
            onCreate();
         }}
         onClick={(e) => {
            e.stopPropagation();
            if (e.detail >= 2) onCreate();
         }}
         onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onCreate();
         }}
         draggable={false}
      >
         <div className="dv-meta-row dv-meta-row--solo">
            <span className="dv-meta-pill">
               {new Date(slot.start).toLocaleTimeString("ro-RO", {
                  hour: "2-digit",
                  minute: "2-digit",
               })}
            </span>
         </div>
      </div>
   );
}
