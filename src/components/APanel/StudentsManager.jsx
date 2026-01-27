// src/components/Students/StudentsManager.jsx
import React, { useState, useEffect, useContext, useMemo } from "react";
import { ReactSVG } from "react-svg";
import addIcon from "../../assets/svg/add-s.svg";
import arrowIcon from "../../assets/svg/arrow-s.svg";
import searchIcon from "../../assets/svg/search.svg";
import { UserContext } from "../../UserContext";
import { useDispatch, useSelector } from "react-redux";
import { fetchStudents } from "../../store/studentsSlice";
import { openPopup } from "../Utils/popupStore";

const PAGE_SIZE = 16;
const PAGE_SIZE_MOBILE = 8;
const MOBILE_BP = 768;

/* ===================== Helpers ===================== */
const escapeRegExp = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const firstLetter = (v) =>
   String(v || "")
      .trim()
      .charAt(0) || "";

function getInitials(student) {
   const fn = String(student?.firstName || "").trim();
   const ln = String(student?.lastName || "").trim();

   const a = firstLetter(fn);
   const b = firstLetter(ln);

   if (a && b) return (a + b).toUpperCase();

   const two = fn.slice(0, 2);
   if (two) return two.toUpperCase();

   return "–";
}

function useIsMobile(bp = MOBILE_BP) {
   const [isMobile, setIsMobile] = useState(() => {
      if (typeof window === "undefined") return false;
      return window.matchMedia(`(max-width:${bp}px)`).matches;
   });

   useEffect(() => {
      if (typeof window === "undefined") return;

      const mq = window.matchMedia(`(max-width:${bp}px)`);
      const onChange = (e) => setIsMobile(e.matches);

      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else mq.addListener(onChange);

      return () => {
         if (mq.removeEventListener) mq.removeEventListener("change", onChange);
         else mq.removeListener(onChange);
      };
   }, [bp]);

   return isMobile;
}

function hashStringToUInt(str) {
   // deterministic, fast
   let h = 0;
   for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) | 0;
   }
   return h >>> 0; // make unsigned
}

/**
 * Avatar colors: same hue & saturation per family, many lightness steps.
 * (pastel, în aceeași "familie" de culori)
 */
const AVATAR_HUES = [
   { h: 70, s: 75 }, // lime
   { h: 0, s: 100 }, // red
   { h: 30, s: 100 }, // orange
   { h: 54, s: 95 }, // yellow
   { h: 130, s: 65 }, // green
   { h: 210, s: 90 }, // blue
   { h: 255, s: 98 }, // indigo
   { h: 285, s: 100 }, // purple
   { h: 330, s: 96 }, // pink
];

const AVATAR_LIGHTNESSES = [94, 92, 90, 88, 86, 84, 82, 80, 78, 76, 74];

const AVATAR_COLORS = AVATAR_HUES.flatMap(({ h, s }) =>
   AVATAR_LIGHTNESSES.map((l) => `hsl(${h} ${s}% ${l}%)`),
);

function getRandomAvatarColor() {
   return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

/**
 * Culoare din nume:
 * - dacă există cel puțin o literă (Unicode \p{L}), returnează o culoare deterministică
 * - dacă nu există nicio literă, returnează null (adică intră pe random)
 */
function getAvatarColorFromName(student) {
   const fullName =
      `${student?.firstName || ""} ${student?.lastName || ""}`.trim();

   // "are măcar o literă?"
   const hasLetter = /\p{L}/u.test(fullName);
   if (!hasLetter) return null;

   // normalize ca să fie stabil și cu diacritice
   const normalized = fullName.normalize("NFKD");

   const idx = hashStringToUInt(normalized) % AVATAR_COLORS.length;
   return AVATAR_COLORS[idx];
}

/* ===================== Component ===================== */
function StudentsManager() {
   const { user } = useContext(UserContext);
   const dispatch = useDispatch();
   const {
      list: students = [],
      loading,
      error,
   } = useSelector((state) => state.students);

   const isMobile = useIsMobile(MOBILE_BP);
   const pageSize = isMobile ? PAGE_SIZE_MOBILE : PAGE_SIZE;

   const [search, setSearch] = useState({ open: false, query: "" });
   const [visibleCount, setVisibleCount] = useState(pageSize);

   useEffect(() => {
      if (user?.role === "ADMIN") dispatch(fetchStudents());
   }, [dispatch, user]);

   const handleOpenStudentPopup = (student) => {
      openPopup("studentDetails", { student });
   };

   const query = useMemo(
      () => search.query.trim().toLowerCase(),
      [search.query],
   );

   const filteredStudents = useMemo(() => {
      const base = (students || []).filter((s) => s.role === "USER");
      if (!query) return base;

      return base.filter((s) =>
         `${s.firstName} ${s.lastName} ${s.email} ${s.phone || ""}`
            .toLowerCase()
            .includes(query),
      );
   }, [students, query]);

   // reset la pageSize când schimbi căutarea / vin date noi / se schimbă breakpoint-ul
   useEffect(() => {
      setVisibleCount(pageSize);
   }, [query, students, pageSize]);

   const visibleStudents = useMemo(
      () => filteredStudents.slice(0, visibleCount),
      [filteredStudents, visibleCount],
   );

   /**
    * Color map:
    * - name-based color dacă există litere
    * - altfel random (stabil cât timp filteredStudents nu se schimbă)
    */
   const avatarColorByKey = useMemo(() => {
      const m = new Map();

      filteredStudents.forEach((s, idx) => {
         const det = getAvatarColorFromName(s);
         if (det) {
            m.set(String(s.id ?? s.email ?? s.phone ?? `__idx_${idx}`), det);
            return;
         }
         // no letters -> random
         m.set(
            String(s.id ?? s.email ?? s.phone ?? `__idx_${idx}`),
            getRandomAvatarColor(),
         );
      });

      return m;
   }, [filteredStudents]);

   function highlightText(text, q) {
      const qq = String(q || "").trim();
      if (!qq) return text;

      const safe = escapeRegExp(qq);
      const parts = String(text || "").split(new RegExp(`(${safe})`, "gi"));

      return parts.map((part, index) =>
         part.toLowerCase() === qq.toLowerCase() ? (
            <i key={index} className="highlight">
               {part}
            </i>
         ) : (
            part
         ),
      );
   }

   const totalResults = filteredStudents.length;
   const canLoadMore = visibleCount < totalResults;

   const handleLoadMore = () => {
      setVisibleCount((c) => Math.min(c + pageSize, totalResults));
   };

   const remaining = Math.max(0, totalResults - visibleCount);
   const nextBatch = Math.min(pageSize, remaining);

   return (
      <div className="students">
         {/* Header */}
         <div className={`groups__header ${search.open ? "open" : ""}`}>
            <h2>Studenți</h2>
            <div className="groups__right">
               <div className="groups__search">
                  <input
                     type="text"
                     placeholder="Caută student..."
                     className="groups__input"
                     value={search.query}
                     onChange={(e) =>
                        setSearch({ ...search, query: e.target.value })
                     }
                  />
                  <button
                     onClick={() =>
                        setSearch({ ...search, open: !search.open })
                     }
                  >
                     <ReactSVG
                        className={`groups__icon ${search.open ? "rotate45" : ""}`}
                        src={search.open ? addIcon : searchIcon}
                     />
                  </button>
               </div>
            </div>
         </div>

         {/* Grid */}
         <div className="students__grid-wrapper">
            <div className="students__grid">
               {loading && (
                  <p style={{ gridColumn: "1 / -1" }}>
                     Se încarcă studenții...
                  </p>
               )}
               {error && (
                  <p style={{ gridColumn: "1 / -1", color: "red" }}>{error}</p>
               )}

               {!loading &&
                  !error &&
                  visibleStudents.map((student, idx) => {
                     const key = String(
                        student.id ??
                           student.email ??
                           student.phone ??
                           `__idx_${idx}`,
                     );
                     const color =
                        avatarColorByKey.get(key) || getRandomAvatarColor();

                     return (
                        <div
                           key={student.id ?? key}
                           className="students__item"
                           onClick={() => handleOpenStudentPopup(student)}
                           role="button"
                           tabIndex={0}
                           onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                 e.preventDefault();
                                 handleOpenStudentPopup(student);
                              }
                           }}
                        >
                           <div
                              className="students__avatar"
                              aria-hidden="true"
                              style={{
                                 background: color,
                                 color: "var(--black-p)",
                              }}
                           >
                              <span>{getInitials(student)}</span>
                           </div>

                           <div className="students__info">
                              <h3>
                                 {highlightText(
                                    `${student.firstName} ${student.lastName}`,
                                    search.query,
                                 )}
                              </h3>
                              <p>
                                 {highlightText(
                                    student.phone || "–",
                                    search.query,
                                 )}
                              </p>
                           </div>

                           <div className="students__chev" aria-hidden="true">
                              <ReactSVG
                                 className="students__chev-icon"
                                 src={arrowIcon}
                              />
                           </div>
                        </div>
                     );
                  })}

               {/* Load more */}
               {!loading && !error && totalResults > 0 && (
                  <div
                     style={{
                        gridColumn: "1 / -1",
                        display: "flex",
                        justifyContent: "center",
                        padding: "10px 0 0",
                        gap: 12,
                        alignItems: "center",
                        flexWrap: "wrap",
                        color: "var(--white-s)",
                     }}
                  >
                     <span style={{ opacity: 0.7 }}>
                        Afișate {Math.min(visibleCount, totalResults)} din{" "}
                        {totalResults}
                     </span>

                     {canLoadMore && (
                        <button
                           type="button"
                           className="students__load-more"
                           onClick={handleLoadMore}
                        >
                           Afișează încă {nextBatch}
                        </button>
                     )}
                  </div>
               )}

               {/* Empty */}
               {!loading && !error && totalResults === 0 && (
                  <p
                     style={{
                        gridColumn: "1 / -1",
                        opacity: 0.7,
                        color: "var(--white-s)",
                     }}
                  >
                     Nu s-au găsit studenți.
                  </p>
               )}
            </div>
         </div>
      </div>
   );
}

export default StudentsManager;
