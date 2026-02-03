import React, { useContext, useEffect, useState, useCallback } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import ro from "date-fns/locale/ro";
import "react-big-calendar/lib/css/react-big-calendar.css";

import Header from "../components/Header/Header";
import "react-clock/dist/Clock.css";
import Popup from "../components/Utils/Popup";
import { openPopup } from "../components/Utils/popupStore";
import addIcon from "../assets/svg/mdi--calendar-plus-outline.svg";
import accIcon from "../assets/svg/acc.svg";
import clockIcon from "../assets/svg/clock.svg";
import groupsIcon from "../assets/svg/material-symbols--group-outline.svg";
import instrGroupsIcon from "../assets/svg/material-symbols--group-add-outline.svg";
import instrIcon from "../assets/svg/mdi--account-cog-outline.svg";
import homeIcon from "../assets/svg/material-symbols--home-outline.svg";
import calendarIcon from "../assets/svg/mdi--calendar-outline.svg";
import managerIcon from "../assets/svg/mdi--account-star-outline.svg";
import categoriiIcon from "../assets/svg/mdi--category-plus-outline.svg";

import { getAllReservations } from "../api/reservationsService";
import { getUsers } from "../api/usersService";
import { getGroups } from "../api/groupsService";
import { useSelector, useDispatch } from "react-redux";
import { fetchInstructors } from "../store/instructorsSlice";

import StudentsManager from "../components/APanel/StudentsManager";
import GroupManager from "../components/APanel/GroupManager";
import InstructorManager from "../components/APanel/InstructorManager";
import ClockDisplay from "../components/Common/ClockDisplay";
import ReservationHistory from "../components/APanel/ReservationHistory";

import { UserContext } from "../UserContext";
import InstructorsGroupManager from "../components/APanel/InstructorsGroupManager";
import SubPopup from "../components/Utils/SubPopup";
import ExamPermissionPanel from "../components/SPanel/ExamPermissionPanel";
import PreloadAppData from "../components/Utils/PreloadAppData";
import Footer from "../components/Footer";

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
   const links = [
      { link: "/admin", text: "Acasă", icon: homeIcon },
      { link: "/admin/calendar", text: "Calendar", icon: calendarIcon },
      { popup: "addProg", text: "Programare", icon: addIcon },
      { popup: "addInstr", text: "Instrucori", icon: instrIcon },
      { popup: "addProfessor", text: "Profesori", icon: instrIcon },
      { popup: "addManager", text: "Manageri", icon: managerIcon },
      { link: "/admin/groups", text: "Grupe", icon: groupsIcon },
      {
         link: "/admin/instr-groups",
         text: "Ins. Grupe",
         icon: instrGroupsIcon,
      },
      { link: "/admin/history", text: "Istoric", icon: clockIcon },
      { popup: "questionCategories", text: "Categorii", icon: categoriiIcon },
      //{ popup: "profile", text: "Profil", icon: accIcon },
   ];
   const dispatch = useDispatch();

   const [reservations, setReservations] = useState([]);
   const [users, setUsers] = useState([]);
   const [groups, setGroups] = useState([]);
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
            const [resData, userData, groupData] = await Promise.all([
               getAllReservations(),
               getUsers(),
               getGroups(),
            ]);

            setReservations(resData);
            setUsers(userData);
            //console.log(resData);

            const sortedGroups = groupData.sort(
               (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
            );
            setGroups(sortedGroups);
         } catch (err) {
            console.error("Eroare la preluare:", err);
         }
      }

      fetchData();
   }, [user, dispatch]);

   return (
      <>
         <main className="main">
            <section className="home-admin">
               <StudentsManager />
               <GroupManager />
               {/*<ClockDisplay />*/}
            </section>
            <PreloadAppData />
            <Footer />
         </main>
         {/*<main className="main">
            <section className="intro admin">
               <StudentsManager />
               <div className="intro__right">
                  <GroupManager />
                  <div className="intro__clock-wrapper">
                     <ClockDisplay />
                     <InstructorManager
                        instructors={instructors}
                        openPopup={openPopup}
                     />
                  </div>
               </div>
            </section>
            <PreloadAppData />

            <section className="modules">
               <ReservationHistory
                  reservations={reservations} // lista RAW din API
                  users={users} // pentru nume corecte
                  instructors={instructors} // pentru nume instructori
               />
               <InstructorsGroupManager></InstructorsGroupManager>
            </section>
            <Footer />
         </main>*/}
      </>
   );
}

export default APanel;
