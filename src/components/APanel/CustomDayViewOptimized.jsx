// ================================================
// src/components/APanel/CustomDayViewOptimized.jsx
import React, {
   useMemo,
   useEffect,
   useState,
   useCallback,
   useRef,
   useLayoutEffect,
   useDeferredValue,
   memo,
} from "react";
import { useDispatch, useSelector, shallowEqual } from "react-redux";

import { fetchInstructorsGroups } from "../../store/instructorsGroupSlice";
import { fetchCars } from "../../store/carsSlice";
import { fetchReservationsDelta } from "../../store/reservationsSlice";
import { fetchStudents } from "../../store/studentsSlice";
import { fetchUsers } from "../../store/usersSlice";
import { fetchInstructors } from "../../store/instructorsSlice";

import { openPopup } from "../Utils/popupStore";
import { ReactSVG } from "react-svg";
import refreshIcon from "../../assets/svg/grommet-icons--power-reset.svg";
import editIcon from "../../assets/svg/material-symbols--edit-outline-sharp.svg";
import arrow from "../../assets/svg/arrow-s.svg";

import useInertialPan from "./Calendar/useInertialPan";
import InstructorColumnConnected from "./Calendar/InstructorColumnConnected";
import { getInstructorBlackouts } from "../../api/instructorsService"; // ⬅️ NOU

/* ====== NAV STATE GLOBAL ====== */
let __DV_NAV_STATE__ = {
   matchDays: [],
   queryKey: "",
   suspendAutoJump: false,
   suspendScrollSnap: false,
   snappedForKey: "",
   centerOnDateNextTick: false,
   allDaysSorted: [],
   isInteracting: false, // <— nou
};
if (typeof window !== "undefined") {
   window.__DV_NAV_STATE__ = window.__DV_NAV_STATE__ || __DV_NAV_STATE__;
   __DV_NAV_STATE__ = window.__DV_NAV_STATE__;
}

/* ===== Helpers ===== */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const startOfDayTs = (d) => {
   const x = new Date(d);
   return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
};
const toFloatingDate = (val) => {
   if (!val) return null;
   if (val instanceof Date && !isNaN(val)) return new Date(val);
   const m =
      typeof val === "string" &&
      val.match(
         /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/
      );
   if (m) {
      const [, Y, Mo, D, h = "0", mi = "0", s = "0"] = m;
      return new Date(+Y, +Mo - 1, +D, +h, +mi, +s, 0);
   }
   const d = new Date(val);
   return isNaN(d) ? null : d;
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

const MOLDOVA_TZ = "Europe/Chisinau";
const hhmm = (d) =>
   new Intl.DateTimeFormat("en-GB", {
      timeZone: MOLDOVA_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
   }).format(d instanceof Date ? d : new Date(d));

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
const buildHighlightRegex = (parts, flags = "gi") => {
   const list = Array.from(new Set(parts.filter(Boolean).map(escapeRegExp)));
   if (!list.length) return null;
   return new RegExp(`(${list.join("|")})`, flags);
};

/* ===== ORDER index-only (3 coloane) ===== */
const ORDER_SEP = "|";
const COLS = 3;
const dateKey = (d) => {
   const x = new Date(d);
   return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(
      2,
      "0"
   )}${String(x.getDate()).padStart(2, "0")}`;
};
const splitTokens = (str) =>
   String(str || "")
      .split(ORDER_SEP)
      .map((t) => t.trim())
      .filter(Boolean);
const xyToIdx = (x, y) => (y - 1) * COLS + x;
const idxToXY = (i) => {
   const n = Math.max(1, Number(i) || 1);
   const y = Math.floor((n - 1) / COLS) + 1;
   const x = ((n - 1) % COLS) + 1;
   return { x, y };
};
function getPosFromOrder(orderStr, d) {
   const key = dateKey(d);
   let allIdx = null;
   for (const tok of splitTokens(orderStr)) {
      let m = /^(\d{4})(\d{2})(\d{2})i(\d+)$/.exec(tok);
      if (m && `${m[1]}${m[2]}${m[3]}` === key) return idxToXY(Number(m[4]));
      m = /^(all|def)i(\d+)$/i.exec(tok);
      if (m) allIdx = Number(m[2]);
   }
   return allIdx != null ? idxToXY(allIdx) : null;
}
const getPosGeneric = getPosFromOrder;
function getDayOnlyPos(orderStr, d) {
   const key = dateKey(d);
   for (const tok of splitTokens(orderStr)) {
      const m = /^(\d{4})(\d{2})(\d{2})i(\d+)$/.exec(tok);
      if (m && `${m[1]}${m[2]}${m[3]}` === key) return idxToXY(Number(m[4]));
   }
   return null;
}
function upsertPosInOrder(orderStr, d, x, y) {
   const key = dateKey(d);
   const nextTok = `${key}i${xyToIdx(x, y)}`;
   const out = [];
   let replaced = false;
   for (const tok of splitTokens(orderStr)) {
      const m = /^(\d{4})(\d{2})(\d{2})i(\d+)$/.exec(tok);
      if (m && `${m[1]}${m[2]}${m[3]}` === key) {
         if (!replaced) {
            out.push(nextTok);
            replaced = true;
         }
      } else {
         out.push(tok);
      }
   }
   if (!replaced) out.push(nextTok);
   return out.join(ORDER_SEP);
}
const upsertPosGeneric = upsertPosInOrder;
function ensureAllToken(orderStr, x, y) {
   const nextTok = `alli${xyToIdx(x, y)}`;
   const out = [];
   let hadAll = false;
   for (const tok of splitTokens(orderStr)) {
      if (/^(all|def)i\d+$/i.test(tok)) {
         if (!hadAll) {
            out.push(nextTok);
            hadAll = true;
         }
      } else {
         out.push(tok);
      }
   }
   if (!hadAll) out.push(nextTok);
   return out.join(ORDER_SEP);
}

/* ===== localStorage pt. order overrides ===== */
const ORDER_LS_KEY = "dv_order_cache";
const loadOrderCache = () => {
   if (typeof window === "undefined") return {};
   try {
      return JSON.parse(localStorage.getItem(ORDER_LS_KEY) || "{}") || {};
   } catch {
      return {};
   }
};
const saveOrderCache = (obj) => {
   if (typeof window === "undefined") return;
   try {
      localStorage.setItem(ORDER_LS_KEY, JSON.stringify(obj || {}));
   } catch {}
};

// Rows helper (corect, fără duplicare)
function toRowsOfN(list, n, pad = true) {
   const rows = [];
   for (let i = 0; i < list.length; i += n) {
      const chunk = list.slice(i, i + n);
      if (pad) {
         while (chunk.length < n) {
            chunk.push({
               inst: { id: `__pad_${i}_${chunk.length}`, name: "" },
               events: [],
            });
         }
      }
      rows.push(chunk);
   }
   return rows;
}

/* ===== MEMO pentru coloană ===== */
const MemoInstructorColumn = memo(InstructorColumnConnected, (prev, next) => {
   return (
      prev.editMode === next.editMode &&
      prev.rowIdxLocal === next.rowIdxLocal &&
      prev.colIdx === next.colIdx &&
      prev.rowsCount === next.rowsCount &&
      prev.inst?.id === next.inst?.id &&
      prev.day?.id === next.day?.id &&
      prev.tokensKey === next.tokensKey &&
      prev.eventsKey === next.eventsKey &&
      prev.getOrderStringForInst === next.getOrderStringForInst &&
      prev.blackoutVer === next.blackoutVer // ⬅️ NOU
   );
});

/* ================= Component ================= */
export default function CustomDayViewOptimized(props = {}) {
   const { onViewStudent } = props;
   const compact = !!props.compact;
   const date = props.date ? new Date(props.date) : new Date();

   const scrollRef = useRef(null);

   // viewport-bounded height
   const [rowHeight, setRowHeight] = useState(0);
   const recalcRowHeight = useCallback(() => {
      const el = scrollRef.current;
      if (!el) return;

      const top = el.getBoundingClientRect().top;
      const vh = window.visualViewport?.height ?? window.innerHeight;

      const isPhone =
         window.matchMedia?.("(max-width: 768px)")?.matches ?? false;
      const headerOffset = isPhone ? 102 : 24;
      const h = Math.max(200, vh - top - headerOffset);
      setRowHeight(h);
   }, []);
   useLayoutEffect(() => {
      recalcRowHeight();
      const onResize = () => recalcRowHeight();
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);
      window.visualViewport?.addEventListener?.("resize", onResize);
      return () => {
         window.removeEventListener("resize", onResize);
         window.removeEventListener("orientationchange", onResize);
         window.visualViewport?.removeEventListener?.("resize", onResize);
      };
   }, [recalcRowHeight]);

   const dispatch = useDispatch();
   const LESSON_MINUTES = 90;

   // Layout
   const layout = props.layout || {};
   const EVENT_H = layout.eventHeight ?? "48px";
   const SLOT_H = layout.slotHeight ?? "40px";
   const HOURS_COL_W = layout.hoursColWidth ?? "60px";
   const COL_W = layout.colWidth ?? "60px";
   const ROW_GAP = 32;
   const DAY_GAP = 32;
   const GROUP_GAP = layout.groupGap ?? "32px";
   const CONTAINER_H = layout.containerHeight;

   // Mobile detect
   const [isMobile, setIsMobile] = useState(false);
   const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
   const mobileMenuRef = useRef(null);

   useEffect(() => {
      if (typeof window === "undefined") return;
      const mql = window.matchMedia("(max-width: 768px)");
      const apply = () => setIsMobile(mql.matches);
      apply();
      mql.addEventListener?.("change", apply);
      return () => mql.removeEventListener?.("change", apply);
   }, []);

   useEffect(() => {
      if (!isMobile) setMobileMenuOpen(false);
   }, [isMobile]);

   useEffect(() => {
      if (!mobileMenuOpen) return;
      const onDocClick = (e) => {
         if (!mobileMenuRef.current) return;
         if (!mobileMenuRef.current.contains(e.target))
            setMobileMenuOpen(false);
      };
      document.addEventListener("click", onDocClick, true);
      return () => document.removeEventListener("click", onDocClick, true);
   }, [mobileMenuOpen]);

   // Zoom
   const [zoom, setZoom] = useState(1);
   const Z_MIN = 0.3,
      Z_MAX = 3.0;
   const setZoomClamped = useCallback((val) => {
      const z = Math.max(Z_MIN, Math.min(Z_MAX, val));
      setZoom(z);
      return z;
   }, []);
   const getZoom = useCallback(() => zoom, [zoom]);

   const zoomAt = useCallback(
      (factor, clientX) => {
         const el = scrollRef.current;
         if (!el) return;
         const oldZ = getZoom();
         const newZ = setZoomClamped(oldZ * factor);
         const s = newZ / oldZ;
         const x = clientX - el.getBoundingClientRect().left;
         el.scrollLeft = (el.scrollLeft + x) * s - x;
      },
      [getZoom, setZoomClamped]
   );

   useEffect(() => {
      if (isMobile) setZoomClamped(0.6);
   }, [isMobile, setZoomClamped]);

   /* ===== Flag-uri interacțiuni (folosite de wheel & pan) ===== */
   const suspendFlagsRef = useRef(__DV_NAV_STATE__);
   const isInteractiveTarget = (el) =>
      !!el.closest?.(
         `.dv-move-pad,
       .dv-move-pad button,
       .dv-slot button,
       input, textarea, select, button, a`
      );

   /* ===== Sector: Toate / Botanica / Ciocana ===== */
   const [sectorFilter, setSectorFilter] = useState("Toate");
   const sectorFilterNorm = sectorFilter.toLowerCase();

   /* ===== DATA ===== */
   const hasPrefetchedAllRef = useRef(false);
   useEffect(() => {
      if (hasPrefetchedAllRef.current) return;
      hasPrefetchedAllRef.current = true;
      (async () => {
         try {
            await Promise.all([
               dispatch(fetchInstructors()),
               dispatch(fetchInstructorsGroups()),
               dispatch(fetchStudents()),
               dispatch(fetchReservationsDelta()),
               dispatch(fetchCars()),
               dispatch(fetchUsers()),
            ]);
         } finally {
         }
      })();
   }, [dispatch]);

   // === Live vs UI (freeze în timpul interacțiunii) =========================
   const reservationsLive = useSelector(
      (s) => s.reservations?.list ?? [],
      shallowEqual
   );

   const [reservationsUI, setReservationsUI] = useState(reservationsLive);
   const pendingReservationsRef = useRef(null);

   // când vin date noi: dacă utilizatorul interacționează, ține-le în pending
   useEffect(() => {
      const interacting = !!suspendFlagsRef.current?.isInteracting;
      if (interacting) {
         pendingReservationsRef.current = reservationsLive;
      } else {
         setReservationsUI(reservationsLive);
         pendingReservationsRef.current = null;
      }
   }, [reservationsLive]);

   // aplică pending la finalul pan/inerției
   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      const onPanEnd = () => {
         if (pendingReservationsRef.current) {
            setReservationsUI(pendingReservationsRef.current);
            pendingReservationsRef.current = null;
         }
         // după final de interacțiune, recalculăm fereastra vizibilă
         recalcWindow();
      };
      el.addEventListener("dvpanend", onPanEnd);
      return () => el.removeEventListener("dvpanend", onPanEnd);
   }, []); // eslint-disable-line

   // Cold-boot guard (verifică pe sursa live)
   useEffect(() => {
      if (!hasPrefetchedAllRef.current) return;
      if ((reservationsLive?.length ?? 0) === 0) {
         dispatch(fetchReservationsDelta());
      }
   }, [dispatch, reservationsLive?.length]);
   // Auto-refresh la 10s (pauză când interacționează / tab ascuns; fără suprapuneri)
   useEffect(() => {
      if (typeof window === "undefined") return;
      let inFlight = false;
      const T = 10_000;

      const tick = async () => {
         if (document.hidden) return; // nu refresha în fundal
         if (suspendFlagsRef.current?.isInteracting) return; // nu deranja drag/inerția
         if (inFlight) return; // evită dublurile
         inFlight = true;
         try {
            await dispatch(fetchReservationsDelta());
         } finally {
            inFlight = false;
         }
      };

      const id = setInterval(tick, T);
      return () => clearInterval(id);
   }, [dispatch]);
   // Refresh instant când revii pe fereastră sau tab-ul devine vizibil
   useEffect(() => {
      const onFocusVisible = () => {
         if (!document.hidden && !suspendFlagsRef.current?.isInteracting) {
            dispatch(fetchReservationsDelta());
         }
      };
      window.addEventListener("focus", onFocusVisible);
      document.addEventListener("visibilitychange", onFocusVisible);
      return () => {
         window.removeEventListener("focus", onFocusVisible);
         document.removeEventListener("visibilitychange", onFocusVisible);
      };
   }, [dispatch]);

   const instructorsGroups = useSelector(
      (s) => s.instructorsGroups?.list ?? [],
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
         (reservationsLive?.length ?? 0) > 0 ||
         (students?.length ?? 0) > 0 ||
         (instructorsGroups?.length ?? 0) > 0,
      [reservationsLive?.length, students?.length, instructorsGroups?.length]
   );

   // ziua tipică / ore
   const dayStart = useMemo(() => {
      const s = new Date(date);
      s.setHours(7, 0, 0, 0);
      return s;
   }, [date]);
   const dayEnd = useMemo(() => {
      const e = new Date(date);
      e.setHours(21, 0, 0, 0);
      return e;
   }, [date]);

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
   const mkTime = useCallback(
      (str) => {
         const [h, m] = str.split(":").map(Number);
         const d = new Date(dayStart);
         d.setHours(h, m, 0, 0);
         return d;
      },
      [dayStart]
   );
   const overlapMinutes = (aStart, aEnd, bStart, bEnd) => {
      const start = Math.max(aStart.getTime(), bStart.getTime());
      const end = Math.min(aEnd.getTime(), bEnd.getTime());
      return Math.max(0, Math.round((end - start) / 60000));
   };
   const hiddenAbs = useMemo(
      () =>
         HIDDEN_INTERVALS.map(({ start, end }) => ({
            start: mkTime(start),
            end: mkTime(end),
         })),
      [HIDDEN_INTERVALS, mkTime]
   );
   const mkStandardSlots = useCallback(() => {
      const slots = timeMarks.map((t) => {
         const start = mkTime(t);
         const end = new Date(start.getTime() + LESSON_MINUTES * 60000);
         return { start, end };
      });
      return slots.filter(({ start, end }) => {
         if (start < dayStart || end > dayEnd) return false;
         for (const hi of hiddenAbs)
            if (overlapMinutes(start, end, hi.start, hi.end) > 0) return false;
         return true;
      });
   }, [timeMarks, mkTime, LESSON_MINUTES, dayStart, dayEnd, hiddenAbs]);

   const mkStandardSlotsForDay = useCallback(
      (baseDayDate) => {
         const base = new Date(baseDayDate);
         base.setHours(0, 0, 0, 0);
         const mkLocal = (str) => {
            const [h, m] = str.split(":").map(Number);
            const d = new Date(base);
            d.setHours(h, m, 0, 0);
            return d;
         };
         const hiddenLocal = HIDDEN_INTERVALS.map(({ start, end }) => ({
            start: mkLocal(start),
            end: mkLocal(end),
         }));
         const dayStartLocal = new Date(base);
         dayStartLocal.setHours(7, 0, 0, 0);
         const dayEndLocal = new Date(base);
         dayEndLocal.setHours(21, 0, 0, 0);
         const overlaps = (aStart, aEnd, bStart, bEnd) =>
            Math.max(aStart.getTime(), bStart.getTime()) <
            Math.min(aEnd.getTime(), bEnd.getTime());

         return timeMarks
            .map((t) => {
               const start = mkLocal(t);
               const end = new Date(start.getTime() + LESSON_MINUTES * 60000);
               return { start, end };
            })
            .filter(
               ({ start, end }) =>
                  start >= dayStartLocal &&
                  end <= dayEndLocal &&
                  !hiddenLocal.some((hi) =>
                     overlaps(start, end, hi.start, hi.end)
                  )
            );
      },
      [timeMarks, HIDDEN_INTERVALS, LESSON_MINUTES]
   );

   /* ===== Instructor meta ===== */
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
      const instSectorIndex = new Map();
      (instructorsGroups || []).forEach((g) => {
         const sectorRaw = g?.sector ?? g?.location ?? "";
         const sectorNorm = String(sectorRaw).trim().toLowerCase();
         (g?.instructors || []).forEach((ii) => {
            const idStr = String(ii?.id ?? ii);
            if (sectorNorm && !instSectorIndex.has(idStr))
               instSectorIndex.set(idStr, sectorNorm);
         });
      });

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
         const sectorRaw = i.sector ?? instSectorIndex.get(id) ?? "";
         const sectorNorm = String(sectorRaw).trim().toLowerCase();

         dict.set(id, {
            name,
            nameNorm: norm(name),
            phoneDigits: digitsOnly(phone),
            plateRaw: plate,
            plateNorm: normPlate(plate),
            plateDigits: digitsOnly(plate),
            gearbox: gearbox ? String(gearbox).toLowerCase() : null,
            orderRaw: i.order ?? "",
            sectorNorm,
         });
      });
      return dict;
   }, [instructors, instructorPlates, instructorsGroups]);

   const allowedInstBySector = useMemo(() => {
      if (sectorFilterNorm === "toate") return null;
      const set = new Set();
      (instructors || []).forEach((i) => {
         const id = String(i.id);
         const s = instructorMeta.get(id)?.sectorNorm ?? "";
         if (s && s === sectorFilterNorm) set.add(id);
      });
      return set;
   }, [instructors, instructorMeta, sectorFilterNorm]);

   /* ===== Ordonare – localStorage ===== */
   const [orderOverrides, setOrderOverrides] = useState(() => loadOrderCache());
   useEffect(() => {
      saveOrderCache(orderOverrides);
   }, [orderOverrides]);

   const getOrderStringForInst = useCallback(
      (instId) => orderOverrides[String(instId)] ?? "",
      [orderOverrides]
   );

   useEffect(() => {
      if (!instructors?.length) return;
      const ids = instructors
         .map((i) => String(i.id))
         .sort((a, b) => {
            const na = Number(a),
               nb = Number(b);
            if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
            return String(a).localeCompare(String(b), undefined, {
               numeric: true,
            });
         });

      const add = {};
      ids.forEach((iid, idx) => {
         const current = getOrderStringForInst(iid);
         if ((current || "").trim()) return;
         const x = (idx % maxColsPerGroup) + 1;
         const y = Math.floor(idx / maxColsPerGroup) + 1;
         const withAll = ensureAllToken("", x, y);
         add[iid] = withAll;
      });

      if (Object.keys(add).length) {
         setOrderOverrides((prev) => {
            const next = { ...prev, ...add };
            saveOrderCache(next);
            return next;
         });
      }
   }, [instructors, getOrderStringForInst]);

   const setInstructorOrderForDate = useCallback(
      (instId, dayDate, x, y) => {
         const id = String(instId);
         const current = getOrderStringForInst(id);
         const updated = upsertPosGeneric(current, dayDate, x, y);
         setOrderOverrides((prev) => {
            const next = { ...prev, [id]: updated };
            saveOrderCache(next);
            return next;
         });
      },
      [getOrderStringForInst]
   );

   const computeOrderedInstIdsForDay = useCallback(
      (allInstIds, dayDate, cols = 3) => {
         const ids = Array.from(allInstIds);
         ids.sort((a, b) => {
            const na = Number(a),
               nb = Number(b);
            if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
            return String(a).localeCompare(String(b), undefined, {
               numeric: true,
            });
         });

         const rows = Math.max(1, Math.ceil((ids.length || 1) / cols));
         const totalSlots = rows * cols;
         const slots = new Array(totalSlots).fill(null);
         const placed = new Set();

         ids.forEach((iid) => {
            const pos = getPosGeneric(getOrderStringForInst(iid), dayDate);
            if (!pos) return;
            const x = Math.max(1, Math.min(cols, pos.x));
            const y = Math.max(1, Math.min(rows, pos.y));
            const idx = (y - 1) * cols + (x - 1);
            if (slots[idx] == null) {
               slots[idx] = iid;
               placed.add(iid);
            }
         });

         ids.forEach((iid) => {
            if (placed.has(iid)) return;
            const idx = slots.findIndex((v) => v == null);
            if (idx !== -1) {
               slots[idx] = iid;
               placed.add(iid);
            }
         });

         const orderedIds = slots.filter(Boolean);
         return { orderedIds, rows };
      },
      [getOrderStringForInst]
   );

   const nudgeInstructor = useCallback(
      (instId, dayDate, dx, dy, fallbackX, fallbackY, _rowsCount, cols = 3) => {
         const allInstIds = new Set(
            (instructors || []).map((i) => String(i.id))
         );
         const { orderedIds, rows } = computeOrderedInstIdsForDay(
            allInstIds,
            dayDate,
            cols
         );
         const curIdx = orderedIds.findIndex(
            (id) => String(id) === String(instId)
         );
         const curX = curIdx >= 0 ? (curIdx % cols) + 1 : fallbackX;
         const curY = curIdx >= 0 ? Math.floor(curIdx / cols) + 1 : fallbackY;
         const tx = Math.max(1, Math.min(cols, curX + dx));
         const ty = Math.max(1, Math.min(rows, curY + dy));
         if (tx === curX && ty === curY) return;
         const targetIdx = (ty - 1) * cols + (tx - 1);
         const occupantId = orderedIds[targetIdx] || null;
         setInstructorOrderForDate(instId, dayDate, tx, ty);
         if (occupantId && String(occupantId) !== String(instId)) {
            setInstructorOrderForDate(occupantId, dayDate, curX, curY);
         }
      },
      [instructors, computeOrderedInstIdsForDay, setInstructorOrderForDate]
   );

   /* ===== Group lookup ===== */
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

   const studentDictRef = useRef(null);
   useEffect(() => {
      studentDictRef.current = studentDict;
   }, [studentDict]);

   const handleCreateFromEmpty = (ev) => {
      const instId = String(ev.instructorId ?? "");
      const meta = instructorMeta.get(instId) || {};
      const grpId =
         ev.groupId && ev.groupId !== "__ungrouped"
            ? String(ev.groupId)
            : findGroupForInstructor(instId);
      const gObj =
         (instructorsGroups || []).find(
            (g) => String(g.id) === String(grpId)
         ) || null;
      const sectorVal =
         ev.sector || gObj?.sector || gObj?.location || "Botanica";
      const gbLabel = (meta.gearbox || "").toLowerCase().includes("auto")
         ? "Automat"
         : "Manual";

      openPopup("addProg", {
         start: ev.start,
         end: ev.end,
         instructorId: instId === "__unknown" ? null : instId,
         sector: sectorVal,
         gearbox: meta.gearbox || null,
         initialStartTime: new Date(ev.start).toISOString(),
         initialInstructorId: instId === "__unknown" ? null : instId,
         initialSector: sectorVal,
         initialGearbox: gbLabel,
      });
   };

   /* ===== Căutare ===== */
   const [query, setQuery] = useState("");
   const deferredQuery = useDeferredValue(query); // smooth pe input

   const parseToken = (raw) => {
      const t = String(raw || "").trim();
      if (!t) return null;
      const m = /^([a-zăâîșț]+)\s*:(.*)$/i.exec(t);
      const val = (m ? m[2] : t).trim();

      const valNorm = norm(val);
      const valDigits = digitsOnly(val);
      const valPlate = normPlate(val);
      const hasLetters = /[a-z]/i.test(val);
      const hasDigits = /\d/.test(val);

      const hasColonOrDot = /[:\.]/.test(val);
      const hasSuffixH = /h$/i.test(val);
      const isPlainHour = /^\d{1,2}$/.test(val);

      let hhmmPrefix = null;
      if (hasColonOrDot || hasSuffixH) {
         if (/^\d{1,2}([:\.]\d{0,2})?$|^\d{1,2}h$/i.test(val)) {
            hhmmPrefix =
               val.includes(":") || val.includes(".")
                  ? val.replace(".", ":").padEnd(5, "0").slice(0, 5)
                  : `${String(val).replace(/[^\d]/g, "").padStart(2, "0")}:`;
         }
      } else if (isPlainHour) {
         hhmmPrefix = `${String(val).padStart(2, "0")}:`;
      }

      let kind = "text";
      if (hasColonOrDot || hasSuffixH) kind = "time";
      else if (hasLetters && hasDigits && valPlate.length >= 4) kind = "plate";
      else if (valDigits.length >= 2 || isPlainHour) kind = "digits";

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
      () => (deferredQuery || "").split(/\s+/).filter(Boolean),
      [deferredQuery]
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

   const tokensRegex = useMemo(() => {
      if (!tokens?.length) return null;
      const parts = [];
      tokens.forEach((t) => {
         if (t.norm) parts.push(t.raw);
         if (t.digits) parts.push(t.digits);
         if (t.plate) parts.push(t.plate);
         if (t.hhmmPrefix) parts.push(t.hhmmPrefix);
      });
      return buildHighlightRegex(parts);
   }, [tokens]);

   const highlightTokens = useCallback(
      (text) => {
         if (!tokensRegex) return text;
         const s = String(text || "");
         const html = s.replace(tokensRegex, '<i class="highlight">$1</i>');
         return <span dangerouslySetInnerHTML={{ __html: html }} />;
      },
      [tokensRegex]
   );

   const tokensKey = useMemo(
      () => tokens.map((t) => t.raw).join("|"),
      [tokens]
   );

   /* ===== Mapare rezervări -> evenimente ===== */
   const mapReservationToEvent = useCallback(
      (r) => {
         // Timp
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

         const start = startRaw ? toFloatingDate(startRaw) : new Date();
         const durationMin =
            r.durationMinutes ??
            r.slotMinutes ??
            r.lengthMinutes ??
            r.duration ??
            90;
         const end = endRaw
            ? toFloatingDate(endRaw)
            : new Date(start.getTime() + durationMin * 60000);

         // Instructor / Grup
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

         // Student / User
         const studentIdRaw =
            r.studentId ??
            r.userId ??
            r.user?.id ??
            r.clientId ??
            r.customerId ??
            r.user_id ??
            null;
         const studentId = studentIdRaw != null ? String(studentIdRaw) : null;

         const fromStore = studentId
            ? studentDictRef.current?.get(studentId)
            : null;

         const fallbackName =
            r.clientName ?? r.customerName ?? r.name ?? r.user?.name ?? "";

         const fallbackPhone =
            r.studentPhone ??
            r.user?.phone ??
            r.clientPhone ??
            r.phoneNumber ??
            r.phone ??
            null;

         const first =
            fromStore?.firstName ??
            r.studentFirst ??
            r.user?.firstName ??
            (fallbackName ? fallbackName.split(" ")[0] : "");

         const last =
            fromStore?.lastName ??
            r.studentLast ??
            r.user?.lastName ??
            (fallbackName ? fallbackName.split(" ").slice(1).join(" ") : "");

         const phone = fromStore?.phone ?? fallbackPhone ?? null;

         const groupName = (() => {
            const g = (instructorsGroups || []).find(
               (g) => String(g.id) === String(groupIdRaw)
            );
            return g?.name || (g ? `Grupa ${g.id}` : "");
         })();

         const instIdStr =
            instructorIdRaw != null ? String(instructorIdRaw) : "__unknown";
         const instMetaLocal = instructorMeta.get(instIdStr);

         // Cutie de viteze
         const gearboxRaw =
            r.gearbox ??
            r.transmission ??
            r.gearboxType ??
            r.transmissionType ??
            instMetaLocal?.gearbox ??
            null;
         const gearboxNorm = gearboxRaw
            ? String(gearboxRaw).toLowerCase()
            : null;
         const gearboxLabel = gearboxNorm
            ? gearboxNorm.includes("auto")
               ? "A"
               : gearboxNorm.includes("man")
               ? "M"
               : String(gearboxRaw)
            : null;

         const isConfirmed = Boolean(
            r.isConfirmed ??
               r.confirmed ??
               r.is_confirmed ??
               (typeof r.status === "string" &&
                  r.status.toLowerCase().includes("confirm"))
         );

         const instPlateNorm = normPlate(instMetaLocal?.plateRaw ?? "");

         return {
            id: r.id ?? genId(),
            title: r.title ?? "Programare",
            start,
            end,

            instructorId: instIdStr,
            groupId: groupIdRaw != null ? String(groupIdRaw) : "__ungrouped",
            groupName,
            sector: (r.sector || "").toString(),

            // — CHEIE: câmpuri pentru EventCard
            studentId,
            studentFirst: first,
            studentLast: last,
            studentPhone: phone,

            privateMessage: r.privateMessage ?? r.note ?? r.comment ?? "",
            color: r.color ?? undefined,
            gearboxLabel,
            isConfirmed,
            programareOrigine: null,
            instructorPlateNorm: instPlateNorm,

            raw: r,
         };
      },
      [instructorsGroups, instructorMeta]
   );

   // toate evenimentele, grupate pe zi (folosește *UI snapshot* în timpul interacțiunii)
   const eventsByDay = useMemo(() => {
      const map = new Map(); // ts -> Event[]
      (reservationsUI || []).forEach((r) => {
         const startRaw =
            r.startTime ??
            r.start ??
            r.startedAt ??
            r.start_at ??
            r.startDate ??
            r.start_date;
         if (!startRaw) return;
         const s = toFloatingDate(startRaw);
         if (!s) return;
         const ts = new Date(
            s.getFullYear(),
            s.getMonth(),
            s.getDate()
         ).getTime();
         if (!map.has(ts)) map.set(ts, []);
         map.get(ts).push(mapReservationToEvent(r));
      });
      map.forEach((arr) => arr.sort((a, b) => a.start - b.start));
      return map;
   }, [reservationsUI, mapReservationToEvent]);

   /* ===== Facts cache pentru căutare ===== */
   const factsCacheRef = useRef(new WeakMap());
   const getFacts = useCallback(
      (ev) => {
         let f = factsCacheRef.current.get(ev);
         if (f) return f;
         const inst = instructorMeta.get(String(ev.instructorId)) || {};
         const studentFull = `${ev.studentFirst || ""} ${
            ev.studentLast || ""
         }`.trim();
         const timeStr = hhmm(ev.start);
         f = {
            studentName: norm(studentFull),
            instName: inst.nameNorm || "",
            phones: [
               digitsOnly(ev.studentPhone || ""),
               inst.phoneDigits || "",
            ].filter(Boolean),
            time: timeStr,
            timeDigits: timeStr.replace(":", ""),
            hourOnly: timeStr.slice(0, 2),
            plateNorm: inst.plateNorm || "",
            plateDigits: inst.plateDigits || "",
            groupName: norm(ev.groupName || ""),
            note: norm(ev.privateMessage || ""),
         };
         factsCacheRef.current.set(ev, f);
         return f;
      },
      [instructorMeta]
   );

   const tokenHitsFacts = (facts, t) => {
      switch (t.kind) {
         case "time":
            return t.hhmmPrefix
               ? (facts.time || "").startsWith(t.hhmmPrefix)
               : false;
         case "digits": {
            const d = t.digits;
            const byPhoneOrPlate =
               facts.phones.some((p) => p.includes(d)) ||
               (facts.plateDigits || "").includes(d);
            const byTime =
               (facts.timeDigits || "").includes(d) ||
               (t.hhmmPrefix
                  ? (facts.time || "").startsWith(t.hhmmPrefix)
                  : false) ||
               (facts.hourOnly || "").startsWith(d.padStart(2, "0"));
            return byPhoneOrPlate || byTime;
         }
         case "plate":
            return (facts.plateNorm || "").includes(t.plate);
         default:
            return (
               facts.studentName.includes(t.norm) ||
               facts.instName.includes(t.norm) ||
               facts.groupName.includes(t.norm) ||
               facts.note.includes(t.norm) ||
               (facts.plateNorm || "").includes(t.norm)
            );
      }
   };

   const eventMatchesAllTokens = useCallback(
      (ev) => {
         if (!anyTokens) return true;
         const facts = getFacts(ev);
         return tokens.every((t) => tokenHitsFacts(facts, t));
      },
      [anyTokens, tokens, getFacts]
   );

   /* ===========================================================
   FEREASTRĂ FIXĂ: [-30 .. +60] zile față de `date`
   + WINDOWING: randăm doar zilele vizibile
  ============================================================ */
   const visibleDaysForAll = useMemo(() => {
      const mid = new Date(date);
      mid.setHours(0, 0, 0, 0);
      const out = [];
      for (let i = -30; i <= +60; i++) {
         const d = new Date(mid);
         d.setDate(mid.getDate() + i);
         out.push(d);
      }
      return out;
   }, [date]);

   // zile cu potriviri (pentru navigație când există query)
   const matchDaysWithinWindow = useMemo(() => {
      const list = [];
      for (const d of visibleDaysForAll) {
         const ts = startOfDayTs(d);
         const dayEventsRaw = eventsByDay.get(ts) || [];
         for (const ev of dayEventsRaw) {
            const iid = String(ev.instructorId ?? "__unknown");
            const sectorOk =
               !allowedInstBySector || allowedInstBySector.has(iid);
            if (sectorOk && eventMatchesAllTokens(ev)) {
               list.push(new Date(ts));
               break;
            }
         }
      }
      list.sort((a, b) => a - b);
      return list;
   }, [
      visibleDaysForAll,
      eventsByDay,
      allowedInstBySector,
      eventMatchesAllTokens,
   ]);

   // Actualizăm NAV STATE
   useEffect(() => {
      __DV_NAV_STATE__.allDaysSorted = visibleDaysForAll
         .map(startOfDayTs)
         .sort((a, b) => a - b);
      __DV_NAV_STATE__.matchDays = anyTokens
         ? matchDaysWithinWindow.map(startOfDayTs)
         : [];
      __DV_NAV_STATE__.queryKey = anyTokens
         ? tokens.map((t) => `${t.kind}:${t.raw}`).join("#") +
           `|${sectorFilter}`
         : "";
   }, [
      visibleDaysForAll,
      anyTokens,
      matchDaysWithinWindow,
      tokens,
      sectorFilter,
   ]);

   /* ===== UI metrics ===== */
   const layoutVars = {
      "--event-h": EVENT_H,
      "--hours-col-w": HOURS_COL_W,
      "--group-gap": GROUP_GAP,
      "--day-header-h": `44px`,
      "--row-header-h": `auto`,
      "--font-scale": 1,
   };
   const px = (v) => parseFloat(String(v || 0));
   const visibleSlotCount = useMemo(
      () => mkStandardSlots().length,
      [mkStandardSlots]
   );
   const baseMetrics = useMemo(() => {
      const baseColw = px(COL_W);
      const baseSlot = px(SLOT_H);
      const baseDayWidth = maxColsPerGroup * baseColw;
      return {
         colw: baseColw,
         slot: baseSlot,
         dayWidth: baseDayWidth, // fără gap
      };
   }, [COL_W, SLOT_H, maxColsPerGroup]);

   // IMPORTANT: lățime unitate (zi) + gap, folosită peste tot
   const UNIT_W = baseMetrics.dayWidth + 12 + DAY_GAP; // secțiune + spațiu
   const DAY_W_BASE = UNIT_W;

   const contentW = useMemo(
      () => visibleDaysForAll.length * DAY_W_BASE,
      [visibleDaysForAll.length, DAY_W_BASE]
   );

   /* ===== Windowing (render only visible indexes) ===== */
   const [win, setWin] = useState({ from: 0, to: -1 });

   const recalcWindow = useCallback(() => {
      const el = scrollRef.current;
      const len = visibleDaysForAll.length;
      if (!el || !len) return;

      const dayWScaled = DAY_W_BASE * zoom;
      const visStart = Math.floor(el.scrollLeft / dayWScaled);
      const visEnd =
         Math.ceil((el.scrollLeft + el.clientWidth) / dayWScaled) - 1;

      const OVER = 6; // overscan
      const from = clamp(visStart - OVER, 0, len - 1);
      const to = clamp(visEnd + OVER, 0, len - 1);

      setWin((prev) =>
         prev.from === from && prev.to === to ? prev : { from, to }
      );
   }, [visibleDaysForAll.length, DAY_W_BASE, zoom]);

   // Seed: pornește în jurul zilei curente + centrează (O SINGURĂ DATĂ)
   const didSeedRef = useRef(false);
   useEffect(() => {
      const el = scrollRef.current;
      const len = visibleDaysForAll.length;
      if (!len || !el || didSeedRef.current) return;
      didSeedRef.current = true;

      const curTs = startOfDayTs(date);
      let midIdx = visibleDaysForAll.findIndex(
         (d) => startOfDayTs(d) === curTs
      );
      if (midIdx < 0) midIdx = Math.floor(len / 2);

      const SEED = 6;
      const from = clamp(midIdx - SEED, 0, len - 1);
      const to = clamp(midIdx + SEED, 0, len - 1);
      setWin({ from, to });

      const dayWScaled = DAY_W_BASE * zoom;
      const left = midIdx * dayWScaled + dayWScaled / 2 - el.clientWidth / 2;
      el.scrollLeft = clamp(left, 0, el.scrollWidth - el.clientWidth);
   }, [visibleDaysForAll, DAY_W_BASE, zoom, date]);

   // Unic listener de wheel: pinch-zoom + Y→X și recalc la scroll
   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;

      const onWheel = (e) => {
         // 1) pinch/gesture zoom (Ctrl/⌘/Alt)
         if (e.ctrlKey || e.metaKey || e.altKey) {
            e.preventDefault();
            const factor = Math.pow(1.0035, -e.deltaY);
            const clientX =
               e.clientX ??
               el.getBoundingClientRect().left + el.clientWidth / 2;
            zoomAt(factor, clientX);
            return;
         }

         // 2) interacțiune manuală => oprește auto-center/snap
         if (suspendFlagsRef?.current) {
            suspendFlagsRef.current.centerOnDateNextTick = false;
            suspendFlagsRef.current.suspendAutoJump = true;
            suspendFlagsRef.current.suspendScrollSnap = true;
         }

         // 3) mapare Y → X (dar acceptăm X nativ)
         const dx =
            Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
         el.scrollLeft += dx / (getZoom() || 1);

         e.preventDefault();
         e.stopPropagation();
      };

      const onScroll = () => {
         if (suspendFlagsRef?.current) {
            suspendFlagsRef.current.centerOnDateNextTick = false;
         }
         // NU recalculăm fereastra în timpul interacțiunii (evită micro “agațări”)
         if (!suspendFlagsRef?.current?.isInteracting) recalcWindow();
      };

      el.addEventListener("wheel", onWheel, { passive: false });
      el.addEventListener("scroll", onScroll, { passive: true });
      return () => {
         el.removeEventListener("wheel", onWheel);
         el.removeEventListener("scroll", onScroll);
      };
   }, [getZoom, zoomAt, recalcWindow]);

   // Recalc și la zoom
   useEffect(() => {
      recalcWindow();
   }, [zoom, recalcWindow]);

   /* ===== Pan inertial ===== */
   useInertialPan(scrollRef, {
      suspendFlagsRef,
      shouldIgnore: isInteractiveTarget,
      pixelScaleX: zoom,
      pixelScaleY: 1,
   });

   /* ===== Centrare utilitar ===== */
   useEffect(() => {
      __DV_NAV_STATE__.centerOnDateNextTick = true;
   }, []);
   const centerDayHorizontally = useCallback(
      (targetDate) => {
         const el = scrollRef.current;
         if (!el || !visibleDaysForAll.length) return;
         const ts = startOfDayTs(targetDate);
         let idx = visibleDaysForAll.findIndex((d) => startOfDayTs(d) === ts);
         if (idx === -1) {
            idx = visibleDaysForAll.findIndex((d) => startOfDayTs(d) >= ts);
            if (idx === -1) idx = visibleDaysForAll.length - 1;
         }
         const dayWScaled = DAY_W_BASE * zoom;
         const left = idx * dayWScaled + dayWScaled / 2 - el.clientWidth / 2;
         el.scrollLeft = clamp(left, 0, el.scrollWidth - el.clientWidth);
         recalcWindow();
      },
      [visibleDaysForAll, DAY_W_BASE, zoom, recalcWindow]
   );
   useEffect(() => {
      if (!visibleDaysForAll.length) return;
      if (!__DV_NAV_STATE__.centerOnDateNextTick) return;
      const id = requestAnimationFrame(() => {
         centerDayHorizontally(date);
         __DV_NAV_STATE__.centerOnDateNextTick = false;
         const el = scrollRef.current;
         if (el) el.dispatchEvent(new Event("scroll"));
      });
      return () => cancelAnimationFrame(id);
   }, [date, visibleDaysForAll.length, centerDayHorizontally]);

   /* ===== Cache pentru sloturi per-zi ===== */
   const slotsCacheRef = useRef(new Map());
   const getSlotsForTs = useCallback(
      (ts) => {
         let v = slotsCacheRef.current.get(ts);
         if (!v) {
            v = mkStandardSlotsForDay(new Date(ts));
            slotsCacheRef.current.set(ts, v);
         }
         return v;
      },
      [mkStandardSlotsForDay]
   );

   /* ===== Build UI zi ===== */
   const buildUiDay = useCallback(
      (day) => {
         const ts = startOfDayTs(day);
         const dayEventsRaw = eventsByDay.get(ts) || [];

         const filtered = dayEventsRaw.filter((ev) => {
            const iid = String(ev.instructorId ?? "__unknown");
            const sectorOk =
               !allowedInstBySector || allowedInstBySector.has(iid);
            return sectorOk && (anyTokens ? eventMatchesAllTokens(ev) : true);
         });

         // Fallback: dacă instructorii nu au sosit încă, derivăm coloanele din rezervări
         const baseInstructors = instructors?.length
            ? instructors
            : filtered.map((e) => ({ id: e.instructorId }));

         const instSet = new Set(
            (baseInstructors || [])
               .map((i) => String(i.id))
               .filter(
                  (iid) => !allowedInstBySector || allowedInstBySector.has(iid)
               )
         );

         const { orderedIds, rows } = computeOrderedInstIdsForDay(
            instSet,
            day,
            maxColsPerGroup
         );

         let idsForRender = orderedIds;
         if ((!idsForRender || !idsForRender.length) && filtered.length) {
            idsForRender = Array.from(
               new Set(
                  filtered.map((e) => String(e.instructorId ?? "__unknown"))
               )
            );
         }

         const instructorsForDay = (
            idsForRender.length ? idsForRender : ["__pad_0_0"]
         ).map((iid) => {
            const name =
               instructorMeta.get(iid)?.name ||
               (iid === "__pad_0_0" ? "" : "Necunoscut");
            const events =
               iid === "__pad_0_0"
                  ? []
                  : filtered
                       .filter(
                          (e) => String(e.instructorId ?? "__unknown") === iid
                       )
                       .sort((a, b) => a.start - b.start);
            return { inst: { id: iid, name }, events };
         });

         return {
            id: `day_${ts}`,
            date: day,
            name: new Intl.DateTimeFormat("ro-RO", {
               weekday: "short",
               day: "2-digit",
               month: "short",
            })
               .format(new Date(day))
               .replace(",", ""),
            instructors: instructorsForDay,
            rowsCount: Math.max(1, rows),
         };
      },
      [
         eventsByDay,
         allowedInstBySector,
         anyTokens,
         eventMatchesAllTokens,
         computeOrderedInstIdsForDay,
         maxColsPerGroup,
         instructorMeta,
         instructors,
      ]
   );

   /* ======== BLACKOUTS (outline vizual pentru evenimente) ======== */
   // Helpers TZ (compatibile cu AAddProg)
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
   function localKeyFromTs(tsMs, tz = MOLDOVA_TZ) {
      return `${ymdStrInTZ(tsMs, tz)}|${hhmmInTZ(tsMs, tz)}`;
   }
   function busyLocalKeyFromStored(st) {
      const d = new Date(st);
      const offMin = tzOffsetMinutesAt(d.getTime(), MOLDOVA_TZ);
      const base = new Date(d.getTime() - offMin * 60000);
      return localKeyFromTs(base.getTime(), MOLDOVA_TZ);
   }
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

   // 1) Cheile permise în fereastra vizibilă
   const fromIdx = Math.max(0, win.from);
   const toIdx = Math.max(fromIdx, win.to);
   const allowedKeysSet = useMemo(() => {
      const set = new Set();
      for (let i = fromIdx; i <= toIdx; i++) {
         const d = visibleDaysForAll[i];
         if (!d) continue;
         const ts = startOfDayTs(d);
         const slots = getSlotsForTs(ts);
         for (const s of slots) set.add(localKeyFromTs(s.start));
      }
      return set;
   }, [fromIdx, toIdx, visibleDaysForAll, getSlotsForTs]);

   // 2) Cache: instructorId -> Set(localKeys)
   const blackoutKeyMapRef = useRef(new Map()); // Map<string, Set<string>>
   const [blackoutVer, setBlackoutVer] = useState(0);

   // 3) Instructorii din fereastra curentă
   const instIdsInWindow = useMemo(() => {
      const ids = new Set();
      for (let i = fromIdx; i <= toIdx; i++) {
         const day = buildUiDay(visibleDaysForAll[i]);
         (day?.instructors || []).forEach(({ inst }) => {
            const iid = String(inst?.id || "");
            if (!iid.startsWith("__pad_")) ids.add(iid);
         });
      }
      return Array.from(ids);
   }, [fromIdx, toIdx, visibleDaysForAll, buildUiDay]);

   // 4) Load lazy pentru fiecare instructor
   const ensureBlackoutsFor = useCallback(
      async (instId) => {
         const key = String(instId);
         if (blackoutKeyMapRef.current.has(key)) return;
         try {
            const list = await getInstructorBlackouts(key);
            const set = new Set();
            for (const b of list || []) {
               const type = String(b?.type || "").toUpperCase();
               if (type === "REPEAT") {
                  for (const k of expandRepeatLocalKeys(b, allowedKeysSet))
                     set.add(k);
               } else {
                  const dt = getBlackoutDT(b);
                  if (!dt) continue;
                  const k = busyLocalKeyFromStored(dt);
                  if (!allowedKeysSet.size || allowedKeysSet.has(k)) set.add(k);
               }
            }
            blackoutKeyMapRef.current.set(key, set);
            setBlackoutVer((v) => v + 1);
         } catch {}
      },
      [allowedKeysSet]
   );

   useEffect(() => {
      instIdsInWindow.forEach((iid) => {
         ensureBlackoutsFor(iid);
      });
   }, [instIdsInWindow, ensureBlackoutsFor]);

   /* ===== Toolbar / handlers ===== */
   const [editMode, setEditMode] = useState(false);
   const handleManualRefresh = useCallback(() => {
      // Poți evita refresh-ul dacă userul interacționează
      if (!suspendFlagsRef.current?.isInteracting) {
         dispatch(fetchReservationsDelta());
      }
   }, [dispatch]);
   const openReservationOnDbl = useCallback(
      (reservationId) => {
         if (editMode) return;
         openPopup("reservationEdit", { reservationId });
      },
      [editMode]
   );
   const createFromEmptyOnDbl = useCallback(
      (ev) => {
         if (editMode) return;
         handleCreateFromEmpty(ev);
      },
      [editMode]
   );

   const showFullToolbar = !isMobile && !compact;

   /* ================= Render ================= */
   const count = visibleDaysForAll.length;

   return (
      <div
         className={`dayview${editMode ? " edit-mode" : ""}`}
         style={{ ...layoutVars, height: CONTAINER_H }}
      >
         {/* Header */}
         <div className="dayview__header">
            <div
               className="dayview__header-left"
               style={{ display: "flex", gap: 8 }}
            >
               {props.onBackToMonth && (
                  <button
                     className="dv-btn dv-back"
                     onClick={props.onBackToMonth}
                     title="Înapoi la Lună"
                     aria-label="Înapoi la Lună"
                  >
                     <ReactSVG className="rbc-btn-group__icon" src={arrow} />
                  </button>
               )}

               {/* Toggle sector: Toate / Botanica / Ciocana */}
               <button
                  className={`dv-btn dv-sector-toggle ${
                     sectorFilter === "Botanica"
                        ? "is-botanica"
                        : sectorFilter === "Ciocana"
                        ? "is-ciocana"
                        : "is-all"
                  }`}
                  onClick={() =>
                     setSectorFilter((v) =>
                        v === "Toate"
                           ? "Botanica"
                           : v === "Botanica"
                           ? "Ciocana"
                           : "Toate"
                     )
                  }
                  title="Comută sectorul (Toate/Botanica/Ciocana)"
                  style={{ minWidth: 64 }}
               >
                  {sectorFilter === "Toate"
                     ? "All"
                     : sectorFilter === "Botanica"
                     ? "Bot."
                     : "Cio."}
               </button>
            </div>

            {/* Toolbar */}
            {showFullToolbar ? (
               <div
                  className="dayview__toolbar"
                  style={{ display: "flex", gap: 8 }}
               >
                  <input
                     className="dv-search__input"
                     placeholder={
                        dataReady
                           ? "Caută: ion 09:00 MD-ABC ..."
                           : "Se încarcă programările…"
                     }
                     disabled={!dataReady}
                     value={query}
                     onChange={(e) => setQuery(e.target.value)}
                  />
                  <button
                     className="dv-btn"
                     onClick={(e) => zoomAt(1 / 1.3, e?.clientX)}
                     title="Zoom out"
                  >
                     −
                  </button>
                  <button
                     className="dv-btn"
                     onClick={(e) => zoomAt(1.3, e?.clientX)}
                     title="Zoom in"
                  >
                     +
                  </button>
                  <button
                     className={`dv-btn ${editMode ? "dv-btn--active" : ""}`}
                     onClick={() => setEditMode((v) => !v)}
                     title="Editează pozițiile instructorilor"
                  >
                     <ReactSVG
                        className="groups__icon react-icon"
                        src={editIcon}
                     />
                  </button>
                  <button
                     className="dv-btn reset"
                     onClick={handleManualRefresh}
                     title="Reîmprospătează (delta)"
                  >
                     <ReactSVG
                        className="groups__icon react-icon"
                        src={refreshIcon}
                     />
                  </button>
               </div>
            ) : (
               <div
                  className="dayview__toolbar-compact"
                  style={{
                     position: "relative",
                     display: "flex",
                     gap: 8,
                     alignItems: "center",
                     width: "100%",
                  }}
               >
                  <input
                     className="dv-search__input dv-search__input--mobile"
                     style={{ flex: 1, minWidth: 120 }}
                     placeholder={
                        dataReady ? "Caută…" : "Se încarcă programările…"
                     }
                     disabled={!dataReady}
                     value={query}
                     onChange={(e) => setQuery(e.target.value)}
                  />
                  <div ref={mobileMenuRef} style={{ position: "relative" }}>
                     <button
                        className="dv-btn"
                        onClick={() => setMobileMenuOpen((v) => !v)}
                        title="Meniu"
                        aria-label="Meniu"
                     >
                        ⋮
                     </button>
                     {mobileMenuOpen && (
                        <div
                           className="dv-mobile-menu"
                           style={{
                              position: "absolute",
                              right: 0,
                              top: "100%",
                              marginTop: 8,
                              padding: 8,
                              borderRadius: 12,
                              display: "grid",
                              gridAutoFlow: "column",
                              gap: 8,
                              background: "var(--panel-bg, rgba(0,0,0,0.7))",
                              backdropFilter: "blur(6px)",
                              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                              zIndex: 5,
                           }}
                        >
                           <button
                              className="dv-btn"
                              onClick={(e) => {
                                 zoomAt(1 / 1.3, e?.clientX);
                                 setMobileMenuOpen(false);
                              }}
                              title="Zoom out"
                           >
                              −
                           </button>
                           <button
                              className="dv-btn"
                              onClick={(e) => {
                                 zoomAt(1.3, e?.clientX);
                                 setMobileMenuOpen(false);
                              }}
                              title="Zoom in"
                           >
                              +
                           </button>
                           <button
                              className={`dv-btn ${
                                 editMode ? "dv-btn--active" : ""
                              }`}
                              onClick={() => {
                                 setEditMode((v) => !v);
                                 setMobileMenuOpen(false);
                              }}
                              title="Editează pozițiile"
                           >
                              <ReactSVG
                                 className="groups__icon react-icon"
                                 src={editIcon}
                              />
                           </button>
                           <button
                              className="dv-btn reset"
                              onClick={() => {
                                 handleManualRefresh();
                                 setMobileMenuOpen(false);
                              }}
                              title="Reîmprospătează"
                           >
                              <ReactSVG
                                 className="groups__icon react-icon"
                                 src={refreshIcon}
                              />
                           </button>
                        </div>
                     )}
                  </div>
               </div>
            )}
         </div>

         {/* Track */}
         <div
            className="dayview__row dv-pan"
            ref={scrollRef}
            style={{
               touchAction: "pan-x",
               height: rowHeight ? `${rowHeight}px` : undefined,
               overflowX: "auto",
               overflowY: "hidden",
               overscrollBehavior: "contain",
               cursor: "grab",
               WebkitUserDrag: "none",
               userSelect: "none",
            }}
         >
            <div
               className="dayview__track"
               style={{
                  position: "relative",
                  width: contentW * zoom,
                  height: "100%",
               }}
            >
               <div
                  className="dv-scale"
                  style={{
                     position: "relative",
                     width: contentW,
                     height: "100%",
                     transform: `scale(${zoom})`,
                     transformOrigin: "0 0",
                     willChange: "transform",
                  }}
               >
                  {/* Randăm DOAR zilele [from..to], poziționate absolut */}
                  {count > 0 &&
                     Array.from(
                        { length: toIdx - fromIdx + 1 },
                        (_, k) => fromIdx + k
                     ).map((absIdx) => {
                        const d = visibleDaysForAll[absIdx];
                        const ts = startOfDayTs(d);
                        const day = buildUiDay(d);
                        const slots = getSlotsForTs(ts);
                        const rows = toRowsOfN(
                           day.instructors || [],
                           maxColsPerGroup,
                           true
                        );

                        return (
                           <section
                              key={day.id}
                              className="dayview__group-wrap cv-auto"
                              style={{
                                 position: "absolute",
                                 left:
                                    absIdx * (baseMetrics.dayWidth + 12 + 32),
                                 top: 0,
                                 width: `${baseMetrics.dayWidth + 12}px`,
                                 "--cols": maxColsPerGroup,
                                 "--colw": `calc(${COL_W})`,
                                 flex: "0 0 auto",
                                 contentVisibility: "auto",
                                 containIntrinsicSize: "auto 1000px",
                                 contain: "layout style paint size",
                              }}
                              aria-label={day.name}
                              data-dayid={day.id}
                              data-active="1"
                           >
                              <header className="dayview__group-header">
                                 <div className="dayview__group-title">
                                    {day.name}
                                 </div>
                              </header>

                              {rows.map((row, rowIdxLocal) => (
                                 <div
                                    key={`${day.id}__block__${rowIdxLocal}`}
                                    className="dayview__block"
                                    style={{
                                       marginTop: rowIdxLocal ? 32 : 0,
                                    }}
                                 >
                                    <div className="dayview__group-content dayview__group-content--row">
                                       <div
                                          className="dayview__columns"
                                          style={{ "--cols": 3 }}
                                       >
                                          {row.map(
                                             ({ inst, events }, colIdx) => {
                                                const filteredEvents = anyTokens
                                                   ? events.filter(
                                                        eventMatchesAllTokens
                                                     )
                                                   : events;

                                                // cheie ieftină pentru listă evenimente
                                                const first = filteredEvents[0];
                                                const last =
                                                   filteredEvents[
                                                      filteredEvents.length - 1
                                                   ];
                                                const eventsKey =
                                                   filteredEvents.length +
                                                   ":" +
                                                   (first?.id ?? "") +
                                                   ":" +
                                                   (last?.id ?? "") +
                                                   ":" +
                                                   (first?.start?.getTime?.() ??
                                                      "") +
                                                   ":" +
                                                   (last?.start?.getTime?.() ??
                                                      "");

                                                return (
                                                   <MemoInstructorColumn
                                                      key={`${day.id}-${inst.id}-${colIdx}`}
                                                      day={day}
                                                      inst={inst}
                                                      events={filteredEvents}
                                                      eventsKey={eventsKey}
                                                      slots={slots}
                                                      editMode={editMode}
                                                      instructorMeta={
                                                         instructorMeta
                                                      }
                                                      instructorsGroups={
                                                         instructorsGroups
                                                      }
                                                      highlightTokens={
                                                         highlightTokens
                                                      }
                                                      tokensKey={tokensKey}
                                                      getOrderStringForInst={
                                                         getOrderStringForInst
                                                      }
                                                      getPosGeneric={
                                                         getPosGeneric
                                                      }
                                                      getDayOnlyPos={
                                                         getDayOnlyPos
                                                      }
                                                      nudgeInstructor={
                                                         nudgeInstructor
                                                      }
                                                      rowIdxLocal={rowIdxLocal}
                                                      colIdx={colIdx}
                                                      rowsCount={day.rowsCount}
                                                      onOpenReservation={
                                                         openReservationOnDbl
                                                      }
                                                      onCreateFromEmpty={
                                                         createFromEmptyOnDbl
                                                      }
                                                      blockedKeySet={
                                                         blackoutKeyMapRef.current.get(
                                                            String(inst.id)
                                                         ) || null
                                                      } // ⬅️ NOU
                                                      blackoutVer={blackoutVer} // ⬅️ NOU
                                                   />
                                                );
                                             }
                                          )}
                                       </div>
                                    </div>
                                 </div>
                              ))}
                           </section>
                        );
                     })}
               </div>
            </div>
         </div>
      </div>
   );
}

/* ===== Navigație ===== */
CustomDayViewOptimized.navigate = (date, action) => {
   const d = new Date(date);
   const startOf = (x) =>
      new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();

   const hasQuery =
      !!__DV_NAV_STATE__.queryKey &&
      (__DV_NAV_STATE__.matchDays?.length || 0) > 0;

   const all = __DV_NAV_STATE__.allDaysSorted || [];
   const list =
      hasQuery && __DV_NAV_STATE__.matchDays?.length
         ? __DV_NAV_STATE__.matchDays.slice().sort((a, b) => a - b)
         : all.slice();

   if (!list.length) {
      switch (String(action)) {
         case "TODAY":
            return new Date();
         case "PREV":
            return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
         case "NEXT":
            return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
         default:
            return d;
      }
   }

   const curTs = startOf(d);
   if (String(action) === "NEXT") {
      const nextTs = list.find((ts) => ts > curTs) ?? list[list.length - 1];
      const out = new Date(nextTs);
      __DV_NAV_STATE__.suspendAutoJump = true;
      __DV_NAV_STATE__.centerOnDateNextTick = true;
      return out;
   }
   if (String(action) === "PREV") {
      let prevTs = list[0];
      for (let i = list.length - 1; i >= 0; i--) {
         if (list[i] < curTs) {
            prevTs = list[i];
            break;
         }
      }
      const out = new Date(prevTs);
      __DV_NAV_STATE__.suspendAutoJump = true;
      __DV_NAV_STATE__.centerOnDateNextTick = true;
      return out;
   }
   if (String(action) === "TODAY") {
      __DV_NAV_STATE__.centerOnDateNextTick = true;
      return new Date();
   }
   return d;
};

CustomDayViewOptimized.title = (date, { localizer } = {}) => {
   if (localizer && typeof localizer.format === "function") {
      return localizer.format(date, "ddd, DD MMM");
   }
   return new Date(date).toLocaleDateString("ro-RO", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
   });
};
