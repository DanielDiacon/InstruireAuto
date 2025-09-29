import React, { useState, useContext, useEffect } from "react";
import { NavLink as RouterLink } from "react-router-dom";
import { ReactSVG } from "react-svg";
import { toggleMenu } from "./toggleSettings";
import { openPopup } from "../Utils/popupStore";

import crownIcon from "../../assets/svg/crown.svg";
import wrenchIcon from "../../assets/svg/wrench.svg";
import studentIcon from "../../assets/svg/graduate.svg";

import DarkModeToggle from "./DarkModeToggle";
import { UserContext } from "../../UserContext";

// 👇 adaugă service-ul pentru a citi instructorii
import { getInstructors } from "../../api/instructorsService";

const Header = ({ children, links }) => {
   const { user } = useContext(UserContext);

   // numele afișat în header (poate fi din instructor sau din user)
   const [displayName, setDisplayName] = useState({
      firstName: "",
      lastName: "",
   });

   // alege icon + eticheta rolului (include ramura pentru INSTRUCTOR)
   let iconSrc = studentIcon;
   let roleLabel = "Student";
   if (user?.role === "ADMIN") {
      iconSrc = crownIcon;
      roleLabel = "Administrator";
   } else if (user?.role === "MANAGER") {
      iconSrc = wrenchIcon;
      roleLabel = "Manager";
   } else if (user?.role === "INSTRUCTOR") {
      iconSrc = wrenchIcon; // dacă ai un icon separat pt instructor, pune-l aici
      roleLabel = "Instructor";
   }

   // când user-ul e INSTRUCTOR, folosim numele din instructors (după userId)
   useEffect(() => {
      let cancelled = false;

      async function resolveName() {
         if (!user) {
            setDisplayName({ firstName: "", lastName: "" });
            return;
         }

         // default: numele din user
         let firstName = user.firstName || "";
         let lastName = user.lastName || "";

         if (user.role === "INSTRUCTOR") {
            try {
               const list = await getInstructors();
               //console.log("[Header] GET /instructors ->", list);

               const mine = list.find((i) => i.userId === user.id);
               if (mine) {
                  // prefer numele din instructor; dacă lipsesc, cad pe cele din user
                  firstName = mine.firstName || firstName || "";
                  lastName = mine.lastName || lastName || "";
                  //console.log(
                  //   "[Header] matched instructor by userId:",
                  //   user.id,
                  //   mine
                  //);
               } else {
                  //console.warn(
                  //   "[Header] no instructor found for userId:",
                  //   user.id
                  //);
               }
            } catch (e) {
               console.error("[Header] getInstructors failed:", e);
            }
         }

         if (!cancelled) setDisplayName({ firstName, lastName });
      }

      resolveName();
      return () => {
         cancelled = true;
      };
   }, [user]);

   const cols = 3;
   const openRows = Math.max(1, Math.ceil((links?.length + 0.3 || 0) / cols));

   return (
      <>
         <header className="header">
            <div className="header__wrapper">
               <div className="header__body">
                  <div className="header__top">
                     <div className="header__profil-wrapper">
                        <div className="header__profil">
                           <h1>
                              {user ? (
                                 <>
                                    {displayName.firstName} <br />{" "}
                                    {displayName.lastName}
                                 </>
                              ) : (
                                 "..."
                              )}
                           </h1>
                           <p>{roleLabel}</p>
                           <ReactSVG className="header__statut" src={iconSrc} />
                        </div>
                     </div>
                  </div>

                  <div className={`header__nav`}>
                     <div className="header__menu menu">
                        <nav className="menu__body" id="navbar">
                           <ul
                              className="menu__list "
                              style={{ "--openRows": openRows }}
                           >
                              {/* burger ca LI (HTML valid) */}
                              <div className="header__burger">
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

                              {links.map((item, i) => (
                                 <li key={i} className="menu__item">
                                    {item.popup ? (
                                       <button
                                          type="button"
                                          className="menu__link"
                                          onClick={() => openPopup(item.popup)}
                                       >
                                          <ReactSVG
                                             className="menu__icon"
                                             src={item.icon}
                                          />
                                          <p className="menu__nav-text">
                                             {item.text}
                                          </p>
                                       </button>
                                    ) : (
                                       <RouterLink
                                          className="menu__link"
                                          to={item.link || "#"}
                                       >
                                          <ReactSVG
                                             className="menu__icon"
                                             src={item.icon}
                                          />
                                          <p className="menu__nav-text">
                                             {item.text}
                                          </p>
                                       </RouterLink>
                                    )}
                                 </li>
                              ))}
                              <li className="settings__wrapper-mobile">
                                 <DarkModeToggle />
                              </li>
                           </ul>
                        </nav>
                        <div className="settings__wrapper">
                           <DarkModeToggle />
                        </div>
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
