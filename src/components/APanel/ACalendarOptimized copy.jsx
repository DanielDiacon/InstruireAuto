// src/components/APanel/ACalendarOptimized.jsx
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
import { listenCalendarRefresh } from "../Utils/calendarBus";
import {
   fetchInstructorsGroups,
   updateGroup,
} from "../../store/instructorsGroupSlice";
import { fetchCars } from "../../store/carsSlice";
import {
   fetchReservationsDelta,
   maybeRefreshReservations,
   updateReservation,
   updateReservationColor,
   removeReservation,
   setReservationColorLocal,
   fetchReservationsForMonth,
} from "../../store/reservationsSlice";
import { fetchStudents } from "../../store/studentsSlice";
import { fetchUsers } from "../../store/usersSlice";
import {
   fetchInstructors,
   updateInstructorWithUser,
} from "../../store/instructorsSlice";

import { openPopup } from "../Utils/popupStore";
import { ReactSVG } from "react-svg";
import arrow from "../../assets/svg/arrow-s.svg";

import InstructorColumnConnected from "./Calendar/InstructorColumnConnected";
import { getInstructorBlackouts } from "../../api/instructorsService";
import useInertialPan from "./Calendar/useInertialPan";
import { useReservationSocket } from "../../socket/useReservationSocket";

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

// face rânduri de câte N coloane (3 by default)
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

/* ===== MEMO pentru coloană ===== */
const MemoInstructorColumn = memo(
   InstructorColumnConnected,
   (prev, next) =>
      prev.inst?.id === next.inst?.id &&
      prev.day?.id === next.day?.id &&
      prev.day?.hydrated === next.day?.hydrated &&
      prev.eventsKey === next.eventsKey &&
      prev.blackoutVer === next.blackoutVer &&
      prev.isHydrating === next.isHydrating
);

// fără react-big-calendar aici, componentă standalone
const noop = () => {};
const MOLDOVA_TZ_ID = "Europe/Chisinau";

/* Zoom: baza 0.6 = 100%. Niveluri: 50–200% */
const Z_BASE = 0.6;
const ZOOM_PERCENT_LEVELS = [50, 75, 100, 125, 150, 200];

/* ================= COMPONENT UNIC ================= */
export default function ACalendarOptimized(props = {}) {
   const compact = !!props.compact;

   // data "luna afișată"
   const [currentDate, setCurrentDate] = useState(() =>
      props.date ? new Date(props.date) : new Date()
   );

   // sync cu props.date
   useEffect(() => {
      if (!props.date) return;
      const d = new Date(props.date);
      if (!isNaN(d)) setCurrentDate(d);
   }, [props.date]);

   // ancora pentru dropdown lună: luna fizică (azi) – 3 în urmă, curentă, 3 înainte
   const [monthAnchorDate] = useState(() => new Date());

   const scrollRef = useRef(null);

   const isInteractiveTarget = useCallback(
      (el) =>
         !!el.closest?.(
            "button, input, textarea, select, a, [data-dv-interactive='1']"
         ),
      []
   );

   // per-coloană "hydration": (zi, instructor) -> a încărcat rezervări reale
   const hydratedColsRef = useRef(new Set());
   const [hydratedColsVer, setHydratedColsVer] = useState(0);
   const colsDirtyRef = useRef(false);

   // înălțime viewport-based
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

   // === Handlers pentru editare / culoare / ștergere / ordini ===
   const handleEdit = useCallback(
      ({ id, data }) => dispatch(updateReservation({ id, data })),
      [dispatch]
   );

   const handleChangeColor = useCallback(
      ({ id, color }) => {
         const token = color && color.startsWith("--") ? color : `--${color}`;
         dispatch(setReservationColorLocal({ id, color: token }));
         dispatch(updateReservationColor({ id, color: token }));
      },
      [dispatch]
   );

   const handleDelete = useCallback(
      ({ id }) => dispatch(removeReservation(id)),
      [dispatch]
   );

   const handleChangeInstructorOrder = useCallback(
      (id, order) => {
         dispatch(updateInstructorWithUser({ id, data: { order } })).catch(
            (err) => console.error("[PATCH ERROR instructors]", err)
         );
      },
      [dispatch]
   );

   const handleSwapGroupOrder = useCallback(
      async ({ updates }) => {
         try {
            return await Promise.all(
               updates.map((u) =>
                  dispatch(updateGroup({ id: u.id, order: u.order }))
               )
            );
         } catch (e) {
            console.error("Eroare la schimbarea ordinii grupelor", e);
            throw e;
         }
      },
      [dispatch]
   );

   // Layout (baze numerice; zoom-ul se aplică mai jos)
   const layout = props.layout || {};

   const EVENT_H = layout.eventHeight ?? 48; // px
   const SLOT_H = layout.slotHeight ?? 125; // px în flow-mode
   const HOURS_COL_W = layout.hoursColWidth ?? 60;
   const COL_W = layout.colWidth ?? 220;
   const GROUP_GAP = layout.groupGap ?? "32px";
   const CONTAINER_H = layout.containerHeight;
   const DAY_GAP = 32;

   // Mobile detect
   const [isMobile, setIsMobile] = useState(false);

   useEffect(() => {
      if (typeof window === "undefined") return;
      const mql = window.matchMedia("(max-width: 768px)");
      const apply = () => setIsMobile(mql.matches);
      apply();
      mql.addEventListener?.("change", apply);
      return () => mql.removeEventListener?.("change", apply);
   }, []);

   // Zoom (bază 0.6 = 100%)
   const [zoom, setZoom] = useState(Z_BASE);
   const Z_MIN = Z_BASE * 0.5;
   const Z_MAX = Z_BASE * 2.0;

   const setZoomClamped = useCallback((val) => {
      const z = Math.max(Z_MIN, Math.min(Z_MAX, val));
      setZoom(z);
      return z;
   }, []);

   // pe mobil, pornim direct de la baza 0.6
   useEffect(() => {
      if (isMobile) setZoomClamped(Z_BASE);
   }, [isMobile, setZoomClamped]);

   // Dropdown zoom: 50–200% bazat pe Z_BASE
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

   /* ===== Flag-uri interacțiuni ===== */
   const suspendFlagsRef = useRef({ isInteracting: false });

   // Pan cu inerție pe X și Y
   useInertialPan(scrollRef, {
      suspendFlagsRef,
      shouldIgnore: isInteractiveTarget,
      inertiaX: true,
      inertiaY: true,
      slopPx: 6,
   });

   // Smart polling (backoff) + sync între tab-uri
   const refreshCtlRef = useRef({ t: null, delay: 3000, noChange: 0 });
   const bcRef = useRef(null);

   const scheduleSmartTick = useCallback(() => {
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
         } catch {}

         if (res?.refreshed) {
            ctl.noChange = 0;
            ctl.delay = 3000;
            bcRef.current?.postMessage({
               type: "reservations-changed",
               etag: res?.etag || null,
            });
         } else {
            const steps = [3000, 5000, 8000, 13000, 21000, 34000, 55000, 60000];
            ctl.noChange = Math.min(steps.length - 1, ctl.noChange + 1);
            ctl.delay = steps[ctl.noChange];
         }
         scheduleSmartTick();
      }, ctl.delay);
   }, [dispatch]);

   // === TOKEN din cookie pentru websocket ===
   const token = getCookie("access_token");

   // Websocket + fallback polling
   useReservationSocket(token, {
      onConnect: () => {
         console.log("[WS] connected");

         refreshCtlRef.current.noChange = 0;
         refreshCtlRef.current.delay = 3000;
         dispatch(fetchReservationsDelta());
         scheduleSmartTick();
      },
      onDisconnect: () => {
         console.log("[WS] disconnected");

         refreshCtlRef.current.noChange = 0;
         refreshCtlRef.current.delay = 3000;
         scheduleSmartTick();
      },
      onReservationJoined: (data) => {
         console.log("[WS] reservation joined", data);
         if (!suspendFlagsRef.current?.isInteracting) {
            dispatch(fetchReservationsDelta());
         } else {
            dispatch(maybeRefreshReservations());
         }
      },
      onReservationLeft: (data) => {
         console.log("[WS] reservation left", data);
         if (!suspendFlagsRef.current?.isInteracting) {
            dispatch(fetchReservationsDelta());
         } else {
            dispatch(maybeRefreshReservations());
         }
      },
      onReservationJoinDenied: (data) => {
         console.warn("[WS] join denied", data);
      },
      onReservationsChanged: (data) => {
         console.log("[WS] reservations changed", data);
         if (!suspendFlagsRef.current?.isInteracting) {
            dispatch(fetchReservationsDelta());
         } else {
            dispatch(maybeRefreshReservations());
         }
      },
   });

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
               dispatch(
                  fetchReservationsForMonth({
                     date: currentDate,
                     extraFilters: props.extraFilters || {},
                  })
               ),
               dispatch(fetchCars()),
               dispatch(fetchUsers()),
            ]);
         } finally {
         }
      })();
   }, [dispatch, currentDate, props.extraFilters]);

   const reservationsLive = useSelector(
      (s) => s.reservations?.list ?? [],
      shallowEqual
   );

   const [reservationsUI, setReservationsUI] = useState(reservationsLive);
   const reservationsUIDedup = reservationsUI;
   const pendingReservationsRef = useRef(null);

   useEffect(() => {
      const interacting = !!suspendFlagsRef.current?.isInteracting;
      if (interacting) pendingReservationsRef.current = reservationsLive;
      else {
         setReservationsUI(reservationsLive);
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
      if ("BroadcastChannel" in window) {
         bcRef.current = new BroadcastChannel("reservations-meta");
         bcRef.current.onmessage = (e) => {
            if (
               e?.data?.type === "reservations-changed" &&
               !suspendFlagsRef.current?.isInteracting
            ) {
               dispatch(fetchReservationsDelta());
               refreshCtlRef.current.noChange = 0;
               refreshCtlRef.current.delay = 3000;
               scheduleSmartTick();
            }
         };
      }
      scheduleSmartTick();
      return () => {
         if (refreshCtlRef.current.t) clearTimeout(refreshCtlRef.current.t);
         bcRef.current?.close?.();
      };
   }, [dispatch, scheduleSmartTick]);

   useEffect(() => {
      const onFocusVisible = () => {
         if (!document.hidden && !suspendFlagsRef.current?.isInteracting) {
            refreshCtlRef.current.noChange = 0;
            refreshCtlRef.current.delay = 3000;
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

   const dataReady = useMemo(
      () =>
         (reservationsLive?.length ?? 0) > 0 ||
         (students?.length ?? 0) > 0 ||
         (instructorsGroups?.length ?? 0) > 0,
      [reservationsLive?.length, students?.length, instructorsGroups?.length]
   );

   const isDummyMode = !dataReady;

   // ziua tipică / ore
   const dayStart = useMemo(() => {
      const s = new Date(currentDate);
      s.setHours(7, 0, 0, 0);
      return s;
   }, [currentDate]);
   const dayEnd = useMemo(() => {
      const e = new Date(currentDate);
      e.setHours(21, 0, 0, 0);
      return e;
   }, [currentDate]);

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

   /* ===== Căutare (deocamdată doar vizual) ===== */
   const [query, setQuery] = useState("");

   /* ===== Mapare rezervări -> evenimente ===== */
   const mapReservationToEvent = useCallback(
      (r) => {
         const start = toFloatingDate(r.startTime);
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
            const g = (instructorsGroups || []).find(
               (g) => String(g.id) === String(groupIdRaw)
            );
            return g?.name || (g ? `Grupa ${g.id}` : "");
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
            raw: r,
         };
      },
      [LESSON_MINUTES, instructorsGroups, instructorMeta]
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
   }, [reservationsUIDedup, mapReservationToEvent, isDummyMode]);

   /* ===========================================================
      INTERVAL: doar luna curentă
      ============================================================ */

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

   /* ===== UI metrics ===== */
   const px = (v) => parseFloat(String(v || 0));

   const baseMetrics = useMemo(() => {
      const baseColw = px(COL_W) * zoom;
      const baseDayWidth = maxColsPerGroup * baseColw;
      return { colw: baseColw, dayWidth: baseDayWidth };
   }, [COL_W, maxColsPerGroup, zoom]);

   const DAY_W_BASE = baseMetrics.dayWidth + 12 + DAY_GAP;

   const contentW = useMemo(
      () => loadedDays.length * DAY_W_BASE,
      [loadedDays.length, DAY_W_BASE]
   );

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

   /* ===== Virtualizare pe zile (doar zile vizibile în viewport) ===== */
   const [visibleDayRange, setVisibleDayRange] = useState({
      start: 0,
      end: 0,
   });

   const updateVisibleDays = useCallback(() => {
      const scroller = scrollRef.current;
      if (!scroller || loadedDays.length === 0 || !DAY_W_BASE) return;

      const viewportW = scroller.clientWidth || 0;
      const scrollLeft = scroller.scrollLeft || 0;

      const rawStart = Math.floor(scrollLeft / DAY_W_BASE);
      const rawEnd = Math.ceil((scrollLeft + viewportW) / DAY_W_BASE);

      const buffer = 1; // 1 zi extra stânga/dreapta
      const start = Math.max(0, rawStart - buffer);
      const end = Math.min(loadedDays.length - 1, rawEnd + buffer);

      setVisibleDayRange((prev) =>
         prev.start === start && prev.end === end ? prev : { start, end }
      );
   }, [DAY_W_BASE, loadedDays.length]);

   // inițializare range după ce avem zile / layout
   useLayoutEffect(() => {
      updateVisibleDays();
   }, [updateVisibleDays]);

   // marchează coloanele vizibile ca "hydrated"
   const markVisibleColumns = useCallback(() => {
      const scroller = scrollRef.current;
      if (!scroller) return;

      const hostRect = scroller.getBoundingClientRect();
      const left = hostRect.left - 100;
      const right = hostRect.right + 100;
      const top = hostRect.top - 100;
      const bottom = hostRect.bottom + 100;

      const cols = scroller.querySelectorAll(".dayview__col");
      let changed = false;

      cols.forEach((node) => {
         const r = node.getBoundingClientRect();
         if (
            r.right >= left &&
            r.left <= right &&
            r.bottom >= top &&
            r.top <= bottom
         ) {
            const id = node.getAttribute("data-colid");
            if (id && !hydratedColsRef.current.has(id)) {
               hydratedColsRef.current.add(id);
               changed = true;
            }
         }
      });

      if (changed) {
         colsDirtyRef.current = true;
      }
   }, []);

   const commitHydratedColumns = useCallback(() => {
      if (!colsDirtyRef.current) return;
      colsDirtyRef.current = false;
      setHydratedColsVer((v) => v + 1);
   }, []);

   // la scroll idle: DOAR hydration, fără auto-scroll/center-day
   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      let t = null;
      const onScrollIdle = () => {
         if (t) clearTimeout(t);
         t = setTimeout(() => {
            if (suspendFlagsRef.current?.isInteracting) return;
            markVisibleColumns();
            commitHydratedColumns();
         }, 350);
      };
      el.addEventListener("scroll", onScrollIdle, { passive: true });
      return () => {
         if (t) clearTimeout(t);
         el.removeEventListener("scroll", onScrollIdle);
      };
   }, [markVisibleColumns, commitHydratedColumns]);

   // în timpul scroll-ului / animației: marcăm coloanele vizibile + actualizăm range-ul de zile
   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;

      let last = 0;
      const onScrollActive = () => {
         const now =
            typeof performance !== "undefined" && performance.now
               ? performance.now()
               : Date.now();

         if (now - last < 120) return;
         last = now;

         markVisibleColumns();
         updateVisibleDays();
      };

      el.addEventListener("scroll", onScrollActive, { passive: true });
      return () => {
         el.removeEventListener("scroll", onScrollActive);
      };
   }, [markVisibleColumns, updateVisibleDays]);

   // hydration inițial: imediat după ce avem zile & layout
   useEffect(() => {
      if (!loadedDays.length) return;
      const id = requestAnimationFrame(() => {
         markVisibleColumns();
         commitHydratedColumns();
      });
      return () => cancelAnimationFrame(id);
   }, [loadedDays.length, markVisibleColumns, commitHydratedColumns]);

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

   /* ===== Cache pentru buildUiDay ===== */
   const dayCacheRef = useRef(new Map());
   useEffect(() => {
      // când se schimbă datele de bază, golim cache-ul
      dayCacheRef.current.clear();
   }, [
      eventsByDay,
      allowedInstBySector,
      instructors,
      instructorMeta,
      isDummyMode,
   ]);

   const buildUiDay = useCallback(
      (day) => {
         const ts = startOfDayTs(day);
         const dayId = `day_${ts}`;

         const cacheKey = `${ts}|${hydratedColsVer}`;
         const cached = dayCacheRef.current.get(cacheKey);
         if (cached) return cached;

         // DUMMY MODE: date nereale, 10 instructori fake pentru layout instant
         if (isDummyMode) {
            const dummyInstructors = DUMMY_INSTRUCTORS.map((item) => ({
               inst: { ...item.inst },
               events: item.events,
            }));
            const result = {
               id: dayId,
               date: day,
               name: new Intl.DateTimeFormat("ro-RO", {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
               })
                  .format(new Date(day))
                  .replace(",", ""),
               instructors: dummyInstructors,
               rowsCount: Math.max(
                  1,
                  Math.ceil(dummyInstructors.length / maxColsPerGroup)
               ),
               hydrated: true,
            };
            dayCacheRef.current.set(cacheKey, result);
            return result;
         }

         // instructorii de bază (fără rezervări încă)
         const baseInstructors = instructors?.length ? instructors : [];

         const instIds = (baseInstructors || [])
            .map((i) => String(i.id))
            .filter(
               (iid) => !allowedInstBySector || allowedInstBySector.has(iid)
            );

         let idsForRender = instIds;

         // dacă nu sunt instructori, dar există rezervări, folosim instructorii din ele
         if ((!idsForRender || !idsForRender.length) && eventsByDay.has(ts)) {
            const dayEventsRaw = eventsByDay.get(ts) || [];
            idsForRender = Array.from(
               new Set(
                  dayEventsRaw.map((e) => String(e.instructorId ?? "__unknown"))
               )
            );
         }

         const rows =
            idsForRender.length > 0
               ? Math.ceil(idsForRender.length / maxColsPerGroup)
               : 1;

         // vedem dacă există vreo coloană hidratată pentru ziua asta
         let hasHydratedColsForDay = false;
         for (const key of hydratedColsRef.current) {
            if (key.startsWith(dayId + "::")) {
               hasHydratedColsForDay = true;
               break;
            }
         }

         let filteredDayEvents = [];
         if (hasHydratedColsForDay) {
            const dayEventsRaw = eventsByDay.get(ts) || [];
            filteredDayEvents = dayEventsRaw.filter((ev) => {
               const iid = String(ev.instructorId ?? "__unknown");
               const sectorOk =
                  !allowedInstBySector || allowedInstBySector.has(iid);
               return sectorOk;
            });
         }

         const instructorsForDay = (
            idsForRender && idsForRender.length ? idsForRender : ["__pad_0_0"]
         ).map((iid) => {
            const name =
               instructorMeta.get(iid)?.name ||
               (iid === "__pad_0_0" ? "" : "Necunoscut");

            let eventsForInst = [];
            if (iid !== "__pad_0_0" && hasHydratedColsForDay) {
               const colKey = `${dayId}::${iid}`;
               if (hydratedColsRef.current.has(colKey)) {
                  eventsForInst = filteredDayEvents
                     .filter(
                        (e) => String(e.instructorId ?? "__unknown") === iid
                     )
                     .sort((a, b) => a.start - b.start);
               }
            }

            return { inst: { id: iid, name }, events: eventsForInst };
         });

         const result = {
            id: dayId,
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
            hydrated: hasHydratedColsForDay,
         };

         dayCacheRef.current.set(cacheKey, result);
         return result;
      },
      [
         isDummyMode,
         eventsByDay,
         allowedInstBySector,
         maxColsPerGroup,
         instructorMeta,
         instructors,
         hydratedColsVer,
      ]
   );

   /* ======== BLACKOUTS ======== */
   function partsInTZ(dateLike, timeZone = MOLDOVA_TZ_ID) {
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

   function localKeyFromTs(tsMs, timeZone = MOLDOVA_TZ_ID) {
      return `${ymdStrInTZ(tsMs, timeZone)}|${hhmmInTZ(tsMs, timeZone)}`;
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

   // toate sloturile pentru întreaga lună
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

   // instIdsAll: luăm direct din instructors
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
         } catch {}
      },
      [allowedKeysSet]
   );

   useEffect(() => {
      instIdsAll.forEach((iid) => {
         ensureBlackoutsFor(iid);
      });
   }, [instIdsAll, ensureBlackoutsFor]);

   /* ===== Toolbar / handlers ===== */
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

   // după pan: doar aplicăm pending reservations + hydration; nu centram ziua
   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      const onPanEnd = () => {
         if (pendingReservationsRef.current) {
            setReservationsUI(pendingReservationsRef.current);
            pendingReservationsRef.current = null;
         }
         markVisibleColumns();
         commitHydratedColumns();
         updateVisibleDays();
      };
      el.addEventListener("dvpanend", onPanEnd);
      return () => el.removeEventListener("dvpanend", onPanEnd);
   }, [markVisibleColumns, commitHydratedColumns, updateVisibleDays]);

   const count = loadedDays.length;

   // ====== MONTH DROPDOWN (3 în urmă, luna fizică, 3 înainte) ======
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

         // actualizăm luna internă a calendarului
         setCurrentDate(newDate);

         // notificăm părintele (dacă vrea să sincronizeze alte componente)
         if (typeof props.onMonthChange === "function") {
            props.onMonthChange(newDate);
         }

         // încărcăm rezervările pentru luna selectată
         try {
            dispatch(
               fetchReservationsForMonth({
                  date: newDate,
                  extraFilters: props.extraFilters || {},
               })
            );
         } catch (e) {
            console.error("[DayView] fetchReservationsForMonth error", e);
         }

         // resetăm scroll-ul la începutul lunii (fără auto-centrare pe zi)
         if (scrollRef.current) {
            scrollRef.current.scrollLeft = 0;
         }

         // și recalculăm range-ul de zile vizibile
         requestAnimationFrame(() => {
            updateVisibleDays();
         });
      },
      [monthOptions, props, dispatch, updateVisibleDays]
   );

   // ====== SECTOR DROPDOWN ======
   const sectorOptions = useMemo(
      () => [
         { value: "Toate", label: "Toate sectoarele" },
         { value: "Botanica", label: "Botanica" },
         { value: "Ciocana", label: "Ciocana" },
      ],
      []
   );

   const toolbarClassName =
      !isMobile && !compact ? "dayview__toolbar" : "dayview__toolbar-compact";

   const searchInputClassName =
      isMobile || compact
         ? "dv-search__input dv-search__input--mobile"
         : "dv-search__input";

   return (
      <div className="dayview__wrapper">
         <div
            className="dayview"
            style={{ ...layoutVars, height: CONTAINER_H }}
         >
            {/* Header */}
            <div className="dayview__header">
               <div className="dayview__header-left">
                  {props.onBackToMonth && (
                     <button
                        className="dv-btn dv-back"
                        onClick={props.onBackToMonth}
                        title="Înapoi la Lună"
                        aria-label="Înapoi la Lună"
                     >
                        <ReactSVG src={arrow} />
                     </button>
                  )}

                  {/* Dropdown lună */}
                  <SimpleDropdown
                     value={currentMonthValue}
                     onChange={handleMonthChange}
                     options={monthOptions}
                     placeholder="Alege luna"
                     className="dv-dd--month"
                     aria-label="Alege luna"
                  />

                  {/* Dropdown sector */}
                  <SimpleDropdown
                     value={sectorFilter}
                     onChange={(v) => setSectorFilter(v)}
                     options={sectorOptions}
                     placeholder="Sector"
                     className="dv-dd--sector"
                     aria-label="Filtrează după sector"
                  />
               </div>

               {/* Toolbar comun (desktop + mobil) */}
               <div className={toolbarClassName}>
                  <input
                     className={searchInputClassName}
                     placeholder={
                        dataReady ? "Caută…" : "Se încarcă programările…"
                     }
                     disabled={!dataReady}
                     value={query}
                     onChange={(e) => setQuery(e.target.value)}
                  />

                  {/* Dropdown Zoom */}
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

            {/* Track */}
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
                     position: "relative",
                     width: contentW,
                     height: "100%",
                  }}
               >
                  <div
                     className="dv-scale"
                     style={{
                        position: "relative",
                        width: contentW,
                        height: "100%",
                     }}
                  >
                     {count > 0 &&
                        loadedDays.map((d, idx) => {
                           // virtualizare: randăm doar zilele în range
                           if (
                              idx < visibleDayRange.start ||
                              idx > visibleDayRange.end
                           ) {
                              return null;
                           }

                           const ts = startOfDayTs(d);
                           const day = buildUiDay(d);
                           const slots = getSlotsForTs(ts);
                           const rows = toRowsOfN(
                              day.instructors || [],
                              maxColsPerGroup,
                              true
                           );

                           const isHydrating =
                              !isDummyMode && day && day.hydrated === false;

                           return (
                              <section
                                 key={day.id}
                                 className="dayview__group-wrap cv-auto"
                                 style={{
                                    position: "absolute",
                                    left: idx * DAY_W_BASE,
                                    top: 0,
                                    width: `${baseMetrics.dayWidth + 12}px`,
                                    "--cols": maxColsPerGroup,
                                    "--colw": `${baseMetrics.colw}px`,
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
                                                   const filteredEvents =
                                                      Array.isArray(events)
                                                         ? events
                                                         : [];
                                                   const visualKey =
                                                      filteredEvents
                                                         .map((e) =>
                                                            [
                                                               e.id,
                                                               e.start?.getTime?.() ??
                                                                  0,
                                                               e.end?.getTime?.() ??
                                                                  0,
                                                               e.color || "",
                                                               e.privateMessage ||
                                                                  "",
                                                               e.isConfirmed
                                                                  ? 1
                                                                  : 0,
                                                               e.gearboxLabel ||
                                                                  "",
                                                               e.sector || "",
                                                               e.studentFirst ||
                                                                  "",
                                                               e.studentLast ||
                                                                  "",
                                                            ].join(":")
                                                         )
                                                         .join("|");
                                                   const eventsKey = `${filteredEvents.length}:${visualKey}`;

                                                   return (
                                                      <div
                                                         key={`${day.id}-${inst.id}-${colIdx}`}
                                                         className="dayview__col"
                                                         data-colid={`${day.id}::${inst.id}`}
                                                      >
                                                         <MemoInstructorColumn
                                                            day={day}
                                                            inst={inst}
                                                            events={
                                                               filteredEvents
                                                            }
                                                            eventsKey={
                                                               eventsKey
                                                            }
                                                            slots={slots}
                                                            instructorMeta={
                                                               instructorMeta
                                                            }
                                                            instructorsGroups={
                                                               instructorsGroups
                                                            }
                                                            isHydrating={
                                                               isHydrating
                                                            }
                                                            onOpenReservation={
                                                               isDummyMode
                                                                  ? noop
                                                                  : (
                                                                       reservationId
                                                                    ) => {
                                                                       openPopup(
                                                                          "reservationEdit",
                                                                          {
                                                                             reservationId,
                                                                          }
                                                                       );
                                                                    }
                                                            }
                                                            onCreateFromEmpty={
                                                               isDummyMode
                                                                  ? noop
                                                                  : handleCreateFromEmpty
                                                            }
                                                            blockedKeySet={
                                                               isDummyMode
                                                                  ? null
                                                                  : blackoutKeyMapRef.current.get(
                                                                       String(
                                                                          inst.id
                                                                       )
                                                                    ) || null
                                                            }
                                                            blackoutVer={
                                                               blackoutVer
                                                            }
                                                            onEdit={
                                                               isDummyMode
                                                                  ? noop
                                                                  : handleEdit
                                                            }
                                                            onChangeColor={
                                                               isDummyMode
                                                                  ? noop
                                                                  : handleChangeColor
                                                            }
                                                            onDelete={
                                                               isDummyMode
                                                                  ? noop
                                                                  : handleDelete
                                                            }
                                                            onChangeInstructorOrder={
                                                               isDummyMode
                                                                  ? noop
                                                                  : handleChangeInstructorOrder
                                                            }
                                                            onSwapGroupOrder={
                                                               isDummyMode
                                                                  ? noop
                                                                  : handleSwapGroupOrder
                                                            }
                                                         />
                                                      </div>
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
      </div>
   );
}
