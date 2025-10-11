// src/components/Calendar/CustomDayView.jsx
import React, {
   useMemo,
   useEffect,
   useState,
   useCallback,
   useRef,
   useDeferredValue,
   useLayoutEffect,
} from "react";

import { useDispatch, useSelector, shallowEqual } from "react-redux";
import { fetchInstructorsGroups } from "../../store/instructorsGroupSlice";
import { fetchCars } from "../../store/carsSlice";
import { fetchAllReservations } from "../../store/reservationsSlice";
import { fetchStudents } from "../../store/studentsSlice";
import { openPopup } from "../Utils/popupStore";

import { ReactSVG } from "react-svg";
import refreshIcon from "../../assets/svg/grommet-icons--power-reset.svg";
import editIcon from "../../assets/svg/material-symbols--edit-outline-sharp.svg";

import useInertialPan from "./Calendar/useInertialPan";
import usePinchZoom from "./Calendar/usePinchZoom";
import useCalendarAutoRefresh from "./Calendar/useCalendarAutoRefresh";
import DayWindow from "./Calendar/DayWindow";
import { fetchUsers } from "../../store/usersSlice";
import { updateInstructorOrder } from "../../store/instructorsSlice";

/* ====== NAV STATE GLOBAL ====== */
let __DV_NAV_STATE__ = {
   matchDays: [],
   queryKey: "",
   suspendAutoJump: false,
   suspendScrollSnap: false,
   snappedForKey: "",
   centerOnDateNextTick: false,
};
if (typeof window !== "undefined") {
   window.__DV_NAV_STATE__ = window.__DV_NAV_STATE__ || __DV_NAV_STATE__;
   __DV_NAV_STATE__ = window.__DV_NAV_STATE__;
}

/* Helpers */
function startOfDayTs(d) {
   const x = new Date(d);
   return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
}
const DAY_MS = 24 * 60 * 60 * 1000;
/* ——— parse “floating”: păstrează HH:mm exact din string, ignoră Z/offset ——— */
function toFloatingDate(val) {
   if (!val) return null;

   if (val instanceof Date && !isNaN(val)) {
      return new Date(
         val.getFullYear(),
         val.getMonth(),
         val.getDate(),
         val.getHours(),
         val.getMinutes(),
         val.getSeconds(),
         val.getMilliseconds()
      );
   }

   if (typeof val === "string") {
      const m = val.match(
         /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+\-]\d{2}:\d{2})?$/
      );
      if (m) {
         const [, Y, Mo, D, h, mi, s] = m;
         return new Date(+Y, +Mo - 1, +D, +h, +mi, s ? +s : 0, 0);
      }
      const m2 = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m2) {
         const [, Y, Mo, D] = m2;
         return new Date(+Y, +Mo - 1, +D, 0, 0, 0, 0);
      }
   }

   const d = new Date(val);
   if (!isNaN(d)) {
      return new Date(
         d.getFullYear(),
         d.getMonth(),
         d.getDate(),
         d.getHours(),
         d.getMinutes(),
         d.getSeconds(),
         d.getMilliseconds()
      );
   }
   return null;
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

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

function buildHighlightRegex(parts, flags = "gi") {
   const list = Array.from(new Set(parts.filter(Boolean).map(escapeRegExp)));
   if (!list.length) return null;
   return new RegExp(`(${list.join("|")})`, flags);
}

// grupează în rânduri de N și, opțional, completează ultimul rând la N
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

/* ====== localStorage cache pt. order ====== */
function coerceOrderToTokens(orderStr) {
   if (!orderStr) return "";
   try {
      const obj = JSON.parse(orderStr);
      if (!obj || typeof obj !== "object") return orderStr;
      const tokens = [];
      if (obj.all && obj.all.x && obj.all.y) {
         tokens.push(`allx${obj.all.x}y${obj.all.y}`);
      }
      if (obj.days && typeof obj.days === "object") {
         Object.entries(obj.days).forEach(([k, v]) => {
            if (v && v.x && v.y) tokens.push(`${k}x${v.x}y${v.y}`);
         });
      }
      return tokens.join("|");
   } catch {
      return orderStr;
   }
}

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

// === requestIdleCallback polyfill ===
const rIC =
   typeof window !== "undefined" && window.requestIdleCallback
      ? window.requestIdleCallback
      : (cb) => setTimeout(() => cb({ timeRemaining: () => 10 }), 0);

export default function CustomDayView(props = {}) {
   const { onViewStudent } = props;
   const date = props.date ? new Date(props.date) : new Date();

   const scrollRef = useRef(null);

   // RANGE COMPLET
   const [rangeStartTs, setRangeStartTs] = useState(startOfDayTs(date));
   const [rangeDays, setRangeDays] = useState(1);
   const [editMode, setEditMode] = useState(false);

   // order overrides
   const [orderOverrides, setOrderOverrides] = useState(() => loadOrderCache());

   useEffect(() => {
      saveOrderCache(orderOverrides);
      dayCacheRef.current.clear();
   }, [orderOverrides]);

   const visibleDays = useMemo(
      () =>
         Array.from(
            { length: rangeDays },
            (_, i) => new Date(rangeStartTs + i * DAY_MS)
         ),
      [rangeStartTs, rangeDays]
   );

   useEffect(() => {
      const ts = startOfDayTs(date);
      if (ts < rangeStartTs || ts > rangeStartTs + (rangeDays - 1) * DAY_MS) {
         setRangeStartTs(ts);
      }
   }, [date, rangeStartTs, rangeDays]);

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

   // === ZOOM (instant) ============================================
   const [zoom, setZoom] = useState(1);
   const Z_MIN = 0.3,
      Z_MAX = 3.0;

   const setZoomClamped = useCallback((val) => {
      const z = Math.max(Z_MIN, Math.min(Z_MAX, val));
      setZoom(z);
      return z;
   }, []);

   const getZoom = useCallback(() => zoom, [zoom]);

   const zoomAtPoint = useCallback(
      (newZ, clientX) => {
         const el = scrollRef.current;
         if (!el) {
            setZoomClamped(newZ);
            return;
         }
         const oldZ = zoom;
         const z = setZoomClamped(newZ);
         const s = z / oldZ;

         const rect = el.getBoundingClientRect();
         const x = (clientX ?? rect.left + el.clientWidth / 2) - rect.left;
         el.scrollLeft = (el.scrollLeft + x) * s - x;
      },
      [zoom, setZoomClamped]
   );

   const incZoom = useCallback(
      (e) => {
         const mult = 1.3;
         zoomAtPoint(zoom * mult, e?.clientX);
      },
      [zoom, zoomAtPoint]
   );

   const decZoom = useCallback(
      (e) => {
         const mult = 1.3;
         zoomAtPoint(zoom / mult, e?.clientX);
      },
      [zoom, zoomAtPoint]
   );

   const resetZoom = useCallback(
      (e) => zoomAtPoint(1, e?.clientX),
      [zoomAtPoint]
   );

   // zoom ancorat pe poziția mouse-ului (pentru wheel/pinch)
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
      const el = scrollRef.current;
      if (!el) return;

      const wheelHandler = (e) => {
         if (e.ctrlKey || e.metaKey || e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            const factor = Math.pow(1.0035, -e.deltaY);
            const clientX =
               e.clientX ??
               el.getBoundingClientRect().left + el.clientWidth / 2;
            zoomAt(factor, clientX);
            return;
         }
      };

      el.addEventListener("wheel", wheelHandler, { passive: false });
      return () => el.removeEventListener("wheel", wheelHandler);
   }, [zoomAt]);

   const [sectorFilter, setSectorFilter] = useState("Botanica");
   const sectorFilterNorm = sectorFilter.toLowerCase();
   const eventMatchesSector = useCallback(
      (ev) => {
         const s = (ev?.sector || "").toString().trim().toLowerCase();
         if (!s) return true;
         return s === sectorFilterNorm;
      },
      [sectorFilterNorm]
   );

   // === ORDER ENCODING (compact iN + compat x/y) ==================
   const ORDER_SEP = "|";
   const COLS = 3;

   const dateKey = (d) => {
      const x = new Date(d);
      return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(
         2,
         "0"
      )}${String(x.getDate()).padStart(2, "0")}`;
   };

   const month3 = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      mai: "05",
      jun: "06",
      iun: "06",
      jul: "07",
      iul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      noi: "11",
      dec: "12",
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

   function parseOrderToken(tok) {
      const s = String(tok || "").trim();
      if (!s) return null;

      let m = /^(\d{4})(\d{2})(\d{2})i(\d+)$/i.exec(s);
      if (m)
         return { kind: "day", key: `${m[1]}${m[2]}${m[3]}`, i: Number(m[4]) };

      m = /^(\d{1,2})([a-z]{3})(\d{4})i(\d+)$/i.exec(s);
      if (m) {
         const dd = String(m[1]).padStart(2, "0");
         const mm = month3[m[2].toLowerCase()] || "01";
         return { kind: "day", key: `${m[3]}${mm}${dd}`, i: Number(m[4]) };
      }

      m = /^(all|def)i(\d+)$/i.exec(s);
      if (m) return { kind: "all", key: "ALL", i: Number(m[2]) };

      m = /^(\d{4})(\d{2})(\d{2})x(\d+)y(\d+)$/i.exec(s);
      if (m) {
         const x = Number(m[4]),
            y = Number(m[5]);
         return { kind: "day", key: `${m[1]}${m[2]}${m[3]}`, i: xyToIdx(x, y) };
      }

      m = /^(\d{1,2})([a-z]{3})(\d{4})x(\d+)y(\d+)$/i.exec(s);
      if (m) {
         const dd = String(m[1]).padStart(2, "0");
         const mm = month3[m[2].toLowerCase()] || "01";
         const x = Number(m[4]),
            y = Number(m[5]);
         return { kind: "day", key: `${m[3]}${mm}${dd}`, i: xyToIdx(x, y) };
      }

      m = /^(all|def)x(\d+)y(\d+)$/i.exec(s);
      if (m) {
         const x = Number(m[2]),
            y = Number(m[3]);
         return { kind: "all", key: "ALL", i: xyToIdx(x, y) };
      }

      return null;
   }

   function getPosFromOrder(orderStr, d) {
      const key = dateKey(d);
      let allIdx = null;
      for (const tok of splitTokens(orderStr)) {
         const p = parseOrderToken(tok);
         if (!p) continue;
         if (p.kind === "day" && p.key === key) return idxToXY(p.i);
         if (p.kind === "all") allIdx = p.i;
      }
      return allIdx != null ? idxToXY(allIdx) : null;
   }

   function upsertPosInOrder(orderStr, d, x, y) {
      const key = dateKey(d);
      const nextTok = `${key}i${xyToIdx(x, y)}`;
      const out = [];
      let replaced = false;

      for (const tok of splitTokens(orderStr)) {
         const p = parseOrderToken(tok);
         if (p && p.kind === "day" && p.key === key) {
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

   function ensureAllToken(orderStr, x, y) {
      const nextTok = `alli${xyToIdx(x, y)}`;
      const out = [];
      let hadAll = false;

      for (const tok of splitTokens(orderStr)) {
         const p = parseOrderToken(tok);
         if (p && p.kind === "all") {
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

   // === DATA ======================================================
   const hasPrefetchedAllRef = useRef(false);
   useEffect(() => {
      if (hasPrefetchedAllRef.current) return;
      hasPrefetchedAllRef.current = true;
      (async () => {
         try {
            await Promise.all([
               dispatch(fetchInstructorsGroups()),
               dispatch(fetchStudents()),
               dispatch(fetchAllReservations({ scope: "all", pageSize: 5000 })),
               dispatch(fetchCars()),
               dispatch(fetchUsers()),
            ]);
         } finally {
         }
      })();
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

   const hiddenAbs = useMemo(
      () =>
         HIDDEN_INTERVALS.map(({ start, end }) => ({
            start: mkTime(start),
            end: mkTime(end),
         })),
      [HIDDEN_INTERVALS, mkTime]
   );

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
         for (const hi of hiddenAbs)
            if (overlapMinutes(start, end, hi.start, hi.end) > 0) return false;
         return true;
      });
   }, [timeMarks, mkTime, LESSON_MINUTES, dayStart, dayEnd, hiddenAbs]);

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

      // index: instructorId -> sector (din grup)
      const instSectorIndex = new Map();
      (instructorsGroups || []).forEach((g) => {
         const sectorRaw = g?.sector ?? g?.location ?? "";
         const sectorNorm = String(sectorRaw).trim().toLowerCase();
         (g?.instructors || []).forEach((ii) => {
            const idStr = String(ii?.id ?? ii);
            if (sectorNorm && !instSectorIndex.has(idStr)) {
               instSectorIndex.set(idStr, sectorNorm);
            }
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

         // sector din instructor sau fallback din grup
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
   // instructori per sector selectat
   const allowedInstBySector = useMemo(() => {
      const set = new Set();
      (instructors || []).forEach((i) => {
         const id = String(i.id);
         const s = instructorMeta.get(id)?.sectorNorm ?? "";
         if (s && s === sectorFilterNorm) set.add(id);
      });
      return set;
   }, [instructors, instructorMeta, sectorFilterNorm]);

   const getOrderStringForInst = useCallback(
      (instId) => {
         const id = String(instId);
         return orderOverrides[id] ?? instructorMeta.get(id)?.orderRaw ?? "";
      },
      [orderOverrides, instructorMeta]
   );

   // INITIAL ALL
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
      const calls = [];

      ids.forEach((iid, idx) => {
         const current = getOrderStringForInst(iid);
         if ((current || "").trim()) return;

         const x = (idx % maxColsPerGroup) + 1;
         const y = Math.floor(idx / maxColsPerGroup) + 1;
         const withAll = ensureAllJSON("", x, y);
         add[iid] = withAll;
         calls.push([iid, withAll]);
      });

      if (Object.keys(add).length) {
         setOrderOverrides((prev) => ({ ...prev, ...add }));
         calls.forEach(([iid, val]) =>
            props.onChangeInstructorOrder?.(iid, val)
         );
      }
   }, [instructors, getOrderStringForInst, props.onChangeInstructorOrder]);

   const setInstructorOrderForDate = useCallback(
      (instId, dayDate, x, y) => {
         const id = String(instId);
         const current = getOrderStringForInst(id);
         const updated = upsertPosGeneric(current, dayDate, x, y);

         // update instant în UI (override local + cache)
         setOrderOverrides((prev) => {
            const next = { ...prev, [id]: updated };
            saveOrderCache(next);
            return next;
         });

         // persistă în backend (folosim prop dacă a fost dată, altfel facem noi dispatch)
         if (props.onChangeInstructorOrder) {
            props.onChangeInstructorOrder(id, updated);
         } else {
            dispatch(updateInstructorOrder({ id, order: updated }));
         }
      },
      [getOrderStringForInst, props.onChangeInstructorOrder, dispatch]
   );

   const computeOrderedInstIdsForDay = useCallback(
      (allInstIds, dayDate, cols = 3) => {
         const ids = Array.from(allInstIds);
         const byId = (a, b) => {
            const na = Number(a),
               nb = Number(b);
            if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
            return String(a).localeCompare(String(b), undefined, {
               numeric: true,
            });
         };
         ids.sort(byId);

         let maxY = 1;
         for (const iid of ids) {
            const pos = getPosGeneric(getOrderStringForInst(iid), dayDate) || {
               x: (ids.indexOf(iid) % cols) + 1,
               y: Math.floor(ids.indexOf(iid) / cols) + 1,
            };
            if (pos && pos.x >= 1 && pos.y >= 1) maxY = Math.max(maxY, pos.y);
         }

         const rows = Math.max(Math.ceil(ids.length / cols) || 1, maxY);
         const totalSlots = rows * cols;
         const slots = new Array(totalSlots).fill(null);

         const placed = new Set();
         for (const iid of ids) {
            const pos = getPosGeneric(getOrderStringForInst(iid), dayDate);
            if (!pos) continue;
            const x = clamp(pos.x, 1, cols);
            const y = clamp(pos.y, 1, rows);
            const idx = (y - 1) * cols + (x - 1);
            if (slots[idx] == null) {
               slots[idx] = iid;
               placed.add(iid);
            }
         }

         for (const iid of ids) {
            if (placed.has(iid)) continue;
            const idx = slots.findIndex((v) => v == null);
            if (idx === -1) break;
            slots[idx] = iid;
            placed.add(iid);
         }

         const orderedIds = slots.filter(Boolean);
         return { orderedIds, rows };
      },
      [getOrderStringForInst]
   );

   const nudgeInstructor = useCallback(
      (instId, dayDate, dx, dy, fallbackX, fallbackY, rowsCount, cols = 3) => {
         const orderStr = getOrderStringForInst(instId);
         const cur = getPosGeneric(orderStr, dayDate) || {
            x: fallbackX,
            y: fallbackY,
         };

         const tx = clamp(cur.x + dx, 1, cols);
         const ty = clamp(cur.y + dy, 1, rowsCount);
         if (tx === cur.x && ty === cur.y) return;

         const allInstIds = new Set(
            (instructors || []).map((i) => String(i.id))
         );
         const { orderedIds } = computeOrderedInstIdsForDay(
            allInstIds,
            dayDate,
            cols
         );
         const targetIdx = (ty - 1) * cols + (tx - 1);
         const occupantId = orderedIds[targetIdx] || null;

         setInstructorOrderForDate(instId, dayDate, tx, ty);

         if (occupantId && String(occupantId) !== String(instId)) {
            setInstructorOrderForDate(occupantId, dayDate, cur.x, cur.y);
         }
      },
      [
         instructors,
         computeOrderedInstIdsForDay,
         getOrderStringForInst,
         setInstructorOrderForDate,
      ]
   );

   const visibleSlotCount = useMemo(
      () => mkStandardSlots().length,
      [mkStandardSlots]
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

   // === SEARCH ====================================================
   const [query, setQuery] = useState("");
   const deferredQuery = useDeferredValue(query);
   const parseToken = (raw) => {
      const t = String(raw || "").trim();
      if (!t) return null;

      // ignorăm eventuale "cheie:valoare" și detectăm automat
      const m = /^([a-zăâîșț]+)\s*:(.*)$/i.exec(t);
      const val = (m ? m[2] : t).trim();

      const valNorm = norm(val);
      const valDigits = digitsOnly(val);
      const valPlate = normPlate(val);
      const hasLetters = /[a-z]/i.test(val);
      const hasDigits = /\d/.test(val);

      const hasColonOrDot = /[:\.]/.test(val);
      const hasSuffixH = /h$/i.test(val);

      // Timp DOAR dacă are ":" sau "." sau "h" (ex: "8:", "8.3", "08:30", "8h")
      let hhmmPrefix = null;
      if (hasColonOrDot || hasSuffixH) {
         // normalizează la prefix HH:MM (acceptă și "8:", "8.3")
         if (/^\d{1,2}([:\.]\d{0,2})?$|^\d{1,2}h$/i.test(val)) {
            hhmmPrefix =
               val.includes(":") || val.includes(".")
                  ? val.replace(".", ":").padEnd(5, "0").slice(0, 5)
                  : `${String(val).replace(/[^\d]/g, "").padStart(2, "0")}:`;
         }
      }

      let kind = "text";
      if (hhmmPrefix) {
         kind = "time";
      } else if (hasLetters && hasDigits && valPlate.length >= 4) {
         // litere + cifre => probabil plăcuță
         kind = "plate";
      } else if (valDigits.length >= 2) {
         // 2+ cifre => căutăm subsecvența în numerele de telefon / plăcuțe
         kind = "digits";
      } else {
         kind = "text";
      }

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

   function highlightTokens(text) {
      if (!tokensRegex) return text;
      const s = String(text || "");
      const html = s.replace(tokensRegex, '<i class="highlight">$1</i>');
      return <span dangerouslySetInnerHTML={{ __html: html }} />;
   }

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
   // cache pentru facts (face căutarea mult mai rapidă)
   const factsCacheRef = useRef(new WeakMap());
   const getFacts = useCallback(
      (ev) => {
         let f = factsCacheRef.current.get(ev);
         if (f) return f;

         const inst = instructorMeta.get(String(ev.instructorId)) || {};
         const studentFull = `${ev.studentFirst || ""} ${
            ev.studentLast || ""
         }`.trim();

         f = {
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
         factsCacheRef.current.set(ev, f);
         return f;
      },
      [instructorMeta]
   );

   const eventMatchesAllTokens = useCallback(
      (ev) => {
         if (!anyTokens) return true;
         const facts = getFacts(ev);
         return tokens.every((t) => tokenHitsFacts(facts, t));
      },
      [anyTokens, tokens, getFacts]
   );

   // === LAZY HYDRATION ===
   const resByDayRef = useRef(new Map()); // ts -> Reservation[]
   const evByDayRef = useRef(new Map()); // ts -> Event[]
   const hydratedDaysRef = useRef(new Set()); // ts
   const dayCacheRef = useRef(new Map());
   const [hydrationVer, setHydrationVer] = useState(0);

   useEffect(() => {
      const next = new Map();
      for (const r of reservations || []) {
         const startRaw =
            r.startTime ??
            r.start ??
            r.startedAt ??
            r.start_at ??
            r.startDate ??
            r.start_date ??
            null;
         if (!startRaw) continue;
         const s = toFloatingDate(startRaw);
         const ts = new Date(
            s.getFullYear(),
            s.getMonth(),
            s.getDate()
         ).getTime();
         if (!next.has(ts)) next.set(ts, []);
         next.get(ts).push(r);
      }
      resByDayRef.current = next;
      setHydrationVer((v) => v + 1);
   }, [reservations]);

   const mapReservationToEvent = useCallback(
      (r) => {
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
         const instMetaLocal = instructorMeta.get(instIdStr);
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
                  r.status.toLowerCase().includes("confirm")) ??
               false
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
      [studentDict, instructorsGroups, instructorMeta]
   );

   // RANGE din rezervări brute
   useEffect(() => {
      const todayTs = startOfDayTs(new Date());
      const list = reservations || [];
      if (!list.length) {
         const PAD = 14;
         setRangeStartTs(todayTs - PAD * DAY_MS);
         setRangeDays(1 + PAD * 2);
         __DV_NAV_STATE__.centerOnDateNextTick = true;
         return;
      }
      let minTs = Infinity,
         maxTs = -Infinity;
      for (const r of list) {
         const sRaw =
            r.startTime ??
            r.start ??
            r.startedAt ??
            r.start_at ??
            r.startDate ??
            r.start_date ??
            null;
         if (!sRaw) continue;
         const s = toFloatingDate(sRaw);
         const ts = new Date(
            s.getFullYear(),
            s.getMonth(),
            s.getDate()
         ).getTime();
         if (ts < minTs) minTs = ts;
         if (ts > maxTs) maxTs = ts;
      }
      const PAD = 1;
      minTs -= PAD * DAY_MS;
      maxTs += PAD * DAY_MS;
      const days = Math.max(1, Math.floor((maxTs - minTs) / DAY_MS) + 1);
      setRangeStartTs(minTs);
      setRangeDays(days);
      __DV_NAV_STATE__.centerOnDateNextTick = true;
   }, [reservations]);

   // NAV state pentru search
   const anchorTsRef = useRef(null);
   const prevAnyTokensRef = useRef(false);
   const lastSectorRef = useRef(sectorFilter);

   useEffect(() => {
      const wasAny = prevAnyTokensRef.current;
      if (anyTokens && !wasAny) {
         anchorTsRef.current = startOfDayTs(date);
      } else if (!anyTokens && wasAny) {
         anchorTsRef.current = null;
      }
      prevAnyTokensRef.current = anyTokens;
   }, [anyTokens, date]);

   useEffect(() => {
      if (lastSectorRef.current !== sectorFilter) {
         lastSectorRef.current = sectorFilter;
         if (anyTokens) anchorTsRef.current = startOfDayTs(date);
      }
   }, [sectorFilter, anyTokens, date]);
   // 1) define buildMatchDays mai sus
   const buildMatchDays = useCallback(() => {
      if (!anyTokens) return [];
      const days = [];
      evByDayRef.current.forEach((events, ts) => {
         for (const ev of events) {
            const iid = String(ev.instructorId ?? "__unknown");
            if (allowedInstBySector.size && !allowedInstBySector.has(iid))
               continue;
            if (eventMatchesAllTokens(ev)) {
               days.push(ts);
               break;
            }
         }
      });
      days.sort((a, b) => a - b);
      return days;
   }, [anyTokens, allowedInstBySector, eventMatchesAllTokens, hydrationVer]);

   // 2) abia apoi folosește-l
   const [matchDaysLocal, setMatchDaysLocal] = useState([]);
   useEffect(() => {
      setMatchDaysLocal(anyTokens ? buildMatchDays() : []);
   }, [anyTokens, buildMatchDays]);

   const visibleDaysForRender = useMemo(() => {
      if (!anyTokens) return visibleDays;
      const set = new Set(matchDaysLocal);
      return visibleDays.filter((d) => set.has(startOfDayTs(d)));
   }, [visibleDays, anyTokens, matchDaysLocal]);

   useEffect(() => {
      const qKey = anyTokens
         ? tokens.map((t) => `${t.kind}:${t.raw}`).join("#") +
           `|${sectorFilter}`
         : "";
      const prevKey = __DV_NAV_STATE__.queryKey;
      __DV_NAV_STATE__.queryKey = qKey;
      __DV_NAV_STATE__.matchDays = anyTokens ? buildMatchDays() : [];
      if (qKey !== prevKey) {
         __DV_NAV_STATE__.suspendAutoJump = false;
         __DV_NAV_STATE__.suspendScrollSnap = false;
         __DV_NAV_STATE__.snappedForKey = "";
      }
   }, [anyTokens, tokens, sectorFilter, buildMatchDays]);

   const isInteractiveTarget = (el) =>
      !!el.closest?.(
         `.dv-move-pad,
  .dv-move-pad button,
  .dv-slot button,
  input, textarea, select, button, a`
      );

   function parseOrderStore(orderStr) {
      try {
         const obj = JSON.parse(orderStr);
         if (obj && (obj.days || obj.all)) return { kind: "json", obj };
      } catch {}
      return { kind: "tokens", str: orderStr || "" };
   }
   function getPosFromJSON(obj, d) {
      const k = dateKey(d);
      return (obj.days && obj.days[k]) || obj.all || null;
   }
   function getPosGeneric(orderStr, d) {
      const parsed = parseOrderStore(orderStr);
      if (parsed.kind === "json") return getPosFromJSON(parsed.obj, d);
      return getPosFromOrder(orderStr, d);
   }
   function getDayOnlyPos(orderStr, d) {
      const k = dateKey(d);
      const parsed = parseOrderStore(orderStr);
      if (parsed.kind === "json") {
         return (parsed.obj?.days && parsed.obj.days[k]) || null;
      }
      let out = null;
      const ORDER_SEP = "|";
      const splitTokens = (str) =>
         String(str || "")
            .split(ORDER_SEP)
            .map((t) => t.trim())
            .filter(Boolean);
      for (const tok of splitTokens(orderStr)) {
         const m = /^(\d{4})(\d{2})(\d{2})x(\d+)y(\d+)$/.exec(tok);
         if (m && `${m[1]}${m[2]}${m[3]}` === k) {
            out = { x: Number(m[4]), y: Number(m[5]) };
            break;
         }
      }
      return out;
   }
   function upsertPosInJSON(obj, d, x, y) {
      const k = dateKey(d);
      const base = obj || {};
      const next = {
         all: base.all || { x: 1, y: 1 },
         days: { ...(base.days || {}), [k]: { x, y } },
      };
      return JSON.stringify(next);
   }
   function ensureAllJSON(orderStr, x, y) {
      const parsed = parseOrderStore(orderStr);
      if (parsed.kind === "json") {
         const o = parsed.obj || {};
         if (o.all && o.all.x && o.all.y) return JSON.stringify(o);
         return JSON.stringify({ ...o, all: { x, y } });
      }
      return ensureAllToken(coerceOrderToTokens(orderStr), x, y);
   }
   function upsertPosGeneric(orderStr, d, x, y) {
      const parsed = parseOrderStore(orderStr);
      if (parsed.kind === "json") return upsertPosInJSON(parsed.obj, d, x, y);
      const tokens = coerceOrderToTokens(orderStr);
      return upsertPosInOrder(tokens, d, x, y);
   }

   const getAllPositionsForDay = useCallback(
      (dayDate, cols = 3) => {
         const allInstIds = new Set(
            (instructors || []).map((i) => String(i.id))
         );
         const { orderedIds, rows } = computeOrderedInstIdsForDay(
            allInstIds,
            dayDate,
            cols
         );

         const posMap = new Map();
         orderedIds.forEach((iid, idx) => {
            const specific = getPosGeneric(getOrderStringForInst(iid), dayDate);
            if (specific) {
               posMap.set(iid, specific);
            } else {
               const x = (idx % cols) + 1;
               const y = Math.floor(idx / cols) + 1;
               posMap.set(iid, { x, y });
            }
         });

         return { posMap, rows };
      },
      [
         instructors,
         computeOrderedInstIdsForDay,
         getPosGeneric,
         getOrderStringForInst,
      ]
   );

   const swapColumnsForDay = useCallback(
      (dayDate, fromX, toX, cols = 3) => {
         if (fromX === toX) return;
         const { posMap } = getAllPositionsForDay(dayDate, cols);
         posMap.forEach((pos, iid) => {
            if (pos.x === fromX) {
               setInstructorOrderForDate(iid, dayDate, toX, pos.y);
            } else if (pos.x === toX) {
               setInstructorOrderForDate(iid, dayDate, fromX, pos.y);
            }
         });
      },
      [getAllPositionsForDay, setInstructorOrderForDate]
   );

   // ===== Pan (inertial) + Pinch (scale) =========================
   const suspendFlagsRef = useRef(__DV_NAV_STATE__);
   useInertialPan(scrollRef, {
      suspendFlagsRef,
      shouldIgnore: isInteractiveTarget,
   });

   // Vars CSS de bază
   const layoutVars = {
      "--event-h": EVENT_H,
      "--hours-col-w": HOURS_COL_W,
      "--group-gap": GROUP_GAP,
      "--day-header-h": `44px`,
      "--row-header-h": `auto`,
      "--font-scale": 1,
   };

   const px = (v) => parseFloat(String(v || 0));

   // Base metrics
   const baseMetrics = useMemo(() => {
      const baseColw = px(COL_W);
      const baseSlot = px(SLOT_H);
      const baseDayWidth = maxColsPerGroup * baseColw;
      const baseRowHeight = 48 + visibleSlotCount * baseSlot;
      return {
         colw: baseColw,
         slot: baseSlot,
         dayWidth: baseDayWidth,
         rowHeight: baseRowHeight,
      };
   }, [COL_W, SLOT_H, maxColsPerGroup, visibleSlotCount]);

   const contentW = useMemo(
      () => visibleDaysForRender.length * (baseMetrics.dayWidth + DAY_GAP),
      [visibleDaysForRender.length, baseMetrics.dayWidth]
   );

   usePinchZoom({
      scrollRef,
      getZoom,
      setZoomClamped,
      getContentWidthPx: () => contentW * zoom,
   });

   const centerDayHorizontally = useCallback(
      (targetDate) => {
         const el = scrollRef.current;
         if (!el) return;

         const ts = startOfDayTs(targetDate);
         const idx = clamp(
            Math.round((ts - rangeStartTs) / DAY_MS),
            0,
            Math.max(0, rangeDays - 1)
         );

         const dayWScaled = (baseMetrics.dayWidth + DAY_GAP) * zoom;
         const left = idx * dayWScaled + dayWScaled / 2 - el.clientWidth / 2;
         el.scrollLeft = clamp(left, 0, el.scrollWidth - el.clientWidth);
      },
      [rangeStartTs, rangeDays, baseMetrics.dayWidth, zoom]
   );

   useEffect(() => {
      if (!visibleDaysForRender.length) return;
      if (!__DV_NAV_STATE__.centerOnDateNextTick) return;
      const id = requestAnimationFrame(() => {
         centerDayHorizontally(date);
         __DV_NAV_STATE__.centerOnDateNextTick = false;
         const el = scrollRef.current;
         if (el) el.dispatchEvent(new Event("scroll"));
      });
      return () => cancelAnimationFrame(id);
   }, [date, visibleDaysForRender.length, centerDayHorizontally]);

   // Window strip
   const DAY_W_BASE = baseMetrics.dayWidth + DAY_GAP;
   const DAY_W_SCALED = DAY_W_BASE * zoom;
   //const VIRTUALIZE = props.virtualize ?? true; // implici?t ON
   //const WINDOW = VIRTUALIZE ? 9 : visibleDays.length;
   const VIRTUALIZE = props.virtualize ?? false; // implicit ON
   const WINDOW = visibleDays.length;
   const HALF = Math.floor(WINDOW / 2);

   const [winStart, setWinStart] = useState(0);
   const prevScrollRef = useRef(0);
   const rAFRef = useRef(null);

   const { revalidate, onScrollIdle } = useCalendarAutoRefresh({
      rangeStartTs,
      rangeDays,
      winStart,
      WINDOW,
      deps: [sectorFilter, tokensRegex, zoom],
      refreshMs: 45000,
      scrollIdleMs: 500,
      backendSupportsWindow: true,
   });

   const handleScroll = useCallback(() => {
      if (!VIRTUALIZE) return;
      const el = scrollRef.current;
      if (!el || !visibleDays.length) return;

      prevScrollRef.current = el.scrollLeft;
      if (rAFRef.current) return;

      rAFRef.current = requestAnimationFrame(() => {
         rAFRef.current = null;
         const roughIdx = Math.floor(el.scrollLeft / DAY_W_SCALED);
         const nextStart = clamp(
            roughIdx - HALF,
            0,
            Math.max(0, visibleDays.length - WINDOW)
         );
         setWinStart((s) => (s === nextStart ? s : nextStart));
         onScrollIdle();
      });
   }, [
      VIRTUALIZE,
      visibleDays.length,
      DAY_W_SCALED,
      HALF,
      WINDOW,
      onScrollIdle,
   ]);

   useEffect(
      () => () => {
         if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
      },
      []
   );
   useLayoutEffect(() => {
      if (!VIRTUALIZE) return;
      const el = scrollRef.current;
      if (!el) return;
      el.scrollLeft = prevScrollRef.current;
   }, [VIRTUALIZE, winStart]);

   useEffect(() => {
      const map = new Map();
      const hydrated = new Set();
      const src = resByDayRef.current; // umplut în efectul de mai sus (grupare pe zile)
      src.forEach((raws, ts) => {
         const events = raws
            .map(mapReservationToEvent)
            .sort((a, b) => a.start - b.start);
         map.set(ts, events);
         hydrated.add(ts);
      });
      evByDayRef.current = map;
      hydratedDaysRef.current = hydrated;
      setHydrationVer((v) => v + 1);
   }, [mapReservationToEvent, reservations]);

   // buildUiDay
   const buildUiDay = useCallback(
      (day) => {
         const ts = startOfDayTs(day);
         const cacheKey = `${ts}|${__DV_NAV_STATE__.queryKey}|${sectorFilter}|v${hydrationVer}`;
         const cache = dayCacheRef.current;
         if (cache.has(cacheKey)) return cache.get(cacheKey);

         // evenimentele brute pentru zi
         const dayEventsRaw = evByDayRef.current.get(ts) || [];

         // 1) filtrăm pe sector (prin instructor) + 2) filtrăm pe căutare (dacă există)
         const filtered = dayEventsRaw.filter((ev) => {
            const iid = String(ev.instructorId ?? "__unknown");
            const sectorOk = allowedInstBySector.size
               ? allowedInstBySector.has(iid)
               : true;
            if (!sectorOk) return false;
            return anyTokens ? eventMatchesAllTokens(ev) : true;
         });

         // instructorii pe care îi arătăm în zi:
         // - la căutare: doar cei care au măcar un eveniment potrivit
         // - fără căutare: toți instructorii din sectorul curent
         const allInstIds = anyTokens
            ? new Set(
                 filtered.map((ev) => String(ev.instructorId ?? "__unknown"))
              )
            : allowedInstBySector;

         const { orderedIds, rows } = computeOrderedInstIdsForDay(
            allInstIds,
            day,
            maxColsPerGroup
         );

         const instructorsForDay = orderedIds.map((iid) => {
            const name = instructorMeta.get(iid)?.name || "Necunoscut";
            const events = filtered
               .filter((e) => String(e.instructorId ?? "__unknown") === iid)
               .sort((a, b) => a.start - b.start);
            return { inst: { id: iid, name }, events };
         });

         const built = {
            id: `day_${ts}`,
            date: day,
            hydrated: true,
            name: day.toLocaleDateString("ro-RO", {
               weekday: "long",
               day: "2-digit",
               month: "long",
               year: "numeric",
            }),
            instructors: instructorsForDay,
            rowsCount: rows,
         };

         cache.set(cacheKey, built);
         return built;
      },
      [
         anyTokens,
         allowedInstBySector,
         eventMatchesAllTokens,
         instructorMeta,
         computeOrderedInstIdsForDay,
         maxColsPerGroup,
         sectorFilter,
         hydrationVer,
      ]
   );

   useEffect(() => {
      dayCacheRef.current.clear();
   }, [__DV_NAV_STATE__.queryKey, sectorFilter, instructorMeta, instructors]);

   // handlers open/create
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

   return (
      <div
         className={`dayview${editMode ? " edit-mode" : ""}`}
         style={{ ...layoutVars, height: CONTAINER_H }}
      >
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
                     Bot.
                  </label>
                  <label>
                     <input
                        type="radio"
                        name="dv-sector"
                        value="Ciocana"
                        checked={sectorFilter === "Ciocana"}
                        onChange={(e) => setSectorFilter(e.target.value)}
                     />
                     Cio.
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
                  onClick={(e) => decZoom(e)}
                  title="Zoom out (Ctrl/⌘ + scroll jos)"
               >
                  −
               </button>
               <button
                  className="dv-btn"
                  onClick={(e) => incZoom(e)}
                  title="Zoom in (Ctrl/⌘ + scroll sus)"
               >
                  +
               </button>
               <button
                  className={`dv-btn ${editMode ? "dv-btn--active" : ""}`}
                  onClick={() => setEditMode((v) => !v)}
                  title="Editează pozițiile instructorilor"
               >
                  <ReactSVG
                     className={`groups__icon react-icon`}
                     src={editIcon}
                  />
               </button>
               <button className="dv-btn reset" onClick={revalidate}>
                  <ReactSVG
                     className={`groups__icon react-icon`}
                     src={refreshIcon}
                  />
               </button>
            </div>
         </div>

         <div
            className="dayview__row dv-pan"
            ref={scrollRef}
            style={{ touchAction: "pan-x" }}
            onScroll={handleScroll}
            onDragStart={(e) => e.preventDefault()}
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
                     width: contentW,
                     height: "100%",
                     transform: `scale(${zoom})`,
                     transformOrigin: "0 0",
                     willChange: "transform",
                  }}
               >
                  <DayWindow
                     visibleDays={visibleDaysForRender}
                     winStart={winStart}
                     WINDOW={WINDOW}
                     DAY_W={DAY_W_BASE}
                     DAY_GAP={DAY_GAP}
                     virtualize={VIRTUALIZE}
                     maxColsPerGroup={maxColsPerGroup}
                     COL_W={COL_W}
                     metrics={baseMetrics}
                     ROW_GAP={ROW_GAP}
                     toRowsOfN={toRowsOfN}
                     buildUiDay={buildUiDay}
                     mkStandardSlotsForDay={mkStandardSlotsForDay}
                     instructorMeta={instructorMeta}
                     instructorsGroups={instructorsGroups}
                     editMode={editMode}
                     swapColumnsForDay={swapColumnsForDay}
                     highlightTokens={highlightTokens}
                     tokens={tokens}
                     getOrderStringForInst={getOrderStringForInst}
                     getPosGeneric={getPosGeneric}
                     getDayOnlyPos={getDayOnlyPos}
                     nudgeInstructor={nudgeInstructor}
                     onOpenReservation={openReservationOnDbl}
                     onCreateFromEmpty={createFromEmptyOnDbl}
                  />
               </div>
            </div>
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
      let out;
      switch (String(action)) {
         case "TODAY":
            out = new Date();
            break;
         case "PREV":
            out = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
            break;
         case "NEXT":
            out = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
            break;
         default:
            out = d;
      }
      __DV_NAV_STATE__.centerOnDateNextTick = true;
      return out;
   }

   const curTs = startOf(d);
   const list = __DV_NAV_STATE__.matchDays.slice().sort((a, b) => a - b);

   if (String(action) === "NEXT") {
      const nextTs = list.find((ts) => ts > curTs) ?? null;
      if (nextTs != null) {
         __DV_NAV_STATE__.suspendAutoJump = true;
         __DV_NAV_STATE__.centerOnDateNextTick = true;
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
         __DV_NAV_STATE__.centerOnDateNextTick = true;
         return new Date(prevTs);
      }
      return d;
   }
   if (String(action) === "TODAY") {
      __DV_NAV_STATE__.centerOnDateNextTick = true;
      return new Date();
   }
   return d;
};

CustomDayView.title = (date, { localizer } = {}) => {
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
