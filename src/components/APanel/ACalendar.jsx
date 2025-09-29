// src/components/Calendar/ACalendarView.jsx
import React, { useState, useCallback, useMemo } from "react";
import { useDispatch } from "react-redux";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "moment/locale/ro";
import "react-big-calendar/lib/css/react-big-calendar.css";
import {
   fetchInstructorsGroups,
   updateGroup,
} from "../../store/instructorsGroupSlice";
import ACustomToolbar from "./ACustomToolbar";
import CustomDayView from "./CustomDayView";

import {
   updateReservation,
   updateReservationColor,
   removeReservation,
   setReservationColorLocal,
} from "../../store/reservationsSlice";

// 👇 ADĂUGAT: thunk-ul care face PATCH /api/instructors/{id}
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

   // 👇 ADĂUGAT: handler care trimite stringul de ordine la backend
   const handleChangeInstructorOrder = useCallback(
      (id, order) => {
         // PATCH /api/instructors/{id} cu body: { order: "..." }
         const body = { order };
         console.log("[PATCH instructors] →", {
            url: `/api/instructors/${id}`,
            body,
         });
         dispatch(updateInstructorWithUser({ id, data: body }))
            .then((res) => {
               console.log("[PATCH OK instructors] ←", res);
            })
            .catch((err) => {
               console.error("[PATCH ERROR instructors] ←", err);
            });
      },
      [dispatch]
   );

   // Wrapper pt. Day view — o singură definiție
   const DayViewWithHandlers = useMemo(() => {
      const Comp = function DayViewWrapper(rbcProps) {
         return (
            <CustomDayView
               layout={{
                  slotHeight: "32px", // înălțimea unui slot (30min) în CSS
                  colWidth: "150px", // lățimea coloanei instructorului
                  hoursColWidth: "12%", // lățimea coloanei cu ore
                  groupGap: "16px",
                  //containerHeight: "80vh",
                  hoursColWidth: "64px",
               }}
               {...rbcProps} // include `date` controlat de Calendar
               onJumpToDate={(d) => setDate(d)} // pt. auto-jump din search
               onEdit={handleEdit}
               onChangeColor={handleChangeColor}
               onDelete={handleDelete}
               onViewStudent={handleViewStudent}
               // 👇 ADĂUGAT: patch order către backend
               onChangeInstructorOrder={handleChangeInstructorOrder}
               // swap order grupe (NU schimbă nume, NU rupe funcționalul)
               onSwapGroupOrder={async ({ updates }) => {
                  try {
                     return await Promise.all(
                        updates.map((u) =>
                           dispatch(updateGroup({ id: u.id, order: u.order }))
                        )
                     );
                  } catch (e) {
                     console.error("Eroare la schimbarea ordinii grupelor", e);
                     throw e; // lasă eroarea să ajungă în catch-ul din CustomDayView (rollback)
                  }
               }}
            />
         );
      };
      // propagăm staticile cerute de RBC
      Comp.title = CustomDayView.title;
      Comp.navigate = CustomDayView.navigate;
      if (CustomDayView.range) Comp.range = CustomDayView.range;
      return Comp;
   }, [
      handleEdit,
      handleChangeColor,
      handleDelete,
      handleViewStudent,
      handleChangeInstructorOrder, // asigură re-memo corect
      dispatch,
   ]);

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
               // ore în gutter
               timeGutterFormat: "HH:mm",

               // interval eveniment
               eventTimeRangeFormat: ({ start, end }, culture, local) =>
                  `${local.format(start, "HH:mm", culture)}–${local.format(
                     end,
                     "HH:mm",
                     culture
                  )}`,

               // label pentru header-ul „Zi” (Day view)
               dayHeaderFormat: (date, culture, local) =>
                  local.format(date, "ddd, DD MMM", culture), // ex: „lun, 22 aug”

               // etichetele de deasupra coloanelor în Week view (Lu, Ma, … + data)
               dayFormat: (date, culture, local) =>
                  local.format(date, "ddd, DD MMM", culture), // ex: „lun, 22 aug”

               // numele scurte ale zilelor (Monthly grid header)
               weekdayFormat: (date, culture, local) =>
                  local.format(date, "ddd", culture), // „lun”, „mar”…

               // header-ul din Month view („Sept 2025” scurt)
               monthHeaderFormat: (date, culture, local) =>
                  local.format(date, "MMM YYYY", culture), // „sept. 2025”

               // header-ul din Week view („22–28 aug 2025” scurt)
               dayRangeHeaderFormat: ({ start, end }, culture, local) => {
                  const sameMonth =
                     local.format(start, "MM", culture) ===
                     local.format(end, "MM", culture);
                  if (sameMonth) {
                     // „22–28 aug 2025”
                     return `${local.format(
                        start,
                        "DD",
                        culture
                     )}–${local.format(end, "DD MMM YYYY", culture)}`;
                  }
                  // „30 aug – 05 sept 2025”
                  return `${local.format(
                     start,
                     "DD MMM",
                     culture
                  )} – ${local.format(end, "DD MMM YYYY", culture)}`;
               },

               // (opțional) agenda
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
