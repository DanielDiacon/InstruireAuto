// src/components/Popups/OldSAddProg.jsx
import React, { useState, useContext, useEffect, useMemo } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ro from "date-fns/locale/ro";
import addIcon from "../../assets/svg/add.svg";
import arrowIcon from "../../assets/svg/arrow.svg";
import trashIcon from "../../assets/svg/trash.svg";
import { ReactSVG } from "react-svg";
import {
   createReservations,
   getBusyForInstructor,
   getBusyForInstructorsGroup,
} from "../../api/reservationsService";
import {
   getInstructorBlackouts,
   getInstructorsGroupBlackouts,
} from "../../api/instructorsService";
import { UserContext } from "../../UserContext";
import { useDispatch, useSelector } from "react-redux";
import {
   fetchUserReservations,
   fetchBusy,
} from "../../store/reservationsSlice";
import AlertPills from "../Utils/AlertPills";
import { closePopup as closePopupStore } from "../Utils/popupStore";

/* ===== Locale RO ===== */
registerLocale("ro", ro);

/* ============================================================================
   TIMEZONE: totul pe ora Moldovei (Europe/Chisinau) pentru UI și ocupare
   IMPORTANT pentru compatibilitate:
   - BUSY_KEYS_MODE = 'local-match'  -> backend salvează „ora locală” prin hack
   - BUSY_KEYS_MODE = 'utc'          -> backend salvează momentul corect UTC
============================================================================ */
const MOLDOVA_TZ = "Europe/Chisinau";
const BUSY_KEYS_MODE = "local-match"; // <- pune 'utc' dacă trimiți UTC real

/** 'YYYY-MM-DD' calculat în TZ dat */
function localDateStrTZ(date, tz = MOLDOVA_TZ) {
   const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
   });
   const parts = fmt.formatToParts(date);
   const day = parts.find((p) => p.type === "day")?.value ?? "01";
   const month = parts.find((p) => p.type === "month")?.value ?? "01";
   const year = parts.find((p) => p.type === "year")?.value ?? "1970";
   return `${year}-${month}-${day}`;
}

/** 'HH:mm' pentru un ISO, afișat în TZ dat */
function timeHHMMInTZ(iso, tz = MOLDOVA_TZ) {
   const d = new Date(iso);
   const fmt = new Intl.DateTimeFormat("ro-RO", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
   });
   return fmt.format(d);
}

function tzOffsetMinutesAt(tsMs, timeZone = MOLDOVA_TZ) {
   const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
   });
   const p = fmt.formatToParts(new Date(tsMs));
   const y = +p.find((x) => x.type === "year").value;
   const m = +p.find((x) => x.type === "month").value;
   const d = +p.find((x) => x.type === "day").value;
   const H = +p.find((x) => x.type === "hour").value;
   const M = +p.find((x) => x.type === "minute").value;
   const S = +p.find((x) => x.type === "second").value;
   const asUTC = Date.UTC(y, m - 1, d, H, M, S);
   return (asUTC - tsMs) / 60000;
}

/** Moldova (zi + "HH:mm") -> ISO UTC (…Z), stabil la DST */
function toUtcIsoFromMoldova(localDateObj, timeStrHHMM) {
   const [hh, mm] = (timeStrHHMM || "00:00").split(":").map(Number);
   const utcGuess = Date.UTC(
      localDateObj.getFullYear(),
      localDateObj.getMonth(),
      localDateObj.getDate(),
      hh,
      mm,
      0,
      0
   );
   const offMin = tzOffsetMinutesAt(utcGuess, MOLDOVA_TZ);
   const fixedUtcMs = utcGuess - offMin * 60000;
   return new Date(fixedUtcMs).toISOString();
}

/** HACK: construiește "YYYY-MM-DDTHH:mm:+02/+03" care devine 07:00Z în DB */
function isoForDbMatchLocalHour(isoUtcFromMoldova) {
   const base = new Date(isoUtcFromMoldova);
   const offMin = tzOffsetMinutesAt(base.getTime(), MOLDOVA_TZ);
   const shifted = new Date(base.getTime() + offMin * 60000);

   const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: MOLDOVA_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
   }).formatToParts(shifted);

   const Y = parts.find((p) => p.type === "year").value;
   const Mo = parts.find((p) => p.type === "month").value;
   const Da = parts.find((p) => p.type === "day").value;
   const HH = parts.find((p) => p.type === "hour").value;
   const MM = parts.find((p) => p.type === "minute").value;

   const offMin2 = tzOffsetMinutesAt(shifted.getTime(), MOLDOVA_TZ);
   const sign = offMin2 >= 0 ? "+" : "-";
   const abs = Math.abs(offMin2);
   const offHH = String(Math.floor(abs / 60)).padStart(2, "0");
   const offMM = String(abs % 60).padStart(2, "0");

   return `${Y}-${Mo}-${Da}T${HH}:${MM}:00${sign}${offHH}:${offMM}`;
}

/* ————— Utilitare simple ————— */
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
const SLOT_LABELS = new Set(oreDisponibile.map((o) => o.oraStart));

const SLOT_MINUTES = 90;
const capRO = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const localDateStr = (d) => localDateStrTZ(d, MOLDOVA_TZ);

const formatDateRO = (iso) => {
   const d = new Date(iso);
   const str = d.toLocaleDateString("ro-RO", {
      timeZone: MOLDOVA_TZ,
      day: "2-digit",
      month: "short",
      year: "numeric",
   });
   return capRO(str);
};
const formatTimeRO = (iso) => {
   const d = new Date(iso);
   return d.toLocaleTimeString("ro-RO", {
      timeZone: MOLDOVA_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
   });
};

const asStr = (v) => (v == null ? "" : String(v));
const asStrLower = (v) => asStr(v).trim().toLowerCase();
const addDays = (d, n) => {
   const x = new Date(d);
   x.setDate(x.getDate() + n);
   return x;
};
const nextNDays = (n, fromDate = new Date()) => {
   const out = [];
   const base = new Date(
      fromDate.getFullYear(),
      fromDate.getMonth(),
      fromDate.getDate(),
      0,
      0,
      0,
      0
   );
   for (let i = 0; i < n; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      out.push(localDateStr(d)); // în Moldova
   }
   return out;
};

/** Date local (00:00) din "YYYY-MM-DD" pentru Moldova */
const localDateObjFromStr = (s) => {
   const [y, m, d] = s.split("-").map(Number);
   return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
};

/* === Chei locale pentru ocupare (fără decalaj) ============================ */
function localKeyFromTs(tsMs, tz = MOLDOVA_TZ) {
   const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
   });
   const parts = fmt.formatToParts(new Date(tsMs));
   const Y = parts.find((p) => p.type === "year").value;
   const Mo = parts.find((p) => p.type === "month").value;
   const Da = parts.find((p) => p.type === "day").value;
   const HH = parts.find((p) => p.type === "hour").value;
   const MM = parts.find((p) => p.type === "minute").value;
   return `${Y}-${Mo}-${Da}|${HH}:${MM}`;
}
const localKeyForIso = (iso) =>
   localKeyFromTs(new Date(iso).getTime(), MOLDOVA_TZ);
const localKeyForDateAndTime = (localDateObj, hhmm) =>
   `${localDateStr(localDateObj)}|${hhmm}`;

/** Derivă cheia locală din ceea ce vine din DB pentru BUSY */
function busyLocalKeyFromStored(st) {
   const d = new Date(st);
   if (BUSY_KEYS_MODE === "local-match") {
      const offMin = tzOffsetMinutesAt(d.getTime(), MOLDOVA_TZ);
      const base = new Date(d.getTime() - offMin * 60000);
      const key = localKeyFromTs(base.getTime(), MOLDOVA_TZ);
      const hhmm = key.slice(-5);
      if (SLOT_LABELS.has(hhmm)) return key;
      return localKeyFromTs(d.getTime(), MOLDOVA_TZ);
   }
   return localKeyFromTs(d.getTime(), MOLDOVA_TZ);
}

/* ——— Extractoare diverse ——— */
const getStartFromReservation = (r) =>
   r?.startTime ??
   r?.start ??
   r?.start_time ??
   r?.dateTime ??
   r?.datetime ??
   r?.date ??
   r?.begin ??
   null;

const getDurationMin = (r) =>
   r?.durationMinutes ??
   r?.slotMinutes ??
   r?.lengthMinutes ??
   r?.duration ??
   SLOT_MINUTES;

const getEndFromReservation = (r) => {
   const st = getStartFromReservation(r);
   if (!st) return null;
   const start = new Date(st);
   const end = new Date(start.getTime() + getDurationMin(r) * 60000);
   return end.toISOString();
};

/** blackout: câmpuri pentru data/ora */
const getBlackoutDT = (b) => {
   if (typeof b === "string") return b;
   const t = String(b?.type || "").toUpperCase();
   if (t === "REPEAT") {
      return b?.startDateTime || b?.dateTime || b?.datetime || null;
   }
   return (
      b?.dateTime ?? b?.startTime ?? b?.start ?? b?.datetime ?? b?.date ?? null
   );
};

/** grilă completă (ISO corect), dar vom folosi „chei locale” pentru busy/free */
function buildFullGridISO(daysWindow = 120) {
   const startFrom = addDays(new Date(), 1);
   const daysArr = nextNDays(daysWindow, startFrom); // "YYYY-MM-DD" în Moldova
   const out = [];
   for (const day of daysArr) {
      const dObj = localDateObjFromStr(day);
      for (const t of oreDisponibile) {
         out.push(toUtcIsoFromMoldova(dObj, t.oraStart));
      }
   }
   return out;
}
const uniq = (arr) => Array.from(new Set(arr));

/* ===== Helpers „ancoră dominantă” (după ultimele 15 rezervări) ===== */
const keyForReservation = (r) => {
   const gid = r?.instructorsGroupId ?? r?.groupId ?? r?.group?.id ?? null;
   const iid =
      r?.instructorId ??
      r?.instructor?.id ??
      null;
   if (gid != null) return { type: "group", id: String(gid) };
   if (iid != null) return { type: "instructor", id: String(iid) };
   return { type: null, id: null };
};

function findDominantAnchor(resList = []) {
   const withStart = (resList || [])
      .map((r) => ({ r, st: getStartFromReservation(r) }))
      .filter((x) => !!x.st)
      .map((x) => ({ ...x, iso: new Date(x.st).toISOString() }))
      .sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0));

   const recent = withStart.slice(0, 15);
   const n = recent.length;
   if (n === 0) return null;

   const counts = new Map();
   const keyFor = (r) => {
      const gid = r?.instructorsGroupId ?? r?.groupId ?? r?.group?.id ?? null;
      const iid =
         r?.instructorId ??
         r?.instructor?.id ??
         null;
      if (gid != null) return { type: "group", id: String(gid) };
      if (iid != null) return { type: "instructor", id: String(iid) };
      return { type: null, id: null };
   };

   for (const { r } of recent) {
      const k = keyFor(r);
      if (!k.type || !k.id) continue;
      const key = `${k.type}:${k.id}`;
      const cur = counts.get(key) || { ...k, count: 0, sample: r };
      cur.count += 1;
      if (!counts.has(key)) cur.sample = r;
      counts.set(key, cur);
   }

   if (counts.size === 0) return null;

   let best = null;
   for (const v of counts.values()) if (!best || v.count > best.count) best = v;
   const majority = best.count > Math.floor(n / 2);

   let chosen = best;
   if (!majority) {
      const first = recent[0]?.r;
      const fk = first ? keyFor(first) : null;
      if (fk?.type && fk?.id) {
         const key = `${fk.type}:${fk.id}`;
         chosen = counts.get(key) || { ...fk, count: 1, sample: first };
      }
   }

   const same = chosen.sample;
   const sectorRaw = same?.sector ?? "Botanica";
   const sector =
      String(sectorRaw).toLowerCase() === "ciocana" ? "Ciocana" : "Botanica";
   const gearboxRaw = same?.gearbox ?? "Manual";
   const gearbox = String(gearboxRaw).toLowerCase().includes("auto")
      ? "automat"
      : "manual";

   return {
      tip: chosen.type === "group" ? "group" : "single",
      entityId: chosen.id,
      sector,
      gearbox,
   };
}

/* ===================== BLACKOUTS: REPEAT expander ======================= */
function expandRepeatLocalKeys(blackout, allowedKeysSet) {
   const out = [];
   const t = String(blackout?.type || "").toUpperCase();
   if (t !== "REPEAT") return out;

   const stepDays = Math.max(1, Number(blackout?.repeatEveryDays || 1));
   const first = blackout?.startDateTime || blackout?.dateTime;
   const last = blackout?.endDateTime || first;
   if (!first || !last) return out;

   let cur = new Date(first).getTime();
   const lastMs = new Date(last).getTime();
   while (cur <= lastMs) {
      const key = busyLocalKeyFromStored(new Date(cur).toISOString());
      if (!allowedKeysSet || allowedKeysSet.has(key)) out.push(key);
      cur += stepDays * 24 * 60 * 60 * 1000;
   }
   return out;
}

/* ===================== Busy map pe SET-uri de instructori ================== */
async function mergeBlackoutsIntoStartSets(
   entityType,
   entityId,
   startBusyLocal,
   allowedKeysSet,
   allInstructorIdsSet
) {
   const map = new Map(startBusyLocal);
   try {
      const blacks =
         entityType === "group"
            ? await getInstructorsGroupBlackouts(entityId)
            : await getInstructorBlackouts(entityId);

      const items = Array.isArray(blacks)
         ? blacks
         : Array.isArray(blacks?.items)
         ? blacks.items
         : [];

      for (const b of items) {
         const t = String(b?.type || "").toUpperCase();
         const instructId =
            b?.instructorId ??
            b?.instructor?.id ??
            null;

         if (t === "REPEAT") {
            const keys = expandRepeatLocalKeys(b, allowedKeysSet);
            for (const key of keys) {
               const set = map.get(key) || new Set();
               if (entityType === "group") {
                  if (instructId != null) set.add(Number(instructId));
                  else set.add("__ALL__");
               } else {
                  set.add(Number(instructId ?? entityId));
               }
               map.set(key, set);
            }
         } else {
            const dt = getBlackoutDT(b);
            if (!dt) continue;
            const key = busyLocalKeyFromStored(dt);
            if (allowedKeysSet && !allowedKeysSet.has(key)) continue;

            const set = map.get(key) || new Set();
            if (entityType === "group") {
               if (instructId != null) set.add(Number(instructId));
               else set.add("__ALL__");
            } else {
               set.add(Number(instructId ?? entityId));
            }
            map.set(key, set);
         }
      }
   } catch {
      // dacă endpoint-ul pică, rămânem doar cu rezervările
   }
   return map;
}

async function fetchBusyForEntity(entityType, entityId, allowedKeysSet) {
   if (!entityType || !entityId) {
      return {
         startBusyLocal: new Map(),
         capacity: 1,
         allInstructorIdsSet: new Set(),
      };
   }

   // Busy din rezervări
   const raw =
      entityType === "group"
         ? await getBusyForInstructorsGroup(entityId)
         : await getBusyForInstructor(entityId);

   const items = Array.isArray(raw) ? raw : [raw];
   const startBusyLocal = new Map();
   const allInstructorIdsSet = new Set();

   for (const item of items) {
      const reservations = Array.isArray(item?.reservations)
         ? item.reservations
         : [];

      if (Array.isArray(item?.instructorsIds)) {
         for (const iid of item.instructorsIds) {
            if (iid != null) allInstructorIdsSet.add(Number(iid));
         }
      }

      for (const r of reservations) {
         const st = getStartFromReservation(r);
         if (!st) continue;
         const key = busyLocalKeyFromStored(st);
         if (allowedKeysSet && !allowedKeysSet.has(key)) continue;

         const set = startBusyLocal.get(key) || new Set();
         const rInstr =
            r?.instructorId ??
            r?.instructor?.id ??
            (entityType === "instructor" ? Number(entityId) : null);

         if (rInstr != null) set.add(Number(rInstr));
         startBusyLocal.set(key, set);
      }
   }

   let capacity = 1;
   if (entityType === "group") {
      const capCandidates = [
         allInstructorIdsSet.size,
         Number(raw?.instructorsIds?.length ?? 0),
         Number(raw?.total_instructors),
         Number(raw?.total_instrucors),
         Number(raw?.totalInstructors),
         Number(raw?.instructorsCount),
         Number(raw?.capacity),
      ].filter((x) => Number.isFinite(x) && x > 0);
      capacity = Math.max(1, ...(capCandidates.length ? capCandidates : [1]));
   }

   const merged = await mergeBlackoutsIntoStartSets(
      entityType,
      entityId,
      startBusyLocal,
      allowedKeysSet,
      allInstructorIdsSet
   );

   return { startBusyLocal: merged, capacity, allInstructorIdsSet };
}

// verificare strictă „ACEEAȘI ORĂ” pe CHEIE LOCALĂ cu seturi de instructori
function isStartFullLocal(isoStart, startBusyLocal, capacity = 1) {
   const key = localKeyForIso(isoStart);
   const set = startBusyLocal?.get(key);
   if (!set || set.size === 0) return false;
   if (set.has("__ALL__")) return true;
   const used = set.size;
   return used >= capacity;
}

/**
 * Calculează disponibilitatea cu regula cerută:
 * - o oră este blocată dacă \#instructori ocupați (rezervări + single + repeat)
 *   >= capacitate (numărul de instructori selectați în grup)
 * - o zi este blocată dacă TOATE orele din acea zi sunt blocate
 */
function calcAvailability({
   fullGrid,
   startBusyLocal,
   capacity,
   userBookedDaySet,
}) {
   const free = [];
   const freeHoursByDay = new Map(); // day -> Set("HH:mm")
   const blockedHoursByDay = new Map(); // day -> Set("HH:mm")

   for (const iso of fullGrid) {
      const key = localKeyForIso(iso); // YYYY-MM-DD|HH:mm (în Moldova)
      const [day, hhmm] = key.split("|");

      // dacă utilizatorul are deja o lecție în ziua asta, o tratăm ca indisponibilă
      if (userBookedDaySet?.has(day)) {
         const b = blockedHoursByDay.get(day) || new Set();
         b.add(hhmm);
         blockedHoursByDay.set(day, b);
         continue;
      }

      const set = startBusyLocal.get(key);
      const used = !set ? 0 : set.has("__ALL__") ? capacity : set.size;
      const atCap = used >= capacity;

      if (!atCap) {
         free.push(iso);
         const f = freeHoursByDay.get(day) || new Set();
         f.add(hhmm);
         freeHoursByDay.set(day, f);
      } else {
         const b = blockedHoursByDay.get(day) || new Set();
         b.add(hhmm);
         blockedHoursByDay.set(day, b);
      }
   }

   const dayFullyBlocked = new Set();
   for (const [day, bset] of blockedHoursByDay.entries()) {
      if ((bset?.size || 0) >= oreDisponibile.length) dayFullyBlocked.add(day);
   }

   return { free, freeHoursByDay, dayFullyBlocked };
}

/* ————— Componentă ————— */
export default function OldSAddProg({ onClose }) {
   /* ALERT PILLS */
   const [messages, setMessages] = useState([]);
   const [debugArmed, setDebugArmed] = useState(false);
   const notify = (type, text, { force = false } = {}) => {
      if (!force && !debugArmed) return;
      setMessages((prev) => [
         ...prev,
         { id: `${Date.now()}-${Math.random()}`, type, text },
      ]);
   };
   const dismissLast = () => setMessages((prev) => prev.slice(0, -1));

   // ✅ Fallback sigur pentru închiderea popup-ului
   const safeClose = React.useCallback(() => {
      if (typeof onClose === "function") onClose();
      else closePopupStore();
   }, [onClose]);

   /* Etapa 1: opțiuni */
   const [numarLectii, setNumarLectii] = useState(15);
   const [cutie, setCutie] = useState("manual");
   const [sector, setSector] = useState("Botanica");
   const [tip, setTip] = useState("group");
   const WINDOW_DAYS = 120;
   const [anchor, setAnchor] = useState(null);
   const [hardLock30, setHardLock30] = useState(false);

   useEffect(() => {
      if (sector === "Ciocana" && tip !== "single") setTip("single");
   }, [sector, tip]);

   /* Etapa 2 */
   const [stage, setStage] = useState("setup"); // setup | pick
   const [assignedGroupId, setAssignedGroupId] = useState(null);
   const [assignedInstructorId, setAssignedInstructorId] = useState(null);
   const [freeSlotsForAssigned, setFreeSlotsForAssigned] = useState([]); // ISO UTC[]
   const [selectedDates, setSelectedDates] = useState([]); // ISO UTC[]
   const [rejectedDates, setRejectedDates] = useState([]); // ISO UTC[]
   const [loading, setLoading] = useState(false);
   const [initLoading, setInitLoading] = useState(true);
   const [showList, setShowList] = useState(false);
   const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
   const makeKey = (iso, idx) => `${iso}__${idx}`;

   // 👇 nou: hărți pentru logică de blocare pe zi/oră
   const [dayFullyBlocked, setDayFullyBlocked] = useState(new Set()); // Set("YYYY-MM-DD")
   const [freeHoursByDay, setFreeHoursByDay] = useState(new Map()); // Map(day -> Set("HH:mm"))

   const [data, setData] = useState(null);
   const [oraSelectata, setOraSelectata] = useState(null);
   const [lectiiExistente, setLectiiExistente] = useState(0);

   const { user } = useContext(UserContext);
   const dispatch = useDispatch();
   const { list: rezervariExistente, busyLoading } = useSelector(
      (s) => s.reservations
   );

   const dropFromFreeSlots = React.useCallback((isos) => {
      if (!Array.isArray(isos) || !isos.length) return;
      const toDrop = new Set(isos.map((x) => new Date(x).toISOString()));
      setFreeSlotsForAssigned((prev) =>
         prev.filter((iso) => !toDrop.has(new Date(iso).toISOString()))
      );
   }, []);

   /* ——— Sets bazate pe CHEI LOCALE ——— */
   const freeLocalKeySet = useMemo(
      () => new Set(freeSlotsForAssigned.map((iso) => localKeyForIso(iso))),
      [freeSlotsForAssigned]
   );
   const selectedLocalKeySet = useMemo(
      () => new Set(selectedDates.map((iso) => localKeyForIso(iso))),
      [selectedDates]
   );

   // derivăm rapid harta (număr) de ore libere per zi din freeHoursByDay
   const freeByDay = useMemo(() => {
      const map = new Map();
      for (const [day, set] of freeHoursByDay.entries()) map.set(day, set.size);
      return map;
   }, [freeHoursByDay]);

   const dayLocal = data ? localDateStr(data) : null;

   const freeTimesForDay = useMemo(() => {
      if (!data) return new Set();
      // folosim harta calculată (mai sigur decât derivarea din freeLocalKeySet)
      return new Set(freeHoursByDay.get(localDateStr(data)) || []);
   }, [data, freeHoursByDay]);

   const selectedTimesForDay = useMemo(() => {
      if (!data) return new Set();
      const set = new Set();
      for (const o of oreDisponibile) {
         const key = localKeyForDateAndTime(data, o.oraStart);
         if (selectedLocalKeySet.has(key)) set.add(o.oraStart);
      }
      return set;
   }, [data, selectedLocalKeySet]);

   /* La montare: istoric + „ancoră” */
   useEffect(() => {
      let alive = true;
      (async () => {
         try {
            if (!user?.id) return;

            const existing = await dispatch(fetchUserReservations(user.id))
               .unwrap()
               .catch(() => []);
            if (!alive) return;

            const count = existing?.length || 0;
            setLectiiExistente(count);

            if (count >= 30) {
               setHardLock30(true);
               setStage("setup");
               return;
            }

            const dom = findDominantAnchor(existing);
            if (dom) {
               setAnchor(dom);
               if (dom.tip === "group") {
                  setAssignedGroupId(String(dom.entityId));
                  setAssignedInstructorId(null);
               } else {
                  setAssignedInstructorId(String(dom.entityId));
                  setAssignedGroupId(null);
               }

               const fullGrid = buildFullGridISO(WINDOW_DAYS);
               const allowedKeys = new Set(
                  fullGrid.map((iso) => localKeyForIso(iso))
               );

               const userBookedDaySet = new Set();
               for (const r of existing || []) {
                  const st = getStartFromReservation(r);
                  if (st) userBookedDaySet.add(localDateStr(new Date(st)));
               }
               for (const iso of selectedDates) {
                  userBookedDaySet.add(localDateStr(new Date(iso)));
               }

               const { startBusyLocal, capacity } = await fetchBusyForEntity(
                  dom.tip,
                  dom.entityId,
                  allowedKeys
               );

               const { free, freeHoursByDay, dayFullyBlocked } =
                  calcAvailability({
                     fullGrid,
                     startBusyLocal,
                     capacity,
                     userBookedDaySet,
                  });

               setFreeSlotsForAssigned(free);
               setFreeHoursByDay(freeHoursByDay);
               setDayFullyBlocked(dayFullyBlocked);
               setStage("pick");
            } else {
               setStage("setup");
               setAnchor(null);
            }
         } finally {
            if (alive) setInitLoading(false);
         }
      })();
      return () => {
         alive = false;
      };
   }, [user?.id, dispatch]); // eslint-disable-line

   // reset UI dacă nu avem ancoră
   useEffect(() => {
      if (anchor) return;
      setStage("setup");
      setAssignedGroupId(null);
      setAssignedInstructorId(null);
      setFreeSlotsForAssigned([]);
      setSelectedDates([]);
      setRejectedDates([]);
      setData(null);
      setOraSelectata(null);
      setShowList(false);
      setFreeHoursByDay(new Map());
      setDayFullyBlocked(new Set());
   }, [sector, anchor]);

   useEffect(() => {
      if (!showList) setConfirmDeleteKey(null);
   }, [showList]);

   const isLocked = !!anchor;

   /* === Limite === */
   const remainingTo30 = useMemo(
      () => Math.max(0, 30 - lectiiExistente),
      [lectiiExistente]
   );
   const requiredSubmitCount = useMemo(
      () => Math.min(numarLectii, remainingTo30),
      [numarLectii, remainingTo30]
   );
   const reachedMax30 = useMemo(
      () => lectiiExistente + selectedDates.length >= 30,
      [lectiiExistente, selectedDates.length]
   );
   const reachedPackLimit = useMemo(
      () => selectedDates.length >= requiredSubmitCount,
      [requiredSubmitCount, selectedDates.length]
   );

   const bookedDaySet = useMemo(() => {
      const set = new Set();
      for (const iso of selectedDates) set.add(localDateStr(new Date(iso)));
      for (const r of rezervariExistente || []) {
         const st = getStartFromReservation(r);
         if (st) set.add(localDateStr(new Date(st)));
      }
      return set;
   }, [selectedDates, rezervariExistente]);

   const handleClickContinue = async () => {
      setDebugArmed(true);
      await continuaEtapa2();
   };

   /** încarcă grila liberă pe baza cheilor locale */
   const continuaEtapa2 = async () => {
      if (hardLock30 || lectiiExistente >= 30) {
         notify("warn", "Ai deja 30 de lecții programate.");
         return;
      }
      setLoading(true);
      try {
         // ← prima (și singura) declarare
         const fullGrid = buildFullGridISO(WINDOW_DAYS);
         const allowedKeys = new Set(
            fullGrid.map((iso) => localKeyForIso(iso))
         );

         const userBookedDaySet = new Set();
         for (const r of rezervariExistente || []) {
            const st = getStartFromReservation(r);
            if (st) userBookedDaySet.add(localDateStr(new Date(st)));
         }
         for (const iso of selectedDates) {
            userBookedDaySet.add(localDateStr(new Date(iso)));
         }

         if (anchor?.tip && anchor?.entityId) {
            const { startBusyLocal, capacity } = await fetchBusyForEntity(
               anchor.tip,
               anchor.entityId,
               allowedKeys
            );
            const { free, freeHoursByDay, dayFullyBlocked } = calcAvailability({
               fullGrid,
               startBusyLocal,
               capacity,
               userBookedDaySet,
            });

            if (!free.length) {
               notify("warn", "Nu există sloturi libere pentru entitatea ta.");
               return;
            }
            if (anchor.tip === "group") {
               setAssignedGroupId(String(anchor.entityId));
               setAssignedInstructorId(null);
            } else {
               setAssignedInstructorId(String(anchor.entityId));
               setAssignedGroupId(null);
            }
            setFreeSlotsForAssigned(free);
            setFreeHoursByDay(freeHoursByDay);
            setDayFullyBlocked(dayFullyBlocked);
            setStage("pick");
            setShowList(false);
            return;
         }

         const query = {
            days: asStr(numarLectii),
            gearbox: asStrLower(cutie),
            sector: asStrLower(sector),
            type: asStrLower(tip),
         };
         const res = await dispatch(fetchBusy(query)).unwrap();

         // ——— Normalizăm candidații ———
         const normalizeBusy = (raw) => {
            const out = [];
            const pushVariant = (
               entityType,
               entityId,
               reservations,
               instructorsIds
            ) => {
               const startBusyLocal = new Map();
               const allIds = new Set(
                  Array.isArray(instructorsIds)
                     ? instructorsIds
                          .filter((x) => x != null)
                          .map((x) => Number(x))
                     : []
               );

               for (const r of reservations || []) {
                  const st = getStartFromReservation(r);
                  if (!st) continue;
                  const key = busyLocalKeyFromStored(st);
                  if (allowedKeys.size && !allowedKeys.has(key)) continue;
                  const set = startBusyLocal.get(key) || new Set();
                  const rInstr =
                     r?.instructorId ??
                     r?.instructor?.id ??
                     (entityType === "instructor" ? Number(entityId) : null);
                  if (rInstr != null) set.add(Number(rInstr));
                  startBusyLocal.set(key, set);
               }

               const capacity =
                  entityType === "group" ? Math.max(1, allIds.size) : 1;

               out.push({
                  entityType,
                  entityId: entityId != null ? String(entityId) : null,
                  startBusyLocal,
                  capacity,
                  allInstructorIdsSet: allIds,
               });
            };

            const list = Array.isArray(raw)
               ? raw
               : raw &&
                 (Array.isArray(raw.reservations) ||
                    raw.groupId != null ||
                    raw.instructorId != null ||
                    Array.isArray(raw.instructorsIds))
               ? [raw]
               : [];

            for (const item of list) {
               const reservations = Array.isArray(item?.reservations)
                  ? item.reservations
                  : [];
               if (item?.groupId != null) {
                  pushVariant(
                     "group",
                     item.groupId,
                     reservations,
                     item?.instructorsIds || []
                  );
                  continue;
               }
               if (item?.instructorId != null) {
                  pushVariant(
                     "instructor",
                     item.instructorId,
                     reservations,
                     null
                  );
                  continue;
               }
               if (
                  Array.isArray(item?.instructorsIds) &&
                  item.instructorsIds.length === 1
               ) {
                  pushVariant(
                     "instructor",
                     item.instructorsIds[0],
                     reservations,
                     null
                  );
                  continue;
               }
            }
            return out;
         };

         let list = normalizeBusy(res.data).filter((v) =>
            tip === "group"
               ? v.entityType === "group"
               : v.entityType === "instructor"
         );
         if (!list.length) {
            notify("error", "Nu am putut găsi tipul dorit în ocupații.");
            return;
         }

         // Integrează blackouts
         list = await Promise.all(
            list.map(async (v) => ({
               ...v,
               startBusyLocal: await mergeBlackoutsIntoStartSets(
                  v.entityType,
                  v.entityId,
                  v.startBusyLocal,
                  allowedKeys,
                  v.allInstructorIdsSet
               ),
            }))
         );

         // calculează disponibilitatea corectă (sumă pe instructori)
         const scored = list
            .map((v) => {
               const { free, freeHoursByDay, dayFullyBlocked } =
                  calcAvailability({
                     fullGrid,
                     startBusyLocal: v.startBusyLocal,
                     capacity: v.capacity,
                     userBookedDaySet,
                  });
               return { ...v, free, freeHoursByDay, dayFullyBlocked };
            })
            .sort((a, b) => b.free.length - a.free.length);

         const best = scored[0];
         if (!best?.free?.length) {
            notify("warn", "Nu există sloturi libere în perioada vizată.");
            return;
         }
         if (tip === "group") {
            setAssignedGroupId(String(best.entityId));
            setAssignedInstructorId(null);
         } else {
            setAssignedInstructorId(String(best.entityId));
            setAssignedGroupId(null);
         }
         setFreeSlotsForAssigned(best.free);
         setFreeHoursByDay(best.freeHoursByDay);
         setDayFullyBlocked(best.dayFullyBlocked);
         setStage("pick");
         setShowList(false);
      } catch (err) {
         notify("error", "Nu am putut încărca disponibilitatea.");
         if (err?.message) notify("debug", `Detalii: ${err.message}`);
      } finally {
         setLoading(false);
      }
   };

   const adaugaProgramare = () => {
      if (hardLock30 || lectiiExistente >= 30) {
         notify("warn", "Ai deja 30 de lecții programate.", { force: true });
         return;
      }
      if (!data || !oraSelectata) return;

      const todayLocal = localDateStr(new Date());
      const dayLocalStr = localDateStr(data);
      if (dayLocalStr === todayLocal) {
         notify("warn", "Nu poți programa pentru AZI.", { force: true });
         return;
      }

      if (bookedDaySet.has(dayLocalStr)) {
         notify("warn", "Ai deja o programare în această zi.", { force: true });
         return;
      }

      if (reachedMax30) {
         notify("warn", "Ai atins limita maximă de 30 lecții!", {
            force: true,
         });
         return;
      }
      if (reachedPackLimit) {
         notify(
            "warn",
            `Ai atins limita pachetului curent (${requiredSubmitCount}).`,
            {
               force: true,
            }
         );
         return;
      }

      const iso = toUtcIsoFromMoldova(data, oraSelectata.oraStart);
      const key = localKeyForIso(iso);
      if (!freeLocalKeySet.has(key)) {
         notify(
            "error",
            "Slot indisponibil (ocupat sau retras). Alege altă oră.",
            {
               force: true,
            }
         );
         return;
      }
      if (selectedLocalKeySet.has(key)) return;

      setRejectedDates((prev) => prev.filter((p) => localKeyForIso(p) !== key));
      setSelectedDates((prev) => [...prev, iso]);
      notify(
         "success",
         `Adăugat: ${formatDateRO(iso)} la ${formatTimeRO(iso)}.`,
         {
            force: true,
         }
      );
      setData(null);
      setOraSelectata(null);
   };

   /** preflight pe CHEI LOCALE: aceeași oră, capacitate, o lecție/zi */
   const preflightConflicts = async (datesISO) => {
      const entityType =
         anchor?.tip || (assignedGroupId ? "group" : "instructor");
      const entityId =
         anchor?.entityId || assignedGroupId || assignedInstructorId;
      if (!entityType || !entityId) return { free: datesISO, conflicts: [] };

      const allowedKeys = new Set(datesISO.map((iso) => localKeyForIso(iso)));
      const { startBusyLocal, capacity } = await fetchBusyForEntity(
         entityType,
         entityId,
         allowedKeys
      );
      const cap = capacity || 1;

      const userBookedDaySet = new Set();
      for (const r of rezervariExistente || []) {
         const st = getStartFromReservation(r);
         if (st) userBookedDaySet.add(localDateStr(new Date(st)));
      }
      const daysInBatch = new Set();

      const conflicts = [];
      const free = [];
      for (const iso of datesISO) {
         const day = localDateStr(new Date(iso));
         const key = localKeyForIso(iso);
         if (userBookedDaySet.has(day) || daysInBatch.has(day)) {
            conflicts.push(iso);
            continue;
         }
         const set = startBusyLocal.get(key);
         const used = set?.has("__ALL__") ? cap : set?.size || 0;
         if (used >= cap) conflicts.push(iso);
         else {
            free.push(iso);
            daysInBatch.add(day);
         }
      }
      return { free, conflicts };
   };

   const stergeProgramare = (iso) => {
      setSelectedDates((prev) => prev.filter((p) => p !== iso));
      setRejectedDates((prev) => prev.filter((p) => p !== iso));
      setConfirmDeleteKey(null);
      notify("info", `Șters: ${formatDateRO(iso)} la ${formatTimeRO(iso)}.`, {
         force: true,
      });
   };

   const trimiteProgramari = async () => {
      setLoading(true);
      try {
         let latest = [];
         if (user?.id) {
            latest = await dispatch(fetchUserReservations(user.id))
               .unwrap()
               .catch(() => rezervariExistente || []);
         }
         const existingCount = Array.isArray(latest)
            ? latest.length
            : lectiiExistente;
         if (existingCount >= 30) {
            setHardLock30(true);
            notify("warn", "Ai deja 30 de lecții programate.", { force: true });
            return;
         }

         if (selectedDates.length === 0) {
            notify("warn", "Selectează cel puțin o lecție.", { force: true });
            return;
         }

         const remain = Math.max(0, 30 - existingCount);
         const mustSubmitExactly = Math.min(numarLectii, remain);

         if (selectedDates.length !== mustSubmitExactly) {
            notify(
               "warn",
               `Trebuie să selectezi exact ${mustSubmitExactly} lecții înainte de trimitere.`,
               { force: true }
            );
            setShowList(true);
            return;
         }

         const type =
            (anchor?.tip || (assignedGroupId ? "group" : "instructor")) ===
            "group"
               ? "group"
               : "instructor";
         const chosenId =
            anchor?.entityId ||
            (type === "group" ? assignedGroupId : assignedInstructorId);
         if (!chosenId) {
            notify("error", "Nu am o entitate selectată (grup/instructor).", {
               force: true,
            });
            return;
         }

         const { free: preflightFree, conflicts: preflightTaken } =
            await preflightConflicts(selectedDates);

         if (preflightTaken.length) {
            dropFromFreeSlots(preflightTaken);
            setRejectedDates((prev) => uniq([...prev, ...preflightTaken]));
            setSelectedDates(preflightFree);
            setShowList(true);
            notify(
               "warn",
               `Am scos ${preflightTaken.length} sloturi nevalide.`,
               {
                  force: true,
               }
            );
         }

         if (preflightFree.length !== mustSubmitExactly) {
            if (preflightFree.length === 0) return;
            notify(
               "error",
               `După verificare au rămas ${preflightFree.length}/${mustSubmitExactly}. Ajustează selecția și reîncearcă.`,
               { force: true }
            );
            return;
         }

         const normalizedGearbox =
            (cutie || "").toLowerCase() === "automat" ? "Automat" : "Manual";
         const topLevel =
            type === "group"
               ? { instructorsGroupId: Number(chosenId) }
               : { instructorId: Number(chosenId) };

         const payload = {
            ...topLevel,
            reservations: preflightFree.map((isoDate) => ({
               startTime:
                  BUSY_KEYS_MODE === "local-match"
                     ? isoForDbMatchLocalHour(isoDate)
                     : isoDate,
               sector: String(sector || "Botanica"),
               gearbox: normalizedGearbox,
               privateMessage: "",
               color: "--black-t",
            })),
         };

         try {
            notify("info", "Trimit programările...", { force: true });
            await createReservations(payload);
            try {
               await dispatch(fetchUserReservations(user.id)).unwrap();
            } catch {}
            notify("success", `Trimis ${preflightFree.length} programări.`, {
               force: true,
            });

            // ✅ Închide popup-ul DOAR la succes
            safeClose();
            return;
         } catch (e) {
            // Re-verificare live
            const allowedKeys = new Set(
               preflightFree.map((iso) => localKeyForIso(iso))
            );
            const { startBusyLocal: startBusy2, capacity: cap2 } =
               await fetchBusyForEntity(type, chosenId, allowedKeys);

            const nowConflicts = [];
            const stillOk = [];
            for (const iso of preflightFree) {
               if (isStartFullLocal(iso, startBusy2, cap2))
                  nowConflicts.push(iso);
               else stillOk.push(iso);
            }

            if (nowConflicts.length) {
               dropFromFreeSlots(nowConflicts);
               setRejectedDates((prev) => uniq([...prev, ...nowConflicts]));
               notify(
                  "warn",
                  `Unele sloturi s-au ocupat între timp (${nowConflicts.length}).`,
                  { force: true }
               );
            }

            if (stillOk.length) {
               if (stillOk.length !== mustSubmitExactly) {
                  notify(
                     "warn",
                     `Au rămas ${stillOk.length}/${mustSubmitExactly}. Ajustează și reîncearcă.`,
                     { force: true }
                  );
                  setSelectedDates(stillOk);
                  setShowList(true);
                  return;
               }

               const retryPayload = {
                  ...topLevel,
                  reservations: stillOk.map((isoDate) => ({
                     startTime:
                        BUSY_KEYS_MODE === "local-match"
                           ? isoForDbMatchLocalHour(isoDate)
                           : isoDate,
                     sector: String(sector || "Botanica"),
                     gearbox: normalizedGearbox,
                     privateMessage: "",
                     color: "#FF5733",
                  })),
               };

               await createReservations(retryPayload);
               try {
                  await dispatch(fetchUserReservations(user.id)).unwrap();
               } catch {}
               notify("success", `Trimis ${stillOk.length} programări.`, {
                  force: true,
               });

               // ✅ Închide popup-ul DOAR la succes (și aici)
               safeClose();
               return;
            }
         }
      } catch (e) {
         notify("error", "A apărut o eroare la trimitere.", { force: true });
         if (e?.message)
            notify("alert", `Detalii: ${e.message}`, { force: true });
      } finally {
         setLoading(false);
      }
   };

   const maxSelectableDate = useMemo(
      () => addDays(new Date(), WINDOW_DAYS - 1),
      [WINDOW_DAYS]
   );

   const showLoadingScreen =
      initLoading ||
      (isLocked && stage === "setup" && (loading || busyLoading));

   const handleBack = () => {
      if (stage === "pick" && showList) setShowList(false);
      else if (stage === "pick") setStage("setup");
      else safeClose(); // ✅ fallback la store dacă nu avem onClose
   };

   return (
      <>
         {/* ALERT PILLS */}
         <AlertPills messages={messages} onDismiss={dismissLast} />

         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Adaugă programare</h3>
         </div>

         <div className="popup-panel__content">
            {hardLock30 ? (
               <div className="saddprogramari__box">
                  <div className="saddprogramari__info">
                     <b>Ai deja 30 de lecții programate.</b> Nu mai poți adăuga
                     alte programări.
                  </div>
               </div>
            ) : showLoadingScreen ? (
               <div className="saddprogramari__loading">
                  Se încarcă disponibilitatea…
               </div>
            ) : stage === "setup" ? (
               <>
                  <div className="saddprogramari__selector row">
                     <h3 className="saddprogramari__title">
                        Selectează pachetul:
                     </h3>
                     <div
                        className={`instructors-popup__radio-wrapper addprog ${
                           numarLectii === 15
                              ? "active-botanica"
                              : numarLectii === 30
                              ? "active-ciocana"
                              : ""
                        }`}
                     >
                        <label>
                           <input
                              type="radio"
                              name="lectii"
                              value="15"
                              checked={numarLectii === 15}
                              onChange={() => setNumarLectii(15)}
                              disabled={isLocked || lectiiExistente >= 30}
                           />
                           15 lecții
                        </label>
                        <label>
                           <input
                              type="radio"
                              name="lectii"
                              value="30"
                              checked={numarLectii === 30}
                              onChange={() => setNumarLectii(30)}
                              disabled={isLocked || lectiiExistente > 0}
                           />
                           30 lecții
                        </label>
                     </div>
                  </div>

                  {/* Cutie */}
                  <div className="saddprogramari__selector row">
                     <h3 className="saddprogramari__title">
                        Selectează cutia de viteze:
                     </h3>
                     <div
                        className={`instructors-popup__radio-wrapper addprog ${
                           cutie === "manual"
                              ? "active-botanica"
                              : "active-ciocana"
                        }`}
                     >
                        <label>
                           <input
                              type="radio"
                              name="cutie"
                              value="manual"
                              checked={cutie === "manual"}
                              onChange={(e) => setCutie(e.target.value)}
                              disabled={isLocked}
                           />
                           Manual
                        </label>
                        <label>
                           <input
                              type="radio"
                              name="cutie"
                              value="automat"
                              checked={cutie === "automat"}
                              onChange={(e) => setCutie(e.target.value)}
                              disabled={isLocked}
                           />
                           Automat
                        </label>
                     </div>
                  </div>

                  {/* Sector */}
                  <div className="saddprogramari__selector row">
                     <h3 className="saddprogramari__title">
                        Selectează sectorul:
                     </h3>
                     <div
                        className={`instructors-popup__radio-wrapper addprog ${
                           sector === "Botanica"
                              ? "active-botanica"
                              : "active-ciocana"
                        }`}
                     >
                        <label>
                           <input
                              type="radio"
                              name="sector"
                              value="Botanica"
                              checked={sector === "Botanica"}
                              onChange={(e) => setSector(e.target.value)}
                              disabled={isLocked}
                           />
                           Botanica
                        </label>
                        <label>
                           <input
                              type="radio"
                              name="sector"
                              value="Ciocana"
                              checked={sector === "Ciocana"}
                              onChange={(e) => setSector(e.target.value)}
                              disabled={isLocked}
                           />
                           Ciocana
                        </label>
                     </div>
                  </div>

                  {/* Tip */}
                  <div className="saddprogramari__selector row">
                     <h3 className="saddprogramari__title">Alegere tip:</h3>
                     <div
                        className={`instructors-popup__radio-wrapper addprog ${
                           tip === "group"
                              ? "active-botanica"
                              : "active-ciocana"
                        } ${sector === "Botanica" ? "" : "inactive"}`}
                     >
                        <label>
                           <input
                              type="radio"
                              name="tip"
                              value="group"
                              checked={tip === "group"}
                              onChange={(e) => setTip(e.target.value)}
                              disabled={isLocked || sector === "Ciocana"}
                           />
                           Mai mulți
                        </label>
                        <label>
                           <input
                              type="radio"
                              name="tip"
                              value="single"
                              checked={tip === "single"}
                              onChange={(e) => setTip(e.target.value)}
                              disabled={isLocked}
                           />
                           Unul
                        </label>
                     </div>
                  </div>

                  <button
                     onClick={handleClickContinue}
                     disabled={busyLoading || loading}
                     className="saddprogramari__add-btn arrow"
                     type="button"
                  >
                     <span>{loading ? "Se pregătește..." : "Continuă"}</span>
                     <ReactSVG
                        src={arrowIcon}
                        className="saddprogramari__add-btn-icon"
                     />
                  </button>
               </>
            ) : (
               // ====== STAGE: PICK ======
               <>
                  {!showList ? (
                     <>
                        <div className="saddprogramari__selector ">
                           <div className="saddprogramari__calendar">
                              <h3 className="saddprogramari__title">
                                 Selectează data și ora:
                              </h3>
                              <DatePicker
                                 selected={data}
                                 onChange={(date) => {
                                    setData(date);
                                    setOraSelectata(null);
                                 }}
                                 inline
                                 locale="ro"
                                 formatWeekDay={(name) =>
                                    name
                                       .substring(0, 2)
                                       .replace(/^./, (c) => c.toUpperCase())
                                 }
                                 minDate={addDays(new Date(), 1)}
                                 maxDate={maxSelectableDate}
                                 dayClassName={(date) => {
                                    const day = localDateStr(date);
                                    // ✅ Nu bloca nimic până nu avem o hartă calculată (evită false-pozitive când backendul întoarce gol)
                                    if (
                                       !freeHoursByDay ||
                                       freeHoursByDay.size === 0
                                    )
                                       return "";
                                    if (bookedDaySet.has(day))
                                       return "saddprogramari__day--inactive";
                                    // 🔒 blochează ziua doar dacă TOATE orele sunt la capacitate
                                    if (dayFullyBlocked.has(day))
                                       return "saddprogramari__day--inactive";
                                    return freeByDay.has(day)
                                       ? ""
                                       : "saddprogramari__day--inactive";
                                 }}
                              />
                           </div>

                           <div className="saddprogramari__times">
                              <h3 className="saddprogramari__title">
                                 Selectează:
                              </h3>
                              <div className="saddprogramari__times-list">
                                 {!data && (
                                    <div className="saddprogramari__disclaimer">
                                       Te rog să selectezi mai întâi o zi!
                                    </div>
                                 )}
                                 {oreDisponibile.map((ora) => {
                                    const disabledDay = data
                                       ? bookedDaySet.has(dayLocal)
                                       : false;
                                    const isFree = data
                                       ? freeTimesForDay.has(ora.oraStart)
                                       : false;
                                    const alreadyPicked = data
                                       ? selectedTimesForDay.has(ora.oraStart)
                                       : false;
                                    const isSelected =
                                       oraSelectata?.eticheta === ora.eticheta;
                                    const disabled =
                                       !data ||
                                       disabledDay ||
                                       !isFree ||
                                       alreadyPicked;

                                    return (
                                       <button
                                          key={ora.eticheta}
                                          onClick={() => setOraSelectata(ora)}
                                          disabled={disabled}
                                          className={`saddprogramari__time-btn ${
                                             isSelected
                                                ? "saddprogramari__time-btn--selected"
                                                : ""
                                          } ${
                                             disabled
                                                ? "saddprogramari__time-btn--disabled"
                                                : ""
                                          }`}
                                          title={
                                             disabledDay
                                                ? "Ai deja o programare în această zi"
                                                : alreadyPicked
                                                ? "Deja adăugat"
                                                : !isFree
                                                ? "Ocupat / indisponibil"
                                                : ""
                                          }
                                       >
                                          {ora.eticheta}
                                       </button>
                                    );
                                 })}
                              </div>
                           </div>
                        </div>
                        <div className="saddprogramari__add-btns">
                           <button
                              onClick={adaugaProgramare}
                              disabled={
                                 !data ||
                                 !oraSelectata ||
                                 selectedDates.length >= requiredSubmitCount
                              }
                              className="saddprogramari__add-btn"
                              type="button"
                           >
                              <ReactSVG
                                 src={addIcon}
                                 className="saddprogramari__add-btn-icon"
                              />
                              <span>Adaugă</span>
                           </button>

                           <button
                              type="button"
                              className="saddprogramari__add-btn list"
                              onClick={() => setShowList(true)}
                              disabled={
                                 selectedDates.length === 0 &&
                                 rejectedDates.length === 0
                              }
                              title="Vezi lista"
                           >
                              <span>
                                 Vezi lista (
                                 {selectedDates.length + rejectedDates.length})
                              </span>
                           </button>
                        </div>
                     </>
                  ) : (
                     <>
                        <div className="saddprogramari__selector col">
                           <div className="saddprogramari__header-row">
                              <h3 className="saddprogramari__title saddprogramari__title--mt-12">
                                 Lecții selectate: {selectedDates.length} /{" "}
                                 {requiredSubmitCount}
                                 {rejectedDates.length > 0 && (
                                    <span className="saddprogramari__muted-note">
                                       {" "}
                                       · conflicte: {rejectedDates.length}
                                    </span>
                                 )}
                              </h3>
                              <button
                                 type="button"
                                 className="saddprogramari__ghost-btn"
                                 onClick={() => setShowList(false)}
                                 title="Înapoi la selecție"
                              >
                                 Înapoi la selecție
                              </button>
                           </div>

                           <div className="saddprogramari__added">
                              {selectedDates.length + rejectedDates.length ===
                              0 ? (
                                 <div className="saddprogramari__disclaimer">
                                    Nu ai selectat încă nicio lecție.
                                 </div>
                              ) : (
                                 <ul className="saddprogramari__added-list">
                                    {rejectedDates.map((iso, i) => {
                                       const key = makeKey(iso, i);
                                       const isConfirming =
                                          confirmDeleteKey === key;

                                       return (
                                          <li
                                             key={`r-${i}`}
                                             className={
                                                "saddprogramari__added-item saddprogramari__added-item--conflict" +
                                                (isConfirming
                                                   ? " saddprogramari__added-item--confirm"
                                                   : "")
                                             }
                                          >
                                             {!isConfirming ? (
                                                <>
                                                   <div className="saddprogramari__added-item-top">
                                                      <time
                                                         className="saddprogramari__added-item-date"
                                                         dateTime={iso}
                                                      >
                                                         {formatDateRO(iso)}
                                                      </time>
                                                      <span className="saddprogramari__added-item-time">
                                                         {formatTimeRO(iso)}
                                                      </span>
                                                   </div>

                                                   <ReactSVG
                                                      onClick={() =>
                                                         setConfirmDeleteKey(
                                                            key
                                                         )
                                                      }
                                                      onKeyDown={(e) => {
                                                         if (
                                                            e.key === "Enter" ||
                                                            e.key === " "
                                                         ) {
                                                            e.preventDefault();
                                                            setConfirmDeleteKey(
                                                               key
                                                            );
                                                         }
                                                      }}
                                                      role="button"
                                                      tabIndex={0}
                                                      focusable="true"
                                                      aria-label="Șterge programarea"
                                                      src={trashIcon}
                                                      className="saddprogramari__add-btn-icon delete"
                                                   />
                                                </>
                                             ) : (
                                                <div className="saddprogramari__confirm">
                                                   <button
                                                      type="button"
                                                      className="btn btn-danger"
                                                      onClick={() => {
                                                         setRejectedDates(
                                                            (prev) =>
                                                               prev.filter(
                                                                  (p) =>
                                                                     p !== iso
                                                               )
                                                         );
                                                         setConfirmDeleteKey(
                                                            null
                                                         );
                                                      }}
                                                   >
                                                      Șterge
                                                   </button>
                                                   <button
                                                      type="button"
                                                      className="btn btn-secondary"
                                                      onClick={() =>
                                                         setConfirmDeleteKey(
                                                            null
                                                         )
                                                      }
                                                   >
                                                      Renunță
                                                   </button>
                                                </div>
                                             )}
                                          </li>
                                       );
                                    })}

                                    {selectedDates.map((iso, i) => {
                                       const key = makeKey(iso, i);
                                       const isConfirming =
                                          confirmDeleteKey === key;

                                       return (
                                          <li
                                             key={`s-${i}`}
                                             className={
                                                "saddprogramari__added-item" +
                                                (isConfirming
                                                   ? " saddprogramari__added-item--confirm"
                                                   : "")
                                             }
                                          >
                                             {!isConfirming ? (
                                                <>
                                                   <div className="saddprogramari__added-item-top">
                                                      <time
                                                         className="saddprogramari__added-item-date"
                                                         dateTime={iso}
                                                      >
                                                         {formatDateRO(iso)}
                                                      </time>
                                                      <span className="saddprogramari__added-item-time">
                                                         {formatTimeRO(iso)}
                                                      </span>
                                                   </div>

                                                   <ReactSVG
                                                      onClick={() =>
                                                         setConfirmDeleteKey(
                                                            key
                                                         )
                                                      }
                                                      onKeyDown={(e) => {
                                                         if (
                                                            e.key === "Enter" ||
                                                            e.key === " "
                                                         ) {
                                                            e.preventDefault();
                                                            setConfirmDeleteKey(
                                                               key
                                                            );
                                                         }
                                                      }}
                                                      role="button"
                                                      tabIndex={0}
                                                      focusable="true"
                                                      aria-label="Șterge programarea"
                                                      src={trashIcon}
                                                      className="saddprogramari__add-btn-icon delete"
                                                   />
                                                </>
                                             ) : (
                                                <div className="saddprogramari__confirm">
                                                   <button
                                                      type="button"
                                                      className="btn btn-danger"
                                                      onClick={() =>
                                                         stergeProgramare(iso)
                                                      }
                                                   >
                                                      Șterge
                                                   </button>
                                                   <button
                                                      type="button"
                                                      className="btn btn-secondary"
                                                      onClick={() =>
                                                         setConfirmDeleteKey(
                                                            null
                                                         )
                                                      }
                                                   >
                                                      Renunță
                                                   </button>
                                                </div>
                                             )}
                                          </li>
                                       );
                                    })}
                                 </ul>
                              )}
                           </div>
                        </div>
                     </>
                  )}

                  {/* acțiuni comune etapei 2 */}
                  <div className="saddprogramari__add-btns">
                     <button
                        onClick={handleBack}
                        className="saddprogramari__add-btn arrow0"
                        type="button"
                     >
                        <ReactSVG
                           src={arrowIcon}
                           className="saddprogramari__add-btn-icon"
                        />
                        <span>Înapoi</span>
                     </button>
                     <button
                        onClick={trimiteProgramari}
                        disabled={
                           selectedDates.length !== requiredSubmitCount ||
                           loading
                        }
                        className="saddprogramari__add-btn arrow"
                        type="button"
                     >
                        <span>
                           {loading
                              ? "Se trimit..."
                              : `Trimite ${selectedDates.length} programări`}
                        </span>
                        <ReactSVG
                           src={arrowIcon}
                           className="saddprogramari__add-btn-icon"
                        />
                     </button>
                  </div>
               </>
            )}
         </div>
      </>
   );
}
