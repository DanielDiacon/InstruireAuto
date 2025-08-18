import React, { useState } from "react";
import Popup from "../Utils/Popup"; // componenta generică
import {
   createInstructors,
   deleteInstructors,
   getInstructors,
   patchInstructors,
} from "../../api/instructorsService";

function AddInstr({ instructors, setInstructors, isOpen, onClose }) {
   const [activeTab, setActiveTab] = useState("list");
   const [search, setSearch] = useState("");
   const [newInstr, setNewInstr] = useState({
      firstName: "",
      lastName: "",
      phone: "",
   });
   const [editingId, setEditingId] = useState(null);
   const [editInstr, setEditInstr] = useState({
      firstName: "",
      lastName: "",
      phone: "",
   });

   const filteredInstructors = instructors.filter((inst) =>
      `${inst.firstName} ${inst.lastName}`
         .toLowerCase()
         .includes(search.toLowerCase())
   );

   const handleAdd = async () => {
      try {
         await createInstructors(newInstr);
         const data = await getInstructors();
         setInstructors(data);
         setNewInstr({ firstName: "", lastName: "", phone: "" });
         setActiveTab("list");
      } catch (err) {
         console.error(err);
      }
   };

   const handleSaveEdit = async () => {
      try {
         await patchInstructors(editingId, editInstr);
         const updated = await getInstructors();
         setInstructors(updated);
         setEditingId(null);
      } catch (err) {
         console.error(err);
      }
   };

   const handleDelete = async (id) => {
      if (window.confirm("Ești sigur că vrei să ștergi acest instructor?")) {
         try {
            await deleteInstructors(id);
            const updated = await getInstructors();
            setInstructors(updated);
            setEditingId(null);
         } catch (err) {
            console.error(err);
         }
      }
   };

   // footer poate fi custom pentru butoane
   const footer = (
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
         <button onClick={onClose}>Închide</button>
      </div>
   );

   return (
      <>
         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Instructori</h3>
         </div>
         <div className="popup-panel__content"></div>
         <div className="instructors-popup">
            {/* Sidebar */}
            <div className="instructors-popup__sidebar">
               <input
                  type="text"
                  className="instructors-popup__search"
                  placeholder="Caută instructor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
               />
               <div className="instructors-popup__btns">
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

                  <button
                     className={`instructors-popup__tab-button ${
                        activeTab === "edit" ? "active" : ""
                     }`}
                     onClick={() => setActiveTab("edit")}
                  >
                     Editare
                  </button>
               </div>
            </div>

            {/* Content */}
            <div className="instructors-popup__content">
               {activeTab === "list" && (
                  <ul className="instructors-popup__list-items">
                     {filteredInstructors.map((inst) => (
                        <li key={inst.id}>
                           {inst.firstName} {inst.lastName} — {inst.phone}
                        </li>
                     ))}
                  </ul>
               )}

               {activeTab === "add" && (
                  <div className="instructors-popup__add">
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
                     <input
                        type="text"
                        className="instructors-popup__input"
                        placeholder="Telefon"
                        value={newInstr.phone}
                        onChange={(e) =>
                           setNewInstr({ ...newInstr, phone: e.target.value })
                        }
                     />
                     <button
                        className="instructors-popup__save-button"
                        onClick={handleAdd}
                     >
                        Salvează
                     </button>
                  </div>
               )}

               {activeTab === "edit" && (
                  <div className="instructors-popup__edit">
                     <ul className="instructors-popup__list-items">
                        {filteredInstructors.map((inst) => (
                           <li
                              key={inst.id}
                              className="instructors-popup__item"
                           >
                              {editingId === inst.id ? (
                                 <>
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
                                    <button
                                       className="instructors-popup__save-button"
                                       onClick={handleSaveEdit}
                                    >
                                       Salvează
                                    </button>
                                    <button
                                       className="instructors-popup__edit-button"
                                       onClick={() => setEditingId(null)}
                                    >
                                       Anulează
                                    </button>
                                    <button
                                       className="instructors-popup__edit-button"
                                       onClick={() => handleDelete(inst.id)}
                                    >
                                       Șterge
                                    </button>
                                 </>
                              ) : (
                                 <>
                                    <span>
                                       {inst.firstName} {inst.lastName} —{" "}
                                       {inst.phone}
                                    </span>
                                    <button
                                       className="instructors-popup__edit-button"
                                       onClick={() => {
                                          setEditingId(inst.id);
                                          setEditInstr(inst);
                                       }}
                                    >
                                       Editează
                                    </button>
                                 </>
                              )}
                           </li>
                        ))}
                     </ul>
                  </div>
               )}
            </div>
         </div>
      </>
   );
}

export default AddInstr;
