import React, { useRef, useEffect, useState } from "react";
import { NavLink as RouterLink } from "react-router-dom";
import { ReactSVG } from "react-svg";
import { toggleMenu, closeAll } from "./toggleSettings";
import SmoothLink from "./SmoothLink";
import handleScrollToTop from "../Utils/ScrollToTop";
import me from "../../assets/img/photo-1438761681033-6461ffad8d80.jpeg";

import addIcon from "../../assets/svg/calendar-add.svg";
import calendarIcon from "../../assets/svg/calendar.svg";
import accIcon from "../../assets/svg/acc.svg";
import crownIcon from "../../assets/svg/crown.svg";
import wrenchIcon from "../../assets/svg/wrench.svg";
import studentIcon from "../../assets/svg/graduate.svg";
import DarkModeToggle from "./DarkModeToggle";
import SOpenProgramari from "../Utils/SOpenProg";
import AddInstrBtn from "../Utils/AddInstrBtn";

const Header = ({ status, children, showDayPopup, programari }) => {
   const [headerHeight, setHeaderHeight] = useState("100svh");
   const [isHeaderVisible, setHeaderVisible] = useState(true);
   const lastScrollY = useRef(window.scrollY); // Inițializează cu poziția curentă a scrollului
   let iconSrc;
   let numePrenume;
   let statusName;
   if (status === "admin") {
      iconSrc = crownIcon;
      numePrenume = "Constantin Mavrocordat";
      statusName = "Administrator";
   } else if (status === "manager") {
      iconSrc = wrenchIcon;
      numePrenume = "Alexandru Rusu";
      statusName = "Manager";
   } else {
      iconSrc = studentIcon;
      numePrenume = "Lucia Munteanu";
      statusName = "Student";
   }
   useEffect(() => {
      const updateHeaderHeight = () => {
         setHeaderHeight(window.innerHeight);
      };

      const handleScroll = () => {
         const currentScrollY = window.scrollY;

         // Check if the scroll distance is greater than 20px
         if (Math.abs(currentScrollY - lastScrollY.current) > 20) {
            if (currentScrollY > lastScrollY.current) {
               // User is scrolling down
               setHeaderVisible(false);
               closeAll(); // Close all menus and panels
            } else {
               // User is scrolling up
               setHeaderVisible(true);
            }

            // Update the last scroll position
            lastScrollY.current = currentScrollY;
         }
      };

      const mediaQuery = window.matchMedia("(max-width: 768px)"); // Aplicați doar pe telefoane
      if (mediaQuery.matches) {
         updateHeaderHeight();
         window.addEventListener("resize", updateHeaderHeight);
         window.addEventListener("scroll", handleScroll);

         return () => {
            window.removeEventListener("resize", updateHeaderHeight);
            window.removeEventListener("scroll", handleScroll);
         };
      }
   }, []);

   const handleClickHeader = () => {
      setHeaderVisible(true);
   };

   const headerStyles = window.matchMedia("(max-width: 768px)").matches
      ? {
           height: `${headerHeight}px`,
           transform: isHeaderVisible ? "translateY(0)" : "translateY(70px)",
        }
      : {};

   return (
      <>
         <header
            className="header"
            style={headerStyles}
            onClick={handleClickHeader}
         >
            <div className="header__wrapper">
               <div className="header__body">
                  <div className="header__top">
                     <div className="header__profil-wrapper">
                        <div className="header__profil">
                           <h1>{numePrenume}</h1>
                           <p>{statusName}</p>

                           <ReactSVG className="header__statut" src={iconSrc} />
                        </div>
                     </div>
                     <div className="header__burger ">
                        <button
                           type="button"
                           className="header__icon-burger icon-menu"
                           onClick={toggleMenu}
                        >
                           <svg
                              className="header__icon"
                              xmlns="http://www.w3.org/2000/svg"
                              width="24"
                              height="24"
                              viewBox="0 0 16 16"
                           >
                              <path
                                 fill="currentColor"
                                 d="M1.5 3.25c0-.966.784-1.75 1.75-1.75h2.5c.966 0 1.75.784 1.75 1.75v2.5A1.75 1.75 0 0 1 5.75 7.5h-2.5A1.75 1.75 0 0 1 1.5 5.75Zm7 0c0-.966.784-1.75 1.75-1.75h2.5c.966 0 1.75.784 1.75 1.75v2.5a1.75 1.75 0 0 1-1.75 1.75h-2.5A1.75 1.75 0 0 1 8.5 5.75Zm-7 7c0-.966.784-1.75 1.75-1.75h2.5c.966 0 1.75.784 1.75 1.75v2.5a1.75 1.75 0 0 1-1.75 1.75h-2.5a1.75 1.75 0 0 1-1.75-1.75Zm7 0c0-.966.784-1.75 1.75-1.75h2.5c.966 0 1.75.784 1.75 1.75v2.5a1.75 1.75 0 0 1-1.75 1.75h-2.5a1.75 1.75 0 0 1-1.75-1.75ZM3.25 3a.25.25 0 0 0-.25.25v2.5c0 .138.112.25.25.25h2.5A.25.25 0 0 0 6 5.75v-2.5A.25.25 0 0 0 5.75 3Zm7 0a.25.25 0 0 0-.25.25v2.5c0 .138.112.25.25.25h2.5a.25.25 0 0 0 .25-.25v-2.5a.25.25 0 0 0-.25-.25Zm-7 7a.25.25 0 0 0-.25.25v2.5c0 .138.112.25.25.25h2.5a.25.25 0 0 0 .25-.25v-2.5a.25.25 0 0 0-.25-.25Zm7 0a.25.25 0 0 0-.25.25v2.5c0 .138.112.25.25.25h2.5a.25.25 0 0 0 .25-.25v-2.5a.25.25 0 0 0-.25-.25Z"
                              />
                           </svg>
                           <svg
                              className="header__icon"
                              xmlns="http://www.w3.org/2000/svg"
                              width="24"
                              height="24"
                              viewBox="0 0 1024 1024"
                           >
                              <path
                                 fill="currentColor"
                                 d="M195.2 195.2a64 64 0 0 1 90.496 0L512 421.504L738.304 195.2a64 64 0 0 1 90.496 90.496L602.496 512L828.8 738.304a64 64 0 0 1-90.496 90.496L512 602.496L285.696 828.8a64 64 0 0 1-90.496-90.496L421.504 512L195.2 285.696a64 64 0 0 1 0-90.496z"
                              />
                           </svg>
                        </button>
                     </div>
                  </div>

                  <div className={`header__nav`}>
                     <div className="header__menu menu">
                        <nav className="menu__body" id="navbar">
                           <ul className="menu__list">
                              <li>
                                 <SOpenProgramari>
                                    <ReactSVG
                                       className="popup-toggle-button__icon"
                                       src={addIcon}
                                    />

                                    <span className="popup-toggle-button__nav-text">
                                       Programare
                                    </span>
                                 </SOpenProgramari>
                              </li>
                              <li>
                                 <AddInstrBtn>
                                    <ReactSVG
                                       className="popup-toggle-button__icon"
                                       src={accIcon}
                                    />

                                    <span className="popup-toggle-button__nav-text">
                                       Instructori
                                    </span>
                                 </AddInstrBtn>
                              </li>
                           </ul>
                        </nav>
                        <DarkModeToggle />
                     </div>
                  </div>
               </div>
            </div>
            {children}
         </header>
      </>
   );
};

export default Header;
