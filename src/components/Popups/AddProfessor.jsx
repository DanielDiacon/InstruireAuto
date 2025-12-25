// src/components/Popups/AddProfessor.jsx
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

function AddProfessor() {
   const [activeTab, setActiveTab] = useState("list"); // 'list' | 'add'
   const [search, setSearch] = useState("");
   const [saving, setSaving] = useState(false);
   const [loading, setLoading] = useState(true);

   const [pillMessages, setPillMessages] = useState([]);
   const pushPill = (text, type = "error") =>
      setPillMessages((prev) => [...prev, { id: Date.now(), text, type }]);
   const popPill = () => setPillMessages((prev) => prev.slice(0, -1));

   // === data ===
   const [professors, setProfessors] = useState([]);

   // === add form ===
   const [newProf, setNewProf] = useState({
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      password: "",
      confirmPassword: "",
   });

   // === edit form ===
   const [editingId, setEditingId] = useState(null);
   const [editProf, setEditProf] = useState({
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
   });

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

   const loadProfessors = async () => {
      setLoading(true);
      try {
         const all = await getUsers();
         const list = (all || []).filter(
            (u) => String(u.role || "").toUpperCase() === "PROFESSOR"
         );
         setProfessors(list);
      } catch (e) {
         console.error("[Professors] getUsers error:", e);
         pushPill("Eroare la încărcarea listei de profesori.");
      } finally {
         setLoading(false);
      }
   };

   useEffect(() => {
      loadProfessors();
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

   const filteredProfessors = useMemo(() => {
      const q = (search || "").toLowerCase();
      return professors.filter((p) => {
         const fullName = `${p.firstName || ""} ${p.lastName || ""}`
            .trim()
            .toLowerCase();
         const email = (p.email || "").toLowerCase();
         const phone = (p.phone || "").toLowerCase();
         return (
            fullName.includes(q) ||
            email.includes(q) ||
            phone.includes(q) ||
            "professor".includes(q) ||
            "profesor".includes(q)
         );
      });
   }, [professors, search]);

   // === ADD ===
   const handleAdd = async () => {
      setSaving(true);
      setPillMessages([]);

      if (!newProf.firstName?.trim() || !newProf.lastName?.trim()) {
         pushPill("Completează numele și prenumele.");
         setSaving(false);
         return;
      }
      if (!newProf.email?.trim()) {
         pushPill("Email este obligatoriu.");
         setSaving(false);
         return;
      }
      if (!newProf.password || newProf.password.length < 6) {
         pushPill("Parola trebuie să aibă minim 6 caractere.");
         setSaving(false);
         return;
      }
      if (newProf.password !== newProf.confirmPassword) {
         pushPill("Parolele nu coincid.");
         setSaving(false);
         return;
      }

      try {
         const payload = {
            firstName: newProf.firstName.trim(),
            lastName: newProf.lastName.trim(),
            phone: newProf.phone?.trim() || "",
            email: newProf.email.trim(),
            password: newProf.password,
            role: "PROFESSOR",
         };

         const created = await createUser(payload);

         if (!created?.id) {
            pushPill("Nu am putut crea profesorul (fără id).");
         } else {
            const localCreated = {
               ...created,
               role: "PROFESSOR",
            };

            setProfessors((prev) => [localCreated, ...prev]);

            setNewProf({
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
         console.error("[ADD PROFESSOR] error:", e);
         pushPill("Eroare la crearea profesorului.");
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
            firstName: editProf.firstName?.trim(),
            lastName: editProf.lastName?.trim(),
            phone: editProf.phone?.trim(),
            email: editProf.email?.trim(),
            role: "PROFESSOR",
         };

         const updated = await updateUser(editingId, payload);

         setProfessors((prev) =>
            prev.map((p) => {
               if (String(p.id) !== String(editingId)) return p;
               return {
                  ...p,
                  ...updated,
                  firstName: payload.firstName ?? p.firstName,
                  lastName: payload.lastName ?? p.lastName,
                  phone: payload.phone ?? p.phone,
                  email: payload.email ?? p.email,
                  role: "PROFESSOR",
               };
            })
         );

         setEditingId(null);
      } catch (e) {
         console.error("[EDIT PROFESSOR] error:", e);
         pushPill("Eroare la salvarea modificărilor.");
      } finally {
         setSaving(false);
      }
   };

   // === DELETE ===
   const handleDelete = async (id) => {
      if (!id) return;
      if (!window.confirm("Ești sigur că vrei să ștergi acest profesor?"))
         return;
      try {
         await deleteUser(id);
         setProfessors((prev) => prev.filter((p) => p.id !== id));
         if (editingId === id) setEditingId(null);
      } catch (e) {
         console.error("[DELETE PROFESSOR] error:", e);
         pushPill("Eroare la ștergere.");
      }
   };

   return (
      <>
         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Profesori</h3>
         </div>

         <div className="instructors-popup__content">
            {/* Sidebar */}
            <div className="instructors-popup__search-wrapper">
               <input
                  type="text"
                  className="instructors-popup__search"
                  placeholder="Caută profesor..."
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
                           {filteredProfessors.map((prof) => (
                              <li
                                 key={prof.id}
                                 className={`instructors-popup__item ${
                                    editingId === prof.id ? "active" : ""
                                 }`}
                              >
                                 {editingId === prof.id ? (
                                    <div className="instructors-popup__form">
                                       <div className="instructors-popup__form-row">
                                          <input
                                             type="text"
                                             className="instructors-popup__input"
                                             value={editProf.firstName}
                                             onChange={(e) =>
                                                setEditProf((s) => ({
                                                   ...s,
                                                   firstName: e.target.value,
                                                }))
                                             }
                                             placeholder={
                                                prof.firstName || "Prenume"
                                             }
                                             autoComplete="given-name"
                                          />
                                          <input
                                             type="text"
                                             className="instructors-popup__input"
                                             value={editProf.lastName}
                                             onChange={(e) =>
                                                setEditProf((s) => ({
                                                   ...s,
                                                   lastName: e.target.value,
                                                }))
                                             }
                                             placeholder={
                                                prof.lastName || "Nume"
                                             }
                                             autoComplete="family-name"
                                          />
                                       </div>

                                       <div className="instructors-popup__form-row">
                                          <input
                                             type="tel"
                                             className="instructors-popup__input"
                                             value={editProf.phone}
                                             onChange={(e) =>
                                                setEditProf((s) => ({
                                                   ...s,
                                                   phone: e.target.value,
                                                }))
                                             }
                                             placeholder={
                                                (prof.phone &&
                                                   `Ex: ${prof.phone}`) ||
                                                "Telefon"
                                             }
                                             inputMode="tel"
                                             autoComplete="tel"
                                          />
                                          <input
                                             type="email"
                                             className="instructors-popup__input"
                                             value={editProf.email}
                                             onChange={(e) =>
                                                setEditProf((s) => ({
                                                   ...s,
                                                   email: e.target.value,
                                                }))
                                             }
                                             placeholder={prof.email || "Email"}
                                             autoComplete="email"
                                          />
                                       </div>

                                       <div className="instructors-popup__btns">
                                          <button
                                             className="instructors-popup__form-button instructors-popup__form-button--delete"
                                             onClick={() =>
                                                handleDelete(prof.id)
                                             }
                                             disabled={saving}
                                          >
                                             Șterge
                                          </button>
                                          <button
                                             className="instructors-popup__form-button instructors-popup__form-button--cancel"
                                             onClick={() => setEditingId(null)}
                                             disabled={saving}
                                          >
                                             Anulează
                                          </button>
                                          <button
                                             className="instructors-popup__form-button instructors-popup__form-button--save"
                                             onClick={handleSaveEdit}
                                             disabled={saving}
                                          >
                                             {saving
                                                ? "Se salvează..."
                                                : "Salvează"}
                                          </button>
                                       </div>
                                    </div>
                                 ) : (
                                    <>
                                       <div className="instructors-popup__item-left">
                                          <h3>
                                             {highlightText(
                                                `${prof.firstName || ""} ${
                                                   prof.lastName || ""
                                                }`.trim(),
                                                search
                                             )}
                                          </h3>
                                          <p>
                                             {highlightText(
                                                prof.phone || "",
                                                search
                                             )}
                                          </p>
                                          <p>
                                             {highlightText(
                                                prof.email || "",
                                                search
                                             )}
                                          </p>
                                          <p>
                                             {highlightText(
                                                "PROFESSOR",
                                                search
                                             )}
                                          </p>
                                       </div>

                                       <ReactSVG
                                          className="instructors-popup__edit-button react-icon"
                                          onClick={() => {
                                             setEditingId(prof.id);
                                             setEditProf({
                                                firstName: prof.firstName || "",
                                                lastName: prof.lastName || "",
                                                phone: prof.phone || "",
                                                email: prof.email || "",
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
                           value={newProf.firstName}
                           onChange={(e) =>
                              setNewProf((s) => ({
                                 ...s,
                                 firstName: e.target.value,
                              }))
                           }
                           autoComplete="given-name"
                        />
                        <input
                           type="text"
                           className="instructors-popup__input"
                           placeholder="Nume"
                           value={newProf.lastName}
                           onChange={(e) =>
                              setNewProf((s) => ({
                                 ...s,
                                 lastName: e.target.value,
                              }))
                           }
                           autoComplete="family-name"
                        />
                     </div>

                     <div className="instructors-popup__form-row">
                        <input
                           type="email"
                           className="instructors-popup__input"
                           placeholder="Email (user)"
                           value={newProf.email}
                           onChange={(e) =>
                              setNewProf((s) => ({
                                 ...s,
                                 email: e.target.value,
                              }))
                           }
                           autoComplete="email"
                        />
                        <input
                           type="tel"
                           className="instructors-popup__input"
                           placeholder="Telefon"
                           value={newProf.phone}
                           onChange={(e) =>
                              setNewProf((s) => ({
                                 ...s,
                                 phone: e.target.value,
                              }))
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
                           value={newProf.password}
                           onChange={(e) =>
                              setNewProf((s) => ({
                                 ...s,
                                 password: e.target.value,
                              }))
                           }
                           autoComplete="new-password"
                        />
                        <input
                           type="password"
                           className="instructors-popup__input"
                           placeholder="Confirmă parola"
                           value={newProf.confirmPassword}
                           onChange={(e) =>
                              setNewProf((s) => ({
                                 ...s,
                                 confirmPassword: e.target.value,
                              }))
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

export default AddProfessor;
