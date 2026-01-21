// src/pages/PPGropus.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { ReactSVG } from "react-svg";

import Header from "../../components/Header/Header";
import Popup from "../../components/Utils/Popup";
import Footer from "../../components/Footer";

import { UserContext } from "../../UserContext";
import { getMyGroupOverview } from "../../api/groupsService";

import accIcon from "../../assets/svg/acc.svg";
import homeIcon from "../../assets/svg/material-symbols--home-outline.svg";
import addIcon from "../../assets/svg/add-s.svg";
import searchIcon from "../../assets/svg/search.svg";
import keyIcon from "../../assets/svg/key.svg";
import groupsIcon from "../../assets/svg/material-symbols--group-outline.svg";
import studentsIcon from "../../assets/svg/graduate.svg";

function normalizeGroupsOverview(res) {
   const groups =
      (Array.isArray(res?.groups) && res.groups) ||
      (Array.isArray(res?.data?.groups) && res.data.groups) ||
      (Array.isArray(res) && res) ||
      [];
   return groups.filter((g) => g && g.id != null);
}

function CourseGroupsList({ groups, status }) {
   const [searchOpen, setSearchOpen] = useState(false);
   const [query, setQuery] = useState("");

   const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      return (groups || []).filter((g) => {
         if (!q) return true;
         return `${g?.name || ""} ${g?.token || ""}`.toLowerCase().includes(q);
      });
   }, [groups, query]);

   const showNone = status === "ok" && (groups?.length ?? 0) === 0;
   const showError = status === "error";

   return (
      <div className="groups ipanel">
         <div className={`groups__header ${searchOpen ? "open" : ""}`}>
            <h2>Grupele mele</h2>

            <div className="groups__right">
               <div className="groups__search">
                  <input
                     type="text"
                     placeholder="Caută în grupele mele..."
                     className="groups__input"
                     value={query}
                     onChange={(e) => setQuery(e.target.value)}
                  />
                  <button
                     type="button"
                     onClick={() => setSearchOpen((v) => !v)}
                  >
                     <ReactSVG
                        className={`groups__icon ${searchOpen ? "rotate45" : ""}`}
                        src={searchOpen ? addIcon : searchIcon}
                     />
                  </button>
               </div>
            </div>
         </div>

         {status === "loading" && (
            <div style={{ padding: "10px 14px", opacity: 0.85 }}>
               Se încarcă grupele...
            </div>
         )}

         {showError && (
            <div style={{ padding: "10px 14px", opacity: 0.85, color: "red" }}>
               Nu am putut încărca grupele tale acum. Reîncearcă mai târziu.
            </div>
         )}

         {showNone && (
            <div style={{ padding: "10px 14px", opacity: 0.85 }}>
               Nu ai grupe (încă) asociate.
            </div>
         )}

         <div className="groups__grid-wrapper">
            <div className="groups__grid">
               {filtered.map((g) => {
                  const members = Number.isFinite(Number(g?.studentCount))
                     ? Number(g.studentCount)
                     : null;

                  return (
                     <div key={g?.id} className="groups__item">
                        <div className="groups__item-left">
                           <div className="groups__item-left-top">
                              <h3>{g?.name || "—"}</h3>
                           </div>

                           {members != null && <p>{members} pers</p>}

                           {g?.token ? (
                              <span className="groups__item-key">
                                 <ReactSVG src={keyIcon} />
                                 {String(g.token).trim()}
                              </span>
                           ) : null}
                        </div>
                     </div>
                  );
               })}

               {status === "ok" && filtered.length === 0 && (
                  <p className="groups__empty" style={{ gridColumn: "1 / -1" }}>
                     Nu ai grupe (sau nu se potrivesc filtrului).
                  </p>
               )}
            </div>
         </div>
      </div>
   );
}

function PPGropus() {
   const { user } = useContext(UserContext);

   const [status, setStatus] = useState("idle"); // idle | loading | ok | error
   const [groups, setGroups] = useState([]);

   const links = useMemo(
      () => [
         { link: "/professor", text: "Acasă", icon: homeIcon },
         { link: "/professor/students", text: "Studenți", icon: studentsIcon },
         { link: "/professor/groups", text: "Grupe", icon: groupsIcon },
         { popup: "profile", text: "Profil", icon: accIcon },
      ],
      [],
   );

   useEffect(() => {
      let cancelled = false;

      (async () => {
         if (!user?.id) return;

         if (String(user?.role).toUpperCase() !== "PROFESSOR") {
            setStatus("error");
            return;
         }

         setStatus("loading");

         try {
            const ov = await getMyGroupOverview();
            if (cancelled) return;

            const list = normalizeGroupsOverview(ov);
            setGroups(list);
            setStatus("ok");
         } catch {
            if (cancelled) return;
            setGroups([]);
            setStatus("error");
         }
      })();

      return () => {
         cancelled = true;
      };
   }, [user?.id, user?.role]);

   return (
      <>
         <Header links={links}>
            <Popup />
         </Header>

         <main className="main">
            <section className="professor single">
               <CourseGroupsList groups={groups} status={status} />
            </section>

            <Footer />
         </main>
      </>
   );
}

export default PPGropus;
