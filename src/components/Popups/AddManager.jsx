// src/components/Popups/AddManager.jsx
import React, { useEffect, useMemo, useState } from "react";
import { ReactSVG } from "react-svg";
import editIcon from "../../assets/svg/edit.svg";
import AlertPills from "../Utils/AlertPills";
import {
   getUsers,
   createUser,
   updateUser,
   deleteUser,
} from "../../api/usersService";

function AddManager() {
   const [activeTab, setActiveTab] = useState("list"); // 'list' | 'add'
   const [search, setSearch] = useState("");
   const [saving, setSaving] = useState(false);
   const [loading, setLoading] = useState(true);

   const [pillMessages, setPillMessages] = useState([]);
   const pushPill = (text, type = "error") =>
      setPillMessages((prev) => [...prev, { id: Date.now(), text, type }]);
   const popPill = () => setPillMessages((prev) => prev.slice(0, -1));

   // === data ===
   const [managers, setManagers] = useState([]);

   // === add form ===
   const [newMgr, setNewMgr] = useState({
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      password: "",
      confirmPassword: "",
   });

   // === edit form ===
   const [editingId, setEditingId] = useState(null);
   const [editMgr, setEditMgr] = useState({
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
   });

   // utils
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

   const loadManagers = async () => {
      setLoading(true);
      try {
         const all = await getUsers();
         const list = (all || []).filter(
            (u) => String(u.role || "").toUpperCase() === "MANAGER"
         );
         setManagers(list);
      } catch (e) {
         console.error("[Managers] getUsers error:", e);
         pushPill("Eroare la încărcarea listei de manageri.");
      } finally {
         setLoading(false);
      }
   };

   useEffect(() => {
      loadManagers();
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

   const filteredManagers = useMemo(() => {
      const q = (search || "").toLowerCase();
      return managers.filter((m) => {
         const fullName = `${m.firstName || ""} ${m.lastName || ""}`
            .trim()
            .toLowerCase();
         const email = (m.email || "").toLowerCase();
         const phone = (m.phone || "").toLowerCase();
         return (
            fullName.includes(q) ||
            email.includes(q) ||
            phone.includes(q) ||
            "manager".includes(q)
         );
      });
   }, [managers, search]);

   // === ADD ===
   const handleAdd = async () => {
      setSaving(true);
      setPillMessages([]);

      // validations
      if (!newMgr.firstName?.trim() || !newMgr.lastName?.trim()) {
         pushPill("Completează numele și prenumele.");
         setSaving(false);
         return;
      }
      if (!newMgr.email?.trim()) {
         pushPill("Email este obligatoriu.");
         setSaving(false);
         return;
      }
      if (!newMgr.password || newMgr.password.length < 6) {
         pushPill("Parola trebuie să aibă minim 6 caractere.");
         setSaving(false);
         return;
      }
      if (newMgr.password !== newMgr.confirmPassword) {
         pushPill("Parolele nu coincid.");
         setSaving(false);
         return;
      }

      try {
         const payload = {
            firstName: newMgr.firstName.trim(),
            lastName: newMgr.lastName.trim(),
            phone: newMgr.phone?.trim() || "",
            email: newMgr.email.trim(),
            password: newMgr.password,
            role: "MANAGER", // 👈 setăm automat rolul
         };

         const created = await createUser(payload);
         if (!created?.id) {
            pushPill("Nu am putut crea managerul (fără id).");
         } else {
            setManagers((prev) => [created, ...prev]);
            setNewMgr({
               firstName: "",
               lastName: "",
               phone: "",
               email: "",
               password: "",
               confirmPassword: "",
            });
            setActiveTab("list");
         }
      } catch (e) {
         console.error("[ADD MANAGER] error:", e);
         pushPill("Eroare la crearea managerului.");
      } finally {
         setSaving(false);
      }
   };

   // === EDIT ===
   const handleSaveEdit = async () => {
      if (!editingId) return;
      setSaving(true);
      try {
         const payload = {
            firstName: editMgr.firstName?.trim(),
            lastName: editMgr.lastName?.trim(),
            phone: editMgr.phone?.trim(),
            email: editMgr.email?.trim(),
            role: "MANAGER", // asigurăm rolul rămâne MANAGER
         };

         const updated = await updateUser(editingId, payload);
         setManagers((prev) =>
            prev.map((m) => (m.id === editingId ? { ...m, ...updated } : m))
         );
         setEditingId(null);
      } catch (e) {
         console.error("[EDIT MANAGER] error:", e);
         pushPill("Eroare la salvarea modificărilor.");
      } finally {
         setSaving(false);
      }
   };

   // === DELETE ===
   const handleDelete = async (id) => {
      if (!id) return;
      if (!window.confirm("Ești sigur că vrei să ștergi acest manager?"))
         return;
      try {
         await deleteUser(id);
         setManagers((prev) => prev.filter((m) => m.id !== id));
         if (editingId === id) setEditingId(null);
      } catch (e) {
         console.error("[DELETE MANAGER] error:", e);
         pushPill("Eroare la ștergere.");
      }
   };

   return (
      <>
         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Manageri</h3>
         </div>

         <div className="instructors-popup__content">
            {/* Sidebar */}
            <div className="instructors-popup__search-wrapper">
               <input
                  type="text"
                  className="instructors-popup__search"
                  placeholder="Caută manager..."
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
                     {loading ? (
                        <div style={{ padding: 12, color: "#64748b" }}>
                           Se încarcă...
                        </div>
                     ) : (
                        <ul className="instructors-popup__list-items">
                           {filteredManagers.map((mgr) => (
                              <li
                                 key={mgr.id}
                                 className={`instructors-popup__item ${
                                    editingId === mgr.id ? "active" : ""
                                 }`}
                              >
                                 {editingId === mgr.id ? (
                                    <div className="instructors-popup__form">
                                       <div className="instructors-popup__form-row">
                                          <input
                                             type="text"
                                             className="instructors-popup__input"
                                             value={editMgr.firstName}
                                             onChange={(e) =>
                                                setEditMgr((s) => ({
                                                   ...s,
                                                   firstName: e.target.value,
                                                }))
                                             }
                                             placeholder={
                                                mgr.firstName || "Prenume"
                                             }
                                             autoComplete="given-name"
                                          />
                                          <input
                                             type="text"
                                             className="instructors-popup__input"
                                             value={editMgr.lastName}
                                             onChange={(e) =>
                                                setEditMgr((s) => ({
                                                   ...s,
                                                   lastName: e.target.value,
                                                }))
                                             }
                                             placeholder={
                                                mgr.lastName || "Nume"
                                             }
                                             autoComplete="family-name"
                                          />
                                       </div>

                                       <div className="instructors-popup__form-row">
                                          <input
                                             type="tel"
                                             className="instructors-popup__input"
                                             value={editMgr.phone}
                                             onChange={(e) =>
                                                setEditMgr((s) => ({
                                                   ...s,
                                                   phone: e.target.value,
                                                }))
                                             }
                                             placeholder={
                                                (mgr.phone &&
                                                   `Ex: ${mgr.phone}`) ||
                                                "Telefon"
                                             }
                                             inputMode="tel"
                                             autoComplete="tel"
                                          />
                                          <input
                                             type="email"
                                             className="instructors-popup__input"
                                             value={editMgr.email}
                                             onChange={(e) =>
                                                setEditMgr((s) => ({
                                                   ...s,
                                                   email: e.target.value,
                                                }))
                                             }
                                             placeholder={mgr.email || "Email"}
                                             autoComplete="email"
                                          />
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
                                             onClick={() => setEditingId(null)}
                                             disabled={saving}
                                          >
                                             Anulează
                                          </button>
                                          <button
                                             className="instructors-popup__form-button instructors-popup__form-button--delete"
                                             onClick={() =>
                                                handleDelete(mgr.id)
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
                                                `${mgr.firstName || ""} ${
                                                   mgr.lastName || ""
                                                }`.trim(),
                                                search
                                             )}
                                          </h3>
                                          <p>
                                             {highlightText(
                                                mgr.phone || "",
                                                search
                                             )}
                                          </p>
                                          <p>
                                             {highlightText(
                                                mgr.email || "",
                                                search
                                             )}
                                          </p>
                                          <p>
                                             {highlightText("MANAGER", search)}
                                          </p>
                                       </div>

                                       <ReactSVG
                                          className="instructors-popup__edit-button react-icon"
                                          onClick={() => {
                                             setEditingId(mgr.id);
                                             setEditMgr({
                                                firstName: mgr.firstName || "",
                                                lastName: mgr.lastName || "",
                                                phone: mgr.phone || "",
                                                email: mgr.email || "",
                                             });
                                          }}
                                          src={editIcon}
                                       />
                                    </>
                                 )}
                              </li>
                           ))}
                        </ul>
                     )}
                  </div>
               )}

               {activeTab === "add" && (
                  <div className="instructors-popup__add">
                     <div className="instructors-popup__form-row">
                        <input
                           type="text"
                           className="instructors-popup__input"
                           placeholder="Prenume"
                           value={newMgr.firstName}
                           onChange={(e) =>
                              setNewMgr({
                                 ...newMgr,
                                 firstName: e.target.value,
                              })
                           }
                           autoComplete="given-name"
                        />
                        <input
                           type="text"
                           className="instructors-popup__input"
                           placeholder="Nume"
                           value={newMgr.lastName}
                           onChange={(e) =>
                              setNewMgr({ ...newMgr, lastName: e.target.value })
                           }
                           autoComplete="family-name"
                        />
                     </div>

                     <div className="instructors-popup__form-row">
                        <input
                           type="email"
                           className="instructors-popup__input"
                           placeholder="Email (user)"
                           value={newMgr.email}
                           onChange={(e) =>
                              setNewMgr({ ...newMgr, email: e.target.value })
                           }
                           autoComplete="email"
                        />
                        <input
                           type="tel"
                           className="instructors-popup__input"
                           placeholder="Telefon"
                           value={newMgr.phone}
                           onChange={(e) =>
                              setNewMgr({ ...newMgr, phone: e.target.value })
                           }
                           inputMode="tel"
                           autoComplete="tel"
                        />
                     </div>

                     <div className="instructors-popup__form-row instructors-popup__form-row--with-pill">
                        <input
                           type="password"
                           className="instructors-popup__input"
                           placeholder="Parolă (user)"
                           value={newMgr.password}
                           onChange={(e) =>
                              setNewMgr({ ...newMgr, password: e.target.value })
                           }
                           autoComplete="new-password"
                        />
                        <input
                           type="password"
                           className="instructors-popup__input"
                           placeholder="Confirmă parola"
                           value={newMgr.confirmPassword}
                           onChange={(e) =>
                              setNewMgr({
                                 ...newMgr,
                                 confirmPassword: e.target.value,
                              })
                           }
                           autoComplete="new-password"
                        />
                        <div className="instructors-popup__pill">
                           <AlertPills
                              messages={pillMessages}
                              onDismiss={popPill}
                           />
                        </div>
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
      </>
   );
}

export default AddManager;
