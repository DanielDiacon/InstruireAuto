// src/pages/Manager/MPCalendar.jsx
import React, { useContext, useEffect } from "react";

import Header from "../../components/Header/Header";
import "react-clock/dist/Clock.css";
import Popup from "../../components/Utils/Popup";
import SubPopup from "../../components/Utils/SubPopup";

import addIcon from "../../assets/svg/mdi--calendar-plus-outline.svg";
import accIcon from "../../assets/svg/acc.svg";
import clockIcon from "../../assets/svg/clock.svg";
import groupsIcon from "../../assets/svg/material-symbols--group-outline.svg";
import instrGroupsIcon from "../../assets/svg/material-symbols--group-add-outline.svg";
import instrIcon from "../../assets/svg/mdi--account-cog-outline.svg";
import homeIcon from "../../assets/svg/material-symbols--home-outline.svg";
import examIcon from "../../assets/svg/mdi--book-clock-outline.svg";
import calendarIcon from "../../assets/svg/mdi--calendar-outline.svg";
import categoriiIcon from "../../assets/svg/mdi--category-plus-outline.svg";

import { useDispatch } from "react-redux";
import { fetchInstructors } from "../../store/instructorsSlice";

import ACalendarViewOptimized from "../../components/APanel/Calendar/ACalendarOptimized";
import { UserContext } from "../../UserContext";

function MPCalendar() {
   const links = [
      { link: "/manager", text: "Acasă", icon: homeIcon },
      { link: "/manager/calendar", text: "Calendar", icon: calendarIcon },
      { popup: "addProg", text: "Programare", icon: addIcon },
      { popup: "addInstr", text: "Instrucori", icon: instrIcon },
      { popup: "addProfessor", text: "Profesori", icon: instrIcon },
      { popup: "startExam", text: "Examen", icon: examIcon },
      { link: "/manager/groups", text: "Grupe", icon: groupsIcon },
      {
         link: "/manager/instr-groups",
         text: "Ins. Grupe",
         icon: instrGroupsIcon,
      },
      { link: "/manager/history", text: "Istoric", icon: clockIcon },
      { popup: "questionCategories", text: "Categorii", icon: categoriiIcon },

      //{ popup: "profile", text: "Profil", icon: accIcon },
   ];

   const dispatch = useDispatch();
   const { user } = useContext(UserContext);

   useEffect(() => {
      document.title = "Instruire Auto | MPanel";
   }, []);

   // similar cu APanel – încarcă instructorii doar dacă e manager (sau admin)
   useEffect(() => {
      if (!user || (user.role !== "MANAGER" && user.role !== "ADMIN")) return;
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

export default MPCalendar;
