// src/components/APanel/Calendar/ACalendarOptimized.jsx
import React, {
   useMemo,
   useEffect,
   useState,
   useCallback,
   useRef,
   useLayoutEffect,
   memo,
} from "react";
import { useDispatch, useSelector, shallowEqual } from "react-redux";

// ✅ e în același folder (din screenshot)
import { listenCalendarRefresh } from "../../Utils/calendarBus";

// ✅ din Calendar -> APanel -> components -> src -> store
import { fetchInstructorsGroups } from "../../../store/instructorsGroupSlice";
import { fetchCars } from "../../../store/carsSlice";
import {
   fetchReservationsDelta,
   maybeRefreshReservations,
   fetchReservationsForMonth,
} from "../../../store/reservationsSlice";
import { fetchStudents } from "../../../store/studentsSlice";
import { fetchUsers } from "../../../store/usersSlice";
import { fetchInstructors } from "../../../store/instructorsSlice";

import { ReactSVG } from "react-svg";
import searchIcon from "../../../assets/svg/search.svg";

import {
   selectCalendarBaseData,
   selectCalendarDerivedData,
} from "../../../store/calendarSelectors";

// ✅ din Calendar -> APanel -> components -> Utils
import { openPopup } from "../../Utils/popupStore";

import DayviewCanvasTrack from "./DayviewCanvasTrack";
import useInertialPan from "./useInertialPan";

// ✅ din Calendar -> APanel -> components -> src -> socket/api
import { useReservationSocket } from "../../../socket/useReservationSocket";
import { getInstructorBlackouts } from "../../../api/instructorsService";

/* ================= HELPERE GENERALE ================= */

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

   // suport pentru forme comune din slice-uri
   if (Array.isArray(users.items)) return users.items;
   if (Array.isArray(users.list)) return users.list;
   if (Array.isArray(users.data)) return users.data;

   return [];
}
function isAdminOrManager(u) {
   const role = String(
      u?.role ?? u?.userRole ?? u?.type ?? u?.profile?.role ?? ""
   ).toUpperCase();
   return role === "ADMIN" || role === "MANAGER";
}
function pickUserProfileColor(u) {
   // ia “culoarea din profil” – încearcă mai multe câmpuri (nu știm exact schema ta)
   return (
      u?.profile?.color ||
      u?.profileColor ||
      u?.color ||
      u?.uiColor ||
      u?.profile?.uiColor ||
      null
   );
}

// fallback deterministic (dacă userul n-are culoare setată în profil)
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

// citire token din cookie
const getCookie = (name) => {
   if (typeof document === "undefined") return null;
   const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
   return m ? decodeURIComponent(m[2]) : null;
};

const px = (v) => parseFloat(String(v || 0));

/* ===== Dropdown reutilizabil (compatibil cu .dv-dd din SCSS-ul tău) ===== */
function SimpleDropdown({
   value,
   onChange,
   options,
   placeholder = "",
   className = "",
   "aria-label": ariaLabel,
}) {
   const [open, setOpen] = useState(false);
   const ref = useRef(null);

   const handleToggle = useCallback(() => {
      setOpen((v) => !v);
   }, []);

   const handleSelect = useCallback(
      (val) => {
         onChange?.(val);
         setOpen(false);
      },
      [onChange]
   );

   useEffect(() => {
      if (!open) return;
      const onClickOutside = (e) => {
         if (!ref.current) return;
         if (!ref.current.contains(e.target)) setOpen(false);
      };
      document.addEventListener("click", onClickOutside, true);
      return () => document.removeEventListener("click", onClickOutside, true);
   }, [open]);

   const current = options.find((o) => String(o.value) === String(value));
   const label = current?.label ?? placeholder ?? "";

   return (
      <div
         ref={ref}
         className={`dv-dd dv-select ${className || ""}`}
         aria-label={ariaLabel}
      >
         <button
            type="button"
            className="dv-dd__btn dv-dd__trigger"
            onClick={handleToggle}
            aria-haspopup="listbox"
            aria-expanded={open ? "true" : "false"}
         >
            <span className="dv-dd__label">{label}</span>
            <span className="dv-dd__chevron">▾</span>
         </button>
         {open && (
            <div className="dv-dd__menu dv-dd__list" role="listbox">
               {options.map((opt) => {
                  const isActive = String(opt.value) === String(value);
                  return (
                     <button
                        key={opt.value}
                        type="button"
                        className={
                           "dv-dd__option dv-dd__item" +
                           (isActive ? " dv-dd__option--active" : "")
                        }
                        onClick={() => handleSelect(opt.value)}
                        role="option"
                        aria-selected={isActive ? "true" : "false"}
                     >
                        {opt.label}
                     </button>
                  );
               })}
            </div>
         )}
      </div>
   );
}

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

/* === CONSTANTE PENTRU LAYOUT / ZOOM / TIMING (stabile, în afara componentei) === */

const Z_BASE = 0.6;
const ZOOM_PERCENT_LEVELS = [50, 75, 100, 125, 150];

const EMPTY_EVENTS = [];

const MOLDOVA_TZ_ID = "Europe/Chisinau";
const DEBUG_CANVAS_EMPTY = false;

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

// durată lecție + dimensiuni de bază
const LESSON_MINUTES = 90;
const EVENT_H = 48;
const SLOT_H = 125;
const HOURS_COL_W = 60;
const COL_W = 220;
const GROUP_GAP = 32; // px

/* ================= COMPONENT PRINCIPAL (Shell) ================= */
export default function ACalendarOptimized({
   date,
   extraFilters,
   onMonthChange,
} = {}) {
   const dispatch = useDispatch();

   /* ====== DATA & STARE GLOBALĂ ====== */

   const [currentDate, setCurrentDate] = useState(() =>
      date ? new Date(date) : new Date()
   );

   useEffect(() => {
      if (!date) return;
      const d = new Date(date);
      if (!isNaN(d)) setCurrentDate(d);
   }, [date]);

   const [monthAnchorDate] = useState(() => new Date());

   const scrollRef = useRef(null);
   const dayRefs = useRef(new Map());

   const scrollLazyRafRef = useRef(null);

   const [visibleDays, setVisibleDays] = useState(() => new Set());
   const visibleDaysCount = visibleDays.size;

   // scroll automat pe Y pentru event activ (folosit DOAR la search / focus)
   const handleActiveEventRectChange = useCallback((info) => {
      const scroller = scrollRef.current;
      if (!scroller || !info) return;

      const scRect = scroller.getBoundingClientRect();
      const scHeight = scRect.height || scroller.clientHeight || 0;

      const topY = info.topY ?? info.top ?? null;
      const bottomY = info.bottomY ?? info.bottom ?? null;
      let centerY = info.centerY ?? null;

      if (centerY == null) {
         if (topY != null && bottomY != null) {
            centerY = topY + (bottomY - topY) / 2;
         } else if (topY != null) {
            centerY = topY;
         } else if (bottomY != null) {
            centerY = bottomY;
         } else {
            return;
         }
      }

      const centerRel = centerY - scRect.top;
      const wantedTop = scroller.scrollTop + (centerRel - scHeight / 2);

      const maxScrollTop = Math.max(0, scroller.scrollHeight - scHeight);
      const nextTop = Math.max(0, Math.min(wantedTop, maxScrollTop));

      if (Math.abs(nextTop - scroller.scrollTop) < 1) return;

      // fără animație – să ajungă instant
      scroller.scrollTop = nextTop;
   }, []);

   const isInteractiveTarget = useCallback(
      (el) =>
         !!el.closest?.(
            "button, input, textarea, select, a, [data-dv-interactive='1']"
         ),
      []
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

   const [zoom, setZoom] = useState(Z_BASE);
   const Z_MIN = Z_BASE * 0.5;
   const Z_MAX = Z_BASE * 2.0;

   const setZoomClamped = useCallback(
      (val) => {
         const z = Math.max(Z_MIN, Math.min(Z_MAX, val));
         setZoom(z);
         return z;
      },
      [Z_MIN, Z_MAX]
   );

   useEffect(() => {
      if (isMobile) setZoomClamped(Z_BASE);
   }, [isMobile, setZoomClamped]);

   const zoomOptions = useMemo(
      () =>
         ZOOM_PERCENT_LEVELS.map((p) => ({
            value: String(p),
            label: `${p}%`,
         })),
      []
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
      [setZoomClamped]
   );

   const suspendFlagsRef = useRef({ isInteracting: false });

   useInertialPan(scrollRef, {
      suspendFlagsRef,
      shouldIgnore: isInteractiveTarget,
      inertiaX: true,
      inertiaY: true,
      slopPx: 6,
   });

   // 🔐 WebSocket pentru rezervări – FĂRĂ scheduleSmartTick/polling
   const token = getCookie("access_token");
   // ✅ Presence: reservationId -> Set(userId)
   const [presenceByReservationUsers, setPresenceByReservationUsers] = useState(
      () => new Map()
   );

   const applyPresenceDelta = useCallback((type, payload) => {
      const ridRaw =
         payload?.reservationId ??
         payload?.reservation_id ??
         payload?.rid ??
         null;
      const uidRaw =
         payload?.userId ?? payload?.user_id ?? payload?.uid ?? null;

      if (ridRaw == null) return;

      const rid = String(ridRaw);
      const uid = uidRaw != null ? String(uidRaw) : null;

      setPresenceByReservationUsers((prev) => {
         const next = new Map(prev);

         // JOIN fără userId (fallback) => doar marcăm ca “cineva e acolo”
         if (!uid) {
            next.set(rid, new Set(["__someone__"]));
            return next;
         }

         const set = new Set(next.get(rid) || []);
         if (type === "join") set.add(uid);
         else if (type === "left") set.delete(uid);

         if (set.size) next.set(rid, set);
         else next.delete(rid);

         return next;
      });
   }, []);

   const reservationWS = useReservationSocket(token, {
      onConnect: () => {
         // reset presence la reconnect (evită “ghost borders”)
         setPresenceByReservationUsers(new Map());
         dispatch(fetchReservationsDelta());
      },
      onDisconnect: () => {
         setPresenceByReservationUsers(new Map());
      },

      // ✅ aici vrem payload-ul {reservationId, userId}
      onReservationJoined: (data) => applyPresenceDelta("join", data),
      onReservationLeft: (data) => applyPresenceDelta("left", data),

      onReservationJoinDenied: (data) => console.warn("[WS] join denied", data),

      // rezervările s-au schimbat => refresh din store
      onReservationsChanged: () => dispatch(fetchReservationsDelta()),
   });

   const joinReservationSafe = useCallback(
      (reservationId) => {
         const rid = String(reservationId ?? "").trim();
         if (!rid) return;

         // suportă mai multe semnături (în funcție de cum ai scris hook-ul)
         if (typeof reservationWS?.joinReservation === "function") {
            reservationWS.joinReservation(rid);
            return;
         }
         if (typeof reservationWS?.join === "function") {
            reservationWS.join(rid);
            return;
         }
      },
      [reservationWS]
   );

   const presenceReservationIds =
      reservationWS?.presenceReservationIds ??
      reservationWS?.presenceIds ??
      reservationWS?.presence ??
      null;

   const [sectorFilter, setSectorFilter] = useState("Toate");
   const sectorFilterNorm = sectorFilter.toLowerCase();

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
               dispatch(
                  fetchReservationsForMonth({
                     date: currentDate,
                     extraFilters: extraFilters || {},
                  })
               ),
               dispatch(fetchCars()),
               dispatch(fetchUsers()),
            ]);
         } finally {
         }
      })();
   }, [dispatch, currentDate, extraFilters]);

   // ===== Store selectors (memoizați) =====
   const {
      reservations: reservationsLive,
      instructorsGroups,
      instructors,
      students,
      cars,
      users,
   } = useSelector(selectCalendarBaseData, shallowEqual);

   const { instructorMeta, studentDict, instructorsGroupDict } = useSelector(
      selectCalendarDerivedData,
      shallowEqual
   );
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

   // ✅ Fără copie locală / pending: folosim direct datele din store
   const reservationsUIDedup = reservationsLive || [];

   useEffect(() => {
      if (!hasPrefetchedAllRef.current) return;
      if ((reservationsLive?.length ?? 0) === 0) {
         dispatch(fetchReservationsDelta());
      }
   }, [dispatch, reservationsLive?.length]);

   // fallback simplu: când revii în tab, facem maybeRefreshReservations
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
         (reservationsLive?.length ?? 0) > 0 ||
         (students?.length ?? 0) > 0 ||
         (instructorsGroups?.length ?? 0) > 0,
      [reservationsLive?.length, students?.length, instructorsGroups?.length]
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
      []
   );

   const HIDDEN_INTERVALS = useMemo(
      () => [{ start: "13:00", end: "13:30" }],
      []
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
      [timeMarks, HIDDEN_INTERVALS]
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

   // map rapid: instructorId -> groupId
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
      [instructorGroupByInstId]
   );

   const studentDictRef = useRef(null);
   useEffect(() => {
      studentDictRef.current = studentDict;
   }, [studentDict]);

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
      return `${y}-${String(m).padStart(2, "0")}-${String(d)
         .toString()
         .padStart(2, "0")}`;
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
         timeZone
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

   const mapReservationToEvent = useCallback(
      (r, startDateOverride) => {
         const start =
            startDateOverride ||
            toFloatingDate(
               r.startTime ??
                  r.start ??
                  r.startedAt ??
                  r.start_at ??
                  r.startDate ??
                  r.start_date
            );
         if (!start || isNaN(start)) return null;

         const end = new Date(start.getTime() + LESSON_MINUTES * 60000);

         const instIdStr =
            r.instructorId != null ? String(r.instructorId) : "__unknown";
         const groupIdRaw = r.instructorsGroupId ?? null;
         const studentId = r.userId != null ? String(r.userId) : null;

         const fromStore = studentDictRef.current
            ? studentDictRef.current.get(studentId)
            : null;
         const userObj = r.user || {};

         const first = fromStore?.firstName ?? userObj.firstName ?? "";
         const last = fromStore?.lastName ?? userObj.lastName ?? "";
         const phone = fromStore?.phone ?? userObj.phone ?? null;
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
               .join(" ")
         );

         const searchPhoneDigits = digitsOnly(
            phone ??
               r.clientPhone ??
               r.phoneNumber ??
               r.phone ??
               r.telefon ??
               ""
         );

         return {
            id: String(r.id),
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
      [instructorsGroupDict, instructorMeta]
   );

   const eventsByDay = useMemo(() => {
      if (isDummyMode) return new Map();
      const map = new Map();

      (reservationsUIDedup || []).forEach((r) => {
         const startRaw = r.startTime ?? r.start ?? r.startedAt ?? r.startDate;
         if (!startRaw) return;

         const start = toFloatingDate(startRaw);
         if (!start || isNaN(start)) return;

         const ts = startOfDayTs(start);
         if (!map.has(ts)) map.set(ts, []);

         const ev = mapReservationToEvent(r, start);
         if (ev) map.get(ts).push(ev);
      });

      map.forEach((arr) => arr.sort((a, b) => a.start - b.start));
      return map;
   }, [reservationsUIDedup, mapReservationToEvent, isDummyMode]);

   const SECTOR_CANON = {
      botanica: "Botanica",
      ciocana: "Ciocana",
      buiucani: "Buiucani",
   };

   function canonSector(val) {
      if (!val) return null;
      const s = norm(val);

      // acceptă și valori de genul "sec. Botanica", "BOTANICA", etc.
      if (s.includes("botanica")) return SECTOR_CANON.botanica;
      if (s.includes("ciocana")) return SECTOR_CANON.ciocana;
      if (s.includes("buiucani")) return SECTOR_CANON.buiucani;

      return null;
   }

   function resolveSectorForCreate({ ev, instId, gObj, instructorMeta }) {
      // 1) dacă event-ul are sector setat explicit
      const fromEv = canonSector(ev?.sector);
      if (fromEv) return fromEv;

      // 2) din instructorMeta (asta e "în funcție de instructor")
      const meta = instructorMeta?.get?.(String(instId || "")) || {};
      const fromMeta = canonSector(
         meta.sectorNorm || meta.sector || meta.location
      );
      if (fromMeta) return fromMeta;

      // 3) fallback din grup
      const fromGroup = canonSector(gObj?.sector || gObj?.location);
      if (fromGroup) return fromGroup;

      // 4) default final
      return "Botanica";
   }

   const handleCreateFromEmpty = useCallback(
      (ev) => {
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
         const sectorVal = resolveSectorForCreate({
            ev,
            instId,
            gObj,
            instructorMeta,
         });
         const gbLabel = (meta.gearbox || "").toLowerCase().includes("auto")
            ? "Automat"
            : "Manual";
         openPopup("createRezervation", {
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
      },
      [instructorMeta, instructorsGroups, findGroupForInstructor]
   );

   // eveniment de refresh / focus din alte componente
   useEffect(() => {
      return listenCalendarRefresh((payload) => {
         // 👉 doar dacă NU vine explicit forceReload: false
         // (adică în afară de cazul special din ReservationEditPopup)
         if (!payload || payload.forceReload !== false) {
            dispatch(fetchReservationsDelta());
         }

         if (payload && payload.type === "focus-reservation") {
            focusRequestRef.current = payload;
            setFocusToken((t) => t + 1);
         }
      });
   }, [dispatch]);

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

   const recomputeVisibleDays = useCallback(() => {
      const scroller = scrollRef.current;
      if (!scroller) return;

      const viewLeft = scroller.scrollLeft;
      const viewRight = viewLeft + scroller.clientWidth;
      const MARGIN = 600;

      setVisibleDays((prev) => {
         const next = new Set(prev);

         dayRefs.current.forEach((el, ts) => {
            if (!el) return;
            const left = el.offsetLeft;
            const right = left + el.offsetWidth;

            const inRange =
               right >= viewLeft - MARGIN && left <= viewRight + MARGIN;

            if (inRange) {
               next.add(Number(ts));
            }
         });

         if (!next.size && loadedDays.length) {
            const maxInit = 7;
            for (let i = 0; i < loadedDays.length && i < maxInit; i++) {
               next.add(startOfDayTs(loadedDays[i]));
            }
         }

         if (next.size === prev.size) return prev;
         return next;
      });
   }, [loadedDays]);

   const allowedKeysSet = useMemo(() => {
      const set = new Set();
      for (const d of loadedDays) {
         const ts = startOfDayTs(d);
         const slots = mkStandardSlotsForDay(new Date(ts));
         for (const s of slots) set.add(localKeyFromTs(s.start));
      }
      return set;
   }, [loadedDays, mkStandardSlotsForDay]);

   const blackoutKeyMapRef = useRef(new Map());
   const [blackoutVer, setBlackoutVer] = useState(0);

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
         } catch (e) {
            console.error("getInstructorBlackouts error for", key, e);
         }
      },
      [allowedKeysSet]
   );

   useEffect(() => {
      if (!instIdsAll.length) return;
      if (!visibleDaysCount) return;

      instIdsAll.forEach((iid) => {
         ensureBlackoutsFor(iid);
      });
   }, [instIdsAll, ensureBlackoutsFor, visibleDaysCount]);

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
      [eventsByDay, instIdsAll, standardSlotsByDay, blackoutVer]
   );

   const monthOptions = useMemo(() => {
      const base = monthAnchorDate;
      const curYear = base.getFullYear();
      const curMonth = base.getMonth();

      const makeKey = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;

      const months = [];
      for (let delta = -3; delta <= 3; delta++) {
         const d = new Date(curYear, curMonth + delta, 1);
         const y = d.getFullYear();
         const m = d.getMonth();
         months.push({
            value: makeKey(y, m),
            label: d.toLocaleDateString("ro-RO", {
               month: "short",
               year: "numeric",
            }),
            year: y,
            month: m,
         });
      }

      return months;
   }, [monthAnchorDate]);

   const currentMonthValue = useMemo(() => {
      const d = new Date(currentDate);
      const y = d.getFullYear();
      const m = d.getMonth();
      return `${y}-${String(m + 1).padStart(2, "0")}`;
   }, [currentDate]);

   // === Search state (input + rezultate) ===
   const [searchInput, setSearchInput] = useState("");
   const [searchState, setSearchState] = useState({
      query: "",
      hits: [],
      index: 0,
   });
   // Focus din exterior (ex: după mutare din popup)
   const [autoFocusEventId, setAutoFocusEventId] = useState(null);
   const focusRequestRef = useRef(null);
   const [focusToken, setFocusToken] = useState(0);

   // curățăm highlight-ul de focus după puțin timp
   useEffect(() => {
      if (!autoFocusEventId) return;
      const t = setTimeout(() => setAutoFocusEventId(null), 1500);
      return () => clearTimeout(t);
   }, [autoFocusEventId]);

   const searchInputRef = useRef(null);

   // când vine un focusRequest (ex. după editare în popup)
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
            if (key !== currentMonthValue) {
               sameMonth = false;
            }
         }
      }

      if (!sameMonth) return;

      let targetDayTs = null;
      for (const [ts, evs] of eventsByDay.entries()) {
         if (evs.some((ev) => String(ev.id) === targetId)) {
            targetDayTs = ts;
            break;
         }
      }
      if (targetDayTs == null) return;

      setVisibleDays((prev) => {
         const next = new Set(prev);
         const targetIdx = loadedDays.findIndex(
            (d) => startOfDayTs(d) === targetDayTs
         );

         if (targetIdx === -1) {
            next.add(targetDayTs);
         } else {
            for (let i = 0; i <= targetIdx; i++) {
               next.add(startOfDayTs(loadedDays[i]));
            }
         }

         if (next.size === prev.size) return prev;
         return next;
      });

      setAutoFocusEventId(targetId);

      const doScrollX = () => {
         const scroller = scrollRef.current;
         const dayEl = dayRefs.current.get(targetDayTs);
         if (!scroller || !dayEl) return;

         const scrollerWidth = scroller.clientWidth;
         const scrollWidth = scroller.scrollWidth || 0;
         const dayLeft = dayEl.offsetLeft;
         const dayWidth = dayEl.offsetWidth || scrollerWidth;

         let nextLeft = dayLeft - (scrollerWidth - dayWidth) / 2;
         if (nextLeft < 0) nextLeft = 0;

         const maxLeft =
            scrollWidth > scrollerWidth ? scrollWidth - scrollerWidth : 0;
         if (nextLeft > maxLeft) nextLeft = maxLeft;

         if (Math.abs(nextLeft - scroller.scrollLeft) > 1) {
            scroller.scrollLeft = nextLeft;
         }
      };

      if (typeof window !== "undefined") {
         window.requestAnimationFrame(() => {
            window.requestAnimationFrame(doScrollX);
         });
      } else {
      }
   }, [focusToken, eventsByDay, loadedDays, currentMonthValue]);

   const handleMonthChange = useCallback(
      (val) => {
         const opt = monthOptions.find((o) => String(o.value) === String(val));
         if (!opt) return;
         const newDate = new Date(opt.year, opt.month, 1);

         setCurrentDate(newDate);

         if (typeof onMonthChange === "function") {
            onMonthChange(newDate);
         }

         try {
            dispatch(
               fetchReservationsForMonth({
                  date: newDate,
                  extraFilters: extraFilters || {},
               })
            );
         } catch (e) {
            console.error("[DayView] fetchReservationsForMonth error", e);
         }

         if (scrollRef.current) {
            scrollRef.current.scrollLeft = 0;
         }

         setSearchInput("");
         setSearchState({ query: "", hits: [], index: 0 });
         setVisibleDays(new Set());
      },
      [monthOptions, extraFilters, onMonthChange, dispatch]
   );

   const sectorOptions = useMemo(
      () => [
         { value: "Toate", label: "Toate" },
         { value: "Botanica", label: "Botanica" },
         { value: "Ciocana", label: "Ciocana" },
         { value: "Buiucani", label: "Buiucani" },
      ],
      []
   );

   const baseMetrics = useMemo(() => {
      const baseColw = px(COL_W) * zoom;
      const baseDayWidth = maxColsPerGroup * baseColw;
      return { colw: baseColw, dayWidth: baseDayWidth };
   }, [zoom, maxColsPerGroup]);

   const layoutVars = useMemo(
      () => ({
         "--event-h": `${EVENT_H * zoom}px`,
         "--slot-h-fixed": `${SLOT_H * zoom}px`,
         "--hours-col-w": `${HOURS_COL_W * zoom}px`,
         "--group-gap": `${GROUP_GAP * zoom}px`,
         "--day-header-h": `44px`,
         "--row-header-h": `auto`,
         "--font-scale": zoom,
         "--zoom": zoom,
      }),
      [zoom]
   );

   const canvasInstructors = useMemo(() => {
      if (isDummyMode) {
         return DUMMY_INSTRUCTORS.map((x) => x.inst);
      }

      const base = (instructors || []).filter((i) => {
         const id = String(i.id || "");
         if (!id) return false;
         if (allowedInstBySector && !allowedInstBySector.has(id)) return false;
         return true;
      });

      base.sort((a, b) => {
         const idA = String(a.id || "");
         const idB = String(b.id || "");
         const nameA =
            instructorMeta.get(idA)?.name ||
            `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
         const nameB =
            instructorMeta.get(idB)?.name ||
            `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim();
         return (nameA || "").localeCompare(nameB || "", "ro");
      });

      const mapped = base.map((i) => {
         const id = String(i.id || "");
         const meta = instructorMeta.get(id);
         return {
            id,
            name:
               meta?.name ||
               `${i.firstName ?? ""} ${i.lastName ?? ""}`.trim() ||
               "Necunoscut",
            sectorSlug: meta?.sectorNorm || null,
         };
      });

      const padCols = [
         { id: "__pad_1", name: "Anulari", sectorSlug: null },
         { id: "__pad_2", name: "Asteptari", sectorSlug: null },
         { id: "__pad_3", name: "Asteptari", sectorSlug: null },
         { id: "__pad_4", name: "Laterala", sectorSlug: null },
      ];

      return [...padCols, ...mapped];
   }, [isDummyMode, instructors, allowedInstBySector, instructorMeta]);

   /* ========== LOGICA DE SEARCH OPTIMIZATĂ ========== */

   const clearSearch = useCallback(() => {
      setSearchInput("");
      setSearchState({ query: "", hits: [], index: 0 });
   }, []);

   const handleSearchInputChange = useCallback(
      (e) => {
         const val = e.target.value;
         setSearchInput(val);

         if (!val.trim()) {
            clearSearch();
         }
      },
      [clearSearch]
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

         loadedDays.forEach((d) => {
            const ts = startOfDayTs(d);
            const evs = eventsByDay.get(ts) || EMPTY_EVENTS;
            if (!evs || evs === EMPTY_EVENTS) return;

            evs.forEach((ev) => {
               const text = ev.searchNorm || "";
               const phoneDigits = ev.searchPhoneDigits || "";
               let matched = false;

               if (qNorm && text && text.includes(qNorm)) matched = true;
               if (!matched && qDigits && phoneDigits) {
                  if (phoneDigits.includes(qDigits)) matched = true;
               }

               if (matched) {
                  hits.push({
                     dayTs: ts,
                     eventId: String(ev.id),
                     instructorId: ev.instructorId,
                     ev,
                  });
               }
            });
         });

         setSearchState({
            query: raw,
            hits,
            index: hits.length ? 0 : 0,
         });
      };

      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
         window.requestIdleCallback(doWork);
      } else {
         setTimeout(doWork, 0);
      }
   }, [searchInput, loadedDays, eventsByDay, clearSearch]);

   const searchHits = searchState.hits;
   const searchTotal = searchHits.length;
   const searchIndex = searchState.index;

   const activeSearchHit =
      searchTotal && searchIndex < searchTotal ? searchHits[searchIndex] : null;
   const activeSearchEventId = activeSearchHit ? activeSearchHit.eventId : null;

   const hasSearchHits = searchTotal > 0;
   // combinăm focus-ul din search cu cel din popup (mutare)
   // focus-ul din popup are prioritate temporar
   const effectiveActiveEventId = autoFocusEventId || activeSearchEventId;

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

   // când se schimbă indexul de search → scroll pe X la ziua potrivită
   useEffect(() => {
      const total = searchHits.length;
      if (!total) return;

      const idx = searchState.index;
      const hit = searchHits[idx];
      if (!hit) return;

      const scroller = scrollRef.current;
      const dayEl = dayRefs.current.get(hit.dayTs);
      if (!scroller || !dayEl) return;

      setVisibleDays((prev) => {
         const next = new Set(prev);

         const targetTs = hit.dayTs;
         const targetIdx = loadedDays.findIndex(
            (d) => startOfDayTs(d) === targetTs
         );

         if (targetIdx === -1) {
            next.add(targetTs);
         } else {
            for (let i = 0; i <= targetIdx; i++) {
               next.add(startOfDayTs(loadedDays[i]));
            }
         }

         if (next.size === prev.size) return prev;
         return next;
      });

      try {
         const scrollerWidth = scroller.clientWidth;
         const scrollWidth = scroller.scrollWidth || 0;
         const dayLeft = dayEl.offsetLeft;
         const dayWidth = dayEl.offsetWidth || scrollerWidth;

         let nextLeft = dayLeft - (scrollerWidth - dayWidth) / 2;
         if (nextLeft < 0) nextLeft = 0;

         const maxLeft =
            scrollWidth > scrollerWidth ? scrollWidth - scrollerWidth : 0;
         if (nextLeft > maxLeft) nextLeft = maxLeft;

         if (Math.abs(nextLeft - scroller.scrollLeft) > 1) {
            scroller.scrollLeft = nextLeft;
         }
      } catch {
         // ignorăm, nu blocăm nimic
      }
   }, [searchHits, searchState.index, loadedDays]);

   useEffect(() => {
      const handler = (e) => {
         if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            if (!dataReady) return;
            e.preventDefault();
            if (searchInputRef.current) {
               searchInputRef.current.focus();
               searchInputRef.current.select();
            }
         }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
   }, [dataReady]);

   useEffect(() => {
      const scroller = scrollRef.current;
      if (!scroller) return;

      const onScroll = () => {
         if (scrollLazyRafRef.current) return;
         scrollLazyRafRef.current = requestAnimationFrame(() => {
            scrollLazyRafRef.current = null;
            recomputeVisibleDays();
         });
      };

      const onResize = () => {
         recomputeVisibleDays();
      };

      recomputeVisibleDays();

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
   }, [recomputeVisibleDays]);

   return (
      <div className="dayview__wrapper">
         <div className="dayview" style={layoutVars}>
            <ACalendarToolbar
               dataReady={dataReady}
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
               presenceByReservationColors={presenceByReservationColors}
               sectorOptions={sectorOptions}
               onSectorChange={setSectorFilter}
            />

            <ACalendarTrack
               scrollRef={scrollRef}
               rowHeight={rowHeight}
               dayRefs={dayRefs}
               loadedDays={loadedDays}
               visibleDays={visibleDays}
               isDummyMode={isDummyMode}
               allowedInstBySector={allowedInstBySector}
               baseMetrics={baseMetrics}
               maxColsPerGroup={maxColsPerGroup}
               zoom={zoom}
               timeMarks={timeMarks}
               handleCreateFromEmpty={handleCreateFromEmpty}
               activeEventId={effectiveActiveEventId}
               handleActiveEventRectChange={handleActiveEventRectChange}
               cars={cars}
               instructors={instructors}
               users={users}
               canvasInstructors={canvasInstructors}
               viewModel={calendarViewModel}
               forceAllDaysVisible={hasSearchHits}
               /* ✅ ADĂUGI ASTEA */
               onReservationJoin={joinReservationSafe}
               presenceReservationIds={presenceReservationIds}
               presenceByReservationColors={presenceByReservationColors}
            />
         </div>
      </div>
   );
}

/* ================== COMPONENTĂ HEADER / TOOLBAR ================== */

function ACalendarToolbar({
   dataReady,
   searchInputRef,
   searchInput,
   onSearchInputChange,
   onRunSearch,
   onClearSearch,
   onPrevHit,
   onNextHit,
   searchTotal,
   searchIndex,
   currentZoomValue,
   zoomOptions,
   onZoomChange,
   currentMonthValue,
   monthOptions,
   onMonthChange,
   sectorFilter,
   sectorOptions,
   onSectorChange,
   presenceByReservationColors,
}) {
   return (
      <div className="dayview__header">
         <SimpleDropdown
            value={currentMonthValue}
            onChange={onMonthChange}
            options={monthOptions}
            placeholder="Alege luna"
            className="dv-dd--month"
            aria-label="Alege luna"
         />
         <SimpleDropdown
            value={sectorFilter}
            onChange={onSectorChange}
            options={sectorOptions}
            placeholder="Sector"
            className="dv-dd--sector"
            aria-label="Filtrează după sector"
         />
         <div className="dv-search">
            <div className="dv-search__input-wrapper">
               <input
                  ref={searchInputRef}
                  className="dv-search__input"
                  placeholder={
                     dataReady
                        ? "Caută după nume / telefon / notiță…"
                        : "Se încarcă programările…"
                  }
                  disabled={!dataReady}
                  value={searchInput}
                  onChange={onSearchInputChange}
                  onKeyDown={(e) => {
                     if (e.key === "Enter") {
                        onRunSearch();
                     } else if (e.key === "ArrowLeft") {
                        if (searchTotal) {
                           e.preventDefault();
                           onPrevHit();
                        }
                     } else if (e.key === "ArrowRight") {
                        if (searchTotal) {
                           e.preventDefault();
                           onNextHit();
                        }
                     } else if (e.key === "Escape") {
                        if (searchInput) {
                           e.preventDefault();
                           onClearSearch();
                        }
                     }
                  }}
               />
               <button
                  type="button"
                  className="dv-search__btn-clear"
                  disabled={!searchInput}
                  onClick={onClearSearch}
                  title="Șterge căutarea"
               >
                  ✕
               </button>
            </div>
            <div className="dv-search__nav">
               <button
                  type="button"
                  className="dv-search__btn"
                  disabled={!dataReady}
                  onClick={onRunSearch}
                  title="Caută"
               >
                  <ReactSVG
                     className="rbc-btn-group__icon react-icon"
                     src={searchIcon}
                  />
               </button>
            </div>
            <div className="dv-search__count-wrapper">
               <span className="dv-search__count">
                  {searchTotal ? `${searchIndex + 1}/${searchTotal}` : "0/0"}
               </span>
               <button
                  type="button"
                  className="dv-search__btn-count"
                  disabled={!searchTotal}
                  onClick={onPrevHit}
                  title="Rezultatul anterior"
               >
                  ◀
               </button>

               <button
                  type="button"
                  className="dv-search__btn-count"
                  disabled={!searchTotal}
                  onClick={onNextHit}
                  title="Rezultatul următor"
               >
                  ▶
               </button>
            </div>
         </div>

         <SimpleDropdown
            value={currentZoomValue}
            onChange={onZoomChange}
            options={zoomOptions}
            placeholder="Zoom"
            className="dv-dd--zoom"
            aria-label="Nivel zoom"
         />
      </div>
   );
}

/* ================== COMPONENTĂ TRACK (zile + DayviewCanvasTrack) ================== */

const ACalendarTrack = memo(function ACalendarTrack({
   scrollRef,
   rowHeight,
   dayRefs,
   loadedDays,
   visibleDays,
   isDummyMode,
   allowedInstBySector,
   baseMetrics,
   maxColsPerGroup,
   zoom,
   timeMarks,
   handleCreateFromEmpty,
   activeEventId,
   handleActiveEventRectChange,
   cars,
   instructors,
   users,
   canvasInstructors,
   viewModel,
   forceAllDaysVisible,
   onReservationJoin,
   presenceByReservationUsers, // ✅
   presenceByReservationColors, // ✅
}) {
   const eventsByDay = viewModel?.eventsByDay || new Map();
   const standardSlotsByDay = viewModel?.standardSlotsByDay || new Map();
   const blackoutKeyMap = viewModel?.blackoutKeyMap || null;
   const blackoutVer = viewModel?.blackoutVer ?? 0;

   return (
      <div
         className="dayview__row dv-pan"
         ref={scrollRef}
         style={{
            touchAction: "none",
            height: rowHeight ? `${rowHeight}px` : undefined,
            overflowX: "auto",
            overflowY: "auto",
            overscrollBehavior: "contain",
            cursor: "grab",
            WebkitUserDrag: "none",
            userSelect: "none",
            willChange: "scroll-position",
         }}
      >
         <div
            className="dayview__track"
            style={{
               display: "flex",
               alignItems: "stretch",
               gap: "24px",
               paddingRight: "24px",
               height: "100%",
            }}
         >
            {loadedDays.map((d) => {
               const ts = startOfDayTs(d);
               const isVisible = forceAllDaysVisible || visibleDays.has(ts);

               let evs = isDummyMode
                  ? EMPTY_EVENTS
                  : eventsByDay.get(ts) || EMPTY_EVENTS;
               if (allowedInstBySector && evs !== EMPTY_EVENTS) {
                  evs = evs.filter((ev) =>
                     allowedInstBySector.has(
                        String(ev.instructorId ?? "__unknown")
                     )
                  );
               }

               const label = new Intl.DateTimeFormat("ro-RO", {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
               })
                  .format(d)
                  .replace(",", "");

               const dayStartLocal = new Date(d);
               dayStartLocal.setHours(7, 0, 0, 0);
               const dayEndLocal = new Date(d);
               dayEndLocal.setHours(21, 0, 0, 0);

               const slots = standardSlotsByDay.get(ts) || [];

               return (
                  <section
                     key={ts}
                     ref={(el) => {
                        const map = dayRefs.current;
                        if (el) {
                           map.set(ts, el);
                           el.dataset.dayTs = String(ts);
                        } else {
                           map.delete(ts);
                        }
                     }}
                     className="dayview__group-wrap cv-auto"
                     data-active="1"
                     data-day-ts={ts}
                     style={{
                        flex: "0 0 auto",
                        display: "flex",
                        flexDirection: "column",
                     }}
                  >
                     <header className="dayview__group-header">
                        <div className="dayview__group-title">{label}</div>
                     </header>

                     <div
                        className="dayview__group-content dayview__group-content--row"
                        style={{
                           flex: "1 1 auto",
                           minHeight: 0,
                        }}
                     >
                        {isVisible ? (
                           <DayviewCanvasTrack
                              dayStart={dayStartLocal}
                              dayEnd={dayEndLocal}
                              instructors={canvasInstructors}
                              events={DEBUG_CANVAS_EMPTY ? [] : evs}
                              slots={slots}
                              layout={{
                                 colWidth: baseMetrics.colw,
                                 colGap: 12 * zoom,
                                 headerHeight: 40 * zoom,
                                 slotHeight: 125 * zoom,
                                 colsPerRow: maxColsPerGroup,
                                 rowGap: 24 * zoom,
                                 dayWidth: baseMetrics.dayWidth,
                              }}
                              timeMarks={timeMarks}
                              onCreateSlot={handleCreateFromEmpty}
                              blockedKeyMap={
                                 DEBUG_CANVAS_EMPTY
                                    ? null
                                    : isDummyMode
                                    ? null
                                    : blackoutKeyMap
                              }
                              blackoutVer={blackoutVer}
                              activeEventId={activeEventId}
                              onActiveEventRectChange={
                                 handleActiveEventRectChange
                              }
                              cars={cars}
                              instructorsFull={instructors}
                              users={users}
                              zoom={zoom / Z_BASE}
                              onReservationJoin={onReservationJoin}
                              presenceByReservationUsers={
                                 presenceByReservationUsers
                              }
                              presenceByReservationColors={
                                 presenceByReservationColors
                              }
                           />
                        ) : (
                           <div className="dayview__skeleton" />
                        )}
                     </div>
                  </section>
               );
            })}
         </div>
      </div>
   );
});
