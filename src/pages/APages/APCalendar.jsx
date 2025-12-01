// src/pages/Admin/APCalendar.jsx
import React, { useContext, useEffect } from "react";

import Header from "../../components/Header/Header";
import "react-clock/dist/Clock.css";
import Popup from "../../components/Utils/Popup";
import { openPopup } from "../../components/Utils/popupStore";
import addIcon from "../../assets/svg/mdi--calendar-plus-outline.svg";
import accIcon from "../../assets/svg/acc.svg";
import clockIcon from "../../assets/svg/clock.svg";
import groupsIcon from "../../assets/svg/material-symbols--group-outline.svg";
import instrGroupsIcon from "../../assets/svg/material-symbols--group-add-outline.svg";
import instrIcon from "../../assets/svg/mdi--account-cog-outline.svg";
import homeIcon from "../../assets/svg/material-symbols--home-outline.svg";
import managerIcon from "../../assets/svg/mdi--account-star-outline.svg";

import { useDispatch } from "react-redux";
import { fetchInstructors } from "../../store/instructorsSlice";

import ACalendarViewOptimized from "../../components/APanel/ACalendarOptimized";

import { UserContext } from "../../UserContext";
import SubPopup from "../../components/Utils/SubPopup";

function APCalendar() {
   const links = [
      { link: "/admin", text: "Acasă", icon: homeIcon },
      { popup: "addProg", text: "Programare", icon: addIcon },
      { popup: "addInstr", text: "Instrucori", icon: instrIcon },
      { popup: "addManager", text: "Manageri", icon: managerIcon },
      { link: "/admin/groups", text: "Grupe", icon: groupsIcon },
      {
         link: "/admin/instr-groups",
         text: "Ins. Grupe",
         icon: instrGroupsIcon,
      },
      { link: "/admin/history", text: "Istoric", icon: clockIcon },
      { popup: "profile", text: "Profil", icon: accIcon },
   ];

   const dispatch = useDispatch();
   const { user } = useContext(UserContext);

   useEffect(() => {
      document.title = "Instruire Auto | APanel";
   }, []);

   // dacă vrei poți chiar să scoți și asta,
   // pentru că DayView-ul oricum face `fetchInstructors()` singur,
   // dar nu strică să rămână
   useEffect(() => {
      if (!user || user.role !== "ADMIN") return;
      dispatch(fetchInstructors());
   }, [user, dispatch]);

   return (
      <>
         <Header links={links}>
            <SubPopup />
            <Popup />
         </Header>
         <main className="main">
            <ACalendarViewOptimized />
         </main>
      </>
   );
}

export default APCalendar;
