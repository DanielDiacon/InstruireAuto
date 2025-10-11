// src/components/Popups/AAddProg.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ro from "date-fns/locale/ro";
import { ReactSVG } from "react-svg";

import AlertPills from "../Utils/AlertPills";
import arrowIcon from "../../assets/svg/arrow.svg";

import { fetchStudents } from "../../store/studentsSlice";
import { fetchInstructors } from "../../store/instructorsSlice";
import { fetchAllReservations } from "../../store/reservationsSlice";
import { createReservations } from "../../api/reservationsService";

import apiClientService from "../../api/ApiClientService";
import { getInstructorBlackouts } from "../../api/instructorsService";

/* ===== Locale RO ===== */
registerLocale("ro", ro);

/* ===== Constante / Config ===== */
const GROUP_TOKEN_FIXED = "ABCD1234";
const EMAIL_DOMAIN = "instrauto.com";
const SLOT_MINUTES = 90;
const MOLDOVA_TZ = "Europe/Chisinau";

/* ===== Helpers pt. email generat ===== */
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

/* ===== Intervale ore ===== */
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
function toUtcIsoFromLocal(localDateObj, timeStrHHMM) {
   return toUtcIsoFromMoldova(localDateObj, timeStrHHMM);
}

const BUSY_KEYS_MODE = "local-match";

/** 'YYYY-MM-DDTHH:mm:00+02:00/+03:00' pentru DB (păstrează ora locală) */
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
/** Din ce vine din DB (cu Z/offset sau simplu) -> cheie locală stabilă */
function busyLocalKeyFromStored(st) {
   const d = new Date(st);
   const offMin = tzOffsetMinutesAt(d.getTime(), MOLDOVA_TZ);
   const base = new Date(d.getTime() - offMin * 60000);
   return localKeyFromTs(base.getTime(), MOLDOVA_TZ);
}

/* ===== Helpers comune ===== */
function getDurationMin(r) {
   return (
      r?.durationMinutes ??
      r?.slotMinutes ??
      r?.lengthMinutes ??
      r?.duration ??
      SLOT_MINUTES
   );
}
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

const capRO = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const formatDateRO = (iso) => {
   const d = new Date(iso);
   const fmt = new Intl.DateTimeFormat("ro-RO", {
      timeZone: MOLDOVA_TZ,
      day: "numeric",
      month: "long",
      year: "numeric",
   }).format(d);
   return fmt.replace(/\b([a-zăîâșț])/u, (m) => m.toUpperCase());
};

function localDateStr(d) {
   return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
   )}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayAt00() {
   const t = new Date();
   t.setHours(0, 0, 0, 0);
   return t;
}
function localDateObjFromStr(s) {
   const [y, m, d] = s.split("-").map(Number);
   return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}
function nextNDays(n, fromDate = new Date()) {
   const out = [];
   const base = new Date(fromDate);
   base.setHours(0, 0, 0, 0);
   for (let i = 0; i < n; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      out.push(localDateStr(d));
   }
   return out;
}
function buildFullGridISO(daysWindow = 60) {
   // calendar pe zilele Moldova
   const startFrom = new Date();
   const todayMD = ymdStrInTZ(startFrom, MOLDOVA_TZ);
   const [y, m, d] = todayMD.split("-").map(Number);
   const baseMD = new Date(y, m - 1, d, 0, 0, 0, 0);

   const daysArr = nextNDays(daysWindow, baseMD);
   const out = [];
   for (const dayStr of daysArr) {
      const dObj = localDateObjFromStr(dayStr);
      for (const t of oreDisponibile) {
         out.push(toUtcIsoFromLocal(dObj, t.oraStart));
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

/* ===== Telefon cu prefix fix +373 ===== */
const PREFIX = "+373";
const PREFIX_LEN = PREFIX.length;

function PhoneInput373({ value, onChange, ...props }) {
   const inputRef = useRef(null);

   const normalize = (v) => {
      const digits = onlyDigits(v);
      const rest = digits.startsWith("373") ? digits.slice(3) : digits;
      return PREFIX + rest.slice(0, 8);
   };

   const handleChange = (e) => {
      const next = normalize(e.target.value);
      onChange(next);
      requestAnimationFrame(() => {
         const el = inputRef.current;
         if (!el) return;
         if (el.selectionStart < PREFIX_LEN) {
            el.setSelectionRange(PREFIX_LEN, PREFIX_LEN);
         }
      });
   };

   const guardCaret = (e) => {
      const el = e.target;
      const start = el.selectionStart ?? 0;
      if (
         (e.key === "Backspace" && start <= PREFIX_LEN) ||
         (e.key === "Delete" && start < PREFIX_LEN)
      ) {
         e.preventDefault();
         el.setSelectionRange(PREFIX_LEN, PREFIX_LEN);
         return;
      }
      if (start < PREFIX_LEN) {
         e.preventDefault();
         el.setSelectionRange(PREFIX_LEN, PREFIX_LEN);
      }
   };

   const keepCaretAfterPrefix = (e) => {
      const el = e.target;
      const pos = el.selectionStart ?? 0;
      if (pos < PREFIX_LEN) el.setSelectionRange(PREFIX_LEN, PREFIX_LEN);
   };

   const handlePaste = (e) => {
      e.preventDefault();
      const text = (e.clipboardData.getData("text") || "").toString();
      const next = normalize(text);
      onChange(next);
      requestAnimationFrame(() => {
         const el = inputRef.current;
         if (!el) return;
         el.setSelectionRange(el.value.length, el.value.length);
      });
   };

   return (
      <input
         ref={inputRef}
         className="instructors-popup__input"
         inputMode="tel"
         placeholder="+373XXXXXXXX"
         value={value}
         onChange={handleChange}
         onKeyDown={guardCaret}
         onClick={keepCaretAfterPrefix}
         onFocus={keepCaretAfterPrefix}
         onPaste={handlePaste}
         {...props}
      />
   );
}

/* ===== Component ===== */
export default function AAddProg({
   initialStartTime,
   initialDate,
   initialTime,
   initialStudentId,
   initialInstructorId,
   initialSector = "Botanica",
   initialGearbox = "Manual",

   // fallback vechi
   start,
   end,
   instructorId: instructorIdFromPayload,
   sector: sectorFromPayload,
   gearbox: gearboxFromPayload,

   onClose,
}) {
   const dispatch = useDispatch();

   // store
   const studentsAll = useSelector((s) => s.students?.list || []);
   const instructors = useSelector((s) => s.instructors?.list || []);
   const allReservations = useSelector((s) => s.reservations?.list || []);

   // doar elevi cu rol USER
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
   const WINDOW_DAYS = 60;

   // derive inițiale
   const effectiveStartISO =
      (initialStartTime ?? (start ? new Date(start).toISOString() : null)) ||
      null;
   const effectiveInstructorId = String(
      initialInstructorId ?? instructorIdFromPayload ?? ""
   );
   const effectiveSector = sectorFromPayload ?? initialSector ?? "Botanica";
   const effectiveGearbox =
      (gearboxFromPayload ?? initialGearbox ?? "Manual").toLowerCase() ===
      "automat"
         ? "Automat"
         : "Manual";

   // Select state
   const [sector, setSector] = useState(effectiveSector);
   const [gearbox, setGearbox] = useState(effectiveGearbox);
   const [studentId, setStudentId] = useState(
      initialStudentId != null ? String(initialStudentId) : ""
   );
   const [instructorId, setInstructorId] = useState(effectiveInstructorId);

   // existent / nou
   const [mode, setMode] = useState("existing"); // existing | new
   const [newFullName, setNewFullName] = useState("");
   const [phoneFull, setPhoneFull] = useState(PREFIX);

   // anti dublu-click pe „Continuă”
   const [continuing, setContinuing] = useState(false);

   // Pick state
   const [selectedDate, setSelectedDate] = useState(() => {
      if (effectiveStartISO) return new Date(effectiveStartISO);
      if (initialDate) return new Date(initialDate);
      const t = new Date();
      t.setHours(0, 0, 0, 0);
      return t;
   });

   const [selectedTime, setSelectedTime] = useState(() => {
      const hhmm = effectiveStartISO
         ? hhmmInTZ(new Date(effectiveStartISO), MOLDOVA_TZ)
         : initialTime || "";
      const match = oreDisponibile.find((o) => o.oraStart === hhmm);
      return match || null;
   });

   // preferință DST-safe (folosește TZ Moldova)
   const preferredIso = useMemo(() => {
      if (!effectiveStartISO) return null;
      const s = new Date(effectiveStartISO);
      const localMidnight = new Date(s);
      localMidnight.setHours(0, 0, 0, 0);
      const hhmm = hhmmInTZ(s, MOLDOVA_TZ);
      return toUtcIsoFromLocal(localMidnight, hhmm);
   }, [effectiveStartISO]);

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
      dispatch(fetchAllReservations());
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

   // căutarea elevilor NU mai ia în calcul emailul
   const filteredStudents = useMemo(() => {
      const q = (qStudent || "").trim().toLowerCase();
      const base = students;
      if (!q) return base;
      return (base || []).filter((s) => {
         const full = `${s.firstName || ""} ${s.lastName || ""}`.toLowerCase();
         const phone = (s.phone || "").toLowerCase();
         return full.includes(q) || phone.includes(q);
      });
   }, [students, qStudent]);

   const filteredInstructors = useMemo(() => {
      const q = (qInstructor || "").trim().toLowerCase();
      if (!q) return instructors;
      return (instructors || []).filter((i) => {
         const full = `${i.firstName || ""} ${i.lastName || ""}`.toLowerCase();
         const phone = (i.phone || "").toLowerCase();
         return full.includes(q) || phone.includes(q);
      });
   }, [instructors, qInstructor]);

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

   // sugestii după telefon (în modul NEW)
   const phoneMatches = useMemo(() => {
      if (mode !== "new") return [];
      const typedDigits = onlyDigits(phoneFull);
      if (typedDigits.length <= 4) return [];
      return (students || [])
         .filter((s) => onlyDigits(s.phone || "").includes(typedDigits))
         .slice(0, 8);
   }, [mode, phoneFull, students]);

   /* ====== Creare elev pe „Continuă” ====== */
   const ensureStudentCreated = async () => {
      if (mode !== "new") return true;
      if (studentId) return true;

      const { firstName, lastName } = splitFullName(newFullName);
      if (!firstName || !lastName) {
         pushPill("Scrie numele complet (ex.: Ion Popescu).");
         return false;
      }

      const digits = onlyDigits(phoneFull);
      if (!digits.startsWith("373") || digits.length !== 11) {
         pushPill("Telefon invalid. Format: +373 urmat de 8 cifre.");
         return false;
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
                  phone: phoneFull,
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
               } catch {
                  created = {};
               }

               let newId =
                  String(
                     created?.user?.id ??
                        created?.id ??
                        created?.userId ??
                        created?.data?.id ??
                        ""
                  ) || "";

               if (!newId) {
                  await dispatch(fetchStudents());
                  const found = (studentsAll || []).find(
                     (s) => onlyDigits(s.phone || "") === digits
                  );
                  if (found?.id) newId = String(found.id);
               }

               if (!newId) {
                  pushPill(
                     "Elev creat, dar nu am putut extrage ID-ul.",
                     "warning"
                  );
                  return false;
               }

               setStudentId(newId);
               setMode("existing");
               pushPill(
                  `Cont creat (${email}). Continuăm la alegerea orei.`,
                  "success"
               );
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
               // altfel mai încearcă cu sufix
            }
         } catch (e) {
            pushPill(
               e?.message || "Eroare la crearea utilizatorului.",
               "error"
            );
            break;
         }
      }

      await dispatch(fetchStudents());
      const found = (studentsAll || []).find(
         (s) => onlyDigits(s.phone || "") === digits
      );
      if (found?.id) {
         setStudentId(String(found.id));
         setMode("existing");
         pushPill("Elev existent selectat automat după telefon.", "success");
         return true;
      }

      pushPill(
         "Nu am putut crea elevul și nu l-am găsit după telefon.",
         "error"
      );
      return false;
   };

   /** Extrage câmpul datetime dintr-un blackout.
    *  Pentru REPEAT preferă startDateTime (începutul seriei). */
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

   /** Expandează un blackout REPEAT în chei locale "YYYY-MM-DD|HH:mm", filtrate la grila curentă. */
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

   /* ====== Disponibilitate (cu rezervări + blackouts) ====== */
   const computeAvailability = async () => {
      if (!instructorId) return pushPill("Selectează instructorul.", "error");
      if (continuing) return;

      setContinuing(true);
      try {
         if (mode === "new") {
            const okStudent = await ensureStudentCreated();
            if (!okStudent) return;
         } else {
            if (!studentId) {
               pushPill("Selectează elevul.", "error");
               return;
            }
         }

         const fullGrid = buildFullGridISO(WINDOW_DAYS);
         const allowedKeys = new Set(
            fullGrid.map((iso) => localKeyForIso(iso))
         );
         const now = new Date();

         // seturi 'busy' pe cheie locală (YYYY-MM-DD|HH:mm)
         const busyStudent = new Set();
         const busyInstructor = new Set();

         // rezervări existente
         for (const r of allReservations || []) {
            const stRaw = getStartFromReservation(r);
            if (!stRaw) continue;
            const key = busyLocalKeyFromStored(stRaw);
            const rStuId = String(r?.userId ?? r?.studentId ?? "");
            const rInsId = String(r?.instructorId ?? "");
            if (rStuId === String(studentId)) busyStudent.add(key);
            if (rInsId === String(instructorId)) busyInstructor.add(key);
         }

         // blackouts ale instructorului: REPEAT -> expandare completă; SINGLE -> o singură cheie
         try {
            const blackouts = await getInstructorBlackouts(instructorId);
            for (const b of blackouts || []) {
               const type = String(b?.type || "").toUpperCase();

               if (type === "REPEAT") {
                  const keys = expandRepeatLocalKeys(b, allowedKeys);
                  for (const key of keys) {
                     busyInstructor.add(key);
                  }
               } else {
                  const dt = getBlackoutDT(b);
                  if (!dt) continue;
                  const key = busyLocalKeyFromStored(dt);
                  if (allowedKeys.has(key)) busyInstructor.add(key);
               }
            }
         } catch (e) {
            pushPill(
               "Nu am putut încărca orele blocate ale instructorului. Se afișează doar rezervările.",
               "warning"
            );
         }

         // slot liber = viitor + cheie locală nu e în busy-seturi
         const free = fullGrid.filter((iso) => {
            if (new Date(iso) <= now) return false;
            const key = localKeyForIso(iso);
            return !busyStudent.has(key) && !busyInstructor.has(key);
         });

         if (!free.length) {
            pushPill(
               "Nu s-au găsit sloturi libere în intervalul următor.",
               "info"
            );
         }

         setFreeSlots(free);
         setStage("pick");
         setView("formPick");

         const t00 = todayAt00();
         if (selectedDate < t00) setSelectedDate(t00);

         if (preferredIso && free.includes(preferredIso)) {
            const d = new Date(preferredIso);
            setSelectedDate(localDateObjFromStr(ymdStrInTZ(d, MOLDOVA_TZ)));
            const hh = hhmmInTZ(d, MOLDOVA_TZ);
            const m = oreDisponibile.find((o) => o.oraStart === hh);
            setSelectedTime(m || null);
         } else {
            setSelectedTime(null);
         }
      } finally {
         setContinuing(false);
      }
   };

   // grupare sloturi libere pe zile în Moldova
   const freeByDay = useMemo(() => {
      const map = new Map();
      for (const iso of freeSlots) {
         const key = ymdStrInTZ(iso, MOLDOVA_TZ);
         map.set(key, (map.get(key) || 0) + 1);
      }
      return map;
   }, [freeSlots]);

   const dayLocal = selectedDate ? ymdStrInTZ(selectedDate, MOLDOVA_TZ) : null;

   const freeTimesForDay = useMemo(() => {
      if (!selectedDate) return new Set();
      const set = new Set();
      for (const iso of freeSlots) {
         const d = new Date(iso);
         if (ymdStrInTZ(d, MOLDOVA_TZ) === dayLocal) {
            set.add(hhmmInTZ(d, MOLDOVA_TZ));
         }
      }
      return set;
   }, [selectedDate, freeSlots, dayLocal]);

   /* ====== SAVE ====== */
   const [saving, setSaving] = useState(false);

   const onSave = async () => {
      if (!studentId) return pushPill("Selectează/creează elevul.");
      if (!instructorId) return pushPill("Selectează instructorul.");
      if (!selectedDate) return pushPill("Selectează data.");
      if (!selectedTime) return pushPill("Selectează ora.");

      const iso = toUtcIsoFromLocal(selectedDate, selectedTime.oraStart);
      if (new Date(iso) <= new Date()) {
         return pushPill("Ora selectată a trecut deja. Alege o oră viitoare.");
      }
      if (!freeSet.has(iso)) {
         return pushPill(
            "Slot indisponibil pentru elevul și instructorul selectați."
         );
      }
      const startTimeToSend =
         BUSY_KEYS_MODE === "local-match" ? isoForDbMatchLocalHour(iso) : iso;

      setSaving(true);
      try {
         const payload = {
            instructorId: Number(instructorId),
            reservations: [
               {
                  userId: Number(studentId),
                  startTime: startTimeToSend,
                  sector: sector || "Botanica",
                  gearbox:
                     (gearbox || "Manual").toLowerCase() === "automat"
                        ? "Automat"
                        : "Manual",
                  privateMessage: "",
                  color: "#FF5733",
               },
            ],
         };
         await createReservations(payload);
         setMessages([
            { id: Date.now(), type: "success", text: "Programare creată." },
         ]);
         setTimeout(() => onClose?.(), 250);
      } catch (e) {
         pushPill(e?.message || "Nu am putut crea programarea.");
      } finally {
         setSaving(false);
      }
   };

   /* ============ RENDER ============ */
   const continueLabel = continuing
      ? mode === "new" && !studentId
         ? "Se creează elevul…"
         : "Se verifică disponibilitatea…"
      : "Continuă";

   return (
      <>
         <AlertPills messages={messages} onDismiss={popPill} />

         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Adaugă programare</h3>
         </div>

         <div className="aAddProg instructors-popup__content">
            {/* Toggle existent / nou */}
            <div className="saddprogramari__toggle">
               <button
                  type="button"
                  className={`saddprogramari__toggle-btn ${
                     mode === "existing" ? "is-active" : ""
                  }`}
                  onClick={() => setMode("existing")}
                  disabled={continuing}
               >
                  Student existent
               </button>
               <button
                  type="button"
                  className={`saddprogramari__toggle-btn ${
                     mode === "new" ? "is-active" : ""
                  }`}
                  onClick={() => setMode("new")}
                  disabled={continuing}
               >
                  Student nou
               </button>
            </div>

            {/* Etapa 1: SELECT */}
            {stage === "select" && view === "formSelect" && (
               <>
                  <div className="instructors-popup__form-row">
                     {mode === "existing" ? (
                        <label
                           className="instructors-popup__field"
                           style={{ flex: 1 }}
                        >
                           <span className="instructors-popup__label">
                              Elev
                           </span>
                           <div className="picker__row">
                              <input
                                 className="instructors-popup__input"
                                 type="text"
                                 readOnly
                                 value={studentDisplay}
                                 placeholder="Alege elev"
                              />
                              <button
                                 type="button"
                                 className="instructors-popup__form-button"
                                 onClick={() => setView("searchStudent")}
                                 disabled={continuing}
                              >
                                 Caută elev
                              </button>
                           </div>
                        </label>
                     ) : (
                        <div
                           className="saddprogramari__new-student"
                           style={{ flex: 1 }}
                        >
                           <span className="instructors-popup__label">
                              Elev nou
                           </span>

                           <div className="saddprogramari__new-grid">
                              <input
                                 className="instructors-popup__input"
                                 placeholder="Nume Prenume"
                                 value={newFullName}
                                 onChange={(e) =>
                                    setNewFullName(e.target.value)
                                 }
                                 disabled={continuing}
                              />
                              <PhoneInput373
                                 value={phoneFull}
                                 onChange={setPhoneFull}
                                 disabled={continuing}
                              />
                           </div>
                        </div>
                     )}

                     {/* Instructor */}
                     <label
                        className="instructors-popup__field"
                        style={{ flex: 1 }}
                     >
                        <span className="instructors-popup__label">
                           Instructor
                        </span>
                        <div className="picker__row">
                           <input
                              className="instructors-popup__input"
                              type="text"
                              readOnly
                              value={instructorDisplay}
                              placeholder="Alege instructor"
                           />
                           <button
                              type="button"
                              className="instructors-popup__form-button"
                              onClick={() => setView("searchInstructor")}
                              disabled={continuing}
                           >
                              Caută instructor
                           </button>
                        </div>
                     </label>
                  </div>

                  {phoneMatches.length > 0 && !continuing && (
                     <ul className="phone-suggestions">
                        {phoneMatches.map((s) => {
                           const label = `${s.firstName || ""} ${
                              s.lastName || ""
                           }`.trim();
                           return (
                              <li
                                 key={s.id}
                                 className="phone-suggestions__item"
                                 onClick={() => {
                                    setMode("existing");
                                    setStudentId(String(s.id));
                                    setNewFullName("");
                                    setPhoneFull(PREFIX);
                                    pushPill(
                                       "Elev existent selectat din sugestii.",
                                       "info"
                                    );
                                 }}
                              >
                                 <span className="sug-name">{label}</span>
                                 {s.phone ? (
                                    <span className="sug-phone">{s.phone}</span>
                                 ) : null}
                              </li>
                           );
                        })}
                     </ul>
                  )}

                  {/* Sector + Cutie */}
                  <div className="instructors-popup__form-row">
                     <div
                        className={`instructors-popup__radio-wrapper addprog ${
                           sector === "Botanica"
                              ? "active-botanica"
                              : "active-ciocana"
                        }`}
                        style={{ flex: 1 }}
                     >
                        <label>
                           <input
                              type="radio"
                              name="sector"
                              value="Botanica"
                              checked={sector === "Botanica"}
                              onChange={(e) => setSector(e.target.value)}
                              disabled={continuing}
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
                              disabled={continuing}
                           />
                           Ciocana
                        </label>
                     </div>

                     <div
                        className={`instructors-popup__radio-wrapper addprog ${
                           gearbox === "Manual"
                              ? "active-botanica"
                              : "active-ciocana"
                        }`}
                        style={{ flex: 1 }}
                     >
                        <label>
                           <input
                              type="radio"
                              name="gearbox"
                              value="Manual"
                              checked={gearbox === "Manual"}
                              onChange={(e) => setGearbox(e.target.value)}
                              disabled={continuing}
                           />
                           Manual
                        </label>
                        <label>
                           <input
                              type="radio"
                              name="gearbox"
                              value="Automat"
                              checked={gearbox === "Automat"}
                              onChange={(e) => setGearbox(e.target.value)}
                              disabled={continuing}
                           />
                           Automat
                        </label>
                     </div>
                  </div>

                  <div className="saddprogramari__add-btns">
                     <button
                        onClick={computeAvailability}
                        className="saddprogramari__add-btn arrow"
                        type="button"
                        disabled={
                           !instructorId ||
                           continuing ||
                           (mode === "existing" && !studentId)
                        }
                        title={
                           !instructorId
                              ? "Selectează instructorul"
                              : mode === "existing" && !studentId
                              ? "Selectează elevul"
                              : ""
                        }
                     >
                        <span>{continueLabel}</span>
                        <ReactSVG
                           src={arrowIcon}
                           className="saddprogramari__add-btn-icon"
                        />
                     </button>
                  </div>
               </>
            )}

            {/* Căutare elev */}
            {view === "searchStudent" && (
               <>
                  <div className="instructors-popup__search-wrapper">
                     <input
                        type="text"
                        className="instructors-popup__search"
                        placeholder="Caută elev după nume sau telefon…"
                        value={qStudent}
                        onChange={(e) => setQStudent(e.target.value)}
                        disabled={continuing}
                     />
                     <button
                        className="instructors-popup__form-button instructors-popup__form-button--cancel"
                        onClick={() => setView("formSelect")}
                        disabled={continuing}
                     >
                        Înapoi
                     </button>
                  </div>
                  <div className="instructors-popup__list-wrapper">
                     <ul className="instructors-popup__list-items">
                        {filteredStudents.map((s) => {
                           const full = `${s.firstName || ""} ${
                              s.lastName || ""
                           }`.trim();
                           const phone = s.phone || "";
                           return (
                              <li
                                 key={s.id}
                                 className="instructors-popup__item"
                                 onClick={() => {
                                    if (continuing) return;
                                    setStudentId(String(s.id));
                                    setMode("existing");
                                    setView("formSelect");
                                 }}
                              >
                                 <div className="instructors-popup__item-left">
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
                  <div className="instructors-popup__search-wrapper">
                     <input
                        type="text"
                        className="instructors-popup__search"
                        placeholder="Caută instructor după nume sau telefon..."
                        value={qInstructor}
                        onChange={(e) => setQInstructor(e.target.value)}
                        disabled={continuing}
                     />
                     <button
                        className="instructors-popup__form-button instructors-popup__form-button--cancel"
                        onClick={() => setView("formSelect")}
                        disabled={continuing}
                     >
                        Înapoi
                     </button>
                  </div>
                  <div className="instructors-popup__list-wrapper">
                     <ul className="instructors-popup__list-items">
                        {filteredInstructors.map((i) => {
                           const full = `${i.firstName || ""} ${
                              i.lastName || ""
                           }`.trim();
                           const phone = i.phone || "";
                           return (
                              <li
                                 key={i.id}
                                 className="instructors-popup__item"
                                 onClick={() => {
                                    if (continuing) return;
                                    setInstructorId(String(i.id));
                                    setView("formSelect");
                                 }}
                              >
                                 <div className="instructors-popup__item-left">
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
                  <div className="saddprogramari__selector">
                     <div className="saddprogramari__calendar">
                        <h3 className="saddprogramari__title">
                           Selectează data și ora:
                        </h3>
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
                           minDate={todayAt00()}
                           dayClassName={(date) => {
                              const day = ymdStrInTZ(date, MOLDOVA_TZ);
                              return freeByDay.has(day)
                                 ? ""
                                 : "saddprogramari__day--inactive";
                           }}
                           calendarClassName="aAddProg__datepicker"
                        />
                     </div>

                     <div className="saddprogramari__times">
                        <h3 className="saddprogramari__title">Selectează:</h3>
                        <div className="saddprogramari__times-list">
                           {!selectedDate && (
                              <div className="saddprogramari__disclaimer">
                                 Te rog să selectezi mai întâi o zi!
                              </div>
                           )}
                           {oreDisponibile.map((ora) => {
                              const iso = selectedDate
                                 ? toUtcIsoFromLocal(selectedDate, ora.oraStart)
                                 : null;

                              const isSelected =
                                 selectedTime?.oraStart === ora.oraStart;

                              const isToday =
                                 !!selectedDate &&
                                 ymdStrInTZ(selectedDate, MOLDOVA_TZ) ===
                                    ymdStrInTZ(new Date(), MOLDOVA_TZ);
                              const nowHHMM = hhmmInTZ(new Date(), MOLDOVA_TZ);
                              const pastToday =
                                 isToday && ora.oraStart <= nowHHMM;

                              const disabled =
                                 !selectedDate ||
                                 pastToday ||
                                 !freeSet.has(iso) ||
                                 (iso && new Date(iso) <= new Date());

                              return (
                                 <button
                                    key={ora.eticheta}
                                    onClick={() => setSelectedTime(ora)}
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
                                       !selectedDate
                                          ? "Alege o zi"
                                          : pastToday
                                          ? "Ora a trecut deja pentru azi"
                                          : !freeSet.has(iso)
                                          ? "Indisponibil pentru elevul/instructorul selectați"
                                          : new Date(iso) <= new Date()
                                          ? "Ora a trecut"
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

                  {selectedDate && selectedTime && (
                     <div
                        className="saddprogramari__info"
                        style={{ marginTop: 8 }}
                     >
                        Ai selectat:{" "}
                        <b>
                           {formatDateRO(
                              toUtcIsoFromLocal(
                                 selectedDate,
                                 selectedTime.oraStart
                              )
                           )}
                        </b>{" "}
                        la <b>{selectedTime.eticheta}</b>
                     </div>
                  )}

                  <div className="saddprogramari__add-btns">
                     <button
                        onClick={() => {
                           setStage("select");
                           setView("formSelect");
                           setSelectedTime(null);
                        }}
                        className="saddprogramari__add-btn arrow0"
                        type="button"
                        disabled={saving}
                     >
                        <ReactSVG
                           src={arrowIcon}
                           className="saddprogramari__add-btn-icon"
                        />
                        <span>Înapoi</span>
                     </button>

                     <button
                        onClick={onSave}
                        disabled={!selectedDate || !selectedTime || saving}
                        className="saddprogramari__add-btn arrow"
                        type="button"
                     >
                        <span>{saving ? "Se salvează..." : "Trimite"}</span>
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
