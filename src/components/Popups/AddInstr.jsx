// src/components/Popups/AddInstr.jsx
import React, { useState, useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { ReactSVG } from "react-svg";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ro from "date-fns/locale/ro";

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
import repeatOnIcon from "../../assets/svg/repeat-on.svg";
import repeatOffIcon from "../../assets/svg/repeat-off.svg";

import AlertPills from "../Utils/AlertPills";

/* ===== Locale RO ===== */
registerLocale("ro", ro);

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

/* === BLACKOUTS (fără DST) === */
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

/* Date utils (pentru <input type="date"> și obiecte Date) */
const pad2 = (n) => String(n).padStart(2, "0");
function todayAt00() {
   const t = new Date();
   t.setHours(0, 0, 0, 0);
   return t;
}
function todayYmd() {
   const t = new Date();
   return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}
function dateFromYmd(ymd) {
   const [y, m, d] = String(ymd || "")
      .split("-")
      .map(Number);
   const x = new Date();
   x.setFullYear(y || 1970, (m || 1) - 1, d || 1);
   x.setHours(0, 0, 0, 0);
   return x;
}
function addDaysYmd(ymd, n) {
   const x = dateFromYmd(ymd);
   x.setDate(x.getDate() + (n || 0));
   return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}

/** Construiește ISO UTC “raw” (zi selectată + HH:mm) */
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
const toIsoUtcRawFromYmd = (ymd, hhmm) => toIsoUtcRaw(dateFromYmd(ymd), hhmm);

/** Cheie “server raw” dintr-un ISO: YYYY-MM-DD|HH:mm (UTC) */
function serverKeyFromIso(iso) {
   const d = new Date(iso);
   const y = d.getUTCFullYear();
   const m = String(d.getUTCMonth() + 1).padStart(2, "0");
   const da = String(d.getUTCDate()).padStart(2, "0");
   const H = String(d.getUTCHours()).padStart(2, "0");
   const M = String(d.getUTCMinutes()).padStart(2, "0");
   return `${y}-${m}-${da}|${H}:${M}`;
}
const ymdFromIso = (iso) => serverKeyFromIso(iso).split("|")[0];
const hhmmFromIso = (iso) => serverKeyFromIso(iso).split("|")[1];
const ymdFromLocalDate = (d) =>
   `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const serverDowFromLocalDate = (localDateObj) => {
   const y = localDateObj.getFullYear();
   const m = localDateObj.getMonth();
   const d = localDateObj.getDate();
   return new Date(Date.UTC(y, m, d)).getUTCDay(); // 0..6
};
const dowFromIsoUTC = (iso) => new Date(iso).getUTCDay(); // 0..6

const dateYmdWithinRange = (dateYmd, startIso, endIso) => {
   const s = ymdFromIso(startIso);
   const e = ymdFromIso(endIso);
   return dateYmd >= s && dateYmd <= e;
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

// ---- DEBUG
const summarizeBlackoutItems = (items = []) =>
   items.map((it, idx) => ({
      idx,
      instructorId: it.instructorId,
      type: it.type,
      dateTime: it.dateTime || null,
      startDateTime: it.startDateTime || null,
      endDateTime: it.endDateTime || null,
      repeatEveryDays: it.repeatEveryDays ?? null,
   }));

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

   /* === ORAR === */
   const [blkLoading, setBlkLoading] = useState(false);

   // SINGLE: obiect Date pentru react-datepicker
   const [blkDate, setBlkDate] = useState(todayAt00());
   const [blkSelectedSet, setBlkSelectedSet] = useState(() => new Set()); // HH:mm
   const [blkRemoveIds, setBlkRemoveIds] = useState(() => new Set()); // id-uri pt. delete

   // fetched
   const [blkExisting, setBlkExisting] = useState([]); // raw

   // MODE & REPEAT
   const [blkViewMode, setBlkViewMode] = useState("single"); // 'single' | 'repeat'
   const [repeatPattern, setRepeatPattern] = useState("daily"); // 'daily' | 'weekly'

   // REPEAT: interval comun cu 2 input-uri native (YMD strings)
   const [repeatStart, setRepeatStart] = useState(todayYmd());
   const [repeatEnd, setRepeatEnd] = useState(addDaysYmd(todayYmd(), 30));

   // WEEKLY editor: zi selectată (1=Luni ... 6=Sâmbătă, 0=Duminică)
   const [weeklyDay, setWeeklyDay] = useState(1);

   // Selectări pentru creare regim nou
   const [selTimesDaily, setSelTimesDaily] = useState(() => new Set());
   const [selTimesWeekly, setSelTimesWeekly] = useState(() => {
      const m = new Map();
      for (const d of [0, 1, 2, 3, 4, 5, 6]) m.set(d, new Set());
      return m;
   });

   const [editPills, setEditPills] = useState([]);
   const pushEditPill = (text, type = "error") =>
      setEditPills((prev) => [
         ...prev,
         { id: Date.now() + Math.random(), text, type },
      ]);
   const popEditPill = () => setEditPills((prev) => prev.slice(0, -1));

   /* Preferă startDateTime pentru REPEAT; dateTime rămâne pentru SINGLE. */
   const getBlackoutDT = (b) => {
      if (typeof b === "string") return b;
      const t = String(b?.type || "").toUpperCase();
      if (t === "REPEAT") return b?.startDateTime || b?.dateTime;
      return b?.dateTime;
   };

   function expandRepeatKeys(b) {
      const out = [];
      const type = String(b?.type || "").toUpperCase();
      if (type !== "REPEAT") return out;
      const every = Math.max(1, Number(b?.repeatEveryDays || 1));
      const first = b?.startDateTime || b?.dateTime;
      const end = b?.endDateTime;
      if (!first || !end) return out;

      let cur = new Date(first).getTime();
      const endMs = new Date(end).getTime();
      const step = every * 24 * 60 * 60 * 1000;

      while (cur <= endMs) {
         out.push(serverKeyFromIso(new Date(cur).toISOString()));
         cur += step;
      }
      return out;
   }

   // === REPEAT care rămân active după acest save (existente neșterse + cele noi)
   const computeRepeatKeysAfterSave = (newItems = []) => {
      const keys = new Set();

      // repeat-uri existente care NU sunt marcate pentru ștergere
      for (const b of blkExisting || []) {
         if (String(b?.type || "").toUpperCase() !== "REPEAT") continue;
         if (blkRemoveIds.has(b.id)) continue;
         for (const k of expandRepeatKeys(b)) keys.add(k);
      }

      // repeat-uri noi ce urmează a fi create
      for (const it of newItems) {
         if (String(it?.type || "").toUpperCase() !== "REPEAT") continue;
         for (const k of expandRepeatKeys(it)) keys.add(k);
      }

      return keys; // "YYYY-MM-DD|HH:mm"
   };

   // === SINGLE-uri existente care se suprapun cu repeat keys -> de șters
   const singlesOverlappedByRepeat = (repeatKeysSet) => {
      const ids = [];
      for (const b of blkExisting || []) {
         if (String(b?.type || "").toUpperCase() !== "SINGLE") continue;
         const dt = getBlackoutDT(b);
         if (!dt) continue;
         const key = serverKeyFromIso(dt);
         if (repeatKeysSet.has(key)) ids.push(b.id);
      }
      return ids;
   };

   const blkSetSingle = useMemo(() => {
      const s = new Set();
      for (const b of blkExisting || []) {
         if (String(b?.type || "").toUpperCase() === "SINGLE") {
            const dt = getBlackoutDT(b);
            if (dt) s.add(serverKeyFromIso(dt));
         }
      }
      return s;
   }, [blkExisting]);

   const blkMapSingle = useMemo(() => {
      const m = new Map();
      for (const b of blkExisting || []) {
         if (String(b?.type || "").toUpperCase() === "SINGLE") {
            const dt = getBlackoutDT(b);
            if (dt) m.set(serverKeyFromIso(dt), b);
         }
      }
      return m;
   }, [blkExisting]);

   const blkSetRepeatExpanded = useMemo(() => {
      const s = new Set();
      for (const b of blkExisting || []) {
         if (String(b?.type || "").toUpperCase() !== "REPEAT") continue;
         for (const k of expandRepeatKeys(b)) s.add(k);
      }
      return s;
   }, [blkExisting]);

   const dailyActiveMap = useMemo(() => {
      const map = new Map(); // HH:mm -> Set(ids)
      for (const b of blkExisting || []) {
         if (String(b?.type || "").toUpperCase() !== "REPEAT") continue;
         if (Number(b.repeatEveryDays) !== 1) continue;
         const key = serverKeyFromIso(b.startDateTime || b.dateTime);
         const hhmm = key.split("|")[1];
         if (!map.has(hhmm)) map.set(hhmm, new Set());
         map.get(hhmm).add(b.id);
      }
      return map;
   }, [blkExisting]);

   const weeklyActiveMap = useMemo(() => {
      const m = new Map(); // dow -> (hhmm -> Set(ids))
      for (const d of [0, 1, 2, 3, 4, 5, 6]) m.set(d, new Map());
      for (const b of blkExisting || []) {
         if (String(b?.type || "").toUpperCase() !== "REPEAT") continue;
         if (Number(b.repeatEveryDays) !== 7) continue;
         const key = serverKeyFromIso(b.startDateTime || b.dateTime);
         const hhmm = key.split("|")[1];
         const dow = dowFromIsoUTC(b.startDateTime || b.dateTime);
         if (!m.get(dow).has(hhmm)) m.get(dow).set(hhmm, new Set());
         m.get(dow).get(hhmm).add(b.id);
      }
      return m;
   }, [blkExisting]);

   const hasDailyRepeatActiveAt = (hhmm) => {
      const ids = dailyActiveMap.get(hhmm) || new Set();
      for (const id of ids) if (!blkRemoveIds.has(id)) return true;
      return false;
   };

   const hasWeeklyRepeatActiveAt = (dow, hhmm) => {
      const mapForDay = weeklyActiveMap.get(dow) || new Map();
      const ids = mapForDay.get(hhmm) || new Set();
      for (const id of ids) if (!blkRemoveIds.has(id)) return true;
      return false;
   };

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

   const onToggleViewMode = () => {
      setBlkViewMode((m) => (m === "single" ? "repeat" : "single"));
      setBlkSelectedSet(new Set());
      setBlkRemoveIds(new Set());
      setSelTimesDaily(new Set());
      const m = new Map();
      for (const d of [0, 1, 2, 3, 4, 5, 6]) m.set(d, new Set());
      setSelTimesWeekly(m);
   };

   // toggle pentru grila unei zile — doar SINGLE aici (REPEAT nu se editează în modul single)
   const toggleSingleGrid = (hhmm) => {
      if (!blkDate) return;

      const isoRaw = toIsoUtcRaw(blkDate, hhmm);
      const key = serverKeyFromIso(isoRaw);

      const isBlockedSingle = blkSetSingle.has(key);
      const isBlockedRepeat = blkSetRepeatExpanded.has(key);

      // REPEAT vizibil doar în modul "repeat" => aici ignorăm total
      if (isBlockedRepeat) return;

      if (isBlockedSingle) {
         const id = blkMapSingle.get(key)?.id;
         if (!id) return;
         setBlkRemoveIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
         });
      } else {
         setBlkSelectedSet((prev) => {
            const next = new Set(prev);
            if (next.has(hhmm)) next.delete(hhmm);
            else next.add(hhmm);
            return next;
         });
      }
   };

   const selectAllTimesForDay = () => {
      if (!blkDate) return;
      const next = new Set();
      for (const ora of oreDisponibile) {
         const isoRaw = toIsoUtcRaw(blkDate, ora.oraStart);
         const key = serverKeyFromIso(isoRaw);
         // nu selectăm sloturile acoperite de REPEAT (vizibile doar în modul repeat)
         if (!blkSetSingle.has(key) && !blkSetRepeatExpanded.has(key)) {
            next.add(ora.oraStart);
         }
      }
      setBlkSelectedSet(next);
   };

   const clearSelection = () => {
      setBlkSelectedSet(new Set());
      setBlkRemoveIds(new Set());
      setSelTimesDaily(new Set());
      const m = new Map();
      for (const d of [0, 1, 2, 3, 4, 5, 6]) m.set(d, new Set());
      setSelTimesWeekly(m);
   };

   const toggleRepeatDeleteBySlot = ({ pattern, dow, hhmm }) => {
      let ids = [];
      if (pattern === "daily") {
         ids = Array.from(dailyActiveMap.get(hhmm) || []);
      } else if (pattern === "weekly") {
         const mapForDay = weeklyActiveMap.get(dow) || new Map();
         ids = Array.from(mapForDay.get(hhmm) || []);
      }
      if (ids.length === 0) return;

      setBlkRemoveIds((prev) => {
         const next = new Set(prev);
         const allIn = ids.every((id) => next.has(id));
         if (allIn) ids.forEach((id) => next.delete(id));
         else ids.forEach((id) => next.add(id));
         return next;
      });
   };

   // === Build payload (ISO “raw”) ===
   const buildSelectedBlackoutsItems = () => {
      if (!editingId) return [];
      const items = [];

      // 1) SINGLE — creați noi (doar selecțiile din modul single)
      if (blkViewMode === "single" && blkDate && blkSelectedSet.size > 0) {
         const ymd = ymdFromLocalDate(blkDate);
         for (const hhmm of blkSelectedSet) {
            const isoRaw = toIsoUtcRaw(blkDate, hhmm);
            const key = `${ymd}|${hhmm}`;
            if (blkSetSingle.has(key) || blkSetRepeatExpanded.has(key))
               continue;

            items.push({
               instructorId: Number(editingId),
               type: "SINGLE",
               dateTime: isoRaw,
            });
         }
      }

      // 2) REPEAT (interval comun) — doar în modul repeat
      if (blkViewMode === "repeat") {
         const start0 = dateFromYmd(repeatStart || todayYmd());
         const end0 = dateFromYmd(repeatEnd || addDaysYmd(todayYmd(), 30));

         if (start0 <= end0) {
            // 2a) DAILY
            for (const hhmm of selTimesDaily) {
               if (hasDailyRepeatActiveAt(hhmm)) continue;

               const firstRaw = toIsoUtcRaw(start0, hhmm);
               const lastRaw = toIsoUtcRaw(end0, hhmm);

               items.push({
                  instructorId: Number(editingId),
                  type: "REPEAT",
                  dateTime: firstRaw,
                  startDateTime: firstRaw,
                  endDateTime: lastRaw,
                  repeatEveryDays: 1,
               });
            }

            // 2b) WEEKLY (NU permitem crearea pe sloturi acoperite de DAILY)
            for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
               const setForDay = selTimesWeekly.get(dow) || new Set();
               for (const hhmm of setForDay) {
                  if (hasWeeklyRepeatActiveAt(dow, hhmm)) continue;
                  if (hasDailyRepeatActiveAt(hhmm)) continue; // <— blocat de regim Zilnic

                  const first = (function firstDowOnOrAfter(
                     startDate,
                     targetDow
                  ) {
                     const d = new Date(startDate);
                     d.setHours(0, 0, 0, 0);
                     const curDow = serverDowFromLocalDate(d);
                     const diff = (targetDow - curDow + 7) % 7;
                     d.setDate(d.getDate() + diff);
                     return d;
                  })(start0, dow);

                  const last = (function lastDowOnOrBefore(endDate, targetDow) {
                     const dd = new Date(endDate);
                     dd.setHours(0, 0, 0, 0);
                     const curDow = serverDowFromLocalDate(dd);
                     const diff = (curDow - targetDow + 7) % 7;
                     dd.setDate(dd.getDate() - diff);
                     return dd;
                  })(end0, dow);

                  if (first > last) continue;

                  const firstRaw = toIsoUtcRaw(first, hhmm);
                  const lastRaw = toIsoUtcRaw(last, hhmm);

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
         }
      }

      return items;
   };

   /* === Detectare automată pe ziua curentă (Single) === */
   const inferDeactivatedExistingIdsForDay = () => {
      if (!blkDate) return [];
      const dateYmd = ymdFromLocalDate(blkDate);

      const existingToday = [];

      for (const b of blkExisting || []) {
         const type = String(b?.type || "").toUpperCase();

         if (type === "SINGLE") {
            const iso = getBlackoutDT(b);
            if (!iso) continue;
            const key = serverKeyFromIso(iso);
            if (key.split("|")[0] === dateYmd) {
               existingToday.push({
                  id: b.id,
                  kind: "SINGLE",
                  key,
                  hhmm: key.split("|")[1],
               });
            }
         } else if (type === "REPEAT") {
            const startIso = b.startDateTime || b.dateTime;
            const endIso = b.endDateTime || b.dateTime;
            if (!startIso || !endIso) continue;

            const hhmm = hhmmFromIso(startIso);
            const inRange = dateYmdWithinRange(dateYmd, startIso, endIso);
            if (!inRange) continue;

            if (Number(b.repeatEveryDays) === 1) {
               existingToday.push({
                  id: b.id,
                  kind: "REPEAT",
                  key: `${dateYmd}|${hhmm}`,
                  hhmm,
               });
            } else if (Number(b.repeatEveryDays) === 7) {
               const seriesDow = dowFromIsoUTC(startIso);
               const dayDow = serverDowFromLocalDate(blkDate);
               if (seriesDow === dayDow) {
                  existingToday.push({
                     id: b.id,
                     kind: "REPEAT",
                     key: `${dateYmd}|${hhmm}`,
                     hhmm,
                  });
               }
            }
         }
      }

      const afterActiveKeys = new Set();

      for (const item of existingToday) {
         if (!blkRemoveIds.has(item.id)) afterActiveKeys.add(item.key);
      }

      for (const hhmm of blkSelectedSet) {
         afterActiveKeys.add(`${dateYmd}|${hhmm}`);
      }

      const inDailyRange =
         repeatStart &&
         repeatEnd &&
         dateYmdWithinRange(
            dateYmd,
            toIsoUtcRawFromYmd(repeatStart, "00:00"),
            toIsoUtcRawFromYmd(repeatEnd, "23:59")
         );
      if (inDailyRange) {
         for (const hhmm of selTimesDaily) {
            afterActiveKeys.add(`${dateYmd}|${hhmm}`);
         }
      }

      if (inDailyRange) {
         const dow = serverDowFromLocalDate(blkDate);
         const setForDay = selTimesWeekly.get(dow) || new Set();
         for (const hhmm of setForDay) {
            afterActiveKeys.add(`${dateYmd}|${hhmm}`);
         }
      }

      const toDelete = [];
      for (const item of existingToday) {
         if (!afterActiveKeys.has(item.key)) {
            toDelete.push(item.id);
         }
      }

      return Array.from(new Set(toDelete));
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

   const handleSaveSchedule = async () => {
      setSaving(true);
      setEditPills([]);

      try {
         // 1) Ștergeri implicite doar în modul SINGLE
         const autoDeleteIds =
            blkViewMode === "single" ? inferDeactivatedExistingIdsForDay() : [];
         const blackoutItems = buildSelectedBlackoutsItems(); // SINGLE noi (în single) + REPEAT noi (în repeat)
         const baseDeleteIds = new Set([
            ...(blkRemoveIds || []),
            ...autoDeleteIds,
         ]);

         // 2) REPEAT are prioritate: calculează REPEAT-urile active după acest save
         const repeatKeysAfterSave = computeRepeatKeysAfterSave(blackoutItems);

         // 3) SINGLE-uri existente suprapuse cu REPEAT -> șterge-le
         const singlesToDelete = singlesOverlappedByRepeat(repeatKeysAfterSave);
         for (const id of singlesToDelete) baseDeleteIds.add(id);

         // 4) Nimic de salvat?
         if (baseDeleteIds.size === 0 && blackoutItems.length === 0) {
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

         // 5) Aplică ștergerile (ignoră 404 'not found' în caz de dublu-click / re-try)
         if (baseDeleteIds.size > 0) {
            const idsToDelete = Array.from(baseDeleteIds);
            await Promise.all(
               idsToDelete.map((id) =>
                  deleteInstructorBlackout(id).catch((e) => {
                     const msg =
                        e?.message ||
                        e?.toString?.() ||
                        JSON.stringify(e || {});
                     if (/not\s*found/i.test(msg)) return null; // ignorăm 404
                     throw e;
                  })
               )
            );
         }

         // 6) Creează noile blackouts
         if (blackoutItems.length > 0) {
            await addInstructorBlackouts(blackoutItems);
         }

         // 7) Refresh + RESET selecții vizuale după save
         await Promise.all([dispatch(fetchInstructors())]);
         if (editingId) {
            const list = await getInstructorBlackouts(editingId);
            setBlkExisting(Array.isArray(list) ? list : []);
         }
         // reset vizual
         setBlkSelectedSet(new Set());
         setBlkRemoveIds(new Set());
         setSelTimesDaily(new Set());
         const m = new Map();
         for (const d of [0, 1, 2, 3, 4, 5, 6]) m.set(d, new Set());
         setSelTimesWeekly(m);
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

   const handleMarkAllForDeletion = () => {
      const allIds = (blkExisting || []).map((b) => b.id).filter(Boolean);
      setBlkRemoveIds(new Set(allIds));
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

                                             {/* MODE TOGGLE Single/Repeat */}
                                             <div
                                                className="blackouts__modebar"
                                                style={{
                                                   display: "flex",
                                                   alignItems: "center",
                                                   gap: 6,
                                                }}
                                             >
                                                <ReactSVG
                                                   onClick={onToggleViewMode}
                                                   className="instructors-popup__edit-button react-icon"
                                                   src={
                                                      blkViewMode === "repeat"
                                                         ? repeatOnIcon
                                                         : repeatOffIcon
                                                   }
                                                   title={
                                                      blkViewMode === "repeat"
                                                         ? "Repetitiv activ"
                                                         : "Individual activ"
                                                   }
                                                   style={{
                                                      marginRight: "auto",
                                                   }}
                                                />

                                                {blkViewMode === "repeat" && (
                                                   <>
                                                      <button
                                                         type="button"
                                                         className={`instructors-popup__form-button instructors-popup__form-button--cancel ${
                                                            repeatPattern ===
                                                            "daily"
                                                               ? "active"
                                                               : ""
                                                         }`}
                                                         onClick={() =>
                                                            setRepeatPattern(
                                                               "daily"
                                                            )
                                                         }
                                                         title="Regim zilnic"
                                                      >
                                                         Zilnic
                                                      </button>
                                                      <button
                                                         type="button"
                                                         className={`instructors-popup__form-button instructors-popup__form-button--cancel ${
                                                            repeatPattern ===
                                                            "weekly"
                                                               ? "active"
                                                               : ""
                                                         }`}
                                                         onClick={() =>
                                                            setRepeatPattern(
                                                               "weekly"
                                                            )
                                                         }
                                                         title="Regim săptămânal"
                                                      >
                                                         Săptămânal
                                                      </button>
                                                   </>
                                                )}
                                             </div>

                                             {blkViewMode === "single" ? (
                                                <>
                                                   {/* SINGLE: calendar + grilă ore */}
                                                   <div
                                                      className="blackouts__grid"
                                                      style={{
                                                         background:
                                                            "var(--black-s)",
                                                      }}
                                                   >
                                                      <div className="blackouts__calendar">
                                                         <DatePicker
                                                            selected={blkDate}
                                                            onChange={(d) => {
                                                               if (!d) return;
                                                               d.setHours(
                                                                  0,
                                                                  0,
                                                                  0,
                                                                  0
                                                               );
                                                               setBlkDate(d);
                                                               clearSelection();
                                                            }}
                                                            inline
                                                            locale="ro"
                                                            formatWeekDay={(
                                                               name
                                                            ) =>
                                                               name
                                                                  .substring(
                                                                     0,
                                                                     2
                                                                  )
                                                                  .replace(
                                                                     /^./,
                                                                     (c) =>
                                                                        c.toUpperCase()
                                                                  )
                                                            }
                                                            calendarClassName="aAddProg__datepicker"
                                                         />
                                                      </div>

                                                      <div className="blackouts__times">
                                                         {oreDisponibile.map(
                                                            (ora) => {
                                                               const isoRaw =
                                                                  blkDate
                                                                     ? toIsoUtcRaw(
                                                                          blkDate,
                                                                          ora.oraStart
                                                                       )
                                                                     : null;
                                                               const key =
                                                                  isoRaw
                                                                     ? serverKeyFromIso(
                                                                          isoRaw
                                                                       )
                                                                     : null;

                                                               const isBlockedSingle =
                                                                  key
                                                                     ? blkSetSingle.has(
                                                                          key
                                                                       )
                                                                     : false;
                                                               const isBlockedRepeat =
                                                                  key
                                                                     ? blkSetRepeatExpanded.has(
                                                                          key
                                                                       )
                                                                     : false;

                                                               // SINGLE: stare de ștergere
                                                               const remId =
                                                                  isBlockedSingle &&
                                                                  key
                                                                     ? blkMapSingle.get(
                                                                          key
                                                                       )?.id
                                                                     : null;
                                                               const isRemovedSingle =
                                                                  isBlockedSingle &&
                                                                  remId
                                                                     ? blkRemoveIds.has(
                                                                          remId
                                                                       )
                                                                     : false;
                                                               const willStayBlockedSingle =
                                                                  isBlockedSingle &&
                                                                  !isRemovedSingle;

                                                               const isSelectedAdd =
                                                                  blkSelectedSet.has(
                                                                     ora.oraStart
                                                                  );

                                                               // în modul single nu arătăm REPEAT ca "selectat"
                                                               const isSelected =
                                                                  willStayBlockedSingle ||
                                                                  (!isRemovedSingle &&
                                                                     isSelectedAdd);

                                                               const disabled =
                                                                  !blkDate ||
                                                                  blkLoading ||
                                                                  isBlockedRepeat; // repeat editabil doar în modul repeat
                                                               const title =
                                                                  isBlockedRepeat
                                                                     ? "Slot acoperit de regim repetitiv. Editează în modul Repetitiv."
                                                                     : "Click pentru a alterna";

                                                               return (
                                                                  <button
                                                                     key={
                                                                        ora.eticheta
                                                                     }
                                                                     onClick={() =>
                                                                        !disabled &&
                                                                        toggleSingleGrid(
                                                                           ora.oraStart
                                                                        )
                                                                     }
                                                                     disabled={
                                                                        disabled
                                                                     }
                                                                     className={[
                                                                        "saddprogramari__time-btn",
                                                                        isSelected
                                                                           ? "saddprogramari__time-btn--selected"
                                                                           : "",
                                                                        isBlockedSingle &&
                                                                        isRemovedSingle
                                                                           ? "saddprogramari__time-btn--to-delete"
                                                                           : "",
                                                                        disabled
                                                                           ? "saddprogramari__time-btn--disabled"
                                                                           : "",
                                                                     ]
                                                                        .filter(
                                                                           Boolean
                                                                        )
                                                                        .join(
                                                                           " "
                                                                        )}
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
                                                   </div>

                                                   <div className="blackouts__actions">
                                                      <button
                                                         type="button"
                                                         className="instructors-popup__form-button"
                                                         onClick={
                                                            selectAllTimesForDay
                                                         }
                                                         disabled={
                                                            !blkDate ||
                                                            blkLoading
                                                         }
                                                      >
                                                         Selectează toate
                                                      </button>
                                                      <button
                                                         type="button"
                                                         className="instructors-popup__form-button"
                                                         onClick={
                                                            clearSelection
                                                         }
                                                         disabled={
                                                            (blkSelectedSet.size ===
                                                               0 &&
                                                               blkRemoveIds.size ===
                                                                  0) ||
                                                            blkLoading
                                                         }
                                                      >
                                                         Golește
                                                      </button>
                                                   </div>
                                                </>
                                             ) : (
                                                <>
                                                   {/* === REPETITIV: 2 input-uri native (Start/End) === */}
                                                   <div className="blackouts__row">
                                                      <input
                                                         type="date"
                                                         className="instructors-popup__input"
                                                         value={repeatStart}
                                                         min={todayYmd()}
                                                         onChange={(e) => {
                                                            const val =
                                                               e.target.value;
                                                            if (!val) return;
                                                            setRepeatStart(val);
                                                            if (
                                                               repeatEnd &&
                                                               val > repeatEnd
                                                            ) {
                                                               setRepeatEnd(
                                                                  val
                                                               );
                                                            }
                                                         }}
                                                         placeholder="Start"
                                                      />
                                                      <span>→</span>
                                                      <input
                                                         type="date"
                                                         className="instructors-popup__input"
                                                         value={repeatEnd}
                                                         min={
                                                            repeatStart ||
                                                            todayYmd()
                                                         }
                                                         onChange={(e) => {
                                                            const val =
                                                               e.target.value;
                                                            if (!val) return;
                                                            setRepeatEnd(val);
                                                         }}
                                                         placeholder="End"
                                                      />
                                                   </div>

                                                   {/* ZILNIC */}
                                                   {repeatPattern ===
                                                      "daily" && (
                                                      <div className="blackouts__times repeat">
                                                         {oreDisponibile.map(
                                                            (ora) => {
                                                               const activeSet =
                                                                  dailyActiveMap.get(
                                                                     ora.oraStart
                                                                  ) ||
                                                                  new Set();
                                                               const isActive =
                                                                  activeSet.size >
                                                                  0;
                                                               const allMarked =
                                                                  isActive &&
                                                                  [
                                                                     ...activeSet,
                                                                  ].every(
                                                                     (id) =>
                                                                        blkRemoveIds.has(
                                                                           id
                                                                        )
                                                                  );

                                                               const selectableForCreate =
                                                                  !hasDailyRepeatActiveAt(
                                                                     ora.oraStart
                                                                  );
                                                               const selectedForCreate =
                                                                  selTimesDaily.has(
                                                                     ora.oraStart
                                                                  );

                                                               return (
                                                                  <button
                                                                     key={
                                                                        ora.eticheta
                                                                     }
                                                                     className={[
                                                                        "saddprogramari__time-btn",
                                                                        // activ existent și NU e marcat pentru ștergere
                                                                        isActive &&
                                                                        !allMarked
                                                                           ? "saddprogramari__time-btn--selected"
                                                                           : "",
                                                                        // activ existent și e marcat pentru ștergere
                                                                        isActive &&
                                                                        allMarked
                                                                           ? "saddprogramari__time-btn--to-delete"
                                                                           : "",
                                                                        // creare nouă (când nu există deja)
                                                                        !isActive &&
                                                                        selectedForCreate
                                                                           ? "saddprogramari__time-btn--selected"
                                                                           : "",
                                                                     ]
                                                                        .filter(
                                                                           Boolean
                                                                        )
                                                                        .join(
                                                                           " "
                                                                        )}
                                                                     onClick={() => {
                                                                        if (
                                                                           isActive
                                                                        ) {
                                                                           toggleRepeatDeleteBySlot(
                                                                              {
                                                                                 pattern:
                                                                                    "daily",
                                                                                 hhmm: ora.oraStart,
                                                                              }
                                                                           );
                                                                        } else {
                                                                           if (
                                                                              !selectableForCreate
                                                                           )
                                                                              return;
                                                                           setSelTimesDaily(
                                                                              (
                                                                                 prev
                                                                              ) => {
                                                                                 const next =
                                                                                    new Set(
                                                                                       prev
                                                                                    );
                                                                                 if (
                                                                                    next.has(
                                                                                       ora.oraStart
                                                                                    )
                                                                                 )
                                                                                    next.delete(
                                                                                       ora.oraStart
                                                                                    );
                                                                                 else
                                                                                    next.add(
                                                                                       ora.oraStart
                                                                                    );
                                                                                 return next;
                                                                              }
                                                                           );
                                                                        }
                                                                     }}
                                                                     title={
                                                                        isActive
                                                                           ? "Marcază/demarchează pentru ștergere (multi-select)"
                                                                           : "Selectează pentru regim nou (zilnic)"
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
                                                   )}

                                                   {/* SĂPTĂMÂNAL — cu 7 butoane/taburi */}
                                                   {repeatPattern ===
                                                      "weekly" && (
                                                      <>
                                                         {/* Tab-uri zile */}
                                                         <div
                                                            className="blackouts__weekday-tabs"
                                                            style={{
                                                               display: "flex",
                                                               gap: 6,
                                                               flexWrap: "wrap",
                                                               justifyContent:
                                                                  "center",
                                                            }}
                                                         >
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
                                                                  className={`instructors-popup__form-button instructors-popup__form-button--cancel ${
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

                                                         {/* Ore pentru ziua selectată */}
                                                         {(() => {
                                                            const setForCreate =
                                                               selTimesWeekly.get(
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
                                                                           mapForDay.get(
                                                                              ora.oraStart
                                                                           ) ||
                                                                           new Set();
                                                                        const isWeeklyActive =
                                                                           activeIds.size >
                                                                           0;
                                                                        const allMarkedWeekly =
                                                                           isWeeklyActive &&
                                                                           [
                                                                              ...activeIds,
                                                                           ].every(
                                                                              (
                                                                                 id
                                                                              ) =>
                                                                                 blkRemoveIds.has(
                                                                                    id
                                                                                 )
                                                                           );

                                                                        const selectedForCreate =
                                                                           setForCreate.has(
                                                                              ora.oraStart
                                                                           );

                                                                        // NOU: slot acoperit de regim ZILNIC -> afișăm outline + dezactivat
                                                                        const coveredByDaily =
                                                                           hasDailyRepeatActiveAt(
                                                                              ora.oraStart
                                                                           );

                                                                        const disabled =
                                                                           blkLoading ||
                                                                           coveredByDaily;

                                                                        const title =
                                                                           coveredByDaily
                                                                              ? "Blocare din regim Zilnic (modifică în tab-ul Zilnic)."
                                                                              : isWeeklyActive
                                                                              ? "Marcază/demarchează pentru ștergere (doar seriile săptămânale)"
                                                                              : "Selectează pentru regim nou (săptămânal) în ziua curentă";

                                                                        const className =
                                                                           [
                                                                              "saddprogramari__time-btn",
                                                                              // activ săptămânal și NU e marcat pentru ștergere
                                                                              !coveredByDaily &&
                                                                              isWeeklyActive &&
                                                                              !allMarkedWeekly
                                                                                 ? "saddprogramari__time-btn--selected"
                                                                                 : "",
                                                                              // activ săptămânal și E marcat pentru ștergere
                                                                              !coveredByDaily &&
                                                                              isWeeklyActive &&
                                                                              allMarkedWeekly
                                                                                 ? "saddprogramari__time-btn--to-delete"
                                                                                 : "",
                                                                              // creare nouă (doar dacă nu e acoperit de zilnic)
                                                                              !coveredByDaily &&
                                                                              !isWeeklyActive &&
                                                                              selectedForCreate
                                                                                 ? "saddprogramari__time-btn--selected"
                                                                                 : "",
                                                                              coveredByDaily
                                                                                 ? "saddprogramari__time-btn--outline-daily"
                                                                                 : "",
                                                                              disabled
                                                                                 ? "saddprogramari__time-btn--disabled"
                                                                                 : "",
                                                                           ]
                                                                              .filter(
                                                                                 Boolean
                                                                              )
                                                                              .join(
                                                                                 " "
                                                                              );

                                                                        return (
                                                                           <button
                                                                              key={
                                                                                 ora.eticheta
                                                                              }
                                                                              className={
                                                                                 className
                                                                              }
                                                                              onClick={() => {
                                                                                 if (
                                                                                    disabled
                                                                                 )
                                                                                    return;
                                                                                 if (
                                                                                    isWeeklyActive
                                                                                 ) {
                                                                                    toggleRepeatDeleteBySlot(
                                                                                       {
                                                                                          pattern:
                                                                                             "weekly",
                                                                                          dow: weeklyDay,
                                                                                          hhmm: ora.oraStart,
                                                                                       }
                                                                                    );
                                                                                 } else {
                                                                                    setSelTimesWeekly(
                                                                                       (
                                                                                          prev
                                                                                       ) => {
                                                                                          const next =
                                                                                             new Map(
                                                                                                prev
                                                                                             );
                                                                                          const cur =
                                                                                             new Set(
                                                                                                next.get(
                                                                                                   weeklyDay
                                                                                                ) ||
                                                                                                   []
                                                                                             );
                                                                                          if (
                                                                                             cur.has(
                                                                                                ora.oraStart
                                                                                             )
                                                                                          )
                                                                                             cur.delete(
                                                                                                ora.oraStart
                                                                                             );
                                                                                          else
                                                                                             cur.add(
                                                                                                ora.oraStart
                                                                                             );
                                                                                          next.set(
                                                                                             weeklyDay,
                                                                                             cur
                                                                                          );
                                                                                          return next;
                                                                                       }
                                                                                    );
                                                                                 }
                                                                              }}
                                                                              disabled={
                                                                                 disabled
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
                                                </>
                                             )}

                                             <div className="instructors-popup__btns">
                                                <button
                                                   className="instructors-popup__form-button instructors-popup__form-button--save"
                                                   onClick={handleSaveSchedule}
                                                   disabled={saving}
                                                >
                                                   {saving
                                                      ? "Se salvează..."
                                                      : blkRemoveIds.size > 0
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
                                                // reset orar
                                                setBlkDate(todayAt00());
                                                setBlkSelectedSet(new Set());
                                                setBlkRemoveIds(new Set());
                                                setEditPills([]);
                                                setBlkViewMode("single");
                                                setRepeatPattern("daily");
                                                setRepeatStart(todayYmd());
                                                setRepeatEnd(
                                                   addDaysYmd(todayYmd(), 30)
                                                );
                                                setSelTimesDaily(new Set());
                                                const m = new Map();
                                                for (const d of [
                                                   0, 1, 2, 3, 4, 5, 6,
                                                ])
                                                   m.set(d, new Set());
                                                setSelTimesWeekly(m);
                                                setWeeklyDay(1);
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
                                                // reset orar
                                                setBlkDate(todayAt00());
                                                setBlkSelectedSet(new Set());
                                                setBlkRemoveIds(new Set());
                                                setEditPills([]);
                                                setBlkViewMode("single");
                                                setRepeatPattern("daily");
                                                setRepeatStart(todayYmd());
                                                setRepeatEnd(
                                                   addDaysYmd(todayYmd(), 30)
                                                );
                                                setSelTimesDaily(new Set());
                                                const m = new Map();
                                                for (const d of [
                                                   0, 1, 2, 3, 4, 5, 6,
                                                ])
                                                   m.set(d, new Set());
                                                setSelTimesWeekly(m);
                                                setWeeklyDay(1);
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
