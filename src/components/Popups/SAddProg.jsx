// src/components/Student/SAddProg.jsx
import React, { useState, useContext, useEffect, useMemo } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import addIcon from "../../assets/svg/add.svg";
import arrowIcon from "../../assets/svg/arrow.svg";
import trashIcon from "../../assets/svg/trash.svg";
import { ReactSVG } from "react-svg";
import { createReservations } from "../../api/reservationsService";
import { UserContext } from "../../UserContext";
import { useDispatch, useSelector } from "react-redux";
import {
   fetchUserReservations,
   fetchBusy,
} from "../../store/reservationsSlice";
import AlertPills from "../Utils/AlertPills";

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
   });

const asStr = (v) => (v == null ? "" : String(v));
const asStrLower = (v) => asStr(v).trim().toLowerCase();
const cap = (s) => (!s ? s : s.charAt(0).toUpperCase() + s.slice(1));
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
/** ISO UTC (“Z”) din local date + HH:mm */
const toUtcIsoFromLocal = (localDateObj, timeStrHHMM) => {
   const [hh, mm] = timeStrHHMM.split(":").map(Number);
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

/** ancoră din istoricul userului (sector, cutie, tip + id entitate) */
const deriveAnchor = (rez) => {
   if (!rez?.length) return null;
   const R = rez[0];
   const gid = R?.instructorsGroupId ?? R?.groupId ?? R?.group?.id ?? null;
   const iid =
      R?.instructorId ??
      R?.teacherId ??
      R?.instructor?.id ??
      R?.teacher?.id ??
      null;
   const tip = gid != null ? "group" : "single";
   const entityId =
      gid != null ? String(gid) : iid != null ? String(iid) : null;
   const sectorRaw = R?.sector ?? R?.Sector ?? "Botanica";
   const sector =
      String(sectorRaw).toLowerCase() === "ciocana" ? "Ciocana" : "Botanica";
   const gearboxRaw = R?.gearbox ?? R?.Gearbox ?? "Manual";
   const gearbox = String(gearboxRaw).toLowerCase().includes("auto")
      ? "automat"
      : "manual";
   return { tip, entityId, sector, gearbox };
};

/** normalizează răspunsul /busy-reservation */
function normalizeBusy(raw) {
   const out = [];
   const pushVariant = (entityType, entityId, reservations) => {
      const busyISO = [];
      for (const r of reservations || []) {
         const st =
            r?.startTime ??
            r?.start ??
            r?.start_time ??
            r?.dateTime ??
            r?.datetime ??
            r?.date ??
            r?.begin ??
            null;
         if (st) busyISO.push(new Date(st).toISOString());
      }
      out.push({
         entityType,
         entityId: entityId != null ? String(entityId) : null,
         busyISO,
      });
   };

   if (Array.isArray(raw)) {
      for (const item of raw) {
         if (item && Array.isArray(item.reservations)) {
            if (item.groupId != null)
               pushVariant("group", item.groupId, item.reservations);
            else if (item.instructorId != null)
               pushVariant("instructor", item.instructorId, item.reservations);
            else pushVariant(null, null, item.reservations);
         } else if (item && (item.startTime || item.start || item.dateTime)) {
            pushVariant(null, null, raw);
            break;
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
      pushVariant(t, id, raw.reservations);
   }
   return out;
}

/** grilă completă (UTC ISO “Z”), pornind de mâine — azi este blocat */
function buildFullGridISO(daysWindow = 120) {
   const startFrom = addDays(new Date(), 1);
   const daysArr = nextNDays(daysWindow, startFrom);
   const out = [];
   for (const day of daysArr)
      for (const t of oreDisponibile)
         out.push(new Date(`${day}T${t.oraStart}:00.000Z`).toISOString());
   return out;
}

/* ————— Componentă ————— */
export default function SAddProg({ onClose }) {
   /* ALERT PILLS */
   const [messages, setMessages] = useState([]);
   const [debugArmed, setDebugArmed] = useState(false); // ⟵ devine true abia la „Continuă”
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
   const [anchor, setAnchor] = useState(null);
   const [hardLock30, setHardLock30] = useState(false);

   /* Etapa 2 */
   const [stage, setStage] = useState("setup"); // setup | pick
   const [assignedGroupId, setAssignedGroupId] = useState(null);
   const [assignedInstructorId, setAssignedInstructorId] = useState(null);
   const [freeSlotsForAssigned, setFreeSlotsForAssigned] = useState([]); // ISO[]
   const [selectedDates, setSelectedDates] = useState([]); // ISO[]
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
            const hh = String(d.getUTCHours()).padStart(2, "0");
            const mm = String(d.getUTCMinutes()).padStart(2, "0");
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
            const hh = String(d.getUTCHours()).padStart(2, "0");
            const mm = String(d.getUTCMinutes()).padStart(2, "0");
            set.add(`${hh}:${mm}`);
         }
      }
      return set;
   }, [data, selectedDates, dayLocal]);

   /* La montare: doar încărcăm istoricul pentru ancoră. NU pornim căutarea! */
   useEffect(() => {
      let alive = true;
      (async () => {
         try {
            if (user?.id) {
               const existing = await dispatch(fetchUserReservations(user.id))
                  .unwrap()
                  .catch(() => []);
               if (!alive) return;

               const count = existing?.length || 0;
               setLectiiExistente(count);
               if (count >= 30) {
                  setHardLock30(true);
                  setInitLoading(false);
                  return;
               }

               if (existing?.length) {
                  const a = deriveAnchor(existing);
                  setAnchor(a);
                  setCutie(a.gearbox);
                  setSector(a.sector);
                  setTip(a.tip);
                  // NU mai chemăm continuaEtapa2 aici. Așteptăm „Continuă”.
               }
            }
         } finally {
            if (alive) setInitLoading(false);
         }
      })();
      return () => {
         alive = false;
      };
   }, [user?.id, dispatch]);

   useEffect(() => {
      if (anchor) return;
      if (sector === "Ciocana") setTip("single");
      setStage("setup");
      setAssignedGroupId(null);
      setAssignedInstructorId(null);
      setFreeSlotsForAssigned([]);
      setSelectedDates([]);
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

   const isProbablyEvent = (x) =>
      x &&
      typeof x === "object" &&
      ("nativeEvent" in x ||
         "preventDefault" in x ||
         "isDefaultPrevented" in x);
   const isValidAnchor = (a) =>
      a &&
      typeof a === "object" &&
      a.tip &&
      a.sector &&
      a.gearbox &&
      a.entityId != null;

   /* Pornește căutarea DOAR când utilizatorul apasă „Continuă” */
   const handleClickContinue = async () => {
      setDebugArmed(true); // de aici încolo afișăm debug/info din fetch
      await continuaEtapa2();
   };

   const continuaEtapa2 = async (maybeAnchor = undefined) => {
      if (hardLock30 || lectiiExistente >= 30) {
         notify("warn", "Ai deja 30 de lecții programate. Nu mai poți adăuga.");
         return;
      }
      setLoading(true);
      try {
         const candidate = isProbablyEvent(maybeAnchor)
            ? undefined
            : maybeAnchor;
         const lock = candidate || anchor;
         const useAnchor = isValidAnchor(lock);

         if (!numarLectii) {
            notify("warn", "Alege pachetul (15 sau 30).");
            return;
         }

         const qGearbox = useAnchor ? lock.gearbox : cutie;
         const qSector = useAnchor ? lock.sector : sector;
         const qType = useAnchor ? lock.tip : tip;

         const query = {
            days: asStr(numarLectii),
            gearbox: asStrLower(qGearbox),
            sector: asStrLower(qSector),
            type: asStrLower(qType),
         };

         notify("info", "Caut disponibilitatea...");
         const res = await dispatch(fetchBusy(query)).unwrap();
         const variants = normalizeBusy(res.data);
         if (!variants.length) {
            notify("error", "Nu am primit date de ocupații.");
            return;
         }

         let list = variants.filter((v) =>
            qType === "group"
               ? v.entityType === "group"
               : v.entityType === "instructor"
         );
         if (!list.length) {
            notify("error", "Nu am putut găsi tipul dorit în ocupații.");
            return;
         }

         if (useAnchor) {
            const anchorType = lock.tip === "group" ? "group" : "instructor";
            const onlyAnchor = list.filter(
               (v) =>
                  v.entityType === anchorType &&
                  String(v.entityId) === String(lock.entityId)
            );
            if (!onlyAnchor.length) {
               notify(
                  "error",
                  "Nu am găsit grupa/instructorul tău în ocupații."
               );
               return;
            }
            list = onlyAnchor;
         }

         const fullGrid = buildFullGridISO(WINDOW_DAYS);
         const scored = list.map((v) => {
            const busySet = new Set(v.busyISO);
            const free = fullGrid.filter((iso) => !busySet.has(iso));
            return { ...v, free };
         });

         scored.sort((a, b) => b.free.length - a.free.length);
         const best = scored[0];
         if (!best?.free?.length) {
            notify("warn", "Nu există sloturi libere în perioada vizată.");
            return;
         }

         if (qType === "group") {
            setAssignedGroupId(String(best.entityId));
            setAssignedInstructorId(null);
            notify("success", `S-a selectat grupa #${best.entityId}.`);
         } else {
            setAssignedInstructorId(String(best.entityId));
            setAssignedGroupId(null);
            notify("success", `S-a selectat instructorul #${best.entityId}.`);
         }

         setFreeSlotsForAssigned(best.free);
         setStage("pick");
         setShowList(false);
      } catch (err) {
         notify("error", "Nu am putut încărca ocupațiile.");
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
         notify(
            "warn",
            "Nu poți programa pentru AZI. Alege o dată începând de mâine.",
            { force: true }
         );
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
         notify("warn", `Ai atins limita pachetului (${numarLectii}).`, {
            force: true,
         });
         return;
      }

      const iso = toUtcIsoFromLocal(data, oraSelectata.oraStart);
      if (!freeSet.has(iso)) {
         notify("error", "Slot indisponibil.", { force: true });
         return;
      }
      if (selectedDates.includes(iso)) return;

      setSelectedDates((prev) => [...prev, iso]);
      notify(
         "success",
         `Adăugat: ${formatDateRO(iso)} la ${formatTimeRO(iso)}.`,
         { force: true }
      );
      setData(null);
      setOraSelectata(null);
   };

   const stergeProgramare = (iso) => {
      setSelectedDates((prev) => {
         const next = prev.filter((p) => p !== iso);
         if (next.length === 0 && showList) setShowList(false);
         return next;
      });
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
         const poateAdauga = 30 - existingCount;
         if (selectedDates.length > poateAdauga) {
            notify("warn", `Poți adăuga cel mult ${poateAdauga} lecții acum.`, {
               force: true,
            });
            return;
         }

         const type =
            (isLocked ? anchor?.tip : tip) === "group" ? "group" : "instructor";
         let chosenId = null;
         if (type === "group") {
            chosenId = isLocked ? anchor?.entityId : assignedGroupId;
            if (!chosenId) {
               notify("error", "Nu am un 'instructorsGroupId' selectat.", {
                  force: true,
               });
               return;
            }
         } else {
            chosenId = isLocked ? anchor?.entityId : assignedInstructorId;
            if (!chosenId) {
               notify("error", "Nu am un 'instructorId' selectat.", {
                  force: true,
               });
               return;
            }
         }

         const topLevel = {};
         if (type === "group") topLevel.instructorsGroupId = Number(chosenId);
         else topLevel.instructorId = Number(chosenId);

         const uiSector = isLocked ? anchor?.sector : sector;
         const uiGearbox = isLocked ? anchor?.gearbox : cutie;
         const normalizedGearbox =
            (uiGearbox || "").toLowerCase() === "automat"
               ? "Automat"
               : "Manual";

         const payload = {
            ...topLevel,
            reservations: selectedDates.map((isoDate) => ({
               startTime: String(isoDate),
               sector: String(uiSector || "Botanica"),
               gearbox: normalizedGearbox,
               privateMessage: "",
               color: "#FF5733",
            })),
         };

         notify("info", "Trimit programările...", { force: true });
         await createReservations(payload);

         notify("success", `Trimis ${selectedDates.length} programări.`, {
            force: true,
         });
         onClose?.();
         setTimeout(() => {
            if (typeof window !== "undefined") window.location.reload();
         }, 50);
      } catch (e) {
         notify("error", "A apărut o eroare la trimitere.", { force: true });
         if (e?.message)
            notify("debug", `Detalii: ${e.message}`, { force: true });
      } finally {
         setLoading(false);
      }
   };

   const maxSelectableDate = useMemo(
      () => addDays(new Date(), WINDOW_DAYS - 1),
      [WINDOW_DAYS]
   );
   const onKeyActivate = (fn) => (e) => {
      if (e.key === "Enter" || e.key === " ") {
         e.preventDefault();
         fn();
      }
   };

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
                        <div className="saddprogramari__selector">
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
                                 disabled={selectedDates.length === 0}
                                 title="Vezi lista"
                              >
                                 <span>
                                    Vezi lista ({selectedDates.length})
                                 </span>
                              </button>
                           </div>
                        </div>
                     </>
                  ) : (
                     <>
                        <div className="saddprogramari__selector">
                           <div className="saddprogramari__header-row">
                              <h3 className="saddprogramari__title saddprogramari__title--mt-12">
                                 Lecții selectate: {selectedDates.length} /{" "}
                                 {numarLectii}
                                 <span className="saddprogramari__muted-note">
                                    (rămase:{" "}
                                    {Math.max(
                                       0,
                                       numarLectii - selectedDates.length
                                    )}
                                    )
                                 </span>
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
                              {selectedDates.length === 0 ? (
                                 <div className="saddprogramari__disclaimer">
                                    Nu ai selectat încă nicio lecție.
                                 </div>
                              ) : (
                                 <ul className="saddprogramari__added-list">
                                    {selectedDates.map((iso, i) => {
                                       const key = makeKey(iso, i);
                                       const isConfirming =
                                          confirmDeleteKey === key;

                                       return (
                                          <li
                                             key={i}
                                             className={
                                                "saddprogramari__added-item" +
                                                (isConfirming
                                                   ? " saddprogramari__added-item--confirm"
                                                   : "")
                                             }
                                          >
                                             {isConfirming ? (
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
                                             ) : (
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
                                                      onKeyDown={onKeyActivate(
                                                         () =>
                                                            setConfirmDeleteKey(
                                                               key
                                                            )
                                                      )}
                                                      role="button"
                                                      tabIndex={0}
                                                      focusable="true"
                                                      aria-label="Șterge programarea"
                                                      type="button"
                                                      src={trashIcon}
                                                      className="saddprogramari__add-btn-icon delete"
                                                   />
                                                </>
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
                           selectedDates.length !== numarLectii || loading
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
