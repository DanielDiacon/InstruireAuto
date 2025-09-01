import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { ReactSVG } from "react-svg";
import {
   fetchInstructors,
   addInstructor,
   updateInstructor,
   removeInstructor,
} from "../../store/instructorsSlice";

import { getUserById, updateUser, createUser } from "../../api/usersService";
import editIcon from "../../assets/svg/edit.svg";

/* =============== Componenta =============== */
function AddInstr() {
   const dispatch = useDispatch();
   const { list: instructors, status } = useSelector((s) => s.instructors);

   const [activeTab, setActiveTab] = useState("list");
   const [search, setSearch] = useState("");
   const [saving, setSaving] = useState(false);

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
   const [editingUserId, setEditingUserId] = useState(null);

   const [editInstr, setEditInstr] = useState({
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      sector: "Botanica",
   });

   // cache: userId -> user { email, firstName, lastName, phone }
   const [usersById, setUsersById] = useState({});

   // utils
   const clean = (o = {}) =>
      Object.fromEntries(
         Object.entries(o).filter(([_, v]) => v !== undefined && v !== "")
      );

   const pickName = (inst = {}, u = {}) => ({
      firstName: inst.firstName || u.firstName || "",
      lastName: inst.lastName || u.lastName || "",
   });

   const getUserData = (inst) =>
      inst?.userId ? usersById[inst.userId] || {} : {};
   const getEmail = (inst) => inst.email || getUserData(inst).email || "";

   function highlightText(text, query) {
      if (text === undefined || text === null) return "";
      if (!query) return text;
      const parts = text.toString().split(new RegExp(`(${query})`, "gi"));
      return parts.map((part, idx) =>
         part.toLowerCase() === query.toLowerCase() ? (
            <i key={idx} className="highlight">
               {part}
            </i>
         ) : (
            part
         )
      );
   }

   /* ====== efecte ====== */
   useEffect(() => {
      if (status === "idle") dispatch(fetchInstructors());
   }, [status, dispatch]);

   // încarcă userii pentru toți instructorii care au userId
   useEffect(() => {
      let cancelled = false;
      (async () => {
         const ids = Array.from(
            new Set(instructors.map((i) => i.userId).filter(Boolean))
         );
         if (!ids.length) {
            setUsersById({});
            return;
         }
         try {
            const entries = await Promise.all(
               ids.map(async (id) => {
                  try {
                     const u = await getUserById(id);
                     return [
                        id,
                        {
                           email: u?.email || "",
                           firstName: u?.firstName || "",
                           lastName: u?.lastName || "",
                           phone: u?.phone || "",
                        },
                     ];
                  } catch (e) {
                     console.error("getUserById failed:", id, e);
                     return [
                        id,
                        { email: "", firstName: "", lastName: "", phone: "" },
                     ];
                  }
               })
            );
            if (!cancelled) setUsersById(Object.fromEntries(entries));
         } catch (e) {
            if (!cancelled) console.error(e);
         }
      })();
      return () => void (cancelled = true);
   }, [instructors]);

   /* ====== filtrare ====== */
   const filteredInstructors = instructors.filter((inst) => {
      const q = (search || "").toLowerCase();
      const u = getUserData(inst);
      const { firstName, lastName } = pickName(inst, u);
      const fullName = `${firstName} ${lastName}`.toLowerCase();
      const email = (inst.email || u.email || "").toLowerCase();
      const phone = (inst.phone || u.phone || "").toLowerCase();
      const sector = (inst.sector || "").toLowerCase();
      return (
         fullName.includes(q) ||
         email.includes(q) ||
         phone.includes(q) ||
         sector.includes(q)
      );
   });

   /* ====== ADD: creez user -> apoi instructor ====== */
   const handleAdd = async () => {
      setSaving(true);
      try {
         const userPayload = clean({
            email: newInstr.email?.trim(),
            password: newInstr.password, // cerut de backend la creare
            firstName: newInstr.firstName?.trim(),
            lastName: newInstr.lastName?.trim(),
            phone: newInstr.phone?.trim(),
         });
         console.log("[ADD] /users payload ->", userPayload);
         const createdUser = await createUser(userPayload);
         console.log("[ADD] /users response <-", createdUser);

         const userId =
            createdUser?.id ?? createdUser?.userId ?? createdUser?.data?.id;

         const instrPayload = clean({
            firstName: newInstr.firstName?.trim(),
            lastName: newInstr.lastName?.trim(),
            phone: newInstr.phone?.trim(),
            email: newInstr.email?.trim(), // dublură
            sector: newInstr.sector,
            isActive: newInstr.isActive,
            instructorsGroupId: newInstr.instructorsGroupId,
            userId,
         });
         console.log("[ADD] /instructors payload ->", instrPayload);

         const action = await dispatch(addInstructor(instrPayload));
         console.log(
            "[ADD] /instructors response <-",
            action?.payload ?? action
         );

         if (userId) {
            setUsersById((prev) => ({
               ...prev,
               [userId]: {
                  email: userPayload.email,
                  firstName: userPayload.firstName,
                  lastName: userPayload.lastName,
                  phone: userPayload.phone,
               },
            }));
         }

         setNewInstr({
            firstName: "",
            lastName: "",
            phone: "",
            email: "",
            password: "",
            sector: "Botanica",
            isActive: true,
            instructorsGroupId: null,
         });
         setActiveTab("list");
      } catch (e) {
         console.error("[ADD] Eroare (user/instructor):", e);
      } finally {
         setSaving(false);
      }
   };

   /* ====== EDIT: PATCH /users (email,phone) + PATCH /instructors (nume, email, phone, sector) ====== */
   const handleSaveEdit = async () => {
      setSaving(true);

      // determin userId devreme (evităm “Cannot access 'uid' before initialization”)
      const uid =
         editingUserId ??
         instructors.find((i) => i.id === editingId)?.userId ??
         null;

      const userPayload = clean({
         email: editInstr.email?.trim(),
         phone: editInstr.phone?.trim(),
      });

      const instrPayload = clean({
         firstName: editInstr.firstName?.trim(),
         lastName: editInstr.lastName?.trim(),
         email: editInstr.email?.trim(),
         phone: editInstr.phone?.trim(),
         sector: editInstr.sector,
      });

      console.log("[EDIT] ids:", { instructorId: editingId, userId: uid });
      console.log("[EDIT] PATCH /users payload ->", userPayload);
      console.log("[EDIT] PATCH /instructors payload ->", instrPayload);

      try {
         // 1) update pe user (doar câmpurile care backend-ul chiar le aplică)
         if (uid) {
            const userRes = await updateUser(uid, userPayload);
            console.log("[EDIT] /users response <-", userRes);
            setUsersById((prev) => ({
               ...prev,
               [uid]: { ...(prev[uid] || {}), ...userRes },
            }));
         } else {
            console.warn("[EDIT] Lipsă userId pentru instructor:", editingId);
         }

         // 2) update pe instructor (inclusiv nume/prenume)
         const action = await dispatch(
            updateInstructor({ id: editingId, data: instrPayload })
         );
         console.log(
            "[EDIT] /instructors response <-",
            action?.payload ?? action
         );
      } catch (e) {
         console.error("[EDIT] Eroare (user/instructor):", e);
      } finally {
         setSaving(false);
         setEditingId(null);
         setEditingUserId(null);
      }
   };

   const handleDelete = (id) => {
      if (window.confirm("Ești sigur că vrei să ștergi acest instructor?")) {
         dispatch(removeInstructor(id));
         setEditingId(null);
         setEditingUserId(null);
      }
   };

   /* ====== render ====== */
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
                        {filteredInstructors.map((inst) => {
                           const u = getUserData(inst);
                           const { firstName, lastName } = pickName(inst, u);
                           const mergedPhone = inst.phone || u.phone || "";
                           const mergedEmail = inst.email || u.email || "";

                           return (
                              <li
                                 key={inst.id}
                                 className={`instructors-popup__item ${
                                    editingId === inst.id ? "active" : ""
                                 }`}
                              >
                                 {editingId === inst.id ? (
                                    <div className="instructors-popup__form">
                                       <div className="instructors-popup__form-row">
                                          <input
                                             type="text"
                                             className="instructors-popup__input"
                                             value={editInstr.firstName}
                                             onChange={(e) =>
                                                setEditInstr((s) => ({
                                                   ...s,
                                                   firstName: e.target.value,
                                                }))
                                             }
                                          />
                                          <input
                                             type="text"
                                             className="instructors-popup__input"
                                             value={editInstr.lastName}
                                             onChange={(e) =>
                                                setEditInstr((s) => ({
                                                   ...s,
                                                   lastName: e.target.value,
                                                }))
                                             }
                                          />
                                       </div>

                                       <div className="instructors-popup__form-row">
                                          <input
                                             type="text"
                                             className="instructors-popup__input"
                                             value={editInstr.phone}
                                             onChange={(e) =>
                                                setEditInstr((s) => ({
                                                   ...s,
                                                   phone: e.target.value,
                                                }))
                                             }
                                          />
                                          <input
                                             type="email"
                                             className="instructors-popup__input"
                                             value={editInstr.email}
                                             onChange={(e) =>
                                                setEditInstr((s) => ({
                                                   ...s,
                                                   email: e.target.value,
                                                }))
                                             }
                                          />

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
                                                      setEditInstr((s) => ({
                                                         ...s,
                                                         sector: e.target.value,
                                                      }))
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
                                                      setEditInstr((s) => ({
                                                         ...s,
                                                         sector: e.target.value,
                                                      }))
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
                                             disabled={saving}
                                          >
                                             {saving
                                                ? "Se salvează..."
                                                : "Salvează"}
                                          </button>
                                          <button
                                             className="instructors-popup__form-button instructors-popup__form-button--cancel"
                                             onClick={() => {
                                                setEditingId(null);
                                                setEditingUserId(null);
                                             }}
                                             disabled={saving}
                                          >
                                             Anulează
                                          </button>
                                          <button
                                             className="instructors-popup__form-button instructors-popup__form-button--delete"
                                             onClick={() =>
                                                handleDelete(inst.id)
                                             }
                                             disabled={saving}
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
                                                `${firstName} ${lastName}`,
                                                search
                                             )}
                                          </h3>
                                          <p>
                                             {highlightText(
                                                mergedPhone,
                                                search
                                             )}
                                          </p>
                                          <p>
                                             {highlightText(
                                                mergedEmail,
                                                search
                                             )}
                                          </p>
                                          <p>
                                             {highlightText(
                                                inst.sector || "",
                                                search
                                             )}
                                          </p>
                                       </div>

                                       <ReactSVG
                                          className="instructors-popup__edit-button react-icon"
                                          onClick={() => {
                                             setEditingId(inst.id);
                                             setEditingUserId(
                                                inst.userId || null
                                             );
                                             setEditInstr({
                                                firstName,
                                                lastName,
                                                phone: mergedPhone,
                                                email: mergedEmail,
                                                sector:
                                                   inst.sector || "Botanica",
                                             });
                                          }}
                                          src={editIcon}
                                       />
                                    </>
                                 )}
                              </li>
                           );
                        })}
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
                        <input
                           type="email"
                           className="instructors-popup__input"
                           placeholder="Email (user)"
                           value={newInstr.email}
                           onChange={(e) =>
                              setNewInstr({
                                 ...newInstr,
                                 email: e.target.value,
                              })
                           }
                        />
                        <input
                           type="password"
                           className="instructors-popup__input"
                           placeholder="Parolă (user)"
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
                           disabled={saving}
                        >
                           Anulează
                        </button>
                        <button
                           className="instructors-popup__form-button instructors-popup__form-button--save"
                           onClick={handleAdd}
                           disabled={saving}
                        >
                           {saving ? "Se salvează..." : "Salvează"}
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
