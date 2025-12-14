// src/pages/IPanel.jsx
import { useContext, useEffect, useMemo, useState } from "react";
import { dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import ro from "date-fns/locale/ro";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-circular-progressbar/dist/styles.css";
import "react-clock/dist/Clock.css";

import Header from "../components/Header/Header";
import Popup from "../components/Utils/Popup";
import SCalendar from "../components/SPanel/SCalendar";

import { UserContext } from "../UserContext";
import {
   getReservations,
   getAllReservations,
   getInstructorReservations,
} from "../api/reservationsService";
import { getInstructors } from "../api/instructorsService";

import NextLesson from "../components/SPanel/NextLesson";
import ClockDisplay from "../components/UI/ClockDisplay";

import accIcon from "../assets/svg/acc.svg";
import calendarIcon from "../assets/svg/mdi--calendar-outline.svg";
import groupsIcon from "../assets/svg/material-symbols--group-outline.svg";
import todayIcon from "../assets/svg/material-symbols--today-outline.svg";
import homeIcon from "../assets/svg/material-symbols--home-outline.svg"; // 👈 nou

import { openPopup } from "../components/Utils/popupStore";
import InstrGroups from "../components/IPanel/InstrGroups";
import TodayInfo from "../components/IPanel/TodayInfo";
import ExamPermissionPanel from "../components/SPanel/ExamPermissionPanel";
import Footer from "../components/Footer";

/* ========= Localizer + RO formats/messages ========= */
const locales = { ro, "ro-RO": ro };
const startOfWeekRO = (date) =>
   startOfWeek(date, { weekStartsOn: 1, locale: ro });

const localizer = dateFnsLocalizer({
   format,
   parse,
   startOfWeek: startOfWeekRO,
   getDay,
   locales,
});

const shortMonth = (date, l, culture) =>
   l.format(date, "MMM", culture).replaceAll(".", "");

const formats = {
   dayFormat: (date, culture, l) => {
      const d = l.format(date, "d", culture);
      const z = l.format(date, "EEE", culture).replaceAll(".", "");
      return `${d}\n${z}`;
   },
   weekdayFormat: (date, culture, l) =>
      l.format(date, "EEE", culture).replaceAll(".", ""),
   dayRangeHeaderFormat: ({ start, end }, culture, l) => {
      const sameMonth =
         l.format(start, "M", culture) === l.format(end, "M", culture);
      if (sameMonth) {
         return `${l.format(start, "d", culture)}–${l.format(
            end,
            "d",
            culture
         )} ${shortMonth(start, l, culture)}`;
      }
      return `${l.format(start, "d", culture)} ${shortMonth(
         start,
         l,
         culture
      )} – ${l.format(end, "d", culture)} ${shortMonth(end, l, culture)}`;
   },
   timeGutterFormat: "HH:mm",
   eventTimeRangeFormat: ({ start, end }, culture, l) =>
      `${l.format(start, "HH:mm", culture)}–${l.format(end, "HH:mm", culture)}`,
};

const messagesRO = {
   date: "Data",
   time: "Ora",
   event: "Eveniment",
   allDay: "Toată ziua",
   week: "Săptămână",
   work_week: "Zile lucrătoare",
   day: "Zi",
   month: "Lună",
   previous: "Înapoi",
   next: "Înainte",
   yesterday: "Ieri",
   tomorrow: "Mâine",
   today: "Azi",
   agenda: "Agendă",
   noEventsInRange: "Nu sunt evenimente în acest interval.",
};

function IPanel() {
   const links = [
      // 👇 nou: link de Acasă pentru instructor, la fel ca la admin/manager
      { link: "/instructor", text: "Acasă", icon: homeIcon },
      { link: "/instructor/calendar", text: "Calendar", icon: calendarIcon },
      { link: "/instructor/today", text: "Azi", icon: todayIcon },
      { link: "/instructor/groups", text: "Grupe", icon: groupsIcon },
      { popup: "profile", text: "Profil", icon: accIcon },
   ];

   const { user } = useContext(UserContext);

   // prefer numele de pe instructor pentru rolul INSTRUCTOR
   const [myInstructor, setMyInstructor] = useState(null);
   const displayFirstName = useMemo(
      () =>
         user?.role === "INSTRUCTOR"
            ? myInstructor?.firstName || user?.firstName || ""
            : user?.firstName || "",
      [user, myInstructor]
   );
   const displayLastName = useMemo(
      () =>
         user?.role === "INSTRUCTOR"
            ? myInstructor?.lastName || user?.lastName || ""
            : user?.lastName || "",
      [user, myInstructor]
   );

   const [nextLesson, setNextLesson] = useState(null);
   const [nextLessonIndex, setNextLessonIndex] = useState(null);
   const [events, setEvents] = useState([]);

   // 1) găsește instructorul curent după userId
   useEffect(() => {
      let cancelled = false;
      (async () => {
         if (!user) return;
         if (user.role !== "INSTRUCTOR") {
            setMyInstructor(null);
            return;
         }
         try {
            const all = await getInstructors();
            const mine = all.find((i) => String(i.userId) === String(user.id));
            if (!cancelled) setMyInstructor(mine || null);
         } catch (e) {
            console.error("[IPanel] getInstructors failed:", e);
            if (!cancelled) setMyInstructor(null);
         }
      })();
      return () => {
         cancelled = true;
      };
   }, [user]);

   // 2) ia rezervările potrivite rolului
   useEffect(() => {
      let cancelled = false;

      const normStudent = (item) => {
         // 1) listă
         if (Array.isArray(item.students) && item.students.length)
            return {
               list: item.students,
               one: item.students.length === 1 ? item.students[0] : null,
            };
         if (Array.isArray(item.participants) && item.participants.length)
            return {
               list: item.participants,
               one:
                  item.participants.length === 1 ? item.participants[0] : null,
            };
         if (Array.isArray(item.users) && item.users.length)
            return {
               list: item.users,
               one: item.users.length === 1 ? item.users[0] : null,
            };
         // 2) single
         const one = item.student || item.user || null;
         return { list: one ? [one] : [], one };
      };

      const toEvent = (item) => {
         const start = new Date(item.startTime);
         const end = new Date(start.getTime() + 90 * 60 * 1000);

         const { list: studentsArr, one: studentObj } = normStudent(item);

         // telefon student (fallbacks)
         const studentPhone =
            studentObj?.phone ||
            studentObj?.tel ||
            studentObj?.phoneNumber ||
            studentObj?.phone_number ||
            null;

         return {
            id: item.id,
            title: "Programare",
            start,
            end,

            // instructor (cum venea din API)
            instructor: item.instructor,

            // prefer telefonul studentului; dacă nu există, las null
            phone: studentPhone,

            isConfirmed: item.isConfirmed,
            gearbox: item.gearbox,
            sector: item.sector,

            // date pentru popup (student)
            student: studentObj || null,
            students: studentsArr,
            studentsCount:
               item.studentsCount ?? item.totalStudents ?? studentsArr.length,
         };
      };

      (async () => {
         try {
            let raw = [];
            if (user?.role === "INSTRUCTOR") {
               if (myInstructor?.id) {
                  try {
                     raw = await getInstructorReservations(
                        myInstructor.id,
                        user.id
                     );
                  } catch (e) {
                     console.warn(
                        "[IPanel] /reservations/instructor/:id a eșuat, fallback la /reservations/all + filter",
                        e
                     );
                     const all = await getAllReservations();
                     raw = all.filter(
                        (r) =>
                           String(r.instructorId || r?.instructor?.id) ===
                              String(myInstructor.id) ||
                           String(r?.instructor?.userId) === String(user.id)
                     );
                  }
               } else {
                  return; // instructorul încă se încarcă
               }
            } else {
               raw = await getReservations();
            }

            const mapped = raw.map(toEvent);
            if (cancelled) return;

            setEvents(mapped);

            const now = new Date();
            const past = mapped.filter((e) => e.end < now).length;

            const sorted = [...mapped].sort((a, b) => a.start - b.start);
            const upcomingIdx = sorted.findIndex((e) => e.start >= now);
            const upcoming = upcomingIdx >= 0 ? sorted[upcomingIdx] : null;

            setNextLesson(upcoming || null);
            setNextLessonIndex(upcoming ? upcomingIdx + 1 : null);
         } catch (e) {
            console.error("[IPanel] Eroare la preluarea rezervărilor:", e);
         }
      })();

      return () => {
         cancelled = true;
      };
   }, [user, myInstructor]);

   const handleEventClick = (event) => {
      openPopup("instrEventInfo", { event });
   };

   const MIN_TIME = new Date(1970, 0, 1, 7, 0, 0);
   const MAX_TIME = new Date(1970, 0, 1, 21, 0, 0);


   return (
      <>
         <Header links={links}>
            <Popup />
         </Header>

         <main className="main">
            <section className="intro admin">
               <TodayInfo />
               <div className="intro__right">
                  <InstrGroups />

                  <div className="intro__clock-wrapper">
                     <ClockDisplay />
                     <NextLesson
                        nextLesson={nextLesson}
                        nextLessonIndex={nextLessonIndex}
                        instr="instr"
                     />
                  </div>
               </div>
            </section>

            <section className="calendar ipanel">
               <SCalendar
                  localizer={localizer}
                  culture="ro-RO"
                  events={events}
                  formats={formats}
                  messages={messagesRO}
                  defaultView="week"
                  views={["week", "day", "agenda", "month"]}
                  step={30}
                  timeslots={2}
                  min={MIN_TIME}
                  max={MAX_TIME}
                  onSelectEvent={handleEventClick}
               />
            </section>
            <Footer />
         </main>
      </>
   );
}

export default IPanel;
