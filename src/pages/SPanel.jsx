import React, { useEffect, useState } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import ro from "date-fns/locale/ro";
import "react-big-calendar/lib/css/react-big-calendar.css";

import Header from "../components/Header/Header";
import M3Progress from "../components/UI/M3Progress";
import { ReactSVG } from "react-svg";
import clockBG from "../assets/svg/clock-bg.svg";

import Clock from "react-clock";
import "react-clock/dist/Clock.css";
import CustomToolbar from "../components/Utils/CustomToolbar";
import SAddProg from "../components/Utils/SAddProg";

const locales = { "ro-RO": ro };

const localizer = dateFnsLocalizer({
   format,
   parse,
   startOfWeek,
   getDay,
   locales,
});

function SPanel() {
   const [value, setValue] = useState(new Date());
   const [events, setEvents] = useState([
      {
         title: "Lecția 1 (Vasile D.)",
         start: new Date(2025, 6, 1, 9, 0),
         end: new Date(2025, 6, 1, 11, 0),
      },
      {
         title: "Lecția 2 (Ana M.)",
         start: new Date(2025, 6, 1, 11, 0),
         end: new Date(2025, 6, 1, 13, 0),
      },
      {
         title: "Lecția 3 (Ion B.)",
         start: new Date(2025, 6, 2, 10, 0),
         end: new Date(2025, 6, 2, 12, 0),
      },
      {
         title: "Lecția 4 (Maria L.)",
         start: new Date(2025, 6, 2, 13, 0),
         end: new Date(2025, 6, 2, 15, 0),
      },
      {
         title: "Simulare traseu (Gheorghe R.)",
         start: new Date(2025, 6, 3, 15, 0),
         end: new Date(2025, 6, 3, 17, 0),
      },
      {
         title: "Recapitulare semne (Irina T.)",
         start: new Date(2025, 6, 4, 8, 30),
         end: new Date(2025, 6, 4, 10, 30),
      },
      {
         title: "Exerciții teoretice (Ana M.)",
         start: new Date(2025, 6, 5, 10, 0),
         end: new Date(2025, 6, 5, 12, 0),
      },
      {
         title: "Traseu oraș (Ion B.)",
         start: new Date(2025, 6, 5, 14, 0),
         end: new Date(2025, 6, 5, 16, 0),
      },
      {
         title: "Test teorie (Maria L.)",
         start: new Date(2025, 6, 6, 9, 0),
         end: new Date(2025, 6, 6, 11, 0),
      },
      {
         title: "Traseu drum național (Vasile D.)",
         start: new Date(2025, 6, 7, 16, 0),
         end: new Date(2025, 6, 7, 18, 0),
      },
      {
         title: "Lecția 10 (Ana M.)",
         start: new Date(2025, 6, 8, 10, 30),
         end: new Date(2025, 6, 8, 12, 30),
      },
      {
         title: "Traseu obstacole (Ion B.)",
         start: new Date(2025, 6, 8, 13, 0),
         end: new Date(2025, 6, 8, 15, 0),
      },
      {
         title: "Simulare traseu (Gheorghe R.)",
         start: new Date(2025, 6, 9, 11, 0),
         end: new Date(2025, 6, 9, 13, 0),
      },
      {
         title: "Lecția 13 (Irina T.)",
         start: new Date(2025, 6, 10, 9, 30),
         end: new Date(2025, 6, 10, 11, 30),
      },
      {
         title: "Traseu noapte (Vasile D.)",
         start: new Date(2025, 6, 11, 19, 0),
         end: new Date(2025, 6, 11, 21, 0),
      },
      {
         title: "Test simulare final (Ana M.)",
         start: new Date(2025, 6, 12, 8, 0),
         end: new Date(2025, 6, 12, 10, 0),
      },
      {
         title: "Semne rutiere (Ion B.)",
         start: new Date(2025, 6, 13, 12, 0),
         end: new Date(2025, 6, 13, 14, 0),
      },
      {
         title: "Lecție practică (Maria L.)",
         start: new Date(2025, 6, 14, 9, 0),
         end: new Date(2025, 6, 14, 11, 0),
      },
      {
         title: "Învățare drum rural (Gheorghe R.)",
         start: new Date(2025, 6, 14, 11, 0),
         end: new Date(2025, 6, 14, 13, 0),
      },
      {
         title: "Recapitulare generală (Irina T.)",
         start: new Date(2025, 6, 14, 14, 0),
         end: new Date(2025, 6, 14, 16, 0),
      },
      {
         title: "Traseu dealuri (Vasile D.)",
         start: new Date(2025, 6, 15, 8, 0),
         end: new Date(2025, 6, 15, 10, 0),
      },
      {
         title: "Parcare laterală (Ana M.)",
         start: new Date(2025, 6, 15, 10, 0),
         end: new Date(2025, 6, 15, 12, 0),
      },
      {
         title: "Viraje periculoase (Ion B.)",
         start: new Date(2025, 6, 16, 12, 0),
         end: new Date(2025, 6, 16, 14, 0),
      },
      {
         title: "Intersecții complicate (Maria L.)",
         start: new Date(2025, 6, 16, 15, 0),
         end: new Date(2025, 6, 16, 17, 0),
      },
      {
         title: "Traseu oraș noapte (Gheorghe R.)",
         start: new Date(2025, 6, 17, 18, 0),
         end: new Date(2025, 6, 17, 20, 0),
      },
      {
         title: "Simulare semafoare (Irina T.)",
         start: new Date(2025, 6, 18, 9, 0),
         end: new Date(2025, 6, 18, 11, 0),
      },
      {
         title: "Conducere defensivă (Vasile D.)",
         start: new Date(2025, 6, 19, 11, 0),
         end: new Date(2025, 6, 19, 13, 0),
      },
      {
         title: "Lecția 29 (Ana M.)",
         start: new Date(2025, 6, 19, 13, 30),
         end: new Date(2025, 6, 19, 15, 30),
      },
      {
         title: "Urcare rampă (Ion B.)",
         start: new Date(2025, 6, 20, 15, 0),
         end: new Date(2025, 6, 20, 17, 0),
      },
      {
         title: "Frânare de urgență (Maria L.)",
         start: new Date(2025, 6, 21, 8, 0),
         end: new Date(2025, 6, 21, 10, 0),
      },
      {
         title: "Priorități în trafic (Gheorghe R.)",
         start: new Date(2025, 6, 21, 11, 0),
         end: new Date(2025, 6, 21, 13, 0),
      },
      {
         title: "Lecția 33 (Irina T.)",
         start: new Date(2025, 6, 21, 14, 0),
         end: new Date(2025, 6, 21, 16, 0),
      },
      {
         title: "Reguli intersecții (Vasile D.)",
         start: new Date(2025, 6, 22, 10, 0),
         end: new Date(2025, 6, 22, 12, 0),
      },
      {
         title: "Exerciții traseu (Ana M.)",
         start: new Date(2025, 6, 23, 13, 0),
         end: new Date(2025, 6, 23, 15, 0),
      },
      {
         title: "Viraje strânse (Ion B.)",
         start: new Date(2025, 6, 24, 9, 0),
         end: new Date(2025, 6, 24, 11, 0),
      },
      {
         title: "Recapitulare rutieră (Maria L.)",
         start: new Date(2025, 6, 24, 12, 0),
         end: new Date(2025, 6, 24, 14, 0),
      },
      {
         title: "Lecția 37 (Gheorghe R.)",
         start: new Date(2025, 6, 25, 15, 0),
         end: new Date(2025, 6, 25, 17, 0),
      },
      {
         title: "Simulare traseu final (Irina T.)",
         start: new Date(2025, 6, 26, 16, 30),
         end: new Date(2025, 6, 26, 18, 30),
      },
      {
         title: "Comportament în trafic (Vasile D.)",
         start: new Date(2025, 6, 27, 9, 0),
         end: new Date(2025, 6, 27, 11, 0),
      },
      {
         title: "Examen simulare (Ana M.)",
         start: new Date(2025, 6, 27, 11, 0),
         end: new Date(2025, 6, 27, 13, 0),
      },
      {
         title: "Lecția 41 (Ion B.)",
         start: new Date(2025, 6, 28, 8, 0),
         end: new Date(2025, 6, 28, 10, 0),
      },
      {
         title: "Lecția 42 (Maria L.)",
         start: new Date(2025, 6, 28, 10, 0),
         end: new Date(2025, 6, 28, 12, 0),
      },
      {
         title: "Lecția 43 (Gheorghe R.)",
         start: new Date(2025, 6, 28, 12, 30),
         end: new Date(2025, 6, 28, 14, 30),
      },
      {
         title: "Lecția 44 (Irina T.)",
         start: new Date(2025, 6, 28, 15, 0),
         end: new Date(2025, 6, 28, 17, 0),
      },
      {
         title: "Recapitulare generală (Vasile D.)",
         start: new Date(2025, 6, 29, 9, 0),
         end: new Date(2025, 6, 29, 11, 0),
      },
      {
         title: "Verificare aptitudini (Ana M.)",
         start: new Date(2025, 6, 29, 11, 0),
         end: new Date(2025, 6, 29, 13, 0),
      },
      {
         title: "Simulare traseu interurban (Ion B.)",
         start: new Date(2025, 6, 30, 14, 0),
         end: new Date(2025, 6, 30, 16, 0),
      },
   ]);

   const [showForm, setShowForm] = useState(false);

   const handleAddEvents = (newEvents) => {
      setEvents((prev) => [...prev, ...newEvents]);
      setShowForm(false);
   };

   useEffect(() => {
      const interval = setInterval(() => setValue(new Date()), 1000);
      return () => clearInterval(interval);
   }, []);

   // calc progress
   const totalLectii = 30;
   const lectiiFinalizate = 12;

   const procent = Math.round((lectiiFinalizate / totalLectii) * 100);

   return (
      <>
         <Header
            status="student"
            showForm={showForm}
            setShowForm={setShowForm}
            onAddEvents={handleAddEvents}
         >
            <SAddProg />
         </Header>
         <main className="main">
            <section className="intro">
               <div className="intro__left">
                  <h2>
                     Bine ai venit,{" "}
                     <span className="highlight-name">{"Lucia"}</span>
                  </h2>
                  <p>
                     Aici poți gestiona contul tău, programa lecții și vedea
                     calendarul. Îți dorim spor la învățat și o experiență
                     plăcută în aplicație!
                  </p>
               </div>
               <div className="intro__right">
                  <div className="intro__progress">
                     <h2>Progresul Tău</h2>
                     <M3Progress percentage={procent} label=" " />
                     <span>
                        {lectiiFinalizate}/{totalLectii}
                     </span>
                  </div>
                  <div className="intro__clock-wrapper">
                     <div className="intro__clock">
                        <Clock
                           value={value}
                           className="material-clock"
                           renderMinuteMarks={false}
                           renderHourMarks={true}
                           renderNumbers={false}
                           hourHandLength={40}
                           hourHandOppositeLength={5}
                           minuteHandLength={60}
                           minuteHandOppositeLength={5}
                           secondHandLength={70}
                           hourHandWidth={4}
                           minuteHandWidth={5}
                           secondHandWidth={5}
                        />
                        <ReactSVG className="intro__clock-icon" src={clockBG} />
                     </div>
                     <div className="intro__date">
                        <h3>
                           20
                           <span>aug</span>
                        </h3>
                        <p>Lecția următoare</p>
                        <span>10-a</span>
                     </div>
                  </div>
               </div>
            </section>

            <section className="calendar">
               <div style={{ height: 500, marginTop: "2rem" }}>
                  <Calendar
                     localizer={localizer}
                     events={events}
                     startAccessor="start"
                     endAccessor="end"
                     views={["month", "week"]}
                     defaultView="month"
                     style={{
                        background: "white",
                        borderRadius: "12px",
                        padding: "1rem",
                     }}
                     messages={{
                        today: "Astăzi",
                        month: "Lună",
                        week: "Săptămână",
                        day: "Zi",
                        agenda: "Agendă",
                        noEventsInRange: "Nicio programare în această perioadă",
                     }}
                     components={{
                        toolbar: CustomToolbar,
                     }}
                  />
               </div>
            </section>
         </main>
      </>
   );
}

export default SPanel;
