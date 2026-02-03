// src/components/Header/Header.jsx
import React, {
   useState,
   useContext,
   useEffect,
   useMemo,
   useCallback,
} from "react";
import { NavLink as RouterLink } from "react-router-dom";
import { ReactSVG } from "react-svg";
import { openPopup } from "../Utils/popupStore";

import crownIcon from "../../assets/svg/crown.svg";
import wrenchIcon from "../../assets/svg/wrench.svg";
import studentIcon from "../../assets/svg/graduate.svg";

import DarkModeToggle from "./DarkModeToggle";
import { UserContext } from "../../UserContext";
import { getInstructors } from "../../api/instructorsService";

import { getLinksForRole } from "./navLinks";

/* ===================== helpers ===================== */
function useIsMobile(bp = 992) {
   const [isMobile, setIsMobile] = useState(() => {
      if (typeof window === "undefined") return false;
      return window.matchMedia(`(max-width:${bp}px)`).matches;
   });

   useEffect(() => {
      if (typeof window === "undefined") return;
      const m = window.matchMedia(`(max-width:${bp}px)`);
      const onChange = () => setIsMobile(m.matches);

      if (m.addEventListener) m.addEventListener("change", onChange);
      else m.addListener(onChange);

      onChange();
      return () => {
         if (m.removeEventListener) m.removeEventListener("change", onChange);
         else m.removeListener(onChange);
      };
   }, [bp]);

   return isMobile;
}

const ROOT_LINKS = [
   "/admin",
   "/manager",
   "/instructor",
   "/student",
   "/professor",
];
const isRootLink = (link) => ROOT_LINKS.includes(link);

/* ===================== component ===================== */
const Header = ({ children }) => {
   const { user } = useContext(UserContext);

   // ✅ links vin din Header, nu din pagini
   const links = useMemo(() => getLinksForRole(user?.role), [user?.role]);

   const TABLET_BP = 992;
   const isMobile = useIsMobile(TABLET_BP);
   const [mobileOpen, setMobileOpen] = useState(false);

   const [displayName, setDisplayName] = useState({
      firstName: "",
      lastName: "",
   });

   let iconSrc = studentIcon;
   let roleLabel = "Student";

   if (user?.role === "ADMIN") {
      iconSrc = crownIcon;
      roleLabel = "Administrator";
   } else if (user?.role === "MANAGER") {
      iconSrc = wrenchIcon;
      roleLabel = "Manager";
   } else if (user?.role === "INSTRUCTOR") {
      iconSrc = wrenchIcon;
      roleLabel = "Instructor";
   } else if (user?.role === "PROFESSOR") {
      iconSrc = wrenchIcon;
      roleLabel = "Professor";
   }

   useEffect(() => {
      let cancelled = false;

      async function resolveName() {
         if (!user) {
            setDisplayName({ firstName: "", lastName: "" });
            return;
         }

         let firstName = user.firstName || "";
         let lastName = user.lastName || "";

         if (user.role === "INSTRUCTOR") {
            try {
               const list = await getInstructors();
               const mine = list.find(
                  (i) => String(i.userId) === String(user.id),
               );
               if (mine) {
                  firstName = mine.firstName || firstName || "";
                  lastName = mine.lastName || lastName || "";
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

   useEffect(() => {
      if (!isMobile && mobileOpen) setMobileOpen(false);
   }, [isMobile, mobileOpen]);

   const primaryLinks = useMemo(() => (links || []).slice(0, 3), [links]);

   const closeMobile = useCallback(() => setMobileOpen(false), []);
   const toggleMobile = useCallback(() => setMobileOpen((v) => !v), []);

   const onNavItemClick = useCallback(() => {
      if (isMobile) closeMobile();
   }, [isMobile, closeMobile]);

   const renderItem = (item, i) => {
      if (item.popup) {
         return (
            <li key={`${item.text}-${i}`} className="menu__item">
               <button
                  type="button"
                  className="menu__link"
                  onClick={() => {
                     openPopup(item.popup);
                     onNavItemClick();
                  }}
               >
                  <ReactSVG className="menu__icon" src={item.icon} />
                  <p className="menu__nav-text">{item.text}</p>
               </button>
            </li>
         );
      }

      return (
         <li key={`${item.text}-${i}`} className="menu__item">
            <RouterLink
               to={item.link || "#"}
               end={isRootLink(item.link)}
               className={({ isActive }) =>
                  `menu__link ${isActive ? "menu__link--active" : ""}`
               }
               onClick={onNavItemClick}
            >
               <ReactSVG className="menu__icon" src={item.icon} />
               <p className="menu__nav-text">{item.text}</p>
            </RouterLink>
         </li>
      );
   };

   // desktop rows (dacă mai ai nevoie de grid)
   const cols = 4;
   const openRows = Math.max(1, Math.ceil(((links?.length || 0) + 1) / cols));

   return (
      <header className="header">
         <div className="header__wrapper">
            <div className="header__body">
               <div className="header__top">
                  <div className="header__profil-wrapper">
                     <div className="header__profil">
                        <ReactSVG className="header__statut" src={iconSrc} />
                        <div className="header__profil-details">
                           <h1>
                              {user ? (
                                 <>
                                    {displayName.firstName}{" "}
                                    {displayName.lastName}
                                 </>
                              ) : (
                                 "..."
                              )}
                           </h1>
                           <p>{roleLabel}</p>
                        </div>
                     </div>
                  </div>
               </div>

               <div className="header__nav">
                  <div
                     className={`header__menu menu ${mobileOpen ? "menu--open" : ""}`}
                  >
                     <nav className="menu__body" id="navbar">
                        {isMobile ? (
                           <>
                              <div
                                 className="menu__drawer"
                                 aria-hidden={!mobileOpen}
                              >
                                 <ul className="menu__drawer-settings settings">
                                    <DarkModeToggle />
                                 </ul>
                                 <span className="menu__drawer-hr"></span>

                                 {Array.isArray(links) && links.length > 0 && (
                                    <ul className="menu__drawer-list">
                                       {links.map(renderItem)}
                                    </ul>
                                 )}
                              </div>

                              <ul className="menu__bar">
                                 {primaryLinks.map(renderItem)}

                                 <li className="menu__item menu__item--burger">
                                    <button
                                       type="button"
                                       className="menu__burger-btn"
                                       onClick={toggleMobile}
                                       aria-label={
                                          mobileOpen
                                             ? "Close menu"
                                             : "Open menu"
                                       }
                                       aria-expanded={mobileOpen}
                                    >
                                       {/* iconurile tale burger rămân la fel */}
                                       <svg
                                          className="menu__burger-icon menu__burger-icon--open"
                                          xmlns="http://www.w3.org/2000/svg"
                                          width="24"
                                          height="24"
                                          viewBox="0 0 16 16"
                                       >
                                          <path
                                             fill="currentColor"
                                             d="M1.5 3.25c0-.966.784-1.75 1.75-1.75h2.5c.966 0 1.75.784 1.75 1.75v2.5A1.75 1.75 0 0 1 5.75 7.5h-2.5A1.75 1.75 0 0 1 1.5 5.75Zm7 0c0-.966.784-1.75 1.75-1.75h2.5c.966 0 1.75.784 1.75 1.75v2.5a1.75 1.75 0 0 1-1.75 1.75h-2.5A1.75 1.75 0 0 1 8.5 5.75Zm-7 7c0-.966.784-1.75 1.75-1.75h2.5c.966 0 1.75.784 1.75 1.75v2.5a1.75 1.75 0 0 1-1.75 1.75h-2.5a1.75 1.75 0 0 1-1.75-1.75Zm7 0c0-.966.784-1.75 1.75-1.75h2.5c.966 0 1.75.784 1.75 1.75v2.5a1.75 1.75 0 0 1-1.75 1.75h-2.5a1.75 1.75 0 0 1-1.75-1.75Z"
                                          />
                                       </svg>

                                       <svg
                                          className="menu__burger-icon menu__burger-icon--close"
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
                                 </li>
                              </ul>
                           </>
                        ) : (
                           <>
                              <ul
                                 className="menu__list"
                                 style={{ "--openRows": openRows }}
                              >
                                 {links.map(renderItem)}
                              </ul>

                              <div className="settings__wrapper">
                                 <ul className="header__settings settings pc">
                                    <DarkModeToggle />
                                 </ul>
                              </div>
                           </>
                        )}
                     </nav>
                  </div>
               </div>
            </div>
         </div>

         {children}
      </header>
   );
};

export default Header;
