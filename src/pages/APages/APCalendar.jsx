// src/pages/Admin/APCalendar.jsx
import React, { useEffect } from "react";

import "react-clock/dist/Clock.css";

import ACalendarViewOptimized from "../../components/APanel/Calendar/ACalendarOptimized";

function APCalendar() {
   useEffect(() => {
      document.title = "Instruire Auto | APanel";
   }, []);

   return (
      <>
         <main className="main">
            <ACalendarViewOptimized />
         </main>
      </>
   );
}

export default APCalendar;
