// src/components/APanel/ACalendar.jsx
import React, { useState, useCallback, useMemo } from "react";
import { useDispatch } from "react-redux";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "moment/locale/ro";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { updateGroup } from "../../store/instructorsGroupSlice";
import ACustomToolbar from "./ACustomToolbar";
import CustomDayView from "./CustomDayView";

import {
   updateReservation,
   updateReservationColor,
   removeReservation,
   setReservationColorLocal,
} from "../../store/reservationsSlice";
import { updateInstructorWithUser } from "../../store/instructorsSlice";

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

   // Data controlată
   const [date, setDate] = useState(new Date());

   // NOTE
   const handleEdit = useCallback(
      ({ id, data }) => {
         dispatch(updateReservation({ id, data }));
      },
      [dispatch]
   );

   const handleChangeColor = useCallback(
      ({ id, color }) => {
         const token = color.startsWith("--") ? color : `--${color}`;
         dispatch(setReservationColorLocal({ id, color: token }));
         dispatch(updateReservationColor({ id, color: token }));
      },
      [dispatch]
   );

   const handleDelete = useCallback(
      ({ id }) => {
         dispatch(removeReservation(id));
      },
      [dispatch]
   );

   const handleViewStudent = useCallback(({ studentId }) => {
      // sidepanel elev
   }, []);

   const handleChangeInstructorOrder = useCallback(
      (id, order) => {
         dispatch(updateInstructorWithUser({ id, data: { order } })).catch(
            (err) => console.error("[PATCH ERROR instructors]", err)
         );
      },
      [dispatch]
   );

   const DayViewWithHandlers = useMemo(() => {
      const Comp = function DayViewWrapper(rbcProps) {
         return (
            <CustomDayView
               layout={{
                  slotHeight: "32px",
                  colWidth: "150px",
                  hoursColWidth: "64px",
                  groupGap: "16px",
               }}
               {...rbcProps}
               onJumpToDate={(d) => setDate(d)}
               onEdit={handleEdit}
               onChangeColor={handleChangeColor}
               onDelete={handleDelete}
               onViewStudent={handleViewStudent}
               onChangeInstructorOrder={handleChangeInstructorOrder}
               onSwapGroupOrder={async ({ updates }) => {
                  try {
                     return await Promise.all(
                        updates.map((u) =>
                           dispatch(updateGroup({ id: u.id, order: u.order }))
                        )
                     );
                  } catch (e) {
                     console.error("Eroare la schimbarea ordinii grupelor", e);
                     throw e;
                  }
               }}
            />
         );
      };
      Comp.title = CustomDayView.title;
      Comp.navigate = CustomDayView.navigate;
      if (CustomDayView.range) Comp.range = CustomDayView.range;
      return Comp;
   }, [
      handleEdit,
      handleChangeColor,
      handleDelete,
      handleViewStudent,
      handleChangeInstructorOrder,
      dispatch,
   ]);

   return (
      <div className="calendar">
         <Calendar
            className="calendar__frame"
            selectable
            localizer={localizer}
            events={events} // <<— DIRECT, fără formatări de oră
            startAccessor="start"
            endAccessor="end"
            date={date}
            onNavigate={(nextDate) => {
               if (typeof window !== "undefined" && window.__DV_NAV_STATE__) {
                  window.__DV_NAV_STATE__.suspendAutoJump = true;
               }
               setDate(nextDate);
            }}
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
               day: DayViewWithHandlers,
               week: true,
            }}
            formats={{
               timeGutterFormat: "HH:mm",
               eventTimeRangeFormat: ({ start, end }, culture, local) =>
                  `${local.format(start, "HH:mm", culture)}–${local.format(
                     end,
                     "HH:mm",
                     culture
                  )}`,
               dayHeaderFormat: (date, culture, local) =>
                  local.format(date, "ddd, DD MMM", culture),
               dayFormat: (date, culture, local) =>
                  local.format(date, "ddd, DD MMM", culture),
               weekdayFormat: (date, culture, local) =>
                  local.format(date, "ddd", culture),
               monthHeaderFormat: (date, culture, local) =>
                  local.format(date, "MMM YYYY", culture),
               dayRangeHeaderFormat: ({ start, end }, culture, local) => {
                  const sameMonth =
                     local.format(start, "MM", culture) ===
                     local.format(end, "MM", culture);
                  if (sameMonth) {
                     return `${local.format(
                        start,
                        "DD",
                        culture
                     )}–${local.format(end, "DD MMM YYYY", culture)}`;
                  }
                  return `${local.format(
                     start,
                     "DD MMM",
                     culture
                  )} – ${local.format(end, "DD MMM YYYY", culture)}`;
               },
               agendaHeaderFormat: ({ start, end }, culture, local) =>
                  `${local.format(start, "DD MMM", culture)} – ${local.format(
                     end,
                     "DD MMM YYYY",
                     culture
                  )}`,
               agendaDateFormat: (date, culture, local) =>
                  local.format(date, "ddd, DD MMM", culture),
            }}
         />
      </div>
   );
}

export default ACalendarView;
