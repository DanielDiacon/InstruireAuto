// src/components/Popups/AddInstr.jsx
import React, { useState, useEffect, useMemo } from "react";
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
import {
   getInstructorBlackouts,
   addInstructorBlackouts,
   deleteInstructorBlackout,
} from "../../api/instructorsService";

/* ICONS */
import editIcon from "../../assets/svg/edit.svg";
import scheduleIcon from "../../assets/svg/material-symbols--today-outline.svg";

import AlertPills from "../Utils/AlertPills";

/* helpers */
const clean = (o = {}) =>
   Object.fromEntries(
      Object.entries(o).filter(([_, v]) => v !== undefined && v !== "")
   );

const normPlate = (s) =>
   String(s || "")
      .replace(/\s+/g, "")
      .replace(/-/g, "")
      .toUpperCase();
const normEmail = (s) =>
   String(s || "")
      .trim()
      .toLowerCase();
const normPhone = (s) => String(s || "").replace(/\D/g, "");
const toApiGearbox = (v) =>
   String(v || "")
      .toLowerCase()
      .includes("auto")
      ? "automat"
      : "manual";

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

/* === BLACKOUTS (simplificat – doar REPEAT săptămânal) === */

const oreDisponibile = [
   { eticheta: "07:00", oraStart: "07:00" },
   { eticheta: "08:30", oraStart: "08:30" },
   { eticheta: "10:00", oraStart: "10:00" },
   { eticheta: "11:30", oraStart: "11:30" },
   { eticheta: "13:30", oraStart: "13:30" },
   { eticheta: "15:00", oraStart: "15:00" },
   { eticheta: "16:30", oraStart: "16:30" },
   { eticheta: "18:00", oraStart: "18:00" },
];

const pad2 = (n) => String(n).padStart(2, "0");

function todayAt00() {
   const t = new Date();
   t.setHours(0, 0, 0, 0);
   return t;
}

/** yyyy-MM-dd pentru input[type="date"] */
function toDateInputValue(d) {
   const y = d.getFullYear();
   const m = pad2(d.getMonth() + 1);
   const day = pad2(d.getDate());
   return `${y}-${m}-${day}`;
}

/** Construiește ISO UTC “raw” (zi locală + HH:mm) */
function toIsoUtcRaw(localDateObj, timeStrHHMM) {
   const [hh, mm] = (timeStrHHMM || "00:00").split(":").map(Number);
   return new Date(
      Date.UTC(
         localDateObj.getFullYear(),
         localDateObj.getMonth(),
         localDateObj.getDate(),
         hh,
         mm,
         0,
         0
      )
   ).toISOString();
}

/** HH:mm dintr-un ISO UTC */
const hhmmFromIso = (iso) => {
   const d = new Date(iso);
   const H = pad2(d.getUTCHours());
   const M = pad2(d.getUTCMinutes());
   return `${H}:${M}`;
};

/** DOW (0..6) pe baza unei date locale (folosit pentru calcul serie săptămânală) */
const serverDowFromLocalDate = (localDateObj) => {
   const y = localDateObj.getFullYear();
   const m = localDateObj.getMonth();
   const d = localDateObj.getDate();
   return new Date(Date.UTC(y, m, d)).getUTCDay(); // 0..6
};

/** DOW (0..6) din ISO UTC */
const dowFromIsoUTC = (iso) => new Date(iso).getUTCDay();

/** Folosim startDateTime pentru REPEAT, altfel dateTime */
const getBlackoutDT = (b) => {
   if (typeof b === "string") return b;
   const t = String(b?.type || "").toUpperCase();
   if (t === "REPEAT") return b?.startDateTime || b?.dateTime;
   return b?.dateTime;
};

const weekdayShortLabel = (dow) => {
   switch (dow) {
      case 1:
         return "Lun";
      case 2:
         return "Mar";
      case 3:
         return "Mie";
      case 4:
         return "Joi";
      case 5:
         return "Vin";
      case 6:
         return "Sâm";
      case 0:
      default:
         return "Dum";
   }
};

/** doar data, fără oră */
function formatLocalDate(iso) {
   if (!iso) return "-";
   try {
      return new Intl.DateTimeFormat("ro-RO", {
         dateStyle: "short",
         timeZone: "Europe/Chisinau",
      }).format(new Date(iso));
   } catch {
      return iso;
   }
}

const initWeeklySelection = () => {
   const m = new Map();
   for (const d of [0, 1, 2, 3, 4, 5, 6]) m.set(d, new Set());
   return m;
};

/* ===== Highlight ===== */
function highlightText(text, query) {
   if (text === undefined || text === null) return "";
   if (!query) return text;
   const parts = text.toString().split(new RegExp(`(${query})`, "gi"));
   return parts.map((part, idx) =>
      part.toLowerCase() === (query || "").toLowerCase() ? (
         <i key={idx} className="highlight">
            {part}
         </i>
      ) : (
         part
      )
   );
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

   // creare instructor
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
   const [editingMode, setEditingMode] = useState(null); // 'details' | 'schedule'
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

   const [editPills, setEditPills] = useState([]);
   const pushEditPill = (text, type = "error") =>
      setEditPills((prev) => [
         ...prev,
         { id: Date.now() + Math.random(), text, type },
      ]);
   const popEditPill = () => setEditPills((prev) => prev.slice(0, -1));

   const getUserByIdFromStore = (id) =>
      users.find((u) => String(u.id) === String(id)) || null;
   const mergedEmail = (inst) => {
      const u = inst?.userId ? getUserByIdFromStore(inst.userId) : null;
      return u?.email || inst.email || "";
   };

   useEffect(() => {
      if (status === "idle") {
         dispatch(fetchInstructors());
         dispatch(fetchCars());
      }
      dispatch(fetchUsers());
   }, [status, dispatch]);

   const filteredInstructors = instructors.filter((inst) => {
      const q = (search || "").toLowerCase();
      const fullName = `${inst.firstName || ""} ${inst.lastName || ""}`
         .trim()
         .toLowerCase();
      const email = mergedEmail(inst).toLowerCase();
      const phone = String(inst.phone || "").toLowerCase();
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

   // car helpers
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
         if (changed)
            await dispatch(updateCar({ id: existing.id, ...payload })).unwrap();
      } else {
         await dispatch(addCar(payload)).unwrap();
      }
   };

   // validări (detalii)
   const collectCreateConflicts = () => {
      const errs = [];
      const p = normPhone(newInstr.phone);
      if (p) {
         const dupPhone = instructors.some((i) => normPhone(i.phone) === p);
         if (dupPhone) errs.push("Telefonul este deja folosit.");
      }
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
      const p = normPhone(editInstr.phone);
      if (p) {
         const dupPhone = instructors.some(
            (i) => String(i.id) !== String(id) && normPhone(i.phone) === p
         );
         if (dupPhone)
            errs.push("Telefonul este deja folosit de alt instructor.");
      }
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
      const plate = normPlate(editInstr.carPlate);
      if (plate) {
         const dupPlate = cars.some(
            (c) =>
               String(c.instructorId) !== String(id) &&
               normPlate(c.plateNumber) === plate
         );
         if (dupPlate) errs.push("Numărul de înmatriculare este deja folosit.");
      }
      return errs;
   };

   // ADD
   const handleAdd = async () => {
      setSaving(true);
      clearPills();

      const localErrors = [];
      if (!newInstr.firstName?.trim() || !newInstr.lastName?.trim())
         localErrors.push("Completează Prenume și Nume.");
      if (!newInstr.password || newInstr.password.length < 6)
         localErrors.push("Parola trebuie să aibă minim 6 caractere.");
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
            email: newInstr.email?.trim(),
            sector: newInstr.sector,
            isActive: newInstr.isActive,
            instructorsGroupId: newInstr.instructorsGroupId,
            password: newInstr.password,
         });

         const createdInstr = await dispatch(
            addInstructor(instrPayload)
         ).unwrap();
         createdId = createdInstr?.id ?? createdInstr?.data?.id;

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
            password: "",
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

   /* === ORAR (BLACKOUTS – doar REPEAT săptămânal, în perioada selectată) === */
   const [blkLoading, setBlkLoading] = useState(false);
   const [blkExisting, setBlkExisting] = useState([]); // lista raw de la server

   // selecție pentru NOILE serii săptămânale
   const [weeklyDay, setWeeklyDay] = useState(1); // 1 = Luni
   const [weeklySelection, setWeeklySelection] = useState(() =>
      initWeeklySelection()
   );

   // perioada selectată (inputurile pentru perioadă)
   const [periodStart, setPeriodStart] = useState(() => {
      const t = todayAt00();
      return toDateInputValue(t);
   });
   const [periodEnd, setPeriodEnd] = useState(() => {
      const t = todayAt00();
      const e = new Date(t);
      e.setMonth(e.getMonth() + 1);
      return toDateInputValue(e);
   });

   // id-uri de blackout marcate pentru ștergere
   const [blkRemoveIds, setBlkRemoveIds] = useState(() => new Set());

   // afișare/ascundere listă cu toate blocările
   const [showBlackoutList, setShowBlackoutList] = useState(false);

   /** Harta seriilor REPEAT săptămânale existente: dow -> (hhmm -> Set(ids)) */
   const weeklyActiveMap = useMemo(() => {
      const m = new Map();
      for (const d of [0, 1, 2, 3, 4, 5, 6]) m.set(d, new Map());

      for (const b of blkExisting || []) {
         if (String(b?.type || "").toUpperCase() !== "REPEAT") continue;
         if (Number(b.repeatEveryDays) !== 7) continue;

         const baseIso = getBlackoutDT(b);
         if (!baseIso) continue;

         const dow = dowFromIsoUTC(baseIso); // 0..6
         const hhmm = hhmmFromIso(baseIso);

         const mapForDay = m.get(dow) || new Map();
         if (!mapForDay.has(hhmm)) mapForDay.set(hhmm, new Set());
         mapForDay.get(hhmm).add(b.id);
         m.set(dow, mapForDay);
      }

      return m;
   }, [blkExisting]);

   /** există serie activă (ne-marcata pentru ștergere) pe DOW + HH:mm ? */
   const hasWeeklyRepeatActiveAt = (dow, hhmm) => {
      const mapForDay = weeklyActiveMap.get(dow) || new Map();
      const ids = mapForDay.get(hhmm) || new Set();
      for (const id of ids) if (!blkRemoveIds.has(id)) return true;
      return false;
   };

   /** toggle pe un slot de oră într-o anumită zi a săptămânii */
   const toggleWeeklySlot = (dow, hhmm) => {
      const mapForDay = weeklyActiveMap.get(dow) || new Map();
      const activeIds = new Set(mapForDay.get(hhmm) || []);

      if (activeIds.size > 0) {
         // există serii → marchează / demarchează pentru ștergere
         setBlkRemoveIds((prev) => {
            const next = new Set(prev);
            const allAlreadyMarked = [...activeIds].every((id) => next.has(id));
            if (allAlreadyMarked) {
               activeIds.forEach((id) => next.delete(id));
            } else {
               activeIds.forEach((id) => next.add(id));
            }
            return next;
         });
      } else {
         // nu există serie → toggle pentru CREARE (în intervalul selectat)
         setWeeklySelection((prev) => {
            const next = new Map(prev);
            const setForDay = new Set(next.get(dow) || []);
            if (setForDay.has(hhmm)) setForDay.delete(hhmm);
            else setForDay.add(hhmm);
            next.set(dow, setForDay);
            return next;
         });
      }
   };

   const hasWeeklySelection = useMemo(() => {
      for (const setForDay of weeklySelection.values()) {
         if (setForDay.size > 0) return true;
      }
      return false;
   }, [weeklySelection]);

   // încărcăm blackouts pentru instructor când intrăm în modul "schedule"
   useEffect(() => {
      if (!editingId || editingMode !== "schedule") return;
      (async () => {
         setBlkLoading(true);
         try {
            const list = await getInstructorBlackouts(editingId);
            setBlkExisting(Array.isArray(list) ? list : []);
         } catch (e) {
            pushEditPill(e?.message || "Nu am putut încărca orele blocate.");
            setBlkExisting([]);
         } finally {
            setBlkLoading(false);
         }
      })();
   }, [editingId, editingMode]); // eslint-disable-line

   /** construiește payload-ul pentru serii noi (REPEAT weekly, în perioada selectată) */
   const buildWeeklyBlackoutsItems = () => {
      if (!editingId) return [];
      const items = [];
      const seen = new Set();

      // dacă nu setezi manual perioada, default azi + 1 lună
      let start0;
      let end0;

      if (periodStart) {
         start0 = new Date(`${periodStart}T00:00:00`);
      } else {
         start0 = todayAt00();
      }

      if (periodEnd) {
         end0 = new Date(`${periodEnd}T00:00:00`);
      } else {
         end0 = new Date(start0);
         end0.setMonth(end0.getMonth() + 1);
      }

      // dacă cineva a pus end < start, le inversăm ca să nu crape
      if (end0 < start0) {
         const tmp = start0;
         start0 = end0;
         end0 = tmp;
      }

      const firstDowOnOrAfter = (startDate, targetDow) => {
         const d = new Date(startDate);
         d.setHours(0, 0, 0, 0);
         const curDow = serverDowFromLocalDate(d); // 0..6
         const diff = (targetDow - curDow + 7) % 7;
         d.setDate(d.getDate() + diff);
         return d;
      };

      const lastDowOnOrBefore = (endDate, targetDow) => {
         const d = new Date(endDate);
         d.setHours(0, 0, 0, 0);
         const curDow = serverDowFromLocalDate(d);
         const diff = (curDow - targetDow + 7) % 7;
         d.setDate(d.getDate() - diff);
         return d;
      };

      for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
         const setForDay = weeklySelection.get(dow) || new Set();
         for (const hhmm of setForDay) {
            // dacă există deja serie activă (ne-marcata delete), nu mai creăm
            if (hasWeeklyRepeatActiveAt(dow, hhmm)) continue;

            const first = firstDowOnOrAfter(start0, dow);
            const last = lastDowOnOrBefore(end0, dow);
            if (first > last) continue;

            const firstRaw = toIsoUtcRaw(first, hhmm);
            const lastRaw = toIsoUtcRaw(last, hhmm);

            const dkey = `${dow}|${hhmm}|${firstRaw}`;
            if (seen.has(dkey)) continue;
            seen.add(dkey);

            items.push({
               instructorId: Number(editingId),
               type: "REPEAT",
               dateTime: firstRaw,
               startDateTime: firstRaw,
               endDateTime: lastRaw,
               repeatEveryDays: 7,
            });
         }
      }

      return items;
   };

   const handleSaveSchedule = async () => {
      setSaving(true);
      setEditPills([]);

      try {
         const blackoutItems = buildWeeklyBlackoutsItems();
         const idsToDelete = Array.from(blkRemoveIds || []);

         if (idsToDelete.length === 0 && blackoutItems.length === 0) {
            setEditPills([
               {
                  id: Date.now(),
                  text: "Nu ai selectat nimic de salvat.",
                  type: "error",
               },
            ]);
            setSaving(false);
            return;
         }

         // ștergeri (ignorăm 404)
         if (idsToDelete.length > 0) {
            await Promise.all(
               idsToDelete.map((id) =>
                  deleteInstructorBlackout(id).catch((e) => {
                     const msg =
                        e?.message ||
                        e?.toString?.() ||
                        JSON.stringify(e || {});
                     if (/not\s*found/i.test(msg)) return null;
                     throw e;
                  })
               )
            );
         }

         // serii noi
         if (blackoutItems.length > 0) {
            await addInstructorBlackouts(blackoutItems);
         }

         // refresh store + lista locală
         await dispatch(fetchInstructors());
         if (editingId) {
            const list = await getInstructorBlackouts(editingId);
            setBlkExisting(Array.isArray(list) ? list : []);
         }

         // reset selecții
         setWeeklySelection(initWeeklySelection());
         setBlkRemoveIds(new Set());
      } catch (e) {
         const msgs = extractServerErrors(e);
         setEditPills(
            (msgs.length ? msgs : ["Eroare la salvarea orarului."]).map(
               (t) => ({
                  id: Date.now() + Math.random(),
                  text: t,
                  type: "error",
               })
            )
         );
         setSaving(false);
         return;
      }

      setSaving(false);
   };

   const handleSaveDetails = async () => {
      setSaving(true);
      setEditPills([]);

      const conflicts = collectEditConflicts(editingId, editingUserId);
      if (conflicts.length) {
         setEditPills(
            conflicts.map((t) => ({
               id: Date.now() + Math.random(),
               text: t,
               type: "error",
            }))
         );
         setSaving(false);
         return;
      }

      try {
         if (editingUserId)
            await updateUser(editingUserId, { email: editInstr.email?.trim() });

         const instrPayload = clean({
            firstName: editInstr.firstName?.trim(),
            lastName: editInstr.lastName?.trim(),
            phone: editInstr.phone?.trim(),
            email: editInstr.email?.trim(),
            sector: editInstr.sector,
         });

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
            dispatch(fetchUsers()),
         ]);
      } catch (e) {
         const msgs = extractServerErrors(e);
         setEditPills(
            (msgs.length ? msgs : ["Eroare la salvarea modificărilor."]).map(
               (t) => ({
                  id: Date.now() + Math.random(),
                  text: t,
                  type: "error",
               })
            )
         );
         setSaving(false);
         return;
      }

      setSaving(false);
      setEditingId(null);
      setEditingMode(null);
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
      setEditingMode(null);
      setEditingUserId(null);
   };

   const resetBlackoutsUI = () => {
      setBlkExisting([]);
      setBlkRemoveIds(new Set());
      setWeeklySelection(initWeeklySelection());
      setWeeklyDay(1);
      setEditPills([]);
      setShowBlackoutList(false);

      const t = todayAt00();
      const e = new Date(t);
      e.setMonth(e.getMonth() + 1);
      setPeriodStart(toDateInputValue(t));
      setPeriodEnd(toDateInputValue(e));
   };

   /* === UI === */
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
                           const isActiveItem = editingId === inst.id;

                           return (
                              <li
                                 key={inst.id}
                                 className={`instructors-popup__item ${
                                    isActiveItem ? "active" : ""
                                 }`}
                              >
                                 {isActiveItem ? (
                                    <>
                                       {editingMode === "details" && (
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
                                                         firstName:
                                                            e.target.value,
                                                      }))
                                                   }
                                                   placeholder={
                                                      inst.firstName ||
                                                      "Prenume"
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
                                                         lastName:
                                                            e.target.value,
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
                                                         carPlate:
                                                            e.target.value,
                                                      }))
                                                   }
                                                />
                                             </div>

                                             {/* rând 3: Email */}
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
                                                      editInstr.sector ===
                                                      "Botanica"
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
                                                            setEditInstr(
                                                               (s) => ({
                                                                  ...s,
                                                                  sector:
                                                                     e.target
                                                                        .value,
                                                               })
                                                            )
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
                                                            setEditInstr(
                                                               (s) => ({
                                                                  ...s,
                                                                  sector:
                                                                     e.target
                                                                        .value,
                                                               })
                                                            )
                                                         }
                                                      />
                                                      Ciocana
                                                   </label>
                                                </div>

                                                <div
                                                   className={`instructors-popup__radio-wrapper grow ${
                                                      editInstr.gearbox ===
                                                      "manual"
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
                                                            setEditInstr(
                                                               (s) => ({
                                                                  ...s,
                                                                  gearbox:
                                                                     e.target
                                                                        .value,
                                                               })
                                                            )
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
                                                            setEditInstr(
                                                               (s) => ({
                                                                  ...s,
                                                                  gearbox:
                                                                     e.target
                                                                        .value,
                                                               })
                                                            )
                                                         }
                                                      />
                                                      Automat
                                                   </label>
                                                </div>
                                             </div>

                                             <AlertPills
                                                messages={editPills}
                                                onDismiss={popEditPill}
                                             />

                                             <div className="instructors-popup__btns">
                                                <button
                                                   className="instructors-popup__form-button instructors-popup__form-button--save"
                                                   onClick={handleSaveDetails}
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
                                                      setEditingMode(null);
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
                                       )}

                                       {editingMode === "schedule" && (
                                          <div className="instructors-popup__form">
                                             <AlertPills
                                                messages={editPills}
                                                onDismiss={popEditPill}
                                             />

                                             {/* BAR SUS: descriere + buton listă blocări */}
                                             <div className="blackouts__modebar">
                                                <span className="blackouts__modebar-text">
                                                   Blocare
                                                </span>

                                                <button
                                                   type="button"
                                                   className="instructors-popup__form-button instructors-popup__form-button--cancel"
                                                   onClick={() =>
                                                      setShowBlackoutList(
                                                         (v) => !v
                                                      )
                                                   }
                                                >
                                                   {showBlackoutList
                                                      ? "Ascunde lista blocări"
                                                      : "Listă blocări"}
                                                </button>
                                             </div>

                                             {/* LISTĂ BLOCĂRI EXISTENTE */}
                                             {showBlackoutList && (
                                                <div className="blackouts__list">
                                                   {blkLoading ? (
                                                      <p>
                                                         Se încarcă blocările...
                                                      </p>
                                                   ) : blkExisting.length ===
                                                     0 ? (
                                                      <p>
                                                         Nu există blocări
                                                         salvate pentru acest
                                                         instructor.
                                                      </p>
                                                   ) : (
                                                      <ul className="blackouts__list-items">
                                                         {blkExisting.map(
                                                            (b) => {
                                                               const baseIso =
                                                                  getBlackoutDT(
                                                                     b
                                                                  );
                                                               const dow =
                                                                  baseIso !=
                                                                  null
                                                                     ? dowFromIsoUTC(
                                                                          baseIso
                                                                       )
                                                                     : null;
                                                               const hhmm =
                                                                  baseIso !=
                                                                  null
                                                                     ? hhmmFromIso(
                                                                          baseIso
                                                                       )
                                                                     : null;

                                                               const startLbl =
                                                                  formatLocalDate(
                                                                     b.startDateTime ||
                                                                        b.dateTime
                                                                  );
                                                               const endLbl =
                                                                  formatLocalDate(
                                                                     b.endDateTime
                                                                  );

                                                               const isWeekly =
                                                                  String(
                                                                     b?.type ||
                                                                        ""
                                                                  ).toUpperCase() ===
                                                                     "REPEAT" &&
                                                                  Number(
                                                                     b.repeatEveryDays
                                                                  ) === 7;

                                                               const isMarked =
                                                                  blkRemoveIds.has(
                                                                     b.id
                                                                  );

                                                               return (
                                                                  <li
                                                                     key={b.id}
                                                                     className={
                                                                        "blackouts__list-item" +
                                                                        (isMarked
                                                                           ? " blackouts__list-item--marked"
                                                                           : "")
                                                                     }
                                                                  >
                                                                     <div className="blackouts__list-topline">
                                                                        <span className="blackouts__list-label">
                                                                           {dow !=
                                                                              null &&
                                                                           hhmm
                                                                              ? `${weekdayShortLabel(
                                                                                   dow
                                                                                )} · ${hhmm} · ${
                                                                                   isWeekly
                                                                                      ? "Săptămânal"
                                                                                      : b.type
                                                                                }`
                                                                              : String(
                                                                                   b.type ||
                                                                                      ""
                                                                                ).toUpperCase()}
                                                                        </span>
                                                                     </div>
                                                                     <div className="blackouts__list-range">
                                                                        <span>
                                                                           {
                                                                              startLbl
                                                                           }
                                                                        </span>
                                                                        <span>
                                                                           {" "}
                                                                           →{" "}
                                                                        </span>
                                                                        <span>
                                                                           {
                                                                              endLbl
                                                                           }
                                                                        </span>
                                                                     </div>
                                                                     <button
                                                                        type="button"
                                                                        className="instructors-popup__form-button instructors-popup__form-button--delete blackouts__list-delete-btn"
                                                                        onClick={() =>
                                                                           setBlkRemoveIds(
                                                                              (
                                                                                 prev
                                                                              ) => {
                                                                                 const next =
                                                                                    new Set(
                                                                                       prev
                                                                                    );
                                                                                 if (
                                                                                    next.has(
                                                                                       b.id
                                                                                    )
                                                                                 )
                                                                                    next.delete(
                                                                                       b.id
                                                                                    );
                                                                                 else
                                                                                    next.add(
                                                                                       b.id
                                                                                    );
                                                                                 return next;
                                                                              }
                                                                           )
                                                                        }
                                                                     >
                                                                        {isMarked
                                                                           ? "Anulează"
                                                                           : "Ștergere"}
                                                                     </button>
                                                                  </li>
                                                               );
                                                            }
                                                         )}
                                                      </ul>
                                                   )}
                                                </div>
                                             )}

                                             {/* INPUT-URI PERIOADĂ + TAB-URI + ORE – doar când lista NU e deschisă */}
                                             {!showBlackoutList && (
                                                <>
                                                   {/* PERIOADĂ (cu clase compatibile stilului vechi) */}
                                                   <div className="instructors-popup__form-row blackouts__period-row">
                                                      <div className="blackouts__period-col">
                                                         <input
                                                            type="date"
                                                            className="blackouts__period-input instructors-popup__input"
                                                            value={periodStart}
                                                            onChange={(e) =>
                                                               setPeriodStart(
                                                                  e.target.value
                                                               )
                                                            }
                                                         />
                                                      </div>
                                                      <span className="blackouts__separator">
                                                         →
                                                      </span>
                                                      <div className="blackouts__period-col">
                                                         <input
                                                            type="date"
                                                            className="blackouts__period-input instructors-popup__input"
                                                            value={periodEnd}
                                                            onChange={(e) =>
                                                               setPeriodEnd(
                                                                  e.target.value
                                                               )
                                                            }
                                                         />
                                                      </div>
                                                   </div>

                                                   {/* TAB-URI ZILE SĂPTĂMÂNĂ */}
                                                   <div className="blackouts__weekday-tabs">
                                                      {[
                                                         {
                                                            key: 1,
                                                            label: "Lun",
                                                         },
                                                         {
                                                            key: 2,
                                                            label: "Mar",
                                                         },
                                                         {
                                                            key: 3,
                                                            label: "Mie",
                                                         },
                                                         {
                                                            key: 4,
                                                            label: "Joi",
                                                         },
                                                         {
                                                            key: 5,
                                                            label: "Vin",
                                                         },
                                                         {
                                                            key: 6,
                                                            label: "Sâm",
                                                         },
                                                         {
                                                            key: 0,
                                                            label: "Dum",
                                                         },
                                                      ].map((d) => (
                                                         <button
                                                            key={d.key}
                                                            type="button"
                                                            className={`blackouts__btn-day instructors-popup__form-button instructors-popup__form-button--cancel ${
                                                               weeklyDay ===
                                                               d.key
                                                                  ? "active"
                                                                  : ""
                                                            }`}
                                                            onClick={() =>
                                                               setWeeklyDay(
                                                                  d.key
                                                               )
                                                            }
                                                            title={`Editează ${d.label.toLowerCase()}`}
                                                         >
                                                            {d.label}
                                                         </button>
                                                      ))}
                                                   </div>

                                                   {/* GRILĂ ORE PENTRU ZIUA SELECTATĂ */}
                                                   {(() => {
                                                      const setForCreate =
                                                         weeklySelection.get(
                                                            weeklyDay
                                                         ) || new Set();
                                                      const mapForDay =
                                                         weeklyActiveMap.get(
                                                            weeklyDay
                                                         ) || new Map();

                                                      return (
                                                         <div className="blackouts__times repeat">
                                                            {oreDisponibile.map(
                                                               (ora) => {
                                                                  const activeIds =
                                                                     new Set(
                                                                        mapForDay.get(
                                                                           ora.oraStart
                                                                        ) || []
                                                                     );

                                                                  const hasActive =
                                                                     [
                                                                        ...activeIds,
                                                                     ].some(
                                                                        (id) =>
                                                                           !blkRemoveIds.has(
                                                                              id
                                                                           )
                                                                     );
                                                                  const allMarked =
                                                                     activeIds.size >
                                                                        0 &&
                                                                     [
                                                                        ...activeIds,
                                                                     ].every(
                                                                        (id) =>
                                                                           blkRemoveIds.has(
                                                                              id
                                                                           )
                                                                     );
                                                                  const selectedForCreate =
                                                                     setForCreate.has(
                                                                        ora.oraStart
                                                                     );

                                                                  const className =
                                                                     [
                                                                        "saddprogramari__time-btn",
                                                                        hasActive &&
                                                                        !allMarked
                                                                           ? "saddprogramari__time-btn--selected"
                                                                           : "",
                                                                        hasActive &&
                                                                        allMarked
                                                                           ? "saddprogramari__time-btn--to-delete"
                                                                           : "",
                                                                        !hasActive &&
                                                                        selectedForCreate
                                                                           ? "saddprogramari__time-btn--selected"
                                                                           : "",
                                                                     ]
                                                                        .filter(
                                                                           Boolean
                                                                        )
                                                                        .join(
                                                                           " "
                                                                        );

                                                                  const title =
                                                                     hasActive
                                                                        ? "Marcază/demarchează seria săptămânală pentru ștergere"
                                                                        : "Selectează pentru blocare repetitivă în perioada aleasă";

                                                                  return (
                                                                     <button
                                                                        key={
                                                                           ora.eticheta
                                                                        }
                                                                        type="button"
                                                                        className={
                                                                           className
                                                                        }
                                                                        disabled={
                                                                           blkLoading ||
                                                                           saving
                                                                        }
                                                                        onClick={() =>
                                                                           toggleWeeklySlot(
                                                                              weeklyDay,
                                                                              ora.oraStart
                                                                           )
                                                                        }
                                                                        title={
                                                                           title
                                                                        }
                                                                     >
                                                                        {
                                                                           ora.eticheta
                                                                        }
                                                                     </button>
                                                                  );
                                                               }
                                                            )}
                                                         </div>
                                                      );
                                                   })()}
                                                </>
                                             )}

                                             <div className="instructors-popup__btns">
                                                <button
                                                   className="instructors-popup__form-button instructors-popup__form-button--save"
                                                   onClick={handleSaveSchedule}
                                                   disabled={
                                                      saving || blkLoading
                                                   }
                                                >
                                                   {saving
                                                      ? "Se salvează..."
                                                      : blkRemoveIds.size > 0 ||
                                                        hasWeeklySelection
                                                      ? "Aplică"
                                                      : "Salvează"}
                                                </button>
                                                <button
                                                   className="instructors-popup__form-button instructors-popup__form-button--cancel"
                                                   onClick={() => {
                                                      setEditingId(null);
                                                      setEditingMode(null);
                                                      setEditingUserId(null);
                                                   }}
                                                   disabled={saving}
                                                >
                                                   Închide
                                                </button>
                                             </div>
                                          </div>
                                       )}
                                    </>
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

                                       {/* ACTION BUTTONS */}
                                       <div
                                          className="instructors-popup__item-actions"
                                          style={{
                                             display: "flex",
                                             flexDirection: "column",
                                             gap: 6,
                                          }}
                                       >
                                          <ReactSVG
                                             className="instructors-popup__edit-button react-icon"
                                             title="Editează detalii"
                                             onClick={() => {
                                                setEditingId(inst.id);
                                                setEditingMode("details");
                                                setEditingUserId(
                                                   inst.userId || null
                                                );
                                                const car = cars.find(
                                                   (c) =>
                                                      String(c.instructorId) ===
                                                      String(inst.id)
                                                );
                                                setEditInstr({
                                                   firstName:
                                                      inst.firstName || "",
                                                   lastName:
                                                      inst.lastName || "",
                                                   phone: inst.phone || "",
                                                   email:
                                                      mergedEmail(inst) || "",
                                                   sector:
                                                      inst.sector || "Botanica",
                                                   carPlate:
                                                      car?.plateNumber || "",
                                                   gearbox: toApiGearbox(
                                                      car?.gearbox || "manual"
                                                   ),
                                                });
                                                resetBlackoutsUI();
                                             }}
                                             src={editIcon}
                                          />

                                          <ReactSVG
                                             className="instructors-popup__edit-button react-icon"
                                             title="Editează orarul"
                                             onClick={() => {
                                                setEditingId(inst.id);
                                                setEditingMode("schedule");
                                                setEditingUserId(
                                                   inst.userId || null
                                                );
                                                resetBlackoutsUI();
                                             }}
                                             src={scheduleIcon}
                                          />
                                       </div>
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

                     {/* rând 3: Parolă + Nr. mașină */}
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

                     {/* rând 4: Sector + Cutie */}
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
