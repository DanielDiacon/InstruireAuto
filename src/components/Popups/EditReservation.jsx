// src/components/Popups/ReservationEditPopup.jsx
import React, {
   useEffect,
   useMemo,
   useState,
   useCallback,
   useRef,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ro from "date-fns/locale/ro";
import { ReactSVG } from "react-svg";

import successIcon from "../../assets/svg/success.svg";
import cancelIcon from "../../assets/svg/cancel.svg";
import clockIcon from "../../assets/svg/clock.svg";
import editIcon from "../../assets/svg/edit.svg";
import favIcon from "../../assets/svg/material-symbols--star-outline-rounded.svg";
import importantIcon from "../../assets/svg/zondicons--exclamation-outline.svg";
import copyIcon from "../../assets/svg/copy.svg";

import { fetchStudents } from "../../store/studentsSlice";
import { fetchInstructors } from "../../store/instructorsSlice";
import {
   updateReservation,
   removeReservation,
   fetchReservationsDelta,
} from "../../store/reservationsSlice";
import {
   createReservationsForUser,
   getReservationHistory,
} from "../../api/reservationsService";

import { triggerCalendarRefresh } from "../Utils/calendarBus";
import {
   closePopup as closePopupStore,
   closeSubPopup as closeSubPopupStore,
} from "../Utils/popupStore";

import AlertPills from "../Utils/AlertPills";

/* ===== Locale RO ===== */
registerLocale("ro", ro);

/* ================== TZ & chei locale (Moldova) ================== */
const MOLDOVA_TZ = "Europe/Chisinau";
const BUSY_KEYS_MODE = "local-match";

function localDateStrTZ(date, tz = MOLDOVA_TZ) {
   const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
   });
   const parts = fmt.formatToParts(date);
   const day = parts.find((p) => p.type === "day")?.value ?? "01";
   const month = parts.find((p) => p.type === "month")?.value ?? "01";
   const year = parts.find((p) => p.type === "year")?.value ?? "1970";
   return `${year}-${month}-${day}`;
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
   `${localDateStrTZ(localDateObj, MOLDOVA_TZ)}|${hhmm}`;

function busyLocalKeyFromStored(st) {
   const d = new Date(st);
   if (BUSY_KEYS_MODE === "local-match") {
      const offMin = tzOffsetMinutesAt(d.getTime(), MOLDOVA_TZ);
      const base = new Date(d.getTime() - offMin * 60000);
      return localKeyFromTs(base.getTime(), MOLDOVA_TZ);
   }
   return localKeyFromTs(d.getTime(), MOLDOVA_TZ);
}

const nowHHMMInMoldova = () =>
   new Intl.DateTimeFormat("en-GB", {
      timeZone: MOLDOVA_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
   }).format(new Date());

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
   { eticheta: "19:30", oraStart: "19:30" },
];
const SLOT_MINUTES = 90;

const SECTOR_ORDER = ["Botanica", "Ciocana", "Buiucani"];
const GEARBOX_ORDER = ["Manual", "Automat"];

/* Culori */
const COLOR_TOKENS = [
   "--event-default",
   "--red",
   "--orange",
   "--yellow",
   "--green",
   "--blue",
   "--indigo",
   "--purple",
   "--pink",
   "--black-t",
];

const COLOR_LABEL = {
   "event-default": "Implicit",
   red: "Roșu",
   orange: "Portocaliu",
   yellow: "Galben",
   green: "Verde",
   blue: "Albastru",
   indigo: "Indigo",
   purple: "Mov",
   pink: "Roz",
   "black-t": "Negru",
};

const COLOR_HINTS = {
   "event-default": "Culoare implicită din calendar",
   yellow: "Loc Liber",
   green: "Achitată",
   red: "Grafic Închis",
   orange: "Achitare Card În Oficiu",
   indigo: "Lecție Stabilită De Instructor",
   pink: "Grafic Pentru Ciocana/Buiucani",
   blue: "Instructorul Care Activează Pe Ciocana",
   purple: "Instructorul Care Activează Pe Botanica",
   "black-t": "Trasparent",
};

const normalizeColor = (val) => {
   if (!val) return "";
   if (typeof val !== "string") return String(val);
   const key = val.replace(/^--/, "").trim().toLowerCase();
   return COLOR_LABEL[key] || key;
};

const fmtDateTimeRO = (iso) =>
   new Date(iso).toLocaleString("ro-RO", {
      dateStyle: "medium",
      timeStyle: "short",
   });

const localDateStr = (d) => localDateStrTZ(d, MOLDOVA_TZ);

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

const localDateObjFromStr = (s) => {
   const [y, m, d] = s.split("-").map(Number);
   return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
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

const buildFullGridISO = (daysWindow = 60) => {
   const daysArr = nextNDays(daysWindow, new Date());
   const out = [];
   for (const dayStr of daysArr) {
      const dObj = localDateObjFromStr(dayStr);
      for (const t of oreDisponibile) {
         out.push(toUtcIsoFromMoldova(dObj, t.oraStart));
      }
   }
   return out;
};

const hasInstructorConflict = (
   reservations,
   instructorId,
   isoStart,
   excludeReservationId
) => {
   if (!instructorId || !isoStart) return false;
   const key = localKeyForIso(isoStart);
   return (reservations || [])
      .filter((r) => String(r.id) !== String(excludeReservationId))
      .filter((r) => String(r?.instructorId ?? "") === String(instructorId))
      .some((r) => {
         const st = getStartFromReservation(r);
         if (!st) return false;
         const rKey = busyLocalKeyFromStored(st);
         return rKey === key;
      });
};

const hasStudentConflict = (
   reservations,
   studentId,
   isoStart,
   excludeReservationId
) => {
   if (!studentId || !isoStart) return false;
   const key = localKeyForIso(isoStart);
   return (reservations || [])
      .filter((r) => String(r.id) !== String(excludeReservationId))
      .filter(
         (r) => String(r?.userId ?? r?.studentId ?? "") === String(studentId)
      )
      .some((r) => {
         const st = getStartFromReservation(r);
         if (!st) return false;
         const rKey = busyLocalKeyFromStored(st);
         return rKey === key;
      });
};

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

/* ===== Pretty labels + istoric ===== */
const FIELD_LABEL = {
   startTime: "Data & ora",
   sector: "Sector",
   gearbox: "Cutie",
   color: "Culoare",
   userId: "Elev",
   instructorId: "Instructor",
   privateMessage: "Notiță",
   isConfirmed: "Confirmare",
   carId: "Mașină",
   instructorsGroupId: "Grup instructori",
   isFavorite: "Favorit",
   isImportant: "Important",
   isCancelled: "Anulat",
};

const makeResolvers = (students, instructors, h) => {
   const stuById = new Map(
      (students || []).map((s) => [
         String(s.id),
         `${s.firstName || ""} ${s.lastName || ""}`.trim(),
      ])
   );
   const insById = new Map(
      (instructors || []).map((i) => [
         String(i.id),
         `${i.firstName || ""} ${i.lastName || ""}`.trim(),
      ])
   );
   if (h?.user?.id) {
      stuById.set(
         String(h.user.id),
         `${h.user.firstName || ""} ${h.user.lastName || ""}`.trim()
      );
   }
   if (h?.instructor?.id) {
      insById.set(
         String(h.instructor.id),
         `${h.instructor.firstName || ""} ${h.instructor.lastName || ""}`.trim()
      );
   }
   const nameForUserId = (val) =>
      val == null ? "" : stuById.get(String(val)) || String(val);
   const nameForInstructorId = (val) =>
      val == null ? "" : insById.get(String(val)) || String(val);
   return { nameForUserId, nameForInstructorId };
};

const fmtValue = (field, value, resolvers) => {
   if (value == null || value === "") return "";
   if (field === "startTime") {
      const d = new Date(value);
      return isNaN(d.getTime())
         ? String(value)
         : d.toLocaleString("ro-RO", {
              dateStyle: "medium",
              timeStyle: "short",
           });
   }
   if (field === "gearbox") {
      const v = String(value).toLowerCase();
      return v === "automat" ? "Automat" : "Manual";
   }
   if (field === "color") return normalizeColor(value);
   if (field === "userId") {
      return resolvers?.nameForUserId
         ? resolvers.nameForUserId(value)
         : String(value);
   }
   if (field === "instructorId") {
      return resolvers?.nameForInstructorId
         ? resolvers.nameForInstructorId(value)
         : String(value);
   }
   if (typeof value === "boolean") return value ? "Da" : "Nu";
   return String(value);
};

const buildChangesFromHistoryItem = (h, resolvers) => {
   const action = String(h?.action || "").toUpperCase();
   if (action === "CREATE" || action === "CREATED") return [];
   if (h && h.changedFields && typeof h.changedFields === "object") {
      return Object.entries(h.changedFields)
         .map(([field, diff]) => {
            if (
               diff &&
               typeof diff === "object" &&
               ("from" in diff || "to" in diff)
            ) {
               const from = fmtValue(field, diff.from, resolvers);
               const to = fmtValue(field, diff.to, resolvers);
               if (from === to) return null;
               return { field, label: FIELD_LABEL[field] || field, from, to };
            }
            return null;
         })
         .filter(Boolean);
   }
   if (Array.isArray(h?.changes)) {
      return h.changes
         .map((c) => {
            const field = c.field || c.path || "(câmp)";
            const from = fmtValue(field, c.from, resolvers);
            const to = fmtValue(field, c.to ?? c.value, resolvers);
            if (from === to) return null;
            return { field, label: FIELD_LABEL[field] || field, from, to };
         })
         .filter(Boolean);
   }
   return [];
};

const statusFromHistory = (h) => {
   const s = String(h?.status || h?.action || h?.type || "").toUpperCase();
   if (s.includes("CANCEL")) return "cancelled";
   if (s.includes("COMPLETE")) return "completed";
   if (s.includes("CONFIRM")) return "confirmed";
   if (s === "CREATE" || s === "CREATED") return "created";
   if (s === "UPDATE" || s === "UPDATED" || s.includes("EDIT"))
      return "updated";
   return "pending";
};

const iconFor = (status) => {
   switch (status) {
      case "updated":
         return editIcon;
      case "created":
         return clockIcon;
      case "confirmed":
      case "completed":
         return successIcon;
      case "cancelled":
         return cancelIcon;
      default:
         return clockIcon;
   }
};

export default function ReservationEditPopup({ reservationId, onClose }) {
   const dispatch = useDispatch();
   const rootRef = useRef(null);

   const leftOnceRef = useRef(false);

   // ✅ FIX: guard anti-close dublu + armare click-away după open
   const closingRef = useRef(false);
   const openArmedRef = useRef(false);

   // ✅ pentru hydratare
   const didHydrate = useRef(false);

   // ✅ reset “one-shot” când se schimbă rezervarea (în caz de reuse fără unmount complet)
   useEffect(() => {
      closingRef.current = false;
      openArmedRef.current = false;
      didHydrate.current = false;
      leftOnceRef.current = false;
   }, [reservationId]);

   const joinReservation = useCallback(() => {
      const rid = String(reservationId ?? "").trim();
      if (!rid) return;
      const ws = typeof window !== "undefined" ? window.__reservationWS : null;
      ws?.joinReservation?.(rid);
   }, [reservationId]);

   const leaveReservation = useCallback(() => {
      if (leftOnceRef.current) return;
      leftOnceRef.current = true;

      const rid = String(reservationId ?? "").trim();
      if (!rid) return;
      const ws = typeof window !== "undefined" ? window.__reservationWS : null;
      ws?.leaveReservation?.(rid);
   }, [reservationId]);

   // ✅ intri în edit => JOIN; ieși/unmount => LEAVE (garantat)
   useEffect(() => {
      leftOnceRef.current = false;
      joinReservation();
      return () => {
         leaveReservation();
      };
   }, [joinReservation, leaveReservation]);

   const closeSelf = useCallback(() => {
      if (closingRef.current) return; // ✅ nu mai închide de 2 ori
      closingRef.current = true;

      leaveReservation(); // ✅ instant + broadcast + redraw

      if (typeof onClose === "function") return onClose();

      try {
         closeSubPopupStore();
      } catch {}
      try {
         closePopupStore();
      } catch {}
   }, [onClose, leaveReservation]);

   // ✅ FIX: click-away armat după 2 frame-uri, ca să nu prindă click-ul care a deschis popup-ul
   useEffect(() => {
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

         if (isInside(e)) return; // click în interior -> nu închidem
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

   const [alerts, setAlerts] = useState([]);
   const pushAlert = (type, text) =>
      setAlerts((prev) => [...prev, { id: Date.now(), type, text }]);
   const popAlert = () => setAlerts((prev) => prev.slice(0, -1));

   const copyToClipboard = (value, label = "Text copiat în clipboard") => {
      if (!value) return;
      try {
         if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value);
         } else {
            const textarea = document.createElement("textarea");
            textarea.value = value;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
         }

         setAlerts((prev) => [
            ...prev,
            { id: Date.now(), type: "success", text: label },
         ]);
      } catch (e) {
         setAlerts((prev) => [
            ...prev,
            {
               id: Date.now(),
               type: "error",
               text: "Nu am putut copia în clipboard.",
            },
         ]);
      }
   };

   const reservations = useSelector((s) => s.reservations?.list || []);
   const studentsAll = useSelector((s) => s.students?.list || []);
   const instructors = useSelector((s) => s.instructors?.list || []);

   useEffect(() => {
      if (!reservations?.length) dispatch(fetchReservationsDelta());
      if (!studentsAll?.length) dispatch(fetchStudents());
      if (!instructors?.length) dispatch(fetchInstructors());
   }, [dispatch]); // eslint-disable-line

   const existing = useMemo(
      () => reservations.find((r) => String(r.id) === String(reservationId)),
      [reservations, reservationId]
   );

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

   const students = useMemo(
      () => (studentsAll || []).filter(hasUserRole),
      [studentsAll]
   );

   const [selectedDate, setSelectedDate] = useState(() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
   });
   const [selectedTime, setSelectedTime] = useState(null);

   const [sector, setSector] = useState("Botanica");
   const [gearbox, setGearbox] = useState("Manual");

   const [studentId, setStudentId] = useState("");
   const [instructorId, setInstructorId] = useState("");

   const [privateMessage, setPrivateMessage] = useState("");
   const [colorToken, setColorToken] = useState("--blue");

   const [isFavorite, setIsFavorite] = useState(false);
   const [isImportant, setIsImportant] = useState(false);
   const [isCancelled, setIsCanceled] = useState(false);

   const [colorHoverText, setColorHoverText] = useState("");
   const colorHoverTimerRef = useRef(null);
   useEffect(() => {
      return () => {
         if (colorHoverTimerRef.current)
            clearTimeout(colorHoverTimerRef.current);
      };
   }, []);

   useEffect(() => {
      if (!existing || didHydrate.current) return;

      const lk = existing.startTime
         ? busyLocalKeyFromStored(existing.startTime)
         : localKeyFromTs(Date.now(), MOLDOVA_TZ);

      const [dayStr, hhmm] = lk.split("|");
      setSelectedDate(localDateObjFromStr(dayStr));
      setSelectedTime(oreDisponibile.find((o) => o.oraStart === hhmm) || null);
      setSector(existing.sector || "Botanica");
      setGearbox(
         (existing.gearbox || "Manual").toLowerCase() === "automat"
            ? "Automat"
            : "Manual"
      );

      setStudentId(
         existing?.userId || existing?.studentId
            ? String(existing.userId || existing.studentId)
            : ""
      );
      setInstructorId(
         existing?.instructorId ? String(existing.instructorId) : ""
      );

      setPrivateMessage(existing?.privateMessage || "");

      if (
         typeof existing?.color === "string" &&
         existing.color.startsWith("--")
      ) {
         setColorToken(existing.color);
      } else {
         setColorToken("--blue");
      }

      setIsFavorite(!!existing?.isFavorite);
      setIsImportant(!!existing?.isImportant);
      setIsCanceled(!!existing?.isCancelled);

      didHydrate.current = true;
   }, [existing]);

   const originalStudentId = useMemo(
      () =>
         existing?.userId || existing?.studentId
            ? String(existing.userId || existing.studentId)
            : "",
      [existing]
   );
   const originalInstructorId = useMemo(
      () => (existing?.instructorId ? String(existing.instructorId) : ""),
      [existing]
   );

   const [view, setView] = useState("form"); // "form" | "studentSearch" | "instructorSearch" | "history"
   const [qStudent, setQStudent] = useState("");
   const [qInstructor, setQInstructor] = useState("");

   const filteredStudents = useMemo(() => {
      const q = (qStudent || "").trim().toLowerCase();
      if (!q) return students;
      return (students || []).filter((s) => {
         const full = `${s.firstName || ""} ${s.lastName || ""}`.toLowerCase();
         const phone = (s.phone || "").toLowerCase();
         const email = (s.email || "").toLowerCase();
         return full.includes(q) || phone.includes(q) || email.includes(q);
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

   const [freeSlots, setFreeSlots] = useState([]);
   const freeLocalKeySet = useMemo(
      () => new Set(freeSlots.map((iso) => localKeyForIso(iso))),
      [freeSlots]
   );

   const recomputeAvailability = useCallback(() => {
      if (!studentId || !instructorId) {
         setFreeSlots([]);
         return;
      }

      const fullGrid = buildFullGridISO(60);
      const others = (reservations || []).filter(
         (r) => String(r.id) !== String(reservationId)
      );

      const busyStudent = new Set();
      const busyInstructor = new Set();

      for (const r of others) {
         const st = getStartFromReservation(r);
         if (!st) continue;
         const key = busyLocalKeyFromStored(st);

         if (String(r?.userId ?? r?.studentId ?? "") === String(studentId)) {
            busyStudent.add(key);
         }
         if (String(r?.instructorId ?? "") === String(instructorId)) {
            busyInstructor.add(key);
         }
      }

      const free = fullGrid.filter((iso) => {
         const key = localKeyForIso(iso);
         return !busyStudent.has(key) && !busyInstructor.has(key);
      });

      setFreeSlots(free);
   }, [studentId, instructorId, reservations, reservationId]);

   useEffect(() => {
      recomputeAvailability();
   }, [recomputeAvailability]);

   const freeByDay = useMemo(() => {
      const map = new Map();
      for (const iso of freeSlots) {
         const key = localKeyForIso(iso);
         const day = key.split("|")[0];
         map.set(day, (map.get(day) || 0) + 1);
      }
      return map;
   }, [freeSlots]);

   const selectedStudent = useMemo(
      () =>
         studentId
            ? (students || []).find((u) => String(u.id) === String(studentId))
            : null,
      [students, studentId]
   );
   const selectedInstructor = useMemo(
      () =>
         instructorId
            ? (instructors || []).find(
                 (i) => String(i.id) === String(instructorId)
              )
            : null,
      [instructors, instructorId]
   );

   const studentDisplay = selectedStudent
      ? `${selectedStudent.firstName || ""} ${
           selectedStudent.lastName || ""
        }`.trim()
      : "(neales)";
   const studentPhone =
      selectedStudent?.phone ||
      selectedStudent?.phoneNumber ||
      selectedStudent?.mobile ||
      selectedStudent?.telefon ||
      "";
   const instructorDisplay = selectedInstructor
      ? `${selectedInstructor.firstName || ""} ${
           selectedInstructor.lastName || ""
        }`.trim()
      : "(neales)";
   const instructorPhone = selectedInstructor?.phone || "";

   const handleSectorToggle = useCallback(() => {
      setSector((prev) => {
         const current = String(prev || "").trim();
         const idx = SECTOR_ORDER.indexOf(current);
         if (idx === -1) return SECTOR_ORDER[0];
         return SECTOR_ORDER[(idx + 1) % SECTOR_ORDER.length];
      });
   }, []);

   const handleGearboxToggle = useCallback(() => {
      setGearbox((prev) => {
         const current = String(prev || "").toLowerCase();
         if (current === "automat") return "Manual";
         return "Automat";
      });
   }, []);

   const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
   const AFTER_DELETE_DELAY_MS = 800;

   const onDelete = async () => {
      if (!existing) return;
      const ok = window.confirm("Ștergi această rezervare?");
      if (!ok) return;

      closeSelf();

      try {
         await (dispatch(removeReservation(existing.id)).unwrap?.() ??
            dispatch(removeReservation(existing.id)));
      } catch (e) {}
   };

   const onSave = async () => {
      if (!instructorId) return pushAlert("error", "Selectează instructorul.");
      if (!studentId) return pushAlert("error", "Selectează elevul.");

      const currentKey = existing?.startTime
         ? busyLocalKeyFromStored(existing.startTime)
         : null;
      const selectedKey =
         selectedDate && selectedTime
            ? localKeyForDateAndTime(selectedDate, selectedTime.oraStart)
            : null;

      const selectedIsoUTC =
         selectedDate && selectedTime
            ? toUtcIsoFromMoldova(selectedDate, selectedTime.oraStart)
            : null;

      const selectedIsoForBackend =
         selectedIsoUTC && BUSY_KEYS_MODE === "local-match"
            ? isoForDbMatchLocalHour(selectedIsoUTC)
            : selectedIsoUTC;

      const changingTime = !!selectedKey && selectedKey !== currentKey;
      const changingStudent = String(studentId) !== String(originalStudentId);
      const changingInstructor =
         String(instructorId) !== String(originalInstructorId);

      if (changingTime && !selectedIsoUTC) {
         return pushAlert(
            "error",
            "Selectează data și ora pentru a modifica programarea."
         );
      }

      const effectiveIsoForChecks =
         selectedIsoUTC ||
         (existing?.startTime
            ? new Date(existing.startTime).toISOString()
            : null);

      if (changingTime) {
         const conflictI = hasInstructorConflict(
            reservations,
            instructorId,
            effectiveIsoForChecks,
            existing.id
         );
         const conflictS = hasStudentConflict(
            reservations,
            studentId,
            effectiveIsoForChecks,
            existing.id
         );
         if (conflictI || conflictS) {
            return pushAlert(
               "error",
               "Slot indisponibil (aceeași oră locală pentru elev sau instructor)."
            );
         }
      } else if (changingInstructor) {
         const conflictI = hasInstructorConflict(
            reservations,
            instructorId,
            effectiveIsoForChecks,
            existing.id
         );
         if (conflictI) {
            return pushAlert(
               "error",
               "Instructorul ales are deja o rezervare la această oră."
            );
         }
      }

      if (changingStudent) {
         const effectiveIsoToSend = changingTime
            ? selectedIsoForBackend
            : existing?.startTime;

         const forUserPayload = {
            userId: Number(studentId),
            instructorId: Number(instructorId) || undefined,
            instructorsGroupId:
               existing?.instructorsGroupId ?? existing?.groupId ?? undefined,
            reservations: [
               {
                  startTime: effectiveIsoToSend,
                  sector,
                  gearbox,
                  privateMessage,
                  color: colorToken,
                  isFavorite,
                  isImportant,
                  isCancelled,
               },
            ],
         };

         closeSelf();

         try {
            await (dispatch(removeReservation(existing.id)).unwrap?.() ??
               dispatch(removeReservation(existing.id)));
            await sleep(AFTER_DELETE_DELAY_MS);
            await createReservationsForUser(forUserPayload);
         } catch (e) {
            setAlerts((prev) => [
               ...prev,
               {
                  id: Date.now(),
                  type: "error",
                  text: "Nu am putut reprograma elevul.",
               },
            ]);
         }
         return;
      }

      const payload = {
         sector,
         gearbox,
         instructorId: Number(instructorId),
         userId: Number(originalStudentId),
         instructorsGroupId: null,
         privateMessage,
         color: colorToken,
         isFavorite,
         isImportant,
         isCancelled,
         ...(changingTime
            ? {
                 startTime:
                    BUSY_KEYS_MODE === "local-match"
                       ? selectedIsoForBackend
                       : selectedIsoUTC,
              }
            : {}),
      };

      // ✅ Trimitem focus-reservation mereu după Save
      const focusPayload = {
         type: "focus-reservation",
         reservationId: existing.id,
         newStartTime: changingTime
            ? selectedIsoForBackend
            : existing?.startTime
            ? String(existing.startTime)
            : null,
         forceReload: false,
      };

      closeSelf();

      try {
         await (dispatch(
            updateReservation({ id: existing.id, data: payload })
         ).unwrap?.() ??
            dispatch(updateReservation({ id: existing.id, data: payload })));

         triggerCalendarRefresh(focusPayload);
      } catch (e) {}
   };

   const [historyLoading, setHistoryLoading] = useState(false);
   const [historyError, setHistoryError] = useState("");
   const [historyItems, setHistoryItems] = useState(null);

   const loadHistory = useCallback(async () => {
      if (!reservationId) return;
      setHistoryLoading(true);
      setHistoryError("");
      try {
         const data = await getReservationHistory(reservationId);
         const list = Array.isArray(data) ? data : data?.items || [];
         list.sort(
            (a, b) =>
               new Date(b.createdAt || b.timestamp || 0) -
               new Date(a.createdAt || a.timestamp || 0)
         );
         setHistoryItems(list);
      } catch (e) {
         setHistoryError(e?.message || "Nu am putut încărca istoricul.");
         setHistoryItems([]);
      } finally {
         setHistoryLoading(false);
      }
   }, [reservationId]);

   useEffect(() => {
      if (view === "history" && historyItems === null) {
         loadHistory();
      }
   }, [view, historyItems, loadHistory]);

   const formattedHistory = useMemo(() => {
      return (historyItems || []).map((h, idx) => {
         const when =
            h.timestamp ||
            h.date ||
            h.createdAt ||
            h.updatedAt ||
            existing?.startTime;

         const resolvers = makeResolvers(studentsAll, instructors, h);
         const changes = buildChangesFromHistoryItem(h, resolvers);
         const who = h.changedByUser
            ? `${h.changedByUser.firstName || ""} ${
                 h.changedByUser.lastName || ""
              }`.trim()
            : "";

         const status = statusFromHistory(h);
         const action = h.action || "";

         return {
            id: h.id || `${reservationId}-${idx}`,
            time: when ? fmtDateTimeRO(when) : "",
            status,
            by: who,
            changes,
            action,
         };
      });
   }, [historyItems, studentsAll, instructors, existing, reservationId]);

   if (!existing) {
      return (
         <>
            <div className="popup-panel__header">
               <h3 className="popup-panel__title">Editează rezervarea</h3>
            </div>
            <div className="popupui popupui__content">
               <div className="popupui__disclaimer">Se încarcă datele...</div>
            </div>
         </>
      );
   }

   const existingDayKey = existing?.startTime
      ? busyLocalKeyFromStored(existing.startTime).split("|")[0]
      : null;

   const filterDate = (date) => {
      const key = localDateStr(date);
      if (existingDayKey && key === existingDayKey) return true;
      return true;
   };

   const renderHistoryList = () => (
      <div className="popupui__history">
         <div className="popupui__history-header">
            <button
               className="popupui__btn popupui__btn--normal"
               onClick={() => setView("form")}
            >
               Înapoi
            </button>
            <button
               className="popupui__btn popupui__btn--normal"
               onClick={loadHistory}
               disabled={historyLoading}
               title="Reîncarcă istoricul"
            >
               {historyLoading ? "Se încarcă…" : "Reîncarcă"}
            </button>
         </div>

         <div className="popupui__history-grid-wrapper">
            <div className="popupui__history-grid">
               {historyError ? (
                  <div className="popupui__history-placeholder">
                     {historyError}
                  </div>
               ) : historyLoading ? (
                  <div className="popupui__history-placeholder">
                     Se încarcă istoricul…
                  </div>
               ) : (formattedHistory || []).length === 0 ? (
                  <div className="popupui__history-placeholder">
                     Nu există modificări pentru această rezervare.
                  </div>
               ) : (
                  formattedHistory.map((entry, index) => {
                     const isCreate = String(entry.action || "")
                        .toUpperCase()
                        .startsWith("CREATE");

                     return (
                        <div
                           key={entry.id + "-" + index}
                           className={`popupui__history-item popupui__history-item--${entry.status}`}
                        >
                           <div className="popupui__history-item-left">
                              <span className="popupui__history-time">
                                 {entry.time}
                              </span>

                              <div className="popupui__history-changes">
                                 {entry.by ? (
                                    <div className="popupui__history-line popupui__history-line--who">
                                       {isCreate ? "Creată de" : "Modificat de"}{" "}
                                       <b>{entry.by}</b>.
                                    </div>
                                 ) : null}

                                 {isCreate ? (
                                    <div className="popupui__history-line">
                                       Rezervare creată.
                                    </div>
                                 ) : entry.changes?.length ? (
                                    entry.changes.map((c, i) => (
                                       <div
                                          key={i}
                                          className="popupui__history-line"
                                       >
                                          <p>
                                             <b>{c.label}:</b>&nbsp;
                                          </p>
                                          {c.from ? <i>{c.from}</i> : null}
                                          {c.from ? " → " : null}
                                          <i>{c.to}</i>
                                       </div>
                                    ))
                                 ) : null}
                              </div>
                           </div>

                           <div className="popupui__history-item-right">
                              <ReactSVG
                                 className={`popupui__history-icon ${entry.status}`}
                                 src={iconFor(entry.status)}
                              />
                           </div>
                        </div>
                     );
                  })
               )}
            </div>
         </div>
      </div>
   );

   const renderStudentSearch = () => (
      <>
         <div className="popupui__search-header">
            <input
               type="text"
               className="popupui__search-input"
               placeholder="Caută elev"
               value={qStudent}
               onChange={(e) => setQStudent(e.target.value)}
            />
            <button
               className="popupui__btn popupui__btn--normal"
               onClick={() => setView("form")}
            >
               Înapoi
            </button>
         </div>

         <div className="popupui__search-list-wrapper">
            <ul className="popupui__search-list">
               {filteredStudents.map((s) => {
                  const full = `${s.firstName || ""} ${
                     s.lastName || ""
                  }`.trim();
                  const phone = s.phone || "";
                  const email = s.email || "";
                  return (
                     <li
                        key={s.id}
                        className="popupui__search-item"
                        onClick={() => {
                           setStudentId(String(s.id));
                           setView("form");
                           setTimeout(() => recomputeAvailability(), 0);
                        }}
                     >
                        <div className="popupui__search-item-left">
                           <h3>{highlightText(full, qStudent)}</h3>
                           {phone && <p>{highlightText(phone, qStudent)}</p>}
                           {email && <p>{highlightText(email, qStudent)}</p>}
                        </div>
                     </li>
                  );
               })}
            </ul>
         </div>
      </>
   );

   const renderInstructorSearch = () => (
      <>
         <div className="popupui__search-header">
            <input
               type="text"
               className="popupui__search-input"
               placeholder="Caută instructor "
               value={qInstructor}
               onChange={(e) => setQInstructor(e.target.value)}
            />
            <button
               className="popupui__btn popupui__btn--normal"
               onClick={() => setView("form")}
            >
               Înapoi
            </button>
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
                           setInstructorId(String(i.id));
                           setView("form");
                           setTimeout(() => recomputeAvailability(), 0);
                        }}
                     >
                        <div className="popupui__search-item-left">
                           <h3>{highlightText(full, qInstructor)}</h3>
                           {phone && <p>{highlightText(phone, qInstructor)}</p>}
                        </div>
                     </li>
                  );
               })}
            </ul>
         </div>
      </>
   );

   const renderForm = () => {
      const nowDayLocal = localDateStrTZ(new Date(), MOLDOVA_TZ);
      const nowHHMM = nowHHMMInMoldova();
      const currentKey = existing?.startTime
         ? busyLocalKeyFromStored(existing.startTime)
         : null;
      const currentDayKey = currentKey ? currentKey.split("|")[0] : null;

      return (
         <>
            <div className="popupui__selector">
               <div className="popupui__field popupui__field--calendar">
                  <h3 className="popupui__field-label">Selectează data:</h3>
                  <DatePicker
                     selected={selectedDate}
                     onChange={(d) => {
                        setSelectedDate(d);
                        setSelectedTime(null);
                     }}
                     inline
                     locale="ro"
                     openToDate={
                        selectedDate ||
                        (existing?.startTime
                           ? new Date(existing.startTime)
                           : undefined)
                     }
                     formatWeekDay={(name) =>
                        name
                           .substring(0, 2)
                           .replace(/^./, (c) => c.toUpperCase())
                     }
                     filterDate={filterDate}
                     dayClassName={(date) => {
                        const key = localDateStr(date);
                        return freeByDay.has(key) || key === currentDayKey
                           ? ""
                           : "popupui__day--inactive";
                     }}
                     calendarClassName="popupui__datepicker"
                  />
               </div>

               <div className="popupui__field popupui__field--times">
                  <h3 className="popupui__field-label">Selectează ora:</h3>
                  <div className="popupui__times-list">
                     {!selectedDate && (
                        <div className="popupui__disclaimer">
                           Te rog să selectezi mai întâi o zi!
                        </div>
                     )}

                     {oreDisponibile.map((ora) => {
                        const key =
                           selectedDate && ora?.oraStart
                              ? localKeyForDateAndTime(
                                   selectedDate,
                                   ora.oraStart
                                )
                              : null;

                        const isSelected =
                           selectedTime?.oraStart === ora.oraStart;

                        const isTodayLocal =
                           selectedDate &&
                           localDateStr(selectedDate) === nowDayLocal;
                        const pastToday =
                           isTodayLocal && ora.oraStart <= nowHHMM;

                        const isExistingSlot = currentKey && key === currentKey;
                        const studentUnchanged =
                           String(studentId) === String(originalStudentId);

                        const available =
                           (isExistingSlot && studentUnchanged) ||
                           (key ? freeLocalKeySet.has(key) : false);

                        const disabled =
                           !selectedDate || !available || pastToday;

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
                                 disabled ? "popupui__time-btn--disabled" : "",
                                 ora.eticheta === "19:30"
                                    ? "popupui__time-btn--wide"
                                    : "",
                              ]
                                 .filter(Boolean)
                                 .join(" ")}
                              title={
                                 !selectedDate
                                    ? "Alege o zi"
                                    : isExistingSlot && !studentUnchanged
                                    ? "Schimbi elevul: slotul actual trebuie să fie liber pentru elevul nou"
                                    : !available
                                    ? "Indisponibil (există altă rezervare la această oră)"
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

            <div className="popupui__form-row popupui__form-row--spaced">
               <div className="popupui__field popupui__field--clickable">
                  <span className="popupui__field-label">Elev</span>
                  <div
                     className="popupui__field-line"
                     onClick={() => setView("studentSearch")}
                  >
                     <span className="popupui__field-text">
                        {studentDisplay !== "(neales)"
                           ? studentDisplay
                           : "Alege elev"}
                     </span>
                     {selectedStudent && studentDisplay && (
                        <button
                           type="button"
                           className="popupui__icon-btn popupui__icon-btn--copy"
                           onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(
                                 studentDisplay,
                                 "Numele elevului a fost copiat."
                              );
                           }}
                           title="Copiază numele elevului"
                        >
                           <ReactSVG className="popupui__icon" src={copyIcon} />
                        </button>
                     )}
                  </div>

                  <div
                     className="popupui__field-line"
                     onClick={() => setView("studentSearch")}
                  >
                     <span className="popupui__field-text">
                        {studentPhone || "Telefon elev"}
                     </span>
                     {selectedStudent && studentPhone && (
                        <button
                           type="button"
                           className="popupui__icon-btn popupui__icon-btn--copy"
                           onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(
                                 studentPhone,
                                 "Telefonul elevului a fost copiat."
                              );
                           }}
                           title="Copiază numărul de telefon"
                        >
                           <ReactSVG className="popupui__icon" src={copyIcon} />
                        </button>
                     )}
                  </div>
               </div>

               <div className="popupui__field popupui__field--clickable">
                  <span className="popupui__field-label">Instructor</span>
                  <div
                     className="popupui__field-line"
                     onClick={() => setView("instructorSearch")}
                  >
                     <span className="popupui__field-text">
                        {instructorDisplay !== "(neales)"
                           ? instructorDisplay
                           : "Alege instructor"}
                     </span>
                  </div>
                  <div
                     className="popupui__field-line"
                     onClick={() => setView("instructorSearch")}
                  >
                     <span className="popupui__field-text">
                        {instructorPhone || "Telefon instructor"}
                     </span>
                  </div>
               </div>
            </div>

            <div className="popupui__form-row popupui__form-row--compact">
               <div className="popupui__field popupui__field--clickable popupui__field--grow-1">
                  <span className="popupui__field-label">Sector</span>
                  <div
                     className="popupui__field-line"
                     onClick={handleSectorToggle}
                  >
                     <span className="popupui__field-text">
                        {sector || "Alege sector"}
                     </span>
                  </div>
               </div>

               <div className="popupui__field popupui__field--clickable popupui__field--grow-1">
                  <span className="popupui__field-label">Cutie</span>
                  <div
                     className="popupui__field-line"
                     onClick={handleGearboxToggle}
                  >
                     <span className="popupui__field-text">
                        {gearbox
                           ? gearbox.toLowerCase() === "automat"
                              ? "Automat"
                              : "Manual"
                           : "Alege cutie"}
                     </span>
                  </div>
               </div>
            </div>

            <div className="popupui__form-row popupui__form-row--gap">
               <div className="popupui__field ">
                  <span className="popupui__field-label">Notiță</span>
                  <textarea
                     className="popupui__textarea"
                     rows={2}
                     placeholder="Notiță..."
                     value={privateMessage}
                     style={{ width: "auto", height: "auto" }}
                     onChange={(e) => setPrivateMessage(e.target.value)}
                  />
               </div>

               <div className="popupui__field ">
                  <span className="popupui__field-label">Tichete</span>
                  <div className="popupui__flag-grid">
                     <button
                        type="button"
                        className={[
                           "popupui__btn",
                           "popupui__btn--flag",
                           isFavorite ? "popupui__btn--active" : "",
                        ]
                           .filter(Boolean)
                           .join(" ")}
                        onClick={() => setIsFavorite((v) => !v)}
                        title={
                           isFavorite
                              ? "Scoate din favorite"
                              : "Marchează ca favorit"
                        }
                     >
                        <ReactSVG
                           className="reservation-flag-icon react-icon"
                           src={favIcon}
                        />
                     </button>

                     <button
                        type="button"
                        className={[
                           "popupui__btn",
                           "popupui__btn--flag",
                           isImportant ? "popupui__btn--active" : "",
                        ]
                           .filter(Boolean)
                           .join(" ")}
                        onClick={() => setIsImportant((v) => !v)}
                        title={
                           isImportant
                              ? "Scoate marcajul de important"
                              : "Marchează ca important"
                        }
                     >
                        <ReactSVG
                           className="reservation-flag-icon react-icon"
                           src={importantIcon}
                        />
                     </button>

                     <button
                        type="button"
                        className={[
                           "popupui__btn",
                           "popupui__btn--flag",
                           isCancelled ? "popupui__btn--active" : "",
                        ]
                           .filter(Boolean)
                           .join(" ")}
                        onClick={() => setIsCanceled((v) => !v)}
                        title={
                           isCancelled
                              ? "Scoate marcajul de anulat"
                              : "Marchează rezervarea ca anulată"
                        }
                     >
                        <ReactSVG
                           className="reservation-flag-icon react-icon"
                           src={cancelIcon}
                        />
                     </button>
                  </div>
               </div>
            </div>

            <div className="popupui__field popupui__field--stacked">
               <span className="popupui__field-label">Culoare</span>

               <div
                  className="popupui__color-grid"
                  role="radiogroup"
                  aria-label="Culoare eveniment"
               >
                  {COLOR_TOKENS.map((token) => {
                     const suffix = token.replace(/^--/, "");
                     const active = colorToken === token;
                     const name = COLOR_LABEL[suffix] || suffix;
                     const tip = COLOR_HINTS[suffix]
                        ? `${COLOR_HINTS[suffix]}`
                        : name;
                     return (
                        <button
                           key={token}
                           type="button"
                           role="radio"
                           aria-checked={active}
                           aria-label={tip}
                           title={tip}
                           className={[
                              "popupui__color-swatch",
                              `popupui__color-swatch--${suffix}`,
                              active ? "is-active" : "",
                           ]
                              .filter(Boolean)
                              .join(" ")}
                           onClick={() => setColorToken(token)}
                           onFocus={() => setColorHoverText(tip)}
                           onBlur={() => setColorHoverText("")}
                           onTouchStart={() => {
                              setColorHoverText(tip);
                              if (colorHoverTimerRef.current)
                                 clearTimeout(colorHoverTimerRef.current);
                           }}
                        />
                     );
                  })}
               </div>
               {colorHoverText && (
                  <div className="popupui__color-hint">{colorHoverText}</div>
               )}
            </div>

            <div className="popupui__btns popupui__btns--bottom">
               <button
                  className="popupui__btn popupui__btn--edit"
                  onClick={() => setView("history")}
                  title="Vezi istoricul modificărilor"
               >
                  Istoric
               </button>

               <div className="popupui__btns-spacer" />

               <button
                  className="popupui__btn popupui__btn--delete popupui__btn--delete"
                  onClick={onDelete}
               >
                  Șterge
               </button>
               <button
                  className="popupui__btn popupui__btn--save"
                  onClick={onSave}
               >
                  Salvează
               </button>
            </div>
         </>
      );
   };

   return (
      <div ref={rootRef} style={{ display: "contents" }}>
         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Editează rezervarea</h3>
         </div>

         <div className="popupui popupui__content">
            {view === "history"
               ? renderHistoryList()
               : view === "studentSearch"
               ? renderStudentSearch()
               : view === "instructorSearch"
               ? renderInstructorSearch()
               : renderForm()}
         </div>

         <AlertPills messages={alerts} onDismiss={popAlert} />
      </div>
   );
}
