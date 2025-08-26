// src/components/Calendar/ACalendarView.jsx
import React, { useState, useCallback, useMemo } from "react";
import { useDispatch } from "react-redux";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "moment/locale/ro";
import "react-big-calendar/lib/css/react-big-calendar.css";

import ACustomToolbar from "./ACustomToolbar";
import CustomDayView from "./CustomDayView";

import {
   updateReservation,
   updateReservationColor,
   removeReservation,
   setReservationColorLocal,
} from "../../store/reservationsSlice";

moment.locale("ro");
const localizer = momentLocalizer(moment);

function ACalendarView({
   events,
   groups,
   onSelectSlot,
   onSelectEvent,
   onViewChange,
}) {
   const dispatch = useDispatch();

   // Data VIZUALIZATĂ controlată de părinte (Calendar)
   const [date, setDate] = useState(new Date());

   // NOTE
   const handleEdit = useCallback(
      ({ id, data }) => {
         dispatch(updateReservation({ id, data }));
      },
      [dispatch]
   );

   // COLOR (token ex. "--green")
   const handleChangeColor = useCallback(
      ({ id, color }) => {
         const token = color.startsWith("--") ? color : `--${color}`;
         dispatch(setReservationColorLocal({ id, color: token })); // feedback instant
         dispatch(updateReservationColor({ id, color: token })); // PATCH
      },
      [dispatch]
   );

   // DELETE
   const handleDelete = useCallback(
      ({ id }) => {
         dispatch(removeReservation(id));
      },
      [dispatch]
   );

   const handleViewStudent = useCallback(({ studentId }) => {
      // deschizi pagina/sidepanel elev
   }, []);

   // Wrapper pt. Day view
   const DayViewWithHandlers = useMemo(() => {
      const Comp = function DayViewWrapper(rbcProps) {
         return (
            <CustomDayView
               layout={{
                  slotHeight: "32px", // înălțimea unui slot (30min) în CSS
                  colWidth: "150px", // lățimea coloanei instructorului
                  hoursColWidth: "12%", // lățimea coloanei cu ore
                  groupGap: "16px",
                  containerHeight: "80vh",
               }}
               {...rbcProps} // include `date` controlat de Calendar
               onJumpToDate={(d) => setDate(d)} // pt. auto-jump din search
               onEdit={handleEdit}
               onChangeColor={handleChangeColor}
               onDelete={handleDelete}
               onViewStudent={handleViewStudent}
            />
         );
      };
      // propagăm staticile cerute de RBC
      Comp.title = CustomDayView.title;
      Comp.navigate = CustomDayView.navigate;
      if (CustomDayView.range) Comp.range = CustomDayView.range;
      return Comp;
   }, [handleEdit, handleChangeColor, handleDelete, handleViewStudent]);

   return (
      <div className="calendar">
         <Calendar
            className="calendar__frame"
            selectable
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            // ——— CONTROLĂM DATA AICI ———
            date={date}
            onNavigate={(nextDate) => {
               // orice navigare manuală oprește auto-jump-ul curent
               if (typeof window !== "undefined" && window.__DV_NAV_STATE__) {
                  window.__DV_NAV_STATE__.suspendAutoJump = true;
               }
               setDate(nextDate);
            }}
            // ————————————————
            defaultView="day"
            components={{ toolbar: ACustomToolbar }}
            onSelectSlot={onSelectSlot}
            onSelectEvent={onSelectEvent}
            onView={onViewChange}
            min={new Date(2024, 0, 1, 7, 0)}
            max={new Date(2024, 0, 1, 21, 0)}
            step={30}
            timeslots={2}
            messages={{
               today: "Astăzi",
               month: "Lună",
               week: "Săptămână",
               day: "Zi",
               agenda: "Agendă",
               noEventsInRange: "Nicio programare în această perioadă",
            }}
            views={{
               month: true,
               day: DayViewWithHandlers, // view personalizat
               week: true,
            }}
            formats={{
               timeGutterFormat: "HH:mm",
               eventTimeRangeFormat: ({ start, end }, culture, local) =>
                  `${local.format(start, "HH:mm", culture)} – ${local.format(
                     end,
                     "HH:mm",
                     culture
                  )}`,
               dayFormat: (date, culture, local) =>
                  local.format(date, "dddd, DD MMMM YYYY", culture),
            }}
         />
      </div>
   );
}

export default ACalendarView;
