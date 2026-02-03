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
import calendarIcon from "../../assets/svg/mdi--calendar-outline.svg";
import { openPopup } from "../../components/Utils/popupStore";
import Practice from "../../components/SPanel/Practice";
import PracticeStatistics from "../../components/SPanel/PracticeStatistics";

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
   // Numele scurt al zilelor (folosit în Month view)
   weekdayFormat: (date, culture, l) =>
      l.format(date, "EEE", culture).replaceAll(".", ""),
   // Titlul mare al săptămânii
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

function SPTest() {
   const links = [
      // 👇 nou: Acasă pentru student, ca să fie root /student
      { link: "/student", text: "Acasă", icon: homeIcon },
      { link: "/student/calendar", text: "Calendar", icon: calendarIcon },
      { popup: "sAddProg", text: "Programare", icon: addIcon },
      { link: "/student/test", text: "Testare", icon: testIcon },
      { link: "/student/exam", text: "Examen", icon: examIcon },
      { popup: "profile", text: "Profil", icon: accIcon },
   ];

   return (
      <>
         <main className="main">
            <section className="test page">
               <Practice />
               <PracticeStatistics />
            </section>
         </main>
      </>
   );
}

export default SPTest;
