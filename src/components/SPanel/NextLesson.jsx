// src/components/SPanel/NextLesson.jsx
import React, { useContext, useMemo } from "react";
import { UserContext } from "../../UserContext";
import { openPopup } from "../Utils/popupStore";

export default function NextLesson({
   nextLesson,
   nextLessonIndex,
   mode,
   instr,
}) {
   const { user } = useContext(UserContext);

   // Acceptă fie mode="instr", fie instr="instr", fie rolul din context
   const isInstructor = useMemo(
      () =>
         String(mode).toLowerCase() === "instr" ||
         String(instr).toLowerCase() === "instr" ||
         String(user?.role).toUpperCase() === "INSTRUCTOR",
      [mode, instr, user]
   );

   const hasLesson = !!nextLesson && !!nextLesson.start;
   const d = hasLesson ? new Date(nextLesson.start) : null;

   const day = hasLesson ? d.getDate() : "--";
   const monthShort = hasLesson
      ? d.toLocaleDateString("ro-RO", { month: "short" }).replaceAll(".", "")
      : "";

   const hh = hasLesson ? String(d.getHours()).padStart(2, "0") : "";
   const mm = hasLesson ? String(d.getMinutes()).padStart(2, "0") : "";
   const hhmm = hasLesson ? `${hh}:${mm}` : "";

   const hasOrdinal = nextLessonIndex !== null && nextLessonIndex !== undefined;

   let label;
   if (!hasLesson) {
      label = "Nicio lecție";
   } else if (isInstructor) {
      // Instructor: doar ora
      label = hhmm;
   } else if (hasOrdinal) {
      // Student/manager/admin: ordinea + ora
      label = `${nextLessonIndex}a / ${hhmm}`;
   } else {
      label = hhmm;
   }

   const handleClick = () => {
      if (!hasLesson) return;
      const popupName = isInstructor ? "instrEventInfo" : "eventInfo";
      openPopup(popupName, { event: nextLesson });
   };

   return (
      <div
         className={`intro__date${hasLesson ? " intro__date--clickable" : ""}`}
         onClick={handleClick}
         role={hasLesson ? "button" : undefined}
         tabIndex={hasLesson ? 0 : undefined}
         onKeyDown={(e) => {
            if (hasLesson && (e.key === "Enter" || e.key === " ")) {
               e.preventDefault();
               handleClick();
            }
         }}
         title={hasLesson ? "Deschide detalii lecție" : undefined}
      >
         <h3>
            {day}
            <span>{monthShort}</span>
         </h3>
         <p>Lecția următoare</p>
         <span>{label}</span>
      </div>
   );
}
