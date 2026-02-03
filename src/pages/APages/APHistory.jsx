// src/pages/APages/APHistory.jsx
import React, { useContext, useEffect, useState } from "react";
import Header from "../../components/Header/Header";
import Popup from "../../components/Utils/Popup";
import SubPopup from "../../components/Utils/SubPopup";

import addIcon from "../../assets/svg/mdi--calendar-plus-outline.svg";
import clockIcon from "../../assets/svg/clock.svg";
import categoriiIcon from "../../assets/svg/mdi--category-plus-outline.svg";
import groupsIcon from "../../assets/svg/material-symbols--group-outline.svg";
import instrIcon from "../../assets/svg/mdi--account-cog-outline.svg";
import homeIcon from "../../assets/svg/material-symbols--home-outline.svg";
import calendarIcon from "../../assets/svg/mdi--calendar-outline.svg";
import managerIcon from "../../assets/svg/mdi--account-star-outline.svg";
import instrGroupsIcon from "../../assets/svg/material-symbols--group-add-outline.svg";

import { getAllReservations } from "../../api/reservationsService";
import { getUsers } from "../../api/usersService";

import { useSelector, useDispatch } from "react-redux";
import { fetchInstructors } from "../../store/instructorsSlice";
import ReservationHistory from "../../components/APanel/ReservationHistory";
import { UserContext } from "../../UserContext";

function APHistory() {
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
   ];

   const dispatch = useDispatch();
   const [reservations, setReservations] = useState([]);
   const [users, setUsers] = useState([]);
   const instructors = useSelector((state) => state.instructors.list);

   const { user } = useContext(UserContext);

   useEffect(() => {
      document.title = "Instruire Auto | APanel";
   }, []);

   useEffect(() => {
      if (!user || user.role !== "ADMIN") return;

      dispatch(fetchInstructors());

      (async () => {
         try {
            const [resData, userData] = await Promise.all([
               getAllReservations(),
               getUsers(),
            ]);

            setReservations(Array.isArray(resData) ? resData : []);
            setUsers(Array.isArray(userData) ? userData : []);
         } catch (err) {
            console.error("Eroare la preluare:", err);
         }
      })();
   }, [user, dispatch]);

   return (
      <>
         <main className="main">
            <section className="page-wrapper">
               <ReservationHistory
                  reservations={reservations}
                  users={users}
                  instructors={instructors}
                  durationMinDefault={90}
               />
            </section>
         </main>
      </>
   );
}

export default APHistory;
