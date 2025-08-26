// src/components/Calendar/CustomDayView.jsx
import React, {
   useMemo,
   useEffect,
   useState,
   useCallback,
   useRef,
} from "react";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import { fetchInstructorsGroups } from "../../store/instructorsGroupSlice";
import { fetchAllReservations } from "../../store/reservationsSlice";
import { fetchStudents } from "../../store/studentsSlice";
import { openPopup } from "../Utils/popupStore";
import { ReactSVG } from "react-svg";
import addIcon from "../../assets/svg/add.svg";

/* ====== NAV STATE GLOBAL (pt. Next/Prev cu search activ) ====== */
let __DV_NAV_STATE__ = {
   matchDays: [],
   queryKey: "",
   suspendAutoJump: false, // blochează auto-jump după navigare manuală
   suspendScrollSnap: false, // blochează scroll-into-view după interacțiuni manuale
   snappedForKey: "",
};
// expune și pe window ca să fie vizibil din ACalendarView
if (typeof window !== "undefined") {
   window.__DV_NAV_STATE__ = window.__DV_NAV_STATE__ || __DV_NAV_STATE__;
   __DV_NAV_STATE__ = window.__DV_NAV_STATE__;
}

/* Helpers */
function startOfDayTs(d) {
   const x = new Date(d);
   return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
}
const minutesBetween = (d1, d2) => Math.round((d2 - d1) / 60000);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const isSameDay = (d1, d2) => {
   const a = new Date(d1),
      b = new Date(d2);
   return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
   );
};
const genId = () => {
   try {
      if (
         typeof crypto !== "undefined" &&
         typeof crypto.randomUUID === "function"
      )
         return crypto.randomUUID();
   } catch {}
   return `ev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};
const uniqBy = (arr, keyFn) => {
   const seen = new Set();
   return (arr || []).filter((x) => {
      const k = keyFn(x);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
   });
};
const hhmm = (d) => {
   const H = String(new Date(d).getHours()).padStart(2, "0");
   const M = String(new Date(d).getMinutes()).padStart(2, "0");
   return `${H}:${M}`;
};
const escapeRegExp = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s = "") =>
   s
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
const digitsOnly = (s = "") => s.toString().replace(/\D+/g, "");
const normPlate = (s = "") => s.toString().replace(/[\s-]/g, "").toUpperCase();
const hasAlphaNum = (s = "") => /[a-z0-9]/i.test(s);

// === Highlight helpers (multi-token)
const getGroupOrder = (g) => {
   const v = Number(g?.order ?? g?.sortOrder ?? Infinity);
   return Number.isFinite(v) ? v : Infinity; // cele fără order merg la final
};
function buildHighlightRegex(parts, flags = "gi") {
   const list = Array.from(new Set(parts.filter(Boolean).map(escapeRegExp)));
   if (!list.length) return null;
   return new RegExp(`(${list.join("|")})`, flags);
}
function highlightWithRegex(text, rx) {
   if (!text || !rx) return text;
   const parts = String(text).split(rx);
   return parts.map((part, i) =>
      rx.exec(part) ? (
         <i key={i} className="highlight">
            {part}
         </i>
      ) : (
         part
      )
   );
}
function highlightTokens(text, tokens) {
   if (!tokens || !tokens.length) return text;
   const searchParts = [];
   tokens.forEach((t) => {
      if (t.norm) searchParts.push(t.raw);
      if (t.digits) searchParts.push(t.digits);
      if (t.plate) searchParts.push(t.plate);
      if (t.hhmmPrefix) searchParts.push(t.hhmmPrefix);
   });
   const rx = buildHighlightRegex(searchParts);
   return highlightWithRegex(text, rx);
}
function highlightTimeString(timeStr, tokens) {
   if (!tokens?.length) return timeStr;
   const timePieces = tokens
      .filter((t) => t.kind === "time")
      .map((t) => t.hhmm || t.hhmmPrefix)
      .filter(Boolean);
   const rx = buildHighlightRegex(timePieces);
   return highlightWithRegex(timeStr, rx);
}

export default function CustomDayView(props = {}) {
   const date = props.date ? new Date(props.date) : new Date();
   const { onViewStudent, onChangeColor, onJumpToDate } = props;
   const dispatch = useDispatch();

   // READY FLAGS
   const [indexReady, setIndexReady] = useState(false);
   const hasPrefetchedAllRef = useRef(false);

   // Layout
   const layout = props.layout || {};
   const SLOT_H = layout.slotHeight ?? "40px"; // 30min
   const HOURS_COL_W = layout.hoursColWidth ?? "160px";
   const COL_W = layout.colWidth ?? "120px"; // lățime col instructor
   const GROUP_GAP = layout.groupGap ?? "12px";
   const CONTAINER_H = layout.containerHeight; // ex. "80vh" sau "700px"

   // zoom
   const [zoom, setZoom] = useState(1);
   const Z_MIN = 0.6,
      Z_MAX = 2.5,
      Z_STEP = 0.1;
   const incZoom = () =>
      setZoom((z) => clamp(Math.round((z + Z_STEP) * 10) / 10, Z_MIN, Z_MAX));
   const decZoom = () =>
      setZoom((z) => clamp(Math.round((z - Z_STEP) * 10) / 10, Z_MIN, Z_MAX));
   const resetZoom = () => setZoom(1);

   const [sectorFilter, setSectorFilter] = useState("Botanica");
   const sectorFilterNorm = sectorFilter.toLowerCase();
   const eventMatchesSector = useCallback(
      (ev) => (ev?.sector || "").toLowerCase() === sectorFilterNorm,
      [sectorFilterNorm]
   );

   const layoutVars = {
      "--zoom": zoom,
      "--slot-h": `calc(${SLOT_H} * var(--zoom))`,
      "--hours-col-w": HOURS_COL_W,
      "--group-gap": GROUP_GAP,
   };

   // timp
   const startHour = 7;
   const endHour = 21;
   const slotMinutes = 30;
   const maxColsPerGroup = 3;
   const timeMarks = [
      "07:00",
      "08:30",
      "10:00",
      "11:30",
      "13:30",
      "15:00",
      "16:30",
      "18:00",
      "19:30",
   ];
   const HIDDEN_INTERVALS = useMemo(
      () => [{ start: "13:00", end: "13:30" }],
      []
   );

   useEffect(() => {
      if (hasPrefetchedAllRef.current) return;
      hasPrefetchedAllRef.current = true;

      let active = true;
      (async () => {
         try {
            await Promise.all([
               dispatch(fetchInstructorsGroups()),
               dispatch(fetchStudents()),
               dispatch(fetchAllReservations({ scope: "all", pageSize: 5000 })),
            ]);
         } finally {
            if (active) setIndexReady(true);
         }
      })();

      return () => {
         active = false;
      };
   }, [dispatch]);

   const instructorsGroups = useSelector(
      (s) => s.instructorsGroups?.list ?? [],
      shallowEqual
   );
   const reservations = useSelector(
      (s) => s.reservations?.list ?? [],
      shallowEqual
   );
   const instructors = useSelector(
      (s) => s.instructors?.list ?? [],
      shallowEqual
   );
   const students = useSelector((s) => s.students?.list ?? [], shallowEqual);
   const cars = useSelector((s) => s.cars?.list ?? [], shallowEqual);

   const dataReady = useMemo(
      () =>
         (reservations?.length ?? 0) > 0 ||
         (students?.length ?? 0) > 0 ||
         (instructorsGroups?.length ?? 0) > 0,
      [reservations?.length, students?.length, instructorsGroups?.length]
   );
   useEffect(() => {
      if (indexReady) return;
      const hasAny =
         (reservations?.length ?? 0) > 0 ||
         (students?.length ?? 0) > 0 ||
         (instructorsGroups?.length ?? 0) > 0;
      if (hasAny) setIndexReady(true);
   }, [
      indexReady,
      reservations?.length,
      students?.length,
      instructorsGroups?.length,
   ]);

   const dayStart = useMemo(() => {
      const s = new Date(date);
      s.setHours(startHour, 0, 0, 0);
      return s;
   }, [date, startHour]);
   const dayEnd = useMemo(() => {
      const e = new Date(date);
      e.setHours(endHour, 0, 0, 0);
      return e;
   }, [date, endHour]);
   const mkTime = useCallback(
      (str) => {
         const [h, m] = str.split(":").map(Number);
         const d = new Date(dayStart);
         d.setHours(h, m, 0, 0);
         return d;
      },
      [dayStart]
   );
   const hiddenAbs = useMemo(
      () =>
         HIDDEN_INTERVALS.map(({ start, end }) => ({
            start: mkTime(start),
            end: mkTime(end),
         })),
      [HIDDEN_INTERVALS, mkTime]
   );

   // --- Gaps helpers: blocuri vizibile (zi fără HIDDEN) + golurile din coloană ---
   const buildVisibleBlocks = useCallback(() => {
      const blocks = [];
      let cur = dayStart;
      const sortedHidden = hiddenAbs.slice().sort((a, b) => a.start - b.start);
      for (const hi of sortedHidden) {
         if (hi.start > cur) blocks.push({ start: cur, end: hi.start });
         if (hi.end > cur) cur = hi.end;
      }
      if (cur < dayEnd) blocks.push({ start: cur, end: dayEnd });
      return blocks;
   }, [dayStart, dayEnd, hiddenAbs]);
   const LESSON_MINUTES = 90;

   // Sloturi standard ale zilei, derivate din timeMarks.
   // HOISTED: folosită peste tot fără TDZ
   function overlapMinutes(aStart, aEnd, bStart, bEnd) {
      const start = Math.max(aStart.getTime(), bStart.getTime());
      const end = Math.min(aEnd.getTime(), bEnd.getTime());
      return Math.max(0, Math.round((end - start) / 60000));
   }

   const mkStandardSlots = useCallback(() => {
      const slots = timeMarks.map((t) => {
         const start = mkTime(t);
         const end = new Date(start.getTime() + LESSON_MINUTES * 60000);
         return { start, end };
      });

      return slots.filter(({ start, end }) => {
         if (start < dayStart || end > dayEnd) return false;
         // fără coliziuni cu HIDDEN_INTERVALS (ex. 13:00-13:30)
         for (const hi of hiddenAbs) {
            if (overlapMinutes(start, end, hi.start, hi.end) > 0) return false;
         }
         return true;
      });
   }, [timeMarks, mkTime, LESSON_MINUTES, dayStart, dayEnd, hiddenAbs]);
   // returnează sloturile standard rămase libere (fără evenimente care le ating)
   const makeVirtualLessonSlots = useCallback(
      (allInstEvents = []) => {
         const std = mkStandardSlots();
         if (!std.length) return [];
         return std.filter((slot) => {
            return !(allInstEvents || []).some((ev) => {
               return (
                  overlapMinutes(ev.start, ev.end, slot.start, slot.end) > 0
               );
            });
         });
      },
      [mkStandardSlots]
   );
   // ===== VIRTUAL EMPTY SLOTS (90 min, culoare --normal, nu se poate schimba) =====
   // ===== VIRTUAL EMPTY SLOTS (doar start + color) =====
   // ===== VIRTUAL EMPTY SLOTS (90 min, culoare --normal, doar ora) =====
   const buildEmptySlotsForAllInstructors = useCallback(
      (eventsForDay = []) => {
         // evenimentele existente pe instructor
         const byInst = new Map();
         eventsForDay.forEach((ev) => {
            const i = String(ev.instructorId ?? "__unknown");
            if (i === "__empty" || i === "__unknown") return; // nu facem sloturi pe coloana placeholder
            if (!byInst.has(i)) byInst.set(i, []);
            byInst.get(i).push(ev);
         });

         // toți instructorii vizibili (din grupe) + cei care apar doar în rezervări
         const allInstIds = new Set([
            ...(instructorsGroups || []).flatMap((g) =>
               (g.instructors || [])
                  .map((i) => String(i.id))
                  .filter((id) => id !== "__empty" && id !== "__unknown")
            ),
            ...Array.from(byInst.keys()),
         ]);

         const empty = [];
         for (const instId of allInstIds) {
            const base = byInst.get(instId) || [];
            const free = makeVirtualLessonSlots(base); // folosește timeMarks + HIDDEN

            // meta de grupă/sector pentru instructor
            const grpId = findGroupForInstructor(instId) ?? "__ungrouped";
            const gObj = (instructorsGroups || []).find(
               (g) => String(g.id) === String(grpId)
            );
            const groupName = gObj?.name || (gObj ? `Grupa ${gObj.id}` : "");
            const sector = (
               gObj?.sector ||
               gObj?.location ||
               gObj?.area ||
               gObj?.zone ||
               ""
            ).toString();

            free.forEach((slot) => {
               empty.push({
                  id: `empty_${instId}_${slot.start.getTime()}`,
                  title: "Liber",
                  start: slot.start,
                  end: slot.end,
                  instructorId: String(instId),
                  groupId: grpId,
                  groupName,
                  sector,

                  // DOAR ca marcatori (nu afișăm)
                  studentId: null,
                  studentFirst: "",
                  studentLast: "",
                  studentPhone: null,
                  privateMessage: "",

                  // culoare blocată + tip virtual
                  color: "--normal",
                  isVirtual: true,
                  lockColor: true,
               });
            });
         }
         return empty;
      },
      [instructorsGroups, makeVirtualLessonSlots]
   );

   const totalHiddenMins = useMemo(
      () =>
         hiddenAbs.reduce(
            (acc, hi) =>
               acc + overlapMinutes(dayStart, dayEnd, hi.start, hi.end),
            0
         ),
      [hiddenAbs, dayStart, dayEnd]
   );
   const visibleTotalMinutes = useMemo(
      () => Math.max(0, minutesBetween(dayStart, dayEnd) - totalHiddenMins),
      [dayStart, dayEnd, totalHiddenMins]
   );
   const toVisibleMinutes = useCallback(
      (dt) => {
         const clamped = new Date(
            clamp(new Date(dt).getTime(), dayStart.getTime(), dayEnd.getTime())
         );
         let mins = minutesBetween(dayStart, clamped);
         for (const hi of hiddenAbs)
            mins -= overlapMinutes(dayStart, clamped, hi.start, hi.end);
         return clamp(mins, 0, visibleTotalMinutes);
      },
      [dayStart, dayEnd, hiddenAbs, visibleTotalMinutes]
   );
   const toTopSlots = useCallback(
      (d) => toVisibleMinutes(d) / slotMinutes,
      [toVisibleMinutes, slotMinutes]
   );
   const isWithinHidden = useCallback(
      (d) =>
         hiddenAbs.some(
            (hi) => new Date(d) >= hi.start && new Date(d) < hi.end
         ),
      [hiddenAbs]
   );
   const visibleSlotCount = useMemo(
      () => Math.ceil(visibleTotalMinutes / slotMinutes),
      [visibleTotalMinutes, slotMinutes]
   );

   const findGroupForInstructor = (instructorId) => {
      if (!instructorId) return null;
      const g = (instructorsGroups || []).find((grp) =>
         (grp.instructors || []).some(
            (i) => String(i.id) === String(instructorId)
         )
      );
      return g ? String(g.id) : null;
   };

   const studentDict = useMemo(() => {
      const map = new Map();
      (students || []).forEach((u) => {
         map.set(String(u.id), {
            id: String(u.id),
            firstName: u.firstName ?? u.prenume ?? "",
            lastName: u.lastName ?? u.nume ?? "",
            phone: u.phone ?? u.phoneNumber ?? u.mobile ?? u.telefon ?? null,
         });
      });
      return map;
   }, [students]);

   // instructor meta
   const instructorPlates = useMemo(() => {
      const m = new Map();
      (cars || []).forEach((c) => {
         const iId = String(
            c.instructorId ??
               c.instructor_id ??
               c.instructor ??
               c.instructorIdFk ??
               ""
         );
         const plate =
            c.plateNumber ??
            c.plate ??
            c.number ??
            c.registration ??
            c.plate_number ??
            "";
         const gearbox =
            c.gearbox ??
            c.transmission ??
            c.transmissionType ??
            c.gearboxType ??
            null;
         if (iId) m.set(iId, { plate, gearbox });
      });
      return m;
   }, [cars]);

   const instructorMeta = useMemo(() => {
      const dict = new Map();
      (instructors || []).forEach((i) => {
         const id = String(i.id);
         const name = `${i.firstName ?? ""} ${i.lastName ?? ""}`.trim();
         const phone = i.phone ?? i.phoneNumber ?? i.mobile ?? i.telefon ?? "";
         const plate = instructorPlates.get(id)?.plate ?? "";
         const gearbox =
            instructorPlates.get(id)?.gearbox ??
            i.gearbox ??
            i.transmission ??
            null;
         dict.set(id, {
            name,
            nameNorm: norm(name),
            phoneDigits: digitsOnly(phone),
            plateRaw: plate,
            plateNorm: normPlate(plate),
            plateDigits: digitsOnly(plate),
            gearbox: gearbox ? String(gearbox).toLowerCase() : null,
         });
      });
      return dict;
   }, [instructors, instructorPlates]);

   // Facts pentru match unitar pe eveniment
   const makeFacts = (ev) => {
      const inst = instructorMeta.get(String(ev.instructorId)) || {};
      const studentFull = `${ev.studentFirst || ""} ${
         ev.studentLast || ""
      }`.trim();
      return {
         studentName: norm(studentFull),
         instName: inst.nameNorm || "",
         phones: [
            digitsOnly(ev.studentPhone || ""),
            inst.phoneDigits || "",
         ].filter(Boolean),
         time: hhmm(ev.start),
         plateNorm: inst.plateNorm || "",
         plateDigits: inst.plateDigits || "",
         groupName: norm(ev.groupName || ""),
         note: norm(ev.privateMessage || ""),
      };
   };

   // === SEARCH ===
   const [query, setQuery] = useState("");
   const parseToken = (raw) => {
      const t = String(raw || "").trim();
      if (!t) return null;

      const m = /^([a-z]+)\s*:(.*)$/i.exec(t);
      const key = m ? m[1].toLowerCase() : null;
      const val = (m ? m[2] : t).trim();

      const valNorm = norm(val);
      const valDigits = digitsOnly(val);
      const valPlate = normPlate(val);

      const isTime = /^(\d{1,2})([:\.](\d{0,2}))?$|^\d{1,2}h$/i.test(val);
      const hhmmPrefix = isTime
         ? val.includes(":") || val.includes(".")
            ? val.replace(".", ":").padEnd(5, "0").slice(0, 5)
            : `${String(val).padStart(2, "0")}:`
         : null;

      const plateLike = /[A-Z]/i.test(valPlate) && /\d/.test(valPlate);

      let kind;
      if (key === "time" || key === "ora" || isTime) kind = "time";
      else if (key === "phone" || key === "tel") kind = "digits";
      else if (key === "plate" || key === "nr") kind = "plate";
      else if (key === "group" || key === "grp") kind = "group";
      else if (key === "inst" || key === "instructor") kind = "inst";
      else if (key === "student" || key === "stud") kind = "student";
      else if (key === "note" || key === "not") kind = "note";
      else if (plateLike) kind = "plate";
      else if (valDigits.length >= 3) kind = "digits";
      else kind = "text";

      return {
         raw,
         kind,
         norm: valNorm,
         digits: valDigits,
         plate: valPlate,
         hhmmPrefix,
      };
   };

   const rawTokens = useMemo(
      () => (query || "").split(/\s+/).filter(Boolean),
      [query]
   );
   const tokens = useMemo(() => {
      return rawTokens
         .map(parseToken)
         .filter(Boolean)
         .filter((t) => {
            if (!hasAlphaNum(t.raw || "")) return false;
            if (t.kind === "text" && (t.norm || "").length < 2) return false;
            return true;
         });
   }, [rawTokens]);
   const anyTokens = tokens.length > 0;

   const instructorHitsTokens = useCallback(
      (instId) => {
         if (!anyTokens) return false;
         const meta = instructorMeta.get(String(instId));
         if (!meta) return false;
         return tokens.some((t) => {
            if (t.kind === "inst") return meta.nameNorm.includes(t.norm);
            if (t.kind === "plate")
               return (meta.plateNorm || "").includes(t.plate);
            if (t.kind === "digits")
               return (
                  (meta.phoneDigits || "").includes(t.digits) ||
                  (meta.plateDigits || "").includes(t.digits)
               );
            if (t.kind === "text")
               return (
                  meta.nameNorm.includes(t.norm) ||
                  (meta.plateNorm || "").includes(t.norm)
               );
            return false;
         });
      },
      [anyTokens, tokens, instructorMeta]
   );

   const tokenHitsFacts = (facts, t) => {
      switch (t.kind) {
         case "time":
            return t.hhmmPrefix ? facts.time.startsWith(t.hhmmPrefix) : false;
         case "digits":
            return (
               facts.phones.some((p) => p.includes(t.digits)) ||
               (facts.plateDigits || "").includes(t.digits)
            );
         case "plate":
            return (facts.plateNorm || "").includes(t.plate);
         case "group":
            return facts.groupName.includes(t.norm);
         case "inst":
            return facts.instName.includes(t.norm);
         case "student":
            return facts.studentName.includes(t.norm);
         case "note":
            return facts.note.includes(t.norm);
         case "text":
            return (
               facts.studentName.includes(t.norm) ||
               facts.instName.includes(t.norm) ||
               facts.groupName.includes(t.norm) ||
               facts.note.includes(t.norm) ||
               (facts.plateNorm || "").includes(t.norm)
            );
         default:
            return false;
      }
   };

   const eventMatchesAllTokens = useCallback(
      (ev) => {
         if (!anyTokens) return true;
         const facts = makeFacts(ev);
         return tokens.every((t) => tokenHitsFacts(facts, t));
      },
      [anyTokens, tokens, instructorMeta]
   );

   // rezervări -> evenimente (pentru ziua curentă)
   const mappedEvents = useMemo(() => {
      const result = (reservations || []).map((r) => {
         const startRaw =
            r.startTime ??
            r.start ??
            r.startedAt ??
            r.start_at ??
            r.startDate ??
            r.start_date ??
            null;
         const endRaw =
            r.endTime ?? r.end ?? r.end_at ?? r.endDate ?? r.end_date ?? null;
         const start = startRaw ? new Date(startRaw) : new Date();
         const durationMin =
            r.durationMinutes ??
            r.slotMinutes ??
            r.lengthMinutes ??
            r.duration ??
            90;
         const end = endRaw
            ? new Date(endRaw)
            : new Date(start.getTime() + durationMin * 60000);

         const instructorIdRaw =
            r.instructorId ??
            r.instructor_id ??
            r.instructor ??
            r.instructorIdFk ??
            null;
         const groupIdRaw =
            r.instructorsGroupId ??
            r.instructors_group_id ??
            r.groupId ??
            r.group_id ??
            null;

         const studentIdRaw =
            r.studentId ??
            r.userId ??
            r.clientId ??
            r.customerId ??
            r.user_id ??
            null;
         const studentId = studentIdRaw != null ? String(studentIdRaw) : null;
         const fromStore = studentId ? studentDict.get(studentId) : null;

         const fallbackName = r.clientName ?? r.client ?? r.customerName ?? "";
         const fallbackPhone =
            r.clientPhone ?? r.phone ?? r.phoneNumber ?? null;
         const first =
            fromStore?.firstName ?? (fallbackName.split(" ")[0] || "");
         const last =
            fromStore?.lastName ??
            (fallbackName.split(" ").slice(1).join(" ") || "");
         const phone = fromStore?.phone ?? fallbackPhone ?? null;

         const groupName = (() => {
            const g = (instructorsGroups || []).find(
               (g) => String(g.id) === String(groupIdRaw)
            );
            return g?.name || (g ? `Grupa ${g.id}` : "");
         })();

         const instIdStr =
            instructorIdRaw != null ? String(instructorIdRaw) : "__unknown";
         const instMeta = instructorMeta.get(instIdStr);
         const gearboxRaw =
            r.gearbox ??
            r.transmission ??
            r.gearboxType ??
            r.transmissionType ??
            instMeta?.gearbox ??
            null;
         const gearboxNorm = gearboxRaw
            ? String(gearboxRaw).toLowerCase()
            : null;
         const gearboxLabel = gearboxNorm
            ? gearboxNorm.includes("auto")
               ? "Automată"
               : gearboxNorm.includes("man")
               ? "Manuală"
               : String(gearboxRaw)
            : null;

         const isConfirmed = Boolean(
            r.isConfirmed ??
               r.confirmed ??
               r.is_confirmed ??
               (typeof r.status === "string" &&
                  r.status.toLowerCase().includes("confirm")) ??
               false
         );

         const isAutoCreated = Boolean(
            (r.createdBy &&
               String(r.createdBy).toLowerCase().includes("auto")) ||
               (r.source && String(r.source).toLowerCase().includes("auto")) ||
               r.isAuto === true ||
               r.automatic === true
         );
         const programareOrigine = isAutoCreated ? "Automată" : "Manuală";

         const instPlateNorm = normPlate(instMeta?.plateRaw ?? "");

         return {
            id: r.id ?? genId(),
            title: r.title ?? "Programare",
            start,
            end,
            instructorId: instIdStr,
            groupId: groupIdRaw != null ? String(groupIdRaw) : "__ungrouped",
            groupName,
            sector: (r.sector || "").toString(),
            studentId,
            studentFirst: first,
            studentLast: last,
            studentPhone: phone,
            privateMessage: r.privateMessage ?? r.note ?? r.comment ?? "",
            color: r.color ?? undefined,
            gearboxLabel,
            isConfirmed,
            programareOrigine,
            instructorPlateNorm: instPlateNorm,
            raw: r,
         };
      });
      return result.filter((ev) => isSameDay(ev.start, date));
   }, [reservations, date, studentDict, instructorsGroups, instructorMeta]);
   const mappedEventsWithGroup = useMemo(() => {
      const empties = buildEmptySlotsForAllInstructors(mappedEvents);
      return [...mappedEvents, ...empties];
   }, [mappedEvents, buildEmptySlotsForAllInstructors]);

   const baseGroups = useMemo(() => {
      return (instructorsGroups || [])
         .slice()
         .sort(
            (a, b) =>
               getGroupOrder(a) - getGroupOrder(b) ||
               new Date(a.createdAt) - new Date(b.createdAt)
         )
         .map((g) => {
            const raw = Array.isArray(g.instructors) ? g.instructors : [];
            const clean = uniqBy(raw, (i) => String(i.id))
               .slice(0, maxColsPerGroup)
               .map((i) => ({
                  id: String(i.id),
                  name:
                     `${i.firstName ?? ""} ${i.lastName ?? ""}`.trim() ||
                     `Instr ${i.id}`,
               }));
            const list = clean.length
               ? clean
               : [{ id: "__empty", name: "— liber —" }];
            return {
               id: String(g.id),
               name: g.name || `Grupa ${g.id}`,
               sector: (
                  g.sector ||
                  g.location ||
                  g.area ||
                  g.zone ||
                  ""
               ).toString(),
               instructors: list,
            };
         });
   }, [instructorsGroups]);

   const mappedGroups = useMemo(() => {
      // instructorii care au vreo grupă „oficială”
      const groupedInstrIds = new Set(
         (instructorsGroups || []).flatMap((g) =>
            (Array.isArray(g.instructors) ? g.instructors : []).map((i) =>
               String(i.id)
            )
         )
      );

      // instructori care AU evenimente fără grupă DAR nu apar în nicio grupă
      const ungroupedEvents = mappedEventsWithGroup.filter(
         (ev) => ev.groupId === "__ungrouped"
      );
      const uniqUngroupedInstrIds = Array.from(
         new Set(ungroupedEvents.map((ev) => String(ev.instructorId)))
      )
         .filter((id) => !groupedInstrIds.has(id)) // ← doar cei fără grupă reală
         .slice(0, maxColsPerGroup);

      const instrDict = Object.fromEntries(
         (instructors || []).map((i) => [
            String(i.id),
            `${i.firstName ?? ""} ${i.lastName ?? ""}`.trim() ||
               `Instr ${i.id}`,
         ])
      );

      const specialInstr = uniqUngroupedInstrIds.length
         ? uniqUngroupedInstrIds.map((id) => ({
              id,
              name: instrDict[id] || "Necunoscut",
           }))
         : [{ id: "__unknown", name: "Necunoscut" }];

      const baseGroups = (instructorsGroups || [])
     .slice()
     .sort((a, b) => getGroupOrder(a) - getGroupOrder(b) || new Date(a.createdAt) - new Date(b.createdAt))
      .map((g) => {
            const raw = Array.isArray(g.instructors) ? g.instructors : [];
            const clean = uniqBy(raw, (i) => String(i.id))
               .slice(0, maxColsPerGroup)
               .map((i) => ({
                  id: String(i.id),
                  name:
                     `${i.firstName ?? ""} ${i.lastName ?? ""}`.trim() ||
                     `Instr ${i.id}`,
               }));
            return {
               id: String(g.id),
               name: g.name || `Grupa ${g.id}`,
               sector: (
                  g.sector ||
                  g.location ||
                  g.area ||
                  g.zone ||
                  ""
               ).toString(),
               instructors: clean.length
                  ? clean
                  : [{ id: "__empty", name: "— liber —" }],
            };
         });

      return [
         ...baseGroups,
         { id: "__ungrouped", name: "Fără grupă", instructors: specialInstr },
      ];
   }, [instructorsGroups, mappedEventsWithGroup, instructors]);

   const eventsByInstructor = useMemo(() => {
      const map = new Map();
      mappedEventsWithGroup.forEach((ev) => {
         const iId = String(ev.instructorId ?? "__unknown");
         if (!map.has(iId)) map.set(iId, []);
         map.get(iId).push(ev);
      });
      return map;
   }, [mappedEventsWithGroup]);

   const groupMatchesSector = useCallback(
      (g) => {
         if (anyTokens) return true;
         const gs = (g?.sector || "").toLowerCase();
         if (gs) return gs === sectorFilterNorm;
         // dacă grupa nu are sector, verificăm evenimentele instructorilor ei
         for (const inst of g.instructors || []) {
            const arr = eventsByInstructor.get(String(inst.id)) || [];
            if (arr.some(eventMatchesSector)) return true;
         }
         return false;
      },
      [anyTokens, eventsByInstructor, eventMatchesSector, sectorFilterNorm]
   );

   const uiGroupsAll = useMemo(() => {
      const groups = [];
      const sectorGroups = mappedGroups.filter(groupMatchesSector);

      for (const g of sectorGroups) {
         const gi = [];
         const groupNameNorm = norm(g.name);

         for (const inst of g.instructors || []) {
            // Toate evenimentele instructorului
            const allInstEvents = eventsByInstructor.get(String(inst.id)) || [];

            // arată TOATE evenimentele acestui instructor, indiferent de groupId
            const relForGroup = allInstEvents;

            const sectorEvents = anyTokens
               ? relForGroup
               : relForGroup.filter(eventMatchesSector);
            const matchedEvents = anyTokens
               ? sectorEvents.filter(eventMatchesAllTokens)
               : sectorEvents;

            const instSelected = instructorHitsTokens(inst.id);

            if (!anyTokens) {
               gi.push({ inst, events: sectorEvents });
            } else if (matchedEvents.length) {
               gi.push({ inst, events: matchedEvents });
            } else if (instSelected && sectorEvents.length) {
               gi.push({ inst, events: sectorEvents });
            } else if (
               tokens.some(
                  (t) =>
                     t.kind === "group" ||
                     (t.kind === "text" && groupNameNorm.includes(t.norm))
               )
            ) {
               if (sectorEvents.length) gi.push({ inst, events: sectorEvents });
            }
         }

         if (gi.length)
            groups.push({ id: g.id, name: g.name, instructors: gi });
      }

      return groups;
   }, [
      mappedGroups,
      eventsByInstructor,
      eventMatchesSector,
      eventMatchesAllTokens,
      anyTokens,
      tokens,
      groupMatchesSector,
      instructorHitsTokens,
   ]);

   const uiGroups = useMemo(() => uiGroupsAll, [uiGroupsAll]);

   /* ====== TOATE evenimentele (toate zilele) pentru skip zile ====== */
   const allEvents = useMemo(() => {
      return (reservations || []).map((r) => {
         const startRaw =
            r.startTime ??
            r.start ??
            r.startedAt ??
            r.start_at ??
            r.startDate ??
            r.start_date ??
            null;
         const endRaw =
            r.endTime ?? r.end ?? r.end_at ?? r.endDate ?? r.end_date ?? null;
         const start = startRaw ? new Date(startRaw) : new Date();
         const durationMin =
            r.durationMinutes ??
            r.slotMinutes ??
            r.lengthMinutes ??
            r.duration ??
            90;
         const end = endRaw
            ? new Date(endRaw)
            : new Date(start.getTime() + durationMin * 60000);

         const instructorIdRaw =
            r.instructorId ??
            r.instructor_id ??
            r.instructor ??
            r.instructorIdFk ??
            null;
         const groupIdRaw =
            r.instructorsGroupId ??
            r.instructors_group_id ??
            r.groupId ??
            r.group_id ??
            null;

         const studentIdRaw =
            r.studentId ??
            r.userId ??
            r.clientId ??
            r.customerId ??
            r.user_id ??
            null;
         const studentId = studentIdRaw != null ? String(studentIdRaw) : null;
         const fromStore = studentId ? studentDict.get(studentId) : null;

         const fallbackName = r.clientName ?? r.client ?? r.customerName ?? "";
         const fallbackPhone =
            r.clientPhone ?? r.phone ?? r.phoneNumber ?? null;
         const first =
            fromStore?.firstName ?? (fallbackName.split(" ")[0] || "");
         const last =
            fromStore?.lastName ??
            (fallbackName.split(" ").slice(1).join(" ") || "");
         const phone = fromStore?.phone ?? fallbackPhone ?? null;

         const instMeta = instructorMeta.get(
            String(instructorIdRaw ?? "__unknown")
         );
         const instPlateNorm = normPlate(instMeta?.plateRaw ?? "");

         const gObj = (instructorsGroups || []).find(
            (g) => String(g.id) === String(groupIdRaw)
         );
         const groupName = gObj?.name || (gObj ? `Grupa ${gObj.id}` : "");

         const isConfirmed = Boolean(
            r.isConfirmed ??
               r.confirmed ??
               r.is_confirmed ??
               (typeof r.status === "string" &&
                  r.status.toLowerCase().includes("confirm")) ??
               false
         );

         return {
            id: r.id ?? genId(),
            start,
            end,
            instructorId: String(instructorIdRaw ?? "__unknown"),
            groupId: groupIdRaw != null ? String(groupIdRaw) : "__ungrouped",
            groupName,
            sector: (r.sector || "").toString(),
            studentId,
            studentFirst: fromStore?.firstName ?? first,
            studentLast: fromStore?.lastName ?? last,
            studentPhone: phone,
            privateMessage: r.privateMessage ?? r.note ?? r.comment ?? "",
            instructorPlateNorm: instPlateNorm,
            isConfirmed,
         };
      });
   }, [reservations, studentDict, instructorMeta, instructorsGroups]);

   const todayMatchesCount = useMemo(() => {
      let c = 0;
      for (const g of uiGroups)
         for (const gi of g.instructors || []) c += gi.events.length;
      return c;
   }, [uiGroups]);

   /* ====== UTILITARE pentru zile cu potriviri ====== */
   const buildMatchDays = useCallback(() => {
      if (!anyTokens) return [];
      const days = new Set();
      for (const ev of allEvents) {
         if (!anyTokens && !eventMatchesSector(ev)) continue;
         if (!eventMatchesAllTokens(ev)) continue;
         const d = new Date(
            ev.start.getFullYear(),
            ev.start.getMonth(),
            ev.start.getDate()
         );
         days.add(d.getTime());
      }
      return Array.from(days).sort((a, b) => a - b);
   }, [anyTokens, allEvents, eventMatchesAllTokens, eventMatchesSector]);

   /* ====== LIVE AUTO-JUMP în timpul scrierii ====== */
   const anchorTsRef = useRef(null);
   const prevAnyTokensRef = useRef(false);
   const lastSectorRef = useRef(sectorFilter);
   const programmaticScrollRef = useRef(false);

   // când începi să tastezi → ancora = ziua vizibilă; când golești → reset
   useEffect(() => {
      const wasAny = prevAnyTokensRef.current;
      if (anyTokens && !wasAny) {
         anchorTsRef.current = startOfDayTs(date);
      } else if (!anyTokens && wasAny) {
         anchorTsRef.current = null;
      }
      prevAnyTokensRef.current = anyTokens;
   }, [anyTokens, date]);

   // dacă schimbi sectorul în timpul căutării, re-ancorează la ziua afișată
   useEffect(() => {
      if (lastSectorRef.current !== sectorFilter) {
         lastSectorRef.current = sectorFilter;
         if (anyTokens) anchorTsRef.current = startOfDayTs(date);
      }
   }, [sectorFilter, anyTokens, date]);

   // un singur auto-jump relativ la ancoră (și DOAR dacă nu e suspendat)
   useEffect(() => {
      if (!indexReady || !anyTokens) return;
      if (__DV_NAV_STATE__.suspendAutoJump) return;
      if (autoJumpTimerRef.current) clearTimeout(autoJumpTimerRef.current);
      autoJumpTimerRef.current = setTimeout(() => {
         // dacă între timp userul a început să tragă, nu mai sări nicăieri
         if (__DV_NAV_STATE__.suspendAutoJump) return;
         const list = buildMatchDays();
         if (!list.length) return;
         const anchorTs = anchorTsRef.current ?? startOfDayTs(new Date());
         const nextTs = list.find((ts) => ts >= anchorTs) ?? null;
         let prevTs = null;
         for (let i = list.length - 1; i >= 0; i--) {
            if (list[i] < anchorTs) {
               prevTs = list[i];
               break;
            }
         }
         const targetTs = nextTs ?? prevTs;
         if (targetTs == null) return;
         if (typeof onJumpToDate === "function") {
            onJumpToDate(new Date(targetTs));
            releaseDrag(); // rămâne, e safe dacă nu e în drag (că oricum l-am oprit pe pointerDown)
         }
      }, 120);

      return () => {
         if (autoJumpTimerRef.current) clearTimeout(autoJumpTimerRef.current);
         autoJumpTimerRef.current = null;
      };
   }, [tokens, sectorFilter, indexReady, buildMatchDays, onJumpToDate]); // ← fără `date`

   // ====== Actualizează NAV-STATE pentru navigate() static ======
   // ✅ un singur scroll-into-view per (căutare + zi), doar dacă n-ai derulat manual
   useEffect(() => {
      const qKey = __DV_NAV_STATE__.queryKey;
      if (!qKey) return;

      const snapKey = `${qKey}|${startOfDayTs(date)}`;
      if (__DV_NAV_STATE__.suspendScrollSnap) return;
      if (__DV_NAV_STATE__.snappedForKey === snapKey) return;

      const root = scrollRef.current;
      const el = root?.querySelector(".highlight");
      if (!el?.scrollIntoView) return;

      // dacă s-a început un drag între timp, nu face snap
      if (dragRef.current.down || __DV_NAV_STATE__.suspendScrollSnap) return;

      programmaticScrollRef.current = true;
      releaseDrag();
      el.scrollIntoView({
         block: "center",
         inline: "center",
         behavior: "smooth",
      });
      __DV_NAV_STATE__.snappedForKey = snapKey;

      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      snapTimerRef.current = setTimeout(() => {
         programmaticScrollRef.current = false;
      }, 400);

      return () => {
         if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
         snapTimerRef.current = null;
      };
   }, [date, uiGroups]);

   // rulează doar când se schimbă ziua (căutarea e urmărită prin NAV-STATE)
   const styleVarsForEvent = (ev) => {
      const minsStart = toVisibleMinutes(ev.start);
      const minsEnd = toVisibleMinutes(ev.end);
      const startSlots = Math.floor(minsStart / slotMinutes + 1e-6);
      const endSlots = Math.ceil(minsEnd / slotMinutes - 1e-6);
      const span = Math.max(endSlots - startSlots, 1);
      return { "--ev-slots": startSlots, "--ev-span": span };
   };

   const [colorOverlayFor, setColorOverlayFor] = useState(null);
   const releaseDrag = useCallback(() => {
      const el = scrollRef.current;
      const st = dragRef.current;
      if (!el) return;
      st.down = false;
      st.dragging = false;
      if (st.pointerId != null) {
         try {
            el.releasePointerCapture?.(st.pointerId);
         } catch {}
         st.pointerId = null;
      }
      el.classList.remove("is-dragging");
      el.classList.remove("is-panning"); // 👈 adaugă asta
   }, []);

   // scroll to first highlight
   const scrollRef = useRef(null);

   // ✅ actualizează NAV-STATE când se schimbă căutarea sau sectorul
   useEffect(() => {
      const qKey = anyTokens
         ? tokens.map((t) => `${t.kind}:${t.raw}`).join("#") +
           `|${sectorFilter}`
         : "";

      const prevKey = __DV_NAV_STATE__.queryKey;
      __DV_NAV_STATE__.queryKey = qKey;
      __DV_NAV_STATE__.matchDays = anyTokens ? buildMatchDays() : [];

      if (qKey !== prevKey) {
         // pornește “curat”: permitem un singur auto-jump și un singur snap
         __DV_NAV_STATE__.suspendAutoJump = false;
         __DV_NAV_STATE__.suspendScrollSnap = false;
         __DV_NAV_STATE__.snappedForKey = "";
      }
   }, [anyTokens, tokens, sectorFilter, buildMatchDays]);

   const handleOpenStudentPopup = (student) => {
      openPopup("studentDetails", { student });
      onViewStudent?.({ studentId: student?.id });
   };

   // ---------- Drag to pan (X+Y) ----------
   const onUserScroll = useCallback(() => {
      if (!programmaticScrollRef.current) {
         __DV_NAV_STATE__.suspendScrollSnap = true; // user a derulat → oprim snap-ul
      }
   }, []);
   const dragRef = useRef({
      down: false,
      dragging: false,
      startX: 0,
      startY: 0,
      scrollLeft: 0,
      scrollTop: 0,
      pointerId: null,
   });
   const DRAG_THRESHOLD = 7;
   const isInteractiveTarget = (el) =>
      !!el?.closest?.(
         'button, a, input, textarea, select, [role="button"], [contenteditable=""], [contenteditable="true"]'
      );
   // sus, la alte useRef-uri:
   const autoJumpTimerRef = useRef(null);
   const snapTimerRef = useRef(null);

   // ...

   const onPointerDown = (e) => {
      const el = scrollRef.current;
      if (!el) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (isInteractiveTarget(e.target)) return;

      // ⛔ oprește tot ce ține de căutare care „se mișcă singur”
      __DV_NAV_STATE__.suspendScrollSnap = true;
      __DV_NAV_STATE__.suspendAutoJump = true;
      if (autoJumpTimerRef.current) {
         clearTimeout(autoJumpTimerRef.current);
         autoJumpTimerRef.current = null;
      }
      if (snapTimerRef.current) {
         clearTimeout(snapTimerRef.current);
         snapTimerRef.current = null;
      }

      dragRef.current.down = true;
      dragRef.current.dragging = false;
      dragRef.current.pointerId = e.pointerId;
      dragRef.current.startX = e.clientX;
      dragRef.current.startY = e.clientY;
      dragRef.current.scrollLeft = el.scrollLeft;
      dragRef.current.scrollTop = el.scrollTop;

      try {
         el.setPointerCapture?.(e.pointerId);
      } catch {}
      el.classList.add("is-panning");
      e.preventDefault();
   };

   const onPointerMove = (e) => {
      const el = scrollRef.current;
      const st = dragRef.current;
      if (!el || !st.down) return;

      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;

      if (!st.dragging) {
         if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD)
            return;
         st.dragging = true;
         el.classList.add("is-dragging");
      }

      e.preventDefault();
      el.scrollLeft = st.scrollLeft - dx;
      el.scrollTop = st.scrollTop - dy;
   };
   const endDrag = () => {
      const el = scrollRef.current;
      const st = dragRef.current;
      if (!el) return;
      st.down = false;
      st.dragging = false;
      if (st.pointerId != null) {
         try {
            el.releasePointerCapture?.(st.pointerId);
         } catch {}
         st.pointerId = null;
      }
      el.classList.remove("is-dragging");
      el.classList.remove("is-panning"); // 👈 reactivate selectarea textului
   };
   const onClickCapture = (e) => {
      if (dragRef.current.dragging) {
         e.preventDefault();
         e.stopPropagation();
      }
   };
   const onWheelZoom = (e) => {
      const withModifier = e.ctrlKey || e.metaKey || e.altKey;
      if (!withModifier) {
         __DV_NAV_STATE__.suspendScrollSnap = true; // scroll normal
         return;
      }
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      if (delta > 0) decZoom();
      else incZoom();
   };

   // ---------- RENDER ----------
   return (
      <div className="dayview" style={{ ...layoutVars, height: CONTAINER_H }}>
         <div className="dayview__header">
            <div className="dayview__header-left">
               <div
                  className={`instructors-popup__radio-wrapper addprog ${
                     sectorFilter === "Botanica"
                        ? "active-botanica"
                        : "active-ciocana"
                  }`}
                  style={{ marginRight: 12 }}
               >
                  <label>
                     <input
                        type="radio"
                        name="dv-sector"
                        value="Botanica"
                        checked={sectorFilter === "Botanica"}
                        onChange={(e) => setSectorFilter(e.target.value)}
                     />
                     Botanica
                  </label>
                  <label>
                     <input
                        type="radio"
                        name="dv-sector"
                        value="Ciocana"
                        checked={sectorFilter === "Ciocana"}
                        onChange={(e) => setSectorFilter(e.target.value)}
                     />
                     Ciocana
                  </label>
               </div>
            </div>
            <div className="dayview__toolbar">
               <input
                  className="dv-search__input"
                  placeholder={
                     dataReady
                        ? "Caută: name:ion ..."
                        : "Se încarcă programările…"
                  }
                  disabled={!dataReady}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
               />
               <button
                  className="dv-btn"
                  onClick={decZoom}
                  title="Zoom out (Ctrl + scroll jos)"
               >
                  −
               </button>
               <button
                  className="dv-btn dv-btn--ghost"
                  onClick={resetZoom}
                  title="Reset zoom"
               >
                  {Math.round(zoom * 100)}%
               </button>
               <button
                  className="dv-btn"
                  onClick={incZoom}
                  title="Zoom in (Ctrl + scroll sus)"
               >
                  +
               </button>
            </div>
         </div>

         <div
            className="dayview__row dv-pan"
            ref={scrollRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onWheel={onWheelZoom}
            onScroll={onUserScroll}
            onClickCapture={onClickCapture}
            onDragStart={(e) => e.preventDefault()}
         >
            {uiGroups.map((group) => {
               const cols = Math.max(
                  1,
                  Math.min(maxColsPerGroup, (group.instructors || []).length)
               );
               return (
                  <section
                     key={group.id}
                     className="dayview__group-wrap"
                     style={{
                        "--cols": cols,
                        "--colw": `calc(${COL_W} * var(--zoom))`,
                     }}
                     aria-label={group.name}
                  >
                     <header className="dayview__group-header">
                        <div className="dayview__group-name">
                           {highlightTokens(group.name, tokens)}
                        </div>
                        <div className="dayview__group-instructors">
                           {group.instructors.map(({ inst }) => (
                              <div
                                 key={inst.id}
                                 className="dayview__instructor-head"
                              >
                                 <div className="dv-inst-name">
                                    {highlightTokens(inst.name, tokens)}
                                 </div>
                                 <div className="dv-inst-plate">
                                    {highlightTokens(
                                       instructorMeta.get(String(inst.id))
                                          ?.plateRaw ?? "",
                                       tokens
                                    )}
                                 </div>
                              </div>
                           ))}
                        </div>
                     </header>

                     <div className="dayview__group-content">
                        <aside
                           className="dayview__hours"
                           style={{ "--visible-slots": visibleSlotCount }}
                        >
                           {timeMarks.map((t) => {
                              const dt = mkTime(t);
                              if (isWithinHidden(dt)) return null;
                              return (
                                 <div
                                    key={t}
                                    className="dayview__hour-mark"
                                    style={{ "--mark-slots": toTopSlots(dt) }}
                                 >
                                    {highlightTimeString(t, tokens)}
                                 </div>
                              );
                           })}
                        </aside>

                        <div className="dayview__columns">
                           {group.instructors.map(({ inst, events }) => (
                              <div
                                 key={inst.id}
                                 className="dayview__event-col"
                                 style={{ "--visible-slots": visibleSlotCount }}
                              >
                                 {/* === grid lines per slot (ca în versiunea veche) === */}
                                 {Array.from({ length: visibleSlotCount }).map(
                                    (_, i) => (
                                       <div
                                          key={`slot-${i}`}
                                          className="dayview__slot-line"
                                       />
                                    )
                                 )}

                                 {timeMarks.map((t) => {
                                    const dt = mkTime(t);
                                    if (isWithinHidden(dt)) return null;
                                    return (
                                       <div
                                          key={`line-${t}`}
                                          className="dayview__mark-line"
                                          style={{
                                             "--mark-slots": toTopSlots(dt),
                                          }}
                                       />
                                    );
                                 })}
                                 {events.map((ev) => {
                                    const person =
                                       ev.studentFirst + " " + ev.studentLast;
                                    const studentObj = ev.studentId
                                       ? {
                                            id: ev.studentId,
                                            firstName: ev.studentFirst,
                                            lastName: ev.studentLast,
                                            phone: ev.studentPhone,
                                            isConfirmed: ev.isConfirmed,
                                         }
                                       : null;
                                    const evInHiddenOnly = hiddenAbs.some(
                                       (hi) =>
                                          ev.start >= hi.start &&
                                          ev.end <= hi.end
                                    );
                                    if (evInHiddenOnly) return null;
                                    const isVirtual = ev.isVirtual === true;
                                    const lockColor = ev.lockColor === true;
                                    const colorKey = (
                                       isVirtual
                                          ? "--normal"
                                          : ev.color || "--default"
                                    )
                                       .replace(/^var\(/, "")
                                       .replace(/\)$/, "");

                                    return (
                                       <div
                                          key={ev.id}
                                          className={`dayview__event dayview__event--${colorKey.replace(
                                             /^--/,
                                             ""
                                          )} ${
                                             isVirtual
                                                ? "dayview__event--virtual"
                                                : ""
                                          }`}
                                          style={styleVarsForEvent(ev)}
                                       >
                                          {colorOverlayFor === ev.id && (
                                             <div
                                                className="dayview__color-overlay"
                                                onClick={() =>
                                                   setColorOverlayFor(null)
                                                }
                                             >
                                                <div
                                                   className="dayview__color-grid"
                                                   onClick={(e) =>
                                                      e.stopPropagation()
                                                   }
                                                >
                                                   {Array.from({
                                                      length: 9,
                                                   }).map((_, idx) => {
                                                      if (idx === 2)
                                                         return (
                                                            <button
                                                               key="close"
                                                               type="button"
                                                               className="dayview__color-close"
                                                               aria-label="Închide selectorul"
                                                               onClick={() =>
                                                                  setColorOverlayFor(
                                                                     null
                                                                  )
                                                               }
                                                            >
                                                               <ReactSVG
                                                                  src={addIcon}
                                                                  className="dayview__color-close-icon react-icon"
                                                               />
                                                            </button>
                                                         );
                                                      const COLORS = [
                                                         "--yellow",
                                                         "--green",
                                                         "--red",
                                                         "--orange",
                                                         "--purple",
                                                         "--pink",
                                                         "--blue",
                                                         "--indigo",
                                                      ];
                                                      const colorToken =
                                                         COLORS[
                                                            idx > 2
                                                               ? idx - 1
                                                               : idx
                                                         ];
                                                      return (
                                                         <button
                                                            key={colorToken}
                                                            type="button"
                                                            className={`dayview__color-cell dayview__color-cell--${colorToken.replace(
                                                               /^--/,
                                                               ""
                                                            )}`}
                                                            aria-label={
                                                               colorToken
                                                            }
                                                            onClick={() => {
                                                               setColorOverlayFor(
                                                                  null
                                                               );
                                                               onChangeColor?.({
                                                                  id: ev.id,
                                                                  color: colorToken,
                                                               });
                                                            }}
                                                         />
                                                      );
                                                   })}
                                                </div>
                                             </div>
                                          )}
                                          {!isVirtual && (
                                             <div className="dayview__event-top">
                                                <div className="dayview__event-person">
                                                   <button
                                                      type="button"
                                                      className="dayview__event-person-name dayview__event-person-name--link"
                                                      onClick={() =>
                                                         handleOpenStudentPopup(
                                                            studentObj
                                                         )
                                                      }
                                                      title="Deschide detalii elev"
                                                   >
                                                      {highlightTokens(
                                                         person,
                                                         tokens
                                                      )}
                                                   </button>
                                                </div>
                                                {!lockColor && (
                                                   <button
                                                      type="button"
                                                      className="dayview__color-trigger"
                                                      aria-label="Schimbă culoarea"
                                                      onClick={() =>
                                                         setColorOverlayFor(
                                                            colorOverlayFor ===
                                                               ev.id
                                                               ? null
                                                               : ev.id
                                                         )
                                                      }
                                                   >
                                                      <span
                                                         className="dayview__color-dot"
                                                         data-color={colorKey}
                                                      />
                                                   </button>
                                                )}
                                             </div>
                                          )}

                                          {/* CONTINUT: 
      - pentru virtual → DOAR ora
      - pentru normal → rândul tău cu „Nu/Da”, ora, cutia de viteze etc.
  */}
                                          {isVirtual ? (
                                             <div className="dv-meta-row dv-meta-row--solo">
                                                <span className="dv-meta-pill">
                                                   {hhmm(ev.start)}
                                                </span>
                                             </div>
                                          ) : (
                                             <>
                                                <button
                                                   type="button"
                                                   className="dv-meta-row dv-clickable"
                                                   onClick={() =>
                                                      openPopup(
                                                         "reservationEdit",
                                                         {
                                                            reservationId:
                                                               ev.id,
                                                         }
                                                      )
                                                   }
                                                   title="Editează nota"
                                                >
                                                   <span className="dv-meta-pill">
                                                      {ev.isConfirmed
                                                         ? "Da"
                                                         : "Nu"}
                                                   </span>
                                                   <span className="dv-meta-pill">
                                                      {highlightTimeString(
                                                         hhmm(ev.start),
                                                         tokens
                                                      )}
                                                   </span>
                                                   {ev.gearboxLabel && (
                                                      <span className="dv-meta-pill">
                                                         {ev.gearboxLabel}
                                                      </span>
                                                   )}
                                                </button>
                                                {ev.privateMessage && (
                                                   <p
                                                      className="dayview__event-note dv-clickable"
                                                      title="Editează nota"
                                                   >
                                                      {highlightTokens(
                                                         ev.privateMessage,
                                                         tokens
                                                      )}
                                                   </p>
                                                )}
                                             </>
                                          )}
                                       </div>
                                    );
                                 })}
                              </div>
                           ))}
                        </div>
                     </div>
                  </section>
               );
            })}
         </div>
      </div>
   );
}

CustomDayView.navigate = (date, action) => {
   const d = new Date(date);
   const startOf = (x) =>
      new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();

   const hasQuery =
      !!__DV_NAV_STATE__.queryKey &&
      (__DV_NAV_STATE__.matchDays?.length || 0) > 0;
   if (!hasQuery) {
      const d = new Date(date);
      switch (String(action)) {
         case "TODAY":
            return new Date();
         case "PREV":
            // pas cu o zi înapoi, indiferent de căutare
            return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
         case "NEXT":
            // pas cu o zi înainte, indiferent de căutare
            return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
         default:
            return d;
      }
   }

   const curTs = startOf(d);
   const list = __DV_NAV_STATE__.matchDays.slice().sort((a, b) => a - b);

   if (String(action) === "NEXT") {
      const nextTs = list.find((ts) => ts > curTs) ?? null;
      if (nextTs != null) {
         __DV_NAV_STATE__.suspendAutoJump = true; // oprește auto-jump după navigare manuală
         return new Date(nextTs);
      }
      return d;
   }

   if (String(action) === "PREV") {
      let prevTs = null;
      for (let i = list.length - 1; i >= 0; i--) {
         if (list[i] < curTs) {
            prevTs = list[i];
            break;
         }
      }
      if (prevTs != null) {
         __DV_NAV_STATE__.suspendAutoJump = true;
         return new Date(prevTs);
      }
      return d;
   }

   if (String(action) === "TODAY") return new Date();
   return d;
};

CustomDayView.title = (date, { localizer } = {}) => {
   if (localizer && typeof localizer.format === "function")
      return localizer.format(date, "dddd, DD MMMM YYYY");
   return new Date(date).toLocaleDateString("ro-RO", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
   });
};
