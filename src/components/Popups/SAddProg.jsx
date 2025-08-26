// src/components/Student/SAddProg.jsx
import React, { useState, useContext, useEffect, useMemo } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import addIcon from "../../assets/svg/add.svg";
import arrowIcon from "../../assets/svg/arrow.svg";
import { ReactSVG } from "react-svg";
import { createReservations } from "../../api/reservationsService";
import { UserContext } from "../../UserContext";
import { useDispatch, useSelector } from "react-redux";
import {
   fetchUserReservations,
   fetchBusy,
} from "../../store/reservationsSlice";

const oreDisponibile = [
   { eticheta: "07:00 - 08:30", oraStart: "07:00" },
   { eticheta: "08:30 - 10:00", oraStart: "08:30" },
   { eticheta: "10:00 - 11:30", oraStart: "10:00" },
   { eticheta: "11:30 - 13:00", oraStart: "11:30" },
   { eticheta: "13:30 - 15:00", oraStart: "13:30" },
   { eticheta: "15:00 - 16:30", oraStart: "15:00" },
   { eticheta: "16:30 - 18:00", oraStart: "16:30" },
   { eticheta: "18:00 - 19:30", oraStart: "18:00" },
   { eticheta: "19:30 - 21:00", oraStart: "19:30" },
];

// helpers
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

// ——— normalizare răspuns /busy-reservation ———
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
         entityType, // "group" | "instructor" | null
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

// grilă completă (UTC ISO “Z”)
function buildFullGridISO(daysWindow = 120) {
   const daysArr = nextNDays(daysWindow);
   const out = [];
   for (const day of daysArr) {
      for (const t of oreDisponibile) {
         out.push(new Date(`${day}T${t.oraStart}:00.000Z`).toISOString());
      }
   }
   return out;
}

export default function SAddProg({ onClose }) {
   // ——— Etapa 1: opțiuni ———
   const [numarLectii, setNumarLectii] = useState(15); // 15 | 30
   const [cutie, setCutie] = useState("manual"); // manual | automat
   const [sector, setSector] = useState("Botanica"); // Botanica | Ciocana
   const [tip, setTip] = useState("group"); // group | single
   const WINDOW_DAYS = 120;

   // ancoră din istoricul userului
   const [anchor, setAnchor] = useState(null); // {tip, entityId, sector, gearbox}
   // blocare totală când ai deja 30
   const [hardLock30, setHardLock30] = useState(false);

   // ——— Etapa 2 ———
   const [stage, setStage] = useState("setup"); // setup | pick
   const [assignedGroupId, setAssignedGroupId] = useState(null);
   const [assignedInstructorId, setAssignedInstructorId] = useState(null);
   const [freeSlotsForAssigned, setFreeSlotsForAssigned] = useState([]); // ISO[]
   const [selectedDates, setSelectedDates] = useState([]); // ISO[]
   const [loading, setLoading] = useState(false);
   const [initLoading, setInitLoading] = useState(true);

   const [data, setData] = useState(null);
   const [oraSelectata, setOraSelectata] = useState(null);

   const [lectiiExistente, setLectiiExistente] = useState(0);

   const { user } = useContext(UserContext);
   const dispatch = useDispatch();
   const { list: rezervariExistente, busyLoading } = useSelector(
      (s) => s.reservations
   );

   // INIT: aduc rezervările fresh, derivez ancora, blochez dacă >=30 și auto-skip dacă e cazul
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
                  return; // blocat — nu mai facem nimic
               }

               if (existing?.length) {
                  const a = deriveAnchor(existing);
                  setAnchor(a);
                  setCutie(a.gearbox);
                  setSector(a.sector);
                  setTip(a.tip);
                  await continuaEtapa2(a);
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

   // resetare etapă 2 când se schimbă opțiunile (dacă NU e blocat de ancoră)
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
   }, [sector, cutie, tip, anchor]);

   const isLocked = !!anchor;

   const reachedMax30 = useMemo(
      () => lectiiExistente + selectedDates.length >= 30,
      [lectiiExistente, selectedDates.length]
   );
   const reachedPackLimit = useMemo(
      () => numarLectii === 15 && selectedDates.length >= 15,
      [numarLectii, selectedDates.length]
   );

   // ——— zile deja ocupate de utilizator (existing + selecții curente) ———
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

   const continuaEtapa2 = async (maybeAnchor = undefined) => {
      if (hardLock30 || lectiiExistente >= 30) {
         alert("Ai deja 30 de lecții programate. Nu mai poți adăuga.");
         return;
      }

      setLoading(true);
      try {
         // dacă vine SyntheticEvent, îl ignorăm
         const candidate = isProbablyEvent(maybeAnchor)
            ? undefined
            : maybeAnchor;
         const lock = candidate || anchor;
         const useAnchor = isValidAnchor(lock);

         if (!numarLectii) {
            alert("Alege pachetul (15 sau 30).");
            return;
         }

         // dacă nu avem ancoră validă, folosim valorile din toggle-uri (state)
         const qGearbox = useAnchor ? lock.gearbox : cutie;
         const qSector = useAnchor ? lock.sector : sector;
         const qType = useAnchor ? lock.tip : tip;

         const query = {
            days: asStr(numarLectii), // "15" | "30"
            gearbox: asStrLower(qGearbox), // "manual" | "automat"
            sector: asStrLower(qSector), // "botanica" | "ciocana"
            type: asStrLower(qType), // "group" | "single"
         };

         const res = await dispatch(fetchBusy(query)).unwrap(); // (doar o singură dată)
         const variants = normalizeBusy(res.data);

         if (!variants.length) {
            console.error(
               "[SAddProg] /busy-reservation a întors zero variante:",
               res?.data
            );
            alert(
               "Nu am primit date de ocupații. Reîncearcă sau contactează administratorul."
            );
            return;
         }

         // filtrează după tipul cerut (din toggle sau ancoră validă)
         let list = variants.filter((v) =>
            qType === "group"
               ? v.entityType === "group"
               : v.entityType === "instructor"
         );

         if (!list.length) {
            console.error(
               "[SAddProg] Tipul dorit nu există în răspunsul busy:",
               qType,
               variants
            );
            alert("Nu am putut găsi tipul dorit în ocupații.");
            return;
         }

         // dacă avem ancoră validă, restrângem doar la ea
         if (useAnchor) {
            const anchorType = lock.tip === "group" ? "group" : "instructor";
            const onlyAnchor = list.filter(
               (v) =>
                  v.entityType === anchorType &&
                  String(v.entityId) === String(lock.entityId)
            );
            if (!onlyAnchor.length) {
               console.error(
                  "[SAddProg] Varianta ancorată nu a fost returnată de backend.",
                  { anchor: lock, list }
               );
               alert("Nu am găsit grupa/instructorul tău în ocupații.");
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
            console.error(
               "[SAddProg] Nicio variantă cu sloturi libere.",
               scored
            );
            alert("Nu există sloturi libere în perioada vizată.");
            return;
         }

         if (qType === "group") {
            setAssignedGroupId(String(best.entityId));
            setAssignedInstructorId(null);
         } else {
            setAssignedInstructorId(String(best.entityId));
            setAssignedGroupId(null);
         }

         setFreeSlotsForAssigned(best.free);
         setStage("pick");
      } catch (err) {
         console.error("[SAddProg] Eroare la fetchBusy / procesare:", err);
         alert("Nu am putut încărca ocupațiile.");
      } finally {
         setLoading(false);
      }
   };

   // —— Etapa 2: selecție sloturi —— //
   const freeSet = useMemo(
      () => new Set(freeSlotsForAssigned),
      [freeSlotsForAssigned]
   );

   const adaugaProgramare = () => {
      if (hardLock30 || lectiiExistente >= 30) {
         alert("Ai deja 30 de lecții programate. Nu mai poți adăuga.");
         return;
      }
      if (!data || !oraSelectata) return;

      const dayLocal = localDateStr(data);
      if (bookedDaySet.has(dayLocal)) {
         alert("Ai deja o programare în această zi. Alege altă dată.");
         return;
      }

      if (reachedMax30) {
         alert("Ai atins limita maximă de 30 lecții!");
         return;
      }
      if (reachedPackLimit) {
         alert(`Ai atins limita pachetului (${numarLectii}).`);
         return;
      }

      const iso = toUtcIsoFromLocal(data, oraSelectata.oraStart);
      if (!freeSet.has(iso)) {
         alert("Slot indisponibil.");
         return;
      }
      if (selectedDates.includes(iso)) return;

      setSelectedDates((prev) => [...prev, iso]);
      setData(null);
      setOraSelectata(null);
   };

   const stergeProgramare = (iso) =>
      setSelectedDates((prev) => prev.filter((p) => p !== iso));

   const trimiteProgramari = async () => {
      setLoading(true);
      try {
         // re-verific din backend, live
         let latest = [];
         if (user?.id) {
            latest = await dispatch(fetchUserReservations(user.id))
               .unwrap()
               .catch(() => rezervariExistente || []);
         }
         const existingCount = Array.isArray(latest)
            ? latest.length
            : lectiiExistente;

         // hard lock
         if (existingCount >= 30) {
            setHardLock30(true);
            alert("Ai deja 30 de lecții programate. Nu mai poți adăuga.");
            return;
         }

         // câte mai poți adăuga până la 30, indiferent de pachet
         const poateAdauga = 30 - existingCount;
         if (selectedDates.length > poateAdauga) {
            alert(`Poți adăuga cel mult ${poateAdauga} lecții acum.`);
            return;
         }

         // ✅ modificare: la prima programare NU mai cerem exact 15/30,
         // ci doar ≥1 și ≤ pachetul ales (limita de pachet e deja aplicată la "Adaugă")
         if (selectedDates.length === 0) {
            alert("Selectează cel puțin o lecție înainte de trimitere.");
            return;
         }

         const payload = {
            reservations: selectedDates.map((isoDate) => {
               const base = {
                  startTime: asStr(isoDate),
                  sector: asStr(isLocked ? anchor.sector : sector),
                  gearbox: asStr(cap(isLocked ? anchor.gearbox : cutie)),
                  privateMessage: "Notă goală",
                  color: "--default",
               };
               return (isLocked ? anchor.tip : tip) === "group"
                  ? { ...base, instructorsGroupId: asStr(assignedGroupId) }
                  : { ...base, instructorId: asStr(assignedInstructorId) };
            }),
         };

         await createReservations(payload);

         // ✅ închide popup-ul și fă hard refresh la pagină
         onClose?.();
         setTimeout(() => {
            if (typeof window !== "undefined") window.location.reload();
         }, 50);

         return; // oprim aici ca să nu mai facem setState pe un component care se închide
      } catch (e) {
         console.error(e);
         alert("A apărut o eroare la trimitere.");
      } finally {
         setLoading(false);
      }
   };

   const maxSelectableDate = useMemo(
      () => addDays(new Date(), WINDOW_DAYS - 1),
      [WINDOW_DAYS]
   );

   // —— ecran de încărcare inițial / auto-skip ——
   const showLoadingScreen =
      initLoading ||
      (isLocked && stage === "setup" && (loading || busyLoading));

   return (
      <div className="popup-panel__inner">
         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Adaugă programare</h3>
         </div>

         <div className="popup-panel__content">
            {/* HARD LOCK 30 — blochează tot UI-ul */}
            {hardLock30 ? (
               <div style={{ padding: 16 }}>
                  <div
                     className="saddprogramari__info"
                     style={{ marginBottom: 12 }}
                  >
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
               <div style={{ padding: 16, opacity: 0.8 }}>
                  Se încarcă disponibilitatea…
               </div>
            ) : stage === "setup" ? (
               <>
                  {isLocked && (
                     <div
                        className="saddprogramari__info"
                        style={{ marginBottom: 12 }}
                     >
                        Setările sunt blocate după primele programări:{" "}
                        <b>
                           {anchor.sector},{" "}
                           {anchor.gearbox === "automat" ? "Automat" : "Manual"}
                           ,{" "}
                           {anchor.tip === "group"
                              ? `Grupa #${anchor.entityId}`
                              : `Instructor #${anchor.entityId}`}
                        </b>
                        . Se poate trece direct la alegerea sloturilor.
                     </div>
                  )}

                  {/* Pachet */}
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
                        } ${sector === "Botanica" ? "" : "inacative"}`}
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
                           Mai mulți (grupă)
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
                           Unul (instructor)
                        </label>
                     </div>
                  </div>

                  <button
                     onClick={() => continuaEtapa2()}
                     disabled={busyLoading || loading}
                     className="saddprogramari__add-btn arrow"
                  >
                     <span>{loading ? "Se pregătește..." : "Continuă"}</span>
                     <ReactSVG
                        src={arrowIcon}
                        className="saddprogramari__add-btn-icon"
                     />
                  </button>
               </>
            ) : (
               // stage === "pick"
               <>
                  <div className="saddprogramari__selector row">
                     <h3 className="saddprogramari__title">
                        Asignare automată:
                     </h3>
                     {(isLocked ? anchor.tip : tip) === "group" ? (
                        <div>
                           Grupa aleasă: <b>#{assignedGroupId}</b>
                        </div>
                     ) : (
                        <div>
                           Instructor ales: <b>#{assignedInstructorId}</b>
                        </div>
                     )}
                     <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {freeSlotsForAssigned.length} sloturi libere găsite în
                        următoarele {WINDOW_DAYS} zile.
                     </div>
                  </div>

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
                           minDate={new Date()}
                           maxDate={maxSelectableDate}
                           dayClassName={(date) => {
                              const dayLocal = localDateStr(date);
                              if (bookedDaySet.has(dayLocal))
                                 return "saddprogramari__day--inactive";
                              const areFree = freeSlotsForAssigned.some(
                                 (iso) =>
                                    localDateStr(new Date(iso)) === dayLocal
                              );
                              return areFree
                                 ? ""
                                 : "saddprogramari__day--inactive";
                           }}
                        />
                     </div>

                     <div className="saddprogramari__times">
                        <h3 className="saddprogramari__title">
                           Selectează ora:
                        </h3>
                        <div className="saddprogramari__times-list">
                           {!data && (
                              <div className="saddprogramari__disclaimer">
                                 Te rog să selectezi mai întâi o zi!
                              </div>
                           )}
                           {oreDisponibile.map((ora) => {
                              const dayLocal = data ? localDateStr(data) : null;
                              const dayLimit = dayLocal
                                 ? bookedDaySet.has(dayLocal)
                                 : false;

                              const d = data
                                 ? toUtcIsoFromLocal(data, ora.oraStart)
                                 : null;
                              const isFree = d ? freeSet.has(d) : false;
                              const esteDejaSelectata =
                                 d && selectedDates.includes(d);
                              const isSelected =
                                 oraSelectata?.eticheta === ora.eticheta;

                              return (
                                 <button
                                    key={ora.eticheta}
                                    onClick={() => setOraSelectata(ora)}
                                    disabled={
                                       !data ||
                                       dayLimit ||
                                       !isFree ||
                                       esteDejaSelectata
                                    }
                                    className={`saddprogramari__time-btn ${
                                       isSelected
                                          ? "saddprogramari__time-btn--selected"
                                          : ""
                                    } ${
                                       dayLimit || !isFree || esteDejaSelectata
                                          ? "saddprogramari__time-btn--disabled"
                                          : ""
                                    }`}
                                    title={
                                       dayLimit
                                          ? "Ai deja o programare în această zi"
                                          : esteDejaSelectata
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

                     <button
                        onClick={adaugaProgramare}
                        disabled={
                           !data ||
                           !oraSelectata ||
                           selectedDates.length >= numarLectii
                        }
                        className="saddprogramari__add-btn"
                     >
                        <ReactSVG
                           src={addIcon}
                           className="saddprogramari__add-btn-icon"
                        />
                        <span>Adaugă</span>
                     </button>
                  </div>

                  <div className="saddprogramari__added">
                     <h3 className="saddprogramari__title">
                        Lecții selectate: {selectedDates.length} / {numarLectii}
                        <span style={{ marginLeft: 8, opacity: 0.8 }}>
                           (rămase:{" "}
                           {Math.max(0, numarLectii - selectedDates.length)})
                        </span>
                     </h3>
                     <ul className="saddprogramari__added-list">
                        {selectedDates.map((d, i) => (
                           <li key={i} className="saddprogramari__added-item">
                              {new Date(d).toLocaleString()}
                              <button
                                 className="saddprogramari__delete-btn"
                                 onClick={() => stergeProgramare(d)}
                              >
                                 DEL
                              </button>
                           </li>
                        ))}
                     </ul>

                     <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                           onClick={() => setStage("setup")}
                           className="saddprogramari__add-btn"
                           type="button"
                        >
                           « Înapoi la setări
                        </button>
                        <button
                           onClick={trimiteProgramari}
                           disabled={selectedDates.length === 0 || loading}
                           className="saddprogramari__add-btn arrow"
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
                  </div>
               </>
            )}
         </div>
      </div>
   );
}
