import React, { useEffect, useMemo, useState } from "react";

import CalendarPlusOptimized from "./ACalendarOptimized";
import CalendarPlusVirtualGrid from "./CalendarPlusVirtualGrid";
import CalendarPlusWorkerGrid from "./CalendarPlusWorkerGrid";

const LS_ENGINE_KEY = "__CALENDAR_PLUS_ENGINE";
const ENGINE_CANVAS = "canvas";
const ENGINE_VGRID = "virtual-grid";
const ENGINE_WORKER = "worker-grid";

function readSavedEngine() {
   if (typeof window === "undefined") return ENGINE_WORKER;
   const saved = localStorage.getItem(LS_ENGINE_KEY);
   return saved === ENGINE_CANVAS || saved === ENGINE_VGRID || saved === ENGINE_WORKER
      ? saved
      : ENGINE_WORKER;
}

export default function CalendarPlusLab() {
   const [engine, setEngine] = useState(readSavedEngine);

   useEffect(() => {
      if (typeof window === "undefined") return;
      localStorage.setItem(LS_ENGINE_KEY, engine);
   }, [engine]);

   const options = useMemo(
      () => [
         { id: ENGINE_WORKER, label: "Worker Grid (Ultra Experiment)" },
         { id: ENGINE_VGRID, label: "Virtual Grid (Experiment)" },
         { id: ENGINE_CANVAS, label: "Canvas (Baseline)" },
      ],
      [],
   );

   return (
      <section className="calendarplus-lab">
         <header className="calendarplus-lab__header">
            <div className="calendarplus-lab__title">
               <h2>Calendar Plus Lab</h2>
               <p>Experimentare de performanță pe motor separat.</p>
            </div>

            <div className="calendarplus-lab__switch">
               {options.map((opt) => (
                  <button
                     key={opt.id}
                     type="button"
                     className={
                        "calendarplus-lab__switch-btn" +
                        (engine === opt.id ? " is-active" : "")
                     }
                     onClick={() => setEngine(opt.id)}
                  >
                     {opt.label}
                  </button>
               ))}
            </div>
         </header>

         <div className="calendarplus-lab__content">
            {engine === ENGINE_CANVAS ? (
               <CalendarPlusOptimized />
            ) : engine === ENGINE_WORKER ? (
               <CalendarPlusWorkerGrid />
            ) : (
               <CalendarPlusVirtualGrid />
            )}
         </div>
      </section>
   );
}
