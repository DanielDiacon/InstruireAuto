// src/pages/SPanel.jsx
import { useContext, useEffect, useState } from "react";
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
import { getReservations } from "../api/reservationsService";
import ReservationsProgress from "../components/SPanel/ReservationsProgress";
import NextLesson from "../components/SPanel/NextLesson";
import PanelHeader from "../components/SPanel/PanelHeader";
import ClockDisplay from "../components/UI/ClockDisplay";

import accIcon from "../assets/svg/acc.svg";
import addIcon from "../assets/svg/mdi--calendar-plus-outline.svg";
import calendarIcon from "../assets/svg/mdi--calendar-outline.svg";
import testIcon from "../assets/svg/material-symbols--book-outline.svg";
import examIcon from "../assets/svg/mdi--book-clock-outline.svg";
import homeIcon from "../assets/svg/material-symbols--home-outline.svg";

import { openPopup } from "../components/Utils/popupStore";
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

// —— helper: “floating date” (păstrează HH:mm exact, ignoră Z/offset) ——
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
         val.getMilliseconds(),
      );
   }

   if (typeof val === "string") {
      const m = val.match(
         /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+\-]\d{2}:\d{2})?$/,
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
         d.getMilliseconds(),
      );
   }
   return null;
}

/* ====== Helpers pentru format scurt (fără punct) ====== */
const shortWeekday = (date, l, culture) =>
   l.format(date, "EEE", culture).replaceAll(".", "");

const shortMonth = (date, l, culture) =>
   l.format(date, "MMM", culture).replaceAll(".", "");

const dayCell2Lines = (date, culture, l) => {
   const d = l.format(date, "d", culture);
   const w = shortWeekday(date, l, culture);
   return `${d}\n${w}`;
};

/* ====== Formate consistente Week/Day/Month ====== */
const formats = {
   // WEEK: header-ul pe zile (dublu rând)
   dayFormat: dayCell2Lines,
   weekdayFormat: (date, culture, l) => shortWeekday(date, l, culture),

   // label în toolbar pentru Week view
   dayRangeHeaderFormat: ({ start, end }, culture, l) => {
      const sameMonth =
         l.format(start, "M", culture) === l.format(end, "M", culture);

      if (sameMonth) {
         return `${l.format(start, "d", culture)}–${l.format(
            end,
            "d",
            culture,
         )} ${shortMonth(start, l, culture)}`;
      }

      return `${l.format(start, "d", culture)} ${shortMonth(
         start,
         l,
         culture,
      )} – ${l.format(end, "d", culture)} ${shortMonth(end, l, culture)}`;
   },

   // DAY: label în toolbar pentru Day view (scurt + fără punct)
   dayHeaderFormat: (date, culture, l) => {
      const d = l.format(date, "d", culture);
      const m = shortMonth(date, l, culture);
      const y = l.format(date, "yyyy", culture);
      const w = shortWeekday(date, l, culture);
      return `${d} ${m} ${y} · ${w}`;
   },

   // MONTH: label în toolbar pentru Month view (scurt + fără punct)
   monthHeaderFormat: (date, culture, l) =>
      `${shortMonth(date, l, culture)} ${l.format(date, "yyyy", culture)}`,

   // TIME
   timeGutterFormat: "HH:mm",
   eventTimeRangeFormat: ({ start, end }, culture, l) =>
      `${l.format(start, "HH:mm", culture)}–${l.format(end, "HH:mm", culture)}`,

   // AGENDA (opțional, consistent)
   agendaHeaderFormat: ({ start, end }, culture, l) =>
      formats.dayRangeHeaderFormat({ start, end }, culture, l),
   agendaDateFormat: (date, culture, l) =>
      `${l.format(date, "d", culture)} ${shortMonth(date, l, culture)}`,
   agendaTimeFormat: "HH:mm",
   agendaTimeRangeFormat: ({ start, end }, culture, l) =>
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

function SPanel() {
   const links = [
      { link: "/student", text: "Acasă", icon: homeIcon },
      { link: "/student/calendar", text: "Calendar", icon: calendarIcon },
      { popup: "sAddProg", text: "Programare", icon: addIcon },
      { link: "/student/test", text: "Testare", icon: testIcon },
      { link: "/student/exam", text: "Examen", icon: examIcon },
      { popup: "profile", text: "Profil", icon: accIcon },
   ];

   const { user } = useContext(UserContext);
   const totalLectii = 30;
   const [lectiiFinalizate, setLectiiFinalizate] = useState(0);
   const [nextLesson, setNextLesson] = useState(null);
   const [nextLessonIndex, setNextLessonIndex] = useState(null);
   const [events, setEvents] = useState([]);

   useEffect(() => {
      (async () => {
         try {
            const data = await getReservations();
            const now = new Date();

            const formatted = data.map((item) => {
               const start = toFloatingDate(item.startTime);
               const end = item.endTime
                  ? toFloatingDate(item.endTime)
                  : new Date(start.getTime() + 90 * 60 * 1000);

               return {
                  id: item.id,
                  title: "Programare",
                  start,
                  end,
                  instructor: item.instructor,
                  phone: item.phone || item.instructor?.phone,
                  isConfirmed: item.isConfirmed,
                  gearbox: item.gearbox,
                  sector: item.sector,
               };
            });

            setEvents(formatted);

            const pastLessons = formatted.filter((e) => e.end < now).length;
            setLectiiFinalizate(pastLessons);

            const sorted = [...formatted].sort((a, b) => a.start - b.start);
            const upcoming = sorted.find((e) => e.start >= now);
            const idx = sorted.findIndex((e) => e.start >= now) + 1;

            if (upcoming) {
               setNextLesson(upcoming);
               setNextLessonIndex(idx);
            }
         } catch (e) {
            console.error("Eroare la preluarea rezervărilor:", e);
         }
      })();
   }, []);

   const handleEventClick = (event) => {
      openPopup("eventInfo", { event });
   };

   const MIN_TIME = new Date(1970, 0, 1, 7, 0, 0);
   const MAX_TIME = new Date(1970, 0, 1, 21, 0, 0);

   return (
      <>
         <Header links={links}>
            <Popup />
         </Header>

         <main className="main">
            <section className="intro student">
               <PanelHeader user={user} />
               <div className="intro__right">
                  <ReservationsProgress
                     lectiiFinalizate={lectiiFinalizate}
                     totalLectii={totalLectii}
                  />
                  <div className="intro__clock-wrapper">
                     <ClockDisplay />
                     <NextLesson
                        nextLesson={nextLesson}
                        nextLessonIndex={nextLessonIndex}
                     />
                  </div>
               </div>
            </section>

            <section className="calendar student">
               <SCalendar
                  localizer={localizer}
                  culture="ro-RO"
                  events={events}
                  formats={formats} // ✅ aici e schimbarea
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

export default SPanel;
