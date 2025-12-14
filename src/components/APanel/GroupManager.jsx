// src/components/Groups/GroupManager.jsx
import React, { useState, useEffect, useContext, useMemo } from "react";
import { ReactSVG } from "react-svg";
import addIcon from "../../assets/svg/add-s.svg"; // folosit și ca close (rotate45)
import editIcon from "../../assets/svg/edit.svg";
import eyeIcon from "../../assets/svg/eye.svg";
import keyIcon from "../../assets/svg/key.svg";
import searchIcon from "../../assets/svg/search.svg";
import { UserContext } from "../../UserContext";
import { useDispatch, useSelector } from "react-redux";
import {
   fetchGroups,
   addGroup,
   updateGroup,
   removeGroup,
} from "../../store/groupsSlice";
import { openPopup } from "../Utils/popupStore";

/* ===== Utils ===== */
const toNum = (v) =>
   v === null || v === undefined || v === "" || Number.isNaN(Number(v))
      ? undefined
      : Number(v);

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

/* 🔒 token protejat = ABCD1234 */
const isProtectedToken = (token) =>
   String(token ?? "")
      .trim()
      .toUpperCase() === "ABCD1234";

/* ====== Chooser (aceleași clase), DAR pentru PROFESSOR ====== */
function ProfessorChooser({
   professors,
   excludeIds = [],
   onPick,
   onClose,
   inline = false,
}) {
   const [query, setQuery] = useState("");
   const taken = new Set((excludeIds || []).map(String));

   const list = useMemo(() => {
      const q = String(query ?? "").toLowerCase();
      const base = q
         ? professors.filter((p) => {
              const full = `${p.firstName || ""} ${p.lastName || ""}`.trim();
              return (
                 full.toLowerCase().includes(q) ||
                 String(p.phone || "")
                    .toLowerCase()
                    .includes(q) ||
                 String(p.email || "")
                    .toLowerCase()
                    .includes(q)
              );
           })
         : professors;

      return base.map((p) => ({
         ...p,
         disabled: taken.has(String(p.id)),
      }));
   }, [query, professors, excludeIds]);

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
               placeholder="Caută profesor (nume, telefon, email)…"
               value={query}
               onChange={(e) => setQuery(e.target.value)}
               style={{ width: "100%" }}
            />
         </div>

         <ul className="picker__list" role="listbox">
            {list.length === 0 && (
               <li className="picker__empty">Niciun rezultat</li>
            )}
            {list.map((p) => (
               <li
                  key={p.id}
                  role="option"
                  className={
                     "picker__item" + (p.disabled ? " is-disabled" : "")
                  }
                  title={
                     p.disabled
                        ? "Deja selectat"
                        : `${p.firstName || ""} ${p.lastName || ""} ${
                             p.phone || "—"
                          } ${p.email || ""}`
                  }
                  onClick={() => !p.disabled && onPick(p)}
               >
                  <div className="picker__label">
                     {p.firstName} {p.lastName}
                  </div>
                  <div className="picker__meta">{p.phone || "—"}</div>
                  <div className="picker__meta">{p.email || "—"}</div>
               </li>
            ))}
         </ul>
      </div>
   );
}

/* ========= Form Reutilizabil (Create & Edit) ========= */
function GroupForm({
   mode, // "create" | "edit"
   values, // { name, token, professorLabel }
   setValues, // (patch) => void
   onSubmit, // () => void
   onCancel, // () => void
   openPicker, // () => void

   showDelete = true,
   isConfirmingDelete = false,
   onStartDelete,
   onConfirmDelete,
   onCancelDelete,
}) {
   return (
      <div className="groups__form instructorsgroup__create-form active">
         <div
            className="groups__item-left-top"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
         >
            <input
               type="text"
               placeholder="Numele grupei"
               value={values.name}
               onChange={(e) => setValues({ name: e.target.value })}
               className="instructorsgroup__input"
               style={{ flex: 1 }}
            />
            {mode === "edit" && (
               <button
                  type="button"
                  className="instructorsgroup__button rotate45 react-icon"
                  onClick={onCancel}
                  title="Închide editarea"
                  aria-label="Închide editarea"
               >
                  <ReactSVG src={addIcon} />
               </button>
            )}
         </div>

         {mode === "edit" && (
            <div className="groups__keyline instructorsgroup__keyline">
               <input
                  type="text"
                  placeholder="Token / Key (opțional)"
                  value={values.token}
                  onChange={(e) => setValues({ token: e.target.value })}
                  className="instructorsgroup__input"
               />
            </div>
         )}

         <button
            type="button"
            className="groups__chooser-btn instructorsgroup__input"
            onClick={openPicker}
            style={{ textAlign: "left" }}
         >
            {values.professorLabel}
         </button>

         <div
            className="instructorsgroup__actions"
            style={{ display: "flex", gap: 6, alignItems: "center" }}
         >
            <button onClick={onSubmit} className="instructorsgroup__button">
               {mode === "create" ? "Creează" : "Salvează"}
            </button>

            {mode === "create" && (
               <button onClick={onCancel} className="cancel-confirm">
                  Anulează
               </button>
            )}

            {mode === "edit" && showDelete && (
               <div
                  className="instructorsgroup__item-delete groups__item-delete"
                  style={{ position: "static" }}
               >
                  {!isConfirmingDelete ? (
                     <button
                        onClick={onStartDelete}
                        className="delete-btn"
                        style={{ position: "static" }}
                     >
                        Șterge
                     </button>
                  ) : (
                     <div
                        className="delete-confirmation"
                        style={{ position: "static", display: "flex", gap: 6 }}
                     >
                        <button
                           onClick={onConfirmDelete}
                           className="delete-confirm"
                        >
                           Da
                        </button>
                        <button
                           onClick={onCancelDelete}
                           className="cancel-confirm"
                        >
                           Nu
                        </button>
                     </div>
                  )}
               </div>
            )}
         </div>
      </div>
   );
}

function GroupManager() {
   const { user } = useContext(UserContext);
   const dispatch = useDispatch();

   const groupsState = useSelector((state) => state.groups || {});
   const groups = Array.isArray(groupsState.list) ? groupsState.list : [];
   const users = Array.isArray(groupsState.users) ? groupsState.users : [];

   // ✅ PROFESORI = user.role === "PROFESSOR"
   const professors = useMemo(
      () =>
         users.filter(
            (u) => String(u?.role || "").toUpperCase() === "PROFESSOR"
         ),
      [users]
   );

   const [search, setSearch] = useState({ open: false, query: "" });
   const [viewMode, setViewMode] = useState({ mode: "list", group: null });
   const [confirmDeleteId, setConfirmDeleteId] = useState(null);

   const [form, setForm] = useState({
      open: false,
      mode: null, // "create" | "edit"
      groupId: null,
      values: { name: "", token: "", professorId: "" },
   });

   const [picker, setPicker] = useState({ open: false });

   useEffect(() => {
      dispatch(fetchGroups());
   }, [dispatch, user]);

   const professorLabel = (id) => {
      if (!id) return "Selectează profesor";
      const p = professors.find((x) => String(x.id) === String(id));
      if (!p) return "Selectează profesor";
      return `${p.firstName} ${p.lastName}`.trim();
   };

   const groupedUsersByGroup = useMemo(() => {
      return groups.map((group) => ({
         ...group,
         members: users.filter((u) => String(u.groupId) === String(group.id)),
      }));
   }, [groups, users]);

   const filteredGroups = useMemo(() => {
      const q = (search.query || "").toLowerCase();
      return groupedUsersByGroup.filter(
         (g) =>
            String(g.name || "")
               .toLowerCase()
               .includes(q) ||
            String(g.token || "")
               .toLowerCase()
               .includes(q)
      );
   }, [groupedUsersByGroup, search.query]);

   const patchFormValues = (patch) =>
      setForm((f) => ({ ...f, values: { ...f.values, ...patch } }));

   /* CREATE */
   const openCreate = () =>
      setForm({
         open: true,
         mode: "create",
         groupId: null,
         values: { name: "", token: "", professorId: "" },
      });

   const submitCreate = () => {
      const { name, token, professorId } = form.values;
      if (!String(name || "").trim()) return;

      // ✅ trimitem professorId (și păstrăm compatibilitate dacă backend-ul încă așteaptă instructorId)
      const pid = toNum(professorId);

      dispatch(
         addGroup({
            name: String(name).trim(),
            token: token || "",
            professorId: pid,
            instructorId: pid,
         })
      );

      setForm({
         open: false,
         mode: null,
         groupId: null,
         values: { name: "", token: "", professorId: "" },
      });
   };

   /* EDIT */
   const openEdit = (group) =>
      setForm({
         open: true,
         mode: "edit",
         groupId: group.id,
         values: {
            name: group.name || "",
            token: group.token || "",
            // ✅ suportăm ambele câmpuri: professorId (nou) / instructorId (vechi)
            professorId: group.professorId
               ? String(group.professorId)
               : group.instructorId
               ? String(group.instructorId)
               : "",
         },
      });

   const submitEdit = () => {
      const { name, token, professorId } = form.values;
      const pid = toNum(professorId);

      dispatch(
         updateGroup({
            id: form.groupId,
            name: String(name ?? "").trim(),
            token: token ?? "",
            professorId: pid,
            instructorId: pid,
         })
      );

      cancelForm();
   };

   const cancelForm = () =>
      setForm({
         open: false,
         mode: null,
         groupId: null,
         values: { name: "", token: "", professorId: "" },
      });

   /* DELETE */
   const handleDeleteGroup = (id) => {
      const g = groups.find((x) => x.id === id);
      if (isProtectedToken(g?.token)) {
         setConfirmDeleteId(null);
         return;
      }
      dispatch(removeGroup(id));
      setConfirmDeleteId(null);
      if (form.mode === "edit" && form.groupId === id) cancelForm();
   };

   const handleOpenStudentPopup = (student) =>
      openPopup("studentDetails", { student });

   return (
      <div className="groups instructorsgroup">
         <div
            className={`groups__header instructorsgroup__header ${
               search.open ? "open" : ""
            }`}
         >
            <h2>Grupe</h2>
            <div className="groups__right">
               <div className="groups__search">
                  <input
                     type="text"
                     placeholder="Caută grupă..."
                     className="groups__input instructorsgroup__input"
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
                        className={`groups__icon instructorsgroup__icon react-icon ${
                           search.open ? "rotate45" : ""
                        }`}
                        src={search.open ? addIcon : searchIcon}
                     />
                  </button>
               </div>

               <button
                  onClick={() =>
                     form.open && form.mode === "create"
                        ? cancelForm()
                        : openCreate()
                  }
               >
                  <ReactSVG
                     className="groups__icon instructorsgroup__icon react-icon"
                     src={addIcon}
                  />
               </button>
            </div>
         </div>

         <div className="groups__grid-wrapper instructorsgroup__grid-wrapper">
            <div className="groups__grid instructorsgroup__grid">
               {/* ===== CREATE (formular sus) ===== */}
               {form.open && form.mode === "create" && (
                  <>
                     {picker.open ? (
                        <div className="groups__create">
                           <ProfessorChooser
                              inline
                              professors={professors}
                              excludeIds={[]}
                              onClose={() => setPicker({ open: false })}
                              onPick={(p) => {
                                 patchFormValues({ professorId: String(p.id) });
                                 setPicker({ open: false });
                              }}
                           />
                        </div>
                     ) : (
                        <div className="groups__create">
                           <GroupForm
                              mode="create"
                              values={{
                                 ...form.values,
                                 professorLabel: professorLabel(
                                    form.values.professorId
                                 ),
                              }}
                              setValues={(p) => patchFormValues(p)}
                              onSubmit={submitCreate}
                              onCancel={cancelForm}
                              openPicker={() => setPicker({ open: true })}
                           />
                        </div>
                     )}
                  </>
               )}

               {/* ===== LISTĂ; la edit înlocuim cardul cu formular ===== */}
               {viewMode.mode === "list" &&
                  filteredGroups.map((group) => {
                     const isEditingThis =
                        form.open &&
                        form.mode === "edit" &&
                        form.groupId === group.id;

                     if (isEditingThis) {
                        const protectedByToken = isProtectedToken(group?.token);

                        return (
                           <div
                              key={group.id}
                              className="instructorsgroup__item active"
                           >
                              {picker.open ? (
                                 <ProfessorChooser
                                    professors={professors}
                                    excludeIds={[]}
                                    onClose={() => setPicker({ open: false })}
                                    onPick={(p) => {
                                       patchFormValues({
                                          professorId: String(p.id),
                                       });
                                       setPicker({ open: false });
                                    }}
                                 />
                              ) : (
                                 <GroupForm
                                    mode="edit"
                                    values={{
                                       ...form.values,
                                       professorLabel: professorLabel(
                                          form.values.professorId
                                       ),
                                    }}
                                    setValues={(p) => patchFormValues(p)}
                                    onSubmit={submitEdit}
                                    onCancel={cancelForm}
                                    openPicker={() => setPicker({ open: true })}
                                    showDelete={!protectedByToken}
                                    isConfirmingDelete={
                                       confirmDeleteId === group.id
                                    }
                                    onStartDelete={() =>
                                       setConfirmDeleteId(group.id)
                                    }
                                    onConfirmDelete={() =>
                                       handleDeleteGroup(group.id)
                                    }
                                    onCancelDelete={() =>
                                       setConfirmDeleteId(null)
                                    }
                                 />
                              )}
                           </div>
                        );
                     }

                     const p =
                        professors.find(
                           (x) =>
                              String(x.id) ===
                              String(group.professorId ?? group.instructorId)
                        ) || null;

                     const pLabel = p
                        ? `${p.firstName || ""} ${p.lastName || ""}`.trim()
                        : "—";

                     return (
                        <div key={group.id} className="groups__item">
                           <div className="groups__item-left">
                              <div className="groups__item-left-top">
                                 <h3>
                                    {highlightText(group.name, search.query)}
                                 </h3>
                              </div>

                              <div className="groups__item-left-bottom">
                                 <span className="groups__item-key">
                                    <ReactSVG src={keyIcon} />
                                    {highlightText(
                                       group.token || "",
                                       search.query
                                    )}
                                 </span>
                              </div>

                              <div className="groups__item-left-bottom">
                                 <span className="groups__item-instructor">
                                    {highlightText(pLabel, search.query)}
                                 </span>
                              </div>

                              <p>{group.members.length} per</p>
                           </div>

                           <div className="groups__item-right">
                              <ReactSVG
                                 className="groups__item-icon edit"
                                 src={editIcon}
                                 onClick={() => openEdit(group)}
                                 title="Editează"
                              />
                              <ReactSVG
                                 className="groups__item-icon see"
                                 src={eyeIcon}
                                 onClick={() =>
                                    setViewMode({ mode: "details", group })
                                 }
                                 title="Vezi membri"
                              />
                           </div>
                        </div>
                     );
                  })}

               {/* DETALII GRUP */}
               {viewMode.mode === "details" && viewMode.group && (
                  <>
                     <button
                        className="groups__back-btn"
                        onClick={() =>
                           setViewMode({ mode: "list", group: null })
                        }
                     >
                        Înapoi la grupe
                     </button>

                     {viewMode.group.members.length > 0 ? (
                        viewMode.group.members.map((student) => (
                           <div
                              key={student.id}
                              className="students__item"
                              onClick={() => handleOpenStudentPopup(student)}
                           >
                              <h3>
                                 {student.firstName} {student.lastName}
                              </h3>
                              <h3>{student.email}</h3>
                              <p>{student.phone || "–"}</p>
                           </div>
                        ))
                     ) : (
                        <p
                           className="groups__empty"
                           style={{ gridColumn: "1 / -1" }}
                        >
                           Nu sunt studenți în această grupă.
                        </p>
                     )}
                  </>
               )}
            </div>
         </div>
      </div>
   );
}

export default GroupManager;
