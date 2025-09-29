import React, { useContext, useEffect, useState, useCallback } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import ro from "date-fns/locale/ro";
import "react-big-calendar/lib/css/react-big-calendar.css";

import Header from "../../components/Header/Header";
import "react-clock/dist/Clock.css";
import Popup from "../../components/Utils/Popup";
import { openPopup } from "../../components/Utils/popupStore";
import addIcon from "../../assets/svg/mdi--calendar-plus-outline.svg";
import accIcon from "../../assets/svg/acc.svg";
import clockIcon from "../../assets/svg/clock.svg";
import groupsIcon from "../../assets/svg/material-symbols--group-outline.svg";
import instrGroupsIcon from "../../assets/svg/material-symbols--group-add-outline.svg";
import instrIcon from "../../assets/svg/mdi--account-cog-outline.svg";
import homeIcon from "../../assets/svg/material-symbols--home-outline.svg";

import { getAllReservations } from "../../api/reservationsService";
import { getUsers } from "../../api/usersService";
import { useSelector, useDispatch } from "react-redux";
import { fetchInstructors } from "../../store/instructorsSlice";

import ACalendarView from "../../components/APanel/ACalendar";

import { UserContext } from "../../UserContext";
import SubPopup from "../../components/Utils/SubPopup";

// Calendar locale config
const locales = { "ro-RO": ro };
const localizer = dateFnsLocalizer({
   format,
   parse,
   startOfWeek,
   getDay,
   locales,
});

function APCalendar() {
   const links = [
      { popup: "profile", text: "Profil", icon: accIcon },
      { popup: "addProg", text: "Programare", icon: addIcon },
      { popup: "addInstr", text: "Instrucori", icon: instrIcon },
      { link: "/admin/groups", text: "Grupe", icon: groupsIcon },
      {
         link: "/admin/instr-groups",
         text: "Ins. Grupe",
         icon: instrGroupsIcon,
      },
      { link: "/admin", text: "Acasă", icon: homeIcon },

      { link: "/admin/history", text: "Istoric", icon: clockIcon },
   ];
   const dispatch = useDispatch();

   const [events, setEvents] = useState([]);
   const [reservations, setReservations] = useState([]);
   const [users, setUsers] = useState([]);
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
            const [resData, userData] = await Promise.all([
               getAllReservations(),
               getUsers(),
            ]);

            setReservations(resData);
            setUsers(userData);

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
            <SubPopup />
            <Popup />
         </Header>
         <main className="main">
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

export default APCalendar;
