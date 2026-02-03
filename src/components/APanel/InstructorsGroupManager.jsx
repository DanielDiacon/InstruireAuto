import React, { useState, useEffect, useContext, useMemo } from "react";

import { UserContext } from "../../UserContext";
import { useDispatch, useSelector } from "react-redux";

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

import IconButton from "../Common/IconButton";
import SearchToggle from "../Common/SearchToggle";
import ConfirmDeleteButton from "../Common/ConfirmDeleteButton";

/* ===================== Utils ===================== */

const MIN_ROWS = 2;
const MAX_ROWS = 100;

const toNum = (v) =>
   v === null || v === undefined || v === "" || Number.isNaN(Number(v))
      ? undefined
      : Number(v);

const escapeRegExp = (s = "") =>
   String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const highlightText = (text, query, highlightClassName) => {
   const t = String(text ?? "");
   const q = String(query ?? "");
   if (!q) return t;

   const safe = escapeRegExp(q);
   const parts = t.split(new RegExp(`(${safe})`, "gi"));

   return parts.map((part, index) =>
      part.toLowerCase() === q.toLowerCase() ? (
         <i key={index} className={highlightClassName}>
            {part}
         </i>
      ) : (
         part
      ),
   );
};

/* ====== Instructor Chooser ====== */
function InstructorChooser({
   instructors,
   cars,
   excludeIds = [],
   onPick,
   onClose,
   inline = false,
   // NEW
   usageByInstructorId = {}, // { [id]: [{groupId, name}] }
   currentGroupId = null,
}) {
   const [query, setQuery] = useState("");
   const taken = new Set((excludeIds || []).map(String));

   const list = useMemo(() => {
      const q = String(query ?? "").toLowerCase();

      const base = q
         ? instructors.filter((i) => {
              const full = `${i.firstName || ""} ${i.lastName || ""}`
                 .trim()
                 .toLowerCase();
              const phone = String(i.phone || "").toLowerCase();
              const carPlate = (
                 cars.find((c) => String(c.instructorId) === String(i.id))
                    ?.plateNumber || ""
              ).toLowerCase();
              return (
                 full.includes(q) || phone.includes(q) || carPlate.includes(q)
              );
           })
         : instructors;

      return base.map((i) => {
         const car = cars.find((c) => String(c.instructorId) === String(i.id));

         const memberships = usageByInstructorId?.[String(i.id)] || [];
         let statusText = "Liber";
         let statusTitle = "Instructor liber";

         if (memberships.length > 0) {
            const inCurrent =
               currentGroupId != null &&
               memberships.some(
                  (m) => String(m.groupId) === String(currentGroupId),
               );

            if (inCurrent) {
               statusText = "În grupa curentă";
               statusTitle = "Instructorul este deja în această grupă";
            } else {
               const first = memberships[0]?.name || "—";
               const extra =
                  memberships.length > 1 ? ` +${memberships.length - 1}` : "";
               statusText = `În grupă: ${first}${extra}`;
               statusTitle = `Instructorul este în: ${memberships
                  .map((m) => m?.name)
                  .filter(Boolean)
                  .join(", ")}`;
            }
         }

         return {
            ...i,
            carPlate: car?.plateNumber || "—",
            disabled: taken.has(String(i.id)),
            _statusText: statusText,
            _statusTitle: statusTitle,
            _isBusy: memberships.length > 0,
         };
      });
   }, [
      query,
      instructors,
      cars,
      excludeIds,
      usageByInstructorId,
      currentGroupId,
   ]);

   return (
      <div
         className={`instructorsGroupsUI__picker ${inline ? "is-inline" : ""}`}
      >
         <div className="instructorsGroupsUI__pickerTop">
            <button
               type="button"
               className="instructorsGroupsUI__btnSecondary"
               onClick={onClose}
            >
               Înapoi
            </button>

            <input
               className="instructorsGroupsUI__pickerSearch"
               placeholder="Caută instructor (nume, telefon, plăcuță)…"
               value={query}
               onChange={(e) => setQuery(e.target.value)}
            />
         </div>

         <ul className="instructorsGroupsUI__pickerList" role="listbox">
            {list.length === 0 && (
               <li className="instructorsGroupsUI__pickerEmpty">
                  Niciun rezultat
               </li>
            )}

            {list.map((i) => (
               <li
                  key={i.id}
                  role="option"
                  className={`instructorsGroupsUI__pickerItem ${
                     i.disabled ? "is-disabled" : ""
                  }`}
                  title={
                     i.disabled
                        ? "Deja selectat pe alt rând"
                        : `${i.firstName} ${i.lastName} ${i.phone || "—"}  ${i.carPlate}`
                  }
                  onClick={() => !i.disabled && onPick(i)}
               >
                  <div className="instructorsGroupsUI__pickerLabel">
                     {i.firstName} {i.lastName}
                  </div>

                  <div className="instructorsGroupsUI__pickerMeta">
                     {i.phone || "—"}
                  </div>

                  <div className="instructorsGroupsUI__pickerMeta">
                     {i.carPlate}
                  </div>

                  <div
                     className={`instructorsGroupsUI__pickerMeta ${
                        i._isBusy ? "is-busy" : "is-free"
                     }`}
                     title={i._statusTitle}
                  >
                     {i._statusText}
                  </div>
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

   // ✅ sector devine input text (orice)
   const [sectorCreate, setSectorCreate] = useState("");

   // ✅ start cu 2 rânduri, plus până la 100
   const [grid, setGrid] = useState([
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
      mode: null, // "create" | "edit"
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

   // ✅ map: instructorId -> [{groupId, name}]
   const usageByInstructorId = useMemo(() => {
      const out = {};
      for (const g of groups || []) {
         for (const inst of g?.instructors || []) {
            const k = String(inst?.id);
            if (!k) continue;
            if (!out[k]) out[k] = [];
            out[k].push({ groupId: g.id, name: g.name });
         }
      }
      return out;
   }, [groups]);

   const handleGridChange = (index, instructorId) => {
      setGrid((prev) =>
         prev.map((r, i) => (i === index ? { instructorId } : r)),
      );
   };

   const clearGridRow = (index) => {
      handleGridChange(index, "");
   };

   const addCreateRow = () => {
      setGrid((prev) => {
         if (prev.length >= MAX_ROWS) return prev;
         return [...prev, { instructorId: "" }];
      });
   };

   const instructorLabel = (id) => {
      const i = instructors.find((x) => String(x.id) === String(id));
      if (!i) return "Selectează instructor";
      const car = cars.find((c) => String(c.instructorId) === String(i.id));
      return `${i.firstName} ${i.lastName}${
         car?.plateNumber ? " - " + car.plateNumber : ""
      }`;
   };

   const filteredGroups = useMemo(() => {
      const q = (search.query || "").toLowerCase();
      return groups.filter((group) => {
         const insts = group.instructors || [];
         const groupNameMatch = (group.name || "").toLowerCase().includes(q);

         const instructorMatch = insts.some((inst) =>
            `${inst.firstName} ${inst.lastName}`.toLowerCase().includes(q),
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
   }, [groups, cars, search.query]);

   const handleCreateGroup = async () => {
      clearNotice();
      if (!newGroupName.trim()) return notify("Completează numele grupei.");

      try {
         const group = await dispatch(
            addGroup({
               name: newGroupName,
               sector: String(sectorCreate || "").trim(), // ✅ input text
               instructors: [],
               cars: [],
            }),
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
               addInstructorToGrp({ groupId, instructorId: id }),
            ).unwrap();
         }

         setGrid(
            Array.from({ length: MIN_ROWS }, () => ({ instructorId: "" })),
         );
         setNewGroupName("");
         setSectorCreate("");
         setShowForm(false);
         notify("Grupa a fost creată.", "success");
         await dispatch(fetchInstructorsGroups());
      } catch (e) {
         console.error("Create group error:", e);
         notify("Eroare la crearea grupei.");
      }
   };

   const handleDeleteGroup = async (id) => {
      clearNotice();
      try {
         await dispatch(removeGroup(id)).unwrap();
      } catch (_) {}
      setConfirmDeleteId(null);
      await dispatch(fetchInstructorsGroups());
   };

   const toggleEdit = (group) => {
      clearNotice();
      const insts = group.instructors || [];

      setEditingGroups((prev) => {
         const wasEditing = !!prev[group.id]?.isEditing;

         const initialRows = insts.map((inst) => ({ instructorId: inst.id }));
         while (initialRows.length < MIN_ROWS)
            initialRows.push({ instructorId: "" });

         return {
            ...prev,
            [group.id]: {
               isEditing: !wasEditing,
               name: prev[group.id]?.name ?? group.name,
               sector: prev[group.id]?.sector ?? group.sector ?? "",
               editGrid: prev[group.id]?.editGrid || initialRows,
            },
         };
      });
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
               i === index ? { instructorId } : r,
            ),
         },
      }));
   };

   const clearEditRow = (groupId, index) => {
      handleEditGridChange(groupId, index, "");
   };

   const addEditRow = (groupId) => {
      setEditingGroups((prev) => {
         const eg = prev[groupId];
         const rows = eg?.editGrid || [];
         if (rows.length >= MAX_ROWS) return prev;
         return {
            ...prev,
            [groupId]: {
               ...eg,
               editGrid: [...rows, { instructorId: "" }],
            },
         };
      });
   };

   const handleSaveInline = async (groupId) => {
      clearNotice();
      try {
         const eg = editingGroups[groupId];
         const currentGroup = groups.find((g) => g.id === groupId);
         if (!currentGroup) throw new Error("Grupa nu a fost găsită.");

         const newName = (eg?.name ?? currentGroup?.name ?? "").trim();
         const newSector = String(
            eg?.sector ?? currentGroup?.sector ?? "",
         ).trim();
         const safeName = newName || (currentGroup?.name ?? "");

         await dispatch(
            updateGroup({
               id: groupId,
               data: { name: safeName, sector: newSector },
            }),
         ).unwrap();

         const prevInstIds = new Set(
            (currentGroup?.instructors || []).map((i) => String(i.id)),
         );

         const wantedRows = (eg?.editGrid || [])
            .map((r) => toNum(r.instructorId))
            .filter(Boolean);

         const newInstKeys = new Set(
            Array.from(new Set(wantedRows.map(String))),
         );

         for (const k of newInstKeys) {
            if (!prevInstIds.has(k)) {
               await dispatch(
                  addInstructorToGrp({ groupId, instructorId: Number(k) }),
               ).unwrap();
            }
         }

         for (const k of prevInstIds) {
            if (!newInstKeys.has(k)) {
               await dispatch(
                  removeInstructor({ groupId, instructorId: Number(k) }),
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

   const isCreateChooserOpen = chooser.open && chooser.mode === "create";

   return (
      <div className="instructorsGroupsUI">
         <div
            className={`instructorsGroupsUI__header ${search.open ? "is-open" : ""}`}
         >
            <h2 className="instructorsGroupsUI__title">Grupe</h2>

            <div className="instructorsGroupsUI__right">
               <SearchToggle
                  open={search.open}
                  value={search.query}
                  onValueChange={(val) =>
                     setSearch((s) => ({ ...s, query: val }))
                  }
                  onToggle={() => setSearch((s) => ({ ...s, open: !s.open }))}
                  placeholder="Caută grupă / instructor / plăcuță / telefon…"
                  wrapperClassName="instructorsGroupsUI__search"
                  inputClassName="instructorsGroupsUI__inputSearch"
                  buttonClassName="instructorsGroupsUI__iconBtn"
                  iconClassName={`instructorsGroupsUI__icon ${
                     search.open ? "is-rotated" : ""
                  }`}
                  titleOpen="Închide căutarea"
                  titleClosed="Caută"
               />

               <IconButton
                  className="instructorsGroupsUI__iconBtn"
                  icon="add"
                  iconClassName="instructorsGroupsUI__icon"
                  onClick={() => {
                     clearNotice();
                     setShowForm((p) => !p);
                     setChooser({
                        open: false,
                        mode: null,
                        forRow: null,
                        groupId: null,
                     });
                     setConfirmDeleteId(null);
                  }}
                  title={showForm ? "Închide" : "Adaugă grupă"}
               />
            </div>
         </div>

         <div className="instructorsGroupsUI__gridWrap">
            <div className="instructorsGroupsUI__grid">
               {/* ===== CREATE ===== */}
               {showForm && (
                  <div className="instructorsGroupsUI__item is-active">
                     {isCreateChooserOpen ? (
                        <InstructorChooser
                           inline
                           instructors={instructors}
                           cars={cars}
                           usageByInstructorId={usageByInstructorId}
                           currentGroupId={null}
                           excludeIds={grid
                              .map((r, idx) =>
                                 idx === chooser.forRow ? null : r.instructorId,
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
                              handleGridChange(chooser.forRow, String(inst.id));
                              setChooser({
                                 open: false,
                                 mode: null,
                                 forRow: null,
                                 groupId: null,
                              });
                           }}
                        />
                     ) : (
                        <div className="instructorsGroupsUI__form">
                           <div className="instructorsGroupsUI__formTop">
                              <input
                                 type="text"
                                 placeholder="Numele grupei"
                                 value={newGroupName}
                                 onChange={(e) =>
                                    setNewGroupName(e.target.value)
                                 }
                                 className="instructorsGroupsUI__input"
                              />
                           </div>

                           {/* ✅ Sector input text */}
                           <div className="instructorsGroupsUI__sectorInput">
                              <input
                                 type="text"
                                 className="instructorsGroupsUI__input"
                                 placeholder="Botanica / Ciocana / Buiucani / niciunul"
                                 value={sectorCreate}
                                 onChange={(e) =>
                                    setSectorCreate(e.target.value)
                                 }
                              />
                           </div>

                           <div className="instructorsGroupsUI__createGrid">
                              {grid.map((col, idx) => (
                                 <div
                                    key={idx}
                                    className="instructorsGroupsUI__gridRow"
                                 >
                                    <button
                                       type="button"
                                       className="instructorsGroupsUI__chooserBtn"
                                       onClick={() =>
                                          setChooser({
                                             open: true,
                                             mode: "create",
                                             forRow: idx,
                                             groupId: null,
                                          })
                                       }
                                       title={instructorLabel(col.instructorId)}
                                    >
                                       {instructorLabel(col.instructorId)}
                                    </button>

                                    {/* ✅ trash: șterge instructorul din rând */}
                                    <IconButton
                                       className="instructorsGroupsUI__iconBtn instructorsGroupsUI__rowTrash"
                                       icon="delete"
                                       iconClassName="instructorsGroupsUI__icon"
                                       onClick={() => clearGridRow(idx)}
                                       title="Șterge instructorul din rând"
                                       aria-label="Șterge instructorul din rând"
                                    />
                                 </div>
                              ))}

                              {/* ✅ plus: adaugă rânduri până la 100 */}
                              <div className="instructorsGroupsUI__gridRowAdd">
                                 <IconButton
                                    className="instructorsGroupsUI__iconBtn"
                                    icon="add"
                                    iconClassName="instructorsGroupsUI__icon"
                                    onClick={addCreateRow}
                                    title={`Adaugă instructor (${grid.length}/${MAX_ROWS})`}
                                    aria-label="Adaugă instructor"
                                 />
                              </div>
                           </div>

                           <div className="instructorsGroupsUI__actions">
                              <button
                                 type="button"
                                 className="instructorsGroupsUI__btnPrimary"
                                 onClick={handleCreateGroup}
                              >
                                 Creează
                              </button>
                              <button
                                 type="button"
                                 className="instructorsGroupsUI__btnSecondary"
                                 onClick={() => {
                                    setShowForm(false);
                                    setChooser({
                                       open: false,
                                       mode: null,
                                       forRow: null,
                                       groupId: null,
                                    });
                                    setConfirmDeleteId(null);
                                    clearNotice();
                                 }}
                              >
                                 Anulează
                              </button>
                           </div>
                        </div>
                     )}
                  </div>
               )}

               {/* ===== LIST ===== */}
               {filteredGroups.map((group) => {
                  const groupEdit = editingGroups[group.id] || {
                     isEditing: false,
                     editGrid: [],
                     name: group.name,
                     sector: group.sector || "",
                  };

                  const insts = group.instructors || [];
                  const isChooserOpenHere =
                     chooser.open &&
                     chooser.mode === "edit" &&
                     chooser.groupId === group.id;

                  if (groupEdit.isEditing || isChooserOpenHere) {
                     const rows = groupEdit.editGrid || [];

                     return (
                        <div
                           key={group.id}
                           className="instructorsGroupsUI__item is-active"
                        >
                           {isChooserOpenHere ? (
                              <InstructorChooser
                                 inline
                                 instructors={instructors}
                                 cars={cars}
                                 usageByInstructorId={usageByInstructorId}
                                 currentGroupId={group.id}
                                 excludeIds={(rows || [])
                                    .map((r, i) =>
                                       i === chooser.forRow
                                          ? null
                                          : r.instructorId,
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
                                       String(inst.id),
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
                              <div className="instructorsGroupsUI__form">
                                 <div className="instructorsGroupsUI__formTop">
                                    <input
                                       type="text"
                                       className="instructorsGroupsUI__input"
                                       value={
                                          groupEdit.name ?? group.name ?? ""
                                       }
                                       onChange={(e) =>
                                          handleEditGroupField(
                                             group.id,
                                             "name",
                                             e.target.value,
                                          )
                                       }
                                       placeholder={
                                          group.name || "Numele grupei"
                                       }
                                    />

                                    <IconButton
                                       className="instructorsGroupsUI__iconBtn instructorsGroupsUI__formBtn"
                                       icon="add"
                                       iconClassName="instructorsGroupsUI__icon is-rotated"
                                       onClick={() => {
                                          setConfirmDeleteId(null);
                                          toggleEdit(group);
                                       }}
                                       title="Închide editarea"
                                       aria-label="Închide editarea"
                                    />
                                 </div>

                                 {/* ✅ Sector input text */}
                                 <div className="instructorsGroupsUI__sectorInput">
                                    <input
                                       type="text"
                                       className="instructorsGroupsUI__input"
                                       value={groupEdit.sector ?? ""}
                                       onChange={(e) =>
                                          handleEditGroupField(
                                             group.id,
                                             "sector",
                                             e.target.value,
                                          )
                                       }
                                       placeholder="Botanica / Ciocana / Buiucani / niciunul"
                                    />
                                 </div>

                                 <div className="instructorsGroupsUI__createGrid">
                                    {rows.map((col, idx) => (
                                       <div
                                          key={idx}
                                          className="instructorsGroupsUI__gridRow"
                                       >
                                          <button
                                             type="button"
                                             className="instructorsGroupsUI__chooserBtn"
                                             onClick={() =>
                                                setChooser({
                                                   open: true,
                                                   mode: "edit",
                                                   forRow: idx,
                                                   groupId: group.id,
                                                })
                                             }
                                             title={instructorLabel(
                                                col.instructorId,
                                             )}
                                          >
                                             {instructorLabel(col.instructorId)}
                                          </button>

                                          {/* ✅ trash: șterge instructorul din rând */}
                                          <IconButton
                                             className="instructorsGroupsUI__iconBtn instructorsGroupsUI__rowTrash"
                                             icon="delete"
                                             iconClassName="instructorsGroupsUI__icon"
                                             onClick={() =>
                                                clearEditRow(group.id, idx)
                                             }
                                             title="Șterge instructorul din rând"
                                             aria-label="Șterge instructorul din rând"
                                          />
                                       </div>
                                    ))}

                                    {/* ✅ plus: adaugă rânduri până la 100 */}
                                    <div className="instructorsGroupsUI__gridRowAdd">
                                       <IconButton
                                          className="instructorsGroupsUI__iconBtn"
                                          icon="add"
                                          iconClassName="instructorsGroupsUI__icon"
                                          onClick={() => addEditRow(group.id)}
                                          title={`Adaugă instructor (${rows.length}/${MAX_ROWS})`}
                                          aria-label="Adaugă instructor"
                                       />
                                    </div>
                                 </div>

                                 <div className="instructorsGroupsUI__actions">
                                    <button
                                       type="button"
                                       className="instructorsGroupsUI__btnPrimary"
                                       onClick={() =>
                                          handleSaveInline(group.id)
                                       }
                                    >
                                       Salvează
                                    </button>

                                    <ConfirmDeleteButton
                                       confirming={confirmDeleteId === group.id}
                                       onStart={() =>
                                          setConfirmDeleteId(group.id)
                                       }
                                       onCancel={() => setConfirmDeleteId(null)}
                                       onConfirm={() =>
                                          handleDeleteGroup(group.id)
                                       }
                                    />
                                 </div>
                              </div>
                           )}
                        </div>
                     );
                  }

                  return (
                     <div key={group.id} className="instructorsGroupsUI__item">
                        <div className="instructorsGroupsUI__itemLeft">
                           <div className="instructorsGroupsUI__itemTop">
                              <h3>
                                 {highlightText(
                                    group.name,
                                    search.query,
                                    "instructorsGroupsUI__highlight",
                                 )}
                              </h3>

                              <div className="instructorsGroupsUI__pillbar">
                                 <span className="instructorsGroupsUI__pill">
                                    {String(group.sector || "—").toLowerCase()}
                                 </span>
                                 <IconButton
                                    className="instructorsGroupsUI__itemIcon"
                                    icon="edit"
                                    iconClassName="instructorsGroupsUI__icon"
                                    onClick={() => {
                                       setConfirmDeleteId(null);
                                       toggleEdit(group);
                                    }}
                                    title="Editează"
                                 />
                              </div>
                           </div>

                           <ul className="instructorsGroupsUI__list">
                              {(insts || []).map((inst) => {
                                 const car = cars.find(
                                    (c) => c.instructorId === inst.id,
                                 );
                                 return (
                                    <li key={inst.id}>
                                       <p>
                                          {highlightText(
                                             `${inst.firstName} ${inst.lastName}`,
                                             search.query,
                                             "instructorsGroupsUI__highlight",
                                          )}
                                       </p>
                                       <p className="meta">
                                          {highlightText(
                                             car?.plateNumber || "N/A",
                                             search.query,
                                             "instructorsGroupsUI__highlight",
                                          )}
                                       </p>
                                    </li>
                                 );
                              })}
                           </ul>
                        </div>
                     </div>
                  );
               })}
            </div>
         </div>
      </div>
   );
}
