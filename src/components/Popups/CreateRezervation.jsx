// src/components/Popups/CreateRezervation.jsx
import React, {
   useEffect,
   useMemo,
   useRef,
   useState,
   useCallback,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { ReactSVG } from "react-svg";

import AlertPills from "../Utils/AlertPills";
import arrowIcon from "../../assets/svg/arrow.svg";

import { createReservationsForUser } from "../../api/reservationsService";

import { fetchStudents } from "../../store/studentsSlice";
import { fetchInstructors } from "../../store/instructorsSlice";
import { fetchReservationsDelta } from "../../store/reservationsSlice";
import {
   triggerCalendarRefresh,
   scheduleCalendarRefresh, // ✅ ADD: ca să notificăm calendarul pentru blackouts
} from "../Utils/calendarBus";

import apiClientService from "../../api/ApiClientService";
import {
   getInstructorBlackouts,
   addInstructorBlackout,
   deleteInstructorBlackout,
} from "../../api/instructorsService";

import {
   closePopup as closePopupStore,
   closeSubPopup as closeSubPopupStore,
} from "../Utils/popupStore";

const GROUP_TOKEN_FIXED = "ABCD1234";
const EMAIL_DOMAIN = "instrauto.com";
const MOLDOVA_TZ = "Europe/Chisinau";

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

/* ========= TZ utils ========= */
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

/**
 * IMPORTANT:
 * backend-ul tău pare să compare "local hour" în DB (de aici hack-ul).
 * pentru CREATE / ADD blackout trimiți startTimeToSend (poate fi cu offset).
 * pentru MATCH în UI, comparăm întotdeauna pe ISO Z + tz comparison.
 */
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

/* Helpers diverse */
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

function escapeRegExp(s) {
   return (s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text, query) {
   if (!text) return "";
   if (!query) return text;

   const safe = escapeRegExp(query);
   if (!safe) return text;

   const parts = text.toString().split(new RegExp(`(${safe})`, "gi"));
   const qLower = (query || "").toLowerCase();
   return parts.map((part, i) =>
      part.toLowerCase() === qLower ? (
         <i key={i} className="highlight">
            {part}
         </i>
      ) : (
         part
      )
   );
}

const formatDateRO = (iso) => {
   if (!iso) return "";
   const d = new Date(iso);
   const fmt = new Intl.DateTimeFormat("ro-RO", {
      timeZone: MOLDOVA_TZ,
      day: "numeric",
      month: "long",
      year: "numeric",
   }).format(d);
   return fmt.replace(/\b([a-zăîâșț])/u, (m) => m.toUpperCase());
};

/** helper: extrage dateTime din blackout, compatibil cu SINGLE/REPEAT */
function getBlackoutDT(b) {
   if (!b) return null;
   if (typeof b === "string") return b;
   const t = String(b.type || b.Type || "").toUpperCase();
   if (t === "REPEAT")
      return b.startDateTime || b.dateTime || b.datetime || null;
   return b.dateTime || b.datetime || b.startTime || b.date || b.begin || null;
}

/** ==== helpers pentru REPEAT ==== */
function pad2(n) {
   return String(n).padStart(2, "0");
}
function getMonthRangeYMD(dateObj) {
   const d = new Date(dateObj);
   const y = d.getFullYear();
   const m = d.getMonth(); // 0-11
   const lastDay = new Date(y, m + 1, 0).getDate();
   return {
      startDate: `${y}-${pad2(m + 1)}-01`,
      endDate: `${y}-${pad2(m + 1)}-${pad2(lastDay)}`,
   };
}

/** ==== build local date from initialDate (YYYY-MM-DD) to avoid TZ surprises ==== */
function safeLocalDateFromYMD(ymd) {
   const m = String(ymd || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})$/);
   if (!m) return null;
   const Y = +m[1],
      Mo = +m[2],
      D = +m[3];
   // punem ora la 12:00 ca să evităm edge DST / midnight shifts
   return new Date(Y, Mo - 1, D, 12, 0, 0, 0);
}

/* ===========================================================
   ✅ FIX IMPORTANT (copy logic din calendar):
   - în calendar slot-ul blocat e determinat prin "local slot key" (YYYY-MM-DD|HH:mm)
     calculat cu busyLocalKeyFromStored(dt)
   - în popup făceai match pe ISO (sameLocalSlot) și se rupea când backend-ul folosește local-match
   -> AICI facem match 1:1 cu calendarul (slotKey)
=========================================================== */

function ymdStrInTZ(dateLike, timeZone = MOLDOVA_TZ) {
   const { y, m, d } = partsInTZ(dateLike, timeZone);
   return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function localKeyFromTs(dateLike, timeZone = MOLDOVA_TZ) {
   return `${ymdStrInTZ(dateLike, timeZone)}|${hhmmInTZ(dateLike, timeZone)}`;
}

/** EXACT ca în calendar */
function busyLocalKeyFromStored(st) {
   const d = new Date(st);
   if (Number.isNaN(d.getTime())) return "";
   const offMin = tzOffsetMinutesAt(d.getTime(), MOLDOVA_TZ);
   const base = new Date(d.getTime() - offMin * 60000);
   return localKeyFromTs(base.getTime(), MOLDOVA_TZ);
}

/** REPEAT: verifică dacă targetKey apare în recurență (exact ca expandRepeatLocalKeys din calendar) */
function repeatContainsSlotKey(b, targetKey) {
   const type = String(b?.type || b?.Type || "").toUpperCase();
   if (type !== "REPEAT") return false;

   const stepDays = Math.max(1, Number(b?.repeatEveryDays || 1));
   const first = b?.startDateTime || b?.dateTime || b?.datetime || null;
   const last = b?.endDateTime || first;
   if (!first || !last) return false;

   let cur = new Date(first).getTime();
   const lastMs = new Date(last).getTime();
   if (Number.isNaN(cur) || Number.isNaN(lastMs)) return false;

   while (cur <= lastMs) {
      const k = busyLocalKeyFromStored(new Date(cur).toISOString());
      if (k && k === targetKey) return true;
      cur += stepDays * 24 * 60 * 60 * 1000;
   }
   return false;
}

export default function CreateRezervation({
   initialStartTime,
   initialDate, // ✅ primesc din calendar (YYYY-MM-DD)
   initialTime, // ✅ primesc din calendar (HH:mm)
   initialStudentId,
   initialInstructorId,
   initialSector = "Botanica",
   initialGearbox = "Manual",

   start,
   end,
   instructorId: instructorIdFromPayload,
   sector: sectorFromPayload,
   gearbox: gearboxFromPayload,

   draftSlotKey, // ✅ cheia fixă "<instId>|<suffix>"

   onClose,
}) {
   const dispatch = useDispatch();
   const rootRef = useRef(null);

   // ✅ FIX: guard + armare click-away
   const closingRef = useRef(false);
   const openArmedRef = useRef(false);

   const studentsAll = useSelector((s) => s.students?.list || []);
   const instructors = useSelector((s) => s.instructors?.list || []);

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

   // Pills
   const [messages, setMessages] = useState([]);
   const pushPill = useCallback((text, type = "error") => {
      setMessages((prev) => [
         ...prev,
         { id: Date.now() + Math.random(), text, type },
      ]);
   }, []);
   const popPill = useCallback(() => {
      setMessages((prev) => prev.slice(0, -1));
   }, []);

   const [view, setView] = useState("formSelect");

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
   const [sector] = useState(effectiveSector);
   const [gearbox] = useState(effectiveGearbox);
   const [studentId, setStudentId] = useState(
      initialStudentId != null ? String(initialStudentId) : ""
   );
   const [instructorId, setInstructorId] = useState(effectiveInstructorId);
   const [privateMessage, setPrivateMessage] = useState("");

   // elev nou
   const [newFullName, setNewFullName] = useState("");
   const [phoneFull, setPhoneFull] = useState("");
   const [highlightedStudentId, setHighlightedStudentId] = useState(null);
   const [continuing, setContinuing] = useState(false);

   // ✅ zi + oră derivate din props (read-only)
   const [selectedDate] = useState(() => {
      // 1) dacă calendarul îți trimite explicit ziua -> folosim asta
      const d1 = initialDate ? safeLocalDateFromYMD(initialDate) : null;
      if (d1) return d1;

      // 2) altfel fallback la start ISO
      if (effectiveStartISO) return new Date(effectiveStartISO);

      // 3) fallback final
      if (start) return new Date(start);
      return null;
   });

   const [selectedTime] = useState(() => {
      // 1) dacă calendarul îți trimite explicit ora -> folosim asta
      const hhmmFromProps = (initialTime || "").trim();
      const hhmm =
         hhmmFromProps ||
         (effectiveStartISO
            ? hhmmInTZ(new Date(effectiveStartISO), MOLDOVA_TZ)
            : "");

      if (!hhmm) return null;
      const match = oreDisponibile.find((o) => o.oraStart === hhmm);
      return match || { eticheta: hhmm, oraStart: hhmm };
   });

   const [qStudent, setQStudent] = useState("");
   const [qInstructor, setQInstructor] = useState("");

   // blackout state
   const [hasBlackout, setHasBlackout] = useState(false);
   const [blackoutId, setBlackoutId] = useState(null);
   const [blackoutType, setBlackoutType] = useState(null); // ✅ "SINGLE" | "REPEAT" | null
   const [checkingBlackout, setCheckingBlackout] = useState(false);
   const [blocking, setBlocking] = useState(false);

   // ✅ încărcări inițiale
   useEffect(() => {
      if (!studentsAll?.length) dispatch(fetchStudents());
      if (!instructors?.length) dispatch(fetchInstructors());
   }, [dispatch, studentsAll?.length, instructors?.length]);

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

   /* =========================
    ✅ CREATE-DRAFT join/leave (SINGLE SOURCE OF TRUTH)
    - cheia vine din calendar: draftSlotKey = "<instId>|<suffix>"
    - păstrăm <suffix> IDENTIC; schimbăm doar instId dacă user îl schimbă în popup
  ========================= */

   const wsRef = useRef(null);
   useEffect(() => {
      wsRef.current =
         typeof window !== "undefined" ? window.__reservationWS : null;
   }, []);

   const draftSuffix = useMemo(() => {
      const raw = String(draftSlotKey || "").trim();
      if (raw.includes("|")) {
         return raw.split("|").slice(1).join("|").trim();
      }

      // fallback (doar dacă NU ai draftSlotKey din calendar)
      if (effectiveStartISO) {
         const d = new Date(effectiveStartISO);
         return Number.isFinite(d.getTime()) ? d.toISOString() : "";
      }
      if (selectedDate && selectedTime?.oraStart) {
         return toUtcIsoFromLocal(selectedDate, selectedTime.oraStart);
      }
      return "";
   }, [draftSlotKey, effectiveStartISO, selectedDate, selectedTime]);

   const draftRoomKey = useMemo(() => {
      const inst = String(instructorId || "").trim();
      const suf = String(draftSuffix || "").trim();
      if (!inst || !suf) return "";
      return `${inst}|${suf}`;
   }, [instructorId, draftSuffix]);

   const activeKeyRef = useRef("");
   useEffect(() => {
      activeKeyRef.current = draftRoomKey;
   }, [draftRoomKey]);

   const leftRef = useRef(new Set());

   const getWS = () =>
      (typeof window !== "undefined" ? window.__reservationWS : null) ||
      wsRef.current;

   const joinDraft = useCallback(
      (key) => {
         if (!key) return;
         leftRef.current.delete(key);

         const ws = getWS();
         ws?.joinCreateDraft?.(key, { sector, gearbox });

         if (typeof window !== "undefined" && window.__WS_DEBUG) {
            console.log("[DRAFT] join", key, { sector, gearbox });
         }
      },
      [sector, gearbox]
   );

   const leaveDraft = useCallback(
      (key) => {
         if (!key) return;
         if (leftRef.current.has(key)) return;
         leftRef.current.add(key);

         const ws = getWS();
         ws?.leaveCreateDraft?.(key, { sector, gearbox });

         if (typeof window !== "undefined" && window.__WS_DEBUG) {
            console.log("[DRAFT] leave", key, { sector, gearbox });
         }
      },
      [sector, gearbox]
   );

   useEffect(() => {
      if (!draftRoomKey) return;

      joinDraft(draftRoomKey);

      return () => {
         leaveDraft(draftRoomKey);
      };
   }, [draftRoomKey, joinDraft, leaveDraft]);

   // force leave la pagehide / unload / tab hidden
   useEffect(() => {
      const forceLeave = () => {
         const key = activeKeyRef.current;
         if (key) leaveDraft(key);
      };

      const onPageHide = () => forceLeave();
      const onBeforeUnload = () => forceLeave();
      const onVis = () => {
         if (document.hidden) forceLeave();
      };

      window.addEventListener("pagehide", onPageHide);
      window.addEventListener("beforeunload", onBeforeUnload);
      document.addEventListener("visibilitychange", onVis);

      return () => {
         window.removeEventListener("pagehide", onPageHide);
         window.removeEventListener("beforeunload", onBeforeUnload);
         document.removeEventListener("visibilitychange", onVis);
      };
   }, [leaveDraft]);

   // closeSelf: folosește STRICT cheia activă
   const closeSelf = useCallback(() => {
      if (closingRef.current) return;
      closingRef.current = true;

      const key = activeKeyRef.current || draftRoomKey;
      leaveDraft(key);

      if (typeof onClose === "function") return onClose();

      try {
         closeSubPopupStore();
      } catch {}
      try {
         closePopupStore();
      } catch {}
   }, [onClose, leaveDraft, draftRoomKey]);

   // ✅ click-away armat după 2 frame-uri, cu composedPath()
   useEffect(() => {
      closingRef.current = false;
      openArmedRef.current = false;

      let raf1 = 0;
      let raf2 = 0;

      raf1 = requestAnimationFrame(() => {
         raf2 = requestAnimationFrame(() => {
            openArmedRef.current = true;
         });
      });

      const isInside = (e) => {
         const root = rootRef.current;
         if (!root) return false;

         const path =
            typeof e.composedPath === "function" ? e.composedPath() : null;
         if (path && path.includes(root)) return true;

         const target = e.target;
         return target instanceof Node ? root.contains(target) : false;
      };

      const onPointerDown = (e) => {
         if (!openArmedRef.current) return;
         if (typeof e.button === "number" && e.button !== 0) return;

         if (isInside(e)) return;
         closeSelf();
      };

      const onKeyDown = (e) => {
         if (e.key === "Escape") closeSelf();
      };

      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeyDown, true);

      return () => {
         cancelAnimationFrame(raf1);
         cancelAnimationFrame(raf2);
         document.removeEventListener("pointerdown", onPointerDown, true);
         document.removeEventListener("keydown", onKeyDown, true);
      };
   }, [closeSelf]);

   const autoSelectSingleStudent = useCallback(
      (list, msg = "Elev selectat după căutare.") => {
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

         if (msg) pushPill(msg, "info");
         return true;
      },
      [pushPill]
   );

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

   const ensureStudentCreated = useCallback(async () => {
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

               if (!newId) newId = await waitUntilStudentInListByPhone(digits);

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
   }, [dispatch, newFullName, phoneFull, pushPill]);

   const [saving, setSaving] = useState(false);

   const onSave = useCallback(async () => {
      if (saving) return;
      if (!studentId) return pushPill("Selectează/creează elevul.");
      if (!instructorId) return pushPill("Selectează instructorul.");
      if (!selectedDate || !selectedTime) {
         return pushPill("Lipsește ziua sau ora programării (din props).");
      }

      // dacă slotul e blocat pe REPEAT -> nu permite programare (opțional, dar logic)
      if (blackoutType === "REPEAT") {
         return pushPill(
            "Slotul este blocat prin REPEAT. Nu poți crea programare aici.",
            "error"
         );
      }
      // dacă slotul e blocat pe SINGLE -> tot nu permite programare
      if (blackoutType === "SINGLE" && hasBlackout) {
         return pushPill(
            "Slotul este blocat (SINGLE). Deblochează înainte de programare.",
            "error"
         );
      }

      const iso = toUtcIsoFromLocal(selectedDate, selectedTime.oraStart);

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

         try {
            triggerCalendarRefresh();
         } catch {}

         closeSelf();
      } catch (e) {
         pushPill(e?.message || "Nu am putut crea programarea.");
      } finally {
         setSaving(false);
      }
   }, [
      saving,
      studentId,
      instructorId,
      selectedDate,
      selectedTime,
      sector,
      gearbox,
      privateMessage,
      dispatch,
      pushPill,
      closeSelf,
      blackoutType,
      hasBlackout,
   ]);

   const validNewName = newFullName.trim().split(/\s+/).length >= 2;
   const validNewPhone = onlyDigits(phoneFull).length > 0;

   const handleCreateStudentClick = useCallback(async () => {
      if (continuing) return;
      setContinuing(true);
      try {
         await ensureStudentCreated();
      } finally {
         setContinuing(false);
      }
   }, [continuing, ensureStudentCreated]);

   // când scrii telefon, caută exact și highlight
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

   const studentLabel =
      studentDisplay !== "ne ales" ? studentDisplay : "Alege elev";
   const instructorLabel =
      instructorDisplay !== "ne ales" ? instructorDisplay : "Alege instructor";

   const dateLabel = selectedDate
      ? formatDateRO(selectedDate.toISOString())
      : "Nu este setată";
   const timeLabel = selectedTime?.eticheta || "Nu este setată";

   /* ====== Blackout detect (FIXED):
      - verifică lunar (startDate/endDate)
      - găsește SINGLE pentru acest slot (cu ID pentru delete)
      - detectează și REPEAT (doar ca status “ocupat”)
      - IMPORTANT: match pe targetKey EXACT ca în calendar
  ====== */
   useEffect(() => {
      if (!instructorId || !selectedDate || !selectedTime) {
         setHasBlackout(false);
         setBlackoutId(null);
         setBlackoutType(null);
         return;
      }

      let cancelled = false;

      const run = async () => {
         setCheckingBlackout(true);
         try {
            const monthRange = getMonthRangeYMD(selectedDate);

            let list = null;
            try {
               list = await getInstructorBlackouts(instructorId, monthRange);
            } catch {
               list = await getInstructorBlackouts(instructorId);
            }

            // țintă: cheia slotului selectat (YYYY-MM-DD|HH:mm) în Moldova TZ
            const targetIso = toUtcIsoFromLocal(
               selectedDate,
               selectedTime.oraStart
            );
            const targetKey = localKeyFromTs(targetIso, MOLDOVA_TZ);

            let foundSingle = null;
            let foundRepeat = false;

            for (const b of list || []) {
               const type = String(b?.type || b?.Type || "").toUpperCase();

               if (type === "SINGLE") {
                  const dt = getBlackoutDT(b);
                  if (!dt) continue;

                  // IMPORTANT: comparăm ca în calendar
                  if (busyLocalKeyFromStored(dt) === targetKey) {
                     foundSingle = b;
                     break;
                  }
               }

               if (type === "REPEAT") {
                  if (repeatContainsSlotKey(b, targetKey)) {
                     foundRepeat = true;
                  }
               }
            }

            if (cancelled) return;

            if (foundSingle) {
               const id =
                  foundSingle.id ??
                  foundSingle._id ??
                  foundSingle.blackoutId ??
                  foundSingle.blackout_id ??
                  null;

               setHasBlackout(true);
               setBlackoutType("SINGLE");
               setBlackoutId(id);
               return;
            }

            if (foundRepeat) {
               setHasBlackout(true);
               setBlackoutType("REPEAT");
               setBlackoutId(null);
               return;
            }

            setHasBlackout(false);
            setBlackoutType(null);
            setBlackoutId(null);
         } catch {
            if (cancelled) return;
            setHasBlackout(false);
            setBlackoutType(null);
            setBlackoutId(null);
         } finally {
            if (!cancelled) setCheckingBlackout(false);
         }
      };

      run();
      return () => {
         cancelled = true;
      };
   }, [instructorId, selectedDate, selectedTime]);

   /* ====== Block / Unblock blackout SINGLE ====== */
   const handleToggleBlackout = useCallback(async () => {
      if (!instructorId) {
         pushPill("Selectează instructorul înainte de blocare.", "error");
         return;
      }
      if (!selectedDate || !selectedTime) {
         pushPill("Lipsește ziua sau ora pentru blocare.", "error");
         return;
      }

      // REPEAT: nu îl deblochezi aici (alt endpoint / alt UI)
      if (blackoutType === "REPEAT") {
         pushPill(
            "Acest slot e blocat prin REPEAT. Deblocarea se face din setările de blocări (repetitive).",
            "warning"
         );
         return;
      }

      const iso = toUtcIsoFromLocal(selectedDate, selectedTime.oraStart);
      const dateTimeToSend =
         BUSY_KEYS_MODE === "local-match" ? isoForDbMatchLocalHour(iso) : iso;

      setBlocking(true);
      try {
         if (!hasBlackout) {
            // ✅ creează SINGLE
            await addInstructorBlackout(Number(instructorId), dateTimeToSend);
         } else if (blackoutId != null) {
            // ✅ șterge SINGLE
            await deleteInstructorBlackout(blackoutId);
         } else {
            // fallback (căutăm SINGLE id) — FIX: match pe targetKey, ca în calendar
            const monthRange = getMonthRangeYMD(selectedDate);

            let list = null;
            try {
               list = await getInstructorBlackouts(instructorId, monthRange);
            } catch {
               list = await getInstructorBlackouts(instructorId);
            }

            const targetIso = toUtcIsoFromLocal(
               selectedDate,
               selectedTime.oraStart
            );
            const targetKey = localKeyFromTs(targetIso, MOLDOVA_TZ);

            const found = (list || []).find((b) => {
               const type = String(b?.type || b?.Type || "").toUpperCase();
               if (type !== "SINGLE") return false;
               const dt = getBlackoutDT(b);
               if (!dt) return false;
               return busyLocalKeyFromStored(dt) === targetKey;
            });

            if (found) {
               const id =
                  found.id ??
                  found._id ??
                  found.blackoutId ??
                  found.blackout_id ??
                  null;
               if (id != null) await deleteInstructorBlackout(id);
            }
         }

         // ✅ spune calendarului să refacă blackouts pentru instructorul acesta (fără refetch de reservations)
         try {
            scheduleCalendarRefresh({
               source: "popup",
               type: "blackouts-changed",
               instructorId: String(instructorId),
               forceReload: false,
            });
         } catch {}

         closeSelf();
      } catch (e) {
         pushPill(e?.message || "Nu am putut actualiza blocarea.", "error");
      } finally {
         setBlocking(false);
      }
   }, [
      instructorId,
      selectedDate,
      selectedTime,
      hasBlackout,
      blackoutId,
      blackoutType,
      pushPill,
      closeSelf,
   ]);

   const blackoutButtonLabel =
      blackoutType === "REPEAT"
         ? "Blocare (repeat)"
         : hasBlackout
         ? "Deblochează"
         : "Blochează";

   const blackoutButtonDisabled =
      blocking ||
      saving ||
      continuing ||
      checkingBlackout ||
      !instructorId ||
      !selectedDate ||
      !selectedTime ||
      blackoutType === "REPEAT";

   return (
      <div ref={rootRef} className="popupui popupui--a-add-prog">
         <AlertPills messages={messages} onDismiss={popPill} />

         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Adaugă programare</h3>
         </div>

         <div className="popupui__content">
            {view === "formSelect" && (
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

                  {/* Ziua + Ora – info readonly */}
                  <div className="popupui__form-row popupui__form-row--compact">
                     <div className="popupui__field popupui__field--grow-1">
                        <span className="popupui__field-label">Ziua</span>
                        <div className="popupui__field-line">
                           <span className="popupui__field-text">
                              {dateLabel}
                           </span>
                        </div>
                     </div>

                     <div className="popupui__field popupui__field--grow-1">
                        <span className="popupui__field-label">Ora</span>
                        <div className="popupui__field-line">
                           <span className="popupui__field-text">
                              {timeLabel}
                           </span>
                        </div>
                     </div>
                  </div>

                  {/* Sector + Cutie – info din props */}
                  <div className="popupui__form-row popupui__form-row--compact">
                     <div className="popupui__field popupui__field--grow-1">
                        <span className="popupui__field-label">Sector</span>
                        <div className="popupui__field-line">
                           <span className="popupui__field-text">
                              {sector || "Sector nesetat"}
                           </span>
                        </div>
                     </div>

                     <div className="popupui__field popupui__field--grow-1">
                        <span className="popupui__field-label">Cutie</span>
                        <div className="popupui__field-line">
                           <span className="popupui__field-text">
                              {gearbox
                                 ? gearbox.toLowerCase() === "automat"
                                    ? "Automat"
                                    : "Manual"
                                 : "Cutie nesetată"}
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
                     {/* Buton BLOCARE / DEBLOCARE */}
                     <button
                        type="button"
                        className="popupui__secondary-btn no-icon"
                        onClick={handleToggleBlackout}
                        disabled={blackoutButtonDisabled}
                        title={
                           blackoutType === "REPEAT"
                              ? "Blocare repetitivă (REPEAT) – se gestionează separat"
                              : !instructorId
                              ? "Selectează instructorul înainte de blocare"
                              : !selectedDate || !selectedTime
                              ? "Lipsește ziua sau ora (vin din slotul selectat)"
                              : ""
                        }
                     >
                        {checkingBlackout
                           ? "Se verifică..."
                           : blackoutButtonLabel}
                     </button>

                     {/* Buton TRIMITE */}
                     <button
                        onClick={onSave}
                        className="popupui__primary-btn popupui__primary-btn--arrow"
                        type="button"
                        disabled={
                           saving ||
                           continuing ||
                           !instructorId ||
                           !studentId ||
                           !selectedDate ||
                           !selectedTime ||
                           blackoutType === "REPEAT" ||
                           (blackoutType === "SINGLE" && hasBlackout)
                        }
                        title={
                           blackoutType === "REPEAT"
                              ? "Slot blocat prin REPEAT"
                              : blackoutType === "SINGLE" && hasBlackout
                              ? "Slot blocat (SINGLE). Deblochează înainte."
                              : !instructorId
                              ? "Selectează instructorul"
                              : !studentId
                              ? "Selectează elevul"
                              : !selectedDate || !selectedTime
                              ? "Lipsește ziua sau ora (trebuie trimise prin props)"
                              : ""
                        }
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
         </div>
      </div>
   );
}
