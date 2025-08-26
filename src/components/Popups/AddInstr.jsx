import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { ReactSVG } from "react-svg";
import {
   fetchInstructors,
   addInstructor,
   updateInstructor,
   removeInstructor,
} from "../../store/instructorsSlice";
import editIcon from "../../assets/svg/edit.svg";
import searchIcon from "../../assets/svg/search.svg";

function AddInstr() {
   const dispatch = useDispatch();
   const { list: instructors, status } = useSelector(
      (state) => state.instructors
   );

   const [activeTab, setActiveTab] = useState("list");
   const [search, setSearch] = useState("");
   const [newInstr, setNewInstr] = useState({
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      password: "",
      sector: "Botanica",
      isActive: true,
      instructorsGroupId: null,
   });

   const [editingId, setEditingId] = useState(null);
   const [editInstr, setEditInstr] = useState({
      firstName: "",
      lastName: "",
      phone: "",
   });

   useEffect(() => {
      if (status === "idle") {
         dispatch(fetchInstructors());
      }
   }, [status, dispatch]);

   const filteredInstructors = instructors.filter((inst) => {
      const fullName = `${inst.firstName} ${inst.lastName}`.toLowerCase();
      return (
         fullName.includes(search.toLowerCase()) ||
         inst.email?.toLowerCase().includes(search.toLowerCase()) ||
         inst.phone?.toLowerCase().includes(search.toLowerCase()) ||
         inst.sector?.toLowerCase().includes(search.toLowerCase())
      );
   });
   function highlightText(text, query) {
      if (!text) return ""; // protecție împotriva undefined/null
      if (!query) return text;

      const parts = text.toString().split(new RegExp(`(${query})`, "gi"));
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

   const handleAdd = () => {
      const payload = {
         ...newInstr,
      };
      dispatch(addInstructor(payload));
      setNewInstr({
         firstName: "",
         lastName: "",
         phone: "",
         sector: "Botanica",
         isActive: true,
         instructorsGroupId: null,
      });
      setActiveTab("list");
   };

   const handleSaveEdit = () => {
      const payload = {
         firstName: editInstr.firstName,
         lastName: editInstr.lastName,
         phone: editInstr.phone,
         sector: editInstr.sector,
      };

      dispatch(updateInstructor({ id: editingId, data: payload }));
      setEditingId(null);
   };

   const handleDelete = (id) => {
      if (window.confirm("Ești sigur că vrei să ștergi acest instructor?")) {
         dispatch(removeInstructor(id));
         setEditingId(null);
      }
   };

   return (
      <div className="instructors-popup">
         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Instructori</h3>
         </div>

         <div className="instructors-popup__content">
            {/* Sidebar */}
            <div className="instructors-popup__search-wrapper">
               <input
                  type="text"
                  className="instructors-popup__search"
                  placeholder="Caută instructor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
               />
               <button
                  className={`instructors-popup__tab-button ${
                     activeTab === "list" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("list")}
               >
                  Listă
               </button>
               <button
                  className={`instructors-popup__tab-button ${
                     activeTab === "add" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("add")}
               >
                  Adaugă
               </button>
            </div>

            {/* Content */}
            <div className="instructors-popup__wrapper">
               {activeTab === "list" && (
                  <div className="instructors-popup__list-wrapper">
                     <ul className="instructors-popup__list-items">
                        {filteredInstructors.map((inst) => (
                           <li
                              key={inst.id}
                              className={`instructors-popup__item ${
                                 editingId === inst.id ? "active" : ""
                              }`}
                           >
                              {editingId === inst.id ? (
                                 // FORMULAR EDIT INLINE
                                 <div className="instructors-popup__form">
                                    <div className="instructors-popup__form-row">
                                       <input
                                          type="text"
                                          className="instructors-popup__input"
                                          value={editInstr.firstName}
                                          onChange={(e) =>
                                             setEditInstr({
                                                ...editInstr,
                                                firstName: e.target.value,
                                             })
                                          }
                                       />
                                       <input
                                          type="text"
                                          className="instructors-popup__input"
                                          value={editInstr.lastName}
                                          onChange={(e) =>
                                             setEditInstr({
                                                ...editInstr,
                                                lastName: e.target.value,
                                             })
                                          }
                                       />
                                    </div>
                                    <div className="instructors-popup__form-row">
                                       <input
                                          type="text"
                                          className="instructors-popup__input"
                                          value={editInstr.phone}
                                          onChange={(e) =>
                                             setEditInstr({
                                                ...editInstr,
                                                phone: e.target.value,
                                             })
                                          }
                                       />
                                       {/*<input
                                    type="email"
                                    className="instructors-popup__input"
                                    value={editInstr.email}
                                    onChange={(e) =>
                                       setEditInstr({
                                          ...editInstr,
                                          email: e.target.value,
                                       })
                                    }
                                 />*/}

                                       <div
                                          className={`instructors-popup__radio-wrapper ${
                                             editInstr.sector === "Botanica"
                                                ? "active-botanica"
                                                : "active-ciocana"
                                          }`}
                                       >
                                          <label>
                                             <input
                                                type="radio"
                                                name={`sector-${editingId}`}
                                                value="Botanica"
                                                checked={
                                                   editInstr.sector ===
                                                   "Botanica"
                                                }
                                                onChange={(e) =>
                                                   setEditInstr({
                                                      ...editInstr,
                                                      sector: e.target.value,
                                                   })
                                                }
                                             />
                                             Botanica
                                          </label>
                                          <label>
                                             <input
                                                type="radio"
                                                name={`sector-${editingId}`}
                                                value="Ciocana"
                                                checked={
                                                   editInstr.sector ===
                                                   "Ciocana"
                                                }
                                                onChange={(e) =>
                                                   setEditInstr({
                                                      ...editInstr,
                                                      sector: e.target.value,
                                                   })
                                                }
                                             />
                                             Ciocana
                                          </label>
                                       </div>
                                    </div>

                                    <div className="instructors-popup__btns">
                                       <button
                                          className="instructors-popup__form-button instructors-popup__form-button--save"
                                          onClick={handleSaveEdit}
                                       >
                                          Salvează
                                       </button>
                                       <button
                                          className="instructors-popup__form-button instructors-popup__form-button--cancel"
                                          onClick={() => setEditingId(null)}
                                       >
                                          Anulează
                                       </button>
                                       <button
                                          className="instructors-popup__form-button instructors-popup__form-button--delete"
                                          onClick={() => handleDelete(inst.id)}
                                       >
                                          Șterge
                                       </button>
                                    </div>
                                 </div>
                              ) : (
                                 <>
                                    <div className="instructors-popup__item-left">
                                       <h3>
                                          {highlightText(
                                             inst.firstName +
                                                " " +
                                                inst.lastName,
                                             search
                                          )}
                                       </h3>
                                       <p>
                                          {highlightText(inst.phone, search)}
                                       </p>
                                       {/*<p>{highlightText(inst.email, search)}</p>*/}
                                       <p>
                                          {highlightText(inst.sector, search)}
                                       </p>
                                    </div>

                                    <ReactSVG
                                       className="instructors-popup__edit-button react-icon"
                                       onClick={() => {
                                          setEditingId(inst.id);
                                          setEditInstr({
                                             firstName: inst.firstName,
                                             lastName: inst.lastName,
                                             phone: inst.phone,
                                             email: inst.email,
                                             sector: inst.sector,
                                          });
                                       }}
                                       src={editIcon}
                                    />
                                 </>
                              )}
                           </li>
                        ))}
                     </ul>
                  </div>
               )}

               {activeTab === "add" && (
                  <div className="instructors-popup__add">
                     <div className="instructors-popup__form-row">
                        <input
                           type="text"
                           className="instructors-popup__input"
                           placeholder="Prenume"
                           value={newInstr.firstName}
                           onChange={(e) =>
                              setNewInstr({
                                 ...newInstr,
                                 firstName: e.target.value,
                              })
                           }
                        />
                        <input
                           type="text"
                           className="instructors-popup__input"
                           placeholder="Nume"
                           value={newInstr.lastName}
                           onChange={(e) =>
                              setNewInstr({
                                 ...newInstr,
                                 lastName: e.target.value,
                              })
                           }
                        />
                     </div>
                     <div className="instructors-popup__form-row">
                        {/*<input
                        type="email"
                        className="instructors-popup__input"
                        placeholder="Email"
                        value={newInstr.email}
                        onChange={(e) =>
                           setNewInstr({ ...newInstr, email: e.target.value })
                        }
                     />*/}
                        <input
                           type="password"
                           className="instructors-popup__input"
                           placeholder="Parolă"
                           value={newInstr.password}
                           onChange={(e) =>
                              setNewInstr({
                                 ...newInstr,
                                 password: e.target.value,
                              })
                           }
                        />

                        <input
                           type="text"
                           className="instructors-popup__input"
                           placeholder="Telefon"
                           value={newInstr.phone}
                           onChange={(e) =>
                              setNewInstr({
                                 ...newInstr,
                                 phone: e.target.value,
                              })
                           }
                        />
                     </div>
                     {/* Sector radio */}
                     <div
                        className={`instructors-popup__radio-wrapper ${
                           newInstr.sector === "Botanica"
                              ? "active-botanica"
                              : "active-ciocana"
                        }`}
                     >
                        <label>
                           <input
                              type="radio"
                              name="sector"
                              value="Botanica"
                              checked={newInstr.sector === "Botanica"}
                              onChange={(e) =>
                                 setNewInstr({
                                    ...newInstr,
                                    sector: e.target.value,
                                 })
                              }
                           />
                           Botanica
                        </label>
                        <label>
                           <input
                              type="radio"
                              name="sector"
                              value="Ciocana"
                              checked={newInstr.sector === "Ciocana"}
                              onChange={(e) =>
                                 setNewInstr({
                                    ...newInstr,
                                    sector: e.target.value,
                                 })
                              }
                           />
                           Ciocana
                        </label>
                     </div>
                     <div className="instructors-popup__btns">
                        <button
                           className="instructors-popup__form-button instructors-popup__form-button--cancel"
                           onClick={() => setActiveTab("list")}
                        >
                           Anulează
                        </button>
                        <button
                           className="instructors-popup__form-button instructors-popup__form-button--save"
                           onClick={handleAdd}
                        >
                           Salvează
                        </button>
                     </div>
                  </div>
               )}
            </div>
         </div>
      </div>
   );
}

export default AddInstr;
