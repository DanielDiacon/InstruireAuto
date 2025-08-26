import React, { useState, useEffect, useContext } from "react";
import { ReactSVG } from "react-svg";
import addIcon from "../../assets/svg/add-s.svg";
import searchIcon from "../../assets/svg/search.svg";
import { UserContext } from "../../UserContext";
import { useDispatch, useSelector } from "react-redux";
import { fetchStudents } from "../../store/studentsSlice";
import { openPopup } from "../Utils/popupStore";

function StudentsManager() {
   const { user } = useContext(UserContext);
   const dispatch = useDispatch();
   const {
      list: students = [],
      loading,
      error,
   } = useSelector((state) => state.students);

   // --- Search state ---
   const [search, setSearch] = useState({ open: false, query: "" });
   const [viewMode, setViewMode] = useState({ mode: "list", student: null });

   useEffect(() => {
      if (user?.role === "ADMIN") {
         dispatch(fetchStudents());
      }
   }, [dispatch, user]);

   const handleOpenStudentPopup = (student) => {
      openPopup("studentDetails", { student });
   };

   const filteredStudents = students
      // doar cei cu rolul USER
      .filter((s) => s.role === "USER")
      // și aplici căutarea după query
      .filter((s) =>
         `${s.firstName} ${s.lastName} ${s.email} ${s.phone || ""}`
            .toLowerCase()
            .includes(search.query.toLowerCase())
      );

   // helper function
   function highlightText(text, query) {
      if (!query) return text;
      const parts = text.split(new RegExp(`(${query})`, "gi")); // separă textul pe baza query
      return parts.map((part, index) =>
         part.toLowerCase() === query.toLowerCase() ? (
            <i key={index} className="highlight">
               {part}
            </i>
         ) : (
            part
         )
      );
   }

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
                        className={`groups__icon ${
                           search.open ? "rotate45" : ""
                        }`}
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

               {viewMode.mode === "list" &&
                  filteredStudents.map((student, index) => (
                     <div
                        key={student.id}
                        className="students__item"
                        onClick={() => handleOpenStudentPopup(student)}
                     >
                        <div className="students__info">
                           <h3>
                              {highlightText(
                                 `${student.firstName} ${student.lastName}`,
                                 search.query
                              )}
                           </h3>
                           <p>{highlightText(student.email, search.query)}</p>
                           <p>
                              {highlightText(
                                 student.phone || "–",
                                 search.query
                              )}
                           </p>
                        </div>
                     </div>
                  ))}

               {viewMode.mode === "details" && viewMode.student && (
                  <div className="students__details">
                     <button
                        className="back-btn"
                        onClick={() =>
                           setViewMode({ mode: "list", student: null })
                        }
                     >
                        ← Înapoi
                     </button>
                     <h3>
                        {viewMode.student.firstName} {viewMode.student.lastName}
                     </h3>
                     <p>
                        <strong>Email:</strong> {viewMode.student.email}
                     </p>
                     <p>
                        <strong>Telefon:</strong>{" "}
                        {viewMode.student.phone || "–"}
                     </p>
                     {/* lecții, notițe etc. */}
                  </div>
               )}
            </div>
         </div>
      </div>
   );
}

export default StudentsManager;
