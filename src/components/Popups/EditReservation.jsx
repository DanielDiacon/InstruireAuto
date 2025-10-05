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

import { fetchStudents } from "../../store/studentsSlice";
import { fetchInstructors } from "../../store/instructorsSlice";
import {
   updateReservation,
   removeReservation,
   fetchAllReservations,
} from "../../store/reservationsSlice";
import {
   createReservations, // rămâne pentru alte fluxuri
   createReservationsForUser, // 👈 nou — îl folosim când schimbi elevul
   getReservationHistory,
} from "../../api/reservationsService";

import { closePopup as closePopupStore } from "../Utils/popupStore";
import AlertPills from "../Utils/AlertPills";

/* ===== Locale RO ===== */
registerLocale("ro", ro);

/* ===== Intervale ore (24h) ===== */
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

/* ===== Culori ===== */
const COLOR_TOKENS = [
   "--red",
   "--orange",
   "--yellow",
   "--green",
   "--blue",
   "--indigo",
   "--purple",
   "--pink",
];
const COLOR_LABEL = {
   red: "Roșu",
   orange: "Portocaliu",
   yellow: "Galben",
   green: "Verde",
   blue: "Albastru",
   indigo: "Indigo",
   purple: "Mov",
   pink: "Roz",
};
/* — etichete semnificație pentru tooltip / mobil — */
const COLOR_HINTS = {
  yellow: "Loc Liber",
  green: "Achitată",
  red: "Grafic Închis",
  orange: "Achitare Card În Oficiu",
  indigo: "Lecție Stabilită De Instructor",
  pink: "Grafic Pentru Ciocana/Buiucani",
  blue: "Instructorul Care Activează Pe Ciocana",
  purple: "Instructorul Care Activează Pe Botanica",
};

const normalizeColor = (val) => {
   if (!val) return "";
   if (typeof val !== "string") return String(val);
   const key = val.replace(/^--/, "").trim().toLowerCase();
   return COLOR_LABEL[key] || key;
};

/* ===== Helpers ===== */
const SLOT_MINUTES = 90;
const fmtDateTimeRO = (iso) =>
   new Date(iso).toLocaleString("ro-RO", {
      dateStyle: "medium",
      timeStyle: "short",
   });

const localDateStr = (d) =>
   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
   ).padStart(2, "0")}`;
const todayAt00 = () => {
   const t = new Date();
   t.setHours(0, 0, 0, 0);
   return t;
};
/** ISO UTC din data LOCALĂ + HH:mm */
const toUtcIsoFromLocal = (localDateObj, timeStrHHMM) => {
   const [hh, mm] = timeStrHHMM.split(":").map(Number);
   const d = new Date(localDateObj);
   d.setHours(hh, mm, 0, 0);
   return d.toISOString();
};
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
         out.push(toUtcIsoFromLocal(dObj, t.oraStart));
      }
   }
   return out;
};

/* === Conflicts helpers (exclud rezervarea curentă) === */
const hasInstructorConflict = (
   reservations,
   instructorId,
   isoStart,
   excludeReservationId
) => {
   if (!instructorId || !isoStart) return false;
   const start = new Date(isoStart);
   const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
   return (reservations || [])
      .filter((r) => String(r.id) !== String(excludeReservationId))
      .filter((r) => String(r?.instructorId ?? "") === String(instructorId))
      .some((r) => {
         const st = getStartFromReservation(r);
         const en = getEndFromReservation(r);
         if (!st || !en) return false;
         const s = new Date(st);
         const e = new Date(en);
         return start < e && end > s; // overlap
      });
};

const hasStudentConflict = (
   reservations,
   studentId,
   isoStart,
   excludeReservationId
) => {
   if (!studentId || !isoStart) return false;
   const start = new Date(isoStart);
   const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
   return (reservations || [])
      .filter((r) => String(r.id) !== String(excludeReservationId))
      .filter(
         (r) => String(r?.userId ?? r?.studentId ?? "") === String(studentId)
      )
      .some((r) => {
         const st = getStartFromReservation(r);
         const en = getEndFromReservation(r);
         if (!st || !en) return false;
         const s = new Date(st);
         const e = new Date(en);
         return start < e && end > s; // overlap
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

/* ===== Pretty labels + normalizare schimbări din istoric ===== */
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

   // fallback din payload-ul de istoric (dacă există)
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
   if (field === "color") {
      return normalizeColor(value);
   }
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
   // la CREATE nu afișăm detalii
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
               return {
                  field,
                  label: FIELD_LABEL[field] || field,
                  from,
                  to,
               };
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

/* ===== Mapare stări istorice ===== */
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

/* ===== Icon per status ===== */
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
         return clockIcon; // pending / necunoscut
   }
};

export default function ReservationEditPopup({ reservationId }) {
   const dispatch = useDispatch();

   // ===== Alert pills =====
   const [alerts, setAlerts] = useState([]);
   const pushAlert = (type, text) =>
      setAlerts((prev) => [...prev, { id: Date.now(), type, text }]);
   const popAlert = () => setAlerts((prev) => prev.slice(0, -1));

   // Store
   const reservations = useSelector((s) => s.reservations?.list || []);
   const studentsAll = useSelector((s) => s.students?.list || []);
   const instructors = useSelector((s) => s.instructors?.list || []);
   useEffect(() => {
      if (!reservations?.length) dispatch(fetchAllReservations());
      if (!studentsAll?.length) dispatch(fetchStudents());
      if (!instructors?.length) dispatch(fetchInstructors());
   }, [dispatch]); // eslint-disable-line

   const existing = useMemo(
      () => reservations.find((r) => String(r.id) === String(reservationId)),
      [reservations, reservationId]
   );

   // Elevi cu rol USER
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

   // --- hidratare UI din rezervarea existentă
   const didHydrate = useRef(false);

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

   // Notiță (privată) + Culoare token
   const [privateMessage, setPrivateMessage] = useState("");
   const [colorToken, setColorToken] = useState("--blue");

   /* ——— Tooltip mobil / focus accesibilitate ——— */
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
      const start = existing.startTime
         ? new Date(existing.startTime)
         : new Date();

      const day = new Date(start);
      day.setHours(0, 0, 0, 0);
      setSelectedDate(day);

      const hhmm = start.toTimeString().slice(0, 5);
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

   // ecran: formular vs căutări vs istoric
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

   // ===== Disponibilități =====
   const [freeSlots, setFreeSlots] = useState([]); // ISO[]
   const freeSet = useMemo(() => new Set(freeSlots), [freeSlots]);

   const recomputeAvailability = useCallback(() => {
      if (!studentId || !instructorId) {
         setFreeSlots([]);
         return;
      }

      const fullGrid = buildFullGridISO(60);
      const others = (reservations || []).filter(
         (r) => String(r.id) !== String(reservationId)
      );

      const studentIntervals = others
         .filter(
            (r) => String(r?.userId ?? r?.studentId ?? "") === String(studentId)
         )
         .map((r) => {
            const st = getStartFromReservation(r);
            const en = getEndFromReservation(r);
            return st && en ? [new Date(st), new Date(en)] : null;
         })
         .filter(Boolean);

      const instructorIntervals = others
         .filter((r) => String(r?.instructorId ?? "") === String(instructorId))
         .map((r) => {
            const st = getStartFromReservation(r);
            const en = getEndFromReservation(r);
            return st && en ? [new Date(st), new Date(en)] : null;
         })
         .filter(Boolean);

      const conflictsAny = (start, end) => {
         for (const [s, e] of studentIntervals)
            if (start < e && end > s) return true;
         for (const [s, e] of instructorIntervals)
            if (start < e && end > s) return true;
         return false;
      };

      const now = new Date();
      const free = fullGrid
         .filter((iso) => {
            const start = new Date(iso);
            const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
            return !conflictsAny(start, end);
         })
         .filter((iso) => new Date(iso) > now);

      setFreeSlots(free);
   }, [studentId, instructorId, reservations, reservationId]);

   useEffect(() => {
      recomputeAvailability();
   }, [recomputeAvailability]);

   const freeByDay = useMemo(() => {
      const map = new Map();
      for (const iso of freeSlots) {
         const key = localDateStr(new Date(iso));
         map.set(key, (map.get(key) || 0) + 1);
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

   // ===== utilitare mici =====
   const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
   const AFTER_DELETE_DELAY_MS = 800;

   // ===== Actions =====
   const onDelete = async () => {
      const ok = window.confirm("Ștergi această rezervare?");
      if (!ok) return;

      closePopupStore();
      setTimeout(() => {
         dispatch(removeReservation(existing.id))
            .then(() => dispatch(fetchAllReservations()))
            .catch(() => {});
      }, 0);
   };

   const onSave = async () => {
      if (!instructorId) return pushAlert("error", "Selectează instructorul.");
      if (!studentId) return pushAlert("error", "Selectează elevul.");

      const currentIso = existing?.startTime
         ? new Date(existing.startTime).toISOString()
         : null;

      const selectedIso =
         selectedDate && selectedTime
            ? toUtcIsoFromLocal(selectedDate, selectedTime.oraStart)
            : null;

      const changingTime = !!selectedIso && selectedIso !== currentIso;
      const changingStudent = String(studentId) !== String(originalStudentId);
      const changingInstructor =
         String(instructorId) !== String(originalInstructorId);

      const effectiveIso = selectedIso || currentIso;

      // nimic „logic” schimbat → doar metadate
      if (!changingTime && !changingStudent && !changingInstructor) {
         closePopupStore();
         setTimeout(() => {
            const payload = {
               sector,
               gearbox,
               privateMessage,
               color: colorToken,
            };
            dispatch(updateReservation({ id: existing.id, data: payload }))
               .then(() => dispatch(fetchAllReservations()))
               .catch(() => {});
         }, 0);
         return;
      }

      // nu permitem mutarea în trecut când modifici ora
      if (changingTime) {
         if (!selectedIso) {
            return pushAlert(
               "error",
               "Selectează data și ora pentru a modifica programarea."
            );
         }
         if (new Date(selectedIso) <= new Date()) {
            return pushAlert("error", "Nu poți muta programarea în trecut.");
         }
      }

      // validări de conflict
      if (changingTime) {
         const conflictI = hasInstructorConflict(
            reservations,
            instructorId,
            effectiveIso,
            existing.id
         );
         const conflictS = hasStudentConflict(
            reservations,
            studentId,
            effectiveIso,
            existing.id
         );
         if (conflictI || conflictS) {
            return pushAlert(
               "error",
               "Slot indisponibil (suprapunere pentru elev sau instructor)."
            );
         }
      } else {
         if (changingInstructor) {
            const conflictI = hasInstructorConflict(
               reservations,
               instructorId,
               effectiveIso,
               existing.id
            );
            if (conflictI)
               return pushAlert(
                  "error",
                  "Instructorul ales are deja o rezervare la această oră."
               );
         }
         if (changingStudent) {
            const conflictS = hasStudentConflict(
               reservations,
               studentId,
               effectiveIso,
               existing.id
            );
            if (conflictS)
               return pushAlert(
                  "error",
                  "Elevul ales are deja o rezervare la această oră."
               );
         }
      }

      // ==== SCHIMB elevul → DELETE vechi + CREATE la endpoint-ul NOU /reservations/for-user
      if (changingStudent) {
         // construim payload exact după schema endpoint-ului
         const forUserPayload = {
            userId: Number(studentId),
            instructorId: Number(instructorId) || undefined,
            // dacă ai grup pe rezervarea existentă, îl trimitem ca fallback
            instructorsGroupId:
               existing?.instructorsGroupId ?? existing?.groupId ?? undefined,
            reservations: [
               {
                  startTime: effectiveIso,
                  sector,
                  gearbox,
                  privateMessage,
                  color: colorToken,
               },
            ],
         };

         closePopupStore();

         try {
            // 1) șterg rezervarea veche
            await dispatch(removeReservation(existing.id));
            // 2) mic delay pentru a evita racing în listă
            await sleep(AFTER_DELETE_DELAY_MS);
            // 3) creez noua rezervare pentru user prin endpoint-ul nou
            await createReservationsForUser(forUserPayload);
            // 4) reîncărcare
            await dispatch(fetchAllReservations());
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

      // ==== restul cazurilor (elevul NU se schimbă): UPDATE standard pe rezervarea curentă
      const payload = {
         sector,
         gearbox,
         instructorId: Number(instructorId),
         userId: Number(originalStudentId), // elevul rămâne același
         instructorsGroupId: null,
         privateMessage,
         color: colorToken,
         ...(changingTime ? { startTime: effectiveIso } : {}),
      };

      closePopupStore();
      setTimeout(() => {
         dispatch(updateReservation({ id: existing.id, data: payload }))
            .then(() => dispatch(fetchAllReservations()))
            .catch(() => {});
      }, 0);
   };

   /* ========= Istoric (doar lista) ========== */
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
            changes, // [{field,label,from,to}]
            action,
         };
      });
   }, [historyItems, studentsAll, instructors, existing, reservationId]);

   /* =========================== RENDER =========================== */

   if (!existing) {
      return (
         <>
            <div className="popup-panel__header">
               <h3 className="popup-panel__title">Editează rezervarea</h3>
            </div>
            <div className="popup-panel__content">Se încarcă datele...</div>
         </>
      );
   }

   const existingDayKey = existing?.startTime
      ? localDateStr(new Date(existing.startTime))
      : null;

   const filterDate = (date) => {
      const key = localDateStr(date);
      if (existingDayKey && key === existingDayKey) return true;
      return date >= todayAt00();
   };

   const renderHistoryList = () => (
      <div className="history__grid-wrapper">
         <div style={{ display: "flex", gap: 8, marginBottom: -16 }}>
            <button
               className="instructors-popup__form-button"
               onClick={() => setView("form")}
            >
               Înapoi
            </button>
            <button
               className="instructors-popup__form-button"
               onClick={loadHistory}
               disabled={historyLoading}
               title="Reîncarcă istoricul"
            >
               {historyLoading ? "Se încarcă…" : "Reîncarcă"}
            </button>
         </div>

         <div className="history__grid">
            {historyError ? (
               <div className="saddprogramari__disclaimer">{historyError}</div>
            ) : historyLoading ? (
               <div className="saddprogramari__disclaimer">
                  Se încarcă istoricul…
               </div>
            ) : (formattedHistory || []).length === 0 ? (
               <div className="saddprogramari__disclaimer">
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
                        className={`history__item history__item--${entry.status}`}
                     >
                        <div className="history__item-left">
                           <span style={{ opacity: 0.8 }}>{entry.time}</span>
                           <div
                              className="reservation-history__changes"
                              style={{ marginTop: 6 }}
                           >
                              {entry.by ? (
                                 <div
                                    className="hist-line"
                                    style={{ marginBottom: 4, opacity: 0.9 }}
                                 >
                                    {isCreate ? "Creată de" : "Modificat de"}{" "}
                                    <b>{entry.by}</b>.
                                 </div>
                              ) : null}

                              {isCreate ? (
                                 <div className="hist-line">
                                    Rezervare creată.
                                 </div>
                              ) : entry.changes?.length ? (
                                 entry.changes.map((c, i) => (
                                    <div key={i} className="hist-line">
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

                        <div className="history__item-right">
                           <ReactSVG
                              className={`history__item-icon ${entry.status}`}
                              src={iconFor(entry.status)}
                           />
                        </div>
                     </div>
                  );
               })
            )}
         </div>
      </div>
   );

   const renderStudentSearch = () => (
      <>
         <div className="instructors-popup__search-wrapper ">
            <input
               type="text"
               className="instructors-popup__search"
               placeholder="Caută elev (doar rol USER)…"
               value={qStudent}
               onChange={(e) => setQStudent(e.target.value)}
            />
            <button
               className="instructors-popup__form-button instructors-popup__form-button--cancel"
               onClick={() => setView("form")}
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
                  const email = s.email || "";
                  return (
                     <li
                        key={s.id}
                        className="instructors-popup__item"
                        onClick={() => {
                           setStudentId(String(s.id));
                           setView("form");
                           setTimeout(() => recomputeAvailability(), 0);
                        }}
                     >
                        <div className="instructors-popup__item-left">
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
         <div className="instructors-popup__search-wrapper ">
            <input
               type="text"
               className="instructors-popup__search"
               placeholder="Caută instructor după nume sau telefon..."
               value={qInstructor}
               onChange={(e) => setQInstructor(e.target.value)}
            />
            <button
               className="instructors-popup__form-button instructors-popup__form-button--cancel"
               onClick={() => setView("form")}
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
                           setInstructorId(String(i.id));
                           setView("form");
                           setTimeout(() => recomputeAvailability(), 0);
                        }}
                     >
                        <div className="instructors-popup__item-left">
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

   const renderForm = () => (
      <>
         {/* Calendar + Ore */}
         <div className="saddprogramari__selector">
            {/* Calendar */}
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
                  openToDate={
                     selectedDate ||
                     (existing?.startTime
                        ? new Date(existing.startTime)
                        : undefined)
                  }
                  formatWeekDay={(name) =>
                     name.substring(0, 2).replace(/^./, (c) => c.toUpperCase())
                  }
                  filterDate={filterDate}
                  dayClassName={(date) => {
                     const key = localDateStr(date);
                     return freeByDay.has(key) || key === existingDayKey
                        ? ""
                        : "saddprogramari__day--inactive";
                  }}
                  calendarClassName="aAddProg__datepicker"
               />
            </div>

            {/* Ore – LISTĂ simplă */}
            <div className="saddprogramari__times">
               <h3 className="saddprogramari__title hide">Selectează:</h3>
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
                     const isSelected = selectedTime?.oraStart === ora.oraStart;

                     const isToday =
                        selectedDate &&
                        localDateStr(selectedDate) === localDateStr(new Date());
                     const now = new Date();
                     const nowHH = String(now.getHours()).padStart(2, "0");
                     const nowMM = String(now.getMinutes()).padStart(2, "0");
                     const nowHHMM = `${nowHH}:${nowMM}`;
                     const pastToday = isToday && ora.oraStart <= nowHHMM;

                     const currentIso = existing?.startTime
                        ? new Date(existing.startTime).toISOString()
                        : null;
                     const isExistingSlot = currentIso && iso === currentIso;
                     const studentUnchanged =
                        String(studentId) === String(originalStudentId);

                     const available =
                        (isExistingSlot && studentUnchanged) ||
                        (iso ? freeSet.has(iso) : false);

                     const disabled =
                        !selectedDate ||
                        pastToday ||
                        (iso && new Date(iso) <= new Date()) ||
                        !available;

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
                                 : isExistingSlot && !studentUnchanged
                                 ? "Schimbi elevul: slotul actual trebuie să fie liber"
                                 : !available
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

         {/* Elev + Instructor */}
         <div className="instructors-popup__form-row" style={{ marginTop: 10 }}>
            <label className="instructors-popup__field" style={{ flex: 1 }}>
               <span className="instructors-popup__label">Elev</span>
               <div className="picker__row">
                  <input
                     className="instructors-popup__input"
                     type="text"
                     readOnly
                     value={
                        studentDisplay +
                        (studentPhone ? ` · ${studentPhone}` : "")
                     }
                     placeholder="Alege elev"
                  />
                  <button
                     type="button"
                     className="instructors-popup__form-button"
                     onClick={() => setView("studentSearch")}
                  >
                     Caută elev
                  </button>
               </div>
            </label>

            <label className="instructors-popup__field" style={{ flex: 1 }}>
               <span className="instructors-popup__label">Instructor</span>
               <div className="picker__row">
                  <input
                     className="instructors-popup__input"
                     type="text"
                     readOnly
                     value={
                        instructorDisplay +
                        (instructorPhone ? ` · ${instructorPhone}` : "")
                     }
                     placeholder="Alege instructor"
                  />
                  <button
                     type="button"
                     className="instructors-popup__form-button"
                     onClick={() => setView("instructorSearch")}
                  >
                     Caută instructor
                  </button>
               </div>
            </label>
         </div>

         {/* Notiță scurtă */}
         <input
            className="instructors-popup__input"
            placeholder="Ex.: punct de întâlnire, cerințe speciale, progres etc."
            value={privateMessage}
            style={{ marginBottom: "6px" }}
            onChange={(e) => setPrivateMessage(e.target.value)}
         />

         {/* Sector + Cutie */}
         <div className="instructors-popup__form-row">
            <div
               className={`instructors-popup__radio-wrapper addprog ${
                  sector === "Botanica" ? "active-botanica" : "active-ciocana"
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
                  />
                  Ciocana
               </label>
            </div>

            <div
               className={`instructors-popup__radio-wrapper addprog ${
                  gearbox === "Manual" ? "active-botanica" : "active-ciocana"
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
                  />
                  Automat
               </label>
            </div>
         </div>

         {/* Selector culoare (tooltip nativ + fallback mobil) */}
         <div
            className="saddprogramari__color-grid"
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
                     title={tip} // ✅ tooltip nativ desktop
                     className={[
                        "saddprogramari__color-swatch",
                        `saddprogramari__color-swatch--${suffix}`,
                        active ? "is-active" : "",
                     ].join(" ")}
                     onClick={() => setColorToken(token)}
                     onFocus={() => setColorHoverText(tip)} // accesibilitate tastatură
                     onBlur={() => setColorHoverText("")}
                     onTouchStart={() => {
                        // ✅ fallback pe mobil: afișăm eticheta 1.6s
                        setColorHoverText(tip);
                        if (colorHoverTimerRef.current)
                           clearTimeout(colorHoverTimerRef.current);
                        colorHoverTimerRef.current = setTimeout(() => {
                           setColorHoverText("");
                        }, 1600);
                     }}
                  />
               );
            })}
         </div>

         {/* eticheta scurtă sub grid (apare pe mobil / focus) */}
         {colorHoverText ? (
            <div
               className="saddprogramari__color-hint"
               style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}
            >
               {colorHoverText}
            </div>
         ) : null}

         {/* Butoane */}
         <div
            className="instructors-popup__btns"
            style={{ marginTop: 10, alignItems: "center" }}
         >
            <button
               className="instructors-popup__form-button instructors-popup__form-button--edit"
               onClick={() => setView("history")}
               title="Vezi istoricul modificărilor"
               style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
               Istoric
            </button>

            <div style={{ flex: 1 }} />

            <button
               className="instructors-popup__form-button instructors-popup__form-button--delete"
               onClick={onDelete}
            >
               Șterge
            </button>
            <button
               className="instructors-popup__form-button instructors-popup__form-button--save"
               onClick={onSave}
            >
               Salvează
            </button>
         </div>
      </>
   );

   return (
      <>
         {/* TITLU FIX */}
         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Editează rezervarea</h3>
         </div>

         {/* CONȚINUT */}
         <div className="aAddProg instructors-popup__content">
            {view === "history"
               ? renderHistoryList()
               : view === "studentSearch"
               ? renderStudentSearch()
               : view === "instructorSearch"
               ? renderInstructorSearch()
               : renderForm()}
         </div>

         <AlertPills messages={alerts} onDismiss={popAlert} />
      </>
   );
}
