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
import { getUserById, updateUser, createUser } from "../../api/usersService";

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
const toApiGearbox = (v) =>
   String(v || "")
      .toLowerCase()
      .includes("auto")
      ? "automat"
      : "manual";

function AddInstr() {
   const dispatch = useDispatch();
   const { list: instructors, status } = useSelector((s) => s.instructors);
   const cars = useSelector((s) => s.cars.list || []);

   const [activeTab, setActiveTab] = useState("list");
   const [search, setSearch] = useState("");
   const [saving, setSaving] = useState(false);

   const [pillMessages, setPillMessages] = useState([]);
   const pushPill = (text, type = "error") =>
      setPillMessages((prev) => [...prev, { id: Date.now(), text, type }]);
   const popPill = () => setPillMessages((prev) => prev.slice(0, -1));

   // === creare (fără confirmare parolă) ===
   const [newInstr, setNewInstr] = useState({
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      password: "",
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

   const [usersById, setUsersById] = useState({});

   const pickName = (inst = {}, u = {}) => ({
      firstName: inst.firstName || u.firstName || "",
      lastName: inst.lastName || u.lastName || "",
   });
   const getUserData = (inst) =>
      inst?.userId ? usersById[inst.userId] || {} : {};

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
   }, [status, dispatch]);

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
                  } catch {
                     return [
                        id,
                        { email: "", firstName: "", lastName: "", phone: "" },
                     ];
                  }
               })
            );
            if (!cancelled) setUsersById(Object.fromEntries(entries));
         } catch {}
      })();
      return () => void (cancelled = true);
   }, [instructors]);

   const filteredInstructors = instructors.filter((inst) => {
      const q = (search || "").toLowerCase();
      const u = getUserData(inst);
      const { firstName, lastName } = pickName(inst, u);
      const fullName = `${firstName} ${lastName}`.toLowerCase();
      const email = (inst.email || u.email || "").toLowerCase();
      const phone = (inst.phone || u.phone || "").toLowerCase();
      const sector = (inst.sector || "").toLowerCase();
      const car = cars.find((c) => String(c.instructorId) === String(inst.id));
      const plate = (car?.plateNumber || "").toLowerCase();
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
      const normalizedPlate = norm(plate);
      const existing = cars.find(
         (c) => String(c.instructorId) === String(instructorId)
      );

      if (!normalizedPlate) {
         if (existing) await dispatch(removeCar(existing.id)).unwrap();
         return;
      }
      if (existing) {
         if (
            norm(existing.plateNumber) !== normalizedPlate ||
            toApiGearbox(existing.gearbox) !== toApiGearbox(gearbox)
         ) {
            await dispatch(
               updateCar({
                  id: existing.id,
                  plateNumber: plate.trim(),
                  instructorId,
                  gearbox: toApiGearbox(gearbox),
               })
            ).unwrap();
         }
      } else {
         await dispatch(
            addCar({
               plateNumber: plate.trim(),
               instructorId,
               gearbox: toApiGearbox(gearbox),
            })
         ).unwrap();
      }
   };

   /* ADD (fără confirmare) */
   const handleAdd = async () => {
      setSaving(true);

      if (!newInstr.password || newInstr.password.length < 6) {
         pushPill("Parola trebuie să aibă minim 6 caractere.");
         setSaving(false);
         return;
      }

      try {
         // user cu rol INSTRUCTOR
         const userPayload = clean({
            email: newInstr.email?.trim(),
            password: newInstr.password,
            firstName: newInstr.firstName?.trim(),
            lastName: newInstr.lastName?.trim(),
            phone: newInstr.phone?.trim(),
            role: "INSTRUCTOR",
            roles: ["INSTRUCTOR"],
            roleName: "INSTRUCTOR",
         });
         const createdUser = await createUser(userPayload);
         const userId =
            createdUser?.id ?? createdUser?.userId ?? createdUser?.data?.id;

         // instructor
         const instrPayload = clean({
            firstName: newInstr.firstName?.trim(),
            lastName: newInstr.lastName?.trim(),
            phone: newInstr.phone?.trim(),
            email: newInstr.email?.trim(),
            sector: newInstr.sector,
            isActive: newInstr.isActive,
            instructorsGroupId: newInstr.instructorsGroupId,
            userId,
         });
         const createdInstr = await dispatch(
            addInstructor(instrPayload)
         ).unwrap();
         const instructorId = createdInstr?.id ?? createdInstr?.data?.id;

         // car
         if (instructorId) {
            await upsertCarForInstructor({
               instructorId,
               plate: newInstr.carPlate || "",
               gearbox: newInstr.gearbox || "manual",
            });
         }

         await Promise.all([
            dispatch(fetchInstructors()),
            dispatch(fetchCars()),
         ]);

         setPillMessages([]);
         setNewInstr({
            firstName: "",
            lastName: "",
            phone: "",
            email: "",
            password: "",
            sector: "Botanica",
            isActive: true,
            instructorsGroupId: null,
            carPlate: "",
            gearbox: "manual",
         });
         setActiveTab("list");
      } catch (e) {
         console.error("[ADD] Eroare (user/instructor):", e);
         pushPill("Eroare la creare utilizator/instructor.");
      } finally {
         setSaving(false);
      }
   };

   /* EDIT */
   const handleSaveEdit = async () => {
      setSaving(true);
      try {
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

         if (uid) {
            const userRes = await updateUser(uid, userPayload);
            setUsersById((prev) => ({
               ...prev,
               [uid]: { ...(prev[uid] || {}), ...userRes },
            }));
         }

         await dispatch(
            updateInstructor({ id: editingId, data: instrPayload })
         ).unwrap();

         await upsertCarForInstructor({
            instructorId: editingId,
            plate: editInstr.carPlate || "",
            gearbox: editInstr.gearbox || "manual",
         });

         await Promise.all([
            dispatch(fetchInstructors()),
            dispatch(fetchCars()),
         ]);
      } catch (e) {
         console.error("[EDIT] Eroare (user/instructor):", e);
         pushPill("Eroare la salvarea modificărilor.");
      } finally {
         setSaving(false);
         setEditingId(null);
         setEditingUserId(null);
      }
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
                           const u = getUserData(inst);
                           const { firstName, lastName } = pickName(inst, u);
                           const mergedPhone = inst.phone || u.phone || "";
                           const mergedEmail = inst.email || u.email || "";
                           const car = cars.find(
                              (c) => String(c.instructorId) === String(inst.id)
                           );

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
                                                firstName || "Prenume"
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
                                             placeholder={lastName || "Nume"}
                                             autoComplete="family-name"
                                          />
                                       </div>

                                       {/* rând 2: Telefon + Email */}
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
                                                (mergedPhone &&
                                                   `Ex: ${mergedPhone}`) ||
                                                "Telefon"
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
                                          placeholder={mergedEmail || "Email"}
                                          autoComplete="email"
                                       />

                                       {/* rând 4: Sector (radio) + Cutie (radio) */}
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
                                                   name={`gearbox-${editingId}`}
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
                                                   name={`gearbox-${editingId}`}
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
                                                `${firstName} ${lastName}`,
                                                search
                                             )}
                                          </h3>
                                          <p>
                                             {highlightText(
                                                inst.phone ||
                                                   getUserData(inst).phone ||
                                                   "",
                                                search
                                             )}
                                          </p>
                                          <p>
                                             {highlightText(
                                                inst.email ||
                                                   getUserData(inst).email ||
                                                   "",
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
                                                cars.find(
                                                   (c) =>
                                                      String(c.instructorId) ===
                                                      String(inst.id)
                                                )?.plateNumber || "—",
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
                                             const u = getUserData(inst);
                                             const { firstName, lastName } =
                                                pickName(inst, u);
                                             setEditInstr({
                                                firstName,
                                                lastName,
                                                phone:
                                                   inst.phone || u.phone || "",
                                                email:
                                                   inst.email || u.email || "",
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
                     {/* Pills vizibile în add */}
                     <div
                        className="instructors-popup__pill"
                        style={{ marginBottom: 8 }}
                     >
                        <AlertPills
                           messages={pillMessages}
                           onDismiss={popPill}
                        />
                     </div>

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
                           placeholder="Email (user)"
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

                     {/* rând 3: Parolă + Nr. mașină */}
                     <div className="instructors-popup__form-row">
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
