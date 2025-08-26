import React, { useState, useEffect, useContext } from "react";
import { ReactSVG } from "react-svg";
import { useDispatch, useSelector } from "react-redux";
import addIcon from "../../assets/svg/add-s.svg";
import searchIcon from "../../assets/svg/search.svg";
import { UserContext } from "../../UserContext";
import {
   fetchInstructorsGroups,
   addGroup,
   removeGroup,
   addInstructor,
   swapInstructor,
} from "../../store/instructorsGroupSlice";
import { fetchInstructors } from "../../store/instructorsSlice";
import { fetchCars, addCar, updateCar, removeCar } from "../../store/carsSlice";

function InstructorsGroupManager() {
   const { user } = useContext(UserContext);
   const dispatch = useDispatch();

   const groups = useSelector((state) => state.instructorsGroups.list || []);
   const instructors = useSelector((state) => state.instructors.list || []);
   const cars = useSelector((state) => state.cars.list || []);
   const [gearbox, setGearbox] = useState("manual");

   const [confirmDeleteId, setConfirmDeleteId] = useState(null);

   const [sector, setSector] = useState("Botanica");
   const [showForm, setShowForm] = useState(false);
   const [newGroupName, setNewGroupName] = useState("");
   const [grid, setGrid] = useState([
      { instructorId: "", plateNumber: "", carId: null, gearbox: "manual" },
      { instructorId: "", plateNumber: "", carId: null, gearbox: "manual" },
      { instructorId: "", plateNumber: "", carId: null, gearbox: "manual" },
   ]);

   const [search, setSearch] = useState({ open: false, query: "" });

   // State pentru editor inline per grupă
   const [editingGroups, setEditingGroups] = useState({});

   useEffect(() => {
      if (user?.role === "ADMIN") {
         dispatch(fetchInstructorsGroups());
         dispatch(fetchInstructors());
         dispatch(fetchCars());
      }
   }, [dispatch, user]);

   // --- Form creare grup ---
   const handleGridChange = (index, field, value) => {
      setGrid((prev) =>
         prev.map((item, i) =>
            i === index ? { ...item, [field]: value } : item
         )
      );
   };

   const handleCreateGroupWithCars = async () => {
      if (!newGroupName.trim()) return;

      const createdCars = [];
      for (const col of grid) {
         if (!col.instructorId || !col.plateNumber) continue;

         const newCar = await dispatch(
            addCar({
               plateNumber: col.plateNumber,
               instructorId: Number(col.instructorId),
               gearbox: gearbox, // ia valoarea din radio
            })
         ).unwrap();

         createdCars.push({ instructorId: col.instructorId, carId: newCar.id });
      }

      if (createdCars.length === 0) return;

      const groupPayload = {
         name: newGroupName,
         sector: sector, // folosim sector din radio
         instructors: [],
         cars: [],
      };

      const group = await dispatch(addGroup(groupPayload)).unwrap();

      for (const link of createdCars) {
         await dispatch(
            addInstructor({
               groupId: group.id,
               instructorId: link.instructorId,
               carId: link.carId,
            })
         );
      }

      // reset form
      setGrid([
         { instructorId: "", plateNumber: "", carId: null, gearbox: "manual" },
         { instructorId: "", plateNumber: "", carId: null, gearbox: "manual" },
         { instructorId: "", plateNumber: "", carId: null, gearbox: "manual" },
      ]);
      setNewGroupName("");
      setSector("Botanica");
      setGearbox("manual"); // 🔥 resetăm și gearbox
      setShowForm(false);
   };

   const handleDeleteGroup = (id, name) => {
      dispatch(removeGroup(id));
      setConfirmDeleteId(null);
   };

   // --- Editor inline ---
   const toggleEdit = (group) => {
      setEditingGroups((prev) => ({
         ...prev,
         [group.id]: {
            isEditing: !prev[group.id]?.isEditing,
            editGrid:
               prev[group.id]?.editGrid ||
               group.instructors
                  .map((inst) => {
                     const car = cars.find((c) => c.instructorId === inst.id);
                     return {
                        instructorId: inst.id,
                        oldInstructorId: inst.id,
                        plateNumber: car?.plateNumber || "",
                        carId: car?.id || null,
                     };
                  })
                  .concat(
                     Array.from(
                        { length: 3 - group.instructors.length },
                        () => ({
                           instructorId: "",
                           plateNumber: "",
                           carId: null,
                        })
                     )
                  ),
         },
      }));
   };

   const handleEditGridChange = (groupId, index, field, value) => {
      setEditingGroups((prev) => ({
         ...prev,
         [groupId]: {
            ...prev[groupId],
            editGrid: prev[groupId].editGrid.map((item, i) =>
               i === index ? { ...item, [field]: value } : item
            ),
         },
      }));
   };

   const handleSaveInline = async (groupId) => {
      const { editGrid } = editingGroups[groupId];
      for (const col of editGrid) {
         if (!col.instructorId || !col.plateNumber) continue;

         // Swap instructor dacă a fost schimbat
         if (col.oldInstructorId && col.oldInstructorId !== col.instructorId) {
            await dispatch(
               swapInstructor({
                  groupId,
                  oldInstructorId: col.oldInstructorId,
                  newInstructorId: col.instructorId,
               })
            ).unwrap();
         }

         // Actualizare sau creare mașină
         if (col.carId) {
            await dispatch(
               updateCar({
                  id: col.carId,
                  plateNumber: col.plateNumber,
                  instructorId: col.instructorId,
               })
            ).unwrap();
         } else {
            const newCar = await dispatch(
               addCar({
                  plateNumber: col.plateNumber,
                  instructorId: col.instructorId,
               })
            ).unwrap();
            await dispatch(
               addInstructor({
                  groupId,
                  instructorId: col.instructorId,
                  carId: newCar.id,
               })
            ).unwrap();
         }
      }

      setEditingGroups((prev) => ({
         ...prev,
         [groupId]: { ...prev[groupId], isEditing: false },
      }));
   };

   // --- Filtrare ---
   const filteredGroups = groups.filter((group) => {
      const groupNameMatch = group.name
         .toLowerCase()
         .includes(search.query.toLowerCase());
      const instructorMatch = group.instructors.some((inst) =>
         `${inst.firstName} ${inst.lastName}`
            .toLowerCase()
            .includes(search.query.toLowerCase())
      );
      const carMatch = group.instructors.some((inst) => {
         const car = cars.find((c) => c.instructorId === inst.id);
         return car?.plateNumber
            ?.toLowerCase()
            .includes(search.query.toLowerCase());
      });
      return groupNameMatch || instructorMatch || carMatch;
   });

   const highlightText = (text, query) => {
      if (!query) return text;
      const parts = text.split(new RegExp(`(${query})`, "gi"));
      return parts.map((part, index) =>
         part.toLowerCase() === query.toLowerCase() ? (
            <i key={index} className="highlight">
               {part}
            </i>
         ) : (
            part
         )
      );
   };

   return (
      <div className="instructorsgroup">
         {/* Header */}
         <div
            className={`instructorsgroup__header ${search.open ? "open" : ""}`}
         >
            <h2>Toate Grupele</h2>
            <div className="groups__right">
               <div className="groups__search">
                  <input
                     type="text"
                     placeholder="Caută grupă..."
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
                        className={`groups__icon react-icon ${
                           search.open ? "rotate45" : ""
                        }`}
                        src={search.open ? addIcon : searchIcon}
                     />
                  </button>
               </div>
               <button onClick={() => setShowForm((prev) => !prev)}>
                  <ReactSVG
                     className="instructorsgroup__icon react-icon"
                     src={addIcon}
                  />
               </button>
            </div>
         </div>

         {/* Grid */}
         <div className="instructorsgroup__grid-wrapper">
            <div className="instructorsgroup__grid">
               {/* Form creare grup */}
               {showForm && (
                  <div className="instructorsgroup__item instructorsgroup__create-form">
                     <input
                        type="text"
                        placeholder="Numele grupei"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        className="instructorsgroup__input"
                     />
                     <div
                        className={`instructors-popup__radio-wrapper addprog ${
                           sector === "Botanica"
                              ? "active-botanica"
                              : "active-ciocana"
                        }`}
                     >
                        <label>
                           <input
                              type="radio"
                              name="sector"
                              value="Botanica"
                              checked={sector === "Botanica"}
                              onChange={(e) => setSector(e.target.value)}
                           />
                           Botanica
                        </label>
                        <label>
                           <input
                              type="radio"
                              name="sector"
                              value="Ciocana"
                              checked={sector === "Ciocana"}
                              onChange={(e) => setSector(e.target.value)}
                           />
                           Ciocana
                        </label>
                     </div>

                     <div className="instructorsgroup__create-grid">
                        {grid.map((col, idx) => (
                           <div
                              key={idx}
                              className="instructorsgroup__create-row"
                           >
                              <select
                                 value={col.instructorId}
                                 onChange={(e) =>
                                    handleGridChange(
                                       idx,
                                       "instructorId",
                                       e.target.value
                                    )
                                 }
                                 className="instructorsgroup__select"
                              >
                                 <option value="">Selectează instructor</option>
                                 {instructors.map((inst) => (
                                    <option key={inst.id} value={inst.id}>
                                       {inst.firstName} {inst.lastName}
                                    </option>
                                 ))}
                              </select>
                              <input
                                 type="text"
                                 placeholder="Nr. mașină"
                                 value={col.plateNumber}
                                 onChange={(e) =>
                                    handleGridChange(
                                       idx,
                                       "plateNumber",
                                       e.target.value
                                    )
                                 }
                                 className="instructorsgroup__input"
                              />
                           </div>
                        ))}
                     </div>

                     <button
                        onClick={handleCreateGroupWithCars}
                        className="instructorsgroup__button"
                     >
                        Creează grupă
                     </button>
                  </div>
               )}
               {/* Listează grupuri */}
               {filteredGroups.map((group) => {
                  const groupEdit = editingGroups[group.id] || {
                     isEditing: false,
                     editGrid: [],
                  };

                  return (
                     <div
                        key={group.id}
                        className={`instructorsgroup__item ${
                           editingGroups[group.id]?.isEditing ? "active" : ""
                        }`}
                     >
                        {/* Header grup */}
                        <div className="instructorsgroup__item-header">
                           <h4>
                              {highlightText(group.name, search.query)} –{" "}
                              {highlightText(group.sector, search.query)}
                           </h4>
                        </div>

                        {/* Formular de editare */}
                        {groupEdit.isEditing ? (
                           <div className="instructorsgroup__edit-form">
                              {groupEdit.editGrid.map((col, idx) => (
                                 <div
                                    key={idx}
                                    className="instructorsgroup__edit-row"
                                 >
                                    <select
                                       value={col.instructorId}
                                       onChange={(e) =>
                                          handleEditGridChange(
                                             group.id,
                                             idx,
                                             "instructorId",
                                             e.target.value
                                          )
                                       }
                                       className="instructorsgroup__select"
                                    >
                                       <option value="">
                                          Selectează instructor
                                       </option>
                                       {instructors.map((inst) => (
                                          <option key={inst.id} value={inst.id}>
                                             {inst.firstName} {inst.lastName}
                                          </option>
                                       ))}
                                    </select>
                                    <input
                                       type="text"
                                       value={col.plateNumber}
                                       onChange={(e) =>
                                          handleEditGridChange(
                                             group.id,
                                             idx,
                                             "plateNumber",
                                             e.target.value
                                          )
                                       }
                                       placeholder="Nr. mașină"
                                       className="instructorsgroup__input"
                                    />
                                 </div>
                              ))}
                              <div
                                 className={`instructors-popup__radio-wrapper instrgroup ${
                                    gearbox === "manual"
                                       ? "active-botanica"
                                       : "active-ciocana"
                                 }`}
                              >
                                 <label>
                                    <input
                                       type="radio"
                                       name="gearbox"
                                       value="manual"
                                       checked={gearbox === "manual"}
                                       onChange={(e) =>
                                          setGearbox(e.target.value)
                                       }
                                    />
                                    Manual
                                 </label>
                                 <label>
                                    <input
                                       type="radio"
                                       name="gearbox"
                                       value="automat"
                                       checked={gearbox === "automat"}
                                       onChange={(e) =>
                                          setGearbox(e.target.value)
                                       }
                                    />
                                    Automat
                                 </label>
                              </div>

                              <button
                                 onClick={() => handleSaveInline(group.id)}
                                 className="instructorsgroup__button"
                              >
                                 Salvează
                              </button>
                           </div>
                        ) : (
                           <ul className="instructorsgroup__list">
                              {group.instructors.map((inst) => {
                                 const car = cars.find(
                                    (c) => c.instructorId === inst.id
                                 );
                                 return (
                                    <li key={inst.id}>
                                       {highlightText(
                                          `${inst.firstName} ${inst.lastName}`,
                                          search.query
                                       )}
                                       {" – "}
                                       {highlightText(
                                          car?.plateNumber || "N/A",
                                          search.query
                                       )}
                                       {" – "}
                                       {car?.gearbox || "Manual"}
                                    </li>
                                 );
                              })}
                           </ul>
                        )}
                        <div className="instructorsgroup__actions">
                           <button onClick={() => toggleEdit(group)}>
                              {groupEdit.isEditing ? "Anulează" : "Editează"}
                           </button>
                           <div className="instructorsgroup__item-delete groups__item-delete">
                              <button
                                 onClick={() => setConfirmDeleteId(group.id)}
                                 className={`delete-btn ${
                                    confirmDeleteId === group.id ? "hidden" : ""
                                 }`}
                              >
                                 Șterge
                              </button>
                              <div
                                 className={`delete-confirmation ${
                                    confirmDeleteId === group.id ? "" : "hidden"
                                 }`}
                              >
                                 <button
                                    onClick={() => handleDeleteGroup(group.id)}
                                    className="delete-confirm"
                                 >
                                    Da
                                 </button>
                                 <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="cancel-confirm"
                                 >
                                    Nu
                                 </button>
                              </div>
                           </div>
                        </div>
                     </div>
                  );
               })}
            </div>
         </div>
      </div>
   );
}

export default InstructorsGroupManager;
