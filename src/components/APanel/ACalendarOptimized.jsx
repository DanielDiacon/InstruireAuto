import React, {
   useMemo,
   useEffect,
   useState,
   useCallback,
   useRef,
   useLayoutEffect,
} from "react";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import { listenCalendarRefresh } from "../Utils/calendarBus";
import { fetchInstructorsGroups } from "../../store/instructorsGroupSlice";
import { fetchCars } from "../../store/carsSlice";
import {
   fetchReservationsDelta,
   maybeRefreshReservations,
   fetchReservationsForMonth,
} from "../../store/reservationsSlice";
import { fetchStudents } from "../../store/studentsSlice";
import { fetchUsers } from "../../store/usersSlice";
import { fetchInstructors } from "../../store/instructorsSlice";

import { openPopup } from "../Utils/popupStore";
import DayviewCanvasTrack from "./Calendar/DayviewCanvasTrack";
import useInertialPan from "./Calendar/useInertialPan";
import { useReservationSocket } from "../../socket/useReservationSocket";
import { getInstructorBlackouts } from "../../api/instructorsService";

/* ===== Helpers ===== */
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

// citire token din cookie
const getCookie = (name) => {
   if (typeof document === "undefined") return null;
   const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
   return m ? decodeURIComponent(m[2]) : null;
};

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

/* Zoom: baza 0.6 = 100%. Niveluri: 50–200% */
const Z_BASE = 0.6;
const ZOOM_PERCENT_LEVELS = [50, 75, 100, 125, 150, 200];

/* Interval refresh auto (ms) */
const AUTO_REFRESH_ENABLED = true;

/* Array partajat pentru zile fără evenimente */
const EMPTY_EVENTS = [];

/* Timezone pentru blackouts */
const MOLDOVA_TZ_ID = "Europe/Chisinau";
const DEBUG_CANVAS_EMPTY = false;

// Intl cache pentru TZ (blackouts)
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

/* ================= COMPONENT UNIC ================= */
export default function ACalendarOptimized({
   date,
   extraFilters,
   onMonthChange,
} = {}) {
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

   // 🔹 nou: raf pentru lazy-load pe scroll, ca să nu facem calcule la fiecare pixel
   const scrollLazyRafRef = useRef(null);

   // 🔹 flag: centrează pe Y DOAR imediat după search / next / prev
   const shouldAutoCenterRef = useRef(false);

   // 🔹 state pentru zilele efectiv “active” (lazy render)
   const [visibleDays, setVisibleDays] = useState(() => new Set());

   // 🔹 handler global care centrează pe Y eventul activ în scroller,
   //    dar DOAR când we've cerut explicit (search / next / prev)
   const handleActiveEventRectChange = useCallback((info) => {
      const scroller = scrollRef.current;
      if (!scroller || !info) return;

      // dacă nu e cerut explicit -> nu facem nimic
      if (!shouldAutoCenterRef.current) return;

      // dacă user-ul trage de calendar, nu ne băgăm
      if (suspendFlagsRef.current?.isInteracting) {
         shouldAutoCenterRef.current = false;
         return;
      }

      const scRect = scroller.getBoundingClientRect();
      const margin = 24; // cât spațiu lăsăm sus/jos în jurul eventului

      // Dacă DayviewCanvasTrack ne trimite top/bottom precise – le folosim
      const topY = info.topY ?? info.centerY ?? null;
      const bottomY =
         info.bottomY ?? (info.centerY != null ? info.centerY : null);

      if (topY == null || bottomY == null) {
         shouldAutoCenterRef.current = false;
         return;
      }

      // coordonate relative în scroller
      const topRel = topY - scRect.top;
      const bottomRel = bottomY - scRect.top;

      let nextTop = scroller.scrollTop;
      let shouldScroll = false;

      // dacă eventul e prea sus, îl aducem puțin mai jos
      if (topRel < margin) {
         nextTop += topRel - margin;
         shouldScroll = true;
      }
      // dacă eventul e prea jos, îl ridicăm
      else if (bottomRel > scRect.height - margin) {
         nextTop += bottomRel - (scRect.height - margin);
         shouldScroll = true;
      }

      if (!shouldScroll) {
         // one-shot consumat, chiar dacă nu am mutat nimic
         shouldAutoCenterRef.current = false;
         return;
      }

      if (nextTop < 0) nextTop = 0;

      // fără animație, doar setare directă
      scroller.scrollTop = nextTop;

      // one-shot: după ce am centrat, nu mai mișcăm de capul nostru
      shouldAutoCenterRef.current = false;
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

   const dispatch = useDispatch();
   const LESSON_MINUTES = 90;

   const EVENT_H = 48;
   const SLOT_H = 125;
   const HOURS_COL_W = 60;
   const COL_W = 220;
   const GROUP_GAP = "32px";

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

   const setZoomClamped = useCallback((val) => {
      const z = Math.max(Z_MIN, Math.min(Z_MAX, val));
      setZoom(z);
      return z;
   }, []);

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

   const refreshCtlRef = useRef({ t: null, delay: 15000, noChange: 0 });
   const bcRef = useRef(null);

   const scheduleSmartTick = useCallback(() => {
      if (!AUTO_REFRESH_ENABLED) return;

      const ctl = refreshCtlRef.current;
      if (ctl.t) clearTimeout(ctl.t);

      ctl.t = setTimeout(async () => {
         if (document.hidden || suspendFlagsRef.current?.isInteracting) {
            scheduleSmartTick();
            return;
         }

         let res = null;
         try {
            res = await dispatch(maybeRefreshReservations()).unwrap();
         } catch {
            // ignorăm erorile, încercăm mai târziu
         }

         if (res?.refreshed) {
            ctl.noChange = 0;
            ctl.delay = 15000;
            bcRef.current?.postMessage({
               type: "reservations-changed",
               etag: res?.etag || null,
            });
         } else {
            const steps = [15000, 30000, 60000, 120000];
            ctl.noChange = Math.min(steps.length - 1, ctl.noChange + 1);
            ctl.delay = steps[ctl.noChange];
         }

         scheduleSmartTick();
      }, ctl.delay);
   }, [dispatch]);

   const token = getCookie("access_token");

   useReservationSocket(token, {
      onConnect: () => {
         refreshCtlRef.current.noChange = 0;
         refreshCtlRef.current.delay = 15000;
         dispatch(fetchReservationsDelta());
         scheduleSmartTick();
      },
      onDisconnect: () => {
         refreshCtlRef.current.noChange = 0;
         refreshCtlRef.current.delay = 15000;
         scheduleSmartTick();
      },
      onReservationJoined: () => {
         if (!suspendFlagsRef.current?.isInteracting) {
            dispatch(fetchReservationsDelta());
         } else {
            dispatch(maybeRefreshReservations());
         }
      },
      onReservationLeft: () => {
         if (!suspendFlagsRef.current?.isInteracting) {
            dispatch(fetchReservationsDelta());
         } else {
            dispatch(maybeRefreshReservations());
         }
      },
      onReservationJoinDenied: (data) => {
         console.warn("[WS] join denied", data);
      },
      onReservationsChanged: () => {
         if (!suspendFlagsRef.current?.isInteracting) {
            dispatch(fetchReservationsDelta());
         } else {
            dispatch(maybeRefreshReservations());
         }
      },
   });

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

   const reservationsLive = useSelector(
      (s) => s.reservations?.list ?? [],
      shallowEqual
   );

   const [reservationsUI, setReservationsUI] = useState(reservationsLive);
   const reservationsUIDedup = reservationsUI;
   const pendingReservationsRef = useRef(null);

   useEffect(() => {
      const interacting = !!suspendFlagsRef.current?.isInteracting;
      if (interacting) {
         pendingReservationsRef.current = reservationsLive;
      } else {
         setReservationsUI((prev) => {
            if (prev === reservationsLive) return prev;
            return reservationsLive;
         });
         pendingReservationsRef.current = null;
      }
   }, [reservationsLive]);

   useEffect(() => {
      if (!hasPrefetchedAllRef.current) return;
      if ((reservationsLive?.length ?? 0) === 0) {
         dispatch(fetchReservationsDelta());
      }
   }, [dispatch, reservationsLive?.length]);

   useEffect(() => {
      if (typeof window === "undefined") return;

      if ("BroadcastChannel" in window) {
         bcRef.current = new BroadcastChannel("reservations-meta");
         bcRef.current.onmessage = (e) => {
            if (
               e?.data?.type === "reservations-changed" &&
               !suspendFlagsRef.current?.isInteracting
            ) {
               dispatch(fetchReservationsDelta());
               refreshCtlRef.current.noChange = 0;
               refreshCtlRef.current.delay = 15000;
               scheduleSmartTick();
            }
         };
      }

      scheduleSmartTick();

      return () => {
         if (refreshCtlRef.current.t) {
            clearTimeout(refreshCtlRef.current.t);
            refreshCtlRef.current.t = null;
         }
         bcRef.current?.close?.();
      };
   }, [dispatch, scheduleSmartTick]);

   useEffect(() => {
      const onFocusVisible = () => {
         if (!document.hidden && !suspendFlagsRef.current?.isInteracting) {
            refreshCtlRef.current.noChange = 0;
            refreshCtlRef.current.delay = 15000;
            scheduleSmartTick();
            dispatch(maybeRefreshReservations());
         }
      };
      window.addEventListener("focus", onFocusVisible);
      document.addEventListener("visibilitychange", onFocusVisible);
      return () => {
         window.removeEventListener("focus", onFocusVisible);
         document.removeEventListener("visibilitychange", onFocusVisible);
      };
   }, [dispatch, scheduleSmartTick]);

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
   const users = useSelector((s) => s.users?.list ?? [], shallowEqual);

   const dataReady = useMemo(
      () =>
         (reservationsLive?.length ?? 0) > 0 ||
         (students?.length ?? 0) > 0 ||
         (instructorsGroups?.length ?? 0) > 0,
      [reservationsLive?.length, students?.length, instructorsGroups?.length]
   );

   const isDummyMode = !dataReady;

   const maxColsPerGroup = 3;
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
      [timeMarks, HIDDEN_INTERVALS, LESSON_MINUTES]
   );

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
            privateMessage: u.privateMessage ?? u.privateMessaje ?? "",
         });
      });
      return map;
   }, [students]);

   const studentDictRef = useRef(null);
   useEffect(() => {
      studentDictRef.current = studentDict;
   }, [studentDict]);

   // === Search state (input + rezultate) ===
   const [searchInput, setSearchInput] = useState("");
   const [searchState, setSearchState] = useState({
      query: "",
      hits: [],
      index: 0,
   });

   /* dicționar pentru grupe -> acces rapid în mapReservationToEvent */
   const instructorsGroupDict = useMemo(() => {
      const m = new Map();
      (instructorsGroups || []).forEach((g) => {
         if (!g) return;
         m.set(String(g.id), g);
      });
      return m;
   }, [instructorsGroups]);

   /* ===== Funcții TZ pentru blackouts (aceleași ca în varianta veche) ===== */
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
            r.note,
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

            // câmpuri pentru search
            searchNorm,
            searchPhoneDigits,
         };
      },
      [LESSON_MINUTES, instructorsGroupDict, instructorMeta]
   );

   const eventsByDay = useMemo(() => {
      if (isDummyMode) return new Map();
      const map = new Map();

      (reservationsUIDedup || []).forEach((r) => {
         const startRaw =
            r.startTime ??
            r.start ??
            r.startedAt ??
            r.start_at ??
            r.startDate ??
            r.start_date;
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
      },
      [instructorMeta, instructorsGroups]
   );

   useEffect(() => {
      return listenCalendarRefresh(() => {
         const p = dispatch(fetchReservationsDelta());
         p.finally(() => {
            if (suspendFlagsRef.current?.isInteracting) {
               requestAnimationFrame(() => {
                  scrollRef.current?.dispatchEvent(new CustomEvent("dvpanend"));
               });
            }
         });
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

   // 🔹 lazy-load pe zile bazat DOAR pe scrollLeft (X), nu pe Y / IntersectionObserver
   const recomputeVisibleDays = useCallback(() => {
      const scroller = scrollRef.current;
      if (!scroller) return;

      const viewLeft = scroller.scrollLeft;
      const viewRight = viewLeft + scroller.clientWidth;
      const MARGIN = 600; // cât “mai în față” pregătim zilele

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

         // fallback: dacă încă nu avem nimic marcat, măcar primele câteva zile
         if (!next.size && loadedDays.length) {
            const maxInit = 7;
            for (let i = 0; i < loadedDays.length && i < maxInit; i++) {
               next.add(startOfDayTs(loadedDays[i]));
            }
         }

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
      instIdsAll.forEach((iid) => {
         ensureBlackoutsFor(iid);
      });
   }, [instIdsAll, ensureBlackoutsFor]);

   const standardSlotsByDay = useMemo(() => {
      const map = new Map();
      loadedDays.forEach((d) => {
         const ts = startOfDayTs(d);
         map.set(ts, mkStandardSlotsForDay(d));
      });
      return map;
   }, [loadedDays, mkStandardSlotsForDay]);

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

         // resetăm complet căutarea când schimbi luna
         setSearchInput("");
         setSearchState({ query: "", hits: [], index: 0 });
         setVisibleDays(new Set()); // se vor recalcula din nou
         shouldAutoCenterRef.current = false;
      },
      [monthOptions, extraFilters, onMonthChange, dispatch]
   );

   const sectorOptions = useMemo(
      () => [
         { value: "Toate", label: "Toate sectoarele" },
         { value: "Botanica", label: "Botanica" },
         { value: "Ciocana", label: "Ciocana" },
      ],
      []
   );

   const px = (v) => parseFloat(String(v || 0));

   const baseMetrics = useMemo(() => {
      const baseColw = px(COL_W) * zoom;
      const baseDayWidth = maxColsPerGroup * baseColw;
      return { colw: baseColw, dayWidth: baseDayWidth };
   }, [zoom]);

   const layoutVars = {
      "--event-h": `${EVENT_H * zoom}px`,
      "--slot-h-fixed": `${SLOT_H * zoom}px`,
      "--hours-col-w": `${HOURS_COL_W * zoom}px`,
      "--group-gap": `calc(${GROUP_GAP} * ${zoom})`,
      "--day-header-h": `44px`,
      "--row-header-h": `auto`,
      "--font-scale": zoom,
      "--zoom": zoom,
   };

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

      return base.map((i) => {
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
   }, [isDummyMode, instructors, allowedInstBySector, instructorMeta]);

   /* ========== LOGICA DE SEARCH OPTIMIZATĂ ========== */

   const handleSearchInputChange = useCallback((e) => {
      const val = e.target.value;
      setSearchInput(val);

      // orice editare manuală oprește auto-centrarea viitoare
      shouldAutoCenterRef.current = false;

      // dacă ștergi complet, resetăm rezultatele
      if (!val.trim()) {
         setSearchState({ query: "", hits: [], index: 0 });
      }
   }, []);

   const runSearch = useCallback(() => {
      const raw = (searchInput || "").trim();

      // prea scurt => ștergem search-ul
      if (raw.length < 2) {
         setSearchState({ query: "", hits: [], index: 0 });
         shouldAutoCenterRef.current = false;
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

         // după fiecare search nou, permitem UN singur auto-center pe Y
         shouldAutoCenterRef.current = hits.length > 0;
      };

      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
         window.requestIdleCallback(doWork);
      } else {
         setTimeout(doWork, 0);
      }
   }, [searchInput, loadedDays, eventsByDay]);

   const searchHits = searchState.hits;
   const searchTotal = searchHits.length;
   const searchIndex = searchState.index;

   const activeSearchHit =
      searchTotal && searchIndex < searchTotal ? searchHits[searchIndex] : null;
   const activeSearchEventId = activeSearchHit ? activeSearchHit.eventId : null;

   const goSearchNext = useCallback(() => {
      setSearchState((prev) => {
         const total = prev.hits.length;
         if (!total) return prev;
         const nextIndex = (((prev.index + 1) % total) + total) % total;
         if (nextIndex === prev.index) return prev;

         // când sari la alt rezultat, dăm voie la un auto-center pe Y
         shouldAutoCenterRef.current = true;

         return { ...prev, index: nextIndex };
      });
   }, []);

   const goSearchPrev = useCallback(() => {
      setSearchState((prev) => {
         const total = prev.hits.length;
         if (!total) return prev;
         const nextIndex = (((prev.index - 1 + total) % total) + total) % total;
         if (nextIndex === prev.index) return prev;

         shouldAutoCenterRef.current = true;

         return { ...prev, index: nextIndex };
      });
   }, []);

   // scroll automat la ziua hit-ului curent (X)
   useEffect(() => {
      const total = searchHits.length;
      if (!total) return;
      const idx = searchState.index;
      const hit = searchHits[idx];
      if (!hit) return;
      const scroller = scrollRef.current;
      const dayEl = dayRefs.current.get(hit.dayTs);
      if (!scroller || !dayEl) return;

      const rect = dayEl.getBoundingClientRect();
      const scRect = scroller.getBoundingClientRect();
      const deltaLeft = rect.left - scRect.left;

      scroller.scrollBy({
         left: deltaLeft,
         behavior: "smooth",
      });
   }, [searchHits, searchState.index]);

   // 🔹 lazy-load pe scroll (doar când NU tragi cu mouse-ul)
   useEffect(() => {
      const scroller = scrollRef.current;
      if (!scroller) return;

      const onScroll = () => {
         if (suspendFlagsRef.current?.isInteracting) return;

         if (scrollLazyRafRef.current) return;
         scrollLazyRafRef.current = requestAnimationFrame(() => {
            scrollLazyRafRef.current = null;
            recomputeVisibleDays();
         });
      };

      const onResize = () => {
         recomputeVisibleDays();
      };

      // init
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

   // 🔹 la final de pan / inerție, facem un singur recomputeVisibleDays
   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      const onPanEnd = () => {
         if (pendingReservationsRef.current) {
            setReservationsUI(pendingReservationsRef.current);
            pendingReservationsRef.current = null;
         }
         recomputeVisibleDays();
      };
      el.addEventListener("dvpanend", onPanEnd);
      return () => el.removeEventListener("dvpanend", onPanEnd);
   }, [recomputeVisibleDays]);

   return (
      <div className="dayview__wrapper">
         <div className="dayview" style={layoutVars}>
            {/* Header */}
            <div className="dayview__header">
               <div className="dayview__header-left">
                  <SimpleDropdown
                     value={currentMonthValue}
                     onChange={handleMonthChange}
                     options={monthOptions}
                     placeholder="Alege luna"
                     className="dv-dd--month"
                     aria-label="Alege luna"
                  />
                  <SimpleDropdown
                     value={sectorFilter}
                     onChange={(v) => setSectorFilter(v)}
                     options={sectorOptions}
                     placeholder="Sector"
                     className="dv-dd--sector"
                     aria-label="Filtrează după sector"
                  />
               </div>

               <div className="dayview__toolbar">
                  <input
                     className="dv-search__input"
                     placeholder={
                        dataReady
                           ? "Caută după nume / telefon / notiță…"
                           : "Se încarcă programările…"
                     }
                     disabled={!dataReady}
                     value={searchInput}
                     onChange={handleSearchInputChange}
                     onKeyDown={(e) => {
                        if (e.key === "Enter") {
                           runSearch();
                        }
                     }}
                  />

                  <div className="dv-search__nav">
                     <button
                        type="button"
                        className="dv-search__btn dv-search__btn--run"
                        disabled={!dataReady}
                        onClick={runSearch}
                        title="Caută"
                     >
                        🔍
                     </button>

                     <button
                        type="button"
                        className="dv-search__btn dv-search__btn--prev"
                        disabled={!searchTotal}
                        onClick={goSearchPrev}
                        title="Rezultatul anterior"
                     >
                        ◀
                     </button>

                     <span className="dv-search__count">
                        {searchTotal
                           ? `${searchIndex + 1}/${searchTotal}`
                           : "0/0"}
                     </span>

                     <button
                        type="button"
                        className="dv-search__btn dv-search__btn--next"
                        disabled={!searchTotal}
                        onClick={goSearchNext}
                        title="Rezultatul următor"
                     >
                        ▶
                     </button>
                  </div>

                  <SimpleDropdown
                     value={currentZoomValue}
                     onChange={handleZoomChange}
                     options={zoomOptions}
                     placeholder="Zoom"
                     className="dv-dd--zoom"
                     aria-label="Nivel zoom"
                  />
               </div>
            </div>

            {/* Track: TOATE zilele lunii, fiecare zi cu un canvas propriu (lazy) */}
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
                     const isVisible = visibleDays.has(ts);

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
                              <div className="dayview__group-title">
                                 {label}
                              </div>
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
                                       hoursColWidth: 0,
                                       headerHeight: 40 * zoom,
                                       slotHeight: SLOT_H * zoom,
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
                                          : blackoutKeyMapRef.current
                                    }
                                    blackoutVer={blackoutVer}
                                    activeEventId={activeSearchEventId}
                                    onActiveEventRectChange={
                                       handleActiveEventRectChange
                                    }
                                    // 🔹 date suplimentare pentru header optimizat
                                    cars={cars}
                                    instructorsFull={instructors}
                                    users={users}
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
         </div>
      </div>
   );
}
