import React from "react";
import { Calendar } from "react-big-calendar";
import SCustomToolbar from "./SCustomToolbar";

export default function SCalendar({ localizer, events }) {
   return (
      <div style={{ height: 500, marginTop: "2rem" }}>
         <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            views={["month", "week"]}
            defaultView="month"
            style={{
               background: "white",
               borderRadius: "12px",
               padding: "1rem",
            }}
            messages={{
               today: "Astăzi",
               month: "Lună",
               week: "Săptămână",
               day: "Zi",
               agenda: "Agendă",
               noEventsInRange: "Nicio programare în această perioadă",
            }}
            components={{ toolbar: SCustomToolbar }}
         />
      </div>
   );
}
