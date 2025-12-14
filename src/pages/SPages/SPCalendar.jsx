import { useEffect, useState } from "react";
import { dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import ro from "date-fns/locale/ro";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-circular-progressbar/dist/styles.css";
import "react-clock/dist/Clock.css";

import Header from "../../components/Header/Header";
import Popup from "../../components/Utils/Popup";
import SCalendar from "../../components/SPanel/SCalendar";
import { getReservations } from "../../api/reservationsService";

// icoane
import accIcon from "../../assets/svg/acc.svg";
import addIcon from "../../assets/svg/mdi--calendar-plus-outline.svg";
import homeIcon from "../../assets/svg/material-symbols--home-outline.svg";
import testIcon from "../../assets/svg/material-symbols--book-outline.svg";
import examIcon from "../../assets/svg/mdi--book-clock-outline.svg";
import { openPopup } from "../../components/Utils/popupStore";
import calendarIcon from "../../assets/svg/mdi--calendar-outline.svg";

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

// ——— helper: parsează “floating” și păstrează HH:mm exact ca în string ———
function toFloatingDate(val) {
   if (!val) return null;

   if (val instanceof Date && !isNaN(val)) {
      // re-constituim ca local wall-clock (fără TZ)
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
      // 2025-10-07T13:30[:ss][.sss][Z|±HH:MM]
      const m = val.match(
         /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+\-]\d{2}:\d{2})?$/
      );
      if (m) {
         const [, Y, Mo, D, h, mi, s] = m;
         return new Date(+Y, +Mo - 1, +D, +h, +mi, s ? +s : 0, 0);
      }
      // doar data: 2025-10-07
      const m2 = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m2) {
         const [, Y, Mo, D] = m2;
         return new Date(+Y, +Mo - 1, +D, 0, 0, 0, 0);
      }
   }

   // fallback
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

// titlu: 25–31 aug / 25 aug – 2 sept
const shortMonth = (date, l, culture) =>
   l.format(date, "MMM", culture).replaceAll(".", "");

const formats = {
   // Week view: două rânduri în headerul coloanei → "24\nlun"
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

function SPCalendar() {
   const links = [
      // 👇 nou: Acasă pentru student, ca să fie root /student
      { link: "/student", text: "Acasă", icon: homeIcon },
      { link: "/student/calendar", text: "Calendar", icon: calendarIcon },
      { popup: "sAddProg", text: "Programare", icon: addIcon },
      { link: "/student/test", text: "Testare", icon: testIcon },
      { link: "/student/exam", text: "Examen", icon: examIcon },
      { popup: "profile", text: "Profil", icon: accIcon },
   ];

   const [events, setEvents] = useState([]);

   useEffect(() => {
      (async () => {
         try {
            const data = await getReservations();
            const formatted = data.map((item) => {
               // IMPORTANT: parse “floating” → 13:30 rămâne 13:30 pe UI
               const start = toFloatingDate(item.startTime);
               // dacă backend dă și endTime, îl folosim; altfel 90'
               const end = item.endTime
                  ? toFloatingDate(item.endTime)
                  : new Date(start.getTime() + 90 * 60 * 1000);

               return {
                  id: item.id,
                  title: "Programare",
                  start,
                  end,
                  instructor: item.instructor,
                  isConfirmed: item.isConfirmed,
                  gearbox: item.gearbox,
                  sector: item.sector,
               };
            });

            setEvents(formatted);
         } catch (e) {
            console.error("Eroare la preluarea rezervărilor:", e);
         }
      })();
   }, []);

   const handleEventClick = (event) => {
      openPopup("eventInfo", { event });
   };

   // interval vizibil în Week view: 07:00–21:00
   const MIN_TIME = new Date(1970, 0, 1, 7, 0, 0);
   const MAX_TIME = new Date(1970, 0, 1, 21, 0, 0);

   return (
      <>
         <Header links={links}>
            <Popup />
         </Header>

         <main className="main">
            <section className="calendar page">
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
         </main>
      </>
   );
}

export default SPCalendar;
