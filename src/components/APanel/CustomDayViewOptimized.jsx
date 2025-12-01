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
import { listenCalendarRefresh } from "../Utils/calendarBus";
import { fetchInstructorsGroups } from "../../store/instructorsGroupSlice";
import { fetchCars } from "../../store/carsSlice";
import {
   fetchReservationsDelta,
   maybeRefreshReservations,
} from "../../store/reservationsSlice";
import { fetchStudents } from "../../store/studentsSlice";
import { fetchUsers } from "../../store/usersSlice";
import { fetchInstructors } from "../../store/instructorsSlice";

import { openPopup } from "../Utils/popupStore";
import { ReactSVG } from "react-svg";
import refreshIcon from "../../assets/svg/grommet-icons--power-reset.svg";
import arrow from "../../assets/svg/arrow-s.svg";

import useInertialPan from "./Calendar/useInertialPan";
import InstructorColumnConnected from "./Calendar/InstructorColumnConnected";
import { getInstructorBlackouts } from "../../api/instructorsService";

/* ====== NAV STATE GLOBAL (pentru navigate/title react-big-calendar) ====== */
let __DV_NAV_STATE__ = {
   matchDays: [],
   queryKey: "",
   suspendAutoJump: false,
   suspendScrollSnap: false,
   snappedForKey: "",
   centerOnDateNextTick: false,
   allDaysSorted: [],
   isInteracting: false,
   pendingCenterDate: null,
   navActive: false,
   navTargetTs: null,
   navUnlockTimer: null,
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

const dateKey = (d) => {
   const x = new Date(d);
   return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(
      2,
      "0"
   )}${String(x.getDate()).padStart(2, "0")}`;
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

/* ===== MEMO pentru coloană ===== */
const MemoInstructorColumn = memo(
   InstructorColumnConnected,
   (prev, next) =>
      prev.inst?.id === next.inst?.id &&
      prev.day?.id === next.day?.id &&
      prev.tokensKey === next.tokensKey &&
      prev.eventsKey === next.eventsKey &&
      prev.blackoutVer === next.blackoutVer
);

/* ===== Center-day persistence (LS) ===== */
const CENTER_DAY_LS_KEY = "dv_center_day";
const saveCenterDay = (d) => {
   try {
      if (!d) return;
      localStorage.setItem(CENTER_DAY_LS_KEY, dateKey(d));
   } catch {}
};
const loadCenterDay = () => {
   try {
      const k = localStorage.getItem(CENTER_DAY_LS_KEY);
      if (!k || k.length !== 8) return null;
      const y = +k.slice(0, 4),
         m = +k.slice(4, 6) - 1,
         d = +k.slice(6, 8);
      const out = new Date(y, m, d);
      return isNaN(+out) ? null : out;
   } catch {
      return null;
   }
};

/* ====== Cheie stabilă pt. de-dup rezervări ====== */
const reservationStableKey = (r) => {
   try {
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
      const start = startRaw ? toFloatingDate(startRaw) : null;
      const dur =
         r.durationMinutes ??
         r.slotMinutes ??
         r.lengthMinutes ??
         r.duration ??
         90;
      const end = endRaw
         ? toFloatingDate(endRaw)
         : start
         ? new Date(start.getTime() + dur * 60000)
         : null;
      const inst =
         r.instructorId ??
         r.instructor_id ??
         r.instructor ??
         r.instructorIdFk ??
         "";
      const stud =
         r.studentId ??
         r.userId ??
         r.user?.id ??
         r.clientId ??
         r.customerId ??
         r.user_id ??
         "";
      const baseId = r.id ?? r.uuid ?? r._id;
      if (baseId != null) return `id_${String(baseId)}`;
      const s = start ? start.getTime() : 0;
      const e = end ? end.getTime() : 0;
      return `k_s${s}_e${e}_i${String(inst)}_u${String(stud)}_d${dur}`;
   } catch {
      return `k_fallback_${genId()}`;
   }
};

/* ================= Component ================= */
export default function CustomDayViewOptimized(props = {}) {
   const { onViewStudent } = props;
   const compact = !!props.compact;
   const date = props.date ? new Date(props.date) : new Date();

   // când montăm: dacă există în LS o zi salvată, nu forțăm centrul pe `date`
   useEffect(() => {
      const saved = loadCenterDay();
      if (saved) {
         __DV_NAV_STATE__.centerOnDateNextTick = false;
         __DV_NAV_STATE__.pendingCenterDate = null;
      } else {
         __DV_NAV_STATE__.centerOnDateNextTick = true;
         __DV_NAV_STATE__.pendingCenterDate = date;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

   const scrollRef = useRef(null);
   const wheelStateRef = useRef({ active: false, timer: null });

   // înălțime viewport-based
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
   const cancelPanInertia = useCallback(() => {
      const el = scrollRef.current;
      if (el) {
         el.dispatchEvent(new CustomEvent("dvcancelinertia"));
      }
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
   const GROUP_GAP = layout.groupGap ?? "32px";
   const CONTAINER_H = layout.containerHeight;
   const DAY_GAP = 32;

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

   /* ===== Flag-uri interacțiuni ===== */
   const suspendFlagsRef = useRef(__DV_NAV_STATE__);

   const startNavLock = useCallback((targetDate, ms = 1200) => {
      const s = suspendFlagsRef.current;
      if (!s) return;
      const ts = startOfDayTs(targetDate);
      s.navActive = true;
      s.navTargetTs = ts;
      if (s.navUnlockTimer) clearTimeout(s.navUnlockTimer);
      s.navUnlockTimer = setTimeout(() => {
         s.navActive = false;
         s.navTargetTs = null;
         s.navUnlockTimer = null;
      }, ms);
   }, []);

   const endNavLockSoon = useCallback((delay = 200) => {
      const s = suspendFlagsRef.current;
      if (!s) return;
      if (s.navUnlockTimer) clearTimeout(s.navUnlockTimer);
      s.navUnlockTimer = setTimeout(() => {
         s.navActive = false;
         s.navTargetTs = null;
         s.navUnlockTimer = null;
      }, delay);
   }, []);

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
      }, refreshCtlRef.current.delay);
   }, [dispatch]);

   const isInteractiveTarget = (el) =>
      !!el.closest?.(
         `.dv-move-pad, .dv-move-pad button, .dv-slot button, input, textarea, select, button, a`
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

   const reservationsLive = useSelector(
      (s) => s.reservations?.list ?? [],
      shallowEqual
   );

   const [reservationsUI, setReservationsUI] = useState(reservationsLive);
   const reservationsUIDedup = useMemo(() => {
      const seen = new Set();
      const out = [];
      for (const r of reservationsUI || []) {
         const k = reservationStableKey(r);
         if (seen.has(k)) continue;
         seen.add(k);
         out.push(r);
      }
      return out;
   }, [reservationsUI]);

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
   const deferredQuery = useDeferredValue(query);

   const parseToken = (raw) => {
      const t = String(raw || "").trim();
      if (!t) return null;

      // #12 sau i:12
      const mIdHash = /^(#)(\d+)$/.exec(t);
      const mIdWord = /^(?:i|inst|instructor)\s*[:\-]?\s*(\d+)$/.exec(t);
      if (mIdHash || mIdWord) {
         const idDigits = (mIdHash ? mIdHash[2] : mIdWord[1]) || "";
         return {
            raw,
            kind: "instId",
            norm: "",
            digits: idDigits,
            plate: "",
            hhmmPrefix: null,
         };
      }

      // tel, phone
      const mTelBoth = /^(?:tel|phone|p)\s*[:\-]?\s*(\+?\d[\d\s]*)$/i.exec(t);
      if (mTelBoth)
         return {
            raw,
            kind: "phone",
            phoneScope: "both",
            digits: mTelBoth[1].replace(/\D+/g, ""),
         };
      const mTelInst = /^(?:tel\-?i)\s*[:\-]?\s*(\+?\d[\d\s]*)$/i.exec(t);
      if (mTelInst)
         return {
            raw,
            kind: "phone",
            phoneScope: "inst",
            digits: mTelInst[1].replace(/\D+/g, ""),
         };
      const mTelStud = /^(?:tel\-?s)\s*[:\-]?\s*(\+?\d[\d\s]*)$/i.exec(t);
      if (mTelStud)
         return {
            raw,
            kind: "phone",
            phoneScope: "stud",
            digits: mTelStud[1].replace(/\D+/g, ""),
         };

      const onlyDigits = t.replace(/\D+/g, "");
      const looksLikePhone =
         /^\+?\d[\d\s\-()]{4,}$/.test(t) || onlyDigits.length >= 6;
      if (looksLikePhone)
         return { raw, kind: "phone", phoneScope: "both", digits: onlyDigits };

      // text:...
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
   const tokens = useMemo(
      () =>
         rawTokens
            .map(parseToken)
            .filter(Boolean)
            .filter((t) => {
               if (!hasAlphaNum(t.raw || "")) return false;
               if (t.kind === "text" && (t.norm || "").length < 2) return false;
               return true;
            }),
      [rawTokens]
   );
   const anyTokens = tokens.length > 0;

   const textMatchesAllTokens = useCallback(
      (rawText) => {
         if (!anyTokens) return true;
         const s = norm(rawText || "");
         const sDigits = s.replace(/\D+/g, "");
         const sPlate = normPlate(rawText || "");

         for (const t of tokens) {
            switch (t.kind) {
               case "time": {
                  if (t.hhmmPrefix && !s.includes(t.hhmmPrefix)) return false;
                  break;
               }
               case "digits": {
                  if (t.digits && !sDigits.includes(t.digits)) return false;
                  break;
               }
               case "plate": {
                  if (t.plate && !sPlate.includes(t.plate)) return false;
                  break;
               }
               default: {
                  if (t.norm && !s.includes(t.norm)) return false;
               }
            }
         }
         return true;
      },
      [anyTokens, tokens]
   );

   const scrollYToFirstMatchInDay = useCallback(
      (targetDate) => {
         const el = scrollRef.current;
         if (!el) return false;

         const ts = startOfDayTs(targetDate);
         const dayId = `day_${ts}`;
         const daySection = el.querySelector(`[data-dayid="${dayId}"]`);
         if (!daySection) return false;

         let nodes = Array.from(daySection.querySelectorAll(".dayview__event"));
         if (!nodes.length) return false;

         const likelyCards = nodes.filter(
            (n) =>
               n.hasAttribute("data-reservation-id") ||
               n.getAttribute("role") === "button" ||
               /card/i.test(n.className)
         );
         if (likelyCards.length) nodes = likelyCards;

         if (anyTokens) {
            const filtered = nodes.filter((n) =>
               textMatchesAllTokens(n.textContent || "")
            );
            if (filtered.length) nodes = filtered;
         }

         nodes.sort(
            (a, b) =>
               a.getBoundingClientRect().top - b.getBoundingClientRect().top
         );

         const targetEl = nodes[0];
         if (!targetEl) return false;

         const crect = el.getBoundingClientRect();
         const r = targetEl.getBoundingClientRect();
         const M_TOP = 16,
            M_BOTTOM = 16;

         let dy = 0;
         if (r.top < crect.top + M_TOP) {
            dy = r.top - (crect.top + M_TOP);
         } else if (r.bottom > crect.bottom - M_BOTTOM) {
            dy = r.bottom - (crect.bottom - M_BOTTOM);
         }

         if (Math.abs(dy) > 1) {
            requestAnimationFrame(() => {
               requestAnimationFrame(() => {
                  el.scrollTop += dy;
               });
            });
         }
         return true;
      },
      [anyTokens, textMatchesAllTokens]
   );

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
            r.user?.id ??
            r.clientId ??
            r.customerId ??
            r.user_id ??
            null;
         const studentId = studentIdRaw != null ? String(studentIdRaw) : null;
         const fromStore = studentDictRef.current?.get(studentId);
         const studentPrivateMsg = fromStore?.privateMessage ?? "";
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
            id: String(r.id ?? reservationStableKey(r)),
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
            eventPrivateMessage: r.privateMessage ?? "",
            privateMessage: studentPrivateMsg,
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

   const eventsByDay = useMemo(() => {
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
   }, [reservationsUIDedup, mapReservationToEvent]);

   /* ====== Search facts / matchers ====== */
   const [matchCursor, setMatchCursor] = useState(-1);
   const factsCacheRef = useRef(new WeakMap());
   const matchCacheRef = useRef(new Map());
   useEffect(() => {
      matchCacheRef.current = new Map();
   }, [tokensKey]);

   const getFacts = useCallback(
      (ev) => {
         let f = factsCacheRef.current.get(ev);
         if (f) return f;
         const inst = instructorMeta.get(String(ev.instructorId)) || {};
         const studentFull = `${ev.studentFirst || ""} ${
            ev.studentLast || ""
         }`.trim();
         const timeStr = hhmm(ev.start);
         const studentPhoneDigits = digitsOnly(ev.studentPhone || "");
         const instPhoneDigits = inst.phoneDigits || "";
         f = {
            studentName: norm(studentFull),
            instName: inst.nameNorm || "",
            phones: [studentPhoneDigits, instPhoneDigits].filter(Boolean),
            time: timeStr,
            timeDigits: timeStr.replace(":", ""),
            hourOnly: timeStr.slice(0, 2),
            plateNorm: inst.plateNorm || "",
            plateDigits: inst.plateDigits || "",
            groupName: norm(ev.groupName || ""),
            note: norm(ev.privateMessage || ""),
            instIdDigits: inst.idDigits || "",
            instPhoneDigits,
            studentPhoneDigits,
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
         const key = `${ev.id}|${tokensKey}`;
         if (matchCacheRef.current.has(key))
            return matchCacheRef.current.get(key);
         const facts = getFacts(ev);
         const ok = tokens.every((t) => tokenHitsFacts(facts, t));
         matchCacheRef.current.set(key, ok);
         return ok;
      },
      [anyTokens, tokens, tokensKey, getFacts]
   );

   const headerMatchesAllTokens = useCallback(
      (iid) => {
         const m = instructorMeta.get(String(iid));
         if (!m || !tokens?.length) return false;
         return tokens.every((t) => {
            switch (t.kind) {
               case "digits":
                  return (
                     (m.phoneDigits || "").includes(t.digits) ||
                     (m.plateDigits || "").includes(t.digits)
                  );
               case "plate":
                  return (m.plateNorm || "").includes(t.plate);
               default:
                  return (
                     (m.nameNorm || "").includes(t.norm) ||
                     (m.plateNorm || "").includes(t.norm)
                  );
            }
         });
      },
      [tokens, instructorMeta]
   );

   /* ===========================================================
      INTERVAL: doar luna curentă (1 → ultima zi a lunii lui `date`)
      ============================================================ */

   const allAllowedDays = useMemo(() => {
      const base = new Date(date);
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
   }, [date]);

   const findIndexForDate = useCallback(
      (targetDate) => {
         if (!allAllowedDays.length) return 0;
         const tsTarget = startOfDayTs(targetDate);
         let bestIdx = 0;
         let bestDiff = Infinity;
         allAllowedDays.forEach((d, idx) => {
            const diff = Math.abs(startOfDayTs(d) - tsTarget);
            if (diff < bestDiff) {
               bestDiff = diff;
               bestIdx = idx;
            }
         });
         return bestIdx;
      },
      [allAllowedDays]
   );

   // Încărcăm toate zilele din luna curentă
   const loadedDays = allAllowedDays;

   useEffect(() => {
      __DV_NAV_STATE__.allDaysSorted = allAllowedDays
         .map(startOfDayTs)
         .sort((a, b) => a - b);
   }, [allAllowedDays]);

   const matchDaysAll = useMemo(() => {
      if (!anyTokens) return [];
      const out = [];
      for (const d of allAllowedDays) {
         const ts = startOfDayTs(d);
         const evs = eventsByDay.get(ts) || [];
         if (evs.some(eventMatchesAllTokens)) out.push(new Date(ts));
      }
      return out;
   }, [
      anyTokens,
      allAllowedDays,
      eventsByDay,
      eventMatchesAllTokens,
      tokensKey,
   ]);

   /* ===== UI metrics ===== */
   const layoutVars = {
      "--event-h": EVENT_H,
      "--hours-col-w": HOURS_COL_W,
      "--group-gap": GROUP_GAP,
      "--day-header-h": `44px`,
      "--row-header-h": `auto`,
      "--font-scale": zoom,
      "--zoom": zoom,
   };

   const px = (v) => parseFloat(String(v || 0));
   const visibleSlotCount = useMemo(
      () => mkStandardSlots().length,
      [mkStandardSlots]
   );
   const baseMetrics = useMemo(() => {
      const baseColw = px(COL_W);
      const baseDayWidth = maxColsPerGroup * baseColw;
      return { colw: baseColw, dayWidth: baseDayWidth };
   }, [COL_W, maxColsPerGroup]);

   const DAY_W_BASE = baseMetrics.dayWidth + 12 + DAY_GAP;
   const contentW = useMemo(
      () => loadedDays.length * DAY_W_BASE,
      [loadedDays.length, DAY_W_BASE]
   );

   const zoomRef = useRef(zoom);
   useEffect(() => {
      zoomRef.current = zoom;
   }, [zoom]);

   /* ===== center-date din scroll (fără windowing) ===== */
   const getCenterDateFromScroll = useCallback(() => {
      const el = scrollRef.current;
      const ld = loadedDays;
      if (!el || !ld.length) return null;
      const W = DAY_W_BASE;
      if (W <= 0) return null;
      const mid = el.scrollLeft + el.clientWidth / 2;
      const iLocal = clamp(Math.round(mid / W - 0.5), 0, ld.length - 1);
      return ld[iLocal] || null;
   }, [loadedDays, DAY_W_BASE]);

   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      let t = null;
      const onScrollIdle = () => {
         if (t) clearTimeout(t);
         t = setTimeout(() => {
            if (suspendFlagsRef.current?.navActive) return;
            const c = getCenterDateFromScroll();
            if (c) saveCenterDay(c);
         }, 350);
      };
      el.addEventListener("scroll", onScrollIdle, { passive: true });
      return () => {
         if (t) clearTimeout(t);
         el.removeEventListener("scroll", onScrollIdle);
      };
   }, [getCenterDateFromScroll]);

   const didSeedRef = useRef(false);
   useEffect(() => {
      const el = scrollRef.current;
      const len = loadedDays.length;
      if (!len || !el || didSeedRef.current) return;

      const saved = loadCenterDay();
      didSeedRef.current = true;

      const dayWScaled = DAY_W_BASE * zoom;

      if (saved) {
         const idxSaved = findIndexForDate(saved);
         const left =
            idxSaved * dayWScaled + dayWScaled / 2 - el.clientWidth / 2;
         el.scrollLeft = clamp(left, 0, el.scrollWidth - el.clientWidth);
         const centered = loadedDays[idxSaved] || saved;
         const id = requestAnimationFrame(() => {
            el.dispatchEvent(new Event("scroll"));
            saveCenterDay(centered);
         });
         return () => cancelAnimationFrame(id);
      }

      const curIdxGlobal = findIndexForDate(date);
      const midIdx = clamp(curIdxGlobal, 0, Math.max(0, len - 1));
      const left = midIdx * dayWScaled + dayWScaled / 2 - el.clientWidth / 2;
      el.scrollLeft = clamp(left, 0, el.scrollWidth - el.clientWidth);
      const centered = loadedDays[midIdx] || date;
      saveCenterDay(centered);
   }, [
      loadedDays.length,
      DAY_W_BASE,
      zoom,
      date,
      findIndexForDate,
      loadedDays,
   ]);

   /* ===== Trackpad wheel / scroll ===== */
   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      const endWheel = () => {
         if (!wheelStateRef.current.active) return;
         wheelStateRef.current.active = false;
         el.classList?.remove?.("is-panning");
         el.style.cursor = "grab";
         if (suspendFlagsRef?.current)
            suspendFlagsRef.current.isInteracting = false;
         el.dispatchEvent(new CustomEvent("dvpanend"));
      };
      const armIdle = () => {
         if (wheelStateRef.current.timer) {
            clearTimeout(wheelStateRef.current.timer);
         }
         wheelStateRef.current.timer = setTimeout(endWheel, 140);
      };
      const beginInteractionIfNeeded = () => {
         if (wheelStateRef.current.active) return;
         wheelStateRef.current.active = true;
         el.classList?.add?.("is-panning");
         el.style.cursor = "grabbing";
         if (suspendFlagsRef?.current) {
            suspendFlagsRef.current.isInteracting = true;
            suspendFlagsRef.current.centerOnDateNextTick = false;
            suspendFlagsRef.current.suspendAutoJump = true;
            suspendFlagsRef.current.suspendScrollSnap = true;
         }
      };
      const onWheel = (e) => {
         if (e.ctrlKey || e.metaKey || e.altKey) {
            e.preventDefault();
            beginInteractionIfNeeded();
            const factor = Math.pow(1.0035, -e.deltaY);
            const clientX =
               e.clientX ??
               el.getBoundingClientRect().left + el.clientWidth / 2;
            zoomAt(factor, clientX);
            armIdle();
            return;
         }
         e.preventDefault();
         e.stopPropagation();
         beginInteractionIfNeeded();
         const z = zoomRef.current || 1;
         el.scrollLeft += e.deltaX / z;
         el.scrollTop += e.deltaY;
         if (suspendFlagsRef?.current)
            suspendFlagsRef.current.centerOnDateNextTick = false;
         armIdle();
      };
      el.addEventListener("wheel", onWheel, { passive: false, capture: true });
      return () => {
         if (wheelStateRef.current.timer) {
            clearTimeout(wheelStateRef.current.timer);
            wheelStateRef.current.timer = null;
         }
         endWheel();
         el.removeEventListener("wheel", onWheel, { capture: true });
      };
   }, [zoomAt]);

   /* ===== Pan inertial (mouse/pen/touch drag) ===== */
   useInertialPan(scrollRef, {
      suspendFlagsRef,
      shouldIgnore: isInteractiveTarget,
      pixelScaleX: zoom,
      pixelScaleY: 1,
      inertiaX: true,
      inertiaY: true,
      slopPx: 6,
   });

   /* ===== Navigație pe meciuri (search) ===== */
   const findClosestMatchIdx = useCallback(
      (targetDate) => {
         if (!matchDaysAll.length) return -1;
         const t = startOfDayTs(targetDate);
         let lo = 0,
            hi = matchDaysAll.length - 1,
            ans = -1;
         while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const mts = startOfDayTs(matchDaysAll[mid]);
            if (mts <= t) {
               ans = mid;
               lo = mid + 1;
            } else hi = mid - 1;
         }
         return ans === -1 ? 0 : ans;
      },
      [matchDaysAll]
   );

   const setCursorForDate = useCallback(
      (d) => {
         if (!anyTokens || !matchDaysAll.length) {
            setMatchCursor(-1);
            return;
         }
         setMatchCursor(findClosestMatchIdx(d));
      },
      [anyTokens, matchDaysAll, findClosestMatchIdx]
   );

   const centerDayHorizontally = useCallback(
      (targetDate) => {
         const el = scrollRef.current;
         if (!el || !loadedDays.length) return;

         const globalIdx = findIndexForDate(targetDate);
         const idx = clamp(globalIdx, 0, loadedDays.length - 1);

         const dayWScaled = DAY_W_BASE * zoom;
         const left = idx * dayWScaled + dayWScaled / 2 - el.clientWidth / 2;
         el.scrollLeft = clamp(left, 0, el.scrollWidth - el.clientWidth);

         saveCenterDay(targetDate);

         if (!suspendFlagsRef.current?.navActive) {
            setCursorForDate(targetDate);
         }

         if (anyTokens) {
            requestAnimationFrame(() => {
               requestAnimationFrame(() => {
                  scrollYToFirstMatchInDay(targetDate);
               });
            });
         }
      },
      [
         anyTokens,
         loadedDays.length,
         findIndexForDate,
         DAY_W_BASE,
         zoom,
         scrollYToFirstMatchInDay,
         setCursorForDate,
      ]
   );

   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;

      let raf;
      const tryScroll = () => {
         const wanted = __DV_NAV_STATE__.pendingScrollYForDate;
         if (!wanted) return;
         const wantedTs = startOfDayTs(wanted);
         raf = requestAnimationFrame(() => {
            const ok = scrollYToFirstMatchInDay(wanted);
            if (ok) {
               __DV_NAV_STATE__.pendingScrollYForDate = null;
               if (
                  suspendFlagsRef.current?.navActive &&
                  suspendFlagsRef.current?.navTargetTs === wantedTs
               ) {
                  endNavLockSoon(240);
               }
            } else {
               requestAnimationFrame(() => {
                  if (scrollYToFirstMatchInDay(wanted)) {
                     __DV_NAV_STATE__.pendingScrollYForDate = null;
                     if (
                        suspendFlagsRef.current?.navActive &&
                        suspendFlagsRef.current?.navTargetTs === wantedTs
                     ) {
                        endNavLockSoon(240);
                     }
                  }
               });
            }
         });
      };

      tryScroll();
      return () => cancelAnimationFrame(raf);
   }, [loadedDays.length, tokensKey, scrollYToFirstMatchInDay, endNavLockSoon]);

   useEffect(() => {
      if (!loadedDays.length || !__DV_NAV_STATE__.centerOnDateNextTick) return;
      const target = __DV_NAV_STATE__.pendingCenterDate || date;
      const id = requestAnimationFrame(() => {
         centerDayHorizontally(target);
         __DV_NAV_STATE__.centerOnDateNextTick = false;
         __DV_NAV_STATE__.pendingCenterDate = null;
         const el = scrollRef.current;
         if (el) el.dispatchEvent(new Event("scroll"));
         if (!suspendFlagsRef.current?.navActive) {
            setCursorForDate(target);
         }
      });
      return () => cancelAnimationFrame(id);
   }, [date, loadedDays.length, centerDayHorizontally, setCursorForDate]);

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

   const dayCacheRef = useRef(new Map());
   const daySignatureForTs = useCallback(
      (ts) => {
         const arr = eventsByDay.get(ts) || [];
         return arr
            .map((e) =>
               [
                  e.id,
                  +e.start,
                  +e.end,
                  e.color || "",
                  e.eventPrivateMessage || "",
                  e.privateMessage || "",
                  e.isConfirmed ? 1 : 0,
                  e.gearboxLabel || "",
                  e.sector || "",
                  e.studentFirst || "",
                  e.studentLast || "",
                  e.instructorId || "",
               ].join(":")
            )
            .join("|");
      },
      [eventsByDay]
   );

   useEffect(() => {
      dayCacheRef.current.clear();
   }, [tokensKey, sectorFilterNorm]);

   const buildUiDay = useCallback(
      (day) => {
         const ts = startOfDayTs(day);
         const signature = `${ts}|${tokensKey}|${sectorFilterNorm}|${daySignatureForTs(
            ts
         )}`;
         const hit = dayCacheRef.current.get(signature);
         if (hit) return hit;

         const dayEventsRaw = eventsByDay.get(ts) || [];
         const filtered = dayEventsRaw.filter((ev) => {
            const iid = String(ev.instructorId ?? "__unknown");
            const sectorOk =
               !allowedInstBySector || allowedInstBySector.has(iid);
            return sectorOk && (anyTokens ? eventMatchesAllTokens(ev) : true);
         });

         const baseInstructors = instructors?.length
            ? instructors
            : filtered.map((e) => ({ id: e.instructorId }));

         const instIds = (baseInstructors || [])
            .map((i) => String(i.id))
            .filter(
               (iid) => !allowedInstBySector || allowedInstBySector.has(iid)
            );

         let idsForRender = instIds;
         if ((!idsForRender || !idsForRender.length) && filtered.length) {
            idsForRender = Array.from(
               new Set(
                  filtered.map((e) => String(e.instructorId ?? "__unknown"))
               )
            );
         }

         const rows =
            idsForRender.length > 0
               ? Math.ceil(idsForRender.length / maxColsPerGroup)
               : 1;

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

         const result = {
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

         const MAX = 512;
         if (dayCacheRef.current.size > MAX) {
            const firstKey = dayCacheRef.current.keys().next().value;
            dayCacheRef.current.delete(firstKey);
         }
         dayCacheRef.current.set(signature, result);
         return result;
      },
      [
         tokensKey,
         sectorFilterNorm,
         daySignatureForTs,
         eventsByDay,
         allowedInstBySector,
         anyTokens,
         eventMatchesAllTokens,
         maxColsPerGroup,
         instructorMeta,
         instructors,
      ]
   );

   useEffect(() => {
      __DV_NAV_STATE__.matchDays = anyTokens
         ? matchDaysAll.map(startOfDayTs)
         : [];
      __DV_NAV_STATE__.queryKey = anyTokens
         ? tokens.map((t) => `${t.kind}:${t.raw}`).join("#") +
           `|${sectorFilter}`
         : "";
   }, [anyTokens, matchDaysAll, tokens, sectorFilter]);

   const goToMatchAt = useCallback(
      (rawIdx) => {
         cancelPanInertia();
         if (!matchDaysAll.length) return;
         if (suspendFlagsRef.current?.isInteracting) return;
         const len = matchDaysAll.length;
         const idx = ((rawIdx % len) + len) % len;
         setMatchCursor(idx);
         const target = matchDaysAll[idx];
         startNavLock(target, anyTokens ? 1400 : 700);
         __DV_NAV_STATE__.suspendAutoJump = true;
         centerDayHorizontally(target);
      },
      [
         cancelPanInertia,
         matchDaysAll,
         centerDayHorizontally,
         anyTokens,
         startNavLock,
      ]
   );

   const goPrevMatch = useCallback(() => {
      if (!matchDaysAll.length) return;
      const cur = matchCursor < 0 ? 0 : matchCursor;
      goToMatchAt(cur - 1);
   }, [matchCursor, matchDaysAll.length, goToMatchAt]);

   const goNextMatch = useCallback(() => {
      if (!matchDaysAll.length) return;
      const cur = matchCursor < 0 ? -1 : matchCursor;
      goToMatchAt(cur + 1);
   }, [matchCursor, matchDaysAll.length, goToMatchAt]);

   const onSearchKeyDown = useCallback(
      (e) => {
         if (e.key !== "Enter") return;
         cancelPanInertia();
         if (e.shiftKey) goPrevMatch();
         else goNextMatch();
      },
      [cancelPanInertia, goPrevMatch, goNextMatch]
   );

   /* ======== BLACKOUTS ======== */
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

   const instIdsAll = useMemo(() => {
      const ids = new Set();
      for (const d of loadedDays) {
         const day = buildUiDay(d);
         (day?.instructors || []).forEach(({ inst }) => {
            const iid = String(inst?.id || "");
            if (!iid.startsWith("__pad_")) ids.add(iid);
         });
      }
      return Array.from(ids);
   }, [loadedDays, buildUiDay]);

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
   const handleManualRefresh = useCallback(() => {
      if (!suspendFlagsRef.current?.isInteracting) {
         dispatch(fetchReservationsDelta());
      }
   }, [dispatch]);

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

   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      const onPanEnd = () => {
         if (pendingReservationsRef.current) {
            setReservationsUI(pendingReservationsRef.current);
            pendingReservationsRef.current = null;
         }
         const center = getCenterDateFromScroll();
         if (center) saveCenterDay(center);
      };
      el.addEventListener("dvpanend", onPanEnd);
      return () => el.removeEventListener("dvpanend", onPanEnd);
   }, [getCenterDateFromScroll]);

   const count = loadedDays.length;

   return (
      <div className="dayview" style={{ ...layoutVars, height: CONTAINER_H }}>
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
            {!isMobile && !compact ? (
               <div
                  className="dayview__toolbar"
                  style={{ display: "flex", gap: 8 }}
               >
                  <input
                     className="dv-search__input"
                     placeholder={
                        dataReady ? "Caută" : "Se încarcă programările…"
                     }
                     disabled={!dataReady}
                     value={query}
                     onChange={(e) => setQuery(e.target.value)}
                     onKeyDown={onSearchKeyDown}
                  />
                  <div
                     className="dv-search-nav"
                     style={{
                        display: "inline-flex",
                        gap: 6,
                        alignItems: "center",
                     }}
                  >
                     <button
                        className="dv-btn"
                        title="Căutare: anterior"
                        disabled={!anyTokens || !matchDaysAll.length}
                        onClick={() => {
                           cancelPanInertia();
                           goPrevMatch();
                        }}
                        aria-label="Anterior"
                     >
                        ‹
                     </button>
                     <span
                        className="dv-search-count"
                        style={{
                           textAlign: "center",
                           opacity: anyTokens ? 1 : 0.5,
                        }}
                     >
                        {matchDaysAll.length ? Math.max(0, matchCursor) + 1 : 0}
                        /{matchDaysAll.length}
                     </span>
                     <button
                        className="dv-btn"
                        title="Căutare: următor"
                        disabled={!anyTokens || !matchDaysAll.length}
                        onClick={() => {
                           cancelPanInertia();
                           goNextMatch();
                        }}
                        aria-label="Următor"
                     >
                        ›
                     </button>
                  </div>
                  <button
                     className="dv-btn zoom1"
                     onClick={(e) => zoomAt(1 / 1.3, e?.clientX)}
                     title="Zoom out"
                  >
                     −
                  </button>
                  <button
                     className="dv-btn zoom2"
                     onClick={(e) => zoomAt(1.3, e?.clientX)}
                     title="Zoom in"
                  >
                     +
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
                     onKeyDown={onSearchKeyDown}
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
                              onClick={() => {
                                 cancelPanInertia();
                                 goPrevMatch();
                                 setMobileMenuOpen(false);
                              }}
                              disabled={!anyTokens || !matchDaysAll.length}
                              title="Anterior"
                           >
                              ‹
                           </button>
                           <div
                              className="dv-search-count"
                              style={{
                                 alignSelf: "center",
                                 padding: "0 4px",
                                 opacity: anyTokens ? 1 : 0.5,
                              }}
                           >
                              {matchDaysAll.length
                                 ? Math.max(0, matchCursor) + 1
                                 : 0}
                              /{matchDaysAll.length}
                           </div>
                           <button
                              className="dv-btn"
                              onClick={() => {
                                 cancelPanInertia();
                                 goNextMatch();
                                 setMobileMenuOpen(false);
                              }}
                              disabled={!anyTokens || !matchDaysAll.length}
                              title="Următor"
                           >
                              ›
                           </button>
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
               touchAction: "none",
               height: rowHeight ? `${rowHeight}px` : undefined,
               overflowX: "auto",
               overflowY: "auto",
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
                     transform: `scale(${zoom})`,
                     transformOrigin: "0 0",
                     willChange: "transform",
                  }}
               >
                  {count > 0 &&
                     loadedDays.map((d, idx) => {
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
                                    idx * (baseMetrics.dayWidth + 12 + DAY_GAP),
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
                                    style={{ marginTop: rowIdxLocal ? 32 : 0 }}
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
                                                const visualKey = filteredEvents
                                                   .map((e) =>
                                                      [
                                                         e.id,
                                                         e.start?.getTime?.() ??
                                                            0,
                                                         e.end?.getTime?.() ??
                                                            0,
                                                         e.color || "",
                                                         e.privateMessage || "",
                                                         e.isConfirmed ? 1 : 0,
                                                         e.gearboxLabel || "",
                                                         e.sector || "",
                                                         e.studentFirst || "",
                                                         e.studentLast || "",
                                                      ].join(":")
                                                   )
                                                   .join("|");
                                                const eventsKey = `${filteredEvents.length}:${visualKey}`;
                                                return (
                                                   <MemoInstructorColumn
                                                      key={`${day.id}-${inst.id}-${colIdx}`}
                                                      day={day}
                                                      inst={inst}
                                                      events={filteredEvents}
                                                      eventsKey={eventsKey}
                                                      slots={slots}
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
                                                      onOpenReservation={(
                                                         reservationId
                                                      ) => {
                                                         openPopup(
                                                            "reservationEdit",
                                                            { reservationId }
                                                         );
                                                      }}
                                                      onCreateFromEmpty={
                                                         handleCreateFromEmpty
                                                      }
                                                      blockedKeySet={
                                                         blackoutKeyMapRef.current.get(
                                                            String(inst.id)
                                                         ) || null
                                                      }
                                                      blackoutVer={blackoutVer}
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

/* ===== Navigație / titlu pentru react-big-calendar ===== */
CustomDayViewOptimized.navigate = (date, action) => {
   const d = new Date(date);
   const startOf = (x) =>
      new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();

   const lockNav = (outDate) => {
      const s = __DV_NAV_STATE__;
      if (!s) return;
      s.navActive = true;
      s.navTargetTs = startOf(outDate);
      if (s.navUnlockTimer) clearTimeout(s.navUnlockTimer);
      s.navUnlockTimer = setTimeout(() => {
         s.navActive = false;
         s.navTargetTs = null;
         s.navUnlockTimer = null;
      }, 900);
   };

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
         case "TODAY": {
            const out = new Date();
            __DV_NAV_STATE__.pendingCenterDate = out;
            __DV_NAV_STATE__.centerOnDateNextTick = true;
            lockNav(out);
            return out;
         }
         case "PREV": {
            const out = new Date(
               d.getFullYear(),
               d.getMonth(),
               d.getDate() - 1
            );
            __DV_NAV_STATE__.pendingCenterDate = out;
            __DV_NAV_STATE__.centerOnDateNextTick = true;
            lockNav(out);
            return out;
         }
         case "NEXT": {
            const out = new Date(
               d.getFullYear(),
               d.getMonth(),
               d.getDate() + 1
            );
            __DV_NAV_STATE__.pendingCenterDate = out;
            __DV_NAV_STATE__.centerOnDateNextTick = true;
            lockNav(out);
            return out;
         }
         default:
            return d;
      }
   }
   const curTs = startOf(d);
   if (String(action) === "NEXT") {
      const nextTs = list.find((ts) => ts > curTs) ?? list[list.length - 1];
      const out = new Date(nextTs);
      __DV_NAV_STATE__.suspendAutoJump = true;
      __DV_NAV_STATE__.pendingCenterDate = out;
      __DV_NAV_STATE__.centerOnDateNextTick = true;
      lockNav(out);
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
      __DV_NAV_STATE__.pendingCenterDate = out;
      __DV_NAV_STATE__.centerOnDateNextTick = true;
      lockNav(out);
      return out;
   }
   if (String(action) === "TODAY") {
      const out = new Date();
      __DV_NAV_STATE__.pendingCenterDate = out;
      __DV_NAV_STATE__.centerOnDateNextTick = true;
      lockNav(out);
      return out;
   }
   return d;
};

CustomDayViewOptimized.title = (date, { localizer } = {}) => {
   if (localizer && typeof localizer.format === "function")
      return localizer.format(date, "ddd, DD MMM");
   return new Date(date).toLocaleDateString("ro-RO", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
   });
};
