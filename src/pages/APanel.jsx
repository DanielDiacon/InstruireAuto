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
import Popup from "../components/Utils/Popup";
import { openPopup } from "../components/Utils/popupStore";
import addIcon from "../assets/svg/mdi--calendar-plus-outline.svg";

import { getAllReservations } from "../api/reservationsService";
import { getUsers } from "../api/usersService";
import { getGroups } from "../api/groupsService";
import { getInstructors } from "../api/instructorsService";
import { useSelector, useDispatch } from "react-redux";
import { fetchInstructors } from "../store/instructorsSlice";

import StudentsManager from "../components/APanel/StudentsManager";
import GroupManager from "../components/APanel/GroupManager";
import InstructorManager from "../components/APanel/InstructorManager";
import ClockDisplay from "../components/UI/ClockDisplay";
import ReservationHistory from "../components/APanel/ReservationHistory";
import ACalendarView from "../components/APanel/ACalendar";

import { useUserContext, UserContext } from "../UserContext";
import InstructorsGroupManager from "../components/APanel/InstructorsGroupManager";

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
   const links = [
      //{ link: "/student/portfolio", text: "Profil", icon: accIcon },
      { popup: "sAddProg", text: "Programare", icon: addIcon },
      //{ link: "/student", text: "Acasă", icon: homeIcon },
      //{ link: "/student", text: "Testare", icon: testIcon },
      //{ link: "/student", text: "Examen", icon: examIcon },
   ];
   const dispatch = useDispatch();

   const [events, setEvents] = useState([]);
   const [reservations, setReservations] = useState([]);
   const [users, setUsers] = useState([]);
   const [groups, setGroups] = useState([]);
   const [currentView, setCurrentView] = useState("month");
   const instructors = useSelector((state) => state.instructors.list);

   const { user } = useContext(UserContext);

   // Set document title
   useEffect(() => {
      document.title = "Instruire Auto | APanel";
   }, []);

   useEffect(() => {
      if (!user || user.role !== "ADMIN") return;

      // fetch Redux instructors
      dispatch(fetchInstructors());

      // fetch restul datelor
      async function fetchData() {
         try {
            const [resData, userData, groupData] = await Promise.all([
               getAllReservations(),
               getUsers(),
               getGroups(),
            ]);

            setReservations(resData);
            setUsers(userData);
            //console.log(resData);

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
   }, [user, dispatch]);

   // Filter events for week view (one per hour)
   const filterEventsForWeek = useCallback((events) => {
      const seen = new Set();
      return events.filter((event) => {
         const key = `${event.start.getFullYear()}-${event.start.getMonth()}-${event.start.getDate()}-${event.start.getHours()}`;
         if (seen.has(key)) return false;
         seen.add(key);
         return true;
      });
   }, []);

   const eventsToShow =
      currentView === "week" ? filterEventsForWeek(events) : events;

   const findUserById = (id) => users.find((u) => u.id === id);
   const findInstructorById = (id) =>
      instructors.find((inst) => inst.id === id);

   const getFormattedReservations = (reservations) => {
      return reservations.map((res) => {
         const start = new Date(res.startTime);
         const end = new Date(start.getTime() + 90 * 60 * 1000);
         const personUser = findUserById(res.userId);
         const instructorObj = findInstructorById(res.instructorId);

         const person = personUser
            ? `${personUser.firstName} ${personUser.lastName}`
            : "Anonim";
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

         return { id: res.id, start, end, time, person, instructor, status };
      });
   };
   const formattedReservations = getFormattedReservations(reservations);

   // Calendar slot click
   const handleDayClick = ({ start }) => {
      openPopup("dayInfo", {
         selectedDate: start,
         programari: formattedReservations,
      });
   };

   // Calendar event click
   const handleEventClick = (event) => {
      openPopup("dayInfo", {
         selectedDate: event.start,
         programari: formattedReservations,
      });
   };

   const handleViewChange = (view) => setCurrentView(view);
   return (
      <>
         <Header links={links}>
            <Popup />
         </Header>
         <main className="main">
            <section className="intro admin">
               <StudentsManager />
               <div className="intro__right">
                  <GroupManager />
                  <div className="intro__clock-wrapper">
                     <ClockDisplay />
                     <InstructorManager
                        instructors={instructors}
                        openPopup={openPopup}
                     />
                  </div>
               </div>
            </section>

            <section className="modules">
               <ReservationHistory
                  formattedReservations={formattedReservations}
               />
               <InstructorsGroupManager></InstructorsGroupManager>
            </section>
            <ACalendarView
               events={events}
               localizer={localizer}
               currentView={currentView}
               onSelectSlot={handleDayClick}
               onSelectEvent={handleEventClick}
               onViewChange={handleViewChange}
            />
         </main>
      </>
   );
}

export default APanel;
