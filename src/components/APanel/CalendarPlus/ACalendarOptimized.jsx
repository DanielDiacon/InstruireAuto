// src/components/APanel/CalendarPlus/ACalendarOptimized.jsx
import React, {
   startTransition,
   useMemo,
   useEffect,
   useState,
   useCallback,
   useRef,
   useLayoutEffect,
} from "react";
import { useDispatch, useSelector, shallowEqual } from "react-redux";

import {
   listenCalendarRefresh,
   scheduleCalendarRefresh,
} from "../../Utils/calendarBus";

//import { fetchInstructorsGroups } from "../../../store/instructorsGroupSlice";
import { fetchCars } from "../../../store/carsSlice";
import {
   maybeRefreshReservations,
   setReservationsFromMonthQuery,
   removeReservationLocal, // ✅ ADD
} from "../../../store/reservationsSlice";
import {
   reservationsApi,
   useGetReservationsForMonthQuery,
} from "../../../store/reservationsApi";

import { fetchStudents } from "../../../store/studentsSlice";
import { fetchUsers } from "../../../store/usersSlice";
import {
   updateInstructor,
   fetchInstructors,
} from "../../../store/instructorsSlice";

import {
   selectCalendarBaseData,
   selectCalendarDerivedData,
} from "../../../store/calendarSelectors";

import { openPopup } from "../../Utils/popupStore";

import useInertialPan from "./useInertialPan";
import CalendarPlusToolbar from "./CalendarPlusToolbar";
import CalendarPlusTrack from "./CalendarPlusTrack";

import { useReservationSocket } from "../../../socket/useReservationSocket";
import { getInstructorBlackouts } from "../../../api/instructorsService";

/* ================= HELPERE GENERALE ================= */
const LS_DV_MONTH_KEY = "__DV_CALENDAR_MONTH"; // salvează "YYYY-MM"
const LS_DV_ZOOM_KEY = "__DV_CALENDAR_ZOOM_PCT"; // ex: "50","75","100","125","150"
const LS_DV_SCROLL_STATE_KEY = "__DV_CALENDAR_SCROLL_STATE_V1";
// JSON: { [monthKey]: { x:number, y:number, t:number } }
const DV_SCROLL_KEEP = 12;
const IS_LOW_SPEC_DEVICE =
   typeof navigator !== "undefined" &&
   ((Number(navigator.deviceMemory) > 0 && Number(navigator.deviceMemory) <= 4) ||
      (Number(navigator.hardwareConcurrency) > 0 &&
         Number(navigator.hardwareConcurrency) <= 4));
const VISIBLE_DAYS_SCROLL_THRESHOLD_PX = IS_LOW_SPEC_DEVICE ? 140 : 120;
const TRACK_DAY_GAP_PX = 10;
const VISIBLE_DAYS_OVERSCAN = IS_LOW_SPEC_DEVICE ? 1 : 2;
const STICKY_VISIBLE_DAYS_LIMIT = IS_LOW_SPEC_DEVICE ? 6 : 8;
const VISIBLE_ROWS_SCROLL_THRESHOLD_PX = IS_LOW_SPEC_DEVICE ? 130 : 110;
const VIEWPORT_X_SCROLL_THRESHOLD_PX = IS_LOW_SPEC_DEVICE ? 110 : 90;
const INTERACTING_DAYS_UPDATE_MIN_MS = IS_LOW_SPEC_DEVICE ? 96 : 72;
const INTERACTING_VIEWPORT_UPDATE_MIN_MS = IS_LOW_SPEC_DEVICE ? 56 : 42;
const DISABLE_DAY_LAZY_LOAD = false;
const BLACKOUT_PREFETCH_CONCURRENCY = IS_LOW_SPEC_DEVICE ? 2 : 4;
const BLACKOUT_BUMP_MIN_MS = IS_LOW_SPEC_DEVICE ? 120 : 90;
const HYDRATE_DAYS_BATCH_IDLE = IS_LOW_SPEC_DEVICE ? 1 : 2;
const HYDRATE_DAYS_BATCH_PAN = IS_LOW_SPEC_DEVICE ? 1 : 2;
const HYDRATE_DAYS_IMMEDIATE_IDLE = IS_LOW_SPEC_DEVICE ? 2 : 3;
const HYDRATE_DAYS_IMMEDIATE_PAN = IS_LOW_SPEC_DEVICE ? 2 : 3;
const MAX_ORDER_POSITION = 80;

function safeReadScrollStateMap() {
   if (typeof window === "undefined") return {};
   try {
      const raw = localStorage.getItem(LS_DV_SCROLL_STATE_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return {};
      return obj;
   } catch {
      return {};
   }
}

function safeWriteScrollStateMap(map) {
   if (typeof window === "undefined") return;
   try {
      localStorage.setItem(LS_DV_SCROLL_STATE_KEY, JSON.stringify(map || {}));
   } catch {}
}

function safeReadScrollXY(monthKey) {
   if (typeof window === "undefined") return null;
   const key = String(monthKey || "").trim();
   if (!key) return null;

   const map = safeReadScrollStateMap();
   const entry = map?.[key];
   if (!entry) return null;

   const x = Number(entry.x);
   const y = Number(entry.y);

   return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
   };
}

function safeWriteScrollXY(monthKey, x, y) {
   if (typeof window === "undefined") return;
   const key = String(monthKey || "").trim();
   if (!key) return;

   const map0 = safeReadScrollStateMap();
   const map = map0 && typeof map0 === "object" ? { ...map0 } : {};

   const entry = {
      x: Math.max(0, Math.trunc(Number(x) || 0)),
      y: Math.max(0, Math.trunc(Number(y) || 0)),
      t: Date.now(),
   };

   map[key] = entry;

   // prune: păstrăm ultimele DV_SCROLL_KEEP luni folosite
   const sorted = Object.entries(map).sort(
      (a, b) => Number(b?.[1]?.t || 0) - Number(a?.[1]?.t || 0),
   );

   const pruned = {};
   for (let i = 0; i < sorted.length && i < DV_SCROLL_KEEP; i++) {
      pruned[sorted[i][0]] = sorted[i][1];
   }

   safeWriteScrollStateMap(pruned);
}

function safeReadZoomPercent() {
   if (typeof window === "undefined") return null;
   try {
      const raw = localStorage.getItem(LS_DV_ZOOM_KEY);
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
   } catch {
      return null;
   }
}

function safeWriteZoomPercent(pct) {
   if (typeof window === "undefined") return;
   try {
      localStorage.setItem(LS_DV_ZOOM_KEY, String(pct));
   } catch {}
}

function monthKeyToDate(key) {
   const m = String(key || "").match(/^(\d{4})-(\d{2})$/);
   if (!m) return null;
   const y = Number(m[1]);
   const mo = Number(m[2]) - 1;
   if (!Number.isFinite(y) || mo < 0 || mo > 11) return null;
   return new Date(y, mo, 1);
}

function safeReadMonthKey() {
   if (typeof window === "undefined") return null;
   try {
      return localStorage.getItem(LS_DV_MONTH_KEY);
   } catch {
      return null;
   }
}

const startOfDayTs = (d) => {
   const x = new Date(d);
   return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
};
const pad2 = (n) => String(n).padStart(2, "0");

function getMonthRangeYMD(dateLike) {
   const d = new Date(dateLike);
   const y = d.getFullYear();
   const m = d.getMonth(); // 0-11
   const lastDay = new Date(y, m + 1, 0).getDate();

   return {
      startDate: `${y}-${pad2(m + 1)}-01`,
      endDate: `${y}-${pad2(m + 1)}-${pad2(lastDay)}`,
   };
}

const toFloatingDate = (val) => {
   if (!val) return null;
   if (val instanceof Date && !isNaN(val)) return new Date(val);
   const m =
      typeof val === "string" &&
      val.match(
         /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
      );
   if (m) {
      const [, Y, Mo, D, h = "0", mi = "0", s = "0"] = m;
      return new Date(+Y, +Mo - 1, +D, +h, +mi, +s, 0);
   }
   const d = new Date(val);
   return isNaN(d) ? null : d;
};

const firstDefined = (...values) => {
   for (const value of values) {
      if (value !== null && value !== undefined) return value;
   }
   return null;
};

const normalizeEntityId = (value) => {
   if (value === null || value === undefined) return null;
   const out = String(value).trim();
   return out ? out : null;
};

const getReservationId = (r) =>
   firstDefined(r?.id, r?._id, r?.reservationId, r?.reservation_id, r?.uuid);

const getReservationStartRaw = (r) =>
   firstDefined(
      r?.startTime,
      r?.start,
      r?.startedAt,
      r?.start_at,
      r?.startDate,
      r?.start_date,
      r?.dateTime,
      r?.datetime,
      r?.date,
      r?.begin,
      r?.reservation?.startTime,
      r?.reservation?.start,
      r?.reservation?.startedAt,
      r?.reservation?.start_at,
      r?.reservation?.startDate,
      r?.reservation?.start_date,
      r?.reservation?.dateTime,
      r?.reservation?.datetime,
      r?.reservation?.date,
      r?.reservation?.begin,
   );

const getReservationEndRaw = (r) =>
   firstDefined(
      r?.endTime,
      r?.end,
      r?.end_at,
      r?.endDate,
      r?.end_date,
      r?.finishTime,
      r?.reservation?.endTime,
      r?.reservation?.end,
      r?.reservation?.end_at,
      r?.reservation?.endDate,
      r?.reservation?.end_date,
      r?.reservation?.finishTime,
   );

const getReservationInstructorId = (r) =>
   normalizeEntityId(
      firstDefined(
         r?.instructorId,
         r?.instructor_id,
         r?.instructor?.id,
         r?.reservation?.instructorId,
         r?.reservation?.instructor_id,
         r?.reservation?.instructor?.id,
      ),
   );

const getReservationGroupId = (r) =>
   firstDefined(
      r?.instructorsGroupId,
      r?.instructors_group_id,
      r?.groupId,
      r?.group_id,
      r?.group?.id,
      r?.reservation?.instructorsGroupId,
      r?.reservation?.instructors_group_id,
      r?.reservation?.groupId,
      r?.reservation?.group_id,
      r?.reservation?.group?.id,
   );

const getReservationStudentId = (r) =>
   normalizeEntityId(
      firstDefined(
         r?.userId,
         r?.user_id,
         r?.studentId,
         r?.student_id,
         r?.user?.id,
         r?.student?.id,
         r?.reservation?.userId,
         r?.reservation?.user_id,
         r?.reservation?.studentId,
         r?.reservation?.student_id,
         r?.reservation?.user?.id,
         r?.reservation?.student?.id,
      ),
   );

const norm = (s = "") =>
   s
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

const digitsOnly = (s = "") => s.toString().replace(/\D+/g, "");

const normPlate = (s = "") => s.toString().replace(/[\s-]/g, "").toUpperCase();

function normalizeUsersList(users) {
   if (!users) return [];
   if (Array.isArray(users)) return users;
   if (Array.isArray(users.items)) return users.items;
   if (Array.isArray(users.list)) return users.list;
   if (Array.isArray(users.data)) return users.data;
   return [];
}

function isAdminOrManager(u) {
   const role = String(
      u?.role ?? u?.userRole ?? u?.type ?? u?.profile?.role ?? "",
   ).toUpperCase();
   return role === "ADMIN" || role === "MANAGER";
}

function pickUserProfileColor(u) {
   return (
      u?.profile?.color ||
      u?.profileColor ||
      u?.color ||
      u?.uiColor ||
      u?.profile?.uiColor ||
      null
   );
}

const FALLBACK_USER_COLOR_TOKENS = [
   "--event-blue",
   "--event-green",
   "--event-pink",
   "--event-purple",
   "--event-yellow",
   "--event-orange",
   "--event-indigo",
];

function hashToColorToken(id) {
   const s = String(id || "");
   let h = 0;
   for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
   return FALLBACK_USER_COLOR_TOKENS[h % FALLBACK_USER_COLOR_TOKENS.length];
}

const getCookie = (name) => {
   if (typeof document === "undefined") return null;
   const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
   return m ? decodeURIComponent(m[2]) : null;
};

function decodeJwtPayload(token) {
   try {
      if (!token) return null;
      const parts = String(token).split(".");
      if (parts.length < 2) return null;
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const pad = "=".repeat((4 - (b64.length % 4)) % 4);
      const json = atob(b64 + pad);
      return JSON.parse(json);
   } catch {
      return null;
   }
}

function getUserIdFromToken(token) {
   const p = decodeJwtPayload(token);
   if (!p) return null;
   return p.userId ?? p.uid ?? p.id ?? p.sub ?? p.user?.id ?? null;
}

const px = (v) => parseFloat(String(v || 0));

/* ===== Dummy data pentru render instant (10 instructori fake) ===== */
const DUMMY_INSTRUCTORS = Array.from({ length: 10 }).map((_, idx) => {
   const n = idx + 1;
   const sector = n % 2 === 0 ? "ciocana" : "botanica";
   return {
      inst: {
         id: `dummy_${n}`,
         name: `Nume Prenume ${n}`,
         fakePhone: `060000${n.toString().padStart(2, "0")}`,
         fakePlate: `ABC-10${n}`,
         fakeSector: sector,
      },
      events: [],
   };
});

/* === CONSTANTE PENTRU LAYOUT / ZOOM / TIMING === */

const Z_BASE = 0.6;
const ZOOM_PERCENT_LEVELS = [50, 75, 100, 125, 150];
function closestZoomPercentFromZoom(zoomVal) {
   const currentPercent = (zoomVal / Z_BASE) * 100;
   let best = ZOOM_PERCENT_LEVELS[0];
   let bestDiff = Infinity;

   for (const p of ZOOM_PERCENT_LEVELS) {
      const diff = Math.abs(p - currentPercent);
      if (diff < bestDiff) {
         bestDiff = diff;
         best = p;
      }
   }
   return best;
}

const EMPTY_RESERVATIONS = [];
const EMPTY_LIST = [];
const EMPTY_MAP = new Map();
const EMPTY_ID_TO_DAY_MAP = new Map();
const MONTH_INDEX_WORKER_FILE = "/workers/calendarPlusMonthIndexWorker.js";

function setsEqual(a, b) {
   if (a === b) return true;
   if (!a || !b) return false;
   if (a.size !== b.size) return false;
   for (const v of a) {
      if (!b.has(v)) return false;
   }
   return true;
}

const MOLDOVA_TZ_ID = "Europe/Chisinau";
const TZ_PARTS_FMT_MAIN = new Intl.DateTimeFormat("en-GB", {
   timeZone: MOLDOVA_TZ_ID,
   hour12: false,
   year: "numeric",
   month: "2-digit",
   day: "2-digit",
   hour: "2-digit",
   minute: "2-digit",
   second: "2-digit",
});

const LESSON_MINUTES = 90;
const EVENT_H = 48;
const SLOT_H = 90;
const HOURS_COL_W = 60;
const COL_W = 220;
const COL_GAP = 0;
const GROUP_GAP = 32;

function getReservationIdFromSocketPayload(payload) {
   return (
      payload?.id ??
      payload?.reservationId ??
      payload?.reservation_id ??
      payload?.rid ??
      null
   );
}

function isSocketReservationDelete(eventName, payload) {
   const ev = String(eventName || "");
   return (
      /deleted|delete|removed|remove/i.test(ev) ||
      payload?.type === "delete" ||
      payload?.action === "delete"
   );
}

/* ================= COMPONENT PRINCIPAL ================= */
export default function CalendarPlusOptimized({
   date,
   extraFilters,
   onMonthChange,
} = {}) {
   const dispatch = useDispatch();

   /* ================== Gate refresh (anti-spam) ================== */
   const refreshInFlightRef = useRef(false);
   const refreshQueuedRef = useRef(false);

   const runReservationsRefresh = useCallback(
      (reason) => {
         if (refreshInFlightRef.current) {
            refreshQueuedRef.current = true;
            return;
         }

         refreshInFlightRef.current = true;

         Promise.resolve(
            dispatch(
               reservationsApi.util.invalidateTags([{ type: "ReservationsMonth" }]),
            ),
         )
            .catch(() => {})
            .finally(() => {
               refreshInFlightRef.current = false;
               if (refreshQueuedRef.current) {
                  refreshQueuedRef.current = false;
                  runReservationsRefresh("queued");
               }
            });
      },
      [dispatch],
   );

   const socketBurstRafRef = useRef(0);
   const socketBurstByIdRef = useRef(new Map());
   const socketBurstMetaRef = useRef({
      eventNames: new Set(),
      hasDelete: false,
      unknownCount: 0,
   });
   const localMutationSuppressUntilRef = useRef(0);
   const localMutationRecentIdsRef = useRef(new Map());
   const suppressedRefreshTimerRef = useRef(0);

   useEffect(() => {
      if (typeof window === "undefined") return;

      const onLocalMutation = (ev) => {
         const type = String(ev?.detail?.type || "").trim().toLowerCase();
         if (!type) return;
         if (type !== "create" && type !== "update") return;

         const holdMs = 1400;
         const until = Date.now() + holdMs;
         localMutationSuppressUntilRef.current = Math.max(
            localMutationSuppressUntilRef.current || 0,
            until,
         );

         const ids = [];
         const oneId =
            ev?.detail?.reservationId != null
               ? String(ev.detail.reservationId).trim()
               : "";
         if (oneId) ids.push(oneId);
         const manyIds = Array.isArray(ev?.detail?.reservationIds)
            ? ev.detail.reservationIds
            : [];
         for (const raw of manyIds) {
            const id = raw != null ? String(raw).trim() : "";
            if (id) ids.push(id);
         }
         if (ids.length) {
            const map = localMutationRecentIdsRef.current;
            for (const id of ids) map.set(id, until);
         }
      };

      window.addEventListener("calendarplus-local-mutation", onLocalMutation);
      return () =>
         window.removeEventListener("calendarplus-local-mutation", onLocalMutation);
   }, []);

   useEffect(() => {
      return () => {
         if (suppressedRefreshTimerRef.current) {
            clearTimeout(suppressedRefreshTimerRef.current);
            suppressedRefreshTimerRef.current = 0;
         }
      };
   }, []);

   const flushSocketReservationsBurst = useCallback(() => {
      socketBurstRafRef.current = 0;

      const byId = socketBurstByIdRef.current;
      const meta = socketBurstMetaRef.current;
      const entries = Array.from(byId.values());
      const ids = entries.map((entry) => entry.id).filter(Boolean);
      const count = entries.length + Number(meta?.unknownCount || 0);
      if (!count) return;

      const hasDelete =
         !!meta?.hasDelete || entries.some((entry) => !!entry?.isDelete);
      const eventNames =
         meta?.eventNames instanceof Set
            ? Array.from(meta.eventNames).filter(Boolean)
            : [];

      socketBurstByIdRef.current = new Map();
      socketBurstMetaRef.current = {
         eventNames: new Set(),
         hasDelete: false,
         unknownCount: 0,
      };

      scheduleCalendarRefresh({
         source: "socket",
         type: hasDelete ? "reservations-batch-delete" : "reservations-batch",
         count,
         ids: ids.slice(0, 32),
         eventNames: eventNames.slice(0, 12),
         forceReload: false,
      });

      const now = Date.now();
      const suppressUntil = Number(localMutationSuppressUntilRef.current || 0);
      const recentLocalMap = localMutationRecentIdsRef.current;
      if (recentLocalMap?.size) {
         for (const [id, expiresAt] of recentLocalMap.entries()) {
            if (!Number.isFinite(expiresAt) || expiresAt <= now) {
               recentLocalMap.delete(id);
            }
         }
      }

      const allKnownIdsMatchLocalEcho =
         ids.length > 0 && ids.every((id) => recentLocalMap?.has?.(id));
      const isLikelyLocalEcho =
         !hasDelete &&
         suppressUntil > now &&
         count <= 3 &&
         Number(meta?.unknownCount || 0) === 0 &&
         allKnownIdsMatchLocalEcho;

      if (isLikelyLocalEcho) {
         if (suppressedRefreshTimerRef.current) {
            clearTimeout(suppressedRefreshTimerRef.current);
            suppressedRefreshTimerRef.current = 0;
         }
         for (const id of ids) recentLocalMap?.delete?.(id);
         return;
      }

      const shouldDelayRefresh = !hasDelete && suppressUntil > now && count <= 3;

      if (!shouldDelayRefresh) {
         runReservationsRefresh(`socket-batch:${count}`);
         return;
      }

      const waitMs = Math.max(90, suppressUntil - now + 60);
      if (suppressedRefreshTimerRef.current) {
         clearTimeout(suppressedRefreshTimerRef.current);
      }
      suppressedRefreshTimerRef.current = setTimeout(() => {
         suppressedRefreshTimerRef.current = 0;
         runReservationsRefresh(`socket-batch-delayed:${count}`);
      }, waitMs);
   }, [runReservationsRefresh]);

   const queueSocketReservationsChanged = useCallback(
      ({ eventName, payload }) => {
         const ev = String(eventName || "");
         const ridRaw = getReservationIdFromSocketPayload(payload);
         const rid = ridRaw != null ? String(ridRaw) : "";
         const isDelete = isSocketReservationDelete(ev, payload);

         const meta = socketBurstMetaRef.current;
         if (meta?.eventNames instanceof Set && ev) meta.eventNames.add(ev);
         if (isDelete) meta.hasDelete = true;

         if (rid) {
            const prev = socketBurstByIdRef.current.get(rid);
            const prevPriority = prev?.isDelete ? 2 : 1;
            const nextPriority = isDelete ? 2 : 1;

            if (!prev || nextPriority >= prevPriority) {
               socketBurstByIdRef.current.set(rid, {
                  id: rid,
                  isDelete,
                  eventName: ev,
               });
            }
         } else {
            meta.unknownCount = Number(meta.unknownCount || 0) + 1;
         }

         if (socketBurstRafRef.current) return;
         if (typeof window === "undefined") {
            flushSocketReservationsBurst();
            return;
         }

         socketBurstRafRef.current = window.requestAnimationFrame(() => {
            flushSocketReservationsBurst();
         });
      },
      [flushSocketReservationsBurst],
   );

   useEffect(() => {
      return () => {
         if (socketBurstRafRef.current) {
            cancelAnimationFrame(socketBurstRafRef.current);
            socketBurstRafRef.current = 0;
         }
         socketBurstByIdRef.current = new Map();
         socketBurstMetaRef.current = {
            eventNames: new Set(),
            hasDelete: false,
            unknownCount: 0,
         };
      };
   }, []);
   // ✅ înainte de currentDate
   const initialMonthKeyRef = useRef(null);

   // ✅ lista din dropdown va fi ancorată la AZI (nu se schimbă când selectezi altă lună)
   const [monthAnchorDate] = useState(() => new Date());

   const [currentDate, setCurrentDate] = useState(() => {
      let out = null;

      // 1) prioritate: prop `date`
      if (date) {
         const d = new Date(date);
         if (!isNaN(d)) out = d;
      }

      // 2) altfel: din localStorage (YYYY-MM)
      if (!out) {
         const savedKey = safeReadMonthKey();
         const savedDate = monthKeyToDate(savedKey);
         if (savedDate && !isNaN(savedDate)) out = savedDate;
      }

      // 3) fallback: azi
      if (!out) out = new Date();

      // ✅ memorăm cheia lunii inițiale (din prop/LS) o singură dată
      if (!initialMonthKeyRef.current && out && !isNaN(out)) {
         initialMonthKeyRef.current = `${out.getFullYear()}-${pad2(out.getMonth() + 1)}`;
      }

      return out;
   });

   // ✅ UI state pentru editorul de ordine (global, nu pe zi)
   const [orderEditOpen, setOrderEditOpen] = useState(false);

   const handleToggleOrderEdit = useCallback(() => {
      setOrderEditOpen((v) => !v);
   }, []);

   const handleCloseOrderEdit = useCallback(() => {
      setOrderEditOpen(false);
   }, []);

   useEffect(() => {
      if (!date) return;
      const d = new Date(date);
      if (!isNaN(d)) setCurrentDate(d);
   }, [date]);

   //const [monthAnchorDate] = useState(() => new Date());

   const scrollRef = useRef(null);
   const dayRefs = useRef(new Map());
   const scrollLazyRafRef = useRef(null);
   const lastVisibleDaysScrollLeftRef = useRef(-1);
   const lastVisibleDaysUpdateTsRef = useRef(0);
   const lastViewportScrollTopRef = useRef(-1);
   const lastViewportUpdateTsRef = useRef(0);
   const isPanVirtualizationLockedRef = useRef(false);
   const panInputTypeRef = useRef("mouse");

   const [scrollViewport, setScrollViewport] = useState({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
   });

   const [visibleDays, setVisibleDays] = useState(() => new Set());
   const [stickyVisibleDays, setStickyVisibleDays] = useState(() => new Set());
   const [hydratedDays, setHydratedDays] = useState(() => new Set());
   const [isPanInteracting, setIsPanInteracting] = useState(false);
   const visibleDaysCount = visibleDays.size;
   const stickyVisibleDaysStampRef = useRef(new Map());
   const stickyVisibleDaysCounterRef = useRef(0);
   const hydratedDaysRef = useRef(new Set());
   const hydrationQueueRef = useRef([]);
   const hydrationRafRef = useRef(0);

   // ✅ Auto-scroll pentru event activ (X + Y): o singură secvență per acțiune.
   const activeEventIdRef = useRef(null);
   const autoScrollYOnceRef = useRef({
      eventId: null,
      key: null,
      done: true,
      tries: 0,
   });

   const armAutoScrollYOnce = useCallback((eventId, key) => {
      const id = eventId != null ? String(eventId) : null;
      autoScrollYOnceRef.current = {
         eventId: id,
         key: String(key ?? Date.now()),
         done: false,
         tries: 0,
      };
   }, []);

   const disarmAutoScrollY = useCallback(() => {
      autoScrollYOnceRef.current = {
         eventId: null,
         key: null,
         done: true,
         tries: 0,
      };
   }, []);

   useEffect(() => {
      hydratedDaysRef.current = hydratedDays;
   }, [hydratedDays]);

   // scroll automat pe X/Y pentru event activ — DAR o singură dată (gate)
   const handleActiveEventRectChange = useCallback((info) => {
      const scroller = scrollRef.current;
      if (!scroller || !info) return;

      const activeId = activeEventIdRef.current;
      const gate = autoScrollYOnceRef.current;
      const tries = Number(gate?.tries || 0);
      const gateKey = String(gate?.key || "");
      const preferTopAlignY =
         gateKey.startsWith("search:") || gateKey.startsWith("search-init:");

      if (!activeId || !gate || gate.done) return;
      if (gate.eventId && String(gate.eventId) !== String(activeId)) return;
      if (tries >= 54) {
         autoScrollYOnceRef.current = { ...gate, done: true };
         return;
      }

      const scRect = scroller.getBoundingClientRect();
      const scWidth = scRect.width || scroller.clientWidth || 0;
      const scHeight = scRect.height || scroller.clientHeight || 0;

      const topY = info.topY ?? info.top ?? null;
      const bottomY = info.bottomY ?? info.bottom ?? null;
      let centerY = info.centerY ?? null;
      const leftX = info.leftX ?? info.left ?? null;
      const rightX = info.rightX ?? info.right ?? null;
      let centerX = info.centerX ?? null;

      if (centerY == null) {
         if (topY != null && bottomY != null)
            centerY = topY + (bottomY - topY) / 2;
         else if (topY != null) centerY = topY;
         else if (bottomY != null) centerY = bottomY;
         else return;
      }
      if (centerX == null) {
         if (leftX != null && rightX != null)
            centerX = leftX + (rightX - leftX) / 2;
         else if (leftX != null) centerX = leftX;
         else if (rightX != null) centerX = rightX;
      }

      const measuredHeaderHeight = (() => {
         const headerEl = scroller.querySelector?.(".dayview__group-header");
         const rectH = Number(headerEl?.getBoundingClientRect?.().height || 0);
         if (Number.isFinite(rectH) && rectH > 0) return rectH;
         const styleObj =
            typeof window !== "undefined" && typeof window.getComputedStyle === "function"
               ? window.getComputedStyle(scroller)
               : null;
         const cssRaw = Number(
            parseFloat(
               String(styleObj?.getPropertyValue?.("--day-header-h") || ""),
            ),
         );
         return Number.isFinite(cssRaw) && cssRaw > 0 ? cssRaw : 0;
      })();

      const stickyTopInset = measuredHeaderHeight;
      const viewportPaddingY = 8;
      const viewportPaddingX = 14;
      const visibleTop = scRect.top + stickyTopInset + viewportPaddingY;
      const visibleBottom = scRect.bottom - viewportPaddingY;
      const visibleLeft = scRect.left + viewportPaddingX;
      const visibleRight = scRect.right - viewportPaddingX;

      const isYVisible =
         topY != null &&
         bottomY != null &&
         topY >= visibleTop &&
         bottomY <= visibleBottom;
      const isXVisible =
         leftX == null || rightX == null
            ? true
            : leftX >= visibleLeft && rightX <= visibleRight;

      if (isYVisible && isXVisible) {
         autoScrollYOnceRef.current = { ...gate, done: true, tries };
         return;
      }

      let wantedTop = scroller.scrollTop;
      if (!isYVisible) {
         if (preferTopAlignY && topY != null) {
            const targetTopAnchor = visibleTop + viewportPaddingY;
            wantedTop = scroller.scrollTop + (topY - targetTopAnchor);
         } else {
            const visibleCenterY =
               visibleTop + Math.max(1, visibleBottom - visibleTop) / 2;
            wantedTop = scroller.scrollTop + (centerY - visibleCenterY);
         }
      } else {
         const centerRel = centerY - scRect.top;
         wantedTop = scroller.scrollTop + (centerRel - scHeight / 2);
      }

      let wantedLeft = scroller.scrollLeft;
      if (leftX != null && leftX < visibleLeft) {
         wantedLeft += leftX - visibleLeft - viewportPaddingX;
      } else if (rightX != null && rightX > visibleRight) {
         wantedLeft += rightX - visibleRight + viewportPaddingX;
      } else if (!isXVisible && centerX != null && scWidth > 0) {
         const centerRelX = centerX - scRect.left;
         wantedLeft = scroller.scrollLeft + (centerRelX - scWidth / 2);
      }

      const maxScrollLeft = Math.max(0, scroller.scrollWidth - scWidth);
      const maxScrollTop = Math.max(0, scroller.scrollHeight - scHeight);
      const nextLeft = Math.max(0, Math.min(wantedLeft, maxScrollLeft));
      const nextTop = Math.max(0, Math.min(wantedTop, maxScrollTop));
      const shouldMoveX = Math.abs(nextLeft - scroller.scrollLeft) >= 1;
      const shouldMoveY = Math.abs(nextTop - scroller.scrollTop) >= 1;

      if (!shouldMoveX && !shouldMoveY) {
         autoScrollYOnceRef.current = {
            ...gate,
            done: isXVisible && isYVisible,
            tries: tries + (isXVisible && isYVisible ? 0 : 1),
         };
         return;
      }

      if (shouldMoveX) scroller.scrollLeft = nextLeft;
      if (shouldMoveY) scroller.scrollTop = nextTop;
      autoScrollYOnceRef.current = { ...gate, done: false, tries: tries + 1 };
   }, []);

   const isInteractiveTarget = useCallback(
      (el) => {
         if (!el?.closest) return false;
         if (el.closest("[data-dv-pan-allow='1']")) return false;
         return !!el.closest(
            "button, input, textarea, select, a, [data-dv-interactive='1']",
         );
      },
      [],
   );

   const [rowHeight, setRowHeight] = useState(0);

   const recalcRowHeight = useCallback(() => {
      const el = scrollRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const isPhone =
         window.matchMedia?.("(max-width: 768px)")?.matches ?? false;
      const headerOffset = isPhone ? 96 : 12;
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

   const [isMobile, setIsMobile] = useState(false);

   useEffect(() => {
      if (typeof window === "undefined") return;
      const mql = window.matchMedia("(max-width: 768px)");
      const apply = () => setIsMobile(mql.matches);
      apply();
      mql.addEventListener?.("change", apply);
      return () => mql.removeEventListener?.("change", apply);
   }, []);

   const Z_MIN = Z_BASE * 0.5;
   const Z_MAX = Z_BASE * 2.0;
   const [zoom, setZoom] = useState(() => {
      const Z_MIN0 = Z_BASE * 0.5;
      const Z_MAX0 = Z_BASE * 2.0;

      const savedPct = safeReadZoomPercent();
      const pct = Number.isFinite(savedPct) ? savedPct : 100;

      const z0 = (pct / 100) * Z_BASE;
      return Math.max(Z_MIN0, Math.min(Z_MAX0, z0));
   });

   const setZoomClamped = useCallback(
      (val) => {
         const z = Math.max(Z_MIN, Math.min(Z_MAX, val));
         setZoom(z);
         return z;
      },
      [Z_MIN, Z_MAX],
   );

   useEffect(() => {
      if (isMobile) {
         setZoomClamped(Z_BASE);
         return;
      }

      // când treci din mobile -> desktop, restaurăm preferința salvată
      const savedPct = safeReadZoomPercent();
      if (savedPct != null) {
         const target = (Number(savedPct) / 100) * Z_BASE;
         setZoomClamped(target);
      }
   }, [isMobile, setZoomClamped]);

   const zoomOptions = useMemo(
      () =>
         ZOOM_PERCENT_LEVELS.map((p) => ({
            value: String(p),
            label: `${p}%`,
         })),
      [],
   );

   const currentZoomValue = useMemo(() => {
      const currentPercent = (zoom / Z_BASE) * 100;
      let best = ZOOM_PERCENT_LEVELS[0];
      let bestDiff = Infinity;
      ZOOM_PERCENT_LEVELS.forEach((p) => {
         const diff = Math.abs(p - currentPercent);
         if (diff < bestDiff) {
            bestDiff = diff;
            best = p;
         }
      });
      return String(best);
   }, [zoom]);

   const handleZoomChange = useCallback(
      (val) => {
         const p = Number(val) || 100;
         const target = (p / 100) * Z_BASE;
         setZoomClamped(target);
      },
      [setZoomClamped],
   );
   useEffect(() => {
      if (isMobile) return; // NU suprascriem setarea desktop când mobile forțează Z_BASE
      const pct = closestZoomPercentFromZoom(zoom);
      safeWriteZoomPercent(pct);
   }, [zoom, isMobile]);

   const suspendFlagsRef = useRef({ isInteracting: false, panPhase: "idle" });

   useInertialPan(scrollRef, {
      suspendFlagsRef,
      shouldIgnore: isInteractiveTarget,
      inertiaX: true,
      inertiaY: true,
      slopPx: 6,
      inertiaBoostX: 1.28,
      inertiaBoostY: 1.34,
      frictionX: 0.915,
      frictionY: 0.93,
      stopSpeedX: 0.12,
      stopSpeedY: 0.1,
      maxInertiaX: 70,
      maxInertiaY: 95,
   });

   const token = getCookie("access_token");
   const reservationsHydrated = useSelector(
      (state) => state?.reservations?.hydrated === true,
   );
   const reservationsHydratedRef = useRef(reservationsHydrated);
   useEffect(() => {
      reservationsHydratedRef.current = reservationsHydrated;
   }, [reservationsHydrated]);

   const [presenceByReservationUsers, setPresenceByReservationUsers] = useState(
      () => new Map(),
   );

   const [createDraftBySlotUsers, setCreateDraftBySlotUsers] = useState(
      () => new Map(),
   );

   const CREATE_DRAFT_CLEANUP_EVERY_MS = 10 * 1000;

   useEffect(() => {
      const t = setInterval(() => {
         const now = Date.now();
         let changed = false;

         setCreateDraftBySlotUsers((prev) => {
            if (!(prev instanceof Map) || prev.size === 0) return prev;

            const next = new Map();
            prev.forEach((entry, key) => {
               const exp = entry?.expiresAt ?? 0;
               if (exp && exp <= now) {
                  changed = true;
                  return;
               }
               next.set(key, entry);
            });

            return changed ? next : prev;
         });
      }, CREATE_DRAFT_CLEANUP_EVERY_MS);

      return () => clearInterval(t);
   }, []);

   const normalizeIso = (iso) => {
      const d = new Date(iso);
      return isNaN(d) ? "" : d.toISOString();
   };

   const parseDraftSlotKey = (slotKey) => {
      const [iid, isoRaw] = String(slotKey || "").split("|");
      const iidTrim = String(iid || "").trim();
      const iso = normalizeIso(String(isoRaw || "").trim());
      if (!iidTrim || !iso) return null;
      return { instructorId: iidTrim, startIso: iso };
   };

   const buildDraftSlotKey = (instructorId, startTimeIso) => {
      const iid = String(instructorId ?? "").trim();
      const iso = String(startTimeIso ?? "").trim();
      if (!iid || !iso) return null;
      return `${iid}|${iso}`;
   };

   const myUserId = useMemo(() => {
      const id = getUserIdFromToken(token);
      return id != null ? String(id) : null;
   }, [token]);

   const myUserIdRef = useRef(myUserId);
   useEffect(() => {
      myUserIdRef.current = myUserId;
   }, [myUserId]);

   useEffect(() => {
      if (typeof window === "undefined") return;

      const apply = (on) => {
         window.__WS_DEBUG = !!on;
         if (window.__WS_DEBUG) {
            console.log("[WS DEBUG]", "ON");
         }
      };

      // 1) pornește din URL: ?wsdebug=1
      let forced = false;
      try {
         const qs = new URLSearchParams(window.location.search);
         const q = (qs.get("wsdebug") || "").toLowerCase();
         if (q === "1" || q === "true" || q === "on") {
            apply(true);
            forced = true;
         }
         if (q === "0" || q === "false" || q === "off") {
            apply(false);
            forced = true;
         }
      } catch {}

      // 2) default: OFF (evităm sesiuni cu debug rămas activ accidental)
      if (!forced) apply(false);

      // 3) toggle fără consolă: Ctrl + Shift + D
      const onKey = (e) => {
         const k = (e.key || "").toLowerCase();
         if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === "d") {
            e.preventDefault();
            apply(!window.__WS_DEBUG);
         }
      };

      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
   }, []);

   /* ===================== DRAFT helpers (SINGLE SOURCE OF TRUTH) ===================== */
   function parseDualOrder(v) {
      const s = String(v ?? "").trim();
      if (!s)
         return { a: Number.POSITIVE_INFINITY, b: Number.POSITIVE_INFINITY };

      // split pe X / x
      const parts = s.split(/x/i);
      const left = (parts[0] ?? "").trim();
      const right = (parts[1] ?? "").trim();

      const parseSide = (t) => {
         const m = String(t || "").match(/^(\d+)/);
         if (!m) return Number.POSITIVE_INFINITY;
         const n = parseInt(m[1], 10);
         return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
      };

      let a = parseSide(left);
      let b = parseSide(right);

      // compatibilitate: "6" sau "6X" => b=a ; "X7" => a=b
      if (!Number.isFinite(a) && Number.isFinite(b)) a = b;
      if (Number.isFinite(a) && !Number.isFinite(b)) b = a;

      return { a, b };
   }

   function isBuiucaniByMeta(inst, meta) {
      const s = String(
         meta?.sectorNorm ??
            meta?.sector ??
            inst?.sector ??
            inst?.groupSector ??
            "",
      )
         .toLowerCase()
         .trim();
      return s.includes("bui");
   }

   function safeFullName(inst) {
      const n = String(inst?.name ?? "").trim();
      if (n) return n;
      return `${inst?.firstName ?? ""} ${inst?.lastName ?? ""}`.trim();
   }

   const activeDraftSlotByUserRef = useRef(new Map()); // userId -> slotKey

   const triggerRedraw = useCallback((meta = {}) => {
      scheduleCalendarRefresh({
         source: meta.source || "ui",
         type: meta.type || "redraw",
         forceReload: false, // IMPORTANT: redraw only
         ...meta,
      });
   }, []);

   function pickDraftFromPayload(payload) {
      const p = payload || {};
      const d1 = p.reservationDraft || p.draft || p.reservationDraftOut || p;
      return d1?.reservationDraft ? d1.reservationDraft : d1;
   }

   function getUserIdFromPayload(payload, draft) {
      const startedBy =
         payload?.startedBy ??
         draft?.startedBy ??
         payload?.by ??
         payload?.user ??
         null;

      const uid =
         startedBy?.id ??
         startedBy?.userId ??
         startedBy?._id ??
         payload?.userId ??
         null;

      return uid != null ? String(uid) : null;
   }

   function extractSlotKeys(payload, draft) {
      const slotKey =
         draft?.slotKey ??
         draft?.draftKey ??
         payload?.slotKey ??
         payload?.draftKey ??
         null;

      if (slotKey) return [String(slotKey)];

      const instructorId = draft?.instructorId ?? payload?.instructorId ?? null;
      const reservations = Array.isArray(draft?.reservations)
         ? draft.reservations
         : [];

      if (!instructorId || !reservations.length) return [];

      const out = [];
      for (const r of reservations) {
         const isoLike = r?.startTime ?? r?.start ?? r?.startDate ?? null;
         if (!isoLike) continue;
         const d = new Date(isoLike);
         if (Number.isNaN(d.getTime())) continue;
         out.push(`${String(instructorId)}|${d.toISOString()}`);
      }
      return out;
   }

   const applyCreateDraftPresence = useCallback(
      (payload, { forceClear = false } = {}) => {
         const draft = pickDraftFromPayload(payload);
         const uid = getUserIdFromPayload(payload, draft);
         if (!uid) return;

         const actionRaw = draft?.action ?? payload?.action ?? null;
         const action =
            actionRaw != null ? String(actionRaw).trim().toLowerCase() : "";

         const reservations = Array.isArray(draft?.reservations)
            ? draft.reservations
            : [];

         const isClear =
            forceClear ||
            action === "clear" ||
            action === "end" ||
            action === "ended" ||
            action === "stop" ||
            action === "stopped" ||
            // IMPORTANT: dacă “started” vine cu reservations:[] -> tratăm ca clear
            (reservations.length === 0 && !!action);

         const slotKeys = extractSlotKeys(payload, draft);
         if (!slotKeys.length) return;

         const now = Date.now();
         const expiresAt = now + 60 * 1000;

         startTransition(() => {
            setCreateDraftBySlotUsers((prev) => {
               const next = new Map(prev);

               const removeFromSlot = (slotKey) => {
                  const k = String(slotKey);
                  const entry0 = next.get(k);
                  if (!entry0) return;

                  const users0 =
                     entry0?.users instanceof Set
                        ? entry0.users
                        : entry0 instanceof Set
                          ? entry0
                          : new Set();
                  const users1 = new Set(users0);
                  users1.delete(uid);

                  if (users1.size === 0) next.delete(k);
                  else
                     next.set(k, {
                        users: users1,
                        expiresAt,
                        startedByLast: entry0?.startedByLast ?? null,
                     });
               };

               const addToSlot = (slotKey) => {
                  const k = String(slotKey);
                  const entry0 = next.get(k);
                  const users0 =
                     entry0?.users instanceof Set
                        ? entry0.users
                        : entry0 instanceof Set
                          ? entry0
                          : new Set();
                  const users1 = new Set(users0);
                  users1.add(uid);

                  next.set(k, {
                     users: users1,
                     expiresAt,
                     startedByLast:
                        payload?.startedBy ?? entry0?.startedByLast ?? null,
                  });
               };

               if (isClear) {
                  slotKeys.forEach(removeFromSlot);

                  const prevSlot = activeDraftSlotByUserRef.current.get(uid);
                  if (prevSlot && slotKeys.includes(prevSlot)) {
                     activeDraftSlotByUserRef.current.delete(uid);
                  }

                  return next;
               }

               // START: scoate user-ul din slotul anterior, ca să nu rămână în 2 locuri
               const prevSlot = activeDraftSlotByUserRef.current.get(uid);
               if (prevSlot && !slotKeys.includes(prevSlot))
                  removeFromSlot(prevSlot);

               slotKeys.forEach(addToSlot);
               activeDraftSlotByUserRef.current.set(uid, slotKeys[0]);

               return next;
            });
         });
         // IMPORTANT: redraw only (NU refetch)
         triggerRedraw({
            source: "draft",
            type: isClear ? "create-clear" : "create-start",
         });
      },
      [triggerRedraw],
   );

   /* ===================== PRESENCE (join/left) ===================== */

   const applyPresenceDelta = useCallback((type, payload) => {
      const ridRaw =
         payload?.reservationId ??
         payload?.reservation_id ??
         payload?.rid ??
         null;
      if (ridRaw == null) return;
      const rid = String(ridRaw);

      const uidRaw =
         payload?.userId ??
         payload?.user_id ??
         payload?.uid ??
         payload?.user?.id ??
         payload?.by?.id ??
         payload?.leftBy?.id ??
         payload?.joinedBy?.id ??
         null;

      const uid = uidRaw != null ? String(uidRaw) : null;

      startTransition(() => {
         setPresenceByReservationUsers((prev) => {
            const next = new Map(prev);

            if (!uid) {
               if (type === "join") {
                  const set = new Set(next.get(rid) || []);
                  set.add("__someone__");
                  next.set(rid, set);
               } else if (type === "left") {
                  next.delete(rid);
               }
               return next;
            }

            const set = new Set(next.get(rid) || []);

            if (type === "join") {
               set.add(uid);
               set.delete("__someone__");
            } else if (type === "left") {
               set.delete(uid);
               set.delete("__someone__");
            }

            if (set.size) next.set(rid, set);
            else next.delete(rid);

            return next;
         });
      });
      // redraw only
      scheduleCalendarRefresh({
         source: "presence",
         type: `presence-${type}`,
         forceReload: false,
      });
   }, []);

   /* ===================== SOCKET API (FINAL INTEGRATION) ===================== */

   const socketApi = useReservationSocket(token, {
      enabled: true,

      ignoreEvents: new Set([
         "reservation:create:started",
         "reservation:create:ended",
         "reservation:create:stopped",
      ]),

      onConnect: () => {
         if (socketBurstRafRef.current) {
            cancelAnimationFrame(socketBurstRafRef.current);
            socketBurstRafRef.current = 0;
         }
         socketBurstByIdRef.current = new Map();
         socketBurstMetaRef.current = {
            eventNames: new Set(),
            hasDelete: false,
            unknownCount: 0,
         };

         setPresenceByReservationUsers(new Map());
         setCreateDraftBySlotUsers(new Map());
         activeDraftSlotByUserRef.current = new Map();

         if (reservationsHydratedRef.current) {
            runReservationsRefresh("ws-connect");
         }
      },

      onDisconnect: () => {
         if (socketBurstRafRef.current) {
            cancelAnimationFrame(socketBurstRafRef.current);
            socketBurstRafRef.current = 0;
         }
         socketBurstByIdRef.current = new Map();
         socketBurstMetaRef.current = {
            eventNames: new Set(),
            hasDelete: false,
            unknownCount: 0,
         };

         setPresenceByReservationUsers(new Map());
         setCreateDraftBySlotUsers(new Map());
         activeDraftSlotByUserRef.current = new Map();
      },

      onReservationJoined: (data) => applyPresenceDelta("join", data),
      onReservationLeft: (data) => applyPresenceDelta("left", data),
      onReservationJoinDenied: (data) => console.warn("[WS] join denied", data),

      onReservationCreateStarted: (payload) =>
         applyCreateDraftPresence(payload, { forceClear: false }),

      onReservationCreateEnded: (payload) =>
         applyCreateDraftPresence(payload, { forceClear: true }),

      onReservationsChanged: ({ eventName, payload }) => {
         const rid = getReservationIdFromSocketPayload(payload);
         const isDelete = isSocketReservationDelete(eventName, payload);

         if (isDelete && rid != null) {
            dispatch(removeReservationLocal(rid));
         }

         queueSocketReservationsChanged({ eventName, payload });
      },
   });

   /* ===================== SAFE wrappers used by canvas & popups ===================== */

   const joinReservationSafe = useCallback(
      (reservationId) => {
         const rid = String(reservationId ?? "").trim();
         if (!rid) return;

         applyPresenceDelta("join", {
            reservationId: rid,
            userId: myUserIdRef.current,
         });

         socketApi?.joinReservation?.(rid);
      },
      [socketApi, applyPresenceDelta],
   );

   const leaveReservationSafe = useCallback(
      (reservationId) => {
         const rid = String(reservationId ?? "").trim();
         if (!rid) return;

         applyPresenceDelta("left", {
            reservationId: rid,
            userId: myUserIdRef.current,
         });

         socketApi?.leaveReservation?.(rid);
      },
      [socketApi, applyPresenceDelta],
   );

   const startCreateDraftSafe = useCallback(
      (instructorId, startDateLike, extra = {}) => {
         const iid = String(instructorId ?? "").trim();
         const iso = normalizeIso(startDateLike);
         if (!iid || !iso) return;

         const iidNum = Number(iid);
         const instructorIdOut = Number.isFinite(iidNum) ? iidNum : iid;

         const slotKey = `${String(instructorIdOut)}|${iso}`;

         applyCreateDraftPresence(
            {
               reservationDraft: {
                  instructorId: instructorIdOut,
                  draftKey: slotKey,
                  slotKey,
                  action: "start",
                  reservations: [
                     {
                        startTime: iso,
                        sector: extra.sector,
                        gearbox: extra.gearbox,
                     },
                  ],
               },
               startedBy: { id: myUserIdRef.current },
            },
            { forceClear: false },
         );

         socketApi?.emitReservationCreateStarted?.({
            reservationDraft: {
               instructorId: instructorIdOut,
               draftKey: slotKey,
               slotKey,
               action: "start",
               reservations: [
                  {
                     startTime: iso,
                     sector: extra.sector,
                     gearbox: extra.gearbox,
                  },
               ],
            },
            startedBy: { id: myUserIdRef.current },
         });
      },
      [socketApi, applyCreateDraftPresence],
   );

   const leaveCreateDraftSafe = useCallback(
      (slotKey, extra = {}) => {
         const k = String(slotKey || "").trim();
         if (!k) return;

         applyCreateDraftPresence(
            {
               reservationDraft: {
                  draftKey: k,
                  slotKey: k,
                  action: "clear",
                  reservations: [],
               },
               action: "clear",
               startedBy: { id: myUserIdRef.current },
            },
            { forceClear: true },
         );

         const parsed = parseDraftSlotKey(k);
         const instructorIdOut = parsed?.instructorId ?? null;

         socketApi?.emitReservationCreateStarted?.({
            reservationDraft: {
               instructorId: instructorIdOut,
               draftKey: k,
               slotKey: k,
               action: "clear",
               reservations: [],
               sector: extra?.sector,
               gearbox: extra?.gearbox,
            },
            startedBy: { id: myUserIdRef.current },
         });
      },
      [socketApi, applyCreateDraftPresence],
   );

   const joinCreateDraftSafe = useCallback(
      (slotKey, extra = {}) => {
         const raw = String(slotKey || "").trim();
         if (!raw || !raw.includes("|")) return;

         const [iidRaw, isoRaw] = raw.split("|");
         const iid = String(iidRaw || "").trim();
         const iso = String(isoRaw || "").trim();
         if (!iid || !iso) return;

         startCreateDraftSafe(iid, iso, extra);
      },
      [startCreateDraftSafe],
   );

   useEffect(() => {
      if (typeof window === "undefined") return;

      window.__reservationWS = {
         joinReservation: (rid) => joinReservationSafe(rid),
         leaveReservation: (rid) => leaveReservationSafe(rid),
         joinCreateDraft: (slotKey, extra) =>
            joinCreateDraftSafe(slotKey, extra),
         leaveCreateDraft: (slotKey, extra) =>
            leaveCreateDraftSafe(slotKey, extra),
      };

      return () => {
         try {
            delete window.__reservationWS;
         } catch {}
      };
   }, [
      joinReservationSafe,
      leaveReservationSafe,
      joinCreateDraftSafe,
      leaveCreateDraftSafe,
   ]);

   const [sectorFilter, setSectorFilter] = useState("Toate");
   const sectorFilterNorm = sectorFilter.toLowerCase();

   const hasPrefetchedAllRef = useRef(false);
   useEffect(() => {
      if (hasPrefetchedAllRef.current) return;
      hasPrefetchedAllRef.current = true;
      dispatch(fetchInstructors());
      dispatch(fetchCars());

      let cancelled = false;
      let idleId = 0;
      let timerId = 0;
      const runDeferredPrefetch = () => {
         if (cancelled) return;
         Promise.all([
            dispatch(fetchStudents()),
            dispatch(fetchUsers()),
         ]).catch(() => {});
      };

      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
         idleId = window.requestIdleCallback(runDeferredPrefetch, {
            timeout: 1200,
         });
      } else {
         timerId = window.setTimeout(runDeferredPrefetch, 420);
      }

      return () => {
         cancelled = true;
         if (idleId && typeof window !== "undefined" && window.cancelIdleCallback) {
            window.cancelIdleCallback(idleId);
         }
         if (timerId) window.clearTimeout(timerId);
      };
   }, [dispatch]);

   const {
      reservations: reservationsLive,
      instructorsGroups,
      instructors,
      cars,
      users,
   } = useSelector(selectCalendarBaseData, shallowEqual);
   const reservationsLoading = useSelector(
      (state) => !!state?.reservations?.loadingAll,
   );

   const handleSaveOrder = useCallback(
      async (changes) => {
         const payload = (changes || [])
            .map((c) => {
               const id = String(c?.id ?? "").trim();
               const a = Math.max(1, Math.trunc(Number(c?.orderA)));
               const b = Math.max(1, Math.trunc(Number(c?.orderB)));

               if (!id) return null;
               if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

               return {
                  id,
                  order: `${a}X${b}`, // ✅ DUAL
               };
            })
            .filter(Boolean);

         console.log("[Order] payload to PATCH (updateInstructor)", payload);
         if (!payload.length) return;

         const queue = payload.slice();
         const failed = [];

         const worker = async () => {
            while (queue.length) {
               const item = queue.shift();
               try {
                  const res = await dispatch(
                     updateInstructor({
                        id: item.id,
                        data: { order: item.order },
                     }),
                  ).unwrap();

                  console.log("[Order] PATCH OK", { item, res });
               } catch (e) {
                  console.log("[Order] PATCH FAIL", { item, e });
                  failed.push({ item, error: e });
               }
            }
         };

         await worker();

         console.log("[Order] done. failed =", failed);

         await dispatch(fetchInstructors());
         scheduleCalendarRefresh({
            source: "order",
            type: "redraw",
            forceReload: false,
         });

         setOrderEditOpen(false);
      },
      [dispatch],
   );

   const { instructorMeta, studentDict, instructorsGroupDict } = useSelector(
      selectCalendarDerivedData,
      shallowEqual,
   );
   const instructorsOrderedForUI = useMemo(() => {
      const list = Array.isArray(instructors) ? instructors : [];

      const readOrderNumber = (v) => {
         const s = String(v ?? "").trim();
         if (!s) return Number.POSITIVE_INFINITY;

         const m = s.match(/^(\d+)/); // ✅ "12X" -> 12
         if (m) {
            const n = parseInt(m[1], 10);
            return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
         }

         const n = Number(s);
         return Number.isFinite(n) && n > 0
            ? Math.round(n)
            : Number.POSITIVE_INFINITY;
      };

      const ord = (i) => {
         const id = String(i?.id ?? "");
         const meta = instructorMeta?.get?.(id);
         const v =
            meta?.order ??
            i?.order ??
            i?.uiOrder ??
            i?.sortOrder ??
            i?.position ??
            null;

         return readOrderNumber(v); // ✅ aici e fixul
      };

      const name = (i) =>
         `${i?.firstName ?? ""} ${i?.lastName ?? ""}`.trim().toLowerCase();

      return list.slice().sort((a, b) => {
         const ao = ord(a);
         const bo = ord(b);
         if (ao !== bo) return ao - bo;

         const an = name(a);
         const bn = name(b);
         if (an !== bn) return an < bn ? -1 : 1;

         return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
      });
   }, [instructors, instructorMeta]);

   const usersList = useMemo(() => normalizeUsersList(users), [users]);

   const adminManagerColorById = useMemo(() => {
      const map = new Map();
      for (const u of usersList) {
         if (!isAdminOrManager(u)) continue;
         const id = u?.id ?? u?.userId ?? u?._id;
         if (id == null) continue;
         const c = pickUserProfileColor(u) || hashToColorToken(id);
         map.set(String(id), String(c));
      }
      return map;
   }, [usersList]);

   const createDraftBySlotColors = useMemo(() => {
      const out = new Map();
      if (!(createDraftBySlotUsers instanceof Map)) return out;

      createDraftBySlotUsers.forEach((entry, slotKey) => {
         const uidsSet = entry?.users;
         const uids = uidsSet instanceof Set ? Array.from(uidsSet) : [];

         const colors = [];
         const seen = new Set();

         for (const uidRaw of uids) {
            const uid = String(uidRaw || "");
            if (!uid) continue;

            const color =
               uid === "__someone__"
                  ? "--event-green"
                  : adminManagerColorById.get(uid) || hashToColorToken(uid);

            if (color && !seen.has(color)) {
               seen.add(color);
               colors.push(color);
            }
         }

         if (colors.length) out.set(String(slotKey), colors);
      });

      return out;
   }, [createDraftBySlotUsers, adminManagerColorById]);

   const presenceByReservationColors = useMemo(() => {
      const out = new Map();
      if (!(presenceByReservationUsers instanceof Map)) return out;

      presenceByReservationUsers.forEach((uidsSet, rid) => {
         const colors = [];
         const seen = new Set();

         const uids = uidsSet instanceof Set ? Array.from(uidsSet) : [];
         for (const uidRaw of uids) {
            const uid = String(uidRaw || "");
            if (!uid) continue;

            const color =
               uid === "__someone__"
                  ? "--event-green"
                  : adminManagerColorById.get(uid) || hashToColorToken(uid);

            if (color && !seen.has(color)) {
               seen.add(color);
               colors.push(color);
            }
         }

         if (colors.length) out.set(String(rid), colors);
      });

      return out;
   }, [presenceByReservationUsers, adminManagerColorById]);

   const reservationsUIDedup = useMemo(
      () =>
         Array.isArray(reservationsLive) ? reservationsLive : EMPTY_RESERVATIONS,
      [reservationsLive],
   );

   // Guard de performanță: chiar dacă list-ul global primește delta cross-month,
   // calendarul de lună lucrează doar cu rezervările din luna curentă.
   const monthWindowTs = useMemo(() => {
      const d = new Date(currentDate);
      const y = d.getFullYear();
      const m = d.getMonth();
      return {
         start: new Date(y, m, 1).getTime(),
         end: new Date(y, m + 1, 1).getTime(),
      };
   }, [currentDate]);

   const reservationsForCurrentMonth = useMemo(() => {
      const list = Array.isArray(reservationsUIDedup) ? reservationsUIDedup : [];
      if (!list.length) return [];

      const out = [];
      const startLimit = monthWindowTs.start;
      const endLimit = monthWindowTs.end;

      for (const r of list) {
         const startRaw = getReservationStartRaw(r);
         if (!startRaw) continue;

         const start = toFloatingDate(startRaw);
         if (!start || isNaN(start)) continue;

         const ms = start.getTime();
         if (ms < startLimit || ms >= endLimit) continue;

         out.push({ r, start });
      }

      return out;
   }, [reservationsUIDedup, monthWindowTs.start, monthWindowTs.end]);

   useEffect(() => {
      const onFocusVisible = () => {
         if (!document.hidden) {
            dispatch(maybeRefreshReservations());
         }
      };
      window.addEventListener("focus", onFocusVisible);
      document.addEventListener("visibilitychange", onFocusVisible);
      return () => {
         window.removeEventListener("focus", onFocusVisible);
         document.removeEventListener("visibilitychange", onFocusVisible);
      };
   }, [dispatch]);

   const dataReady = useMemo(
      () =>
         reservationsHydrated ||
         reservationsLoading ||
         (reservationsLive?.length ?? 0) > 0 ||
         (instructors?.length ?? 0) > 0,
      [
         reservationsHydrated,
         reservationsLoading,
         reservationsLive?.length,
         instructors?.length,
      ],
   );

   const isDummyMode = !dataReady;

   const maxColsPerGroup = 4;

   const timeMarks = useMemo(
      () => [
         "07:00",
         "08:30",
         "10:00",
         "11:30",
         "13:30",
         "15:00",
         "16:30",
         "18:00",
         "19:30",
      ],
      [],
   );

   const HIDDEN_INTERVALS = useMemo(
      () => [{ start: "13:00", end: "13:30" }],
      [],
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
                     overlaps(start, end, hi.start, hi.end),
                  ),
            );
      },
      [timeMarks, HIDDEN_INTERVALS],
   );

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

   const instructorGroupByInstId = useMemo(() => {
      const map = new Map();
      (instructorsGroups || []).forEach((grp) => {
         const gid = String(grp.id);
         (grp.instructors || []).forEach((i) => {
            if (i && i.id != null) {
               map.set(String(i.id), gid);
            }
         });
      });
      return map;
   }, [instructorsGroups]);

   const findGroupForInstructor = useCallback(
      (instructorId) => {
         if (!instructorId) return null;
         return instructorGroupByInstId.get(String(instructorId)) || null;
      },
      [instructorGroupByInstId],
   );

   /* ===== Funcții TZ pentru blackouts ===== */
   function partsInTZ(dateLike, timeZone = MOLDOVA_TZ_ID) {
      const d = new Date(dateLike);

      if (timeZone && timeZone !== MOLDOVA_TZ_ID) {
         const p = new Intl.DateTimeFormat("en-GB", {
            timeZone,
            hour12: false,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
         }).formatToParts(d);
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

      const p = TZ_PARTS_FMT_MAIN.formatToParts(d);
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

   function ymdStrInTZ(dateLike, timeZone = MOLDOVA_TZ_ID) {
      const { y, m, d } = partsInTZ(dateLike, timeZone);
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
   }

   function hhmmInTZ(dateLike, timeZone = MOLDOVA_TZ_ID) {
      const { H, M } = partsInTZ(dateLike, timeZone);
      return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
   }

   function tzOffsetMinutesAt(tsMs, timeZone = MOLDOVA_TZ_ID) {
      const { y, m, d, H, M, S } = partsInTZ(tsMs, timeZone);
      const asUTC = Date.UTC(y, m - 1, d, H, M, S);
      return (asUTC - tsMs) / 60000;
   }

   function localKeyFromTs(dateLike, timeZone = MOLDOVA_TZ_ID) {
      return `${ymdStrInTZ(dateLike, timeZone)}|${hhmmInTZ(
         dateLike,
         timeZone,
      )}`;
   }

   function busyLocalKeyFromStored(st) {
      const d = new Date(st);
      const offMin = tzOffsetMinutesAt(d.getTime(), MOLDOVA_TZ_ID);
      const base = new Date(d.getTime() - offMin * 60000);
      return localKeyFromTs(base.getTime(), MOLDOVA_TZ_ID);
   }

   function getBlackoutDT(b) {
      if (typeof b === "string") return b;
      const t = String(b?.type || "").toUpperCase();
      if (t === "REPEAT")
         return b?.startDateTime || b?.dateTime || b?.datetime || null;
      return (
         b?.dateTime ||
         b?.datetime ||
         b?.startTime ||
         b?.date ||
         b?.begin ||
         null
      );
   }

   function expandRepeatLocalKeys(b) {
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
         if (key) out.push(key);
         cur += stepDays * 24 * 60 * 60 * 1000;
      }
      return out;
   }

   const monthKeyForIndex = useMemo(() => {
      const d = new Date(currentDate);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
   }, [currentDate]);

   const [monthIndexWorkerDisabled, setMonthIndexWorkerDisabled] =
      useState(false);
   const monthIndexWorkerRef = useRef(null);
   const monthIndexReqIdRef = useRef(0);
   const [monthIndexWorkerResult, setMonthIndexWorkerResult] = useState({
      monthKey: "",
      dayEntries: EMPTY_LIST,
      searchCatalog: EMPTY_LIST,
      eventIdToDayEntries: EMPTY_LIST,
      eventsCount: 0,
      buildMs: 0,
   });
   const canUseMonthIndexWorker =
      typeof Worker !== "undefined" && !monthIndexWorkerDisabled;
   const monthIndexPayloadSigByKeyRef = useRef(new Map());
   const monthIndexSceneMetaRef = useRef({
      monthKey: "",
      studentsRef: null,
      groupsRef: null,
      instructorMetaRef: null,
   });

   const monthIndexStudentsById = useMemo(() => {
      if (!canUseMonthIndexWorker || isDummyMode) return {};
      const out = {};
      if (!(studentDict instanceof Map)) return out;

      studentDict.forEach((student, idRaw) => {
         const id = String(idRaw || "").trim();
         if (!id) return;
         out[id] = {
            firstName: student?.firstName ?? "",
            lastName: student?.lastName ?? "",
            phone: student?.phone ?? null,
            privateMessage: student?.privateMessage ?? "",
         };
      });

      return out;
   }, [canUseMonthIndexWorker, isDummyMode, studentDict]);

   const monthIndexGroupNameById = useMemo(() => {
      if (!canUseMonthIndexWorker || isDummyMode) return {};
      const out = {};
      if (!(instructorsGroupDict instanceof Map)) return out;

      instructorsGroupDict.forEach((group, idRaw) => {
         const id = String(idRaw || "").trim();
         if (!id) return;
         out[id] = group?.name || `Grupa ${group?.id ?? id}`;
      });

      return out;
   }, [canUseMonthIndexWorker, isDummyMode, instructorsGroupDict]);

   const monthIndexInstructorMetaById = useMemo(() => {
      if (!canUseMonthIndexWorker || isDummyMode) return {};
      const out = {};
      if (!(instructorMeta instanceof Map)) return out;

      instructorMeta.forEach((meta, idRaw) => {
         const id = String(idRaw || "").trim();
         if (!id) return;
         out[id] = {
            name: meta?.name ?? "",
            gearbox: meta?.gearbox ?? "",
            plateRaw: meta?.plateRaw ?? "",
         };
      });

      return out;
   }, [canUseMonthIndexWorker, isDummyMode, instructorMeta]);

   const monthIndexSnapshot = useMemo(() => {
      if (!canUseMonthIndexWorker || isDummyMode) {
         return {
            reservations: EMPTY_LIST,
            entriesByKey: EMPTY_MAP,
            sigByKey: EMPTY_MAP,
            rawByEntryKey: EMPTY_MAP,
         };
      }
      if (
         !Array.isArray(reservationsForCurrentMonth) ||
         !reservationsForCurrentMonth.length
      ) {
         return {
            reservations: EMPTY_LIST,
            entriesByKey: EMPTY_MAP,
            sigByKey: EMPTY_MAP,
            rawByEntryKey: EMPTY_MAP,
         };
      }

      const reservations = [];
      const entriesByKey = new Map();
      const sigByKey = new Map();
      const rawByEntryKey = new Map();

      for (let idx = 0; idx < reservationsForCurrentMonth.length; idx++) {
         const entry = reservationsForCurrentMonth[idx];
         const r = entry?.r;
         const start = entry?.start;
         if (!r || !(start instanceof Date) || Number.isNaN(start.getTime()))
            continue;

         const userObj =
            r.user || r.student || r.client || r.reservation?.user || {};
         const reservationId = getReservationId(r);
         const reservationIdStr =
            reservationId != null ? String(reservationId).trim() : "";
         const instructorId = getReservationInstructorId(r) || "__unknown";
         const groupId = getReservationGroupId(r);
         const groupIdStr = groupId != null ? String(groupId).trim() : "";
         const studentId = getReservationStudentId(r);
         const studentIdStr = studentId != null ? String(studentId).trim() : "";
         const startMs = start.getTime();
         const entryKey = reservationIdStr
            ? `rid:${reservationIdStr}`
            : `tmp:${instructorId}|${startMs}|${studentIdStr}|${groupIdStr}|${idx}`;

         const payloadEntry = {
            entryKey,
            id: reservationIdStr || null,
            startMs,
            endRaw: getReservationEndRaw(r),
            instructorId,
            groupId,
            studentId,
            userFirst: userObj?.firstName ?? "",
            userLast: userObj?.lastName ?? "",
            userPhone:
               userObj?.phone ?? userObj?.phoneNumber ?? userObj?.mobile ?? null,
            fallbackName: r.clientName || r.customerName || r.name || "Programare",
            privateMessage: r.privateMessage ?? "",
            privateMessaje: r.privateMessaje ?? "",
            comment: r.comment ?? "",
            color: r.color || "--default",
            sector: r.sector || "",
            gearbox: r.gearbox || "",
            isConfirmed: !!r.isConfirmed,
            clientPhone: r.clientPhone ?? "",
            phoneNumber: r.phoneNumber ?? "",
            phone: r.phone ?? "",
            telefon: r.telefon ?? "",
         };

         const sig = [
            String(payloadEntry.startMs),
            String(payloadEntry.endRaw ?? ""),
            String(payloadEntry.instructorId ?? ""),
            String(payloadEntry.groupId ?? ""),
            String(payloadEntry.studentId ?? ""),
            String(payloadEntry.userFirst ?? ""),
            String(payloadEntry.userLast ?? ""),
            String(payloadEntry.userPhone ?? ""),
            String(payloadEntry.fallbackName ?? ""),
            String(payloadEntry.privateMessage ?? ""),
            String(payloadEntry.privateMessaje ?? ""),
            String(payloadEntry.comment ?? ""),
            String(payloadEntry.color ?? ""),
            String(payloadEntry.sector ?? ""),
            String(payloadEntry.gearbox ?? ""),
            payloadEntry.isConfirmed ? "1" : "0",
            String(payloadEntry.clientPhone ?? ""),
            String(payloadEntry.phoneNumber ?? ""),
            String(payloadEntry.phone ?? ""),
            String(payloadEntry.telefon ?? ""),
         ].join("\u001f");

         reservations.push(payloadEntry);
         entriesByKey.set(entryKey, payloadEntry);
         sigByKey.set(entryKey, sig);
         rawByEntryKey.set(entryKey, r);
      }

      return {
         reservations,
         entriesByKey,
         sigByKey,
         rawByEntryKey,
      };
   }, [
      canUseMonthIndexWorker,
      isDummyMode,
      reservationsForCurrentMonth,
   ]);

   useEffect(() => {
      if (!canUseMonthIndexWorker) return undefined;

      const base = process.env.PUBLIC_URL || "";
      const workerPath = `${base}${MONTH_INDEX_WORKER_FILE}`;

      let worker = null;
      try {
         worker = new Worker(workerPath);
      } catch (err) {
         console.error("[CalendarPlus] month index worker init failed", err);
         setMonthIndexWorkerDisabled(true);
         return undefined;
      }

      monthIndexWorkerRef.current = worker;

      worker.onmessage = (event) => {
         const msg = event?.data || {};
         if (Number(msg?.requestId) !== Number(monthIndexReqIdRef.current))
            return;

         if (msg?.type === "month-index-result") {
            setMonthIndexWorkerResult({
               monthKey: String(msg?.monthKey || ""),
               dayEntries: Array.isArray(msg?.dayEntries)
                  ? msg.dayEntries
                  : EMPTY_LIST,
               searchCatalog: Array.isArray(msg?.searchCatalog)
                  ? msg.searchCatalog
                  : EMPTY_LIST,
               eventIdToDayEntries: Array.isArray(msg?.eventIdToDayEntries)
                  ? msg.eventIdToDayEntries
                  : EMPTY_LIST,
               eventsCount: Number(msg?.eventsCount || 0),
               buildMs: Number(msg?.buildMs || 0),
            });
            return;
         }

         if (msg?.type === "month-index-error") {
            console.error(
               "[CalendarPlus] month index worker error",
               msg?.error || "unknown",
            );
            setMonthIndexWorkerDisabled(true);
         }
      };

      worker.onerror = (err) => {
         console.error("[CalendarPlus] month index worker runtime error", err);
         setMonthIndexWorkerDisabled(true);
      };

      return () => {
         monthIndexWorkerRef.current = null;
         try {
            worker.terminate();
         } catch {}
      };
   }, [canUseMonthIndexWorker]);

   useEffect(() => {
      if (!canUseMonthIndexWorker || isDummyMode) {
         monthIndexPayloadSigByKeyRef.current = new Map();
         monthIndexSceneMetaRef.current = {
            monthKey: "",
            studentsRef: null,
            groupsRef: null,
            instructorMetaRef: null,
         };
         return;
      }

      const worker = monthIndexWorkerRef.current;
      if (!worker) return;

      const nextSigByKey =
         monthIndexSnapshot?.sigByKey instanceof Map
            ? monthIndexSnapshot.sigByKey
            : EMPTY_MAP;
      const nextEntriesByKey =
         monthIndexSnapshot?.entriesByKey instanceof Map
            ? monthIndexSnapshot.entriesByKey
            : EMPTY_MAP;
      const nextReservations = Array.isArray(monthIndexSnapshot?.reservations)
         ? monthIndexSnapshot.reservations
         : EMPTY_LIST;

      const prevScene = monthIndexSceneMetaRef.current || {};
      const shouldReset =
         prevScene.monthKey !== monthKeyForIndex ||
         prevScene.studentsRef !== monthIndexStudentsById ||
         prevScene.groupsRef !== monthIndexGroupNameById ||
         prevScene.instructorMetaRef !== monthIndexInstructorMetaById;

      const requestId = monthIndexReqIdRef.current + 1;
      monthIndexReqIdRef.current = requestId;

      if (shouldReset) {
         monthIndexPayloadSigByKeyRef.current = new Map(nextSigByKey);
         monthIndexSceneMetaRef.current = {
            monthKey: monthKeyForIndex,
            studentsRef: monthIndexStudentsById,
            groupsRef: monthIndexGroupNameById,
            instructorMetaRef: monthIndexInstructorMetaById,
         };

         worker.postMessage({
            type: "index-month-reset",
            requestId,
            payload: {
               monthKey: monthKeyForIndex,
               timeZone: MOLDOVA_TZ_ID,
               lessonMinutes: LESSON_MINUTES,
               reservations: nextReservations,
               studentsById: monthIndexStudentsById,
               groupNameById: monthIndexGroupNameById,
               instructorMetaById: monthIndexInstructorMetaById,
            },
         });
         return;
      }

      const prevSigByKey = monthIndexPayloadSigByKeyRef.current || EMPTY_MAP;
      const removals = [];
      const upserts = [];

      for (const [entryKey, nextSig] of nextSigByKey.entries()) {
         if (prevSigByKey.get(entryKey) === nextSig) continue;
         const nextEntry = nextEntriesByKey.get(entryKey);
         if (nextEntry) upserts.push(nextEntry);
      }

      for (const entryKey of prevSigByKey.keys()) {
         if (!nextSigByKey.has(entryKey)) removals.push(entryKey);
      }

      if (!removals.length && !upserts.length) return;

      monthIndexPayloadSigByKeyRef.current = new Map(nextSigByKey);

      worker.postMessage({
         type: "index-month-patch",
         requestId,
         payload: {
            monthKey: monthKeyForIndex,
            removals,
            upserts,
         },
      });
   }, [
      canUseMonthIndexWorker,
      isDummyMode,
      monthKeyForIndex,
      monthIndexSnapshot,
      monthIndexStudentsById,
      monthIndexGroupNameById,
      monthIndexInstructorMetaById,
   ]);

   const monthIndexReadyForCurrentMonth = useMemo(() => {
      if (!canUseMonthIndexWorker || isDummyMode) return true;
      return monthIndexWorkerResult.monthKey === monthKeyForIndex;
   }, [
      canUseMonthIndexWorker,
      isDummyMode,
      monthIndexWorkerResult.monthKey,
      monthKeyForIndex,
   ]);
   const uiDataReady = dataReady && monthIndexReadyForCurrentMonth;

   const eventsByDayWorker = useMemo(() => {
      if (!canUseMonthIndexWorker || isDummyMode) return EMPTY_MAP;
      if (!monthIndexReadyForCurrentMonth) return EMPTY_MAP;

      const byDay = new Map();
      const dayEntries = Array.isArray(monthIndexWorkerResult.dayEntries)
         ? monthIndexWorkerResult.dayEntries
         : EMPTY_LIST;

      for (const dayEntry of dayEntries) {
         const dayTs = Number(dayEntry?.[0] || 0);
         if (!Number.isFinite(dayTs) || dayTs <= 0) continue;

         const packedEvents = Array.isArray(dayEntry?.[1]) ? dayEntry[1] : EMPTY_LIST;
         if (!packedEvents.length) {
            byDay.set(dayTs, EMPTY_LIST);
            continue;
         }

         const items = [];
         for (const item of packedEvents) {
            const entryKey = String(item?.entryKey || "").trim();
            const raw = entryKey
               ? monthIndexSnapshot?.rawByEntryKey?.get?.(entryKey) || null
               : null;

            items.push({
               id: item?.id != null ? String(item.id) : "",
               title: item?.title || "Programare",
               start: Number(item?.startMs || 0),
               end: Number(item?.endMs || 0),
               instructorId: String(item?.instructorId || "__unknown"),
               groupId: String(item?.groupId || "__ungrouped"),
               groupName: item?.groupName || "",
               sector: item?.sector || "",
               studentId: item?.studentId ?? null,
               studentFirst: item?.studentFirst || "",
               studentLast: item?.studentLast || "",
               studentPhone: item?.studentPhone ?? null,
               eventPrivateMessage: item?.eventPrivateMessage || "",
               privateMessage: item?.privateMessage || "",
               color: item?.color || "--default",
               gearboxLabel: item?.gearboxLabel ?? null,
               isConfirmed: !!item?.isConfirmed,
               programareOrigine: null,
               instructorPlateNorm: item?.instructorPlateNorm || "",
               localSlotKey: item?.localSlotKey || "",
               raw,
               searchNorm: item?.searchNorm || "",
               searchPhoneDigits: item?.searchPhoneDigits || "",
            });
         }

         byDay.set(dayTs, items);
      }

      return byDay;
   }, [
      canUseMonthIndexWorker,
      isDummyMode,
      monthIndexReadyForCurrentMonth,
      monthIndexWorkerResult.dayEntries,
      monthIndexSnapshot,
   ]);

   const mapReservationToEvent = useCallback(
      (r, startDateOverride) => {
         const start =
            startDateOverride ||
            toFloatingDate(getReservationStartRaw(r));
         if (!start || isNaN(start)) return null;

         const endRaw = getReservationEndRaw(r);
         const endParsed = endRaw ? toFloatingDate(endRaw) : null;
         const end =
            endParsed && endParsed.getTime() > start.getTime()
               ? endParsed
               : new Date(start.getTime() + LESSON_MINUTES * 60000);

         const instIdStr = getReservationInstructorId(r) || "__unknown";
         const groupIdRaw = getReservationGroupId(r);
         const studentId = getReservationStudentId(r);
         const eventIdRaw = getReservationId(r);
         const eventId =
            eventIdRaw != null
               ? String(eventIdRaw)
               : `${instIdStr}|${start.toISOString()}`;

         const fromStore = studentDict ? studentDict.get(studentId) : null;
         const userObj =
            r.user || r.student || r.client || r.reservation?.user || {};

         const first = fromStore?.firstName ?? userObj.firstName ?? "";
         const last = fromStore?.lastName ?? userObj.lastName ?? "";
         const phone =
            fromStore?.phone ??
            userObj.phone ??
            userObj.phoneNumber ??
            userObj.mobile ??
            null;
         const studentPrivateMsg = fromStore?.privateMessage ?? "";

         const groupName = (() => {
            if (!groupIdRaw) return "";
            const g = instructorsGroupDict.get(String(groupIdRaw));
            if (!g) return "";
            return g.name || `Grupa ${g.id}`;
         })();

         const instMetaLocal = instructorMeta.get(instIdStr) || {};
         const gearboxNorm = (r.gearbox || instMetaLocal.gearbox || "")
            .toString()
            .toLowerCase();
         const gearboxLabel = gearboxNorm
            ? gearboxNorm.includes("auto")
               ? "A"
               : gearboxNorm.includes("man")
                 ? "M"
                 : r.gearbox
            : null;

         const instPlateNorm = normPlate(instMetaLocal.plateRaw || "");
         const localSlotKey = localKeyFromTs(start);

         const fallbackName =
            r.clientName || r.customerName || r.name || "Programare";
         const fullName = `${first} ${last}`.trim() || fallbackName;

         const allNotesRaw = [
            studentPrivateMsg,
            r.privateMessage,
            r.privateMessaje,
            r.comment,
         ]
            .filter(Boolean)
            .join(" ");

         const searchNorm = norm(
            [fullName, groupName, instMetaLocal?.name, allNotesRaw]
               .filter(Boolean)
               .join(" "),
         );
         const searchPhoneDigits = digitsOnly(
            phone ??
               r.clientPhone ??
               r.phoneNumber ??
               r.phone ??
               r.telefon ??
               "",
         );

         return {
            id: eventId,
            title: "Programare",
            start,
            end,
            instructorId: instIdStr,
            groupId: groupIdRaw != null ? String(groupIdRaw) : "__ungrouped",
            groupName,
            sector: r.sector || "",
            studentId,
            studentFirst: first,
            studentLast: last,
            studentPhone: phone,
            eventPrivateMessage: r.privateMessage || "",
            privateMessage: studentPrivateMsg,
            color: r.color || "--default",
            gearboxLabel,
            isConfirmed: !!r.isConfirmed,
            programareOrigine: null,
            instructorPlateNorm: instPlateNorm,
            localSlotKey,
            raw: r,
            searchNorm,
            searchPhoneDigits,
         };
      },
      [instructorsGroupDict, instructorMeta, studentDict],
   );

   const eventsByDayFallback = useMemo(() => {
      if (isDummyMode) return EMPTY_MAP;
      if (canUseMonthIndexWorker && monthIndexReadyForCurrentMonth) {
         return EMPTY_MAP;
      }

      const map = new Map();

      (reservationsForCurrentMonth || []).forEach(({ r, start }) => {
         const ts = startOfDayTs(start);
         if (!map.has(ts)) map.set(ts, []);

         const ev = mapReservationToEvent(r, start);
         if (ev) map.get(ts).push(ev);
      });

      map.forEach((arr) =>
         arr.sort((a, b) => {
            const aStartMs =
               a?.start instanceof Date
                  ? a.start.getTime()
                  : new Date(a?.start || 0).getTime();
            const bStartMs =
               b?.start instanceof Date
                  ? b.start.getTime()
                  : new Date(b?.start || 0).getTime();

            const safeAStart = Number.isFinite(aStartMs) ? aStartMs : 0;
            const safeBStart = Number.isFinite(bStartMs) ? bStartMs : 0;
            if (safeAStart !== safeBStart) return safeAStart - safeBStart;

            const aInstId = String(
               a?.instructorId ?? a?.raw?.instructorId ?? a?.raw?.instructor_id ?? "",
            );
            const bInstId = String(
               b?.instructorId ?? b?.raw?.instructorId ?? b?.raw?.instructor_id ?? "",
            );
            if (aInstId !== bInstId) return aInstId < bInstId ? -1 : 1;

            const aId = String(a?.id ?? a?.raw?.id ?? "");
            const bId = String(b?.id ?? b?.raw?.id ?? "");
            if (aId !== bId) return aId < bId ? -1 : 1;

            const aLocalSlot = String(a?.localSlotKey || "");
            const bLocalSlot = String(b?.localSlotKey || "");
            if (aLocalSlot !== bLocalSlot) return aLocalSlot < bLocalSlot ? -1 : 1;

            return 0;
         }),
      );
      return map;
   }, [
      canUseMonthIndexWorker,
      isDummyMode,
      monthIndexReadyForCurrentMonth,
      reservationsForCurrentMonth,
      mapReservationToEvent,
   ]);

   const eventsByDay = useMemo(() => {
      if (
         canUseMonthIndexWorker &&
         !isDummyMode &&
         monthIndexReadyForCurrentMonth
      ) {
         return eventsByDayWorker;
      }
      return eventsByDayFallback;
   }, [
      canUseMonthIndexWorker,
      isDummyMode,
      monthIndexReadyForCurrentMonth,
      eventsByDayWorker,
      eventsByDayFallback,
   ]);

   const SECTOR_CANON = {
      botanica: "Botanica",
      ciocana: "Ciocana",
      buiucani: "Buiucani",
   };

   function canonSector(val) {
      if (!val) return null;
      const s = norm(val);
      if (s.includes("botanica")) return SECTOR_CANON.botanica;
      if (s.includes("ciocana")) return SECTOR_CANON.ciocana;
      if (s.includes("buiucani")) return SECTOR_CANON.buiucani;
      return null;
   }

   function resolveSectorForCreate({ ev, instId, gObj, instructorMeta }) {
      const fromEv = canonSector(ev?.sector);
      if (fromEv) return fromEv;

      const meta = instructorMeta?.get?.(String(instId || "")) || {};
      const fromMeta = canonSector(
         meta.sectorNorm || meta.sector || meta.location,
      );
      if (fromMeta) return fromMeta;

      const fromGroup = canonSector(gObj?.sector || gObj?.location);
      if (fromGroup) return fromGroup;

      return "Botanica";
   }

   /* ===================== CREATE from empty slot (FIXED) ===================== */
   const handleCreateFromEmpty = useCallback(
      (ev) => {
         const instIdRaw = String(ev.instructorId ?? "");
         const isUnknown = instIdRaw === "__unknown";
         const instId = isUnknown ? null : instIdRaw;

         const meta = instId ? instructorMeta.get(instId) || {} : {};

         const grpId =
            ev.groupId && ev.groupId !== "__ungrouped"
               ? String(ev.groupId)
               : instId
                 ? findGroupForInstructor(instId)
                 : null;

         const gObj =
            (instructorsGroups || []).find(
               (g) => String(g.id) === String(grpId),
            ) || null;

         const sectorVal = resolveSectorForCreate({
            ev,
            instId,
            gObj,
            instructorMeta,
         });

         const gbLabel = (meta.gearbox || "").toLowerCase().includes("auto")
            ? "Automat"
            : "Manual";

         // ✅ start ISO (UTC) + cheie fixă pentru draft
         const startIso = normalizeIso(ev.start);
         const draftSlotKey = instId
            ? buildDraftSlotKey(instId, startIso)
            : null;

         // ✅ trimitem explicit ziua/ora locală (ca popup să nu greșească ziua)
         const dLocal = new Date(ev.start);
         const initialDate = `${dLocal.getFullYear()}-${String(
            dLocal.getMonth() + 1,
         ).padStart(2, "0")}-${String(dLocal.getDate()).padStart(2, "0")}`;
         const initialTime = `${String(dLocal.getHours()).padStart(
            2,
            "0",
         )}:${String(dLocal.getMinutes()).padStart(2, "0")}`;

         // ✅ pornește draft presence imediat (instant vizual)
         if (instId && startIso) {
            try {
               startCreateDraftSafe(instId, startIso, {
                  sector: sectorVal,
                  gearbox: gbLabel,
               });
            } catch {}
         }

         if (typeof window !== "undefined") {
            try {
               window.dispatchEvent(new CustomEvent("dvcancelinertia-all"));
            } catch {}
         }

         openPopup("createRezervation", {
            start: ev.start,
            end: ev.end,

            instructorId: instId,
            sector: sectorVal,
            gearbox: meta.gearbox || null,

            initialStartTime: startIso,
            initialDate, // ✅
            initialTime, // ✅
            initialInstructorId: instId,
            initialSector: sectorVal,
            initialGearbox: gbLabel,

            // ✅ cheie fixă pentru join/leave în popup
            draftSlotKey,
         });
      },
      [
         instructorMeta,
         instructorsGroups,
         findGroupForInstructor,
         startCreateDraftSafe,
      ],
   );

   /* ===================== BUS LISTENER (with blackouts-changed) ===================== */
   const focusRequestRef = useRef(null);
   const [focusToken, setFocusToken] = useState(0);

   // ✅ blackouts: ref ca să putem reîncărca din bus listener
   const ensureBlackoutsForRef = useRef(null);

   // ====== DAYS list ======
   const allAllowedDays = useMemo(() => {
      const base = new Date(currentDate);
      const year = base.getFullYear();
      const month = base.getMonth();
      const first = new Date(year, month, 1);
      const out = [];
      let d = new Date(first);
      while (d.getMonth() === month) {
         out.push(new Date(d));
         d.setDate(d.getDate() + 1);
      }
      return out;
   }, [currentDate]);

   const loadedDays = allAllowedDays;
   const loadedDayTimestamps = useMemo(
      () => loadedDays.map((d) => startOfDayTs(d)),
      [loadedDays],
   );
   const dayWidthForTrack = useMemo(
      () => maxColsPerGroup * px(COL_W) * zoom,
      [maxColsPerGroup, zoom],
   );
   const dayStrideForTrack = dayWidthForTrack + TRACK_DAY_GAP_PX;

   const recomputeVisibleDays = useCallback((options = {}) => {
      if (DISABLE_DAY_LAZY_LOAD) return;

      const expandOnly = !!options.expandOnly;
      const extraOverscan = Math.max(
         0,
         Math.trunc(Number(options.extraOverscan) || 0),
      );
      const extraOverscanBefore = Math.max(
         0,
         Math.trunc(Number(options.extraOverscanBefore) || 0),
      );
      const extraOverscanAfter = Math.max(
         0,
         Math.trunc(Number(options.extraOverscanAfter) || 0),
      );
      const scroller = scrollRef.current;
      if (!scroller) return;

      const total = loadedDayTimestamps.length;
      if (!total) {
         setVisibleDays((prev) => (prev.size ? new Set() : prev));
         return;
      }

      const stride = dayStrideForTrack > 0 ? dayStrideForTrack : 1;
      const viewLeft = Math.max(0, scroller.scrollLeft || 0);
      const viewRight = viewLeft + Math.max(0, scroller.clientWidth || 0);

      const overscanBefore =
         VISIBLE_DAYS_OVERSCAN + extraOverscan + extraOverscanBefore;
      const overscanAfter =
         VISIBLE_DAYS_OVERSCAN + extraOverscan + extraOverscanAfter;
      const rawStart = Math.floor(viewLeft / stride) - overscanBefore;
      const rawEnd = Math.ceil(viewRight / stride) + overscanAfter;
      const startIdx = Math.max(0, rawStart);
      const endIdx = Math.min(total - 1, rawEnd);

      setVisibleDays((prev) => {
         const next = expandOnly ? new Set(prev) : new Set();
         for (let i = startIdx; i <= endIdx; i++) {
            next.add(loadedDayTimestamps[i]);
         }

         if (!expandOnly && !next.size && loadedDayTimestamps.length) {
            const maxInit = 7;
            for (
               let i = 0;
               i < loadedDayTimestamps.length && i < maxInit;
               i++
            ) {
               next.add(loadedDayTimestamps[i]);
            }
         }

         if (setsEqual(next, prev)) return prev;
         return next;
      });
   }, [loadedDayTimestamps, dayStrideForTrack]);

   useEffect(() => {
      if (DISABLE_DAY_LAZY_LOAD) return;
      stickyVisibleDaysStampRef.current.clear();
      stickyVisibleDaysCounterRef.current = 0;
      setStickyVisibleDays((prev) => (prev.size ? new Set() : prev));
   }, [loadedDays]);

   useEffect(() => {
      if (DISABLE_DAY_LAZY_LOAD) return;
      if (!visibleDays.size) return;
      setStickyVisibleDays((prev) => {
         const stamps = stickyVisibleDaysStampRef.current;
         let counter = stickyVisibleDaysCounterRef.current || 0;

         visibleDays.forEach((ts) => {
            counter += 1;
            stamps.set(ts, counter);
         });
         stickyVisibleDaysCounterRef.current = counter;

         if (stamps.size > STICKY_VISIBLE_DAYS_LIMIT) {
            const recentKeys = Array.from(stamps.entries())
               .sort((a, b) => (b[1] || 0) - (a[1] || 0))
               .slice(0, STICKY_VISIBLE_DAYS_LIMIT)
               .map(([ts]) => ts);
            const keep = new Set(recentKeys);
            for (const key of Array.from(stamps.keys())) {
               if (!keep.has(key)) stamps.delete(key);
            }
         }

         const next = new Set(stamps.keys());
         if (setsEqual(next, prev)) return prev;
         return next;
      });
   }, [visibleDays]);

   const scheduleHydrationPump = useCallback(() => {
      if (hydrationRafRef.current) return;

      const tick = () => {
         hydrationRafRef.current = 0;
         const batch = isPanInteracting
            ? HYDRATE_DAYS_BATCH_PAN
            : HYDRATE_DAYS_BATCH_IDLE;
         if (batch <= 0) return;

         setHydratedDays((prev) => {
            const queue = hydrationQueueRef.current;
            if (!queue.length) return prev;

            let next = prev;
            let changed = false;
            let added = 0;

            while (queue.length && added < batch) {
               const ts = Number(queue.shift() || 0);
               if (!ts || next.has(ts)) continue;
               if (!changed) {
                  next = new Set(prev);
                  changed = true;
               }
               next.add(ts);
               added += 1;
            }

            return changed ? next : prev;
         });

         if (hydrationQueueRef.current.length) {
            hydrationRafRef.current = requestAnimationFrame(tick);
         }
      };

      hydrationRafRef.current = requestAnimationFrame(tick);
   }, [isPanInteracting]);

   useEffect(() => {
      return () => {
         if (hydrationRafRef.current) {
            cancelAnimationFrame(hydrationRafRef.current);
            hydrationRafRef.current = 0;
         }
      };
   }, []);

   useEffect(() => {
      if (hydrationRafRef.current) {
         cancelAnimationFrame(hydrationRafRef.current);
         hydrationRafRef.current = 0;
      }
      hydrationQueueRef.current = [];

      if (DISABLE_DAY_LAZY_LOAD) {
         const next = new Set(loadedDayTimestamps);
         hydratedDaysRef.current = next;
         setHydratedDays(next);
         return;
      }

      setHydratedDays((prev) => (prev.size ? new Set() : prev));
   }, [loadedDayTimestamps]);

   const hydrationTargetDays = useMemo(() => {
      if (DISABLE_DAY_LAZY_LOAD) return new Set(loadedDayTimestamps);

      const target = new Set(visibleDays);
      stickyVisibleDays.forEach((ts) => target.add(ts));
      return target;
   }, [
      loadedDayTimestamps,
      visibleDays,
      stickyVisibleDays,
   ]);

   const buildHydrationPlan = useCallback(
      (targetSet) => {
         if (!targetSet || !targetSet.size) return [];

         const total = loadedDayTimestamps.length;
         if (!total) return [];

         const stride = dayStrideForTrack > 0 ? dayStrideForTrack : 1;
         const scroller = scrollRef.current;
         const centerIdx = scroller
            ? Math.max(
                 0,
                 Math.min(
                    total - 1,
                    Math.floor(
                       ((scroller.scrollLeft || 0) + (scroller.clientWidth || 0) * 0.5) /
                          stride,
                    ),
                 ),
              )
            : 0;

         const ranked = [];
         for (let i = 0; i < total; i++) {
            const ts = loadedDayTimestamps[i];
            if (!targetSet.has(ts)) continue;
            ranked.push({ ts, idx: i, dist: Math.abs(i - centerIdx) });
         }

         ranked.sort((a, b) => {
            if (a.dist !== b.dist) return a.dist - b.dist;
            return a.idx - b.idx;
         });
         return ranked.map((x) => x.ts);
      },
      [loadedDayTimestamps, dayStrideForTrack],
   );

   useEffect(() => {
      if (DISABLE_DAY_LAZY_LOAD) return;

      const ordered = buildHydrationPlan(hydrationTargetDays);
      if (!ordered.length) {
         hydrationQueueRef.current = [];
         return;
      }

      const hydratedNow = hydratedDaysRef.current;
      const missing = ordered.filter((ts) => !hydratedNow.has(ts));
      if (!missing.length) {
         hydrationQueueRef.current = [];
         return;
      }

      const immediateCount = isPanInteracting
         ? HYDRATE_DAYS_IMMEDIATE_PAN
         : HYDRATE_DAYS_IMMEDIATE_IDLE;
      const immediate =
         immediateCount > 0 ? missing.slice(0, immediateCount) : EMPTY_RESERVATIONS;
      const queued = missing.slice(immediate.length);

      if (immediate.length) {
         setHydratedDays((prev) => {
            let next = prev;
            let changed = false;
            for (const ts of immediate) {
               if (next.has(ts)) continue;
               if (!changed) {
                  next = new Set(prev);
                  changed = true;
               }
               next.add(ts);
            }
            return changed ? next : prev;
         });
      }

      hydrationQueueRef.current = queued;
      if (queued.length) {
         scheduleHydrationPump();
      }
   }, [
      buildHydrationPlan,
      hydrationTargetDays,
      isPanInteracting,
      scheduleHydrationPump,
   ]);

   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;

      const lockPanVirtualization = (ev) => {
         const pointerType = String(ev?.detail?.pointerType || "")
            .trim()
            .toLowerCase();
         panInputTypeRef.current = pointerType || "mouse";
         isPanVirtualizationLockedRef.current = true;
         setIsPanInteracting(true);
         lastVisibleDaysScrollLeftRef.current = -1;
         lastVisibleDaysUpdateTsRef.current = 0;
         lastViewportUpdateTsRef.current = 0;

         // Păstrăm viewport-ul sincronizat și în pan, fără a forța full redraw pe Y.
         const left = el.scrollLeft || 0;
         const top = el.scrollTop || 0;
         const width = el.clientWidth || 0;
         const height = el.clientHeight || 0;
         lastViewportScrollTopRef.current = top;
         setScrollViewport((prev) => {
            if (
               prev.left === left &&
               prev.top === top &&
               prev.width === width &&
               prev.height === height
            ) {
               return prev;
            }
            return { left, top, width, height };
         });

         // În pan actualizăm rapid fereastra de zile cu un overscan mic.
         recomputeVisibleDays({
            expandOnly: false,
            extraOverscan: 0,
            extraOverscanBefore: 0,
            extraOverscanAfter: 0,
         });
      };

      const unlockPanVirtualization = () => {
         panInputTypeRef.current = "mouse";
         isPanVirtualizationLockedRef.current = false;
         setIsPanInteracting(false);
         lastVisibleDaysUpdateTsRef.current = 0;
         lastViewportUpdateTsRef.current = 0;

         const left = el.scrollLeft || 0;
         const top = el.scrollTop || 0;
         const width = el.clientWidth || 0;
         const height = el.clientHeight || 0;
         lastViewportScrollTopRef.current = top;
         setScrollViewport((prev) => {
            if (
               prev.left === left &&
               prev.top === top &&
               prev.width === width &&
               prev.height === height
            ) {
               return prev;
            }
            return { left, top, width, height };
         });

         // După pan refacem normal fereastra de zile.
         recomputeVisibleDays({ expandOnly: false });
      };

      el.addEventListener("dvpanstart", lockPanVirtualization);
      el.addEventListener("dvpanend", unlockPanVirtualization);

      return () => {
         el.removeEventListener("dvpanstart", lockPanVirtualization);
         el.removeEventListener("dvpanend", unlockPanVirtualization);
         setIsPanInteracting(false);
      };
   }, [recomputeVisibleDays]);

   const centerDayTsInScroller = useCallback(
      (targetDayTs) => {
         const scroller = scrollRef.current;
         if (!scroller || targetDayTs == null) return;

         const targetTsNum = Number(targetDayTs);
         const targetIdx = loadedDays.findIndex(
            (d) => startOfDayTs(d) === targetTsNum,
         );
         if (targetIdx < 0) return;

         const dayEl = dayRefs.current.get(targetTsNum);
         const scrollerWidth = scroller.clientWidth || 0;
         const scrollWidth = scroller.scrollWidth || 0;

         const dayWidth = dayEl?.offsetWidth || dayWidthForTrack || 0;
         const dayLeft =
            dayEl?.offsetLeft ||
            Math.max(0, targetIdx * Math.max(1, dayStrideForTrack));

         let nextLeft = dayLeft - (scrollerWidth - dayWidth) / 2;
         if (nextLeft < 0) nextLeft = 0;

         const maxLeft =
            scrollWidth > scrollerWidth ? scrollWidth - scrollerWidth : 0;
         if (nextLeft > maxLeft) nextLeft = maxLeft;

         if (Math.abs(nextLeft - scroller.scrollLeft) > 1) {
            scroller.scrollLeft = nextLeft;
         }
      },
      [loadedDays, dayStrideForTrack, dayWidthForTrack],
   );

   const centerDayTsInScrollerReliable = useCallback(
      (targetDayTs) => {
         if (targetDayTs == null) return;

         const run = () => centerDayTsInScroller(targetDayTs);
         if (typeof window === "undefined") {
            run();
            return;
         }

         window.requestAnimationFrame(run);
         window.requestAnimationFrame(() => {
            window.requestAnimationFrame(run);
         });
         window.setTimeout(run, 120);
         window.setTimeout(run, 260);
      },
      [centerDayTsInScroller],
   );

   const blackoutKeyMapRef = useRef(new Map());
   const blackoutInFlightRef = useRef(new Set());
   const [blackoutVer, setBlackoutVer] = useState(0);
   const blackoutBumpTimerRef = useRef(0);
   const blackoutLastBumpTsRef = useRef(0);
   const blackoutPrefetchRunRef = useRef(0);

   const requestBlackoutVersionBump = useCallback((force = false) => {
      const now =
         typeof performance !== "undefined" ? performance.now() : Date.now();

      const flushNow = () => {
         blackoutLastBumpTsRef.current = now;
         setBlackoutVer((v) => v + 1);
      };

      if (force) {
         if (blackoutBumpTimerRef.current) {
            clearTimeout(blackoutBumpTimerRef.current);
            blackoutBumpTimerRef.current = 0;
         }
         flushNow();
         return;
      }

      const elapsed = now - (blackoutLastBumpTsRef.current || 0);
      if (elapsed >= BLACKOUT_BUMP_MIN_MS && !blackoutBumpTimerRef.current) {
         flushNow();
         return;
      }

      if (blackoutBumpTimerRef.current) return;
      const waitMs = Math.max(12, BLACKOUT_BUMP_MIN_MS - elapsed);
      blackoutBumpTimerRef.current = window.setTimeout(() => {
         blackoutBumpTimerRef.current = 0;
         blackoutLastBumpTsRef.current =
            typeof performance !== "undefined" ? performance.now() : Date.now();
         setBlackoutVer((v) => v + 1);
      }, waitMs);
   }, []);

   useEffect(() => {
      return () => {
         if (blackoutBumpTimerRef.current) {
            clearTimeout(blackoutBumpTimerRef.current);
            blackoutBumpTimerRef.current = 0;
         }
      };
   }, []);

   const currentMonthValue = useMemo(() => {
      const d = new Date(currentDate);
      const y = d.getFullYear();
      const m = d.getMonth();
      return `${y}-${String(m + 1).padStart(2, "0")}`;
   }, [currentDate]);

   useEffect(() => {
      if (typeof window === "undefined") return;
      try {
         localStorage.setItem(LS_DV_MONTH_KEY, currentMonthValue);
      } catch {}
   }, [currentMonthValue]);

   const monthRange = useMemo(
      () => getMonthRangeYMD(currentDate),
      [currentDate],
   );

   const monthQueryArgs = useMemo(
      () => ({
         date: currentDate,
         extraFilters: extraFilters || {},
      }),
      [currentDate, extraFilters],
   );

   const { data: monthReservationsData, isFetching: monthReservationsFetching } =
      useGetReservationsForMonthQuery(monthQueryArgs, {
         refetchOnMountOrArgChange: true,
         refetchOnReconnect: true,
      });

   useEffect(() => {
      if (!monthReservationsData) return;
      dispatch(setReservationsFromMonthQuery(monthReservationsData));
   }, [dispatch, monthReservationsData]);

   useEffect(() => {
      blackoutKeyMapRef.current = new Map();
      blackoutInFlightRef.current = new Set();
      requestBlackoutVersionBump(true);
      blackoutPrefetchRunRef.current += 1;
   }, [currentMonthValue, requestBlackoutVersionBump]);
   // ✅ Scroll state (X/Y) per lună — persist + restore din localStorage
   const scrollPosRef = useRef({ x: 0, y: 0 });
   const scrollSaveTimerRef = useRef(null);

   // ca să nu re-restaurăm la infinit
   const restoredScrollRef = useRef({ monthKey: null, dataReady: null });
   const forceMonthScrollResetRef = useRef(false);
   const pendingMonthJumpRef = useRef(null);
   const initialAutoRevealRef = useRef({ monthKey: "", done: false });

   useEffect(() => {
      initialAutoRevealRef.current = {
         monthKey: currentMonthValue,
         done: false,
      };
   }, [currentMonthValue]);

   const persistScrollNow = useCallback(() => {
      if (orderEditOpen) return; // NU salvăm când e editorul deschis
      const x = scrollPosRef.current.x || 0;
      const y = scrollPosRef.current.y || 0;
      safeWriteScrollXY(currentMonthValue, x, y);
   }, [currentMonthValue, orderEditOpen]);

   const schedulePersistScroll = useCallback(
      (x, y) => {
         scrollPosRef.current = { x, y };

         if (orderEditOpen) return;
         if (scrollSaveTimerRef.current)
            clearTimeout(scrollSaveTimerRef.current);

         scrollSaveTimerRef.current = setTimeout(() => {
            persistScrollNow();
         }, 180);
      },
      [orderEditOpen, persistScrollNow],
   );

   useEffect(() => {
      return () => {
         if (scrollSaveTimerRef.current) {
            clearTimeout(scrollSaveTimerRef.current);
            scrollSaveTimerRef.current = null;
         }
      };
   }, []);

   // ✅ RESTORE din localStorage (o dată per lună; re-aplică când treci din dummy -> real)
   useLayoutEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      if (orderEditOpen) return;

      const prev = restoredScrollRef.current;

      const shouldApply =
         prev.monthKey !== currentMonthValue ||
         (prev.monthKey === currentMonthValue &&
            prev.dataReady === false &&
            dataReady === true);

      if (!shouldApply) return;

      const shouldForceReset = forceMonthScrollResetRef.current;
      const saved = shouldForceReset
         ? { x: 0, y: 0 }
         : safeReadScrollXY(currentMonthValue);
      forceMonthScrollResetRef.current = false;

      restoredScrollRef.current = {
         monthKey: currentMonthValue,
         dataReady,
      };

      if (!saved) {
         const syncWithoutSavedPosition = () => {
            const x = el.scrollLeft || 0;
            const y = el.scrollTop || 0;
            scrollPosRef.current = { x, y };
            try {
               recomputeVisibleDays({ extraOverscan: 0 });
            } catch {}
         };

         requestAnimationFrame(() =>
            requestAnimationFrame(syncWithoutSavedPosition),
         );

         if (!pendingMonthJumpRef.current) {
            pendingMonthJumpRef.current = currentMonthValue;
         }
         return;
      }

      const apply = () => {
         const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
         const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);

         const x = Math.max(0, Math.min(saved.x || 0, maxLeft));
         const y = Math.max(0, Math.min(saved.y || 0, maxTop));

         el.scrollLeft = x;
         el.scrollTop = y;

         scrollPosRef.current = { x, y };
         // ajută la visibleDays după restore
         try {
            recomputeVisibleDays();
         } catch {}
      };

      // 2 rAF = layout stabil (după ce se calculează width/height)
      requestAnimationFrame(() => requestAnimationFrame(apply));
   }, [currentMonthValue, orderEditOpen, dataReady, recomputeVisibleDays]);

   const instIdsAll = useMemo(() => {
      if (isDummyMode) return [];
      const ids = new Set();
      (instructors || []).forEach((i) => {
         const iid = String(i?.id || "");
         if (iid && !iid.startsWith("__pad_")) ids.add(iid);
      });
      return Array.from(ids);
   }, [isDummyMode, instructors]);

   const ensureBlackoutsFor = useCallback(
      async (instId, options = {}) => {
         const deferVersionBump = options?.deferVersionBump === true;
         const key = String(instId || "").trim();
         if (!key) return false;

         if (blackoutKeyMapRef.current.has(key)) return false;
         if (blackoutInFlightRef.current.has(key)) return false;

         blackoutInFlightRef.current.add(key);
         let changed = false;

         try {
            let list;

            try {
               list = await getInstructorBlackouts(key, monthRange);
            } catch {
               list = await getInstructorBlackouts(key);
            }

            const set = new Set();

            for (const b of list || []) {
               const type = String(b?.type || "").toUpperCase();

               if (type === "REPEAT") {
                  for (const k of expandRepeatLocalKeys(b)) set.add(k);
               } else {
                  const dt = getBlackoutDT(b);
                  if (!dt) continue;
                  const k = busyLocalKeyFromStored(dt);
                  if (k) set.add(k);
               }
            }

            blackoutKeyMapRef.current.set(key, set);
            changed = true;
         } catch (e) {
            console.error("getInstructorBlackouts error for", key, e);

            blackoutKeyMapRef.current.set(key, new Set());
            changed = true;
         } finally {
            blackoutInFlightRef.current.delete(key);
         }

         if (changed && !deferVersionBump) {
            requestBlackoutVersionBump();
         }
         return changed;
      },
      [monthRange, requestBlackoutVersionBump],
   );

   // ✅ ținem ref actual pentru bus listener
   useEffect(() => {
      ensureBlackoutsForRef.current = ensureBlackoutsFor;
   }, [ensureBlackoutsFor]);

   useEffect(() => {
      if (!instIdsAll.length) return;
      if (!DISABLE_DAY_LAZY_LOAD && !visibleDaysCount) return;
      if (isPanInteracting) return;

      const runId = blackoutPrefetchRunRef.current + 1;
      blackoutPrefetchRunRef.current = runId;
      const queue = instIdsAll.slice();
      let index = 0;
      let active = 0;
      let cancelled = false;

      const schedulePump = () => {
         if (cancelled || blackoutPrefetchRunRef.current !== runId) return;
         if (typeof window !== "undefined" && "requestIdleCallback" in window) {
            window.requestIdleCallback(
               () => pump(),
               { timeout: IS_LOW_SPEC_DEVICE ? 180 : 120 },
            );
         } else {
            setTimeout(pump, 0);
         }
      };

      const runPrefetchForInstructor = (iid) => {
         Promise.resolve(
            ensureBlackoutsFor(iid, {
               deferVersionBump: true,
            }),
         )
            .then((changed) => {
               if (changed) requestBlackoutVersionBump();
            })
            .catch(() => {})
            .finally(() => {
               active -= 1;
               if (cancelled || blackoutPrefetchRunRef.current !== runId) return;
               if (index >= queue.length && active <= 0) return;
               schedulePump();
            });
      };

      const pump = () => {
         if (cancelled || blackoutPrefetchRunRef.current !== runId) return;
         while (
            active < BLACKOUT_PREFETCH_CONCURRENCY &&
            index < queue.length
         ) {
            const iid = queue[index++];
            active += 1;
            runPrefetchForInstructor(iid);
         }
      };

      pump();

      return () => {
         cancelled = true;
         blackoutPrefetchRunRef.current += 1;
      };
   }, [
      instIdsAll,
      ensureBlackoutsFor,
      visibleDaysCount,
      isPanInteracting,
      requestBlackoutVersionBump,
   ]);

   // ✅ BUS listener (cu blackouts-changed)
   useEffect(() => {
      return listenCalendarRefresh((payload) => {
         // ✅ blackouts changed: invalidează cache + re-fetch doar pentru instructor
         if (payload?.type === "blackout-slot-patch") {
            const iid =
               payload?.instructorId != null
                  ? String(payload.instructorId)
                  : "";
            const slotKey =
               payload?.slotKey != null ? String(payload.slotKey) : "";
            const op = String(payload?.op || "").toLowerCase(); // "add" | "remove"
            if (iid && slotKey) {
               const map0 = blackoutKeyMapRef.current;
               const prevSet =
                  map0.get(iid) instanceof Set ? map0.get(iid) : new Set();
               const nextSet = new Set(prevSet); // IMPORTANT: new ref
               if (op === "add") nextSet.add(slotKey);
               else nextSet.delete(slotKey);

               map0.set(iid, nextSet);
            }
            setBlackoutVer((v) => v + 1);

            // ✅ forțează invalidare/redraw (nu refetch reservations)
            scheduleCalendarRefresh({
               source: "blackout",
               type: "redraw",
               forceReload: false,
            });

            // ✅ opțional: confirmare rapidă (refetch doar pt instructor)
            try {
               blackoutKeyMapRef.current?.delete?.(iid);
               blackoutInFlightRef.current?.delete?.(iid);
               ensureBlackoutsForRef.current?.(iid);
            } catch {}

            return;
         }
         if (payload?.type === "blackouts-changed") {
            const iid =
               payload?.instructorId != null
                  ? String(payload.instructorId)
                  : "";
            if (iid) {
               blackoutKeyMapRef.current?.delete?.(iid);
               blackoutInFlightRef.current?.delete?.(iid);
               try {
                  ensureBlackoutsForRef.current?.(iid);
               } catch {}
            } else {
               blackoutKeyMapRef.current = new Map();
               blackoutInFlightRef.current = new Set();
            }

            requestBlackoutVersionBump();
            return; // IMPORTANT: nu refetch reservations
         }

         if (!payload || payload.forceReload !== false) {
            runReservationsRefresh(payload?.type || "bus");
         }

         if (
            payload?.type === "reservation-created" &&
            payload?.reservationId
         ) {
            joinReservationSafe(payload.reservationId);
         }

         if (payload?.type === "focus-reservation") {
            focusRequestRef.current = payload;
            setFocusToken((t) => t + 1);
         }
      });
   }, [
      runReservationsRefresh,
      joinReservationSafe,
      requestBlackoutVersionBump,
   ]);

   const standardSlotsByDay = useMemo(() => {
      const map = new Map();
      loadedDays.forEach((d) => {
         const ts = startOfDayTs(d);
         map.set(ts, mkStandardSlotsForDay(d));
      });
      return map;
   }, [loadedDays, mkStandardSlotsForDay]);
   const calendarViewModel = useMemo(
      () => ({
         eventsByDay,
         instIdsAll,
         standardSlotsByDay,
         blackoutKeyMap: blackoutKeyMapRef.current,
         blackoutVer,
      }),
      [eventsByDay, instIdsAll, standardSlotsByDay, blackoutVer],
   );

   useEffect(() => {
      const pendingMonthKey = pendingMonthJumpRef.current;
      if (!pendingMonthKey || pendingMonthKey !== currentMonthValue) return;
      if (reservationsLoading) return;
      if (!monthIndexReadyForCurrentMonth) return;

      const firstDayWithEvents =
         loadedDays.find((day) => {
            const dayTs = startOfDayTs(day);
            const list = eventsByDay.get(dayTs);
            return Array.isArray(list) && list.length > 0;
         }) || null;

      const monthItems = Array.isArray(monthReservationsData?.items)
         ? monthReservationsData.items
         : null;
      const monthHasItems = Array.isArray(monthItems) && monthItems.length > 0;

      // dacă backendul confirmă rezervări dar proiecția pe zi încă nu e gata,
      // păstrăm pending și reîncercăm la următorul render.
      if (!firstDayWithEvents && monthHasItems) return;

      pendingMonthJumpRef.current = null;

      const targetDayTs = firstDayWithEvents
         ? startOfDayTs(firstDayWithEvents)
         : null;
      if (targetDayTs == null) return;

      centerDayTsInScrollerReliable(targetDayTs);
   }, [
      currentMonthValue,
      reservationsLoading,
      monthIndexReadyForCurrentMonth,
      loadedDays,
      eventsByDay,
      monthReservationsData,
      centerDayTsInScrollerReliable,
   ]);

   useEffect(() => {
      const marker = initialAutoRevealRef.current;
      if (!marker || marker.monthKey !== currentMonthValue || marker.done) return;
      if (reservationsLoading || monthReservationsFetching) return;

      const firstDayWithEvents =
         loadedDays.find((day) => {
            const dayTs = startOfDayTs(day);
            const list = eventsByDay.get(dayTs);
            return Array.isArray(list) && list.length > 0;
         }) || null;

      const monthItems = Array.isArray(monthReservationsData?.items)
         ? monthReservationsData.items
         : null;
      const monthItemsKnown = Array.isArray(monthItems);
      const monthHasItems = monthItemsKnown && monthItems.length > 0;

      if (!firstDayWithEvents) {
         if (!monthItemsKnown) return;
         if (monthHasItems) return;
         marker.done = true;
         return;
      }

      marker.done = true;

      const scroller = scrollRef.current;
      if (!scroller) return;

      const stride = Math.max(1, Number(dayStrideForTrack) || 1);
      const viewLeft = Math.max(0, scroller.scrollLeft || 0);
      const viewRight = viewLeft + Math.max(1, scroller.clientWidth || 0);
      const startIdx = Math.max(0, Math.floor(viewLeft / stride));
      const endIdx = Math.min(
         loadedDays.length - 1,
         Math.max(startIdx, Math.ceil(viewRight / stride)),
      );

      let viewportHasEvents = false;
      for (let i = startIdx; i <= endIdx; i++) {
         const ts = startOfDayTs(loadedDays[i]);
         const list = eventsByDay.get(ts);
         if (Array.isArray(list) && list.length > 0) {
            viewportHasEvents = true;
            break;
         }
      }

      if (viewportHasEvents) return;
      centerDayTsInScrollerReliable(startOfDayTs(firstDayWithEvents));
   }, [
      currentMonthValue,
      reservationsLoading,
      monthReservationsFetching,
      monthReservationsData,
      loadedDays,
      eventsByDay,
      dayStrideForTrack,
      centerDayTsInScrollerReliable,
   ]);

   const monthOptions = useMemo(() => {
      const base = new Date(monthAnchorDate);
      if (isNaN(base)) return [];

      const anchorY = base.getFullYear();
      const anchorM = base.getMonth();

      const makeKey = (y, m) => `${y}-${pad2(m + 1)}`;

      const months = [];
      const PAST = 3; // poți ajusta (ex: 6)
      const FUTURE = 3; // poți ajusta (ex: 6)

      for (let delta = -PAST; delta <= FUTURE; delta++) {
         const d = new Date(anchorY, anchorM + delta, 1);
         months.push({
            value: makeKey(d.getFullYear(), d.getMonth()),
            label: d.toLocaleDateString("ro-RO", {
               month: "short",
               year: "numeric",
            }),
            year: d.getFullYear(),
            month: d.getMonth(),
         });
      }

      // ✅ dacă luna inițială (din LS/prop) nu e în fereastra ancorată la "azi",
      // o adăugăm o singură dată, fără să recentrăm lista în jurul ei.
      const initKey = initialMonthKeyRef.current;
      if (initKey && !months.some((o) => o.value === initKey)) {
         const d0 = monthKeyToDate(initKey);
         if (d0 && !isNaN(d0)) {
            months.push({
               value: initKey,
               label: d0.toLocaleDateString("ro-RO", {
                  month: "short",
                  year: "numeric",
               }),
               year: d0.getFullYear(),
               month: d0.getMonth(),
            });

            // păstrăm ordine cronologică
            months.sort(
               (a, b) => a.year * 12 + a.month - (b.year * 12 + b.month),
            );
         }
      }

      return months;
   }, [monthAnchorDate]);

   // === Search state ===
   const [searchInput, setSearchInput] = useState("");
   const [searchState, setSearchState] = useState({
      query: "",
      hits: [],
      index: 0,
   });

   // Focus din exterior
   const [autoFocusEventId, setAutoFocusEventId] = useState(null);

   // curățăm highlight-ul de focus după puțin timp
   useEffect(() => {
      if (!autoFocusEventId) return;
      const t = setTimeout(() => setAutoFocusEventId(null), 1500);
      return () => clearTimeout(t);
   }, [autoFocusEventId]);

   const searchInputRef = useRef(null);

   const workerSearchIndex = useMemo(() => {
      if (!canUseMonthIndexWorker || isDummyMode || !monthIndexReadyForCurrentMonth) {
         return {
            searchCatalog: EMPTY_LIST,
            eventIdToDayTs: EMPTY_ID_TO_DAY_MAP,
         };
      }

      const catalog = Array.isArray(monthIndexWorkerResult.searchCatalog)
         ? monthIndexWorkerResult.searchCatalog
         : EMPTY_LIST;
      const idToDayMap = new Map();
      const rawPairs = Array.isArray(monthIndexWorkerResult.eventIdToDayEntries)
         ? monthIndexWorkerResult.eventIdToDayEntries
         : EMPTY_LIST;

      for (const pair of rawPairs) {
         const eventId = pair?.[0] != null ? String(pair[0]) : "";
         const dayTs = Number(pair?.[1] || 0);
         if (!eventId || !Number.isFinite(dayTs)) continue;
         if (!idToDayMap.has(eventId)) idToDayMap.set(eventId, dayTs);
      }

      return {
         searchCatalog: catalog,
         eventIdToDayTs: idToDayMap,
      };
   }, [
      canUseMonthIndexWorker,
      isDummyMode,
      monthIndexReadyForCurrentMonth,
      monthIndexWorkerResult.searchCatalog,
      monthIndexWorkerResult.eventIdToDayEntries,
   ]);

   const fallbackSearchIndex = useMemo(() => {
      if (
         canUseMonthIndexWorker &&
         !isDummyMode &&
         monthIndexReadyForCurrentMonth
      ) {
         return {
            searchCatalog: EMPTY_LIST,
            eventIdToDayTs: EMPTY_ID_TO_DAY_MAP,
         };
      }

      const catalog = [];
      const idToDayMap = new Map();

      for (const [dayTs, evs] of eventsByDay.entries()) {
         if (!Array.isArray(evs) || !evs.length) continue;

         for (const ev of evs) {
            const eventIdRaw = ev?.id;
            if (eventIdRaw == null) continue;
            const eventId = String(eventIdRaw);

            if (!idToDayMap.has(eventId)) {
               idToDayMap.set(eventId, dayTs);
            }

            catalog.push({
               dayTs,
               eventId,
               searchNorm: ev?.searchNorm || "",
               searchPhoneDigits: ev?.searchPhoneDigits || "",
            });
         }
      }

      return {
         searchCatalog: catalog,
         eventIdToDayTs: idToDayMap,
      };
   }, [
      canUseMonthIndexWorker,
      isDummyMode,
      monthIndexReadyForCurrentMonth,
      eventsByDay,
   ]);

   const searchCatalog =
      canUseMonthIndexWorker &&
      !isDummyMode &&
      monthIndexReadyForCurrentMonth
         ? workerSearchIndex.searchCatalog
         : fallbackSearchIndex.searchCatalog;
   const eventIdToDayTs =
      canUseMonthIndexWorker &&
      !isDummyMode &&
      monthIndexReadyForCurrentMonth
         ? workerSearchIndex.eventIdToDayTs
         : fallbackSearchIndex.eventIdToDayTs;

   // când vine focusRequest (după editare)
   useEffect(() => {
      if (!focusToken) return;

      const req = focusRequestRef.current;
      if (!req || req.type !== "focus-reservation") return;

      const targetId = req.reservationId ? String(req.reservationId) : null;
      if (!targetId) return;

      let sameMonth = true;
      if (req.newStartTime) {
         const d = toFloatingDate(req.newStartTime);
         if (d && !isNaN(d)) {
            const y = d.getFullYear();
            const m = d.getMonth();
            const key = `${y}-${String(m + 1).padStart(2, "0")}`;
            if (key !== currentMonthValue) sameMonth = false;
         }
      }
      if (!sameMonth) return;

      const targetDayTs = eventIdToDayTs.get(targetId) ?? null;
      if (targetDayTs == null) return;

      const toDayKey = (v) => {
         const d = toFloatingDate(v);
         if (!d || Number.isNaN(d.getTime?.())) return "";
         const y = d.getFullYear();
         const m = String(d.getMonth() + 1).padStart(2, "0");
         const day = String(d.getDate()).padStart(2, "0");
         return `${y}-${m}-${day}`;
      };

      const oldDayKey = toDayKey(req.oldStartTime);
      const newDayKey = toDayKey(req.newStartTime);
      const shouldAutoJumpToMovedDay =
         !!oldDayKey && !!newDayKey && oldDayKey !== newDayKey;

      if (!shouldAutoJumpToMovedDay) {
         disarmAutoScrollY();
         setAutoFocusEventId(targetId);
         return;
      }

      armAutoScrollYOnce(targetId, `focus:${focusToken}`);

      setVisibleDays((prev) => {
         const next = new Set(prev);
         const targetIdx = loadedDays.findIndex(
            (d) => startOfDayTs(d) === targetDayTs,
         );

         if (targetIdx === -1) {
            next.add(targetDayTs);
         } else {
            for (
               let i = Math.max(0, targetIdx - 1);
               i <= Math.min(loadedDays.length - 1, targetIdx + 1);
               i++
            ) {
               next.add(startOfDayTs(loadedDays[i]));
            }
         }

         if (next.size === prev.size) return prev;
         return next;
      });

      setAutoFocusEventId(targetId);

      centerDayTsInScrollerReliable(targetDayTs);
   }, [
      focusToken,
      eventIdToDayTs,
      loadedDays,
      currentMonthValue,
      armAutoScrollYOnce,
      disarmAutoScrollY,
      centerDayTsInScrollerReliable,
   ]);

   const handleMonthChange = useCallback(
      (val) => {
         const opt = monthOptions.find((o) => String(o.value) === String(val));
         if (!opt) return;
         const newDate = new Date(opt.year, opt.month, 1);
         const newMonthKey = `${newDate.getFullYear()}-${pad2(newDate.getMonth() + 1)}`;

         setCurrentDate(newDate);
         forceMonthScrollResetRef.current = true;
         pendingMonthJumpRef.current = newMonthKey;

         if (typeof onMonthChange === "function") onMonthChange(newDate);
         restoredScrollRef.current = { monthKey: null, dataReady: null };
         const el = scrollRef.current;
         if (el) {
            el.scrollLeft = 0;
            el.scrollTop = 0;
            scrollPosRef.current = {
               x: 0,
               y: 0,
            };
         }

         disarmAutoScrollY();
         setAutoFocusEventId(null);
         setSearchInput("");
         setSearchState({ query: "", hits: [], index: 0 });
         setVisibleDays(new Set());
      },
      [
         monthOptions,
         onMonthChange,
         disarmAutoScrollY,
      ],
   );

   const sectorOptions = useMemo(
      () => [
         { value: "Toate", label: "Toate" },
         { value: "Botanica", label: "Botanica" },
         { value: "Ciocana", label: "Ciocana" },
         { value: "Buiucani", label: "Buiucani" },
      ],
      [],
   );

   const baseMetrics = useMemo(() => {
      const baseColw = px(COL_W) * zoom;
      const baseColGap = px(COL_GAP) * zoom;
      const baseDayWidth =
         maxColsPerGroup * baseColw +
         Math.max(0, maxColsPerGroup - 1) * baseColGap;
      return { colw: baseColw, dayWidth: baseDayWidth };
   }, [zoom, maxColsPerGroup]);

   const layoutVars = useMemo(
      () => ({
         "--event-h": `${EVENT_H}px`,
         "--slot-h-fixed": `${SLOT_H}px`,
         "--hours-col-w": `${HOURS_COL_W * zoom}px`,
         "--group-gap": `${GROUP_GAP * zoom}px`,
         "--day-header-h": `44px`,
         "--row-header-h": `auto`,
         "--font-scale": zoom,
         "--zoom": zoom,
      }),
      [zoom],
   );

   const buildCanvasList = useCallback(
      (mode /* "A" | "B" */) => {
         if (isDummyMode) {
            return DUMMY_INSTRUCTORS.map((x) => x.inst);
         }

         const list = (instructors || []).filter((i) => {
            const id = String(i?.id || "");
            if (!id) return false;
            if (allowedInstBySector && !allowedInstBySector.has(id))
               return false;

            const meta = instructorMeta.get(id) || {};
            if (mode === "B" && isBuiucaniByMeta(i, meta)) return false; // ✅ fără Bui în B

            return true;
         });

         const mapped = list.map((i) => {
            const id = String(i.id || "");
            const meta = instructorMeta.get(id) || {};
            const full = safeFullName(i);

            const raw =
               meta?.order ??
               i?.order ??
               i?.uiOrder ??
               i?.sortOrder ??
               i?.position ??
               null;

            const { a, b } = parseDualOrder(raw);

            return {
               id,
               name: full || "Necunoscut",
               sectorSlug: meta?.sectorNorm || null,
               order: mode === "B" ? b : a,
            };
         });

         const sorted = mapped.slice().sort((a, b) => {
            const ao = Number.isFinite(a?.order) ? a.order : Number.POSITIVE_INFINITY;
            const bo = Number.isFinite(b?.order) ? b.order : Number.POSITIVE_INFINITY;
            if (ao !== bo) return ao - bo;

            const an = String(a?.name || "").toLowerCase();
            const bn = String(b?.name || "").toLowerCase();
            if (an !== bn) return an < bn ? -1 : 1;

            return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
         });

         // Păstrăm pozițiile absolute din order (1-based); sloturile lipsă rămân goluri.
         const positioned = [];
         for (const inst of sorted) {
            const orderRaw = Number(inst?.order);
            const order = Number.isFinite(orderRaw)
               ? Math.max(1, Math.min(MAX_ORDER_POSITION, Math.trunc(orderRaw)))
               : null;

            if (!order) {
               positioned.push(inst);
               continue;
            }

            const desiredIndex = order - 1;
            while (positioned.length < desiredIndex) positioned.push(null);

            if (positioned.length === desiredIndex) {
               positioned.push(inst);
            } else if (positioned[desiredIndex] == null) {
               positioned[desiredIndex] = inst;
            } else {
               // Coliziune: păstrăm instructorul nou, deplasând restul la dreapta.
               positioned.splice(desiredIndex, 0, inst);
            }
         }

         const mappedWithGaps = positioned.map(
            (inst, idx) =>
               inst || {
                  id: `__gapcol_${mode}_${idx + 1}`,
                  name: "",
                  sectorSlug: null,
                  _isGapColumn: true,
                  _padType: "gap",
               },
         );

         const padCols = [
            { id: "__pad_1", name: "Anulari", sectorSlug: null },
            { id: "__pad_2", name: "Asteptari", sectorSlug: null },
            { id: "__pad_3", name: "Asteptari", sectorSlug: null },
            { id: "__pad_4", name: "Laterală", sectorSlug: null },
         ];

         return [...padCols, ...mappedWithGaps];
      },
      [isDummyMode, instructors, allowedInstBySector, instructorMeta],
   );

   const canvasInstructorsA = useMemo(
      () => buildCanvasList("A"),
      [buildCanvasList],
   );
   const canvasInstructorsB = useMemo(
      () => buildCanvasList("B"),
      [buildCanvasList],
   );

   /* ========== LOGICA DE SEARCH ========== */

   const clearSearch = useCallback(() => {
      disarmAutoScrollY();
      setSearchInput("");
      setSearchState({ query: "", hits: [], index: 0 });
   }, [disarmAutoScrollY]);

   const handleSearchInputChange = useCallback(
      (e) => {
         const val = e.target.value;
         setSearchInput(val);
         if (!val.trim()) clearSearch();
      },
      [clearSearch],
   );

   const runSearch = useCallback(() => {
      const raw = (searchInput || "").trim();

      if (raw.length < 2) {
         clearSearch();
         return;
      }

      const doWork = () => {
         const qNorm = norm(raw);
         const qDigits = digitsOnly(raw);

         const hits = [];
         const seenHitKeys = new Set();

         for (const item of searchCatalog) {
            const text = item.searchNorm;
            const phoneDigits = item.searchPhoneDigits;
            let matched = false;

            if (qNorm && text && text.includes(qNorm)) matched = true;
            if (!matched && qDigits && phoneDigits && phoneDigits.includes(qDigits))
               matched = true;

            if (matched) {
               const eventId = String(item.eventId || "").trim();
               const dayTs = Number(item.dayTs || 0);
               if (!eventId || !Number.isFinite(dayTs)) continue;

               const hitKey = `${dayTs}|${eventId}`;
               if (seenHitKeys.has(hitKey)) continue;
               seenHitKeys.add(hitKey);

               hits.push({
                  dayTs,
                  eventId,
               });
            }
         }

         // ✅ IMPORTANT: armează Y înainte de primul render cu activeEventId
         if (hits.length) {
            const firstId = String(hits[0].eventId);
            activeEventIdRef.current = firstId; // ca gate-ul să nu pice pe "activeId null"
            armAutoScrollYOnce(firstId, `search-init:${raw}:${Date.now()}`);
         }

         setSearchState({ query: raw, hits, index: 0 });
      };

      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
         window.requestIdleCallback(doWork);
      } else {
         setTimeout(doWork, 0);
      }
   }, [searchInput, searchCatalog, clearSearch, armAutoScrollYOnce]);

   const searchHits = searchState.hits;
   const searchTotal = searchHits.length;
   const searchIndex = searchState.index;

   const activeSearchHit =
      searchTotal && searchIndex < searchTotal ? searchHits[searchIndex] : null;
   const activeSearchEventId = activeSearchHit ? activeSearchHit.eventId : null;

   const effectiveActiveEventId = autoFocusEventId || activeSearchEventId;

   useEffect(() => {
      activeEventIdRef.current = effectiveActiveEventId
         ? String(effectiveActiveEventId)
         : null;
   }, [effectiveActiveEventId]);

   const goSearchNext = useCallback(() => {
      setSearchState((prev) => {
         const total = prev.hits.length;
         if (!total) return prev;
         const nextIndex = (((prev.index + 1) % total) + total) % total;
         if (nextIndex === prev.index) return prev;
         return { ...prev, index: nextIndex };
      });
   }, []);

   const goSearchPrev = useCallback(() => {
      setSearchState((prev) => {
         const total = prev.hits.length;
         if (!total) return prev;
         const nextIndex = (((prev.index - 1 + total) % total) + total) % total;
         if (nextIndex === prev.index) return prev;
         return { ...prev, index: nextIndex };
      });
   }, []);

   useEffect(() => {
      const total = searchHits.length;
      if (!total) return;

      const idx = searchState.index;
      const hit = searchHits[idx];
      if (!hit) return;

      armAutoScrollYOnce(hit.eventId, `search:${searchState.query}:${idx}`);

      const scroller = scrollRef.current;
      if (!scroller) return;

      setVisibleDays((prev) => {
         const next = new Set(prev);

         const targetTs = hit.dayTs;
         const targetIdx = loadedDays.findIndex(
            (d) => startOfDayTs(d) === targetTs,
         );

         if (targetIdx === -1) {
            next.add(targetTs);
         } else {
            for (
               let i = Math.max(0, targetIdx - 1);
               i <= Math.min(loadedDays.length - 1, targetIdx + 1);
               i++
            ) {
               next.add(startOfDayTs(loadedDays[i]));
            }
         }

         if (next.size === prev.size) return prev;
         return next;
      });

      centerDayTsInScrollerReliable(hit.dayTs);
   }, [
      searchHits,
      searchState.index,
      loadedDays,
      armAutoScrollYOnce,
      searchState.query,
      centerDayTsInScrollerReliable,
   ]);

   useEffect(() => {
      const handler = (e) => {
         if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            if (!uiDataReady) return;
            e.preventDefault();
            if (searchInputRef.current) {
               searchInputRef.current.focus();
               searchInputRef.current.select();
            }
         }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
   }, [uiDataReady]);

   useEffect(() => {
      const scroller = scrollRef.current;
      if (!scroller) return;

      const onScroll = () => {
         const el = scroller;
         if (scrollLazyRafRef.current) return;
         scrollLazyRafRef.current = requestAnimationFrame(() => {
            scrollLazyRafRef.current = null;
            const left = el.scrollLeft || 0;
            const top = el.scrollTop || 0;
            const nowMs = performance.now();
            const prevScrollPos = scrollPosRef.current || { x: left, y: top };
            const deltaXSinceLastFrame = left - (Number(prevScrollPos.x) || 0);
            const deltaYSinceLastFrame = top - (Number(prevScrollPos.y) || 0);
            const absDeltaX = Math.abs(deltaXSinceLastFrame);
            const absDeltaY = Math.abs(deltaYSinceLastFrame);
            const isInteractingNow =
               !!suspendFlagsRef.current?.isInteracting ||
               isPanVirtualizationLockedRef.current;
            const panPointerType = String(panInputTypeRef.current || "")
               .trim()
               .toLowerCase();
            const panPhase = String(suspendFlagsRef.current?.panPhase || "")
               .trim()
               .toLowerCase();
            const isInertiaPhase = isInteractingNow && panPhase === "inertia";
            const isDragPhase = isInteractingNow && !isInertiaPhase;
            const isMouseDrag = isDragPhase && panPointerType === "mouse";
            const isMouseInertia = isInertiaPhase && panPointerType === "mouse";
            const isMousePanMostlyHorizontal =
               (isMouseDrag || isMouseInertia) && absDeltaX >= absDeltaY * 1.05;

            if (DISABLE_DAY_LAZY_LOAD) {
               scrollPosRef.current = { x: left, y: top };
               if (!isInteractingNow) {
                  schedulePersistScroll(left, top);
               }

               const viewportSnapStep = !isInteractingNow
                  ? 1
                  : isMouseDrag || isMouseInertia
                    ? 1
                  : IS_LOW_SPEC_DEVICE
                    ? absDeltaX >= 8
                       ? 2
                       : 1
                    : absDeltaX >= 12
                      ? 2
                      : 1;
               const snappedLeft =
                  viewportSnapStep > 1
                     ? Math.round(left / viewportSnapStep) * viewportSnapStep
                     : left;
               const snappedTop =
                  viewportSnapStep > 1
                     ? Math.round(top / viewportSnapStep) * viewportSnapStep
                     : top;
               const nextWidth = el.clientWidth || 0;
               const nextHeight = el.clientHeight || 0;
               const viewportXThreshold = isInteractingNow
                  ? isMouseDrag
                     ? 10
                     : isMouseInertia
                       ? 10
                     : IS_LOW_SPEC_DEVICE
                       ? 20
                       : 14
                  : 1;
               const viewportYThreshold = isInteractingNow
                  ? isMouseDrag
                     ? 12
                     : isMouseInertia
                       ? 10
                     : IS_LOW_SPEC_DEVICE
                       ? 26
                       : 18
                  : 1;
               const minViewportUpdateMs = isInteractingNow
                  ? isMouseDrag
                     ? 24
                     : isMouseInertia
                       ? 24
                     : INTERACTING_VIEWPORT_UPDATE_MIN_MS
                  : 0;
               setScrollViewport((prev) => {
                  const nextTop = isInteractingNow ? prev.top || 0 : snappedTop;
                  const leftDelta = Math.abs((prev.left || 0) - snappedLeft);
                  const topDelta = Math.abs((prev.top || 0) - nextTop);
                  const shouldBumpLeft = leftDelta >= viewportXThreshold;
                  const shouldBumpTop = topDelta >= viewportYThreshold;
                  const shouldBumpWidth = Math.abs((prev.width || 0) - nextWidth) > 1;
                  const shouldBumpHeight = Math.abs((prev.height || 0) - nextHeight) > 1;
                  const throttledByPan =
                     minViewportUpdateMs > 0 &&
                     nowMs - (lastViewportUpdateTsRef.current || 0) <
                        minViewportUpdateMs;

                  if (
                     !shouldBumpLeft &&
                     !shouldBumpTop &&
                     !shouldBumpWidth &&
                     !shouldBumpHeight
                  ) {
                     return prev;
                  }
                  if (
                     throttledByPan &&
                     !shouldBumpWidth &&
                     !shouldBumpHeight &&
                     leftDelta < viewportXThreshold * 2 &&
                     topDelta < viewportYThreshold * 2
                  ) {
                     return prev;
                  }
                  lastViewportScrollTopRef.current = nextTop;
                  lastViewportUpdateTsRef.current = nowMs;
                  return {
                     left: snappedLeft,
                     top: nextTop,
                     width: nextWidth,
                     height: nextHeight,
                  };
               });
               return;
            }

            scrollPosRef.current = { x: left, y: top };
            if (!isInteractingNow) {
               schedulePersistScroll(left, top);
            }
            const dayStrideNow = Math.max(1, Number(dayStrideForTrack) || 1);
            const mouseDragDaysThreshold = Math.max(
               Math.round(dayStrideNow * (IS_LOW_SPEC_DEVICE ? 0.42 : 0.34)),
               IS_LOW_SPEC_DEVICE ? 170 : 140,
            );
            const mouseInertiaDaysThreshold = Math.max(
               Math.round(dayStrideNow * (IS_LOW_SPEC_DEVICE ? 0.34 : 0.28)),
               IS_LOW_SPEC_DEVICE ? 130 : 110,
            );
            const daysThreshold = isInteractingNow
               ? isMouseDrag
                  ? mouseDragDaysThreshold
                  : isMouseInertia
                    ? mouseInertiaDaysThreshold
                  : Math.max(
                       Math.round(VISIBLE_DAYS_SCROLL_THRESHOLD_PX * 0.9),
                       IS_LOW_SPEC_DEVICE ? 72 : 56,
                    )
               : VISIBLE_DAYS_SCROLL_THRESHOLD_PX;
            const viewportXThreshold = isInteractingNow
               ? isMouseDrag
                  ? 20
                  : isMouseInertia
                    ? 14
                  : Math.max(
                       Math.round(VIEWPORT_X_SCROLL_THRESHOLD_PX * 1.1),
                       IS_LOW_SPEC_DEVICE ? 96 : 80,
                    )
               : VIEWPORT_X_SCROLL_THRESHOLD_PX;
            const rowsThreshold = isInteractingNow
               ? isMouseDrag
                  ? 22
                  : isMouseInertia
                    ? 14
                  : Math.max(
                       Math.round(VISIBLE_ROWS_SCROLL_THRESHOLD_PX * 1.1),
                       IS_LOW_SPEC_DEVICE ? 96 : 80,
                    )
               : VISIBLE_ROWS_SCROLL_THRESHOLD_PX;

            const prevLeft = lastVisibleDaysScrollLeftRef.current;
            const crossedDaysThreshold =
               prevLeft < 0 || Math.abs(left - prevLeft) >= daysThreshold;
            const enoughTimeForDaysUpdate =
               !isInteractingNow ||
               nowMs - (lastVisibleDaysUpdateTsRef.current || 0) >=
                  (isMouseDrag
                     ? 56
                     : isMouseInertia
                       ? 44
                       : INTERACTING_DAYS_UPDATE_MIN_MS);
            const shouldRecomputeDays =
               crossedDaysThreshold && enoughTimeForDaysUpdate;
            if (shouldRecomputeDays) {
               lastVisibleDaysScrollLeftRef.current = left;
               lastVisibleDaysUpdateTsRef.current = nowMs;
               const absDx = Math.abs(deltaXSinceLastFrame);
               const dxRatio = absDx / dayStrideNow;
               let extraOverscanBefore = 0;
               let extraOverscanAfter = 0;
               let extraOverscan = 0;
               if (isInteractingNow && absDx > 0.1) {
                  let leadOverscan = 1;
                  if (isMouseDrag || isMouseInertia) {
                     if (dxRatio >= 0.65) {
                        leadOverscan = IS_LOW_SPEC_DEVICE ? 3 : 5;
                     } else if (dxRatio >= 0.4) {
                        leadOverscan = IS_LOW_SPEC_DEVICE ? 2 : 4;
                     } else {
                        leadOverscan = IS_LOW_SPEC_DEVICE ? 2 : 3;
                     }
                     extraOverscan = 1;
                  } else {
                     leadOverscan = absDx > 560 ? (IS_LOW_SPEC_DEVICE ? 1 : 2) : 1;
                  }
                  const trailOverscan = isMouseDrag || isMouseInertia ? 1 : 0;
                  if (deltaXSinceLastFrame >= 0) {
                     extraOverscanAfter = leadOverscan;
                     extraOverscanBefore = trailOverscan;
                  } else {
                     extraOverscanBefore = leadOverscan;
                     extraOverscanAfter = trailOverscan;
                  }
               }
               recomputeVisibleDays({
                  expandOnly: false,
                  extraOverscan,
                  extraOverscanBefore,
                  extraOverscanAfter,
               });
            }

            const prevTop = lastViewportScrollTopRef.current;
            const nextWidth = el.clientWidth || 0;
            const nextHeight = el.clientHeight || 0;
            setScrollViewport((prev) => {
               const viewportSnapStep = !isInteractingNow
                  ? 1
                  : isMouseDrag || isMouseInertia
                    ? 1
                    : IS_LOW_SPEC_DEVICE
                      ? absDeltaX >= 8
                         ? 2
                         : 1
                      : absDeltaX >= 12
                        ? 2
                        : 1;
               const nextLeft =
                  viewportSnapStep > 1
                     ? Math.round(left / viewportSnapStep) * viewportSnapStep
                     : left;
               const nextTop =
                  isMousePanMostlyHorizontal
                     ? prev.top || 0
                     : viewportSnapStep > 1
                       ? Math.round(top / viewportSnapStep) * viewportSnapStep
                       : top;
               const leftDelta = Math.abs((prev.left || 0) - nextLeft);
               const topDelta =
                  prevTop < 0 ? Infinity : Math.abs(nextTop - prevTop);
               const shouldBumpLeft = leftDelta >= viewportXThreshold;
               const shouldBumpTop = topDelta >= rowsThreshold;
               const shouldBumpWidth = Math.abs((prev.width || 0) - nextWidth) > 1;
               const shouldBumpHeight = Math.abs((prev.height || 0) - nextHeight) > 1;
               const throttledByPan =
                  isInteractingNow &&
                  nowMs - (lastViewportUpdateTsRef.current || 0) <
                     (isMouseDrag
                        ? 48
                        : isMouseInertia
                          ? 36
                          : INTERACTING_VIEWPORT_UPDATE_MIN_MS);

               if (
                  !shouldBumpLeft &&
                  !shouldBumpTop &&
                  !shouldBumpWidth &&
                  !shouldBumpHeight
               ) {
                  return prev;
               }
               if (throttledByPan && !shouldBumpWidth && !shouldBumpHeight) {
                  return prev;
               }
               lastViewportScrollTopRef.current = nextTop;
               lastViewportUpdateTsRef.current = nowMs;
               return {
                  left: nextLeft,
                  top: nextTop,
                  width: nextWidth,
                  height: nextHeight,
               };
            });
         });
      };

      const onResize = () => {
         recomputeVisibleDays({ extraOverscan: 0 });
         const left = scroller.scrollLeft || 0;
         const top = scroller.scrollTop || 0;
         const width = scroller.clientWidth || 0;
         const height = scroller.clientHeight || 0;
         lastViewportScrollTopRef.current = top;
         lastViewportUpdateTsRef.current = performance.now();
         setScrollViewport((prev) => {
            if (
               prev.left === left &&
               prev.top === top &&
               prev.width === width &&
               prev.height === height
            ) {
               return prev;
            }
            return { left, top, width, height };
         });
      };

      recomputeVisibleDays({ extraOverscan: 0 });
      onResize();

      scroller.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);

      return () => {
         scroller.removeEventListener("scroll", onScroll);
         window.removeEventListener("resize", onResize);
         window.removeEventListener("orientationchange", onResize);
         if (scrollLazyRafRef.current) {
            cancelAnimationFrame(scrollLazyRafRef.current);
            scrollLazyRafRef.current = null;
         }
      };
   }, [recomputeVisibleDays, schedulePersistScroll, dayStrideForTrack]);

   return (
      <div className="dayview__wrapper">
         <div className="dayview" style={layoutVars}>
            <CalendarPlusToolbar
               dataReady={uiDataReady}
               searchInputRef={searchInputRef}
               searchInput={searchInput}
               onSearchInputChange={handleSearchInputChange}
               onRunSearch={runSearch}
               onClearSearch={clearSearch}
               onPrevHit={goSearchPrev}
               onNextHit={goSearchNext}
               searchTotal={searchTotal}
               searchIndex={searchIndex}
               currentZoomValue={currentZoomValue}
               zoomOptions={zoomOptions}
               onZoomChange={handleZoomChange}
               currentMonthValue={currentMonthValue}
               monthOptions={monthOptions}
               onMonthChange={handleMonthChange}
               sectorFilter={sectorFilter}
               sectorOptions={sectorOptions}
               onSectorChange={setSectorFilter}
            />

            <CalendarPlusTrack
               scrollRef={scrollRef}
               rowHeight={rowHeight}
               dayRefs={dayRefs}
               loadedDays={loadedDays}
               visibleDays={visibleDays}
               stickyVisibleDays={stickyVisibleDays}
               hydratedDays={hydratedDays}
               isPanInteracting={isPanInteracting}
               panPointerType={panInputTypeRef.current || "mouse"}
               isDummyMode={isDummyMode}
               allowedInstBySector={allowedInstBySector}
               baseMetrics={baseMetrics}
               maxColsPerGroup={maxColsPerGroup}
               zoom={zoom}
               timeMarks={timeMarks}
               handleCreateFromEmpty={handleCreateFromEmpty}
               activeEventId={effectiveActiveEventId}
               activeSearchEventId={activeSearchEventId}
               handleActiveEventRectChange={handleActiveEventRectChange}
               cars={cars}
               instructors={instructorsOrderedForUI}
               users={users}
               canvasInstructorsA={canvasInstructorsA}
               canvasInstructorsB={canvasInstructorsB}
               viewportScrollLeft={scrollViewport.left}
               viewportScrollTop={scrollViewport.top}
               viewportWidth={scrollViewport.width}
               viewportHeight={scrollViewport.height}
               viewModel={calendarViewModel}
               forceAllDaysVisible={DISABLE_DAY_LAZY_LOAD}
               createDraftBySlotUsers={createDraftBySlotUsers}
               createDraftBySlotColors={createDraftBySlotColors}
               presenceByReservationUsers={presenceByReservationUsers}
               presenceByReservationColors={presenceByReservationColors}
               // ✅ ADĂUGI ASTEA 4
               orderEditOpen={orderEditOpen}
               onToggleOrderEdit={handleToggleOrderEdit}
               onCloseOrderEdit={handleCloseOrderEdit}
               onSaveOrder={handleSaveOrder}
            />
         </div>
      </div>
   );
}
