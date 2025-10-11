// src/pages/Manager/MPCalendar.jsx
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
import examIcon from "../../assets/svg/mdi--book-clock-outline.svg";

import { getAllReservations } from "../../api/reservationsService";
import { getUsers } from "../../api/usersService";
import { useSelector, useDispatch } from "react-redux";
import { fetchInstructors } from "../../store/instructorsSlice";

import ACalendarView from "../../components/APanel/ACalendar";

import { UserContext } from "../../UserContext";
import SubPopup from "../../components/Utils/SubPopup";
import PreloadAppData from "../../components/Utils/PreloadAppData";

// Calendar locale config
const locales = { "ro-RO": ro };
const localizer = dateFnsLocalizer({
   format,
   parse,
   startOfWeek,
   getDay,
   locales,
});

/** Parsează “floating”: păstrează HH:mm exact din string, ignoră Z/offset */
function toFloatingDate(val) {
   if (!val) return null;

   if (val instanceof Date && !isNaN(val)) {
      return new Date(
         val.getFullYear(),
         val.getMonth(),
         val.getDate(),
         val.getHours(),
         val.getMinutes(),
         val.getSeconds(),
         val.getMilliseconds()
      );
   }

   if (typeof val === "string") {
      const m = val.match(
         /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+\-]\d{2}:\d{2})?$/
      );
      if (m) {
         const [, Y, Mo, D, h, mi, s] = m;
         return new Date(+Y, +Mo - 1, +D, +h, +mi, s ? +s : 0, 0);
      }
      const m2 = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m2) {
         const [, Y, Mo, D] = m2;
         return new Date(+Y, +Mo - 1, +D, 0, 0, 0, 0);
      }
   }

   const d = new Date(val);
   if (!isNaN(d)) {
      return new Date(
         d.getFullYear(),
         d.getMonth(),
         d.getDate(),
         d.getHours(),
         d.getMinutes(),
         d.getSeconds(),
         d.getMilliseconds()
      );
   }
   return null;
}

function MPCalendar() {
   const links = [
      { link: "/manager", text: "Acasă", icon: homeIcon },
      { popup: "addProg", text: "Programare", icon: addIcon },
      { popup: "addInstr", text: "Instrucori", icon: instrIcon },
      { popup: "startExam", text: "Examen", icon: examIcon },
      { link: "/manager/groups", text: "Grupe", icon: groupsIcon },
      {
         link: "/manager/instr-groups",
         text: "Ins. Grupe",
         icon: instrGroupsIcon,
      },
      { link: "/manager/history", text: "Istoric", icon: clockIcon },
      { popup: "profile", text: "Profil", icon: accIcon },
   ];

   const dispatch = useDispatch();

   const [events, setEvents] = useState([]);
   const [reservations, setReservations] = useState([]);
   const [users, setUsers] = useState([]);
   const [currentView, setCurrentView] = useState("month");
   const instructors = useSelector((state) => state.instructors.list);

   const { user } = useContext(UserContext);

   useEffect(() => {
      document.title = "Instruire Auto | Manager";
   }, []);

   useEffect(() => {
      dispatch(fetchInstructors());

      async function fetchData() {
         try {
            const [resData, userData] = await Promise.all([
               getAllReservations(),
               getUsers(),
            ]);

            setReservations(resData);
            setUsers(userData);

            // IMPORTANT: fără corecții de fus — păstrăm ora exact din payload
            const formattedEvents = resData.map((item) => {
               const start = toFloatingDate(item.startTime);
               const end = item.endTime
                  ? toFloatingDate(item.endTime)
                  : new Date(start.getTime() + 90 * 60 * 1000);
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
      const pad = (n) => String(n).padStart(2, "0");
      return reservations.map((res) => {
         const start = toFloatingDate(res.startTime);
         const end = res.endTime
            ? toFloatingDate(res.endTime)
            : new Date(start.getTime() + 90 * 60 * 1000);
         const personUser = findUserById(res.userId);
         const instructorObj = findInstructorById(res.instructorId);

         const person = personUser
            ? `${personUser.firstName} ${personUser.lastName}`
            : "Anonim";
         const instructor = instructorObj
            ? `${instructorObj.firstName} ${instructorObj.lastName}`
            : "Necunoscut";
         const status = res.status || "pending";
         const time = `${pad(start.getHours())}:${pad(
            start.getMinutes()
         )} - ${pad(end.getHours())}:${pad(end.getMinutes())}`;

         return { id: res.id, start, end, time, person, instructor, status };
      });
   };
   const formattedReservations = getFormattedReservations(reservations);

   const handleDayClick = ({ start }) => {
      openPopup("dayInfo", {
         selectedDate: start,
         programari: formattedReservations,
      });
   };

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
               events={events} // ← DIRECT, fără conversii
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

export default MPCalendar;
