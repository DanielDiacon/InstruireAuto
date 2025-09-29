// src/components/Student/SAddProg.jsx
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
   getUserReservations,
   getBusyForInstructor,
   getBusyForInstructorsGroup,
} from "../../api/reservationsService";
import { UserContext } from "../../UserContext";
import { useDispatch, useSelector } from "react-redux";
import {
   fetchUserReservations,
   fetchBusy,
} from "../../store/reservationsSlice";
import AlertPills from "../Utils/AlertPills";

/* ===== Locale RO ca în componenta A ===== */
registerLocale("ro", ro);

/* ————— Utilitare ————— */
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

const SLOT_MINUTES = 90;

const capRO = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const formatDateRO = (iso) => {
   const d = new Date(iso);
   const zi = d.getDate();
   const luna = capRO(d.toLocaleDateString("ro-RO", { month: "short" }));
   const an = d.getFullYear();
   return `${zi} ${luna} ${an}`;
};
const formatTimeRO = (iso) =>
   new Date(iso).toLocaleTimeString("ro-RO", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
   });

const asStr = (v) => (v == null ? "" : String(v));
const asStrLower = (v) => asStr(v).trim().toLowerCase();
const localDateStr = (d) =>
   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
   ).padStart(2, "0")}`;
const addDays = (d, n) => {
   const x = new Date(d);
   x.setDate(x.getDate() + n);
   return x;
};
const nextNDays = (n, fromDate = new Date()) => {
   const out = [];
   const base = new Date(fromDate);
   base.setHours(0, 0, 0, 0);
   for (let i = 0; i < n; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      out.push(localDateStr(d));
   }
   return out;
};

/** Construiește ISO (UTC "Z") din data LOCALĂ + HH:mm (ex: 07:00 ora RO) fără să folosim Date.UTC */
const toUtcIsoFromLocal = (localDateObj, timeStrHHMM) => {
   const [hh, mm] = timeStrHHMM.split(":").map(Number);
   const d = new Date(localDateObj); // 00:00 local
   d.setHours(hh, mm, 0, 0); // setăm ora locală
   return d.toISOString(); // serializăm în ISO "Z"
};

/** Date local (00:00) din "YYYY-MM-DD" */
const localDateObjFromStr = (s) => {
   const [y, m, d] = s.split("-").map(Number);
   return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
};

/** extrage startTime din obiecte cu forme variabile */
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

const overlaps = (aStart, aEnd, bStart, bEnd) =>
   new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);

/** grilă completă (ISO corect), pornind de mâine — azi este blocat */
function buildFullGridISO(daysWindow = 120) {
   const startFrom = addDays(new Date(), 1);
   const daysArr = nextNDays(daysWindow, startFrom);
   const out = [];
   for (const day of daysArr) {
      const dObj = localDateObjFromStr(day);
      for (const t of oreDisponibile) {
         out.push(toUtcIsoFromLocal(dObj, t.oraStart)); // local -> UTC ISO
      }
   }
   return out;
}
const uniq = (arr) => Array.from(new Set(arr));

/* ===== Praguri „ancoră dominantă” ===== */
const MIN_FOR_LOCK = 15;
const DOMINANCE = 0.8;
const SMALL_MANAGER_MAX = 2;

/* ===== Helpers ancoră dominantă ===== */
const keyForReservation = (r) => {
   const gid = r?.instructorsGroupId ?? r?.groupId ?? r?.group?.id ?? null;
   const iid =
      r?.instructorId ??
      r?.teacherId ??
      r?.instructor?.id ??
      r?.teacher?.id ??
      null;
   if (gid != null) return { type: "group", id: String(gid) };
   if (iid != null) return { type: "instructor", id: String(iid) };
   return { type: null, id: null };
};

function findDominantAnchor(resList = []) {
   if (!resList.length) return null;

   const counts = new Map(); // `${type}:${id}` -> { type, id, count }
   for (const r of resList) {
      const { type, id } = keyForReservation(r);
      if (!type || !id) continue;
      const k = `${type}:${id}`;
      const cur = counts.get(k) || { type, id, count: 0 };
      cur.count += 1;
      counts.set(k, cur);
   }

   const total = resList.length;
   if (total <= SMALL_MANAGER_MAX) return null;

   let best = null;
   for (const v of counts.values()) if (!best || v.count > best.count) best = v;
   if (!best) return null;

   const dominance = best.count / total;
   if (total >= MIN_FOR_LOCK && dominance >= DOMINANCE) {
      const same = resList.find((r) => {
         const { type, id } = keyForReservation(r);
         return type === best.type && String(id) === String(best.id);
      });
      const sectorRaw = same?.sector ?? "Botanica";
      const sector =
         String(sectorRaw).toLowerCase() === "ciocana" ? "Ciocana" : "Botanica";
      const gearboxRaw = same?.gearbox ?? "Manual";
      const gearbox = String(gearboxRaw).toLowerCase().includes("auto")
         ? "automat"
         : "manual";

      return {
         tip: best.type === "group" ? "group" : "single",
         entityId: best.id,
         sector,
         gearbox,
      };
   }
   return null;
}

/** busy pentru o entitate: întoarce atât setul de start-uri, cât și intervalele */
/** busy pentru o entitate: întoarce set start-uri, intervale și capacitatea (total_instructors pt. grup) */
async function fetchBusyForEntity(entityType, entityId) {
   if (!entityType || !entityId)
      return { busySet: new Set(), busyIntervals: [], capacity: 1 };

   const payload =
      entityType === "group"
         ? await getBusyForInstructorsGroup(entityId)
         : await getBusyForInstructor(entityId);

   const src = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.reservations)
      ? payload.reservations
      : [];

   const starts = [];
   const intervals = [];
   for (const r of src) {
      const st = getStartFromReservation(r);
      const en = getEndFromReservation(r);
      if (st) starts.push(new Date(st).toISOString());
      if (st && en) intervals.push([new Date(st), new Date(en)]);
   }

   // capacitate: 1 pentru instructor; pentru group luăm total_instructors (fallback 1)
   const capacity =
      entityType === "group" ? Number(payload?.total_instructors) || 1 : 1;

   return { busySet: new Set(starts), busyIntervals: intervals, capacity };
}

/* ————— Componentă ————— */
export default function SAddProg({ onClose }) {
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

   /* Etapa 1: opțiuni */
   const [numarLectii, setNumarLectii] = useState(15);
   const [cutie, setCutie] = useState("manual");
   const [sector, setSector] = useState("Botanica");
   const [tip, setTip] = useState("group");
   const WINDOW_DAYS = 120;
   const [anchor, setAnchor] = useState(null); // { tip, entityId, sector, gearbox }
   const [hardLock30, setHardLock30] = useState(false);

   /* Etapa 2 */
   const [stage, setStage] = useState("setup"); // setup | pick
   const [assignedGroupId, setAssignedGroupId] = useState(null);
   const [assignedInstructorId, setAssignedInstructorId] = useState(null);
   const [freeSlotsForAssigned, setFreeSlotsForAssigned] = useState([]); // ISO[]
   const [selectedDates, setSelectedDates] = useState([]); // ISO[]
   const [rejectedDates, setRejectedDates] = useState([]); // ISO[] (conflicte)
   const [loading, setLoading] = useState(false);
   const [initLoading, setInitLoading] = useState(true);
   const [showList, setShowList] = useState(false);
   const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
   const makeKey = (iso, idx) => `${iso}__${idx}`;

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

   const freeByDay = useMemo(() => {
      const map = new Map();
      for (const iso of freeSlotsForAssigned) {
         const key = localDateStr(new Date(iso));
         map.set(key, (map.get(key) || 0) + 1);
      }
      return map;
   }, [freeSlotsForAssigned]);

   const dayLocal = data ? localDateStr(data) : null;

   const freeTimesForDay = useMemo(() => {
      if (!data) return new Set();
      const set = new Set();
      for (const iso of freeSlotsForAssigned) {
         const d = new Date(iso);
         if (localDateStr(d) === dayLocal) {
            const hh = String(d.getHours()).padStart(2, "0"); // LOCAL, nu UTC
            const mm = String(d.getMinutes()).padStart(2, "0"); // LOCAL, nu UTC
            set.add(`${hh}:${mm}`);
         }
      }
      return set;
   }, [data, freeSlotsForAssigned, dayLocal]);

   const selectedTimesForDay = useMemo(() => {
      if (!data) return new Set();
      const set = new Set();
      for (const iso of selectedDates) {
         const d = new Date(iso);
         if (localDateStr(d) === dayLocal) {
            const hh = String(d.getHours()).padStart(2, "0"); // LOCAL
            const mm = String(d.getMinutes()).padStart(2, "0"); // LOCAL
            set.add(`${hh}:${mm}`);
         }
      }
      return set;
   }, [data, selectedDates, dayLocal]);

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
               setCutie(dom.gearbox); // "manual"/"automat"
               setSector(dom.sector); // "Botanica"/"Ciocana"
               setTip(dom.tip); // "group"/"single"

               if (dom.tip === "group") {
                  setAssignedGroupId(String(dom.entityId));
                  setAssignedInstructorId(null);
               } else {
                  setAssignedInstructorId(String(dom.entityId));
                  setAssignedGroupId(null);
               }

               const fullGrid = buildFullGridISO(WINDOW_DAYS);
               const { busyIntervals, capacity } = await fetchBusyForEntity(
                  dom.tip,
                  dom.entityId
               );

               const free = fullGrid.filter((iso) => {
                  const start = new Date(iso);
                  const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
                  let overlaps = 0;
                  for (const [s, e] of busyIntervals) {
                     if (start < e && end > s) {
                        overlaps++;
                        if (overlaps >= capacity) return false; // slot plin
                     }
                  }
                  return true; // încă sub capacitate
               });

               setFreeSlotsForAssigned(free);
               setStage("pick");
            } else {
               if (existing?.length) {
                  const R = existing[0];
                  const sectorRaw = R?.sector ?? "Botanica";
                  const gearboxRaw = R?.gearbox ?? "Manual";
                  setCutie(
                     String(gearboxRaw).toLowerCase().includes("auto")
                        ? "automat"
                        : "manual"
                  );
                  setSector(
                     String(sectorRaw).toLowerCase() === "ciocana"
                        ? "Ciocana"
                        : "Botanica"
                  );
               }
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
   }, [user?.id, dispatch]);

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
   }, [sector, cutie, tip, anchor]);

   useEffect(() => {
      if (!showList) setConfirmDeleteKey(null);
   }, [showList]);

   const isLocked = !!anchor;
   const reachedMax30 = useMemo(
      () => lectiiExistente + selectedDates.length >= 30,
      [lectiiExistente, selectedDates.length]
   );
   const reachedPackLimit = useMemo(
      () => numarLectii === 15 && selectedDates.length >= 15,
      [numarLectii, selectedDates.length]
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

   /** încarcă grila liberă pentru entitatea aleasă/ancoră (cu SUPRAPUNERE 90min) */
   const continuaEtapa2 = async () => {
      if (hardLock30 || lectiiExistente >= 30) {
         notify("warn", "Ai deja 30 de lecții programate.");
         return;
      }
      setLoading(true);
      try {
         const fullGrid = buildFullGridISO(WINDOW_DAYS);

         // 1) avem ancoră → doar busy + filtrare pe suprapunere
         if (anchor?.tip && anchor?.entityId) {
            const { busyIntervals } = await fetchBusyForEntity(
               anchor.tip,
               anchor.entityId
            );
            const free = fullGrid.filter((iso) => {
               const start = new Date(iso);
               const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
               for (const [s, e] of busyIntervals)
                  if (start < e && end > s) return false;
               return true;
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
            setStage("pick");
            setShowList(false);
            return;
         }

         // 2) altfel: agregare disponibilitate din backend și scorare
         const query = {
            days: asStr(numarLectii),
            gearbox: asStrLower(cutie),
            sector: asStrLower(sector),
            type: asStrLower(tip),
         };
         const res = await dispatch(fetchBusy(query)).unwrap();
         //console.log("busy info taken:", res);
         // normalizează: listă de { entityType, entityId, busyIntervals[] }
         const normalizeBusy = (raw) => {
            const out = [];
            const pushVariant = (
               entityType,
               entityId,
               reservations,
               total_instructors
            ) => {
               const intervals = [];
               for (const r of reservations || []) {
                  const st = getStartFromReservation(r);
                  const en = getEndFromReservation(r);
                  if (st && en) intervals.push([new Date(st), new Date(en)]);
               }
               out.push({
                  entityType,
                  entityId: entityId != null ? String(entityId) : null,
                  intervals,
                  capacity:
                     entityType === "group"
                        ? Number(total_instructors) || 1
                        : 1,
               });
            };

            if (Array.isArray(raw)) {
               for (const item of raw) {
                  if (item && Array.isArray(item.reservations)) {
                     if (item.groupId != null)
                        pushVariant(
                           "group",
                           item.groupId,
                           item.reservations,
                           item.total_instructors
                        );
                     else if (item.instructorId != null)
                        pushVariant(
                           "instructor",
                           item.instructorId,
                           item.reservations,
                           1
                        );
                  }
               }
            } else if (raw && Array.isArray(raw.reservations)) {
               const t =
                  raw.groupId != null
                     ? "group"
                     : raw.instructorId != null
                     ? "instructor"
                     : null;
               const id = raw.groupId ?? raw.instructorId ?? null;
               pushVariant(t, id, raw.reservations, raw.total_instructors);
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

         const scored = list
            .map((v) => {
               const free = fullGrid.filter((iso) => {
                  const start = new Date(iso);
                  const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
                  let overlaps = 0;
                  for (const [s, e] of v.intervals) {
                     if (start < e && end > s) {
                        overlaps++;
                        if (overlaps >= (v.capacity || 1)) return false;
                     }
                  }
                  return true;
               });
               return { ...v, free };
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
         setStage("pick");
         setShowList(false);
      } catch (err) {
         notify("error", "Nu am putut încărca disponibilitatea.");
         if (err?.message) notify("debug", `Detalii: ${err.message}`);
      } finally {
         setLoading(false);
      }
   };

   const freeSet = useMemo(
      () => new Set(freeSlotsForAssigned),
      [freeSlotsForAssigned]
   );

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
      if (reachedMax30) {
         notify("warn", "Ai atins limita maximă de 30 lecții!", {
            force: true,
         });
         return;
      }
      if (reachedPackLimit) {
         notify("warn", `Ai atins limita pachetului (${numarLectii}).`, {
            force: true,
         });
         return;
      }

      const iso = toUtcIsoFromLocal(data, oraSelectata.oraStart);
      if (!freeSet.has(iso)) {
         notify(
            "error",
            "Slot indisponibil (ocupat sau retras). Alege altă oră.",
            {
               force: true,
            }
         );
         return;
      }
      if (selectedDates.includes(iso)) return;

      setRejectedDates((prev) => prev.filter((p) => p !== iso));
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

   const stergeProgramare = (iso) => {
      setSelectedDates((prev) => prev.filter((p) => p !== iso));
      setRejectedDates((prev) => prev.filter((p) => p !== iso));
      setConfirmDeleteKey(null);
      notify("info", `Șters: ${formatDateRO(iso)} la ${formatTimeRO(iso)}.`, {
         force: true,
      });
   };

   /** preflight: verifică SUPRAPUNERE (nu doar egalitate) cu ocupațiile curente */
   const preflightConflicts = async (datesISO) => {
      const entityType =
         anchor?.tip || (assignedGroupId ? "group" : "instructor");
      const entityId =
         anchor?.entityId || assignedGroupId || assignedInstructorId;
      if (!entityType || !entityId) return { free: datesISO, conflicts: [] };

      const { busyIntervals, capacity } = await fetchBusyForEntity(
         entityType,
         entityId
      );
      const cap = capacity || 1;

      const conflicts = [];
      const free = [];
      for (const iso of datesISO) {
         const start = new Date(iso);
         const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
         let overlaps = 0;
         for (const [s, e] of busyIntervals) {
            if (start < e && end > s) {
               overlaps++;
               if (overlaps >= cap) break;
            }
         }
         (overlaps >= cap ? conflicts : free).push(iso);
      }
      return { free, conflicts };
   };

   /* ===================== „prima oară” ===================== */
   const mustReachMin15 = useMemo(
      () => lectiiExistente < 15,
      [lectiiExistente]
   );
   const requiredSubmitCount = useMemo(
      () => (mustReachMin15 ? 15 : 1),
      [mustReachMin15]
   );
   /* ======================================================== */

   const trimiteProgramari = async () => {
      setLoading(true);
      try {
         // limite 30
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

         if (mustReachMin15 && selectedDates.length < 15) {
            notify(
               "warn",
               `Trebuie să selectezi minim 15 lecții (mai ai nevoie de ${
                  15 - selectedDates.length
               }).`,
               { force: true }
            );
            setShowList(true);
            return;
         }

         const poateAdauga = 30 - existingCount;
         if (selectedDates.length > poateAdauga) {
            notify("warn", `Poți adăuga cel mult ${poateAdauga} lecții acum.`, {
               force: true,
            });
            return;
         }

         // entitatea finală
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

         // ==== PRE-FLIGHT cu SUPRAPUNERE ====
         const { free: preflightFree, conflicts: preflightTaken } =
            await preflightConflicts(selectedDates);

         if (preflightTaken.length) {
            dropFromFreeSlots(preflightTaken);
            setRejectedDates((prev) => uniq([...prev, ...preflightTaken]));
            setSelectedDates(preflightFree);
            setShowList(true);
            notify(
               "warn",
               `Am scos ${preflightTaken.length} sloturi deja ocupate.`,
               {
                  force: true,
               }
            );
         }

         if (mustReachMin15 && preflightFree.length < 15) {
            notify(
               "error",
               `Au rămas doar ${preflightFree.length}/15 libere. Adaugă încă ${
                  15 - preflightFree.length
               } și reîncearcă.`,
               { force: true }
            );
            return;
         }

         if (preflightFree.length === 0) return;

         const normalizedGearbox =
            (cutie || "").toLowerCase() === "automat" ? "Automat" : "Manual";
         const topLevel =
            type === "group"
               ? { instructorsGroupId: Number(chosenId) }
               : { instructorId: Number(chosenId) };
         const payload = {
            ...topLevel,
            reservations: preflightFree.map((isoDate) => ({
               startTime: String(isoDate),
               sector: String(sector || "Botanica"),
               gearbox: normalizedGearbox,
               privateMessage: "",
               color: "#FF5733",
            })),
         };

         try {
            notify("info", "Trimit programările...", { force: true });
            await createReservations(payload);
            notify("success", `Trimis ${preflightFree.length} programări.`, {
               force: true,
            });
            if (rejectedDates.length === 0) onClose?.();
            else setShowList(true);
            setSelectedDates([]);
         } catch (e) {
            // concurență: revalidăm acum pe SUPRAPUNERE
            const { busyIntervals: busy2 } = await fetchBusyForEntity(
               type,
               chosenId
            );
            const nowConflicts = preflightFree.filter((iso) => {
               const start = new Date(iso);
               const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
               for (const [s, e] of busy2)
                  if (start < e && end > s) return true;
               return false;
            });

            const stillOk = preflightFree.filter(
               (iso) => !nowConflicts.includes(iso)
            );

            if (nowConflicts.length) {
               dropFromFreeSlots(nowConflicts);
               setRejectedDates((prev) => uniq([...prev, ...nowConflicts]));
               notify(
                  "warn",
                  `Unele sloturi s-au ocupat între timp (${nowConflicts.length}).`,
                  {
                     force: true,
                  }
               );
            }
            if (stillOk.length) {
               const retryPayload = {
                  ...topLevel,
                  reservations: stillOk.map((isoDate) => ({
                     startTime: String(isoDate),
                     sector: String(sector || "Botanica"),
                     gearbox: normalizedGearbox,
                     privateMessage: "",
                     color: "#FF5733",
                  })),
               };
               await createReservations(retryPayload);
               notify(
                  "success",
                  `Trimis ${stillOk.length} programări.${
                     mustReachMin15 && stillOk.length < 15
                        ? " Atenție: <15 au rămas libere în timpul trimiterii."
                        : ""
                  }`,
                  { force: true }
               );
               setSelectedDates([]);
               setShowList(true);
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
      else onClose?.();
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
                  <button
                     onClick={onClose}
                     className="saddprogramari__add-btn"
                     type="button"
                  >
                     Închide
                  </button>
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
                              disabled={isLocked || lectiiExistente >= 15}
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
                                 minDate={addDays(new Date(), 1)} // NU permite azi
                                 maxDate={maxSelectableDate}
                                 dayClassName={(date) => {
                                    const day = localDateStr(date);
                                    if (bookedDaySet.has(day))
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
                                 selectedDates.length >= numarLectii
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
                                 {numarLectii}
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
                                    {/* întâi conflictele (roșii) */}
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
                                                      type="button"
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

                                    {/* apoi cele ok */}
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
                                                      type="button"
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
                           selectedDates.length < requiredSubmitCount || loading
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
