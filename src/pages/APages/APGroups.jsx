import "react-big-calendar/lib/css/react-big-calendar.css";

import Header from "../../components/Header/Header";
import "react-clock/dist/Clock.css";
import Popup from "../../components/Utils/Popup";
import addIcon from "../../assets/svg/mdi--calendar-plus-outline.svg";
import accIcon from "../../assets/svg/acc.svg";
import clockIcon from "../../assets/svg/clock.svg";
import instrGroupsIcon from "../../assets/svg/material-symbols--group-add-outline.svg";
import homeIcon from "../../assets/svg/material-symbols--home-outline.svg";
import calendarIcon from "../../assets/svg/mdi--calendar-outline.svg";
import instrIcon from "../../assets/svg/mdi--account-cog-outline.svg";

import GroupManager from "../../components/APanel/GroupManager";
import SubPopup from "../../components/Utils/SubPopup";

function APGroups() {
   const links = [
      { popup: "profile", text: "Profil", icon: accIcon },
      { popup: "addProg", text: "Programare", icon: addIcon },
      { popup: "addInstr", text: "Instrucori", icon: instrIcon },
      { link: "/admin", text: "Acasă", icon: homeIcon },

      {
         link: "/admin/instr-groups",
         text: "Ins. Grupe",
         icon: instrGroupsIcon,
      },
      { link: "/admin/calendar", text: "Calendar", icon: calendarIcon },
      { link: "/admin/history", text: "Istoric", icon: clockIcon },
   ];
   return (
      <>
         <Header links={links}>
            <SubPopup />
            <Popup />
         </Header>
         <main className="main">
            <section className="page-wrapper">
               <GroupManager />
            </section>
         </main>
      </>
   );
}

export default APGroups;
