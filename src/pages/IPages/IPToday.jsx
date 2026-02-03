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

import Header from "../../components/Header/Header";
import Popup from "../../components/Utils/Popup";
import SCalendar from "../../components/SPanel/SCalendar";

import { UserContext } from "../../UserContext";
import {
   getReservations,
   getAllReservations,
   getInstructorReservations,
} from "../../api/reservationsService";
import { getInstructors } from "../../api/instructorsService";

import NextLesson from "../../components/SPanel/NextLesson";
import ClockDisplay from "../../components/Common/ClockDisplay";

import accIcon from "../../assets/svg/acc.svg";
import calendarIcon from "../../assets/svg/mdi--calendar-outline.svg";
import groupsIcon from "../../assets/svg/material-symbols--group-outline.svg";
import homeIcon from "../../assets/svg/material-symbols--home-outline.svg";
import todayIcon from "../../assets/svg/material-symbols--today-outline.svg";
import { openPopup } from "../../components/Utils/popupStore";
import InstrGroups from "../../components/IPanel/InstrGroups";
import TodayInfo from "../../components/IPanel/TodayInfo";

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

function IPToday() {
   const links = [
      // 👇 nou: link de Acasă pentru instructor, la fel ca la admin/manager
      { link: "/instructor", text: "Acasă", icon: homeIcon },
      { link: "/instructor/calendar", text: "Calendar", icon: calendarIcon },
      { link: "/instructor/today", text: "Azi", icon: todayIcon },
      { link: "/instructor/groups", text: "Grupe", icon: groupsIcon },
      { popup: "profile", text: "Profil", icon: accIcon },
   ];

   return (
      <>
       

         <main className="main ">
            <section className="page-wrapper">
               <TodayInfo />
            </section>
         </main>
      </>
   );
}

export default IPToday;
