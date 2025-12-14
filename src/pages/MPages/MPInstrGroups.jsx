import "react-big-calendar/lib/css/react-big-calendar.css";

import Header from "../../components/Header/Header";
import "react-clock/dist/Clock.css";
import Popup from "../../components/Utils/Popup";
import addIcon from "../../assets/svg/mdi--calendar-plus-outline.svg";
import accIcon from "../../assets/svg/acc.svg";
import clockIcon from "../../assets/svg/clock.svg";
import groupsIcon from "../../assets/svg/material-symbols--group-outline.svg";
import instrIcon from "../../assets/svg/mdi--account-cog-outline.svg";
import homeIcon from "../../assets/svg/material-symbols--home-outline.svg";
import calendarIcon from "../../assets/svg/mdi--calendar-outline.svg";
import instrGroupsIcon from "../../assets/svg/material-symbols--group-add-outline.svg";
import examIcon from "../../assets/svg/mdi--book-clock-outline.svg";

import GroupManager from "../../components/APanel/GroupManager";
import SubPopup from "../../components/Utils/SubPopup";
import InstructorsGroupManager from "../../components/APanel/InstructorsGroupManager";

function MPInstrGroups() {
   const links = [
      { link: "/manager", text: "Acasă", icon: homeIcon },
      { link: "/manager/calendar", text: "Calendar", icon: calendarIcon },
      { popup: "addProg", text: "Programare", icon: addIcon },
      { popup: "addInstr", text: "Instrucori", icon: instrIcon },
      { popup: "startExam", text: "Examen", icon: examIcon },
      { link: "/manager/groups", text: "Grupe", icon: groupsIcon },
      {
         link: "/manager/instr-groups",
         text: "Ins. Grupe",
         icon: instrGroupsIcon,
      },
      { link: "/manager/history", text: "Istoric", icon: clockIcon },
      { popup: "profile", text: "Profil", icon: accIcon },
   ];

   return (
      <>
         <Header links={links}>
            <SubPopup />
            <Popup />
         </Header>
         <main className="main">
            <section className="page-wrapper">
               <InstructorsGroupManager />
            </section>
         </main>
      </>
   );
}

export default MPInstrGroups;
