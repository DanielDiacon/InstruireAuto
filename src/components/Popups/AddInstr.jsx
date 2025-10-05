// src/components/Instructors/AddInstr.jsx
import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { ReactSVG } from "react-svg";

import {
   fetchInstructors,
   addInstructor,
   updateInstructor,
   removeInstructor,
} from "../../store/instructorsSlice";

import { fetchCars, addCar, updateCar, removeCar } from "../../store/carsSlice";
import { fetchUsers } from "../../store/usersSlice";
import { updateUser } from "../../api/usersService";

import editIcon from "../../assets/svg/edit.svg";
import AlertPills from "../Utils/AlertPills";

/* helpers */
const clean = (o = {}) =>
   Object.fromEntries(
      Object.entries(o).filter(([_, v]) => v !== undefined && v !== "")
   );

const norm = (s) =>
   String(s || "")
      .replace(/\s+/g, "")
      .toLowerCase();
const normPlate = (s) =>
   String(s || "")
      .replace(/\s+/g, "")
      .replace(/-/g, "")
      .toUpperCase();
const normEmail = (s) =>
   String(s || "")
      .trim()
      .toLowerCase();
const normPhone = (s) => String(s || "").replace(/\D/g, ""); // doar cifre

const toApiGearbox = (v) =>
   String(v || "")
      .toLowerCase()
      .includes("auto")
      ? "automat"
      : "manual";

// extrage mesaje lizibile din erorile backend
function extractServerErrors(err) {
   const out = [];
   const raw = err?.message || err?.toString?.() || "";
   try {
      const json = JSON.parse(raw);
      if (Array.isArray(json?.message)) out.push(...json.message.map(String));
      else if (json?.message) out.push(String(json.message));
      else out.push(raw);
   } catch {
      out.push(raw);
   }
   return out
      .map((m) =>
         m
            .replace(/^\s*Error:\s*/i, "")
            .replace(/Bad Request/gi, "")
            .replace(/Conflict/gi, "")
            .trim()
      )
      .filter(Boolean);
}

function AddInstr() {
   const dispatch = useDispatch();
   const { list: instructors, status } = useSelector((s) => s.instructors);
   const cars = useSelector((s) => s.cars.list || []);
   const users = useSelector((s) => s.users?.list || []);

   const [activeTab, setActiveTab] = useState("list");
   const [search, setSearch] = useState("");
   const [saving, setSaving] = useState(false);

   const [pillMessages, setPillMessages] = useState([]);
   const pushPill = (text, type = "error") =>
      setPillMessages((prev) => [
         ...prev,
         { id: Date.now() + Math.random(), text, type },
      ]);
   const setPills = (arr) =>
      setPillMessages(
         (arr || []).map((text) => ({
            id: Date.now() + Math.random(),
            text,
            type: "error",
         }))
      );
   const clearPills = () => setPillMessages([]);
   const popPill = () => setPillMessages((prev) => prev.slice(0, -1));

   // === creare instructor (fără user) ===
   const [newInstr, setNewInstr] = useState({
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      password: "", // <— PAROLĂ OBLIGATORIE la CREATE
      sector: "Botanica",
      isActive: true,
      instructorsGroupId: null,
      carPlate: "",
      gearbox: "manual",
   });

   const [editingId, setEditingId] = useState(null);
   const [editingUserId, setEditingUserId] = useState(null);
   const [editInstr, setEditInstr] = useState({
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      sector: "Botanica",
      carPlate: "",
      gearbox: "manual",
   });

   const getUserByIdFromStore = (id) =>
      users.find((u) => String(u.id) === String(id)) || null;

   const mergedEmail = (inst) => {
      const u = inst?.userId ? getUserByIdFromStore(inst.userId) : null;
      return u?.email || inst.email || "";
   };

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

   /* effects */
   useEffect(() => {
      if (status === "idle") {
         dispatch(fetchInstructors());
         dispatch(fetchCars());
      }
      // încărcăm toți userii pentru mapare userId → email
      dispatch(fetchUsers());
   }, [status, dispatch]);

   const filteredInstructors = instructors.filter((inst) => {
      const q = (search || "").toLowerCase();
      const fullName = `${inst.firstName || ""} ${inst.lastName || ""}`
         .trim()
         .toLowerCase();
      const email = mergedEmail(inst).toLowerCase(); // doar emailul din user dacă există
      const phone = String(inst.phone || "").toLowerCase(); // telefonul rămâne din instructor
      const sector = String(inst.sector || "").toLowerCase();
      const car = cars.find((c) => String(c.instructorId) === String(inst.id));
      const plate = String(car?.plateNumber || "").toLowerCase();
      return (
         fullName.includes(q) ||
         email.includes(q) ||
         phone.includes(q) ||
         sector.includes(q) ||
         plate.includes(q)
      );
   });

   /* car helpers */
   const upsertCarForInstructor = async ({ instructorId, plate, gearbox }) => {
      const normalizedPlate = normPlate(plate);
      const existing = cars.find(
         (c) => String(c.instructorId) === String(instructorId)
      );

      if (!normalizedPlate) {
         if (existing) await dispatch(removeCar(existing.id)).unwrap();
         return;
      }

      const payload = {
         plateNumber: (plate || "").trim(),
         instructorId,
         gearbox: toApiGearbox(gearbox),
      };

      if (existing) {
         const changed =
            normPlate(existing.plateNumber) !== normalizedPlate ||
            toApiGearbox(existing.gearbox) !== payload.gearbox;

         if (changed) {
            await dispatch(updateCar({ id: existing.id, ...payload })).unwrap();
         }
      } else {
         await dispatch(addCar(payload)).unwrap();
      }
   };

   /* ===== VALIDĂRI UNICITATE (client) ===== */
   const collectCreateConflicts = () => {
      const errs = [];

      // phone unic în instructori
      const p = normPhone(newInstr.phone);
      if (p) {
         const dupPhone = instructors.some((i) => normPhone(i.phone) === p);
         if (dupPhone) errs.push("Telefonul este deja folosit.");
      }

      // email unic în useri SAU în instructori fără user
      const e = normEmail(newInstr.email);
      if (e) {
         const dupInUsers = users.some((u) => normEmail(u.email) === e);
         const dupInInstructors = instructors.some(
            (i) => !i.userId && normEmail(i.email) === e
         );
         if (dupInUsers || dupInInstructors)
            errs.push("Emailul este deja folosit.");
      }

      const plate = normPlate(newInstr.carPlate);
      if (plate) {
         const dupPlate = cars.some((c) => normPlate(c.plateNumber) === plate);
         if (dupPlate) errs.push("Numărul de înmatriculare este deja folosit.");
      }

      return errs;
   };

   const collectEditConflicts = (id, uid) => {
      const errs = [];

      // phone — rămâne în instructori
      const p = normPhone(editInstr.phone);
      if (p) {
         const dupPhone = instructors.some(
            (i) => String(i.id) !== String(id) && normPhone(i.phone) === p
         );
         if (dupPhone)
            errs.push("Telefonul este deja folosit de alt instructor.");
      }

      // email — unic în useri (exceptând propriul userId) + în instructori fără user
      const e = normEmail(editInstr.email);
      if (e) {
         const dupInUsers = users.some(
            (u) => String(u.id) !== String(uid) && normEmail(u.email) === e
         );
         const dupInInstructors = instructors.some(
            (i) =>
               String(i.id) !== String(id) &&
               !i.userId &&
               normEmail(i.email) === e
         );
         if (dupInUsers || dupInInstructors)
            errs.push("Emailul este deja folosit de alt utilizator.");
      }

      // car plate
      const plate = normPlate(editInstr.carPlate);
      if (plate) {
         const dupPlate = cars.some((c) => {
            const belongsToOther = String(c.instructorId) !== String(id);
            return belongsToOther && normPlate(c.plateNumber) === plate;
         });
         if (dupPlate) errs.push("Numărul de înmatriculare este deja folosit.");
      }

      return errs;
   };

   /* ADD (doar instructor + mașină opțional) */
   const handleAdd = async () => {
      setSaving(true);
      clearPills();

      // validări minime
      const localErrors = [];
      if (!newInstr.firstName?.trim() || !newInstr.lastName?.trim()) {
         localErrors.push("Completează Prenume și Nume.");
      }
      if (!newInstr.password || newInstr.password.length < 6) {
         localErrors.push("Parola trebuie să aibă minim 6 caractere.");
      }
      // unicități
      localErrors.push(...collectCreateConflicts());

      if (localErrors.length) {
         setPills(localErrors);
         setSaving(false);
         return;
      }

      let createdId = null;

      try {
         const instrPayload = clean({
            firstName: newInstr.firstName?.trim(),
            lastName: newInstr.lastName?.trim(),
            phone: newInstr.phone?.trim(),
            email: newInstr.email?.trim(), // la creare rămâne pe instructor (nu avem userId)
            sector: newInstr.sector,
            isActive: newInstr.isActive,
            instructorsGroupId: newInstr.instructorsGroupId,
            password: newInstr.password, // <— AICI TRIMIT PAROLA
         });

         const createdInstr = await dispatch(
            addInstructor(instrPayload)
         ).unwrap();
         createdId = createdInstr?.id ?? createdInstr?.data?.id;

         // mașina (opțional) — rollback dacă pică
         if (createdId) {
            try {
               await upsertCarForInstructor({
                  instructorId: createdId,
                  plate: newInstr.carPlate || "",
                  gearbox: newInstr.gearbox || "manual",
               });
            } catch (carErr) {
               try {
                  await dispatch(removeInstructor(createdId)).unwrap();
               } catch {}
               const msgs = extractServerErrors(carErr);
               setPills(msgs.length ? msgs : ["Eroare la salvarea mașinii."]);
               setSaving(false);
               return;
            }
         }

         await Promise.all([
            dispatch(fetchInstructors()),
            dispatch(fetchCars()),
            dispatch(fetchUsers()),
         ]);

         clearPills();
         setNewInstr({
            firstName: "",
            lastName: "",
            phone: "",
            email: "",
            password: "", // reset
            sector: "Botanica",
            isActive: true,
            instructorsGroupId: null,
            carPlate: "",
            gearbox: "manual",
         });
         setActiveTab("list");
      } catch (e) {
         const msgs = extractServerErrors(e);
         setPills(
            msgs.length
               ? msgs
               : [
                    "Eroare la creare instructor (verifică email/telefon/parolă).",
                 ]
         );
      } finally {
         setSaving(false);
      }
   };

   /* EDIT (update user.email dacă avem userId) — blocăm salvarea pe conflicte */
   const handleSaveEdit = async () => {
      setSaving(true);
      clearPills();

      const conflicts = collectEditConflicts(editingId, editingUserId);
      if (conflicts.length) {
         setPills(conflicts);
         setSaving(false);
         return;
      }

      try {
         // 1) dacă instructorul are userId, actualizăm emailul în /users/:id
         if (editingUserId) {
            await updateUser(editingUserId, { email: editInstr.email?.trim() });
         }

         // 2) patch instructor (fără/ cu email — îl păstrăm sincronizat)
         const instrPayload = clean({
            firstName: editInstr.firstName?.trim(),
            lastName: editInstr.lastName?.trim(),
            phone: editInstr.phone?.trim(),
            email: editInstr.email?.trim(), // păstrăm aliniat cu user.email
            sector: editInstr.sector,
         });

         await dispatch(
            updateInstructor({ id: editingId, data: instrPayload })
         ).unwrap();

         // 3) maşina
         await upsertCarForInstructor({
            instructorId: editingId,
            plate: editInstr.carPlate || "",
            gearbox: editInstr.gearbox || "manual",
         });

         await Promise.all([
            dispatch(fetchInstructors()),
            dispatch(fetchCars()),
            dispatch(fetchUsers()),
         ]);
      } catch (e) {
         const msgs = extractServerErrors(e);
         setPills(msgs.length ? msgs : ["Eroare la salvarea modificărilor."]);
         setSaving(false);
         return;
      }

      setSaving(false);
      setEditingId(null);
      setEditingUserId(null);
   };

   const handleDelete = async (id) => {
      if (!window.confirm("Ești sigur că vrei să ștergi acest instructor?"))
         return;
      try {
         const existing = cars.find(
            (c) => String(c.instructorId) === String(id)
         );
         if (existing) await dispatch(removeCar(existing.id)).unwrap();
      } catch {}
      dispatch(removeInstructor(id));
      setEditingId(null);
      setEditingUserId(null);
   };

   return (
      <>
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
                           const car = cars.find(
                              (c) => String(c.instructorId) === String(inst.id)
                           );
                           const email = mergedEmail(inst);
                           return (
                              <li
                                 key={inst.id}
                                 className={`instructors-popup__item ${
                                    editingId === inst.id ? "active" : ""
                                 }`}
                              >
                                 {editingId === inst.id ? (
                                    <div className="instructors-popup__form">
                                       {/* rând 1: Prenume + Nume */}
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
                                             placeholder={
                                                inst.firstName || "Prenume"
                                             }
                                             autoComplete="given-name"
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
                                             placeholder={
                                                inst.lastName || "Nume"
                                             }
                                             autoComplete="family-name"
                                          />
                                       </div>

                                       {/* rând 2: Telefon + Nr. mașină */}
                                       <div className="instructors-popup__form-row">
                                          <input
                                             type="tel"
                                             className="instructors-popup__input"
                                             value={editInstr.phone}
                                             onChange={(e) =>
                                                setEditInstr((s) => ({
                                                   ...s,
                                                   phone: e.target.value,
                                                }))
                                             }
                                             placeholder={
                                                inst.phone || "Telefon"
                                             }
                                             inputMode="tel"
                                             autoComplete="tel"
                                          />
                                          <input
                                             type="text"
                                             className="instructors-popup__input"
                                             placeholder="Nr. mașină"
                                             value={editInstr.carPlate}
                                             onChange={(e) =>
                                                setEditInstr((s) => ({
                                                   ...s,
                                                   carPlate: e.target.value,
                                                }))
                                             }
                                          />
                                       </div>

                                       {/* rând 3: Email (din user dacă există) */}
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
                                          placeholder={email || "Email"}
                                          autoComplete="email"
                                       />

                                       {/* rând 4: Sector + Cutie */}
                                       <div className="instructors-popup__form-row">
                                          <div
                                             className={`instructors-popup__radio-wrapper grow ${
                                                editInstr.sector === "Botanica"
                                                   ? "active-botanica"
                                                   : "active-ciocana"
                                             }`}
                                          >
                                             <label>
                                                <input
                                                   type="radio"
                                                   name={`sector-${inst.id}`}
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
                                                   name={`sector-${inst.id}`}
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

                                          <div
                                             className={`instructors-popup__radio-wrapper grow ${
                                                editInstr.gearbox === "manual"
                                                   ? "active-botanica"
                                                   : "active-ciocana"
                                             }`}
                                          >
                                             <label>
                                                <input
                                                   type="radio"
                                                   name={`gearbox-${inst.id}`}
                                                   value="manual"
                                                   checked={
                                                      editInstr.gearbox ===
                                                      "manual"
                                                   }
                                                   onChange={(e) =>
                                                      setEditInstr((s) => ({
                                                         ...s,
                                                         gearbox:
                                                            e.target.value,
                                                      }))
                                                   }
                                                />
                                                Manual
                                             </label>
                                             <label>
                                                <input
                                                   type="radio"
                                                   name={`gearbox-${inst.id}`}
                                                   value="automat"
                                                   checked={
                                                      editInstr.gearbox ===
                                                      "automat"
                                                   }
                                                   onChange={(e) =>
                                                      setEditInstr((s) => ({
                                                         ...s,
                                                         gearbox:
                                                            e.target.value,
                                                      }))
                                                   }
                                                />
                                                Automat
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
                                                `${inst.firstName || ""} ${
                                                   inst.lastName || ""
                                                }`,
                                                search
                                             )}
                                          </h3>
                                          <p>
                                             {highlightText(
                                                inst.phone || "",
                                                search
                                             )}
                                          </p>
                                          <p>
                                             {highlightText(
                                                mergedEmail(inst),
                                                search
                                             )}
                                          </p>
                                          <p>
                                             {highlightText(
                                                inst.sector || "",
                                                search
                                             )}
                                          </p>
                                          <p>
                                             {highlightText(
                                                inst.gearbox || "",
                                                search
                                             )}
                                          </p>
                                          <p>
                                             {highlightText(
                                                cars.find(
                                                   (c) =>
                                                      String(c.instructorId) ===
                                                      String(inst.id)
                                                )?.plateNumber || "—",
                                                search
                                             )}
                                          </p>
                                            <p>
                                             {highlightText(
                                                cars.find(
                                                   (c) =>
                                                      String(c.instructorId) ===
                                                      String(inst.id)
                                                )?.gearbox || "—",
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
                                             const car = cars.find(
                                                (c) =>
                                                   String(c.instructorId) ===
                                                   String(inst.id)
                                             );
                                             setEditInstr({
                                                firstName: inst.firstName || "",
                                                lastName: inst.lastName || "",
                                                phone: inst.phone || "",
                                                email: mergedEmail(inst) || "",
                                                sector:
                                                   inst.sector || "Botanica",
                                                carPlate:
                                                   car?.plateNumber || "",
                                                gearbox: toApiGearbox(
                                                   car?.gearbox || "manual"
                                                ),
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
                     <AlertPills messages={pillMessages} onDismiss={popPill} />

                     {/* rând 1: Prenume + Nume */}
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
                           autoComplete="given-name"
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
                           autoComplete="family-name"
                        />
                     </div>

                     {/* rând 2: Email + Telefon */}
                     <div className="instructors-popup__form-row">
                        <input
                           type="email"
                           className="instructors-popup__input"
                           placeholder="Email"
                           value={newInstr.email}
                           onChange={(e) =>
                              setNewInstr({
                                 ...newInstr,
                                 email: e.target.value,
                              })
                           }
                           autoComplete="email"
                        />
                        <input
                           type="tel"
                           className="instructors-popup__input"
                           placeholder="Telefon"
                           value={newInstr.phone}
                           onChange={(e) =>
                              setNewInstr({
                                 ...newInstr,
                                 phone: e.target.value,
                              })
                           }
                           inputMode="tel"
                           autoComplete="tel"
                        />
                     </div>

                     {/* rând 3: Parolă (obligatoriu) + Nr. mașină (opțional) */}
                     <div className="instructors-popup__form-row">
                        <input
                           type="password"
                           className="instructors-popup__input"
                           placeholder="Parolă (obligatoriu)"
                           value={newInstr.password}
                           onChange={(e) =>
                              setNewInstr({
                                 ...newInstr,
                                 password: e.target.value,
                              })
                           }
                           autoComplete="new-password"
                        />
                        <input
                           type="text"
                           className="instructors-popup__input"
                           placeholder="Nr. mașină (opțional)"
                           value={newInstr.carPlate}
                           onChange={(e) =>
                              setNewInstr({
                                 ...newInstr,
                                 carPlate: e.target.value,
                              })
                           }
                        />
                     </div>

                     {/* rând 4: Sector (radio) + Cutie (radio) */}
                     <div className="instructors-popup__form-row">
                        <div
                           className={`instructors-popup__radio-wrapper grow ${
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

                        <div
                           className={`instructors-popup__radio-wrapper grow ${
                              newInstr.gearbox === "manual"
                                 ? "active-botanica"
                                 : "active-ciocana"
                           }`}
                        >
                           <label>
                              <input
                                 type="radio"
                                 name="gearbox_add"
                                 value="manual"
                                 checked={newInstr.gearbox === "manual"}
                                 onChange={(e) =>
                                    setNewInstr({
                                       ...newInstr,
                                       gearbox: e.target.value,
                                    })
                                 }
                              />
                              Manual
                           </label>
                           <label>
                              <input
                                 type="radio"
                                 name="gearbox_add"
                                 value="automat"
                                 checked={newInstr.gearbox === "automat"}
                                 onChange={(e) =>
                                    setNewInstr({
                                       ...newInstr,
                                       gearbox: e.target.value,
                                    })
                                 }
                              />
                              Automat
                           </label>
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

export default AddInstr;
