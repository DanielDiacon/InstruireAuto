import React from "react";
import { Calendar } from "react-big-calendar";
import CustomToolbar from "../SPanel/SCustomToolbar";

function ACalendarView({
   events,
   localizer,
   onSelectSlot,
   onSelectEvent,
   onViewChange,
}) {
   return (
      <div style={{ height: 500, marginTop: "2rem" }}>
         <Calendar
            selectable
            onSelectSlot={onSelectSlot}
            onSelectEvent={onSelectEvent}
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            views={["month", "week"]}
            defaultView="month"
            onView={onViewChange}
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
            components={{ toolbar: CustomToolbar }}
         />
      </div>
   );
}

export default ACalendarView;
