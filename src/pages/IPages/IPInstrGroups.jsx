import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-circular-progressbar/dist/styles.css";
import "react-clock/dist/Clock.css";

import Header from "../../components/Header/Header";
import Popup from "../../components/Utils/Popup";

import accIcon from "../../assets/svg/acc.svg";
import calendarIcon from "../../assets/svg/mdi--calendar-outline.svg";
import homeIcon from "../../assets/svg/material-symbols--home-outline.svg";
import todayIcon from "../../assets/svg/material-symbols--today-outline.svg";
import InstrGroups from "../../components/IPanel/InstrGroups";
import groupsIcon from "../../assets/svg/material-symbols--group-outline.svg";

/* ========= Localizer + RO formats/messages ========= */

function IPInstrGroups() {
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
         <Header links={links}>
            <Popup />
         </Header>

         <main className="main ">
            <section className="page-wrapper">
               <InstrGroups />
            </section>
         </main>
      </>
   );
}

export default IPInstrGroups;
