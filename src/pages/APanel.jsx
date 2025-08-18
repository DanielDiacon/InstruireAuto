import React, { useContext, useEffect, useState, useCallback } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import ro from "date-fns/locale/ro";
import "react-big-calendar/lib/css/react-big-calendar.css";

import Header from "../components/Header/Header";
import "react-clock/dist/Clock.css";
import ADayInfo from "../components/Popups/ADayInfo";
import { openPopup } from "../components/Utils/popupStore";

import { calendarEvents } from "../data/generateEvents";
import { getAllReservations } from "../api/reservationsService";
import { getUsers } from "../api/usersService";
import {
   createGroups,
   deleteGroup,
   getGroups,
   patchGroup,
} from "../api/groupsService";
import { getInstructors } from "../api/instructorsService";
import { useUserContext, UserContext } from "../UserContext";
import Popup from "../components/Utils/Popup";
import ReservationHistory from "../components/APanel/ReservationHistory";
import GroupManager from "../components/APanel/GroupManager";
import ACalendarView from "../components/APanel/ACalendar";
import InstructorManager from "../components/APanel/InstructorManager";
import ClockDisplay from "../components/UI/ClockDisplay";
import StudentsManager from "../components/APanel/StudentsManager";

// Calendar locale config
const locales = { "ro-RO": ro };
const localizer = dateFnsLocalizer({
   format,
   parse,
   startOfWeek,
   getDay,
   locales,
});

function APanel() {
   // --- States ---
   const [selectedDate, setSelectedDate] = useState(null);
   const [selectedHourEvents, setSelectedHourEvents] = useState([]);
   const [showDayPopup, setShowDayPopup] = useState(false);
   const [currentView, setCurrentView] = useState("month");
   const [events, setEvents] = useState(calendarEvents);
   const [reservations, setReservations] = useState([]);
   const [users, setUsers] = useState([]);
   const [groups, setGroups] = useState([]);
   const [instructors, setInstructors] = useState([]);

   const { user } = useContext(UserContext);
   // --- Effects ---
   useEffect(() => {
      document.title = "Instruire Auto | APanel";
   }, []);

   // Fetch date inițiale: rezervări, utilizatori, grupe

   useEffect(() => {
      async function fetchData() {
         if (!user || user.role !== "ADMIN") return;

         try {
            const [resData, userData, groupData, instructorData] =
               await Promise.all([
                  getAllReservations(),
                  getUsers(),
                  getGroups(),
                  getInstructors(), // 👈 aici
               ]);

            setReservations(resData);
            setUsers(userData);
            setInstructors(instructorData); // 👈 aici

            const sortedGroups = groupData.sort(
               (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
            );
            setGroups(sortedGroups);

            const formattedEvents = resData.map((item) => {
               const start = new Date(item.startTime);
               const end = new Date(start.getTime() + 90 * 60 * 1000);
               return { id: item.id, title: "Programare", start, end };
            });
            setEvents(formattedEvents);
         } catch (err) {
            console.error("Eroare la preluare:", err);
         }
      }

      fetchData();
   }, [user]);

   // --- Funcții ajutătoare ---

   // Filtrare evenimente pentru săptămână (unice pe oră)
   const filterEventsForWeek = useCallback((events) => {
      const seen = new Set();
      return events.filter((event) => {
         const key = `${event.start.getFullYear()}-${event.start.getMonth()}-${event.start.getDate()}-${event.start.getHours()}-${event.start.getMinutes()}`;
         if (seen.has(key)) return false;
         seen.add(key);
         return true;
      });
   }, []);

   // Evenimente filtrate în funcție de view
   const eventsToShow =
      currentView === "week" ? filterEventsForWeek(events) : events;

   // Formatare rezervare pentru afișare

   // Selectare zi în calendar (slot)
   const handleDayClick = ({ start }) => {
      const eventsAtThatHour = events.filter((ev) => {
         const evStart = new Date(ev.start);
         return (
            evStart.getFullYear() === start.getFullYear() &&
            evStart.getMonth() === start.getMonth() &&
            evStart.getDate() === start.getDate() &&
            evStart.getHours() === start.getHours() &&
            evStart.getMinutes() === start.getMinutes()
         );
      });

      openPopup("dayInfo", {
         selectedDate: start,
         programari: formattedReservations,
      });
   };

   const handleEventClick = (event) => {
      const hour = event.start.getHours();
      const minute = event.start.getMinutes();

      const eventsAtThatHour = events.filter((ev) => {
         const evStart = new Date(ev.start);
         return (
            evStart.getFullYear() === event.start.getFullYear() &&
            evStart.getMonth() === event.start.getMonth() &&
            evStart.getDate() === event.start.getDate() &&
            evStart.getHours() === hour &&
            evStart.getMinutes() === minute
         );
      });

      openPopup("dayInfo", {
         selectedDate: event.start,
         programari: formattedReservations,
      });
   };

   // Schimbare view calendar
   const handleViewChange = (view) => setCurrentView(view);

   const findUserById = (id) => users.find((u) => u.id === id);
   const findInstructorById = (id) =>
      instructors.find((inst) => inst.id === id);

   const getFormattedReservations = (
      reservations,
      findUserById,
      findInstructorById
   ) => {
      return reservations.map((res) => {
         const start = new Date(res.startTime);
         const end = new Date(start.getTime() + 90 * 60 * 1000); // 90 min

         const personUser = findUserById(res.userId);
         const person = personUser
            ? `${personUser.firstName} ${personUser.lastName}`
            : "Anonim";

         const instructorObj = findInstructorById(res.instructorId);
         const instructor = instructorObj
            ? `${instructorObj.firstName} ${instructorObj.lastName}`
            : "Necunoscut";

         const status = res.status || "pending";

         const time = `${start.getHours()}:${start
            .getMinutes()
            .toString()
            .padStart(2, "0")} - ${end.getHours()}:${end
            .getMinutes()
            .toString()
            .padStart(2, "0")}`;

         return {
            id: res.id,
            start,
            end,
            time,
            person,
            instructor,
            status,
         };
      });
   };
   const formattedReservations = getFormattedReservations(
      reservations,
      findUserById,
      findInstructorById
   );

   const [selectedStudent, setSelectedStudent] = useState(null);
   const handleSelectStudent = (student) => {
      setSelectedStudent(student);
   };

   // ---- Render ----
   return (
      <>
         <Header>
            {/*<SAddProg />*/}
            {/*<AAddProg />*/}
            <Popup />
            <ADayInfo
               selectedDate={selectedDate}
               showDayPopup={showDayPopup}
               formatReservation
               programari={formattedReservations}
            />
         </Header>
         <main className="main">
            <section className="intro admin">
               <StudentsManager />
               <div className="intro__right">
                  <GroupManager onSelectStudent={handleSelectStudent} />

                  <div className="intro__clock-wrapper">
                     <ClockDisplay />

                     <InstructorManager
                        instructors={instructors}
                        openPopup={openPopup}
                     />
                  </div>
               </div>
            </section>

            <section className="calendar">
               <ACalendarView
                  events={eventsToShow}
                  localizer={localizer}
                  currentView={currentView}
                  onSelectSlot={handleDayClick} // click pe o zi liberă
                  onSelectEvent={handleEventClick} // click pe eveniment existent
                  onViewChange={handleViewChange} // schimbare lună/săptămână
               />
            </section>
            <section className="modules">
               <ReservationHistory
                  formattedReservations={formattedReservations}
               />
               {/*<ReservationHistory
                  formattedReservations={formattedReservations}
               />*/}
            </section>
         </main>
      </>
   );
}

export default APanel;
