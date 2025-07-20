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
import eyeIcon from "../assets/svg/eye.svg";
import editIcon from "../assets/svg/edit.svg";
import keyIcon from "../assets/svg/key.svg";
import addIcon from "../assets/svg/add-s.svg";
import cancelIcon from "../assets/svg/cancel.svg";
import successIcon from "../assets/svg/success.svg";
import clockIcon from "../assets/svg/clock.svg";

import Clock from "react-clock";
import "react-clock/dist/Clock.css";

import CustomToolbar from "../components/Utils/CustomToolbar";
import SOpenProgramari from "../components/Utils/SOpenProg";
import AOpenAddGroup from "../components/Utils/AddInstrBtn";
import AddInstrBtn from "../components/Utils/AddInstrBtn";
import AOpenProg from "../components/Utils/AOpenProg";
import ADayInfo from "../components/Utils/ADayInfo";
import SAddProg from "../components/Utils/SAddProg";
import AAddProg from "../components/Utils/AAddProg";
import AddInstr from "../components/Utils/AddInstr";
import searchIcon from "../assets/svg/search.svg";

import { generateEvents, calendarEvents } from "../data/generateEvents";

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
   // ---- Initialization ----
   useEffect(() => {
      document.title = "Instruire Auto | APanel";
   }, []);

   useEffect(() => {
      const interval = setInterval(() => setValue(new Date()), 1000);
      return () => clearInterval(interval);
   }, []);

   // ---- States ----
   const [value, setValue] = useState(new Date());
   const [selectedDate, setSelectedDate] = useState(null);
   const [selectedEvent, setSelectedEvent] = useState(null);
   const [selectedHourEvents, setSelectedHourEvents] = useState([]);
   const [showDayPopup, setShowDayPopup] = useState(false);
   const [showForm, setShowForm] = useState(false);
   const [newGroupName, setNewGroupName] = useState("");
   const [currentView, setCurrentView] = useState("month");
   const [events, setEvents] = useState(calendarEvents);
   const [searchOpen, setSearchOpen] = useState(false);

   const [groups, setGroups] = useState([
      { name: "Grupa-251", members: 2, key: "4BD54R3" },
      { name: "Grupa-315", members: 3, key: "9XR1K7D" },
      { name: "Grupa-251", members: 2, key: "4BD54R3" },
      { name: "Grupa-315", members: 3, key: "9XR1K7D" },
      { name: "Grupa-251", members: 2, key: "4BD54R3" },
      { name: "Grupa-315", members: 3, key: "9XR1K7D" },
      { name: "Grupa-251", members: 2, key: "4BD54R3" },
      { name: "Grupa-315", members: 3, key: "9XR1K7D" },
      { name: "Grupa-251", members: 2, key: "4BD54R3" },
      { name: "Grupa-315", members: 3, key: "9XR1K7D" },
      { name: "Grupa-251", members: 2, key: "4BD54R3" },
      { name: "Grupa-315", members: 3, key: "9XR1K7D" },
   ]);

   const mockHistory = [
      {
         id: 1,
         person: "Ana Ionescu",
         instructor: "Ion Popescu",
         time: "10:00 - 11:00",
         status: "completed",
      },
      {
         id: 2,
         person: "Mihai Tudor",
         instructor: null,
         time: "11:00 - 12:00",
         status: "pending",
      },
      {
         id: 4,
         person: "Ioana Filip",
         instructor: "Ion Popescu",
         time: "15:00 - 16:00",
         status: "cancelled",
      },
      {
         id: 1,
         person: "Ana Ionescu",
         instructor: "Ion Popescu",
         time: "10:00 - 11:00",
         status: "completed",
      },
      {
         id: 2,
         person: "Mihai Tudor",
         instructor: null,
         time: "11:00 - 12:00",
         status: "pending",
      },
      {
         id: 4,
         person: "Ioana Filip",
         instructor: "Ion Popescu",
         time: "15:00 - 16:00",
         status: "cancelled",
      },
      {
         id: 1,
         person: "Ana Ionescu",
         instructor: "Ion Popescu",
         time: "10:00 - 11:00",
         status: "completed",
      },
      {
         id: 2,
         person: "Mihai Tudor",
         instructor: null,
         time: "11:00 - 12:00",
         status: "pending",
      },
      {
         id: 4,
         person: "Ioana Filip",
         instructor: "Ion Popescu",
         time: "15:00 - 16:00",
         status: "cancelled",
      },
   ];

   // ---- Handlers ----
   const handleViewChange = (view) => {
      setCurrentView(view);
   };
   const handleDayClick = ({ start }) => {
      setSelectedDate(start);
      const hour = start.getHours();
      const minute = start.getMinutes();

      const eventsAtThatHour = events.filter((ev) => {
         const evStart = new Date(ev.start);
         return (
            evStart.getFullYear() === start.getFullYear() &&
            evStart.getMonth() === start.getMonth() &&
            evStart.getDate() === start.getDate() &&
            evStart.getHours() === hour &&
            evStart.getMinutes() === minute
         );
      });

      setSelectedHourEvents(eventsAtThatHour);
      setSelectedEvent(null);
      setShowDayPopup(true);
      document.body.classList.add("popup-day-info");
   };

   const handleEventClick = (event) => {
      const hour = event.start.getHours();
      const minute = event.start.getMinutes();

      const eventsAtThatHour = events.filter((ev) => {
         const evStart = new Date(ev.start);
         return (
            evStart.getFullYear() === event.start.getFullYear() &&
            evStart.getMonth() === event.start.getMonth() &&
            evStart.getDate() === event.start.getDate() &&
            evStart.getHours() === hour &&
            evStart.getMinutes() === minute
         );
      });

      setSelectedDate(event.start);
      setSelectedHourEvents(eventsAtThatHour);
      setSelectedEvent(event); // Afișează primul sau cel apăsat
      setShowDayPopup(true);
      document.body.classList.add("popup-day-info");
   };

   const generateKey = () =>
      Math.random().toString(36).substring(2, 8).toUpperCase();

   const handleAddGroup = () => {
      if (!newGroupName.trim()) return;
      const newGroup = {
         name: newGroupName,
         members: Math.floor(Math.random() * 10) + 1,
         key: generateKey(),
      };
      setGroups([...groups, newGroup]);
      setNewGroupName("");
      setShowForm(false);
   };

   const eventsToShow =
      currentView === "week" ? filterEventsForWeek(events) : events;
   function filterEventsForWeek(events) {
      const seen = new Set();
      const filtered = [];

      events.forEach((event) => {
         const key = `${event.start.getFullYear()}-${event.start.getMonth()}-${event.start.getDate()}-${event.start.getHours()}-${event.start.getMinutes()}`;
         if (!seen.has(key)) {
            seen.add(key);
            filtered.push(event);
         }
      });

      return filtered;
   }
   // ---- Render ----
   return (
      <>
         <Header status="admin">
            <SAddProg />
            <AAddProg />
            <AddInstr />
            <ADayInfo
               selectedDate={selectedDate}
               showDayPopup={showDayPopup}
               selectedEvent={selectedEvent}
               selectedHourEvents={selectedHourEvents}
               programari={events}
            />
         </Header>
         <main className="main">
            <section className="intro admin">
               <div className="history">
                  <div className="history__header">
                     <h2>Istoric Programări</h2>
                     <AOpenProg>
                        <ReactSVG
                           className="rbc-btn-group__icon"
                           src={addIcon}
                        />
                     </AOpenProg>
                  </div>

                  <div className="history__grid-wrapper">
                     <div className="history__grid">
                        {mockHistory.map((entry, index) => (
                           <div
                              key={entry.id + "-" + index}
                              className={`history__item history__item--${entry.status}`}
                           >
                              <div className="history__item-left">
                                 <h3>{entry.person}</h3>
                                 <p>
                                    {entry.instructor
                                       ? `cu ${entry.instructor}`
                                       : "fără instructor"}
                                 </p>
                                 <span>{entry.time}</span>
                              </div>

                              <div className="history__item-right">
                                 {entry.status === "completed" && (
                                    <ReactSVG
                                       className="history__item-icon completed"
                                       src={successIcon}
                                    />
                                 )}
                                 {entry.status === "cancelled" && (
                                    <ReactSVG
                                       className="history__item-icon cancelled"
                                       src={cancelIcon}
                                    />
                                 )}
                                 {entry.status === "pending" && (
                                    <ReactSVG
                                       className="history__item-icon pending"
                                       src={clockIcon}
                                    />
                                 )}
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
               <div className="intro__right">
                  <div className="groups">
                     <div
                        className={`groups__header ${searchOpen ? "open" : ""}`}
                     >
                        <h2>Toate Grupele</h2>

                        <div className="groups__right">
                           <div className="groups__search">
                              <input
                                 type="text"
                                 placeholder="Caută grupă..."
                                 className="groups__input"
                              />
                              <button
                                 onClick={() => setSearchOpen(!searchOpen)}
                              >
                                 <ReactSVG
                                    className={`groups__icon ${
                                       searchOpen ? "rotate45" : ""
                                    }`}
                                    src={searchOpen ? addIcon : searchIcon}
                                 />
                              </button>
                           </div>
                           <button onClick={() => setShowForm((prev) => !prev)}>
                              <ReactSVG
                                 className="groups__icon "
                                 src={addIcon}
                              />
                           </button>
                        </div>
                     </div>

                     <div className="groups__grid-wrapper">
                        <div className="groups__grid">
                           {showForm && (
                              <div className="groups__form">
                                 <input
                                    type="text"
                                    placeholder="Numele grupei"
                                    value={newGroupName}
                                    onChange={(e) =>
                                       setNewGroupName(e.target.value)
                                    }
                                 />
                                 <p>0 per</p>

                                 <button onClick={handleAddGroup}>
                                    Creează
                                 </button>
                              </div>
                           )}
                           {groups.map((group, index) => (
                              <div className="groups__item" key={index}>
                                 <div className="groups__item-left">
                                    <h3>{group.name}</h3>
                                    <p>{group.members} per</p>
                                    <span>
                                       <ReactSVG
                                          className="groups__item-key"
                                          src={keyIcon}
                                       />
                                       {group.key}
                                    </span>
                                 </div>
                                 <div className="groups__item-right">
                                    <ReactSVG
                                       className="groups__item-icon edit"
                                       src={editIcon}
                                    />
                                    <ReactSVG
                                       className="groups__item-icon see"
                                       src={eyeIcon}
                                    />
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>
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
                     <div className="instructori">
                        <div className="instructori__btns">
                           <div>
                              <AddInstrBtn>
                                 <ReactSVG
                                    className="instructori__icon"
                                    src={addIcon}
                                 />
                              </AddInstrBtn>
                              <AddInstrBtn>
                                 <ReactSVG
                                    className="instructori__icon big"
                                    src={editIcon}
                                 />
                              </AddInstrBtn>
                           </div>
                           <AddInstrBtn>
                              <ReactSVG
                                 className="instructori__icon big"
                                 src={eyeIcon}
                              />
                           </AddInstrBtn>
                        </div>
                        <div className="instructori__info">
                           <h3>
                              20
                              <span>de</span>
                           </h3>
                           <p>Instructori</p>
                        </div>
                     </div>
                  </div>
               </div>
            </section>

            <section className="calendar">
               <div style={{ height: 500, marginTop: "2rem" }}>
                  <Calendar
                     selectable
                     onSelectSlot={handleDayClick}
                     onSelectEvent={handleEventClick}
                     localizer={localizer}
                     events={eventsToShow} // Aici folosim lista filtrată sau completă
                     startAccessor="start"
                     endAccessor="end"
                     views={["month", "week"]}
                     defaultView="month"
                     onView={handleViewChange} // handler pentru schimbarea view-ului
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

export default APanel;
