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
   addInstructor as addInstructorToGrp,
   updateGroup,
   removeInstructor,
} from "../../store/instructorsGroupSlice";

import { fetchInstructors } from "../../store/instructorsSlice";
import { fetchCars } from "../../store/carsSlice";

const toNum = (v) =>
   v === null || v === undefined || v === "" || Number.isNaN(Number(v))
      ? undefined
      : Number(v);

function InstructorChooser({
   instructors,
   cars,
   excludeIds = [],
   onPick,
   onClose,
   inline = false,
}) {
   const [query, setQuery] = useState("");
   const taken = new Set((excludeIds || []).map(String));

   const list = React.useMemo(() => {
      const q = String(query ?? "").toLowerCase();
      const base = q
         ? instructors.filter(
              (i) =>
                 `${i.firstName} ${i.lastName}`.toLowerCase().includes(q) ||
                 String(i.phone || "")
                    .toLowerCase()
                    .includes(q) ||
                 (
                    cars.find((c) => String(c.instructorId) === String(i.id))
                       ?.plateNumber || ""
                 )
                    .toLowerCase()
                    .includes(q)
           )
         : instructors;
      return base.map((i) => {
         const car = cars.find((c) => String(c.instructorId) === String(i.id));
         return {
            ...i,
            carPlate: car?.plateNumber || "—",
            disabled: taken.has(String(i.id)),
         };
      });
   }, [query, instructors, cars, excludeIds]);

   return (
      <div
         className={
            inline
               ? "instructorsgroup__create-form active"
               : "instructorsgroup__edit-form"
         }
         style={inline ? { position: "static" } : undefined}
      >
         <div
            className="instructorsgroup__actions"
            style={{ alignItems: "center" }}
         >
            <button
               type="button"
               className="instructorsgroup__button"
               onClick={onClose}
            >
               Înapoi
            </button>
            <input
               className="picker__search"
               placeholder="Caută instructor (nume, telefon, plăcuță)…"
               value={query}
               onChange={(e) => setQuery(e.target.value)}
               style={{ width: "100%" }}
            />
         </div>

         <ul className="picker__list" role="listbox">
            {list.length === 0 && (
               <li className="picker__empty">Niciun rezultat</li>
            )}
            {list.map((i) => (
               <li
                  key={i.id}
                  role="option"
                  className={
                     "picker__item" + (i.disabled ? " is-disabled" : "")
                  }
                  title={
                     i.disabled
                        ? "Deja selectat pe alt rând"
                        : `${i.firstName} ${i.lastName} ${i.phone || "—"}  ${
                             i.carPlate
                          }`
                  }
                  onClick={() => !i.disabled && onPick(i)}
               >
                  <div className="picker__label">
                     {i.firstName} {i.lastName}
                  </div>
                  <div className="picker__meta">{i.phone || "—"}</div>
                  <div className="picker__meta">{i.carPlate}</div>
               </li>
            ))}
         </ul>
      </div>
   );
}

export default function InstructorsGroupManager() {
   const { user } = useContext(UserContext);
   const dispatch = useDispatch();

   const groups = useSelector((s) => s.instructorsGroups.list || []);
   const instructors = useSelector((s) => s.instructors.list || []);
   const cars = useSelector((s) => s.cars.list || []);

   const [showForm, setShowForm] = useState(false);
   const [newGroupName, setNewGroupName] = useState("");
   const [sectorCreate, setSectorCreate] = useState("Botanica");

   const [grid, setGrid] = useState([
      { instructorId: "" },
      { instructorId: "" },
      { instructorId: "" },
   ]);

   const [confirmDeleteId, setConfirmDeleteId] = useState(null);
   const [search, setSearch] = useState({ open: false, query: "" });
   const [notice, setNotice] = useState(null);
   const notify = (text, type = "error") => setNotice({ text, type });
   const clearNotice = () => setNotice(null);

   const [editingGroups, setEditingGroups] = useState({});
   const [chooser, setChooser] = useState({
      open: false,
      mode: null,
      forRow: null,
      groupId: null,
   });

   useEffect(() => {
      if (user?.role === "ADMIN") {
         dispatch(fetchInstructorsGroups());
         dispatch(fetchInstructors());
         dispatch(fetchCars());
      }
   }, [dispatch, user]);

   const handleGridChange = (index, instructorId) => {
      setGrid((prev) =>
         prev.map((r, i) => (i === index ? { instructorId } : r))
      );
   };

   const handleCreateGroup = async () => {
      clearNotice();
      if (!newGroupName.trim()) return notify("Completează numele grupei.");

      try {
         const group = await dispatch(
            addGroup({
               name: newGroupName,
               sector: sectorCreate,
               instructors: [],
               cars: [],
            })
         ).unwrap();
         const groupId = group?.id ?? group?.data?.id;
         if (!groupId)
            throw new Error("Crearea grupei nu a întors un ID valid.");

         const seen = new Set();
         for (const row of grid) {
            const id = toNum(row.instructorId);
            if (!id) continue;
            if (seen.has(String(id))) continue;
            seen.add(String(id));
            await dispatch(
               addInstructorToGrp({ groupId, instructorId: id })
            ).unwrap();
         }

         setGrid([
            { instructorId: "" },
            { instructorId: "" },
            { instructorId: "" },
         ]);
         setNewGroupName("");
         setSectorCreate("Botanica");
         setShowForm(false);
         notify("Grupa a fost creată.", "success");
         await dispatch(fetchInstructorsGroups());
      } catch (e) {
         console.error("Create group error:", e);
         notify("Eroare la crearea grupei.");
      }
   };

   const handleDeleteGroup = (id) => {
      clearNotice();
      dispatch(removeGroup(id));
      setConfirmDeleteId(null);
   };

   const toggleEdit = (group) => {
      clearNotice();
      const insts = group.instructors || [];
      setEditingGroups((prev) => ({
         ...prev,
         [group.id]: {
            isEditing: !prev[group.id]?.isEditing,
            name: prev[group.id]?.name ?? group.name,
            sector: prev[group.id]?.sector ?? group.sector ?? "Botanica",
            editGrid:
               prev[group.id]?.editGrid ||
               insts
                  .map((inst) => ({ instructorId: inst.id }))
                  .concat(
                     Array.from(
                        { length: Math.max(0, 3 - insts.length) },
                        () => ({ instructorId: "" })
                     )
                  ),
         },
      }));
   };

   const handleEditGroupField = (groupId, field, value) => {
      setEditingGroups((prev) => ({
         ...prev,
         [groupId]: { ...prev[groupId], [field]: value },
      }));
   };
   const handleEditGridChange = (groupId, index, instructorId) => {
      setEditingGroups((prev) => ({
         ...prev,
         [groupId]: {
            ...prev[groupId],
            editGrid: prev[groupId].editGrid.map((r, i) =>
               i === index ? { instructorId } : r
            ),
         },
      }));
   };

   const handleSaveInline = async (groupId) => {
      clearNotice();
      try {
         const eg = editingGroups[groupId];
         const currentGroup = groups.find((g) => g.id === groupId);
         if (!currentGroup) throw new Error("Grupa nu a fost găsită.");

         // update grup
         const newName = (eg?.name ?? currentGroup?.name ?? "").trim();
         const newSector = eg?.sector ?? currentGroup?.sector ?? "Botanica";
         const safeName = newName || (currentGroup?.name ?? "");
         await dispatch(
            updateGroup({
               id: groupId,
               data: { name: safeName, sector: newSector },
            })
         ).unwrap();

         // add/remove instructori
         const prevInstIds = new Set(
            (currentGroup?.instructors || []).map((i) => String(i.id))
         );
         const wantedRows = (eg?.editGrid || [])
            .map((r) => toNum(r.instructorId))
            .filter(Boolean);
         const newInstKeys = new Set(
            Array.from(new Set(wantedRows.map(String)))
         );

         for (const k of newInstKeys) {
            if (!prevInstIds.has(k)) {
               await dispatch(
                  addInstructorToGrp({ groupId, instructorId: Number(k) })
               ).unwrap();
            }
         }
         for (const k of prevInstIds) {
            if (!newInstKeys.has(k)) {
               await dispatch(
                  removeInstructor({ groupId, instructorId: Number(k) })
               ).unwrap();
            }
         }

         setEditingGroups((prev) => ({
            ...prev,
            [groupId]: { ...prev[groupId], isEditing: false },
         }));
         notify("Modificările au fost salvate.", "success");
         await dispatch(fetchInstructorsGroups());
      } catch (err) {
         console.error("handleSaveInline error:", err);
         notify("Eroare la salvare. Verifică datele.");
      }
   };

   const filteredGroups = groups.filter((group) => {
      const q = (search.query || "").toLowerCase();
      const insts = group.instructors || [];
      const groupNameMatch = (group.name || "").toLowerCase().includes(q);
      const instructorMatch = insts.some((inst) =>
         `${inst.firstName} ${inst.lastName}`.toLowerCase().includes(q)
      );
      const carMatch = insts.some((inst) => {
         const car = cars.find((c) => c.instructorId === inst.id);
         return (
            (car?.plateNumber || "").toLowerCase().includes(q) ||
            (inst.phone || "").toLowerCase().includes(q)
         );
      });
      return groupNameMatch || instructorMatch || carMatch;
   });

   const instructorLabel = (id) => {
      const i = instructors.find((x) => String(x.id) === String(id));
      if (!i) return "Selectează instructor";
      const car = cars.find((c) => String(c.instructorId) === String(i.id));
      return `${i.firstName} ${i.lastName}${
         car?.plateNumber ? " — " + car.plateNumber : ""
      }`;
   };

   const highlightText = (text, query) => {
      const t = String(text ?? "");
      const q = String(query ?? "");
      if (!q) return t;
      const parts = t.split(new RegExp(`(${q})`, "gi"));
      return parts.map((part, index) =>
         part.toLowerCase() === q.toLowerCase() ? (
            <i key={index} className="highlight">
               {part}
            </i>
         ) : (
            part
         )
      );
   };

   const isCreateChooserOpen = chooser.open && chooser.mode === "create";

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
                     placeholder="Caută grupă / instructor / plăcuță / telefon…"
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

         {/* notice */}
         {notice && (
            <div
               className="notice"
               style={{
                  margin: "6px 12px 0",
                  padding: "8px 12px",
                  borderRadius: 10,
                  background:
                     notice.type === "success" ? "#0f766e22" : "#ef444422",
                  color: notice.type === "success" ? "#0f766e" : "#b91c1c",
               }}
               onClick={clearNotice}
               title="Click pentru a ascunde"
            >
               {notice.text}
            </div>
         )}

         {/* Grid */}
         <div className="instructorsgroup__grid-wrapper">
            <div className="instructorsgroup__grid">
               {/* Creare grup */}
               {showForm && (
                  <div className="instructorsgroup__item instructorsgroup__create-form active">
                     {isCreateChooserOpen ? (
                        <InstructorChooser
                           inline
                           instructors={instructors}
                           cars={cars}
                           excludeIds={grid
                              .map((r, idx) =>
                                 idx === chooser.forRow ? null : r.instructorId
                              )
                              .filter(Boolean)}
                           onClose={() =>
                              setChooser({
                                 open: false,
                                 mode: null,
                                 forRow: null,
                                 groupId: null,
                              })
                           }
                           onPick={(inst) => {
                              const idx = chooser.forRow;
                              handleGridChange(idx, String(inst.id));
                              setChooser({
                                 open: false,
                                 mode: null,
                                 forRow: null,
                                 groupId: null,
                              });
                           }}
                        />
                     ) : (
                        <>
                           <input
                              type="text"
                              placeholder="Numele grupei"
                              value={newGroupName}
                              onChange={(e) => setNewGroupName(e.target.value)}
                              className="instructorsgroup__input"
                           />

                           <div
                              className={`instructors-popup__radio-wrapper instrgroup ${
                                 sectorCreate === "Botanica"
                                    ? "active-botanica"
                                    : "active-ciocana"
                              }`}
                           >
                              <label>
                                 <input
                                    type="radio"
                                    name="sector_create"
                                    value="Botanica"
                                    checked={sectorCreate === "Botanica"}
                                    onChange={(e) =>
                                       setSectorCreate(e.target.value)
                                    }
                                 />
                                 Botanica
                              </label>
                              <label>
                                 <input
                                    type="radio"
                                    name="sector_create"
                                    value="Ciocana"
                                    checked={sectorCreate === "Ciocana"}
                                    onChange={(e) =>
                                       setSectorCreate(e.target.value)
                                    }
                                 />
                                 Ciocana
                              </label>
                           </div>

                           {/* butoane cu Nume — Plăcuță */}
                           <div className="instructorsgroup__create-grid">
                              {grid.map((col, idx) => (
                                 <div
                                    key={idx}
                                    className="instructorsgroup__create-row"
                                 >
                                    <button
                                       type="button"
                                       className="instructorsgroup__input"
                                       onClick={() =>
                                          setChooser({
                                             open: true,
                                             mode: "create",
                                             forRow: idx,
                                             groupId: null,
                                          })
                                       }
                                       title={instructorLabel(col.instructorId)}
                                       style={{ textAlign: "left" }}
                                    >
                                       {instructorLabel(col.instructorId)}
                                    </button>
                                 </div>
                              ))}
                           </div>

                           <button
                              onClick={handleCreateGroup}
                              className="instructorsgroup__button"
                           >
                              Creează grupă
                           </button>

                           <div className="instructorsgroup__item-delete groups__item-delete">
                              <button
                                 onClick={() => setShowForm(false)}
                                 className="cancel-confirm"
                              >
                                 Anulează
                              </button>
                           </div>
                        </>
                     )}
                  </div>
               )}

               {/* Grupe existente */}
               {filteredGroups.map((group) => {
                  const groupEdit = editingGroups[group.id] || {
                     isEditing: false,
                     editGrid: [],
                     name: group.name,
                     sector: group.sector || "Botanica",
                  };
                  const insts = group.instructors || [];
                  const isChooserOpenHere =
                     chooser.open &&
                     chooser.mode === "edit" &&
                     chooser.groupId === group.id;

                  return (
                     <div
                        key={group.id}
                        className={
                           "instructorsgroup__item " +
                           (groupEdit.isEditing || isChooserOpenHere
                              ? "active"
                              : "")
                        }
                     >
                        <div className="instructorsgroup__item-header">
                           {groupEdit.isEditing ? (
                              <>
                                 <input
                                    type="text"
                                    className="instructorsgroup__input-title"
                                    value={groupEdit.name ?? group.name ?? ""}
                                    onChange={(e) =>
                                       handleEditGroupField(
                                          group.id,
                                          "name",
                                          e.target.value
                                       )
                                    }
                                    placeholder={group.name || "Numele grupei"}
                                 />
                                 <button
                                    onClick={() => toggleEdit(group)}
                                    className="instructorsgroup__button rotate45"
                                 >
                                    <ReactSVG
                                       className="instructorsgroup__icon react-icon"
                                       src={addIcon}
                                    />
                                 </button>
                              </>
                           ) : (
                              <>
                                 <h4>
                                    {highlightText(group.name, search.query)}
                                 </h4>
                                 <div className="pillbar">
                                    <span className="pill">
                                       {(group.sector ?? "—").toLowerCase()}
                                    </span>
                                 </div>
                              </>
                           )}
                        </div>

                        {groupEdit.isEditing ? (
                           <div className="instructorsgroup__create-form active">
                              {isChooserOpenHere ? (
                                 <InstructorChooser
                                    inline
                                    instructors={instructors}
                                    cars={cars}
                                    excludeIds={(
                                       editingGroups[group.id]?.editGrid || []
                                    )
                                       .map((r, i) =>
                                          i === chooser.forRow
                                             ? null
                                             : r.instructorId
                                       )
                                       .filter(Boolean)}
                                    onClose={() =>
                                       setChooser({
                                          open: false,
                                          mode: null,
                                          forRow: null,
                                          groupId: null,
                                       })
                                    }
                                    onPick={(inst) => {
                                       handleEditGridChange(
                                          group.id,
                                          chooser.forRow,
                                          String(inst.id)
                                       );
                                       setChooser({
                                          open: false,
                                          mode: null,
                                          forRow: null,
                                          groupId: null,
                                       });
                                    }}
                                 />
                              ) : (
                                 <>
                                    {/* butoanele din edit arată și plăcuța */}
                                    <div className="instructorsgroup__create-grid">
                                       {groupEdit.editGrid.map((col, idx) => (
                                          <div
                                             key={idx}
                                             className="instructorsgroup__create-row"
                                          >
                                             <button
                                                type="button"
                                                className="instructorsgroup__input"
                                                onClick={() =>
                                                   setChooser({
                                                      open: true,
                                                      mode: "edit",
                                                      forRow: idx,
                                                      groupId: group.id,
                                                   })
                                                }
                                                title={instructorLabel(
                                                   col.instructorId
                                                )}
                                                style={{ textAlign: "left" }}
                                             >
                                                {instructorLabel(
                                                   col.instructorId
                                                )}
                                             </button>
                                          </div>
                                       ))}
                                    </div>

                                    {/* Sector (edit) */}
                                    <div
                                       className={`instructors-popup__radio-wrapper instrgroup ${
                                          (editingGroups[group.id]?.sector ||
                                             "Botanica") === "Botanica"
                                             ? "active-botanica"
                                             : "active-ciocana"
                                       }`}
                                    >
                                       <label>
                                          <input
                                             type="radio"
                                             name={`sector_edit_${group.id}`}
                                             value="Botanica"
                                             checked={
                                                (editingGroups[group.id]
                                                   ?.sector || "Botanica") ===
                                                "Botanica"
                                             }
                                             onChange={(e) =>
                                                handleEditGroupField(
                                                   group.id,
                                                   "sector",
                                                   e.target.value
                                                )
                                             }
                                          />
                                          Botanica
                                       </label>
                                       <label>
                                          <input
                                             type="radio"
                                             name={`sector_edit_${group.id}`}
                                             value="Ciocana"
                                             checked={
                                                (editingGroups[group.id]
                                                   ?.sector || "Botanica") ===
                                                "Ciocana"
                                             }
                                             onChange={(e) =>
                                                handleEditGroupField(
                                                   group.id,
                                                   "sector",
                                                   e.target.value
                                                )
                                             }
                                          />
                                          Ciocana
                                       </label>
                                    </div>

                                    <div className="instructorsgroup__actions">
                                       <button
                                          onClick={() =>
                                             handleSaveInline(group.id)
                                          }
                                          className="instructorsgroup__button"
                                       >
                                          Salvează
                                       </button>

                                       <div className="instructorsgroup__item-delete groups__item-delete">
                                          <button
                                             onClick={() =>
                                                setConfirmDeleteId(group.id)
                                             }
                                             className={`delete-btn ${
                                                confirmDeleteId === group.id
                                                   ? "hidden"
                                                   : ""
                                             }`}
                                          >
                                             Șterge
                                          </button>
                                          <div
                                             className={`delete-confirmation ${
                                                confirmDeleteId === group.id
                                                   ? ""
                                                   : "hidden"
                                             }`}
                                          >
                                             <button
                                                onClick={() =>
                                                   handleDeleteGroup(group.id)
                                                }
                                                className="delete-confirm"
                                             >
                                                Da
                                             </button>
                                             <button
                                                onClick={() =>
                                                   setConfirmDeleteId(null)
                                                }
                                                className="cancel-confirm"
                                             >
                                                Nu
                                             </button>
                                          </div>
                                       </div>
                                    </div>
                                 </>
                              )}
                           </div>
                        ) : (
                           <>
                              <ul className="instructorsgroup__list">
                                 {(insts || []).map((inst) => {
                                    const car = cars.find(
                                       (c) => c.instructorId === inst.id
                                    );
                                    return (
                                       <li key={inst.id}>
                                          <p>
                                             {highlightText(
                                                `${inst.firstName} ${inst.lastName}`,
                                                search.query
                                             )}{" "}
                                             —
                                          </p>

                                          <p>
                                             {highlightText(
                                                car?.plateNumber || "N/A",
                                                search.query
                                             )}
                                          </p>
                                       </li>
                                    );
                                 })}
                              </ul>

                              <div className="instructorsgroup__actions">
                                 <button onClick={() => toggleEdit(group)}>
                                    Editează
                                 </button>

                                 <div className="instructorsgroup__item-delete groups__item-delete">
                                    <button
                                       onClick={() =>
                                          setConfirmDeleteId(group.id)
                                       }
                                       className={`delete-btn ${
                                          confirmDeleteId === group.id
                                             ? "hidden"
                                             : ""
                                       }`}
                                    >
                                       Șterge
                                    </button>
                                    <div
                                       className={`delete-confirmation ${
                                          confirmDeleteId === group.id
                                             ? ""
                                             : "hidden"
                                       }`}
                                    >
                                       <button
                                          onClick={() =>
                                             handleDeleteGroup(group.id)
                                          }
                                          className="delete-confirm"
                                       >
                                          Da
                                       </button>
                                       <button
                                          onClick={() =>
                                             setConfirmDeleteId(null)
                                          }
                                          className="cancel-confirm"
                                       >
                                          Nu
                                       </button>
                                    </div>
                                 </div>
                              </div>
                           </>
                        )}
                     </div>
                  );
               })}
            </div>
         </div>
      </div>
   );
}
