import React, { useState, useEffect, useContext, useMemo } from "react";

import { UserContext } from "../../UserContext";
import { useDispatch, useSelector } from "react-redux";
import { fetchStudents } from "../../store/studentsSlice";
import { openPopup } from "../Utils/popupStore";

import StudentItem from "../Common/StudentItem";
import SearchToggle from "../Common/SearchToggle";

const PAGE_SIZE = 16;
const PAGE_SIZE_MOBILE = 8;
const MOBILE_BP = 768;

/* ===================== Helpers ===================== */
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
   let h = 0;
   for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) | 0;
   }
   return h >>> 0;
}

/* Avatar palette */
const AVATAR_HUES = [
   { h: 70, s: 75 },
   { h: 0, s: 100 },
   { h: 30, s: 100 },
   { h: 54, s: 95 },
   { h: 130, s: 65 },
   { h: 210, s: 90 },
   { h: 255, s: 98 },
   { h: 285, s: 100 },
   { h: 330, s: 96 },
];
const AVATAR_LIGHTNESSES = [94, 92, 90, 88, 86, 84, 82, 80, 78, 76, 74];
const AVATAR_COLORS = AVATAR_HUES.flatMap(({ h, s }) =>
   AVATAR_LIGHTNESSES.map((l) => `hsl(${h} ${s}% ${l}%)`),
);

function getRandomAvatarColor() {
   return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

function getAvatarColorFromName(student) {
   const fullName =
      `${student?.firstName || ""} ${student?.lastName || ""}`.trim();
   const hasLetter = /\p{L}/u.test(fullName);
   if (!hasLetter) return null;

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

   useEffect(() => {
      setVisibleCount(pageSize);
   }, [query, students, pageSize]);

   const visibleStudents = useMemo(
      () => filteredStudents.slice(0, visibleCount),
      [filteredStudents, visibleCount],
   );

   const avatarColorByKey = useMemo(() => {
      const m = new Map();

      filteredStudents.forEach((s, idx) => {
         const key = String(s.id ?? s.email ?? s.phone ?? `__idx_${idx}`);
         const det = getAvatarColorFromName(s);
         m.set(key, det || getRandomAvatarColor());
      });

      return m;
   }, [filteredStudents]);

   const totalResults = filteredStudents.length;
   const canLoadMore = visibleCount < totalResults;

   const handleLoadMore = () => {
      setVisibleCount((c) => Math.min(c + pageSize, totalResults));
   };

   const remaining = Math.max(0, totalResults - visibleCount);
   const nextBatch = Math.min(pageSize, remaining);

   return (
      <div className="studentsUI">
         {/* Header */}
         <div className={`studentsUI__header ${search.open ? "is-open" : ""}`}>
            <h2 className="studentsUI__title">Studenți</h2>

            <div className="studentsUI__right">
               <SearchToggle
                  open={search.open}
                  value={search.query}
                  onValueChange={(val) =>
                     setSearch((s) => ({ ...s, query: val }))
                  }
                  onToggle={() => setSearch((s) => ({ ...s, open: !s.open }))}
                  placeholder="Caută student..."
                  wrapperClassName="studentsUI__search"
                  inputClassName="studentsUI__input"
                  buttonClassName="studentsUI__iconBtn"
                  iconClassName={`studentsUI__icon ${search.open ? "is-rotated" : ""}`}
                  titleOpen="Închide căutarea"
                  titleClosed="Caută"
               />
            </div>
         </div>

         {/* Grid */}
         <div className="studentsUI__gridWrap">
            <div className="studentsUI__grid">
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
                        <StudentItem
                           key={student.id ?? key}
                           student={student}
                           color={color}
                           initials={getInitials(student)}
                           onOpen={handleOpenStudentPopup}
                           highlightQuery={search.query}
                           highlightClassName="studentItem__highlight"
                        />
                     );
                  })}

               {/* Load more */}
               {!loading && !error && totalResults > 0 && (
                  <div className="studentsUI__footer">
                     <span className="studentsUI__counter">
                        Afișate {Math.min(visibleCount, totalResults)} din{" "}
                        {totalResults}
                     </span>

                     {canLoadMore && (
                        <button
                           type="button"
                           className="studentsUI__loadMore"
                           onClick={handleLoadMore}
                        >
                           Afișează încă {nextBatch}
                        </button>
                     )}
                  </div>
               )}

               {/* Empty */}
               {!loading && !error && totalResults === 0 && (
                  <p className="studentsUI__empty">Nu s-au găsit studenți.</p>
               )}
            </div>
         </div>
      </div>
   );
}

export default StudentsManager;
