// src/components/Popups/SAddProg.jsx
import React, {
   useState,
   useContext,
   useEffect,
   useMemo,
   useCallback,
   useRef,
} from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ro from "date-fns/locale/ro";

import addIcon from "../../assets/svg/add.svg";
import arrowIcon from "../../assets/svg/arrow.svg";
import trashIcon from "../../assets/svg/trash.svg";
import { ReactSVG } from "react-svg";

import * as ReservationsAPI from "../../api/reservationsService";
import * as InstructorsAPI from "../../api/instructorsService";
import * as UsersAPI from "../../api/usersService";

import { UserContext } from "../../UserContext";
import { useDispatch, useSelector } from "react-redux";
import {
   fetchUserReservations,
   fetchBusy,
} from "../../store/reservationsSlice";
import AlertPills from "../Utils/AlertPills";
import { closePopup as closePopupStore } from "../Utils/popupStore";

registerLocale("ro", ro);

const MOLDOVA_TZ = "Europe/Chisinau";

/**
 * IMPORTANT:
 * - 'local-match' = backend-ul stochează ora “locală” prin hack
 * - 'utc' = backend-ul stochează UTC corect
 */
const BUSY_KEYS_MODE = "local-match";

// regula ta: la group, dacă used + blocked >= capacity => slot full
const GROUP_SLOT_LIMIT = 3;

// limită totală lecții în sistem
const MAX_TOTAL_LESSONS = 30;

// LIVE refresh interval (ms)
const LIVE_REFRESH_MS = 15 * 60_000;

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

/* ================= helpers date/time ================= */

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

// past + today (Moldova) => disabled
function isPastOrTodayInMoldova(date) {
   const d = localDateStrTZ(date, MOLDOVA_TZ);
   const today = localDateStrTZ(new Date(), MOLDOVA_TZ);
   return d <= today;
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

// Moldova day + HH:mm -> ISO UTC (...Z)
function toUtcIsoFromMoldova(localDateObj, timeStrHHMM) {
   const [hh, mm] = (timeStrHHMM || "00:00").split(":").map(Number);
   const utcGuess = Date.UTC(
      localDateObj.getFullYear(),
      localDateObj.getMonth(),
      localDateObj.getDate(),
      hh,
      mm,
      0,
      0,
   );
   const offMin = tzOffsetMinutesAt(utcGuess, MOLDOVA_TZ);
   const fixedUtcMs = utcGuess - offMin * 60000;
   return new Date(fixedUtcMs).toISOString();
}

// localKey: "YYYY-MM-DD|HH:mm" în Moldova
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

// cheia corectă din ce vine din DB (ține cont de "local-match")
function busyLocalKeyFromStored(st) {
   const d = new Date(st);
   if (BUSY_KEYS_MODE === "local-match") {
      const offMin = tzOffsetMinutesAt(d.getTime(), MOLDOVA_TZ);
      const base = new Date(d.getTime() - offMin * 60000);
      const key = localKeyFromTs(base.getTime(), MOLDOVA_TZ);
      const hhmm = key.slice(-5);
      if (SLOT_LABELS.has(hhmm)) return key;
   }
   return localKeyFromTs(d.getTime(), MOLDOVA_TZ);
}

// HACK: păstrează “ora locală” în DB (compat cu backend-ul)
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

/* ================= formatting ================= */

const capRO = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

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

const addDays = (d, n) => {
   const x = new Date(d);
   x.setDate(x.getDate() + n);
   return x;
};

const addMonths = (d, n) => {
   const x = new Date(d);
   x.setMonth(x.getMonth() + n);
   return x;
};

const asStr = (v) => (v == null ? "" : String(v));
const asStrLower = (v) => asStr(v).trim().toLowerCase();

const getStartFromReservation = (r) =>
   r?.startTime ?? r?.start ?? r?.dateTime ?? r?.datetime ?? r?.begin ?? null;

function sortIsoAsc(arr) {
   return (Array.isArray(arr) ? arr : [])
      .slice()
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/* ================= busy item picking (CRITICAL FIX) ================= */

function normalizeBusyList(raw) {
   const data = raw?.data ?? raw;
   if (Array.isArray(data)) return data;
   if (data && typeof data === "object") return [data];
   return [];
}

function strictMatchBusyItem(list, wantGroup, entityId) {
   const arr = Array.isArray(list) ? list : [];
   if (!arr.length) return null;

   if (wantGroup) {
      return (
         arr.find(
            (x) =>
               String(x?.groupId ?? x?.instructorsGroupId ?? "") ===
               String(entityId),
         ) || null
      );
   }

   return (
      arr.find((x) => String(x?.instructorId ?? "") === String(entityId)) ||
      arr.find(
         (x) =>
            Array.isArray(x?.instructorsIds) &&
            x.instructorsIds.length === 1 &&
            String(x.instructorsIds[0]) === String(entityId),
      ) ||
      null
   );
}

function pickBusyItemFromDirectEndpoint(raw, wantGroup, entityId) {
   const list = normalizeBusyList(raw);
   if (!list.length) return null;
   return strictMatchBusyItem(list, wantGroup, entityId) || list[0];
}

function pickBusyItemFromFetchBusy(raw, wantGroup, entityId) {
   const list = normalizeBusyList(raw);
   return strictMatchBusyItem(list, wantGroup, entityId);
}

/* ================= blackouts helpers ================= */

function normalizeBlackoutsResponse(res) {
   const raw = res?.data ?? res;
   if (Array.isArray(raw)) return raw;
   if (raw && Array.isArray(raw.blackouts)) return raw.blackouts;
   if (raw && raw.data && Array.isArray(raw.data)) return raw.data;
   if (raw && raw.data && Array.isArray(raw.data.blackouts))
      return raw.data.blackouts;
   if (raw && Array.isArray(raw.items)) return raw.items;
   return [];
}

async function fetchInstructorBlackoutsSafe(instructorId, range) {
   const fn = InstructorsAPI?.getInstructorBlackouts;
   if (typeof fn !== "function") return { data: [] };
   try {
      return await fn({ instructorId, ...range });
   } catch (e1) {
      try {
         return await fn(instructorId, range);
      } catch (e2) {
         return await fn(instructorId);
      }
   }
}

/* ================= REPEAT -> SINGLE expand ================= */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isRepeatType(b) {
   const t = String(b?.type || "").toUpperCase();
   return t === "REPEAT" || t.includes("REPEAT");
}

function pickBlackoutStartTime(b) {
   if (!b) return null;
   if (typeof b === "string") return b;
   return (
      b?.startTime ??
      b?.start ??
      b?.dateTime ??
      b?.datetime ??
      b?.from ??
      b?.begin ??
      null
   );
}

function expandBlackoutToStartTimes(b) {
   if (!b) return [];
   if (typeof b === "string") return [b];

   const singleStart =
      pickBlackoutStartTime(b) || b?.startDateTime || b?.dateTime || null;
   if (!singleStart) return [];

   if (!isRepeatType(b)) return [singleStart];

   const startIso = b?.startDateTime || singleStart;
   const endIso = b?.endDateTime || null;

   const stepDaysRaw = Number(b?.repeatEveryDays);
   const stepDays =
      Number.isFinite(stepDaysRaw) && stepDaysRaw > 0 ? stepDaysRaw : 7;

   if (!endIso) return [startIso];

   const startMs = new Date(startIso).getTime();
   const endMs = new Date(endIso).getTime();
   if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [startIso];
   if (endMs < startMs) return [startIso];

   const stepMs = stepDays * MS_PER_DAY;
   const out = [];
   const HARD_LIMIT = 5000;

   for (let ms = startMs; ms <= endMs; ms += stepMs) {
      out.push(new Date(ms).toISOString());
      if (out.length >= HARD_LIMIT) break;
   }
   return out;
}

/* ================== maps builders (busy/blocked) ================== */

function buildBusyCountMapFromReservations(reservations = []) {
   const setMap = new Map(); // key -> Set(iid)
   const extraCountMap = new Map(); // key -> count
   for (const r of reservations || []) {
      const st = getStartFromReservation(r);
      if (!st) continue;
      const key = busyLocalKeyFromStored(st);
      const hhmm = key.slice(-5);
      if (!SLOT_LABELS.has(hhmm)) continue;

      const iid = r?.instructorId ?? r?.instructor?.id ?? null;
      if (iid != null) {
         const s = setMap.get(key) || new Set();
         s.add(String(iid));
         setMap.set(key, s);
      } else {
         extraCountMap.set(key, (extraCountMap.get(key) || 0) + 1);
      }
   }

   const out = new Map();
   for (const [key, s] of setMap.entries()) out.set(key, s.size);
   for (const [key, c] of extraCountMap.entries())
      out.set(key, (out.get(key) || 0) + c);
   return out;
}

async function buildBlockedCountMapFromInstructorIds(
   instructorIds,
   range,
   minDay,
   maxDay,
) {
   const blockedSetByKey = new Map(); // key -> Set(instructorId)

   await Promise.all(
      (instructorIds || []).map(async (iid) => {
         try {
            const resB = await fetchInstructorBlackoutsSafe(iid, range);
            const blackouts = normalizeBlackoutsResponse(resB);

            for (const b of blackouts) {
               const occurrences = expandBlackoutToStartTimes(b);
               for (const st of occurrences) {
                  if (!st) continue;

                  const key = busyLocalKeyFromStored(st);
                  const day = key.slice(0, 10);
                  const hhmm = key.slice(-5);

                  if (day < minDay || day > maxDay) continue;
                  if (!SLOT_LABELS.has(hhmm)) continue;

                  const s = blockedSetByKey.get(key) || new Set();
                  s.add(String(iid));
                  blockedSetByKey.set(key, s);
               }
            }
         } catch {
            // ignore per instructor
         }
      }),
   );

   const blockedMap = new Map();
   for (const [key, s] of blockedSetByKey.entries())
      blockedMap.set(key, s.size);
   return blockedMap;
}

/* ================== AUTO-ANCHOR (ca în OldSAddProg) ================== */

function extractEntityFromReservation(r) {
   const gid =
      r?.instructorsGroupId ??
      r?.instructors_group_id ??
      r?.groupId ??
      r?.group?.id ??
      r?.instructorsGroup?.id ??
      null;

   const iid = r?.instructorId ?? r?.instructor?.id ?? null;

   if (gid != null) return { type: "group", id: String(gid) };
   if (iid != null) return { type: "instructor", id: String(iid) };
   return { type: null, id: null };
}

function inferSectorCutieFromReservation(r) {
   const sector = r?.sector ? String(r.sector) : null;

   const gbRaw =
      r?.gearbox ?? r?.gearBox ?? r?.gear_box ?? r?.transmission ?? null;

   let cutie = null;
   if (gbRaw != null) {
      const v = String(gbRaw).toLowerCase();
      cutie = v.includes("auto") ? "automat" : "manual";
   }
   return { sector, cutie };
}

function findDominantAnchor(resArr) {
   const arr = Array.isArray(resArr) ? resArr : [];
   if (!arr.length) return null;

   const withStart = arr
      .map((r) => ({ r, st: getStartFromReservation(r) }))
      .filter((x) => x.st)
      .sort((a, b) => new Date(b.st).getTime() - new Date(a.st).getTime());

   const recent = withStart.slice(0, 15);
   const n = recent.length;
   if (!n) return null;

   const counts = new Map(); // key -> {type,id,count,sample}
   for (const { r } of recent) {
      const ent = extractEntityFromReservation(r);
      if (!ent.type || !ent.id) continue;
      const key = `${ent.type}:${ent.id}`;
      const cur = counts.get(key) || { ...ent, count: 0, sample: r };
      cur.count += 1;
      if (!counts.has(key)) cur.sample = r;
      counts.set(key, cur);
   }
   if (!counts.size) return null;

   let best = null;
   for (const v of counts.values()) if (!best || v.count > best.count) best = v;

   const majority = best.count > Math.floor(n / 2);

   let chosen = best;
   if (!majority) {
      const firstR = recent[0]?.r;
      const ent = firstR ? extractEntityFromReservation(firstR) : null;
      if (ent?.type && ent?.id) {
         const key = `${ent.type}:${ent.id}`;
         chosen = counts.get(key) || { ...ent, count: 1, sample: firstR };
      }
   }

   const inf = inferSectorCutieFromReservation(chosen.sample);
   const sector =
      String(inf?.sector || "").toLowerCase() === "ciocana"
         ? "Ciocana"
         : inf?.sector
           ? String(inf.sector)
           : "Botanica";

   const cutie = inf?.cutie || "manual";

   return {
      type: chosen.type, // "group" | "instructor"
      id: chosen.id,
      sector,
      cutie,
   };
}

/* ================= Component ================= */

export default function SAddProg({ onClose }) {
   const dispatch = useDispatch();
   const { user } = useContext(UserContext);

   const { busyLoading, list: rezervariExistente } = useSelector(
      (s) => s.reservations,
   );

   /* Alerts */
   const [messages, setMessages] = useState([]);
   const notify = useCallback((type, text) => {
      setMessages((prev) => [
         ...prev,
         { id: `${Date.now()}-${Math.random()}`, type, text },
      ]);
   }, []);
   const dismissLast = useCallback(
      () => setMessages((prev) => prev.slice(0, -1)),
      [],
   );

   const safeClose = useCallback(() => {
      if (typeof onClose === "function") onClose();
      else closePopupStore();
   }, [onClose]);

   /* Setup */
   const [numarLectii, setNumarLectii] = useState(15); // 15 / 30
   const [cutie, setCutie] = useState("manual");
   const [sector, setSector] = useState("Botanica");
   const [tip, setTip] = useState("group"); // group | single
   // UI: tip = ce vede user (single/group)
   // Backend: la Ciocana forțăm group, chiar dacă UI e "single"
   const backendType = useMemo(() => {
      return sector === "Ciocana" ? "group" : tip; // ✅ cheia
   }, [sector, tip]);

   const backendWantGroup = backendType === "group";

   useEffect(() => {
      if (sector === "Ciocana" && tip !== "single") setTip("single");
   }, [sector, tip]);

   const [stage, setStage] = useState("setup"); // setup | pick
   const [loading, setLoading] = useState(false);

   // AUTO FLOW (anchor): dacă intră direct în pick
   const [autoFlowActive, setAutoFlowActive] = useState(false);
   const autoBootOnceRef = useRef(false);

   // entitatea aleasă
   const [assignedGroupId, setAssignedGroupId] = useState(null);
   const [assignedInstructorId, setAssignedInstructorId] = useState(null);
   const [activeInstructorIds, setActiveInstructorIds] = useState([]);
   const [capacity, setCapacity] = useState(1);

   // maps “server”
   const [serverBusyCountByKey, setServerBusyCountByKey] = useState(
      () => new Map(),
   );
   const [serverBlockedCountByKey, setServerBlockedCountByKey] = useState(
      () => new Map(),
   );

   // user reservations (pt 1/zi + total 30)
   const [userReservations, setUserReservations] = useState([]);
   const [lectiiExistente, setLectiiExistente] = useState(0);
   const [initLoading, setInitLoading] = useState(true);

   // pick
   const [data, setData] = useState(null);
   const [oraSelectata, setOraSelectata] = useState(null);
   const [selectedDates, setSelectedDates] = useState([]); // ISO UTC[]
   const [showList, setShowList] = useState(false);

   // conflicte
   const [rejected, setRejected] = useState([]); // { iso, reason }[]
   const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);

   // anti-spam submit
   const submitGuardRef = useRef(false);

   // live refresh
   const [lastLiveRefreshAt, setLastLiveRefreshAt] = useState(null);
   const refreshInFlightRef = useRef(false);
   const [autoFillRunning, setAutoFillRunning] = useState(false);

   const minSelectableDate = useMemo(() => addDays(new Date(), 1), []);
   const maxSelectableDate = useMemo(() => addMonths(new Date(), 3), []);

   const minDay = useMemo(
      () => localDateStrTZ(minSelectableDate, MOLDOVA_TZ),
      [minSelectableDate],
   );
   const maxDay = useMemo(
      () => localDateStrTZ(maxSelectableDate, MOLDOVA_TZ),
      [maxSelectableDate],
   );

   // total limit
   const hardLock30 = lectiiExistente >= MAX_TOTAL_LESSONS;
   const remainingTo30 = useMemo(
      () => Math.max(0, MAX_TOTAL_LESSONS - lectiiExistente),
      [lectiiExistente],
   );

   // pachet efectiv
   const requiredSubmitCount = useMemo(
      () => Math.min(Number(numarLectii) || 0, remainingTo30),
      [numarLectii, remainingTo30],
   );

   // ✅ AUTO anchor ca în OldSAddProg
   const autoAnchor = useMemo(
      () => findDominantAnchor(userReservations),
      [userReservations],
   );

   const autoEligible = useMemo(() => {
      return (
         autoAnchor?.type &&
         autoAnchor?.id &&
         Number(lectiiExistente) > 0 &&
         Number(lectiiExistente) < MAX_TOTAL_LESSONS
      );
   }, [autoAnchor, lectiiExistente]);

   // zile ocupate din DB (1/zi)
   const existingBookedDaySet = useMemo(() => {
      const set = new Set();
      for (const r of userReservations || []) {
         const st = getStartFromReservation(r);
         if (!st) continue;
         set.add(localDateStrTZ(new Date(st), MOLDOVA_TZ));
      }
      return set;
   }, [userReservations]);

   // zile selectate în popup (1/zi)
   const selectedBookedDaySet = useMemo(() => {
      const set = new Set();
      for (const iso of selectedDates || []) {
         set.add(localDateStrTZ(new Date(iso), MOLDOVA_TZ));
      }
      return set;
   }, [selectedDates]);

   // union (DB + popup)
   const bookedDaySet = useMemo(() => {
      const set = new Set(existingBookedDaySet);
      for (const d of selectedBookedDaySet) set.add(d);
      return set;
   }, [existingBookedDaySet, selectedBookedDaySet]);

   // selected key set
   const selectedKeySet = useMemo(() => {
      const set = new Set();
      for (const iso of selectedDates)
         set.add(localKeyFromTs(new Date(iso).getTime(), MOLDOVA_TZ));
      return set;
   }, [selectedDates]);

   // selectedCountByKey
   const selectedCountByKey = useMemo(() => {
      const map = new Map();
      for (const iso of selectedDates) {
         const key = localKeyFromTs(new Date(iso).getTime(), MOLDOVA_TZ);
         map.set(key, (map.get(key) || 0) + 1);
      }
      return map;
   }, [selectedDates]);

   // meta per slot
   const getSlotMeta = useCallback(
      (key) => {
         const usedServer = key ? serverBusyCountByKey.get(key) || 0 : 0;
         const usedSelected = key ? selectedCountByKey.get(key) || 0 : 0;
         const used = usedServer + usedSelected;

         const blocked = key ? serverBlockedCountByKey.get(key) || 0 : 0;
         const total = capacity || 1;
         const sum = used + blocked;

         const full = sum >= total;
         const effectiveCap = Math.max(0, total - blocked);

         return {
            used,
            usedServer,
            usedSelected,
            blocked,
            total,
            effectiveCap,
            full,
            sum,
         };
      },
      [
         serverBusyCountByKey,
         serverBlockedCountByKey,
         selectedCountByKey,
         capacity,
      ],
   );

   // full-day set: dacă TOATE sloturile sunt full
   const fullyBlockedDaySet = useMemo(() => {
      const set = new Set();
      const total = capacity || 1;

      const dayToFullSlots = new Map();
      const keys = new Set([
         ...serverBusyCountByKey.keys(),
         ...serverBlockedCountByKey.keys(),
         ...selectedCountByKey.keys(),
      ]);

      for (const key of keys) {
         const usedServer = serverBusyCountByKey.get(key) || 0;
         const usedSelected = selectedCountByKey.get(key) || 0;
         const blocked = serverBlockedCountByKey.get(key) || 0;
         const sum = usedServer + usedSelected + blocked;

         if (sum >= total) {
            const day = key.slice(0, 10);
            dayToFullSlots.set(day, (dayToFullSlots.get(day) || 0) + 1);
         }
      }

      for (const [day, count] of dayToFullSlots.entries()) {
         if (count >= oreDisponibile.length) set.add(day);
      }
      return set;
   }, [
      serverBusyCountByKey,
      serverBlockedCountByKey,
      selectedCountByKey,
      capacity,
   ]);

   // init: încarcă rezervările userului
   useEffect(() => {
      let alive = true;
      (async () => {
         try {
            if (!user?.id) return;

            const existing = await dispatch(fetchUserReservations(user.id))
               .unwrap()
               .catch(() => rezervariExistente || []);

            if (!alive) return;

            const arr = Array.isArray(existing) ? existing : [];
            setUserReservations(arr);
            setLectiiExistente(arr.length);
         } finally {
            if (alive) setInitLoading(false);
         }
      })();

      return () => {
         alive = false;
      };
   }, [user?.id, dispatch]); // eslint-disable-line

   // reset pick state
   const resetPickState = useCallback(() => {
      setSelectedDates([]);
      setRejected([]);
      setShowList(false);
      setData(null);
      setOraSelectata(null);
      setConfirmDeleteKey(null);

      setServerBusyCountByKey(new Map());
      setServerBlockedCountByKey(new Map());
      setCapacity(1);
      setActiveInstructorIds([]);

      setAssignedGroupId(null);
      setAssignedInstructorId(null);

      setLastLiveRefreshAt(null);
   }, []);

   // ✅ Loader generic: încarcă disponibilitatea pentru ACELAȘI group/instructor (anchor)
   const loadAvailabilityForAnchor = useCallback(
      async (anchor, opts = {}) => {
         const type = anchor?.type;
         const entityId = anchor?.id;
         if (!type || !entityId) throw new Error("Anchor invalid.");

         const daysArg = Number(opts.days ?? 15);
         const gearboxArg = String(opts.gearbox ?? cutie);
         const sectorArg = String(opts.sector ?? sector);

         const wantGroup = type === "group";

         // fixăm contextul UI
         setTip(wantGroup ? "group" : "single");
         if (wantGroup) {
            setAssignedGroupId(String(entityId));
            setAssignedInstructorId(null);
         } else {
            setAssignedGroupId(null);
            setAssignedInstructorId(String(entityId));
         }

         const range = {
            start: new Date(minSelectableDate).toISOString(),
            end: new Date(maxSelectableDate).toISOString(),
            from: minDay,
            to: maxDay,
            dateFrom: minDay,
            dateTo: maxDay,
         };

         // 1) endpoint direct (by id)
         let busyItem = null;

         if (
            wantGroup &&
            typeof ReservationsAPI?.getBusyForInstructorsGroup === "function"
         ) {
            try {
               const rawBusy =
                  await ReservationsAPI.getBusyForInstructorsGroup(entityId);
               busyItem = pickBusyItemFromDirectEndpoint(
                  rawBusy,
                  true,
                  entityId,
               );
            } catch {
               busyItem = null;
            }
         }

         if (
            !wantGroup &&
            typeof ReservationsAPI?.getBusyForInstructor === "function"
         ) {
            try {
               const rawBusy =
                  await ReservationsAPI.getBusyForInstructor(entityId);
               busyItem = pickBusyItemFromDirectEndpoint(
                  rawBusy,
                  false,
                  entityId,
               );
            } catch {
               busyItem = null;
            }
         }

         // 2) fallback: fetchBusy (STRICT)
         if (!busyItem) {
            const query = {
               days: asStr(daysArg),
               gearbox: asStrLower(gearboxArg),
               sector: asStrLower(sectorArg),
               type: wantGroup ? "group" : "single",
            };

            const res = await dispatch(fetchBusy(query)).unwrap();
            busyItem = pickBusyItemFromFetchBusy(
               res?.data ?? res,
               wantGroup,
               entityId,
            );

            if (!busyItem) {
               throw new Error(
                  wantGroup
                     ? `Anchor group ${entityId} nu apare în busy (fallback).`
                     : `Anchor instructor ${entityId} nu apare în busy (fallback).`,
               );
            }
         }

         // Busy map
         const reservations = Array.isArray(busyItem?.reservations)
            ? busyItem.reservations
            : [];
         const busyMapAll = buildBusyCountMapFromReservations(reservations);

         const busyMap = new Map();
         for (const [key, count] of busyMapAll.entries()) {
            const day = key.slice(0, 10);
            const hhmm = key.slice(-5);
            if (day < minDay || day > maxDay) continue;
            if (!SLOT_LABELS.has(hhmm)) continue;
            busyMap.set(key, count);
         }
         setServerBusyCountByKey(busyMap);

         // Instructor IDs + capacity
         let ids = [];
         if (wantGroup) {
            if (Array.isArray(busyItem?.instructorsIds)) {
               ids = busyItem.instructorsIds
                  .map((x) => Number(x))
                  .filter((n) => Number.isInteger(n) && n > 0);
            }

            if (!ids.length) {
               const s = new Set();
               for (const r of reservations) {
                  const iid = r?.instructorId ?? r?.instructor?.id ?? null;
                  if (iid != null) s.add(Number(iid));
               }
               ids = Array.from(s).filter((n) => Number.isInteger(n) && n > 0);
            }
         } else {
            ids = [Number(entityId)].filter(
               (n) => Number.isInteger(n) && n > 0,
            );
         }

         setActiveInstructorIds(ids);

         const capRaw = wantGroup ? Math.max(1, ids.length || 1) : 1;
         const cap = wantGroup ? Math.min(GROUP_SLOT_LIMIT, capRaw) : 1;
         setCapacity(cap);

         // Blocked map
         const blockedMap = await buildBlockedCountMapFromInstructorIds(
            ids,
            range,
            minDay,
            maxDay,
         );
         setServerBlockedCountByKey(blockedMap);

         setLastLiveRefreshAt(Date.now());
      },
      [
         dispatch,
         cutie,
         sector,
         minSelectableDate,
         maxSelectableDate,
         minDay,
         maxDay,
      ],
   );

   // ✅ AUTO START (anchor)
   useEffect(() => {
      if (initLoading) return;
      if (autoBootOnceRef.current) return;
      if (!autoEligible) return;
      if (!autoAnchor) return;

      autoBootOnceRef.current = true;

      const inferredCutie = autoAnchor.cutie || "manual";
      const inferredSector =
         autoAnchor.type === "group"
            ? "Botanica"
            : autoAnchor.sector || "Botanica";

      setCutie(inferredCutie);
      setSector(inferredSector);
      setNumarLectii(15);
      setTip(autoAnchor.type === "group" ? "group" : "single");

      (async () => {
         setLoading(true);
         try {
            await loadAvailabilityForAnchor(autoAnchor, {
               days: 15,
               gearbox: inferredCutie,
               sector: inferredSector,
            });
            setAutoFlowActive(true);
            setStage("pick");
            setShowList(false);
         } catch (e) {
            setAutoFlowActive(false);
            setStage("setup");
            notify(
               "warn",
               "Nu am putut porni automat cu aceleași setări (anchor). Poți continua manual.",
            );
            if (e?.message) notify("alert", `Detalii: ${e.message}`);
         } finally {
            setLoading(false);
         }
      })();
   }, [
      initLoading,
      autoEligible,
      autoAnchor,
      loadAvailabilityForAnchor,
      notify,
   ]);

   // ====== flow manual (setup -> pick) ======
   const pickEntityAndLoadAvailability = useCallback(async () => {
      const query = {
         days: asStr(numarLectii),
         gearbox: asStrLower(cutie),
         sector: asStrLower(sector),
         type: asStrLower(backendType),
      };

      const res = await dispatch(fetchBusy(query)).unwrap();
      const raw = res?.data;

      const list = Array.isArray(raw)
         ? raw
         : raw &&
             (raw.groupId != null ||
                raw.instructorId != null ||
                Array.isArray(raw.instructorsIds))
           ? [raw]
           : [];

      const wantGroup = backendWantGroup;

      const candidates = [];
      for (const item of list) {
         const reservations = Array.isArray(item?.reservations)
            ? item.reservations
            : [];
         const gid = item?.groupId ?? item?.instructorsGroupId ?? null;
         const iid = item?.instructorId ?? null;

         if (wantGroup && gid != null) {
            candidates.push({
               entityType: "group",
               id: String(gid),
               item,
               reservationsCount: reservations.length,
            });
         } else if (!wantGroup) {
            if (iid != null) {
               candidates.push({
                  entityType: "instructor",
                  id: String(iid),
                  item,
                  reservationsCount: reservations.length,
               });
            } else if (
               Array.isArray(item?.instructorsIds) &&
               item.instructorsIds.length === 1
            ) {
               candidates.push({
                  entityType: "instructor",
                  id: String(item.instructorsIds[0]),
                  item,
                  reservationsCount: reservations.length,
               });
            }
         }
      }

      if (!candidates.length) {
         throw new Error(
            "Nu am găsit entitate (grup/instructor) pentru opțiuni.",
         );
      }

      candidates.sort((a, b) => a.reservationsCount - b.reservationsCount);
      const best = candidates[0];

      setAutoFlowActive(false); // manual

      if (best.entityType === "group") {
         setAssignedGroupId(best.id);
         setAssignedInstructorId(null);
      } else {
         setAssignedInstructorId(best.id);
         setAssignedGroupId(null);
      }

      const ids =
         best.entityType === "group"
            ? Array.isArray(best?.item?.instructorsIds)
               ? best.item.instructorsIds
                    .map((x) => Number(x))
                    .filter((n) => Number.isInteger(n) && n > 0)
               : []
            : [Number(best.id)].filter((n) => Number.isInteger(n) && n > 0);

      setActiveInstructorIds(ids);

      const capRaw =
         best.entityType === "group" ? Math.max(1, ids.length || 1) : 1;
      const cap =
         best.entityType === "group" ? Math.min(GROUP_SLOT_LIMIT, capRaw) : 1;
      setCapacity(cap);

      const reservations = Array.isArray(best?.item?.reservations)
         ? best.item.reservations
         : [];
      const busyMapAll = buildBusyCountMapFromReservations(reservations);

      const busyMap = new Map();
      for (const [key, count] of busyMapAll.entries()) {
         const day = key.slice(0, 10);
         const hhmm = key.slice(-5);
         if (day < minDay || day > maxDay) continue;
         if (!SLOT_LABELS.has(hhmm)) continue;
         busyMap.set(key, count);
      }
      setServerBusyCountByKey(busyMap);

      const range = {
         start: new Date(minSelectableDate).toISOString(),
         end: new Date(maxSelectableDate).toISOString(),
         from: minDay,
         to: maxDay,
         dateFrom: minDay,
         dateTo: maxDay,
      };
      const blockedMap = await buildBlockedCountMapFromInstructorIds(
         ids,
         range,
         minDay,
         maxDay,
      );
      setServerBlockedCountByKey(blockedMap);

      setLastLiveRefreshAt(Date.now());
   }, [
      dispatch,
      numarLectii,
      cutie,
      sector,
      tip,
      minSelectableDate,
      maxSelectableDate,
      minDay,
      maxDay,
   ]);

   const handleContinue = async () => {
      if (hardLock30 || remainingTo30 <= 0) {
         notify(
            "warn",
            `Ai deja ${MAX_TOTAL_LESSONS} lecții programate. Nu mai poți adăuga.`,
         );
         return;
      }
      if (Number(numarLectii) !== 15 && Number(numarLectii) !== 30) {
         notify("warn", "Selectează pachetul (15 sau 30) ca să continui.");
         return;
      }

      setLoading(true);
      try {
         await pickEntityAndLoadAvailability();
         setStage("pick");
         setShowList(false);
      } catch (e) {
         notify(
            "error",
            "Nu am putut pregăti disponibilitatea (busy/blocări).",
         );
         if (e?.message) notify("alert", `Detalii: ${e.message}`);
      } finally {
         setLoading(false);
      }
   };

   // ====== Live refresh maps (PICK) ======
   const fetchLiveMapsForAssigned = useCallback(async () => {
      const type = assignedGroupId ? "group" : "instructor";
      const chosenId = assignedGroupId || assignedInstructorId;
      if (!chosenId) throw new Error("Nu există entitate aleasă.");

      const range = {
         start: new Date(minSelectableDate).toISOString(),
         end: new Date(maxSelectableDate).toISOString(),
         from: minDay,
         to: maxDay,
         dateFrom: minDay,
         dateTo: maxDay,
      };

      let busyItem = null;

      const fnGroup = ReservationsAPI?.getBusyForInstructorsGroup;
      const fnInstr = ReservationsAPI?.getBusyForInstructor;

      if (type === "group" && typeof fnGroup === "function") {
         try {
            const rawBusy = await fnGroup(chosenId);
            busyItem = pickBusyItemFromDirectEndpoint(rawBusy, true, chosenId);
         } catch {
            busyItem = null;
         }
      }
      if (type === "instructor" && typeof fnInstr === "function") {
         try {
            const rawBusy = await fnInstr(chosenId);
            busyItem = pickBusyItemFromDirectEndpoint(rawBusy, false, chosenId);
         } catch {
            busyItem = null;
         }
      }

      if (!busyItem) {
         const query = {
            days: asStr(numarLectii),
            gearbox: asStrLower(cutie),
            sector: asStrLower(sector),
            type: type === "group" ? "group" : "single",
         };

         const res = await dispatch(fetchBusy(query)).unwrap();
         busyItem = pickBusyItemFromFetchBusy(
            res?.data ?? res,
            type === "group",
            chosenId,
         );

         if (!busyItem) {
            throw new Error(
               `Busy fallback nu conține entitatea aleasă (${type}:${chosenId}).`,
            );
         }
      }

      const reservations = Array.isArray(busyItem?.reservations)
         ? busyItem.reservations
         : [];
      const busyMapAll = buildBusyCountMapFromReservations(reservations);

      const busyMap = new Map();
      for (const [key, count] of busyMapAll.entries()) {
         const day = key.slice(0, 10);
         const hhmm = key.slice(-5);
         if (day < minDay || day > maxDay) continue;
         if (!SLOT_LABELS.has(hhmm)) continue;
         busyMap.set(key, count);
      }

      let ids =
         type === "group"
            ? Array.isArray(busyItem?.instructorsIds)
               ? busyItem.instructorsIds
                    .map((x) => Number(x))
                    .filter((n) => Number.isInteger(n) && n > 0)
               : activeInstructorIds
            : [Number(chosenId)].filter((n) => Number.isInteger(n) && n > 0);

      ids = Array.isArray(ids) ? ids : [];
      const capRaw = type === "group" ? Math.max(1, ids.length || 1) : 1;
      const cap = type === "group" ? Math.min(GROUP_SLOT_LIMIT, capRaw) : 1;

      const blockedMap = await buildBlockedCountMapFromInstructorIds(
         ids,
         range,
         minDay,
         maxDay,
      );

      return { type, chosenId, ids, cap, busyMap, blockedMap };
   }, [
      assignedGroupId,
      assignedInstructorId,
      dispatch,
      numarLectii,
      cutie,
      sector,
      minSelectableDate,
      maxSelectableDate,
      minDay,
      maxDay,
      activeInstructorIds,
   ]);

   const doLiveRefresh = useCallback(
      async (silent = true) => {
         if (refreshInFlightRef.current) return;
         if (loading || busyLoading || initLoading) return;
         if (stage !== "pick") return;

         const chosenId = assignedGroupId || assignedInstructorId;
         if (!chosenId) return;

         refreshInFlightRef.current = true;
         try {
            const live = await fetchLiveMapsForAssigned();
            setCapacity(live.cap);
            setActiveInstructorIds(live.ids);
            setServerBusyCountByKey(live.busyMap);
            setServerBlockedCountByKey(live.blockedMap);
            setLastLiveRefreshAt(Date.now());
         } catch (e) {
            if (!silent) {
               notify("warn", "Nu am putut face live refresh (busy/blocări).");
               if (e?.message) notify("alert", `Detalii: ${e.message}`);
            }
         } finally {
            refreshInFlightRef.current = false;
         }
      },
      [
         fetchLiveMapsForAssigned,
         loading,
         busyLoading,
         initLoading,
         stage,
         assignedGroupId,
         assignedInstructorId,
         notify,
      ],
   );

   //   useEffect(() => {
   //      if (stage !== "pick") return;
   //      const chosenId = assignedGroupId || assignedInstructorId;
   //      if (!chosenId) return;
   //
   //      // refresh imediat la intrare în PICK
   //      doLiveRefresh(true);
   //
   //      const id = setInterval(() => {
   //         doLiveRefresh(true);
   //      }, LIVE_REFRESH_MS);
   //
   //      return () => clearInterval(id);
   //   }, [stage, assignedGroupId, assignedInstructorId, doLiveRefresh]);

   // ====== Preflight live (sloturi luate între timp) ======
   const preflightSelectedLive = useCallback(
      async (datesISO, latestUserReservationsArr) => {
         const { cap, busyMap, blockedMap } = await fetchLiveMapsForAssigned();

         const bookedDays = new Set();
         for (const r of latestUserReservationsArr || []) {
            const st = getStartFromReservation(r);
            if (st) bookedDays.add(localDateStrTZ(new Date(st), MOLDOVA_TZ));
         }

         const daysInBatch = new Set();
         const ok = [];
         const conflicts = [];

         for (const iso of datesISO || []) {
            const day = localDateStrTZ(new Date(iso), MOLDOVA_TZ);
            const key = localKeyFromTs(new Date(iso).getTime(), MOLDOVA_TZ);

            if (bookedDays.has(day)) {
               conflicts.push({
                  iso,
                  reason: "Ai deja o programare în această zi (din DB).",
               });
               continue;
            }
            if (daysInBatch.has(day)) {
               conflicts.push({
                  iso,
                  reason: "Ai două lecții în aceeași zi (în selecția ta).",
               });
               continue;
            }

            const used = busyMap.get(key) || 0;
            const blocked = blockedMap.get(key) || 0;
            const full = used + blocked >= (cap || 1);

            if (full) {
               conflicts.push({
                  iso,
                  reason: "Slot ocupat / blocat între timp.",
               });
               continue;
            }

            ok.push(iso);
            daysInBatch.add(day);
         }

         return { ok, conflicts };
      },
      [fetchLiveMapsForAssigned],
   );

   const mergeRejected = (prev, next) => {
      const map = new Map();
      for (const x of prev || []) map.set(x.iso, x.reason || "Conflict");
      for (const x of next || []) map.set(x.iso, x.reason || "Conflict");
      return Array.from(map.entries()).map(([iso, reason]) => ({
         iso,
         reason,
      }));
   };

   // ====== adaugă programare (UI) ======
   const reachedPackLimit = selectedDates.length >= requiredSubmitCount;

   const adaugaProgramare = () => {
      if (!data || !oraSelectata) return;

      if (hardLock30 || remainingTo30 <= 0) {
         notify(
            "warn",
            `Ai deja ${MAX_TOTAL_LESSONS} lecții programate. Nu mai poți adăuga.`,
         );
         return;
      }

      if (requiredSubmitCount <= 0) {
         notify("warn", "Nu mai ai loc pentru lecții noi.");
         return;
      }

      if (isPastOrTodayInMoldova(data)) {
         notify("warn", "Nu poți programa pentru azi sau în trecut.");
         return;
      }

      const dayLocalStr = localDateStrTZ(data, MOLDOVA_TZ);

      if (bookedDaySet.has(dayLocalStr)) {
         notify("warn", "Ai deja o programare în această zi. Alege altă zi.");
         return;
      }

      if (fullyBlockedDaySet.has(dayLocalStr)) {
         notify("warn", "Ziua este blocată complet. Alege altă zi.");
         return;
      }

      if (reachedPackLimit) {
         notify("warn", `Ai atins limita curentă (${requiredSubmitCount}).`);
         return;
      }

      const iso = toUtcIsoFromMoldova(data, oraSelectata.oraStart);
      const key = localKeyFromTs(new Date(iso).getTime(), MOLDOVA_TZ);
      if (selectedKeySet.has(key)) return;

      const { full, used, blocked, sum, total } = getSlotMeta(key);
      if (full) {
         notify(
            "warn",
            `Ora nu mai este disponibilă: rez ${used}, bl ${blocked} (sum ${sum}/${total}).`,
         );
         return;
      }

      setSelectedDates((prev) => sortIsoAsc([...prev, iso]));
      notify(
         "success",
         `Adăugat: ${formatDateRO(iso)} la ${formatTimeRO(iso)}.`,
      );

      setData(null);
      setOraSelectata(null);
   };

   // ====== Auto-complete pachet (avansat) ======
   const autoCompletePack = useCallback(
      async ({ alsoClearConflicts = false } = {}) => {
         if (autoFillRunning) return;
         if (hardLock30 || requiredSubmitCount <= 0) {
            notify("warn", "Nu mai ai loc pentru lecții noi.");
            return;
         }

         setAutoFillRunning(true);
         try {
            // ne asigurăm că avem hărți actuale
            await doLiveRefresh(true);

            const need = requiredSubmitCount - selectedDates.length;
            if (need <= 0) {
               notify("info", "Pachetul este deja complet.");
               return;
            }

            const daysTaken = new Set(bookedDaySet);
            const keysTaken = new Set(selectedKeySet);
            const tmpSelCount = new Map(selectedCountByKey);

            const additions = [];

            // iterăm zilele (max ~92)
            for (
               let d = new Date(minSelectableDate);
               d <= maxSelectableDate;
               d = addDays(d, 1)
            ) {
               const dayStr = localDateStrTZ(d, MOLDOVA_TZ);
               if (isPastOrTodayInMoldova(d)) continue;
               if (daysTaken.has(dayStr)) continue; // 1/zi (DB + deja selectate)

               // caută primul slot disponibil în ziua curentă
               let found = null;

               for (const ora of oreDisponibile) {
                  const key = `${dayStr}|${ora.oraStart}`;
                  if (keysTaken.has(key)) continue;

                  const usedServer = serverBusyCountByKey.get(key) || 0;
                  const usedTmp = tmpSelCount.get(key) || 0;
                  const blocked = serverBlockedCountByKey.get(key) || 0;
                  const total = capacity || 1;

                  if (usedServer + usedTmp + blocked >= total) continue;

                  const iso = toUtcIsoFromMoldova(d, ora.oraStart);
                  found = { iso, key, dayStr };
                  break;
               }

               if (found) {
                  additions.push(found.iso);
                  daysTaken.add(found.dayStr);
                  keysTaken.add(found.key);
                  tmpSelCount.set(
                     found.key,
                     (tmpSelCount.get(found.key) || 0) + 1,
                  );
               }

               if (additions.length >= need) break;
            }

            if (!additions.length) {
               notify(
                  "warn",
                  "Nu am găsit suficiente sloturi libere pentru auto-complete în interval.",
               );
               return;
            }

            if (alsoClearConflicts) {
               setRejected([]);
            }

            setSelectedDates((prev) => sortIsoAsc([...prev, ...additions]));
            notify(
               "success",
               `Auto-complete: am adăugat ${additions.length} lecții.`,
            );
         } catch (e) {
            notify("error", "Auto-complete a eșuat.");
            if (e?.message) notify("alert", `Detalii: ${e.message}`);
         } finally {
            setAutoFillRunning(false);
         }
      },
      [
         autoFillRunning,
         hardLock30,
         requiredSubmitCount,
         selectedDates.length,
         bookedDaySet,
         selectedKeySet,
         selectedCountByKey,
         minSelectableDate,
         maxSelectableDate,
         doLiveRefresh,
         serverBusyCountByKey,
         serverBlockedCountByKey,
         capacity,
         notify,
      ],
   );

   // ====== șterge ======
   const makeKey = (iso, idx) => `${iso}__${idx}`;

   const stergeSelected = (iso) => {
      setSelectedDates((prev) => prev.filter((x) => x !== iso));
      setConfirmDeleteKey(null);
      notify("info", `Șters: ${formatDateRO(iso)} la ${formatTimeRO(iso)}.`);
   };

   const stergeRejected = (iso) => {
      setRejected((prev) => prev.filter((x) => x.iso !== iso));
      setConfirmDeleteKey(null);
   };

   // ====== Trimitere ======
   const trimiteProgramari = async () => {
      if (submitGuardRef.current) return;
      submitGuardRef.current = true;

      setLoading(true);
      try {
         if (hardLock30 || remainingTo30 <= 0) {
            notify(
               "warn",
               `Ai deja ${MAX_TOTAL_LESSONS} lecții programate. Nu mai poți trimite.`,
            );
            return;
         }

         if (!selectedDates.length) {
            notify("warn", "Selectează cel puțin o lecție.");
            return;
         }

         // refresh user reservations (live)
         let latest = userReservations;
         if (user?.id) {
            latest = await dispatch(fetchUserReservations(user.id))
               .unwrap()
               .catch(() => rezervariExistente || userReservations || []);
         }
         const latestArr = Array.isArray(latest) ? latest : [];
         setUserReservations(latestArr);
         setLectiiExistente(latestArr.length);

         const remain = Math.max(0, MAX_TOTAL_LESSONS - latestArr.length);
         const mustSubmitExactly = Math.min(Number(numarLectii) || 0, remain);

         if (mustSubmitExactly <= 0) {
            notify(
               "warn",
               `Ai deja ${MAX_TOTAL_LESSONS} lecții programate. Nu mai poți adăuga.`,
            );
            resetPickState();
            setStage("setup");
            return;
         }

         if (selectedDates.length !== mustSubmitExactly) {
            notify(
               "warn",
               `Trebuie să selectezi exact ${mustSubmitExactly} lecții înainte de trimitere.`,
            );
            setShowList(true);
            return;
         }

         const type = assignedGroupId ? "group" : "instructor";
         const chosenId = assignedGroupId || assignedInstructorId;
         if (!chosenId) {
            notify(
               "error",
               "Nu am entitate aleasă (grup/instructor). Reia setup.",
            );
            resetPickState();
            setStage("setup");
            return;
         }

         // preflight live: detectează race
         const { ok, conflicts } = await preflightSelectedLive(
            selectedDates,
            latestArr,
         );

         if (conflicts.length) {
            setRejected((prev) => mergeRejected(prev, conflicts));
            setSelectedDates(ok);
            setShowList(true);

            // update UI maps
            await doLiveRefresh(true);

            notify(
               "warn",
               `Unele sloturi s-au ocupat între timp (${conflicts.length}). Șterge conflictele și alege altele (sau Auto-complete).`,
            );
            return;
         }

         if (ok.length !== mustSubmitExactly) {
            setSelectedDates(ok);
            setShowList(true);
            notify(
               "warn",
               `După verificare au rămas ${ok.length}/${mustSubmitExactly}. Ajustează selecția.`,
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
            reservations: ok.map((isoDate) => ({
               startTime:
                  BUSY_KEYS_MODE === "local-match"
                     ? isoForDbMatchLocalHour(isoDate)
                     : isoDate,
               sector: String(sector || "Botanica"),
               gearbox: normalizedGearbox,
               isImportant: true,
               privateMessage: "",
               color: "--black-t",
            })),
         };

         notify("info", "Trimit programările...");
         const createFn =
            ReservationsAPI?.createReservations ||
            ReservationsAPI?.createReservationsForUser;
         if (typeof createFn !== "function") {
            throw new Error(
               "createReservations nu există în reservationsService.",
            );
         }

         await createFn(payload);

         // set desired instructor doar dacă lipsește
         try {
            const existingDesired =
               user?.desiredInstructorId ?? user?.desiredInstructor?.id ?? null;

            if (existingDesired == null) {
               let desiredId = null;
               if (type === "instructor") {
                  desiredId = Number(chosenId);
               } else if (type === "group") {
                  const ids = Array.isArray(activeInstructorIds)
                     ? activeInstructorIds.filter(
                          (n) => Number.isInteger(n) && n > 0,
                       )
                     : [];

                  if (String(sector) === "Ciocana" && ids.length >= 2) {
                     desiredId = Number(ids[1]); // al doilea instructor
                  } else if (ids.length === 1) {
                     desiredId = Number(ids[0]);
                  }
               }

               if (desiredId) {
                  await UsersAPI.setDesiredInstructor(desiredId);
               }
            }
         } catch (e) {
            console.warn("[desired-instructor] failed:", e);
         }

         notify("success", `Trimis ${ok.length} programări.`);

         try {
            if (user?.id) {
               const updated = await dispatch(
                  fetchUserReservations(user.id),
               ).unwrap();
               const arr = Array.isArray(updated) ? updated : [];
               setUserReservations(arr);
               setLectiiExistente(arr.length);
            }
         } catch {}

         resetPickState();
         setStage("setup");
         setAutoFlowActive(false);

         safeClose();
         setTimeout(() => {
            window.location.reload();
         }, 0);
      } catch (e) {
         notify("error", "A apărut o eroare la trimitere.");
         if (e?.message) notify("alert", `Detalii: ${e.message}`);

         // fallback: încearcă să detecteze conflictele după eroare
         try {
            await doLiveRefresh(true);
            const latestArr = Array.isArray(userReservations)
               ? userReservations
               : [];
            const { ok, conflicts } = await preflightSelectedLive(
               selectedDates,
               latestArr,
            );

            if (conflicts.length) {
               setRejected((prev) => mergeRejected(prev, conflicts));
               setSelectedDates(ok);
               setShowList(true);
               notify(
                  "warn",
                  `Am detectat sloturi ocupate între timp (${conflicts.length}). Le poți șterge și înlocui (sau Auto-complete).`,
               );
            }
         } catch {}
      } finally {
         setLoading(false);
         submitGuardRef.current = false;
      }
   };

   const handleBack = () => {
      // dacă e autoFlow și ești în pick, back = close (nu revenim la setup)
      if (stage === "pick" && autoFlowActive) {
         if (showList) {
            setShowList(false);
            return;
         }
         safeClose();
         return;
      }

      if (stage === "pick" && showList) {
         setShowList(false);
         return;
      }
      if (stage === "pick") {
         resetPickState();
         setStage("setup");
         return;
      }
      safeClose();
   };

   const showLoadingScreen = initLoading || loading || busyLoading;

   const dayLocal = data ? localDateStrTZ(data, MOLDOVA_TZ) : null;
   const dayIsBooked = !!(dayLocal && bookedDaySet.has(dayLocal));
   const dayIsFullyBlocked = !!(dayLocal && fullyBlockedDaySet.has(dayLocal));

   const liveRefreshLabel = useMemo(() => {
      if (!lastLiveRefreshAt) return "never";
      const d = new Date(lastLiveRefreshAt);
      return d.toLocaleTimeString("ro-RO", {
         hour: "2-digit",
         minute: "2-digit",
      });
   }, [lastLiveRefreshAt]);

   return (
      <>
         <AlertPills messages={messages} onDismiss={dismissLast} />

         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Adaugă programare</h3>
         </div>

         <div className="popup-panel__content">
            {showLoadingScreen ? (
               <div className="saddprogramari__loading">Se încarcă…</div>
            ) : hardLock30 ? (
               <div className="saddprogramari__box">
                  <div className="saddprogramari__info">
                     <b>Ai deja {MAX_TOTAL_LESSONS} lecții programate.</b> Nu
                     mai poți adăuga alte programări.
                  </div>
               </div>
            ) : stage === "setup" ? (
               <>
                  {/* ====== SETUP MANUAL ====== */}
                  <div className="saddprogramari__selector row">
                     <h3 className="saddprogramari__title">
                        Selectează pachetul:
                     </h3>
                     <div
                        className={`instructors-popup__radio-wrapper addprog ${
                           numarLectii === 15
                              ? "active-botanica"
                              : "active-ciocana"
                        }`}
                     >
                        <label
                           htmlFor="lectii-15"
                           style={{ cursor: "pointer" }}
                        >
                           <input
                              id="lectii-15"
                              type="radio"
                              name="lectii"
                              value={15}
                              checked={Number(numarLectii) === 15}
                              onChange={(e) =>
                                 setNumarLectii(Number(e.target.value))
                              }
                           />
                           15 lecții
                        </label>

                        <label
                           htmlFor="lectii-30"
                           style={{ cursor: "pointer" }}
                        >
                           <input
                              id="lectii-30"
                              type="radio"
                              name="lectii"
                              value={30}
                              checked={Number(numarLectii) === 30}
                              onChange={(e) =>
                                 setNumarLectii(Number(e.target.value))
                              }
                           />
                           30 lecții
                        </label>
                     </div>
                  </div>

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
                           />
                           Automat
                        </label>
                     </div>
                  </div>

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
                              disabled
                           />
                           Ciocana
                        </label>
                     </div>
                  </div>

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
                              disabled={sector === "Ciocana"}
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
                           />
                           Unul
                        </label>
                     </div>
                  </div>

                  <button
                     onClick={handleContinue}
                     disabled={busyLoading || loading || remainingTo30 <= 0}
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
               <>
                  {/* ====== PICK ====== */}
                  {/*<div
                     className="saddprogramari__muted-note"
                     style={{ marginBottom: 8 }}
                  >
                     Live refresh: <b>{liveRefreshLabel}</b>
                  </div>*/}

                  {!showList ? (
                     <>
                        <div className="saddprogramari__selector">
                           <div className="saddprogramari__calendar">
                              <h3 className="saddprogramari__title">
                                 Selectează data și ora (3 luni):
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
                                 minDate={minSelectableDate}
                                 maxDate={maxSelectableDate}
                                 filterDate={(date) => {
                                    if (isPastOrTodayInMoldova(date))
                                       return false;

                                    const day = localDateStrTZ(
                                       date,
                                       MOLDOVA_TZ,
                                    );
                                    if (bookedDaySet.has(day)) return false;
                                    if (fullyBlockedDaySet.has(day))
                                       return false;

                                    return true;
                                 }}
                                 dayClassName={(date) => {
                                    const day = localDateStrTZ(
                                       date,
                                       MOLDOVA_TZ,
                                    );
                                    if (isPastOrTodayInMoldova(date))
                                       return "saddprogramari__day--inactive";
                                    if (bookedDaySet.has(day))
                                       return "saddprogramari__day--inactive";
                                    if (fullyBlockedDaySet.has(day))
                                       return "saddprogramari__day--inactive";
                                    return "";
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

                                 {data && dayIsBooked && (
                                    <div className="saddprogramari__disclaimer">
                                       Ai deja o programare în această zi. Alege
                                       altă zi.
                                    </div>
                                 )}

                                 {data && dayIsFullyBlocked && (
                                    <div className="saddprogramari__disclaimer">
                                       Ziua este blocată complet. Alege altă zi.
                                    </div>
                                 )}

                                 {oreDisponibile.map((ora) => {
                                    const key =
                                       data && dayLocal
                                          ? `${dayLocal}|${ora.oraStart}`
                                          : null;

                                    const { used, blocked, total, full, sum } =
                                       key
                                          ? getSlotMeta(key)
                                          : {
                                               used: 0,
                                               blocked: 0,
                                               total: capacity || 1,
                                               full: false,
                                               sum: 0,
                                            };

                                    const alreadyPicked = key
                                       ? selectedKeySet.has(key)
                                       : false;
                                    const isSelected =
                                       oraSelectata?.eticheta === ora.eticheta;

                                    const disabled =
                                       !data ||
                                       dayIsBooked ||
                                       dayIsFullyBlocked ||
                                       reachedPackLimit ||
                                       alreadyPicked ||
                                       full;

                                    let title = "";
                                    if (!data)
                                       title = "Selectează o zi mai întâi";
                                    else if (dayIsBooked)
                                       title =
                                          "Ai deja o programare în această zi";
                                    else if (dayIsFullyBlocked)
                                       title = "Zi blocată complet";
                                    else if (alreadyPicked)
                                       title = "Deja adăugat";
                                    else if (full)
                                       title = `Indisponibil: rez ${used}, bl ${blocked} (sum ${sum}/${total})`;
                                    else if (reachedPackLimit)
                                       title = `Ai atins limita (${requiredSubmitCount}).`;
                                    else
                                       title = `Disponibil: rez ${used}, bl ${blocked} (sum ${sum}/${total})`;

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
                                          title={title}
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
                                 reachedPackLimit ||
                                 dayIsBooked ||
                                 dayIsFullyBlocked
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
                                 rejected.length === 0
                              }
                              title="Vezi lista"
                           >
                              <span>
                                 Lista ({selectedDates.length + rejected.length}
                                 )
                              </span>
                           </button>

                           <button
                              type="button"
                              className="saddprogramari__add-btn list"
                              onClick={() =>
                                 autoCompletePack({ alsoClearConflicts: false })
                              }
                              disabled={
                                 autoFillRunning ||
                                 requiredSubmitCount <= 0 ||
                                 reachedPackLimit
                              }
                              title="Completează automat restul lecțiilor disponibile"
                           >
                              <span>
                                 {autoFillRunning ? "Auto..." : "Auto"}
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
                                 {rejected.length > 0 && (
                                    <span className="saddprogramari__muted-note">
                                       {" "}
                                       · conflicte: {rejected.length}
                                    </span>
                                 )}
                              </h3>

                              <div style={{ display: "flex", gap: 8 }}>
                                 <button
                                    type="button"
                                    className="saddprogramari__ghost-btn"
                                    onClick={() => setShowList(false)}
                                    title="Înapoi la selecție"
                                 >
                                    Înapoi la selecție
                                 </button>

                                 <button
                                    type="button"
                                    className="saddprogramari__ghost-btn"
                                    onClick={() =>
                                       autoCompletePack({
                                          alsoClearConflicts: true,
                                       })
                                    }
                                    disabled={
                                       autoFillRunning ||
                                       requiredSubmitCount <= 0
                                    }
                                    title="Șterge conflictele și completează automat"
                                 >
                                    {autoFillRunning ? "Auto..." : "Auto-fix"}
                                 </button>
                              </div>
                           </div>

                           <div className="saddprogramari__added">
                              {selectedDates.length + rejected.length === 0 ? (
                                 <div className="saddprogramari__disclaimer">
                                    Nu ai selectat încă nicio lecție.
                                 </div>
                              ) : (
                                 <ul className="saddprogramari__added-list">
                                    {rejected.map((x, i) => {
                                       const iso = x.iso;
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
                                                   <div className="saddprogramari__muted-note">
                                                      {x.reason || "Conflict"}
                                                   </div>

                                                   <ReactSVG
                                                      onClick={() =>
                                                         setConfirmDeleteKey(
                                                            key,
                                                         )
                                                      }
                                                      role="button"
                                                      tabIndex={0}
                                                      focusable="true"
                                                      aria-label="Șterge conflictul"
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
                                                         stergeRejected(iso)
                                                      }
                                                   >
                                                      Șterge
                                                   </button>
                                                   <button
                                                      type="button"
                                                      className="btn btn-secondary"
                                                      onClick={() =>
                                                         setConfirmDeleteKey(
                                                            null,
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
                                                            key,
                                                         )
                                                      }
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
                                                         stergeSelected(iso)
                                                      }
                                                   >
                                                      Șterge
                                                   </button>
                                                   <button
                                                      type="button"
                                                      className="btn btn-secondary"
                                                      onClick={() =>
                                                         setConfirmDeleteKey(
                                                            null,
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
                           loading ||
                           requiredSubmitCount <= 0
                        }
                        className="saddprogramari__add-btn arrow"
                        type="button"
                     >
                        <span>
                           {loading
                              ? "Se trimit..."
                              : `Trimite ${selectedDates.length} prog.`}
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
