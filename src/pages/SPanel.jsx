import React, { useContext, useEffect, useState } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import ro from "date-fns/locale/ro";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

import Header from "../components/Header/Header";
import { ReactSVG } from "react-svg";
import clockBG from "../assets/svg/clock-bg.svg";

import Clock from "react-clock";
import "react-clock/dist/Clock.css";
import CustomToolbar from "../components/SPanel/SCustomToolbar";
import SAddProg from "../components/Popups/SAddProg";
import { UserContext } from "../UserContext";
import { getReservations } from "../api/reservationsService";
import ClockDisplay from "../components/UI/ClockDisplay";
import ReservationsProgress from "../components/SPanel/ReservationsProgress";
import NextLesson from "../components/SPanel/NextLesson";
import PanelHeader from "../components/SPanel/PanelHeader";
import SCalendar from "../components/SPanel/SCalendar";
import Popup from "../components/Utils/Popup";
const locales = { "ro-RO": ro };

const localizer = dateFnsLocalizer({
   format,
   parse,
   startOfWeek,
   getDay,
   locales,
});

function SPanel() {
   const { user } = useContext(UserContext);
   const totalLectii = 30;
   const [lectiiFinalizate, setLectiiFinalizate] = useState(0);
   const [nextLesson, setNextLesson] = useState(null);
   const [nextLessonIndex, setNextLessonIndex] = useState(null);
   const [events, setEvents] = useState([]);

   useEffect(() => {
      async function fetchReservations() {
         try {
            const data = await getReservations();

            const now = new Date();

            // 1. Transformăm datele
            const formattedEvents = data.map((item) => {
               const start = new Date(item.startTime);
               const end = new Date(start.getTime() + 90 * 60 * 1000); // 90 minute
               return {
                  id: item.id,
                  title: "Programare",
                  start,
                  end,
               };
            });

            // 2. Setăm în calendar
            setEvents(formattedEvents);

            // 3. Lecții trecute
            const pastLessons = formattedEvents.filter(
               (event) => event.end < now
            ).length;
            setLectiiFinalizate(pastLessons);

            // 4. Lecția viitoare + index
            const sortedEvents = [...formattedEvents].sort(
               (a, b) => a.start - b.start
            );
            const upcomingLesson = sortedEvents.find(
               (event) => event.start >= now
            );
            const indexOfUpcoming =
               sortedEvents.findIndex((event) => event.start >= now) + 1;

            if (upcomingLesson) {
               setNextLesson(upcomingLesson);
               setNextLessonIndex(indexOfUpcoming);
            }
         } catch (error) {
            console.error("Eroare la preluarea rezervărilor:", error);
         }
      }

      fetchReservations();
   }, []);

   const [showForm, setShowForm] = useState(false);

   const handleAddEvents = (newEvents) => {
      setEvents((prev) => [...prev, ...newEvents]);
      setShowForm(false);
   };

   // calc progress
   const percentage = Math.round((lectiiFinalizate / totalLectii) * 100);
   return (
      <>
         <Header
            showForm={showForm}
            setShowForm={setShowForm}
            onAddEvents={handleAddEvents}
         >
            <SAddProg />
            <Popup />
         </Header>
         <main className="main">
            <section className="intro">
               <PanelHeader user={user} />
               <div className="intro__right">
                  <ReservationsProgress
                     lectiiFinalizate={lectiiFinalizate}
                     totalLectii={totalLectii}
                     nextLesson={nextLesson}
                     nextLessonIndex={nextLessonIndex}
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

            <section className="calendar">
               <SCalendar localizer={localizer} events={events} />
            </section>
         </main>
      </>
   );
}

export default SPanel;
