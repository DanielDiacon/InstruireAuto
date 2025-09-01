import React from "react";
import { Calendar } from "react-big-calendar";
import SCustomToolbar from "./SCustomToolbar";

/* Event personalizat: pune click direct pe conținutul evenimentului */
function SEvent({ event, title, onSelectEvent }) {
   const onClick = (e) => {
      e.stopPropagation();
      if (typeof onSelectEvent === "function") onSelectEvent(event, e);
   };
   const onKey = (e) => {
      if (e.key === "Enter" || e.key === " ") {
         e.preventDefault();
         onClick(e);
      }
   };

   return (
      <div
         className="s-event-content"
         role="button"
         tabIndex={0}
         onClick={onClick}
         onKeyDown={onKey}
         style={{ width: "100%", outline: "none", cursor: "pointer" }}
         title={title}
      >
         {title}
      </div>
   );
}

export default function SCalendar({
   localizer,
   events,
   culture = "ro-RO",
   formats,
   messages,
   defaultView = "week",
   views = ["week", "day", "agenda", "month"],
   step = 30,
   timeslots = 2,
   min,
   max,
   onSelectEvent, // <- IMPORTANT: îl primim
   ...rest
}) {
   return (
      <Calendar
         localizer={localizer}
         events={events}
         culture={culture}
         formats={formats}
         messages={messages}
         startAccessor="start"
         endAccessor="end"
         defaultView={defaultView}
         views={views}
         step={step}
         timeslots={timeslots}
         min={min}
         max={max}
         /* Forțăm clickabil + protecție contra overlay-urilor */
         eventPropGetter={() => ({
            style: {
               pointerEvents: "auto",
               cursor: "pointer",
               zIndex: 1,
            },
         })}
         /* Legăm și handlerul standard, și fallback pe dublu-click */
         onSelectEvent={onSelectEvent}
         onDoubleClickEvent={onSelectEvent}
         /* Injectăm event componentul nostru care dă onClick direct pe conținut */
         components={{
            toolbar: SCustomToolbar,
            event: (props) => (
               <SEvent {...props} onSelectEvent={onSelectEvent} />
            ),
         }}
         {...rest}
      />
   );
}
