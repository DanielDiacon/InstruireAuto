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

import {
   listenCalendarRefresh,
   scheduleCalendarRefresh,
} from "../../Utils/calendarBus";

//import { fetchInstructorsGroups } from "../../../store/instructorsGroupSlice";
import { fetchCars } from "../../../store/carsSlice";
import {
   fetchReservationsDelta,
   maybeRefreshReservations,
   fetchReservationsForMonth,
   removeReservationLocal, // ✅ ADD
} from "../../../store/reservationsSlice";

import { fetchStudents } from "../../../store/studentsSlice";
import { fetchUsers } from "../../../store/usersSlice";
import {
   updateInstructor,
   fetchInstructors,
} from "../../../store/instructorsSlice";

import { ReactSVG } from "react-svg";
import searchIcon from "../../../assets/svg/search.svg";

import {
   selectCalendarBaseData,
   selectCalendarDerivedData,
} from "../../../store/calendarSelectors";

import { openPopup } from "../../Utils/popupStore";

import DayviewCanvasTrack from "./DayviewCanvasTrack";
import useInertialPan from "./useInertialPan";
import DayOrderEditorModal from "./DayOrderEditorModal";

import { useReservationSocket } from "../../../socket/useReservationSocket";
import { getInstructorBlackouts } from "../../../api/instructorsService";

/* ================= HELPERE GENERALE ================= */
const LS_DV_MONTH_KEY = "__DV_CALENDAR_MONTH"; // salvează "YYYY-MM"
/* ================== PERSIST PAN (X/Y) ON REFRESH ================== */
const LS_DV_PAN_PREFIX = "__DV_PAN_V1"; // per-lună (și opțional per-filtru)
/* ================== PERSIST ZOOM ================== */
const LS_DV_ZOOM_KEY = "__DV_ZOOM_V1";

function safeReadZoom() {
   if (typeof window === "undefined") return null;
   try {
      const raw = localStorage.getItem(LS_DV_ZOOM_KEY);
      if (!raw) return null;

      // acceptă fie număr simplu, fie JSON {z:...}
      let z = null;
      if (raw.trim().startsWith("{")) {
         const obj = JSON.parse(raw);
         z = Number(obj?.z);
      } else {
         z = Number(raw);
      }

      return Number.isFinite(z) ? z : null;
   } catch {
      return null;
   }
}

function safeWriteZoom(z) {
   if (typeof window === "undefined") return;
   try {
      localStorage.setItem(
         LS_DV_ZOOM_KEY,
         JSON.stringify({ z: Number(z) || 0, t: Date.now() }),
      );
   } catch {}
}

function makePanKey(monthKey, sectorKey = "") {
   // sectorKey e optional; dacă nu vrei per-sector, lasă-l ""
   const mk = String(monthKey || "").trim() || "unknown-month";
   const sk = String(sectorKey || "").trim() || "all";
   return `${LS_DV_PAN_PREFIX}:${mk}:${sk}`;
}

function safeReadPan(key) {
   if (typeof window === "undefined") return null;
   try {
      const raw = localStorage.getItem(String(key));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      const x = Number(obj?.x);
      const y = Number(obj?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
   } catch {
      return null;
   }
}

function safeWritePan(key, x, y) {
   if (typeof window === "undefined") return;
   try {
      localStorage.setItem(
         String(key),
         JSON.stringify({
            x: Math.max(0, Number(x) || 0),
            y: Math.max(0, Number(y) || 0),
            t: Date.now(),
         }),
      );
   } catch {}
}

function clampPanToScroller(scroller, x, y) {
   if (!scroller) return { x: 0, y: 0 };

   const maxLeft = Math.max(
      0,
      (scroller.scrollWidth || 0) - (scroller.clientWidth || 0),
   );
   const maxTop = Math.max(
      0,
      (scroller.scrollHeight || 0) - (scroller.clientHeight || 0),
   );

   const cx = Math.max(0, Math.min(Number(x) || 0, maxLeft));
   const cy = Math.max(0, Math.min(Number(y) || 0, maxTop));

   return { x: cx, y: cy };
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
      [onChange],
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

/* === CONSTANTE PENTRU LAYOUT / ZOOM / TIMING === */

const Z_BASE = 0.6;
const Z_MIN = Z_BASE * 0.5;
const Z_MAX = Z_BASE * 2.0;

const clampZoom = (val) =>
   Math.max(Z_MIN, Math.min(Z_MAX, Number(val) || Z_BASE));

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

const LESSON_MINUTES = 90;
const EVENT_H = 48;
const SLOT_H = 125;
const HOURS_COL_W = 60;
const COL_W = 220;
const GROUP_GAP = 32;

/* ================= COMPONENT PRINCIPAL ================= */
export default function ACalendarOptimized({
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

         Promise.resolve(dispatch(fetchReservationsDelta()))
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

   const [visibleDays, setVisibleDays] = useState(() => new Set());
   const visibleDaysCount = visibleDays.size;

   // ✅ Auto-scroll Y: doar o singură dată per acțiune (search / săgeți / focus-edit)
   const activeEventIdRef = useRef(null);
   const autoScrollYOnceRef = useRef({ eventId: null, key: null, done: true });

   const armAutoScrollYOnce = useCallback((eventId, key) => {
      const id = eventId != null ? String(eventId) : null;
      autoScrollYOnceRef.current = {
         eventId: id,
         key: String(key ?? Date.now()),
         done: false,
      };
   }, []);

   const disarmAutoScrollY = useCallback(() => {
      autoScrollYOnceRef.current = { eventId: null, key: null, done: true };
   }, []);

   // scroll automat pe Y pentru event activ — DAR o singură dată (gate)
   const handleActiveEventRectChange = useCallback((info) => {
      const scroller = scrollRef.current;
      if (!scroller || !info) return;

      const activeId = activeEventIdRef.current;
      const gate = autoScrollYOnceRef.current;

      if (!activeId || !gate || gate.done) return;
      if (gate.eventId && String(gate.eventId) !== String(activeId)) return;

      const scRect = scroller.getBoundingClientRect();
      const scHeight = scRect.height || scroller.clientHeight || 0;

      const topY = info.topY ?? info.top ?? null;
      const bottomY = info.bottomY ?? info.bottom ?? null;
      let centerY = info.centerY ?? null;

      if (centerY == null) {
         if (topY != null && bottomY != null)
            centerY = topY + (bottomY - topY) / 2;
         else if (topY != null) centerY = topY;
         else if (bottomY != null) centerY = bottomY;
         else return;
      }

      const centerRel = centerY - scRect.top;
      const wantedTop = scroller.scrollTop + (centerRel - scHeight / 2);

      const maxScrollTop = Math.max(0, scroller.scrollHeight - scHeight);
      const nextTop = Math.max(0, Math.min(wantedTop, maxScrollTop));

      if (Math.abs(nextTop - scroller.scrollTop) < 1) {
         autoScrollYOnceRef.current = { ...gate, done: true };
         return;
      }

      scroller.scrollTop = nextTop;
      autoScrollYOnceRef.current = { ...gate, done: true };
   }, []);

   const isInteractiveTarget = useCallback(
      (el) =>
         !!el.closest?.(
            "button, input, textarea, select, a, [data-dv-interactive='1']",
         ),
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

   const [zoom, setZoom] = useState(() => {
      if (typeof window === "undefined") return Z_BASE;

      // pe mobil rămânem pe Z_BASE (și NU stricăm preferința desktop)
      const isPhone =
         window.matchMedia?.("(max-width: 768px)")?.matches ?? false;
      if (isPhone) return Z_BASE;

      const saved = safeReadZoom();
      return saved != null ? clampZoom(saved) : Z_BASE;
   });

   const setZoomClamped = useCallback((val) => {
      const z = clampZoom(val);
      setZoom(z);
      return z;
   }, []);

   // dacă intrăm pe mobile => forțăm Z_BASE, dar NU salvăm peste zoom-ul desktop
   useEffect(() => {
      if (isMobile) setZoom(Z_BASE);
   }, [isMobile]);

   // dacă ieșim din mobile (resize/orientare) => re-hidratăm o singură dată din LS
   const zoomHydratedRef = useRef(false);
   useEffect(() => {
      if (isMobile) return;
      if (zoomHydratedRef.current) return;
      zoomHydratedRef.current = true;

      const saved = safeReadZoom();
      if (saved != null) setZoom(clampZoom(saved));
   }, [isMobile]);

   // persistă zoom-ul doar pe desktop
   useEffect(() => {
      if (isMobile) return;
      safeWriteZoom(zoom);
   }, [zoom, isMobile]);

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

   const suspendFlagsRef = useRef({ isInteracting: false });

   useInertialPan(scrollRef, {
      suspendFlagsRef,
      shouldIgnore: isInteractiveTarget,
      inertiaX: true,
      inertiaY: true,
      slopPx: 6,
   });

   const token = getCookie("access_token");

   // ✅ debug WS o singură dată
   useEffect(() => {
      try {
         localStorage.setItem("__WS_DEBUG", "1");
      } catch {}
   }, []);

   const [presenceByReservationUsers, setPresenceByReservationUsers] = useState(
      () => new Map(),
   );
   const [presenceVer, setPresenceVer] = useState(0);

   const [createDraftBySlotUsers, setCreateDraftBySlotUsers] = useState(
      () => new Map(),
   );
   const [createDraftVer, setCreateDraftVer] = useState(0);

   const CREATE_DRAFT_TTL_MS = 60 * 1000;
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

         if (changed) setCreateDraftVer((v) => v + 1);
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
         try {
            localStorage.setItem("__WS_DEBUG", on ? "1" : "0");
         } catch {}
         console.log("[WS DEBUG]", window.__WS_DEBUG ? "ON" : "OFF");
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

      // 2) altfel, citește din localStorage (persistă între refresh-uri)
      if (!forced) {
         try {
            apply(localStorage.getItem("__WS_DEBUG") === "1");
         } catch {
            apply(false);
         }
      }

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

         setCreateDraftVer((v) => v + 1);

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

      setPresenceVer((v) => v + 1);

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
         setPresenceByReservationUsers(new Map());
         setCreateDraftBySlotUsers(new Map());
         activeDraftSlotByUserRef.current = new Map();

         runReservationsRefresh("ws-connect");
      },

      onDisconnect: () => {
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
         const ev = String(eventName || "");

         const isDelete =
            /deleted|delete|removed|remove/i.test(ev) ||
            payload?.type === "delete" ||
            payload?.action === "delete";

         if (isDelete) {
            const rid =
               payload?.id ??
               payload?.reservationId ??
               payload?.reservation_id ??
               null;

            if (rid != null) {
               dispatch(removeReservationLocal(rid));
            }

            scheduleCalendarRefresh({
               source: "socket",
               type: "delete",
               id: rid != null ? String(rid) : undefined,
               eventName: ev,
            });

            runReservationsRefresh("socket-delete");
            return;
         }

         scheduleCalendarRefresh({
            source: "socket",
            type: "reservations-changed",
            eventName: ev,
         });

         runReservationsRefresh(`socket:${ev || "changed"}`);
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
      (async () => {
         try {
            await Promise.all([
               dispatch(fetchInstructors()),
               //dispatch(fetchInstructorsGroups()),
               dispatch(fetchStudents()),
               dispatch(
                  fetchReservationsForMonth({
                     date: currentDate,
                     extraFilters: extraFilters || {},
                  }),
               ),
               dispatch(fetchCars()),
               dispatch(fetchUsers()),
            ]);
         } finally {
            // no-op
         }
      })();
   }, [dispatch, currentDate, extraFilters]);

   const {
      reservations: reservationsLive,
      instructorsGroups,
      instructors,
      students,
      cars,
      users,
   } = useSelector(selectCalendarBaseData, shallowEqual);

   const handleSaveOrder = useCallback(
      async (changes) => {
         const payload = (changes || [])
            .map((c) => {
               const id = String(c?.id ?? "").trim();
               const n = Math.max(1, Math.trunc(Number(c?.order)));
               if (!id || !Number.isFinite(n)) return null;

               return {
                  id,
                  order: String(n), // ✅ IMPORTANT: string, ca în request-ul care merge
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
                        data: { order: item.order }, // ✅ minim + string
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

         const n = Number(v);
         return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
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

   const reservationsUIDedup = reservationsLive || [];

   useEffect(() => {
      if (!hasPrefetchedAllRef.current) return;
      if ((reservationsLive?.length ?? 0) === 0) {
         runReservationsRefresh("empty-after-prefetch");
      }
   }, [runReservationsRefresh, reservationsLive?.length]);

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
      [reservationsLive?.length, students?.length, instructorsGroups?.length],
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
                  r.start_date,
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
      [instructorsGroupDict, instructorMeta],
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
            if (inRange) next.add(Number(ts));
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
   const blackoutInFlightRef = useRef(new Set());
   const [blackoutVer, setBlackoutVer] = useState(0);

   const currentMonthValue = useMemo(() => {
      const d = new Date(currentDate);
      const y = d.getFullYear();
      const m = d.getMonth();
      return `${y}-${String(m + 1).padStart(2, "0")}`;
   }, [currentDate]);

   /* ================== PAN RESTORE + SAVE ================== */

   // ✅ cheie per lună + per sector (ca să nu încurce layout-ul)
   const panStorageKey = useMemo(() => {
      // dacă NU vrei per sector, pune doar: makePanKey(currentMonthValue, "")
      return makePanKey(currentMonthValue, sectorFilterNorm);
   }, [currentMonthValue, sectorFilterNorm]);

   const panRestoredKeyRef = useRef(null); // memorează ce key am restaurat

   const savePanNow = useCallback(() => {
      const scroller = scrollRef.current;
      if (!scroller) return;

      safeWritePan(panStorageKey, scroller.scrollLeft, scroller.scrollTop);
   }, [panStorageKey]);

   // ✅ restore după refresh (o singură dată pe key)
   useLayoutEffect(() => {
      if (orderEditOpen) return;

      const scroller = scrollRef.current;
      if (!scroller) return;

      const key = panStorageKey;

      // ✅ restore doar o dată per cheie
      if (panRestoredKeyRef.current === key) return;
      panRestoredKeyRef.current = key;

      const saved = safeReadPan(key);
      if (!saved) return;

      let raf1 = 0;
      let raf2 = 0;

      raf1 = requestAnimationFrame(() => {
         raf2 = requestAnimationFrame(() => {
            const s = scrollRef.current;
            if (!s) return;

            const { x, y } = clampPanToScroller(s, saved.x, saved.y);
            s.scrollLeft = x;
            s.scrollTop = y;

            // ✅ sync imediat (ca să nu “revină” după)
            safeWritePan(key, x, y);
         });
      });

      return () => {
         if (raf1) cancelAnimationFrame(raf1);
         if (raf2) cancelAnimationFrame(raf2);
      };
   }, [panStorageKey, rowHeight, orderEditOpen]);

   // ✅ salvează X/Y la scroll (throttle pe RAF) + beforeunload
   useEffect(() => {
      if (orderEditOpen) return; // nu salva scrollul din editor
      const scroller = scrollRef.current;
      if (!scroller) return;

      let raf = 0;

      const onScroll = () => {
         if (raf) return;
         raf = requestAnimationFrame(() => {
            raf = 0;
            savePanNow();
         });
      };

      const onBeforeUnload = () => savePanNow();

      scroller.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("beforeunload", onBeforeUnload);

      return () => {
         scroller.removeEventListener("scroll", onScroll);
         window.removeEventListener("beforeunload", onBeforeUnload);
         if (raf) cancelAnimationFrame(raf);
      };
   }, [savePanNow, orderEditOpen]);

   useEffect(() => {
      if (typeof window === "undefined") return;
      try {
         localStorage.setItem(LS_DV_MONTH_KEY, currentMonthValue);
      } catch {}
   }, [currentMonthValue]);

   const monthRange = useMemo(
      () => getMonthRangeYMD(currentDate),
      [currentMonthValue],
   );

   useEffect(() => {
      blackoutKeyMapRef.current = new Map();
      blackoutInFlightRef.current = new Set();
      setBlackoutVer((v) => v + 1);
   }, [currentMonthValue]);

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
         const key = String(instId || "").trim();
         if (!key) return;

         if (blackoutKeyMapRef.current.has(key)) return;
         if (blackoutInFlightRef.current.has(key)) return;

         blackoutInFlightRef.current.add(key);

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

            blackoutKeyMapRef.current.set(key, new Set());
            setBlackoutVer((v) => v + 1);
         } finally {
            blackoutInFlightRef.current.delete(key);
         }
      },
      [allowedKeysSet, monthRange],
   );

   // ✅ ținem ref actual pentru bus listener
   useEffect(() => {
      ensureBlackoutsForRef.current = ensureBlackoutsFor;
   }, [ensureBlackoutsFor]);

   useEffect(() => {
      if (!instIdsAll.length) return;
      if (!visibleDaysCount) return;

      instIdsAll.forEach((iid) => {
         ensureBlackoutsFor(iid);
      });
   }, [instIdsAll, ensureBlackoutsFor, visibleDaysCount]);

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

            setBlackoutVer((v) => v + 1);
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
   }, [runReservationsRefresh, joinReservationSafe]);

   const standardSlotsByDay = useMemo(() => {
      const map = new Map();
      loadedDays.forEach((d) => {
         const ts = startOfDayTs(d);
         map.set(ts, mkStandardSlotsForDay(d));
      });
      return map;
   }, [loadedDays, mkStandardSlotsForDay]);
   const blackoutKeyMapSnapshot = useMemo(() => {
      const m = blackoutKeyMapRef.current;
      return m instanceof Map ? new Map(m) : new Map();
   }, [blackoutVer, currentMonthValue]);

   const calendarViewModel = useMemo(
      () => ({
         eventsByDay,
         instIdsAll,
         standardSlotsByDay,
         blackoutKeyMap: blackoutKeyMapSnapshot,
         blackoutVer,
      }),
      [
         eventsByDay,
         instIdsAll,
         standardSlotsByDay,
         blackoutVer,
         blackoutKeyMapSnapshot,
      ],
   );

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

      let targetDayTs = null;
      for (const [ts, evs] of eventsByDay.entries()) {
         if (evs.some((ev) => String(ev.id) === targetId)) {
            targetDayTs = ts;
            break;
         }
      }
      if (targetDayTs == null) return;

      armAutoScrollYOnce(targetId, `focus:${focusToken}`);

      setVisibleDays((prev) => {
         const next = new Set(prev);
         const targetIdx = loadedDays.findIndex(
            (d) => startOfDayTs(d) === targetDayTs,
         );

         if (targetIdx === -1) next.add(targetDayTs);
         else
            for (let i = 0; i <= targetIdx; i++)
               next.add(startOfDayTs(loadedDays[i]));

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

         if (Math.abs(nextLeft - scroller.scrollLeft) > 1)
            scroller.scrollLeft = nextLeft;
      };

      if (typeof window !== "undefined") {
         window.requestAnimationFrame(() =>
            window.requestAnimationFrame(doScrollX),
         );
      }
   }, [
      focusToken,
      eventsByDay,
      loadedDays,
      currentMonthValue,
      armAutoScrollYOnce,
   ]);

   const handleMonthChange = useCallback(
      (val) => {
         const opt = monthOptions.find((o) => String(o.value) === String(val));
         if (!opt) return;
         const newDate = new Date(opt.year, opt.month, 1);

         setCurrentDate(newDate);

         if (typeof onMonthChange === "function") onMonthChange(newDate);

         try {
            dispatch(
               fetchReservationsForMonth({
                  date: newDate,
                  extraFilters: extraFilters || {},
               }),
            );
         } catch (e) {
            console.error("[DayView] fetchReservationsForMonth error", e);
         }

         if (scrollRef.current) {
            scrollRef.current.scrollLeft = 0;
            scrollRef.current.scrollTop = 0;
         }

         disarmAutoScrollY();
         setAutoFocusEventId(null);
         setSearchInput("");
         setSearchState({ query: "", hits: [], index: 0 });
         setVisibleDays(new Set());
      },
      [monthOptions, extraFilters, onMonthChange, dispatch, disarmAutoScrollY],
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
      [zoom],
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

      // ❌ IMPORTANT: NU mai sortăm aici (ca să nu se schimbe ordinea => culorile din header)
      // base.sort((a, b) => { ... })

      const mapped = base.map((i) => {
         const id = String(i.id || "");
         const meta = instructorMeta.get(id);

         const full = `${i.firstName ?? ""} ${i.lastName ?? ""}`.trim();

         return {
            id,
            name: full || "Necunoscut",
            sectorSlug: meta?.sectorNorm || null,
            order: meta?.order ?? i?.order ?? null, // ✅ ADD
         };
      });

      const padCols = [
         { id: "__pad_1", name: "Anulari", sectorSlug: null },
         { id: "__pad_2", name: "Asteptari", sectorSlug: null },
         { id: "__pad_3", name: "Asteptari", sectorSlug: null },
         { id: "__pad_4", name: "Laterală", sectorSlug: null },
      ];

      return [...padCols, ...mapped];
   }, [isDummyMode, instructors, allowedInstBySector, instructorMeta]);

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

         setSearchState({ query: raw, hits, index: hits.length ? 0 : 0 });
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
      const dayEl = dayRefs.current.get(hit.dayTs);
      if (!scroller || !dayEl) return;

      setVisibleDays((prev) => {
         const next = new Set(prev);

         const targetTs = hit.dayTs;
         const targetIdx = loadedDays.findIndex(
            (d) => startOfDayTs(d) === targetTs,
         );

         if (targetIdx === -1) next.add(targetTs);
         else
            for (let i = 0; i <= targetIdx; i++)
               next.add(startOfDayTs(loadedDays[i]));

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

         if (Math.abs(nextLeft - scroller.scrollLeft) > 1)
            scroller.scrollLeft = nextLeft;
      } catch {}
   }, [
      searchHits,
      searchState.index,
      loadedDays,
      armAutoScrollYOnce,
      searchState.query,
   ]);

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

      const onResize = () => recomputeVisibleDays();

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
               instructors={instructorsOrderedForUI}
               users={users}
               canvasInstructors={canvasInstructors}
               viewModel={calendarViewModel}
               forceAllDaysVisible={hasSearchHits}
               presenceVer={presenceVer}
               onReservationJoin={joinReservationSafe}
               createDraftVer={createDraftVer}
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

/* ================== TOOLBAR ================== */

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

/* ================== TRACK ================== */

// ✅ ÎNLOCUIEȘTE COMPLET componenta ACalendarTrack cu asta (și nimic altceva)

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
   presenceVer,
   createDraftVer,
   createDraftBySlotUsers,
   createDraftBySlotColors,
   onReservationJoin,
   presenceByReservationUsers,
   presenceByReservationColors,

   // ✅ NEW (le pasezi din ACalendarOptimized)
   orderEditOpen,
   onToggleOrderEdit,
   onCloseOrderEdit,
   onSaveOrder,
}) {
   const eventsByDay = viewModel?.eventsByDay || new Map();
   const standardSlotsByDay = viewModel?.standardSlotsByDay || new Map();
   const blackoutKeyMap = viewModel?.blackoutKeyMap || null;
   const blackoutVer = viewModel?.blackoutVer ?? 0;

   return (
      <div
         className="dv-track-wrap"
         style={{
            position: "relative",
            height: rowHeight ? `${rowHeight}px` : undefined,
         }}
      >
         {/* ✅ UN SINGUR BUTON pe tot track-ul (sus-stânga) */}
         <button
            type="button"
            data-dv-interactive="1"
            className="dv-track-edit-btn"
            onClick={onToggleOrderEdit}
            title={
               orderEditOpen
                  ? "Înapoi la calendar"
                  : "Editează ordinea instructorilor"
            }
         >
            {orderEditOpen ? "🢘 Înapoi" : "✎ Edit"}
         </button>

         <div
            className="dayview__row dv-pan"
            ref={scrollRef}
            style={{
               touchAction: orderEditOpen ? "auto" : "none",
               height: "100%",
               overflowX: "auto",
               overflowY: "auto",
               overscrollBehavior: "contain",
               cursor: orderEditOpen ? "default" : "grab",
               WebkitUserDrag: "none",
               userSelect: "none",
               willChange: "scroll-position",
            }}
         >
            {orderEditOpen ? (
               // ✅ EDIT MODE: Track dispare, editorul apare în loc
               <DayOrderEditorModal
                  open={true}
                  inline={true}
                  cars={cars}
                  instructors={instructors} // ✅ din store, stabil
                  onClose={onCloseOrderEdit}
                  onSave={onSaveOrder}
               />
            ) : (
               // ✅ NORMAL MODE: Track-ul normal (zilele)
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
                     const isVisible =
                        forceAllDaysVisible || visibleDays.has(ts);

                     let evs = isDummyMode
                        ? EMPTY_EVENTS
                        : eventsByDay.get(ts) || EMPTY_EVENTS;

                     if (allowedInstBySector && evs !== EMPTY_EVENTS) {
                        evs = evs.filter((ev) =>
                           allowedInstBySector.has(
                              String(ev.instructorId ?? "__unknown"),
                           ),
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
                              <div className="dayview__group-title">
                                 {label}
                              </div>
                           </header>

                           <div
                              className="dayview__group-content dayview__group-content--row"
                              style={{ flex: "1 1 auto", minHeight: 0 }}
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
                                       headerHeight: 60 * zoom,
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
                                    presenceVer={presenceVer}
                                    onReservationJoin={onReservationJoin}
                                    presenceByReservationUsers={
                                       presenceByReservationUsers
                                    }
                                    presenceByReservationColors={
                                       presenceByReservationColors
                                    }
                                    createDraftVer={createDraftVer}
                                    createDraftBySlotColors={
                                       createDraftBySlotColors
                                    }
                                    createDraftBySlotUsers={
                                       createDraftBySlotUsers
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
            )}
         </div>
      </div>
   );
});
