import React, { useState } from "react";
import "react-datepicker/dist/react-datepicker.css";
import { ReactSVG } from "react-svg";
import addIcon from "../../assets/svg/add.svg";
import arrowIcon from "../../assets/svg/arrow.svg";

// Dummy instructors list
const dummyInstructors = [
   { id: 1, name: "Ion Popescu", email: "ion@example.com" },
   { id: 2, name: "Maria Ionescu", email: "maria@example.com" },
   { id: 3, name: "Alex Dima", email: "alex@example.com" },
];

function AddInstr() {
   const [activeTab, setActiveTab] = useState("list"); // list | add | edit
   const [search, setSearch] = useState("");
   const [instructors, setInstructors] = useState(dummyInstructors);
   const [newInstr, setNewInstr] = useState({ name: "", email: "" });

   const filteredInstructors = instructors.filter((inst) =>
      inst.name.toLowerCase().includes(search.toLowerCase())
   );

   const handleAdd = () => {
      setInstructors([...instructors, { ...newInstr, id: Date.now() }]);
      setNewInstr({ name: "", email: "" });
      setActiveTab("list");
   };

   const closePanel = () => {
      document.body.classList.remove("popup-instr-add");
   };

   return (
      <>
         <div
            className="popup-panel__overlay popup-instr-add"
            onClick={closePanel}
         />
         <div className="popup-panel popup-instr-add">
            <div className="popup-panel__inner">
               <div className="popup-panel__header">
                  <h3 className="popup-panel__title">Instructori</h3>
                  <button className="popup-panel__close" onClick={closePanel}>
                     &times;
                  </button>
               </div>

               <div
                  className="popup-panel__body"
                  style={{ display: "flex", gap: "1rem" }}
               >
                  {/* Sidebar cu Search și Tabs */}
                  <div
                     style={{
                        minWidth: "200px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                     }}
                  >
                     <input
                        type="text"
                        placeholder="Caută instructor..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                     />
                     <button onClick={() => setActiveTab("list")}>
                        👥 Listă
                     </button>
                     <button onClick={() => setActiveTab("add")}>
                        ➕ Adaugă
                     </button>
                     <button onClick={() => setActiveTab("edit")}>
                        ✏️ Editare
                     </button>
                  </div>

                  {/* Conținut principal în funcție de tab */}
                  <div style={{ flexGrow: 1 }}>
                     {activeTab === "list" && (
                        <div>
                           <h4>Lista Instructori</h4>
                           <ul>
                              {filteredInstructors.map((inst) => (
                                 <li key={inst.id}>
                                    {inst.name} — {inst.email}
                                 </li>
                              ))}
                           </ul>
                        </div>
                     )}

                     {activeTab === "add" && (
                        <div>
                           <h4>Adaugă Instructor</h4>
                           <input
                              type="text"
                              placeholder="Nume"
                              value={newInstr.name}
                              onChange={(e) =>
                                 setNewInstr({
                                    ...newInstr,
                                    name: e.target.value,
                                 })
                              }
                           />
                           <input
                              type="email"
                              placeholder="Email"
                              value={newInstr.email}
                              onChange={(e) =>
                                 setNewInstr({
                                    ...newInstr,
                                    email: e.target.value,
                                 })
                              }
                           />
                           <button onClick={handleAdd}>Salvează</button>
                        </div>
                     )}

                     {activeTab === "edit" && (
                        <div>
                           <h4>Editare Instructori</h4>
                           <ul>
                              {filteredInstructors.map((inst) => (
                                 <li key={inst.id}>
                                    {inst.name} — {inst.email}
                                    <button
                                       onClick={() => alert("Deschide editor")}
                                    >
                                       Editează
                                    </button>
                                 </li>
                              ))}
                           </ul>
                        </div>
                     )}
                  </div>
               </div>
            </div>
         </div>
      </>
   );
}

export default AddInstr;
