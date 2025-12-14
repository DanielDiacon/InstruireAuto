// src/components/Popups/AAddProg.jsx
import React, {
   useEffect,
   useMemo,
   useRef,
   useState,
   useCallback,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ro from "date-fns/locale/ro";
import { ReactSVG } from "react-svg";

import AlertPills from "../Utils/AlertPills";
import arrowIcon from "../../assets/svg/arrow.svg";

import { createReservationsForUser } from "../../api/reservationsService";

import { fetchStudents } from "../../store/studentsSlice";
import { fetchInstructors } from "../../store/instructorsSlice";
import { fetchReservationsDelta } from "../../store/reservationsSlice";
import { triggerCalendarRefresh } from "../Utils/calendarBus";
import { fetchCars } from "../../store/carsSlice";

import apiClientService from "../../api/ApiClientService";
import { getInstructorBlackouts } from "../../api/instructorsService";

registerLocale("ro", ro);

/* ===== Constante / Config ===== */
const GROUP_TOKEN_FIXED = "ABCD1234";
const EMAIL_DOMAIN = "instrauto.com";
const SLOT_MINUTES = 90;
const MOLDOVA_TZ = "Europe/Chisinau";

const SECTOR_ORDER = ["Botanica", "Ciocana", "Buiucani"];

/* ===== Helpers ===== */
const slugify = (s) =>
   (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 20) || "user";

const makeEmail = (firstName, lastName, phoneDigits, extra = "") => {
   const fn = slugify(firstName);
   const ln = slugify(lastName);
   const last3 =
      (phoneDigits || "").slice(-3) || Math.random().toString().slice(2, 5);
   const suffix = extra ? `-${extra}` : "";
   return `${fn}.${ln}.ia${last3}${suffix}@${EMAIL_DOMAIN}`;
};

const oreDisponibile = [
   { eticheta: "07:00", oraStart: "07:00" },
   { eticheta: "08:30", oraStart: "08:30" },
   { eticheta: "10:00", oraStart: "10:00" },
   { eticheta: "11:30", oraStart: "11:30" },
   { eticheta: "13:30", oraStart: "13:30" },
   { eticheta: "15:00", oraStart: "15:00" },
   { eticheta: "16:30", oraStart: "16:30" },
   { eticheta: "18:00", oraStart: "18:00" },
   { eticheta: "19:30", oraStart: "19:30" },
];

/* ========= TZ-safe utils ========= */
function partsInTZ(dateLike, timeZone = MOLDOVA_TZ) {
   const p = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
   }).formatToParts(new Date(dateLike));
   const get = (t) => +p.find((x) => x.type === t).value;
   return {
      y: get("year"),
      m: get("month"),
      d: get("day"),
      H: get("hour"),
      M: get("minute"),
      S: get("second"),
   };
}
function ymdStrInTZ(dateLike, timeZone = MOLDOVA_TZ) {
   const { y, m, d } = partsInTZ(dateLike, timeZone);
   return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function hhmmInTZ(dateLike, timeZone = MOLDOVA_TZ) {
   const { H, M } = partsInTZ(dateLike, timeZone);
   return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
}
function tzOffsetMinutesAt(tsMs, timeZone = MOLDOVA_TZ) {
   const { y, m, d, H, M, S } = partsInTZ(tsMs, timeZone);
   const asUTC = Date.UTC(y, m - 1, d, H, M, S);
   return (asUTC - tsMs) / 60000;
}
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
const toUtcIsoFromLocal = toUtcIsoFromMoldova;

const BUSY_KEYS_MODE = "local-match";

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

/** Chei locale stabile: "YYYY-MM-DD|HH:mm" */
function localKeyFromTs(tsMs, tz = MOLDOVA_TZ) {
   return `${ymdStrInTZ(tsMs, tz)}|${hhmmInTZ(tsMs, tz)}`;
}
const localKeyForIso = (iso) =>
   localKeyFromTs(new Date(iso).getTime(), MOLDOVA_TZ);
function busyLocalKeyFromStored(st) {
   const d = new Date(st);
   const offMin = tzOffsetMinutesAt(d.getTime(), MOLDOVA_TZ);
   const base = new Date(d.getTime() - offMin * 60000);
   return localKeyFromTs(base.getTime(), MOLDOVA_TZ);
}

/* ===== Helpers comune ===== */
function getStartFromReservation(r) {
   return (
      r?.startTime ??
      r?.start ??
      r?.start_time ??
      r?.dateTime ??
      r?.datetime ??
      r?.date ??
      r?.begin ??
      null
   );
}

function buildGridISOAround(
   anchorDate = new Date(),
   daysBack = 60,
   daysFwd = 60
) {
   const mdStr = ymdStrInTZ(anchorDate, MOLDOVA_TZ);
   const [y, m, d] = mdStr.split("-").map(Number);
   const start = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
   start.setDate(start.getDate() - Math.max(0, daysBack));
   const totalDays = Math.max(0, daysBack) + Math.max(0, daysFwd) + 1;
   const out = [];
   for (let i = 0; i < totalDays; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      for (const t of oreDisponibile) {
         out.push(toUtcIsoFromLocal(day, t.oraStart));
      }
   }
   return out;
}

function highlightText(text, query) {
   if (!text) return "";
   if (!query) return text;
   const parts = text.toString().split(new RegExp(`(${query})`, "gi"));
   return parts.map((part, i) =>
      part.toLowerCase() === (query || "").toLowerCase() ? (
         <i key={i} className="highlight">
            {part}
         </i>
      ) : (
         part
      )
   );
}
const onlyDigits = (s = "") => (s || "").replace(/\D/g, "");
const randId = (n = 16) =>
   Array.from({ length: n }, () => Math.random().toString(36).slice(2, 3)).join(
      ""
   );
function splitFullName(full = "") {
   const parts = full.trim().split(/\s+/).filter(Boolean);
   if (!parts.length) return { firstName: "", lastName: "" };
   if (parts.length === 1) return { firstName: parts[0], lastName: "" };
   return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/* ===== Component ===== */
export default function AAddProg({ onClose }) {
   const dispatch = useDispatch();

   const studentsAll = useSelector((s) => s.students?.list || []);
   const instructors = useSelector((s) => s.instructors?.list || []);
   const allReservations = useSelector((s) => s.reservations?.list || []);
   const cars = useSelector((s) => s.cars?.list || []);

   const studentsAllRef = useRef(studentsAll);
   useEffect(() => {
      studentsAllRef.current = studentsAll;
   }, [studentsAll]);

   const students = useMemo(() => {
      const hasUserRole = (u) => {
         const role = String(
            u?.role ?? u?.Role ?? u?.userRole ?? ""
         ).toUpperCase();
         if (role === "USER") return true;
         const roles = Array.isArray(u?.roles)
            ? u.roles.map((r) => String(r).toUpperCase())
            : [];
         return roles.includes("USER");
      };
      return (studentsAll || []).filter(hasUserRole);
   }, [studentsAll]);

   // pills
   const [messages, setMessages] = useState([]);
   const pushPill = (text, type = "error") =>
      setMessages((prev) => [
         ...prev,
         { id: Date.now() + Math.random(), text, type },
      ]);
   const popPill = () => setMessages((prev) => prev.slice(0, -1));

   // Stages
   const [stage, setStage] = useState("select"); // select | pick

   // Stare simplă – fără props inițiale
   const [sector, setSector] = useState("Botanica");
   const [gearbox, setGearbox] = useState(""); // vine din mașină
   const [studentId, setStudentId] = useState("");
   const [instructorId, setInstructorId] = useState("");

   const [privateMessage, setPrivateMessage] = useState("");

   // Formular elev nou
   const [newFullName, setNewFullName] = useState("");
   const [phoneFull, setPhoneFull] = useState("");
   const [highlightedStudentId, setHighlightedStudentId] = useState(null);

   const [continuing, setContinuing] = useState(false);

   // Pick state
   const [selectedDate, setSelectedDate] = useState(() => {
      const t = new Date();
      t.setHours(0, 0, 0, 0);
      return t;
   });

   const [selectedTime, setSelectedTime] = useState(null);

   // ecrane search
   const [view, setView] = useState("formSelect"); // formSelect | searchStudent | searchInstructor | formPick
   const [qStudent, setQStudent] = useState("");
   const [qInstructor, setQInstructor] = useState("");

   // disponibilități
   const [freeSlots, setFreeSlots] = useState([]); // ISO[]
   const freeSet = useMemo(() => new Set(freeSlots), [freeSlots]);

   // fetch listări
   useEffect(() => {
      if (!studentsAll?.length) dispatch(fetchStudents());
      if (!instructors?.length) dispatch(fetchInstructors());
      if (!cars?.length) dispatch(fetchCars());
      dispatch(fetchReservationsDelta());
   }, [dispatch]); // eslint-disable-line

   const selectedStudent = useMemo(
      () =>
         studentId
            ? students.find((u) => String(u.id) === String(studentId))
            : null,
      [students, studentId]
   );
   const selectedInstructor = useMemo(
      () =>
         instructorId
            ? instructors.find((i) => String(i.id) === String(instructorId))
            : null,
      [instructors, instructorId]
   );

   /* 🔹 Când se schimbă instructorul, preluăm sector + cutie DIN MAȘINI */
   useEffect(() => {
      if (!selectedInstructor) {
         setSector(SECTOR_ORDER[0]);
         setGearbox("");
         return;
      }

      // găsim mașina pentru acest instructor (prin instructorId)
      const carForInstructor = (cars || []).find(
         (c) =>
            String(c.instructorId) === String(selectedInstructor.id) ||
            String(c.instructor?.id) === String(selectedInstructor.id)
      );

      // Sector: prioritar din instructor (sau din instructorul din car)
      const rawSector =
         carForInstructor?.instructor?.sector ??
         selectedInstructor.defaultSector ??
         selectedInstructor.sector ??
         selectedInstructor.sectorName ??
         selectedInstructor.sector_name ??
         "";

      if (rawSector) {
         const raw = String(rawSector).trim();
         const normalized =
            SECTOR_ORDER.find((s) => s.toLowerCase() === raw.toLowerCase()) ||
            raw;

         setSector(normalized);
      } else {
         setSector(SECTOR_ORDER[0]);
      }

      // Gearbox – EXCLUSIV din car.gearbox, dacă există
      const rawGearbox = carForInstructor?.gearbox || "";

      if (rawGearbox) {
         const g = String(rawGearbox).toLowerCase();
         if (g.includes("automat") || g.includes("automatic") || g === "auto") {
            setGearbox("Automat");
         } else {
            setGearbox("Manual");
         }
      } else {
         // dacă nu avem mașină, lăsăm gol sau fallback Manual
         setGearbox("");
      }
   }, [selectedInstructor, cars]);

   // FILTRARE STUDENȚI
   const filteredStudents = useMemo(() => {
      const base = students;
      const q = (qStudent || "").trim().toLowerCase();
      const typedDigits = onlyDigits(phoneFull);

      if (!q && !typedDigits) return base;

      return (base || []).filter((s) => {
         const full = `${s.firstName || ""} ${s.lastName || ""}`.toLowerCase();
         const phone = (s.phone || "").toLowerCase();
         const phoneDigits = onlyDigits(s.phone || "");

         const matchName = q && full.includes(q);
         const matchPhoneText = q && phone.includes(q);
         const matchPhoneDigits =
            typedDigits && phoneDigits.includes(typedDigits);

         return matchName || matchPhoneText || matchPhoneDigits;
      });
   }, [students, qStudent, phoneFull]);

   const filteredInstructors = useMemo(() => {
      const q = (qInstructor || "").trim().toLowerCase();
      if (!q) return instructors;
      return (instructors || []).filter((i) => {
         const full = `${i.firstName || ""} ${i.lastName || ""}`.toLowerCase();
         const phone = (i.phone || "").toLowerCase();
         return full.includes(q) || phone.includes(q);
      });
   }, [instructors, qInstructor]);

   const studentsForSearchList = useMemo(() => {
      if (!highlightedStudentId) return filteredStudents;
      const idStr = String(highlightedStudentId);
      const idx = filteredStudents.findIndex((s) => String(s.id) === idStr);
      if (idx === -1) return filteredStudents;
      const arr = [...filteredStudents];
      const [match] = arr.splice(idx, 1);
      return [match, ...arr];
   }, [filteredStudents, highlightedStudentId]);

   const studentDisplay = selectedStudent
      ? `${selectedStudent.firstName || ""} ${
           selectedStudent.lastName || ""
        }`.trim()
      : "ne ales";

   const instructorDisplay = selectedInstructor
      ? `${selectedInstructor.firstName || ""} ${
           selectedInstructor.lastName || ""
        }`.trim()
      : "ne ales";

   const studentPhone =
      selectedStudent?.phone ||
      selectedStudent?.phoneNumber ||
      selectedStudent?.mobile ||
      selectedStudent?.telefon ||
      "";
   const instructorPhone = selectedInstructor?.phone || "";

   /** helper: dacă lista are UN elev → auto select */
   const autoSelectSingleStudent = (
      list,
      msg = "Elev selectat după căutare."
   ) => {
      if (!list || list.length !== 1) return false;
      const s = list[0];
      if (!s?.id) return false;

      const idStr = String(s.id);
      setStudentId(idStr);
      setNewFullName("");
      setPhoneFull("");
      setQStudent("");
      setHighlightedStudentId(null);
      setView("formSelect");

      if (msg) {
         pushPill(msg, "info");
      }

      return true;
   };

   const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
   async function waitUntilStudentInListByPhone(
      phoneDigits,
      tries = 12,
      delayMs = 250
   ) {
      const digits = (phoneDigits || "").replace(/\D/g, "");
      for (let i = 0; i < tries; i++) {
         try {
            await dispatch(fetchStudents());
         } catch {}
         const found = (studentsAllRef.current || []).find(
            (s) => onlyDigits(s.phone || "") === digits
         );
         if (found?.id) return String(found.id);
         await sleep(delayMs);
      }
      return "";
   }

   /* ====== Creare elev ====== */
   const ensureStudentCreated = async () => {
      const { firstName, lastName } = splitFullName(newFullName);
      if (!firstName || !lastName) {
         pushPill("Scrie numele complet (ex.: Ion Popescu).");
         return false;
      }

      const digits = onlyDigits(phoneFull);
      if (!digits) {
         pushPill("Introdu un număr de telefon (doar cifre).");
         return false;
      }

      setHighlightedStudentId(null);

      const existingSamePhone = (studentsAllRef.current || []).find(
         (s) => onlyDigits(s.phone || "") === digits
      );
      if (existingSamePhone) {
         const idStr = String(existingSamePhone.id);
         setStudentId(idStr);
         setNewFullName("");
         setPhoneFull("");
         setQStudent("");
         setHighlightedStudentId(idStr);
         setView("formSelect");
         pushPill(
            "Există deja un elev cu acest număr. A fost selectat automat.",
            "info"
         );
         return true;
      }

      const password = randId(16);

      for (let attempt = 0; attempt < 3; attempt++) {
         const email = makeEmail(
            firstName,
            lastName,
            digits,
            attempt ? randId(3) : ""
         );
         try {
            const res = await apiClientService.post(
               "/auth/register",
               JSON.stringify({
                  firstName,
                  lastName,
                  phone: digits,
                  email,
                  password,
                  role: "USER",
                  groupToken: GROUP_TOKEN_FIXED,
               })
            );

            if (res.ok) {
               let created = {};
               try {
                  created = await res.json();
               } catch {}
               let newId =
                  String(
                     created?.user?.id ??
                        created?.id ??
                        created?.userId ??
                        created?.data?.id ??
                        ""
                  ) || "";

               if (!newId) {
                  newId = await waitUntilStudentInListByPhone(digits);
               }

               if (!newId) {
                  pushPill(
                     "Elev creat, dar nu am putut extrage/identifica ID-ul.",
                     "warning"
                  );
                  return false;
               }

               try {
                  await dispatch(fetchStudents());
               } catch {}

               setStudentId(newId);
               setNewFullName("");
               setPhoneFull("");
               setQStudent("");
               setHighlightedStudentId(newId);
               setView("formSelect");
               pushPill("Elev nou adăugat.", "success");
               return true;
            } else {
               let errJson = null;
               try {
                  errJson = await res.json();
               } catch {}
               const msg = (errJson?.message || "").toString().toLowerCase();
               const looksLikeEmailDup =
                  msg.includes("email") &&
                  (msg.includes("exist") ||
                     msg.includes("duplicate") ||
                     msg.includes("unique"));

               if (!looksLikeEmailDup) {
                  pushPill(
                     errJson?.message || "Nu am putut crea elevul.",
                     "error"
                  );
                  break;
               }
            }
         } catch (e) {
            pushPill(
               e?.message || "Eroare la crearea utilizatorului.",
               "error"
            );
            break;
         }
      }

      const fallbackId = await waitUntilStudentInListByPhone(digits);
      if (fallbackId) {
         try {
            await dispatch(fetchStudents());
         } catch {}

         setStudentId(fallbackId);
         setNewFullName("");
         setPhoneFull("");
         setQStudent("");
         setHighlightedStudentId(fallbackId);
         setView("formSelect");
         pushPill("Elev existent selectat automat după telefon.", "success");
         return true;
      }

      pushPill(
         "Nu am putut crea elevul și nu l-am găsit după telefon.",
         "error"
      );
      return false;
   };

   /** Blackouts helpers */
   function getBlackoutDT(b) {
      if (typeof b === "string") return b;
      const t = String(b?.type || "").toUpperCase();
      if (t === "REPEAT") {
         return b?.startDateTime || b?.dateTime || b?.datetime || null;
      }
      return (
         b?.dateTime ||
         b?.datetime ||
         b?.startTime ||
         b?.date ||
         b?.begin ||
         null
      );
   }
   function expandRepeatLocalKeys(b, allowedKeysSet) {
      const out = [];
      const t = String(b?.type || "").toUpperCase();
      if (t !== "REPEAT") return out;

      const stepDays = Math.max(1, Number(b?.repeatEveryDays || 1));
      const first = b?.startDateTime || b?.dateTime;
      const last = b?.endDateTime || first;
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

   const WINDOW_BACK_DAYS = 120;
   const WINDOW_FWD_DAYS = 120;

   /* ====== Disponibilitate ====== */
   const computeAvailability = async () => {
      if (continuing) return;
      if (!instructorId) {
         pushPill("Selectează instructorul.", "error");
         return;
      }
      if (!studentId) {
         pushPill("Selectează elevul.", "error");
         return;
      }

      setContinuing(true);
      try {
         const fullGrid = buildGridISOAround(
            selectedDate || new Date(),
            WINDOW_BACK_DAYS,
            WINDOW_FWD_DAYS
         );
         const allowedKeys = new Set(
            fullGrid.map((iso) => localKeyForIso(iso))
         );

         const busyStudent = new Set();
         const busyInstructor = new Set();

         for (const r of allReservations || []) {
            const stRaw = getStartFromReservation(r);
            if (!stRaw) continue;
            const key = busyLocalKeyFromStored(stRaw);
            const rStuId = String(r?.userId ?? r?.studentId ?? "");
            const rInsId = String(r?.instructorId ?? "");
            if (rStuId === String(studentId)) busyStudent.add(key);
            if (rInsId === String(instructorId)) busyInstructor.add(key);
         }

         try {
            const blackouts = await getInstructorBlackouts(instructorId);
            for (const b of blackouts || []) {
               const type = String(b?.type || "").toUpperCase();
               if (type === "REPEAT") {
                  const keys = expandRepeatLocalKeys(b, allowedKeys);
                  for (const key of keys) busyInstructor.add(key);
               } else {
                  const dt = getBlackoutDT(b);
                  if (!dt) continue;
                  const key = busyLocalKeyFromStored(dt);
                  if (allowedKeys.has(key)) busyInstructor.add(key);
               }
            }
         } catch {
            pushPill(
               "Nu am putut încărca orele blocate ale instructorului. Se afișează doar rezervările.",
               "warning"
            );
         }

         const free = fullGrid.filter((iso) => {
            const key = localKeyForIso(iso);
            return !busyStudent.has(key) && !busyInstructor.has(key);
         });

         if (!free.length)
            pushPill(
               "Nu s-au găsit sloturi libere în intervalul selectat.",
               "info"
            );

         setFreeSlots(free);
         setStage("pick");
         setView("formPick");
         setSelectedTime(null);
      } finally {
         setContinuing(false);
      }
   };

   const freeByDay = useMemo(() => {
      const map = new Map();
      for (const iso of freeSlots) {
         const key = ymdStrInTZ(iso, MOLDOVA_TZ);
         map.set(key, (map.get(key) || 0) + 1);
      }
      return map;
   }, [freeSlots]);

   /* ====== SAVE ====== */
   const [saving, setSaving] = useState(false);

   const onSave = async () => {
      if (!studentId) return pushPill("Selectează/creează elevul.");
      if (!instructorId) return pushPill("Selectează instructorul.");
      if (!selectedDate) return pushPill("Selectează data.");
      if (!selectedTime) return pushPill("Selectează ora.");

      const iso = toUtcIsoFromLocal(selectedDate, selectedTime.oraStart);

      if (!freeSet.has(iso)) {
         return pushPill(
            "Slot indisponibil pentru elevul și instructorul selectați."
         );
      }

      const instructorIdNum = Number(instructorId);
      const studentIdNum = Number(studentId);

      if (!Number.isFinite(instructorIdNum) || instructorIdNum <= 0) {
         return pushPill(
            "Instructor invalid (ID). Încearcă să-l selectezi din nou."
         );
      }
      if (!Number.isFinite(studentIdNum) || studentIdNum <= 0) {
         return pushPill("Elev invalid (ID). Încearcă să-l selectezi din nou.");
      }

      const startTimeToSend =
         BUSY_KEYS_MODE === "local-match" ? isoForDbMatchLocalHour(iso) : iso;

      setSaving(true);
      try {
         const payload = {
            userId: studentIdNum,
            instructorId: instructorIdNum,
            reservations: [
               {
                  startTime: startTimeToSend,
                  sector: sector || "Botanica",
                  // cutia vine din mașină → doar normalizăm la Automat/Manual
                  gearbox:
                     (gearbox || "Manual").toLowerCase() === "automat"
                        ? "Automat"
                        : "Manual",
                  privateMessage: privateMessage || "",
                  color: "--black-t",
                  instructorId: instructorIdNum,
               },
            ],
         };

         await createReservationsForUser(payload);

         setMessages([
            { id: Date.now(), type: "success", text: "Programare creată." },
         ]);

         try {
            await (dispatch(fetchReservationsDelta()).unwrap?.() ??
               dispatch(fetchReservationsDelta()));
         } catch {}

         triggerCalendarRefresh();

         setTimeout(async () => {
            try {
               await (dispatch(fetchReservationsDelta()).unwrap?.() ??
                  dispatch(fetchReservationsDelta()));
            } catch {}
            triggerCalendarRefresh();
         }, 0);

         onClose?.();
      } catch (e) {
         pushPill(e?.message || "Nu am putut crea programarea.");
      } finally {
         setSaving(false);
      }
   };

   /* ====== NEW STUDENT helpers ====== */
   const validNewName = newFullName.trim().split(/\s+/).length >= 2;
   const validNewPhone = onlyDigits(phoneFull).length > 0;

   const handleCreateStudentClick = async () => {
      if (continuing) return;
      setContinuing(true);
      try {
         await ensureStudentCreated();
      } finally {
         setContinuing(false);
      }
   };

   useEffect(() => {
      const digits = onlyDigits(phoneFull);
      if (!digits) {
         setHighlightedStudentId(null);
         return;
      }

      setQStudent(digits);

      const exact = (students || []).find(
         (s) => onlyDigits(s.phone || "") === digits
      );
      if (exact) {
         const idStr = String(exact.id);
         setStudentId(idStr);
         setHighlightedStudentId(idStr);
      } else {
         setHighlightedStudentId(null);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [phoneFull, students]);

   const handlePhoneKeyDown = (e) => {
      if (e.key === "Enter") {
         e.preventDefault();
         if (continuing) return;

         const autoDone = autoSelectSingleStudent(
            studentsForSearchList,
            "Elev selectat (rezultat unic după căutare)."
         );
         if (autoDone) return;

         const digits = onlyDigits(phoneFull);
         if (!digits) return;

         const exact = (studentsAllRef.current || []).find(
            (s) => onlyDigits(s.phone || "") === digits
         );

         if (exact) {
            const idStr = String(exact.id);
            setStudentId(idStr);
            setNewFullName("");
            setPhoneFull("");
            setQStudent("");
            setHighlightedStudentId(null);
            setView("formSelect");
            pushPill("Elev existent selectat automat după telefon.", "info");
         } else {
            handleCreateStudentClick();
         }
      }
   };

   const handleStudentSearchKeyDown = (e) => {
      if (e.key === "Enter") {
         e.preventDefault();
         if (continuing) return;

         autoSelectSingleStudent(
            studentsForSearchList,
            "Elev selectat după căutare."
         );
      }
   };

   const primaryLabel = continuing
      ? "Se verifică disponibilitatea…"
      : "Continuă";
   const primaryDisabled = continuing || !instructorId || !studentId;

   const handleSectorToggle = useCallback(() => {
      setSector((prev) => {
         const current = String(prev || "").trim();
         const idx = SECTOR_ORDER.indexOf(current);
         if (idx === -1) return SECTOR_ORDER[0];
         return SECTOR_ORDER[(idx + 1) % SECTOR_ORDER.length];
      });
   }, []);

   const studentLabel =
      studentDisplay !== "ne ales" ? studentDisplay : "Alege elev";
   const instructorLabel =
      instructorDisplay !== "ne ales" ? instructorDisplay : "Alege instructor";

   return (
      <div className="popupui popupui--a-add-prog">
         <AlertPills messages={messages} onDismiss={popPill} />

         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Adaugă programare</h3>
         </div>

         <div className="popupui__content">
            {/* Etapa 1: SELECT */}
            {stage === "select" && view === "formSelect" && (
               <>
                  <div className="popupui__form-row popupui__form-row--spaced">
                     {/* Elev */}
                     <div
                        className="popupui__field popupui__field--clickable popupui__field--grow-1"
                        onClick={() => {
                           if (continuing) return;
                           setView("searchStudent");
                           setHighlightedStudentId(null);
                        }}
                     >
                        <span className="popupui__field-label">Elev</span>

                        <div className="popupui__field-line">
                           <span className="popupui__field-text">
                              {studentLabel}
                           </span>
                        </div>
                        <div className="popupui__field-line">
                           <span className="popupui__field-text">
                              {studentPhone || "Telefon elev"}
                           </span>
                        </div>
                     </div>

                     {/* Instructor */}
                     <div
                        className="popupui__field popupui__field--clickable popupui__field--grow-1"
                        onClick={() => {
                           if (continuing) return;
                           setView("searchInstructor");
                        }}
                     >
                        <span className="popupui__field-label">Instructor</span>
                        <div className="popupui__field-line">
                           <span className="popupui__field-text">
                              {instructorLabel}
                           </span>
                        </div>
                        <div className="popupui__field-line">
                           <span className="popupui__field-text">
                              {instructorPhone || "Telefon instructor"}
                           </span>
                        </div>
                     </div>
                  </div>

                  {/* Sector + Cutie (din mașină) */}
                  <div className="popupui__form-row popupui__form-row--compact">
                     <div
                        className="popupui__field popupui__field--clickable popupui__field--grow-1"
                        onClick={() => {
                           if (continuing) return;
                           handleSectorToggle();
                        }}
                     >
                        <span className="popupui__field-label">Sector</span>
                        <div className="popupui__field-line">
                           <span className="popupui__field-text">
                              {sector || "Alege sector"}
                           </span>
                        </div>
                     </div>

                     {/* Cutie – doar afișare, din mașină */}
                     <div className="popupui__field popupui__field--grow-1">
                        <span className="popupui__field-label">
                           Cutie (din mașină)
                        </span>
                        <div className="popupui__field-line">
                           <span className="popupui__field-text">
                              {gearbox
                                 ? gearbox.toLowerCase() === "automat"
                                    ? "Automat"
                                    : "Manual"
                                 : "—"}
                           </span>
                        </div>
                     </div>
                  </div>

                  {/* Notiță personală */}
                  <div className="popupui__field">
                     <span className="popupui__field-label">
                        Notiță personală
                     </span>
                     <textarea
                        className="popupui__textarea"
                        rows={2}
                        placeholder="Notiță pentru această rezervare (opțional)..."
                        value={privateMessage}
                        onChange={(e) => setPrivateMessage(e.target.value)}
                     />
                  </div>

                  <div className="popupui__actions-row">
                     <button
                        onClick={computeAvailability}
                        className="popupui__primary-btn popupui__primary-btn--arrow"
                        type="button"
                        disabled={primaryDisabled}
                        title={
                           !instructorId
                              ? "Selectează instructorul"
                              : !studentId
                              ? "Selectează elevul"
                              : ""
                        }
                     >
                        <span>{primaryLabel}</span>
                        <ReactSVG
                           src={arrowIcon}
                           className="popupui__primary-btn-icon"
                        />
                     </button>
                  </div>
               </>
            )}

            {/* Căutare elev */}
            {view === "searchStudent" && (
               <>
                  <div className="popupui__search-header">
                     <input
                        type="text"
                        className="popupui__search-input"
                        placeholder="Caută elev după nume sau telefon…"
                        value={qStudent}
                        onChange={(e) => setQStudent(e.target.value)}
                        onKeyDown={handleStudentSearchKeyDown}
                        disabled={continuing}
                     />
                     <div className="popupui__search-header-actions">
                        <button
                           type="button"
                           className="popupui__btn popupui__btn--normal"
                           onClick={() => {
                              setView("formSelect");
                              setQStudent("");
                              setHighlightedStudentId(null);
                           }}
                           disabled={continuing}
                        >
                           Înapoi
                        </button>
                     </div>
                  </div>

                  {/* Elev nou */}
                  <div className="popupui__field">
                     <span className="popupui__field-label">Elev nou</span>
                     <div className="popupui__new-student">
                        <div className="popupui__new-student-grid">
                           <div className="popupui__form-row">
                              <input
                                 className="popupui__input"
                                 placeholder="Nume Prenume"
                                 value={newFullName}
                                 onChange={(e) =>
                                    setNewFullName(e.target.value)
                                 }
                                 disabled={continuing}
                              />
                              <input
                                 className="popupui__input"
                                 placeholder="Telefon (număr)"
                                 type="tel"
                                 inputMode="numeric"
                                 value={phoneFull}
                                 onChange={(e) =>
                                    setPhoneFull(
                                       e.target.value.replace(/\D/g, "")
                                    )
                                 }
                                 onKeyDown={handlePhoneKeyDown}
                                 disabled={continuing}
                              />
                           </div>

                           <button
                              type="button"
                              className="popupui__btn popupui__btn--save"
                              onClick={handleCreateStudentClick}
                              disabled={
                                 continuing || !validNewName || !validNewPhone
                              }
                           >
                              {continuing
                                 ? "Se creează elevul…"
                                 : "Salvează elev"}
                           </button>
                        </div>
                     </div>
                  </div>

                  <div className="popupui__search-list-wrapper">
                     <ul className="popupui__search-list">
                        {studentsForSearchList.map((s) => {
                           const full = `${s.firstName || ""} ${
                              s.lastName || ""
                           }`.trim();
                           const phone = s.phone || "";
                           const isHighlighted =
                              highlightedStudentId &&
                              String(s.id) === String(highlightedStudentId);
                           return (
                              <li
                                 key={s.id}
                                 className={`popupui__search-item${
                                    isHighlighted
                                       ? " popupui__search-item--highlighted"
                                       : ""
                                 }`}
                                 onClick={() => {
                                    if (continuing) return;
                                    setStudentId(String(s.id));
                                    setView("formSelect");
                                    setHighlightedStudentId(null);
                                 }}
                              >
                                 <div className="popupui__search-item-left">
                                    <h3>{highlightText(full, qStudent)}</h3>
                                    {phone && (
                                       <p>{highlightText(phone, qStudent)}</p>
                                    )}
                                 </div>
                              </li>
                           );
                        })}
                     </ul>
                  </div>
               </>
            )}

            {/* Căutare instructor */}
            {view === "searchInstructor" && (
               <>
                  <div className="popupui__search-header">
                     <input
                        type="text"
                        className="popupui__search-input"
                        placeholder="Caută instructor după nume sau telefon..."
                        value={qInstructor}
                        onChange={(e) => setQInstructor(e.target.value)}
                        disabled={continuing}
                     />
                     <div className="popupui__search-header-actions">
                        <button
                           className="popupui__btn popupui__btn--normal"
                           type="button"
                           onClick={() => setView("formSelect")}
                           disabled={continuing}
                        >
                           Înapoi
                        </button>
                     </div>
                  </div>
                  <div className="popupui__search-list-wrapper">
                     <ul className="popupui__search-list">
                        {filteredInstructors.map((i) => {
                           const full = `${i.firstName || ""} ${
                              i.lastName || ""
                           }`.trim();
                           const phone = i.phone || "";
                           return (
                              <li
                                 key={i.id}
                                 className="popupui__search-item"
                                 onClick={() => {
                                    if (continuing) return;
                                    setInstructorId(String(i.id));
                                    setView("formSelect");
                                 }}
                              >
                                 <div className="popupui__search-item-left">
                                    <h3>{highlightText(full, qInstructor)}</h3>
                                    {phone && (
                                       <p>
                                          {highlightText(phone, qInstructor)}
                                       </p>
                                    )}
                                 </div>
                              </li>
                           );
                        })}
                     </ul>
                  </div>
               </>
            )}

            {/* Etapa 2: PICK */}
            {stage === "pick" && view === "formPick" && (
               <>
                  <div className="popupui__selector">
                     {/* Calendar */}
                     <div className="popupui__field popupui__field--calendar">
                        <span className="popupui__field-label">
                           Selectează data:
                        </span>
                        <DatePicker
                           selected={selectedDate}
                           onChange={(d) => {
                              setSelectedDate(d);
                              setSelectedTime(null);
                           }}
                           inline
                           locale="ro"
                           formatWeekDay={(name) =>
                              name
                                 .substring(0, 2)
                                 .replace(/^./, (c) => c.toUpperCase())
                           }
                           dayClassName={(date) => {
                              const day = ymdStrInTZ(date, MOLDOVA_TZ);
                              return freeByDay.has(day)
                                 ? ""
                                 : "popupui__day--inactive";
                           }}
                           calendarClassName="popupui__datepicker"
                        />
                     </div>

                     {/* Ore */}
                     <div className="popupui__field popupui__field--times">
                        <span className="popupui__field-label">
                           Selectează ora:
                        </span>

                        <div className="popupui__times-list">
                           {!selectedDate && (
                              <div className="popupui__disclaimer">
                                 Te rog să selectezi mai întâi o zi!
                              </div>
                           )}

                           {oreDisponibile.map((ora) => {
                              const iso = selectedDate
                                 ? toUtcIsoFromLocal(selectedDate, ora.oraStart)
                                 : null;

                              const isSelected =
                                 selectedTime?.oraStart === ora.oraStart;

                              const disabled =
                                 !selectedDate || !freeSet.has(iso);

                              return (
                                 <button
                                    key={ora.eticheta}
                                    onClick={() => setSelectedTime(ora)}
                                    disabled={disabled}
                                    className={[
                                       "popupui__time-btn",
                                       isSelected
                                          ? "popupui__time-btn--selected"
                                          : "",
                                       disabled
                                          ? "popupui__time-btn--disabled"
                                          : "",
                                       ora.eticheta === "19:30"
                                          ? "popupui__time-btn--wide"
                                          : "",
                                    ]
                                       .filter(Boolean)
                                       .join(" ")}
                                    title={
                                       !selectedDate
                                          ? "Alege o zi"
                                          : !freeSet.has(iso)
                                          ? "Indisponibil pentru elevul/instructorul selectați"
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

                  <div className="popupui__actions-row">
                     <button
                        onClick={() => {
                           setStage("select");
                           setView("formSelect");
                           setSelectedTime(null);
                        }}
                        className="popupui__secondary-btn popupui__secondary-btn--arrow-back"
                        type="button"
                        disabled={saving}
                     >
                        <ReactSVG
                           src={arrowIcon}
                           className="popupui__primary-btn-icon"
                        />
                        <span>Înapoi</span>
                     </button>

                     <button
                        onClick={onSave}
                        disabled={!selectedDate || !selectedTime || saving}
                        className="popupui__primary-btn popupui__primary-btn--arrow"
                        type="button"
                     >
                        <span>{saving ? "Se salvează..." : "Trimite"}</span>
                        <ReactSVG
                           src={arrowIcon}
                           className="popupui__primary-btn-icon"
                        />
                     </button>
                  </div>
               </>
            )}
         </div>
      </div>
   );
}
