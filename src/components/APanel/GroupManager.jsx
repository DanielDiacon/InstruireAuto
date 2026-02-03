import React, { useState, useEffect, useContext, useMemo } from "react";

import { UserContext } from "../../UserContext";
import { useDispatch, useSelector } from "react-redux";
import {
   fetchGroups,
   addGroup,
   updateGroup,
   removeGroup,
} from "../../store/groupsSlice";
import { openPopup } from "../Utils/popupStore";

import StudentItem from "../Common/StudentItem";
import IconButton from "../Common/IconButton";
import UIIcon from "../Common/UIIcon";
import SearchToggle from "../Common/SearchToggle";
import ConfirmDeleteButton from "../Common/ConfirmDeleteButton";

/* ===================== Utils ===================== */
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

/* 🔒 token protejat = ABCD1234 */
const isProtectedToken = (token) =>
   String(token ?? "")
      .trim()
      .toUpperCase() === "ABCD1234";

/* ===== Student avatar helpers ===== */
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

function hashStringToUInt(str) {
   let h = 0;
   for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
   return h >>> 0;
}

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

/* ====== PROFESSOR Chooser ====== */
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

      return base.map((p) => ({ ...p, disabled: taken.has(String(p.id)) }));
   }, [query, professors, excludeIds]);

   return (
      <div className={`studentsGroupsUI__picker ${inline ? "is-inline" : ""}`}>
         <div className="studentsGroupsUI__pickerTop">
            <button
               type="button"
               className="studentsGroupsUI__btnSecondary"
               onClick={onClose}
            >
               Înapoi
            </button>

            <input
               className="studentsGroupsUI__pickerSearch"
               placeholder="Caută profesor (nume, telefon, email)…"
               value={query}
               onChange={(e) => setQuery(e.target.value)}
            />
         </div>

         <ul className="studentsGroupsUI__pickerList" role="listbox">
            {list.length === 0 && (
               <li className="studentsGroupsUI__pickerEmpty">
                  Niciun rezultat
               </li>
            )}

            {list.map((p) => (
               <li
                  key={p.id}
                  role="option"
                  className={`studentsGroupsUI__pickerItem ${p.disabled ? "is-disabled" : ""}`}
                  title={
                     p.disabled
                        ? "Deja selectat"
                        : `${p.firstName || ""} ${p.lastName || ""} ${p.phone || "—"} ${p.email || ""}`
                  }
                  onClick={() => !p.disabled && onPick(p)}
               >
                  <div className="studentsGroupsUI__pickerLabel">
                     {p.firstName} {p.lastName}
                  </div>
                  <div className="studentsGroupsUI__pickerMeta">
                     {p.phone || "—"}
                  </div>
                  <div className="studentsGroupsUI__pickerMeta">
                     {p.email || "—"}
                  </div>
               </li>
            ))}
         </ul>
      </div>
   );
}

/* ========= Form Reutilizabil (Create & Edit) ========= */
function GroupForm({
   mode,
   values,
   setValues,
   onSubmit,
   onCancel,
   openPicker,

   showDelete = true,
   isConfirmingDelete = false,
   onStartDelete,
   onConfirmDelete,
   onCancelDelete,
}) {
   return (
      <div className="studentsGroupsUI__form">
         <div className="studentsGroupsUI__formTop">
            <input
               type="text"
               placeholder="Numele grupei"
               value={values.name}
               onChange={(e) => setValues({ name: e.target.value })}
               className="studentsGroupsUI__input"
            />

            {mode === "edit" && (
               <IconButton
                  className="studentsGroupsUI__iconBtn studentsGroupsUI__formBtn"
                  icon="add"
                  iconClassName="studentsGroupsUI__icon is-rotated"
                  onClick={onCancel}
                  title="Închide editarea"
                  aria-label="Închide editarea"
               />
            )}
         </div>

         {mode === "edit" && (
            <div className="studentsGroupsUI__keyline">
               <input
                  type="text"
                  placeholder="Token / Key (opțional)"
                  value={values.token}
                  onChange={(e) => setValues({ token: e.target.value })}
                  className="studentsGroupsUI__input"
               />
            </div>
         )}

         <button
            type="button"
            className="studentsGroupsUI__chooserBtn"
            onClick={openPicker}
         >
            {values.professorLabel}
         </button>

         <div className="studentsGroupsUI__actions">
            <button
               type="button"
               onClick={onSubmit}
               className="studentsGroupsUI__btnPrimary"
            >
               {mode === "create" ? "Creează" : "Salvează"}
            </button>

            {mode === "create" && (
               <button
                  type="button"
                  onClick={onCancel}
                  className="studentsGroupsUI__btnSecondary"
               >
                  Anulează
               </button>
            )}

            {/* ✅ DELETE (nou) */}
            {mode === "edit" && showDelete && (
               <ConfirmDeleteButton
                  confirming={isConfirmingDelete}
                  onStart={onStartDelete}
                  onCancel={onCancelDelete}
                  onConfirm={onConfirmDelete}
               />
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

   const professors = useMemo(
      () =>
         users.filter(
            (u) => String(u?.role || "").toUpperCase() === "PROFESSOR",
         ),
      [users],
   );

   const [search, setSearch] = useState({ open: false, query: "" });
   const [viewMode, setViewMode] = useState({ mode: "list", group: null });
   const [confirmDeleteId, setConfirmDeleteId] = useState(null);

   const [form, setForm] = useState({
      open: false,
      mode: null,
      groupId: null,
      values: { name: "", token: "", professorId: "" },
   });

   const [picker, setPicker] = useState({ open: false });

   useEffect(() => {
      dispatch(fetchGroups());
   }, [dispatch, user?.id]);

   const professorLabel = (id) => {
      if (!id) return "Selectează profesor";
      const p = professors.find((x) => String(x.id) === String(id));
      if (!p) return "Selectează profesor";
      return `${p.firstName} ${p.lastName}`.trim();
   };

   const groupedUsersByGroup = useMemo(() => {
      return groups.map((group) => ({
         ...group,
         members: users.filter(
            (u) =>
               String(u.groupId) === String(group.id) &&
               String(u?.role || "").toUpperCase() === "USER",
         ),
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
               .includes(q),
      );
   }, [groupedUsersByGroup, search.query]);

   const patchFormValues = (patch) =>
      setForm((f) => ({ ...f, values: { ...f.values, ...patch } }));

   const runThunk = async (thunkAction) => {
      const res = await dispatch(thunkAction);
      if (res?.error) throw res.error;
      return res?.payload;
   };

   const cancelForm = () => {
      setPicker({ open: false });
      setConfirmDeleteId(null);
      setForm({
         open: false,
         mode: null,
         groupId: null,
         values: { name: "", token: "", professorId: "" },
      });
   };

   /* CREATE */
   const openCreate = () => {
      setPicker({ open: false });
      setConfirmDeleteId(null);
      setForm({
         open: true,
         mode: "create",
         groupId: null,
         values: { name: "", token: "", professorId: "" },
      });
   };

   const submitCreate = async () => {
      const { name, token, professorId } = form.values;
      if (!String(name || "").trim()) return;

      const pid = toNum(professorId);

      try {
         await runThunk(
            addGroup({
               name: String(name).trim(),
               token: token || "",
               professorId: pid,
            }),
         );
         await runThunk(fetchGroups());
      } finally {
         setPicker({ open: false });
         cancelForm();
      }
   };

   /* EDIT */
   const openEdit = (group) => {
      setPicker({ open: false });
      setConfirmDeleteId(null);
      setForm({
         open: true,
         mode: "edit",
         groupId: group.id,
         values: {
            name: group.name || "",
            token: group.token || "",
            professorId: group.professorId
               ? String(group.professorId)
               : group.instructorId
                 ? String(group.instructorId)
                 : "",
         },
      });
   };

   const submitEdit = async () => {
      const { name, token, professorId } = form.values;
      if (!String(name ?? "").trim()) return;

      const pid = toNum(professorId);

      try {
         await runThunk(
            updateGroup({
               id: form.groupId,
               name: String(name ?? "").trim(),
               token: token ?? "",
               professorId: pid,
            }),
         );
         await runThunk(fetchGroups());
      } finally {
         setPicker({ open: false });
         cancelForm();
      }
   };

   /* DELETE */
   const handleDeleteGroup = async (id) => {
      const g = groups.find((x) => x.id === id);
      if (isProtectedToken(g?.token)) {
         setConfirmDeleteId(null);
         return;
      }

      try {
         await runThunk(removeGroup(id));
         await runThunk(fetchGroups());
      } finally {
         setConfirmDeleteId(null);
         setPicker({ open: false });
         if (form.mode === "edit" && form.groupId === id) cancelForm();
      }
   };

   const handleOpenStudentPopup = (student) => {
      openPopup("studentDetails", { student });
   };

   /* ====== culori pentru membrii din DETAILS ====== */
   const detailMembers =
      viewMode.mode === "details" && viewMode.group
         ? viewMode.group.members || []
         : [];

   const detailColorByKey = useMemo(() => {
      const m = new Map();
      detailMembers.forEach((s, idx) => {
         const key = String(s.id ?? s.phone ?? s.email ?? `__idx_${idx}`);
         const det = getAvatarColorFromName(s);
         m.set(key, det || getRandomAvatarColor());
      });
      return m;
   }, [detailMembers]);

   return (
      <div className="studentsGroupsUI">
         <div
            className={`studentsGroupsUI__header ${search.open ? "is-open" : ""}`}
         >
            <h2 className="studentsGroupsUI__title">Grupe</h2>

            <div className="studentsGroupsUI__right">
               <SearchToggle
                  open={search.open}
                  value={search.query}
                  onValueChange={(val) =>
                     setSearch((s) => ({ ...s, query: val }))
                  }
                  onToggle={() => setSearch((s) => ({ ...s, open: !s.open }))}
                  placeholder="Caută grupă..."
                  wrapperClassName="studentsGroupsUI__search"
                  inputClassName="studentsGroupsUI__inputSearch"
                  buttonClassName="studentsGroupsUI__iconBtn"
                  iconClassName={`studentsGroupsUI__icon ${search.open ? "is-rotated" : ""}`}
                  titleOpen="Închide căutarea"
                  titleClosed="Caută"
               />

               <IconButton
                  className="studentsGroupsUI__iconBtn"
                  icon="add"
                  iconClassName="studentsGroupsUI__icon"
                  onClick={() =>
                     form.open && form.mode === "create"
                        ? cancelForm()
                        : openCreate()
                  }
                  title="Adaugă grupă"
               />
            </div>
         </div>

         <div className="studentsGroupsUI__gridWrap">
            <div className="studentsGroupsUI__grid">
               {/* ===== CREATE ===== */}
               {form.open && form.mode === "create" && (
                  <>
                     {picker.open ? (
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
                     ) : (
                        <GroupForm
                           mode="create"
                           values={{
                              ...form.values,
                              professorLabel: professorLabel(
                                 form.values.professorId,
                              ),
                           }}
                           setValues={(p) => patchFormValues(p)}
                           onSubmit={submitCreate}
                           onCancel={cancelForm}
                           openPicker={() => setPicker({ open: true })}
                        />
                     )}
                  </>
               )}

               {/* ===== LISTĂ ===== */}
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
                              className="studentsGroupsUI__item is-active"
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
                                          form.values.professorId,
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
                              String(group.professorId ?? group.instructorId),
                        ) || null;

                     const pLabel = p
                        ? `${p.firstName || ""} ${p.lastName || ""}`.trim()
                        : "—";

                     return (
                        <div key={group.id} className="studentsGroupsUI__item">
                           <div className="studentsGroupsUI__itemLeft">
                              <div className="studentsGroupsUI__itemTop">
                                 <h3>
                                    {highlightText(
                                       group.name,
                                       search.query,
                                       "studentsGroupsUI__highlight",
                                    )}
                                 </h3>
                              </div>

                              <div className="studentsGroupsUI__itemBottom">
                                 <span className="studentsGroupsUI__itemKey">
                                    <UIIcon
                                       name="key"
                                       className="studentsGroupsUI__keyIcon"
                                    />
                                    {highlightText(
                                       group.token || "",
                                       search.query,
                                       "studentsGroupsUI__highlight",
                                    )}
                                 </span>
                              </div>

                              <div className="studentsGroupsUI__itemBottom">
                                 <span className="studentsGroupsUI__itemProfessor">
                                    {highlightText(
                                       pLabel,
                                       search.query,
                                       "studentsGroupsUI__highlight",
                                    )}
                                 </span>
                              </div>

                              <p className="studentsGroupsUI__count">
                                 {group.members.length} per
                              </p>
                           </div>

                           <div className="studentsGroupsUI__itemRight">
                              <IconButton
                                 className="studentsGroupsUI__itemIcon"
                                 icon="edit"
                                 iconClassName="studentsGroupsUI__icon"
                                 onClick={() => openEdit(group)}
                                 title="Editează"
                              />
                              <IconButton
                                 className="studentsGroupsUI__itemIcon"
                                 icon="eye"
                                 iconClassName="studentsGroupsUI__icon"
                                 onClick={() =>
                                    setViewMode({ mode: "details", group })
                                 }
                                 title="Vezi membri"
                              />
                           </div>
                        </div>
                     );
                  })}

               {/* ===== DETALII GRUP ===== */}
               {viewMode.mode === "details" && viewMode.group && (
                  <>
                     <button
                        type="button"
                        className="studentsGroupsUI__backBtn"
                        onClick={() =>
                           setViewMode({ mode: "list", group: null })
                        }
                     >
                        Înapoi la grupe
                     </button>

                     {detailMembers.length > 0 ? (
                        detailMembers.map((student, idx) => {
                           const key = String(
                              student.id ??
                                 student.phone ??
                                 student.email ??
                                 `__idx_${idx}`,
                           );
                           const color =
                              detailColorByKey.get(key) ||
                              getRandomAvatarColor();

                           return (
                              <StudentItem
                                 key={student.id ?? key}
                                 student={student}
                                 color={color}
                                 initials={getInitials(student)}
                                 onOpen={handleOpenStudentPopup}
                                 highlightQuery=""
                                 secondaryText={student.phone || "–"}
                              />
                           );
                        })
                     ) : (
                        <p className="studentsGroupsUI__empty">
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
