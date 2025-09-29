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
import { fetchAllReservations } from "../../store/reservationsSlice";
import { fetchStudents } from "../../store/studentsSlice";
import { openPopup } from "../Utils/popupStore";

/* ====== NAV STATE GLOBAL (pt. Next/Prev cu search activ) ====== */
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

/* Helpers (non-hooks) */
function startOfDayTs(d) {
   const x = new Date(d);
   return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
}
const DAY_MS = 24 * 60 * 60 * 1000;
const FORCE_FIXED_COLS_PER_DAY = true;
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

export default function CustomDayView(props = {}) {
   const { onViewStudent } = props;
   const date = props.date ? new Date(props.date) : new Date();

   const scrollRef = useRef(null);

   // RANGE COMPLET (de la prima până la ultima rezervare)
   const [rangeStartTs, setRangeStartTs] = useState(startOfDayTs(date));
   const [rangeDays, setRangeDays] = useState(1);
   const [editMode, setEditMode] = useState(false);

   // token-uri ordonare salvate local (override)
   const [orderOverrides, setOrderOverrides] = useState(() => loadOrderCache());
   useEffect(() => {
      saveOrderCache(orderOverrides);
   }, [orderOverrides]);

   const visibleDays = useMemo(
      () =>
         Array.from(
            { length: rangeDays },
            (_, i) => new Date(rangeStartTs + i * DAY_MS)
         ),
      [rangeStartTs, rangeDays]
   );

   // recentrează dacă `date` iese din fereastră
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
      (ev) => {
         const s = (ev?.sector || "").toString().trim().toLowerCase();
         if (!s) return true;
         return s === sectorFilterNorm;
      },
      [sectorFilterNorm]
   );

   // === ORDER ENCODING (poz. instructor pe zi) ===============================
   const ORDER_SEP = "|";
   const dateKey = (d) => {
      const x = new Date(d);
      const yyyy = x.getFullYear();
      const mm = String(x.getMonth() + 1).padStart(2, "0");
      const dd = String(x.getDate()).padStart(2, "0");
      return `${yyyy}${mm}${dd}`;
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
   function parseOrderToken(tok) {
      const s = String(tok || "").trim();
      if (!s) return null;

      // YYYYMMDDxXyY
      let m = /^(\d{4})(\d{2})(\d{2})x(\d+)y(\d+)$/i.exec(s);
      if (m) {
         return {
            key: `${m[1]}${m[2]}${m[3]}`,
            x: Number(m[4]),
            y: Number(m[5]),
            kind: "day",
         };
      }

      // DDmmmYYYYxXyY
      m = /^(\d{1,2})([a-z]{3})(\d{4})x(\d+)y(\d+)$/i.exec(s);
      if (m) {
         const dd = String(m[1]).padStart(2, "0");
         const mm = month3[m[2].toLowerCase()] || "01";
         const yyyy = m[3];
         return {
            key: `${yyyy}${mm}${dd}`,
            x: Number(m[4]),
            y: Number(m[5]),
            kind: "day",
         };
      }

      // ALL/DEF
      m = /^(all|def)x(\d+)y(\d+)$/i.exec(s);
      if (m) {
         return { key: "ALL", x: Number(m[2]), y: Number(m[3]), kind: "all" };
      }

      return null;
   }
   const splitTokens = (str) =>
      String(str || "")
         .split(ORDER_SEP)
         .map((t) => t.trim())
         .filter(Boolean);

   function getPosFromOrder(orderStr, d) {
      const key = dateKey(d);
      let allPos = null;
      for (const tok of splitTokens(orderStr)) {
         const p = parseOrderToken(tok);
         if (!p) continue;
         if (p.kind === "day" && p.key === key) return { x: p.x, y: p.y };
         if (p.kind === "all") allPos = { x: p.x, y: p.y };
      }
      return allPos;
   }
   function upsertPosInOrder(orderStr, d, x, y) {
      const key = dateKey(d);
      const nextTok = `${key}x${x}y${y}`;
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
      const nextTok = `allx${x}y${y}`;
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

   // === DATA ===
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
         for (const hi of hiddenAbs) {
            if (overlapMinutes(start, end, hi.start, hi.end) > 0) return false;
         }
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
            orderRaw: i.order ?? "",
         });
      });
      return dict;
   }, [instructors, instructorPlates]);

   const getOrderStringForInst = useCallback(
      (instId) => {
         const id = String(instId);
         return orderOverrides[id] ?? instructorMeta.get(id)?.orderRaw ?? "";
      },
      [orderOverrides, instructorMeta]
   );

   // INITIAL: pune poziție globală ALL pentru instructorii fără “order”
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
   }, [
      instructors,
      getOrderStringForInst,
      props.onChangeInstructorOrder,
      maxColsPerGroup,
   ]);

   // setează/actualizează poziția pt. ziua curentă
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
         props.onChangeInstructorOrder?.(id, updated);
      },
      [getOrderStringForInst, props]
   );

   // calculează ordinea finală (id-uri) pentru o zi
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
            const pos = getPosFromOrder(
               getOrderStringForInst(iid),
               dayDate
            ) || {
               x: (ids.indexOf(iid) % cols) + 1,
               y: Math.floor(ids.indexOf(iid) / cols) + 1,
            };
            if (pos && pos.x >= 1 && pos.y >= 1) {
               maxY = Math.max(maxY, pos.y);
            }
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

   // mută un instructor cu săgeți
   const nudgeInstructor = useCallback(
      (instId, dayDate, dx, dy, fallbackX, fallbackY, rowsCount, cols = 3) => {
         const orderStr = getOrderStringForInst(instId);
         const cur = getPosGeneric(orderStr, dayDate) || {
            x: fallbackX,
            y: fallbackY,
         };

         const x = clamp(cur.x + dx, 1, cols);
         const y = clamp(cur.y + dy, 1, rowsCount);
         if (x === cur.x && y === cur.y) return;
         setInstructorOrderForDate(instId, dayDate, x, y);
      },
      [getOrderStringForInst, setInstructorOrderForDate]
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

   // === SEARCH (păstrat) ===
   const [query, setQuery] = useState("");
   const deferredQuery = useDeferredValue(query);

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

   const eventMatchesAllTokens = useCallback(
      (ev) => {
         if (!anyTokens) return true;
         const facts = makeFacts(ev);
         return tokens.every((t) => tokenHitsFacts(facts, t));
      },
      [anyTokens, tokens, instructorMeta]
   );

   // rezervări -> evenimente
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
      return result;
   }, [reservations, date, studentDict, instructorsGroups, instructorMeta]);

   // === RANGE din toate rezervările: de la prima până la ultima ===
   useEffect(() => {
      const todayTs = startOfDayTs(new Date());

      if (!mappedEvents || mappedEvents.length === 0) {
         const PAD = 14;
         setRangeStartTs(todayTs - PAD * DAY_MS);
         setRangeDays(1 + PAD * 2);
         __DV_NAV_STATE__.centerOnDateNextTick = true;
         return;
      }

      let minTs = Infinity;
      let maxTs = -Infinity;
      for (const ev of mappedEvents) {
         const s = startOfDayTs(ev.start);
         const e = startOfDayTs(ev.end || ev.start);
         if (s < minTs) minTs = s;
         if (e > maxTs) maxTs = e;
      }

      const PAD = 1;
      minTs = minTs - PAD * DAY_MS;
      maxTs = maxTs + PAD * DAY_MS;

      const days = Math.max(1, Math.floor((maxTs - minTs) / DAY_MS) + 1);
      setRangeStartTs(minTs);
      setRangeDays(days);
      __DV_NAV_STATE__.centerOnDateNextTick = true;
   }, [mappedEvents]);

   // evenimentele mapate per zi
   const eventsByDay = useMemo(() => {
      const map = new Map();
      for (const ev of mappedEvents || []) {
         const ts = startOfDayTs(ev.start);
         if (!map.has(ts)) map.set(ts, []);
         map.get(ts).push(ev);
      }
      for (const [_, list] of map) list.sort((a, b) => a.start - b.start);
      return map;
   }, [mappedEvents]);

   // cache pt. build day
   const dayCacheRef = useRef(new Map());
   const buildUiDay = useCallback(
      (day) => {
         const ts = startOfDayTs(day);
         const cacheKey = `${ts}|${__DV_NAV_STATE__.queryKey}|${sectorFilter}`;
         const cache = dayCacheRef.current;
         if (cache.has(cacheKey)) return cache.get(cacheKey);

         const dayEventsRaw = eventsByDay.get(ts) || [];
         const filtered = dayEventsRaw.filter((ev) => {
            const sectorOk = anyTokens ? true : eventMatchesSector(ev);
            const queryOk = eventMatchesAllTokens(ev);
            return sectorOk && queryOk;
         });

         const allInstIds = new Set([
            ...(instructors || []).map((i) => String(i.id)),
            ...filtered.map((ev) => String(ev.instructorId ?? "__unknown")),
         ]);

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
         eventsByDay,
         anyTokens,
         eventMatchesSector,
         eventMatchesAllTokens,
         instructorMeta,
         instructors,
         computeOrderedInstIdsForDay,
         maxColsPerGroup,
         sectorFilter,
      ]
   );
   useEffect(() => {
      dayCacheRef.current.clear();
   }, [
      eventsByDay,
      __DV_NAV_STATE__.queryKey,
      sectorFilter,
      instructorMeta,
      instructors,
   ]);

   // NAV STATE pentru search (auto-jump păstrat)
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

   const buildMatchDays = useCallback(() => {
      if (!anyTokens) return [];
      const days = new Set();
      for (const r of reservations || []) {
         const startRaw =
            r.startTime ??
            r.start ??
            r.startedAt ??
            r.start_at ??
            r.startDate ??
            r.start_date ??
            null;
         const start = startRaw ? new Date(startRaw) : null;
         if (!start) continue;
         const ev = (mappedEvents || []).find((x) => x.raw === r) || null;
         if (!ev) continue;
         if (!eventMatchesAllTokens(ev)) continue;
         const d = new Date(
            start.getFullYear(),
            start.getMonth(),
            start.getDate()
         );
         days.add(d.getTime());
      }
      return Array.from(days).sort((a, b) => a - b);
   }, [anyTokens, reservations, mappedEvents, eventMatchesAllTokens]);

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

   // --- JSON order store helpers
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
      return ensureAllToken(orderStr, x, y);
   }
   function getPosGeneric(orderStr, d) {
      const parsed = parseOrderStore(orderStr);
      if (parsed.kind === "json") return getPosFromJSON(parsed.obj, d);
      return getPosFromOrder(orderStr, d);
   }
   function upsertPosGeneric(orderStr, d, x, y) {
      const parsed = parseOrderStore(orderStr);
      if (parsed.kind === "json") return upsertPosInJSON(parsed.obj, d, x, y);
      const k = dateKey(d);
      const oldAll = getPosFromOrder(orderStr, d) || { x: 1, y: 1 };
      const next = { all: oldAll, days: { [k]: { x, y } } };
      return JSON.stringify(next);
   }

   // ===== Pan & zoom (O SINGURĂ declarație) =====
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

   const onPointerDown = (e) => {
      const el = scrollRef.current;
      if (!el) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (isInteractiveTarget(e.target)) return;

      __DV_NAV_STATE__.suspendScrollSnap = true;
      __DV_NAV_STATE__.suspendAutoJump = true;

      const st = dragRef.current;
      st.down = true;
      st.dragging = false;
      st.pointerId = e.pointerId;
      st.startX = e.clientX;
      st.startY = e.clientY;
      st.scrollLeft = el.scrollLeft;
      st.scrollTop = el.scrollTop;
   };
   const panRAF = useRef(null);
   const panDelta = useRef({ dx: 0, dy: 0 });

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
         try {
            el.setPointerCapture?.(st.pointerId);
         } catch {}
         el.classList.add("is-panning", "is-dragging");
         e.preventDefault();
      }

      panDelta.current.dx = -dx;
      panDelta.current.dy = -dy;

      if (!panRAF.current) {
         panRAF.current = requestAnimationFrame(() => {
            panRAF.current = null;
            el.scrollLeft = st.scrollLeft + panDelta.current.dx;
            el.scrollTop = st.scrollTop + panDelta.current.dy;
         });
      }
   };

   useEffect(
      () => () => {
         if (panRAF.current) cancelAnimationFrame(panRAF.current);
      },
      []
   );

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
      el.classList.remove("is-panning");
   };
   const onClickCapture = (e) => {
      if (dragRef.current.dragging) {
         e.preventDefault();
         e.stopPropagation();
      }
   };
   const onDoubleClickCapture = (e) => {
      if (dragRef.current.dragging) {
         e.preventDefault();
         e.stopPropagation();
      }
   };

   const openReservationOnDbl = useCallback(
      (reservationId) => {
         if (editMode || dragRef.current?.dragging) return;
         openPopup("reservationEdit", { reservationId });
      },
      [editMode]
   );

   const createFromEmptyOnDbl = useCallback(
      (ev) => {
         if (editMode || dragRef.current?.dragging) return;
         handleCreateFromEmpty(ev);
      },
      [editMode]
   );

   const onWheelZoom = (e) => {
      const withModifier = e.ctrlKey || e.metaKey || e.altKey;
      if (!withModifier) {
         __DV_NAV_STATE__.suspendScrollSnap = true;
         return;
      }
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      if (delta > 0) decZoom();
      else incZoom();
   };

   // Layout (vars CSS)
   const layoutVars = {
      "--zoom": zoom,
      "--event-h": `calc(${EVENT_H} * var(--zoom))`,
      "--hours-col-w": HOURS_COL_W,
      "--group-gap": GROUP_GAP,
      "--day-header-h": `44px`,
      "--row-header-h": `48px`,
      "--font-scale": zoom,
   };

   const px = (v) => parseFloat(String(v || 0));
   const metrics = useMemo(() => {
      const colw = px(COL_W) * zoom;
      const slot = px(SLOT_H) * zoom;
      const dayWidth = maxColsPerGroup * colw;
      const rowHeight = 48 + visibleSlotCount * slot;
      return { colw, slot, dayWidth, rowHeight };
   }, [COL_W, SLOT_H, zoom, maxColsPerGroup, visibleSlotCount]);

   // ====== utilitar: centrează orizontal o zi dată ======
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

         const dayW = metrics.dayWidth + DAY_GAP;
         const left = idx * dayW + dayW / 2 - el.clientWidth / 2;
         el.scrollLeft = clamp(left, 0, el.scrollWidth - el.clientWidth);
      },
      [rangeStartTs, rangeDays, COL_W, zoom]
   );

   useEffect(() => {
      if (!visibleDays.length) return;
      if (!__DV_NAV_STATE__.centerOnDateNextTick) return;

      const id = requestAnimationFrame(() => {
         centerDayHorizontally(date);
         __DV_NAV_STATE__.centerOnDateNextTick = false;
         const el = scrollRef.current;
         if (el) el.dispatchEvent(new Event("scroll"));
      });
      return () => cancelAnimationFrame(id);
   }, [date, visibleDays.length, centerDayHorizontally]);

   // --- Windowed strip: DOM fix, conținut dinamic ---
   const DAY_W = metrics.dayWidth + DAY_GAP; // lățimea reală a unei zile
   const WINDOW = 9; // ținem mereu 9 sloturi montate
   const HALF = Math.floor(WINDOW / 2);

   const [winStart, setWinStart] = useState(0);
   const prevScrollRef = useRef(0);
   const rAFRef = useRef(null);

   // scroll -> update winStart, throttled cu rAF
   const handleScroll = useCallback(() => {
      const el = scrollRef.current;
      if (!el || !visibleDays.length) return;

      prevScrollRef.current = el.scrollLeft;
      if (rAFRef.current) return;

      rAFRef.current = requestAnimationFrame(() => {
         rAFRef.current = null;
         const roughIdx = Math.floor(el.scrollLeft / DAY_W);
         const nextStart = clamp(
            roughIdx - HALF,
            0,
            Math.max(0, visibleDays.length - WINDOW)
         );
         setWinStart((s) => (s === nextStart ? s : nextStart));
      });
   }, [visibleDays.length, DAY_W]);

   useEffect(
      () => () => {
         if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
      },
      []
   );

   // când recentrezi pe o zi (NEXT/PREV/TODAY), păstrează scrollLeft exact (anti-clip)
   useLayoutEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollLeft = prevScrollRef.current;
   }, [winStart]);

   // ---------- RENDER ----------
   return (
      <div
         className={`dayview${editMode ? " edit-mode" : ""}`}
         style={{ ...layoutVars, height: CONTAINER_H }}
      >
         {/* ===== Header ===== */}
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
                  className={`dv-btn ${editMode ? "dv-btn--active" : ""}`}
                  onClick={() => setEditMode((v) => !v)}
                  title="Editează pozițiile instructorilor"
               >
                  {editMode ? "Ieșire editare" : "Editare poziții"}
               </button>
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

         {/* ===== Scrollable Row (pan & zoom) ===== */}
         <div
            className="dayview__row dv-pan"
            ref={scrollRef}
            onScroll={handleScroll}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onWheel={onWheelZoom}
            onClickCapture={onClickCapture}
            onDoubleClickCapture={onDoubleClickCapture}
            onDragStart={(e) => e.preventDefault()}
         >
            {/* Pista totală are lățimea tuturor zilelor (fixă) */}
            <div
               className="dayview__track"
               style={{
                  position: "relative",
                  width: `${visibleDays.length * DAY_W}px`,
                  height: "100%",
               }}
            >
               {/* FEREASTRĂ FIXĂ: WINDOW sloturi constante, mutate pe X */}
               <div
                  className="dv-window"
                  style={{
                     position: "absolute",
                     left: `${winStart * DAY_W}px`,
                     top: 0,
                     display: "flex",
                     gap: `${DAY_GAP}px`,
                     width: `${WINDOW * DAY_W - DAY_GAP}px`,
                     willChange: "transform",
                     transform: "translateZ(0)",
                  }}
               >
                  {Array.from({ length: WINDOW }).map((_, slotIdx) => {
                     const dayIdx = winStart + slotIdx;
                     const inRange = dayIdx >= 0 && dayIdx < visibleDays.length;

                     // SLOT stabil: cheia e indexul de slot, nu ziua
                     return (
                        <div
                           key={`wslot-${slotIdx}`}
                           style={{
                              flex: "0 0 auto",
                              width: `${DAY_W - 20}px`,
                           }}
                        >
                           {inRange
                              ? (() => {
                                   const d = visibleDays[dayIdx];
                                   const day = buildUiDay(d);
                                   const instList = day.instructors || [];
                                   const rows = toRowsOfN(
                                      instList,
                                      maxColsPerGroup,
                                      true
                                   );

                                   const cols = FORCE_FIXED_COLS_PER_DAY
                                      ? maxColsPerGroup
                                      : Math.max(
                                           1,
                                           Math.min(
                                              maxColsPerGroup,
                                              instList.length
                                           )
                                        );
                                   const slots = mkStandardSlotsForDay(
                                      day.date
                                   );

                                   return (
                                      <section
                                         className="dayview__group-wrap"
                                         style={{
                                            "--cols": cols,
                                            "--colw": `calc(${COL_W} * var(--zoom))`,
                                            width: `${metrics.dayWidth + 12}px`,
                                            flex: "0 0 auto",
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
                                                  marginTop: rowIdxLocal
                                                     ? ROW_GAP
                                                     : 0,
                                               }}
                                            >
                                               <div className="dayview__group-content dayview__group-content--row">
                                                  <div
                                                     className="dayview__columns"
                                                     style={{ "--cols": 3 }}
                                                  >
                                                     {row.map(
                                                        (
                                                           { inst, events },
                                                           colIdx
                                                        ) => {
                                                           const isPad = String(
                                                              inst?.id || ""
                                                           ).startsWith(
                                                              "__pad_"
                                                           );
                                                           const meta = isPad
                                                              ? null
                                                              : instructorMeta.get(
                                                                   String(
                                                                      inst.id
                                                                   )
                                                                ) || null;

                                                           const fromGroups = (
                                                              instructorsGroups ||
                                                              []
                                                           )
                                                              .flatMap(
                                                                 (g) =>
                                                                    g.instructors ||
                                                                    []
                                                              )
                                                              .find(
                                                                 (i) =>
                                                                    String(
                                                                       i.id
                                                                    ) ===
                                                                    String(
                                                                       inst.id
                                                                    )
                                                              );

                                                           const displayName =
                                                              isPad
                                                                 ? ""
                                                                 : inst?.name?.trim() ||
                                                                   `${
                                                                      fromGroups?.firstName ??
                                                                      fromGroups?.name ??
                                                                      ""
                                                                   } ${
                                                                      fromGroups?.lastName ??
                                                                      ""
                                                                   }`.trim() ||
                                                                   "–";

                                                           const displayPlate =
                                                              isPad
                                                                 ? ""
                                                                 : (
                                                                      meta?.plateRaw ||
                                                                      ""
                                                                   ).trim();
                                                           const displayInstPhone =
                                                              isPad
                                                                 ? ""
                                                                 : (
                                                                      meta?.phoneDigits ||
                                                                      ""
                                                                   ).trim();

                                                           const eventsToRender =
                                                              isPad
                                                                 ? []
                                                                 : editMode
                                                                 ? []
                                                                 : events;

                                                           const currentOrder =
                                                              getOrderStringForInst(
                                                                 inst.id
                                                              );
                                                           const curPos =
                                                              getPosGeneric(
                                                                 currentOrder,
                                                                 day.date
                                                              ) || {
                                                                 x: colIdx + 1,
                                                                 y:
                                                                    rowIdxLocal +
                                                                    1,
                                                              };

                                                           const canLeft =
                                                              curPos.x > 1;
                                                           const canRight =
                                                              curPos.x < 3;
                                                           const canUp =
                                                              curPos.y > 1;
                                                           const canDown =
                                                              curPos.y <
                                                              day.rowsCount;

                                                           const nudge = (
                                                              dx,
                                                              dy
                                                           ) =>
                                                              nudgeInstructor(
                                                                 inst.id,
                                                                 day.date,
                                                                 dx,
                                                                 dy,
                                                                 colIdx + 1,
                                                                 rowIdxLocal +
                                                                    1,
                                                                 day.rowsCount,
                                                                 3
                                                              );

                                                           return (
                                                              <div
                                                                 key={`${day.id}-${inst.id}`}
                                                                 className={`dayview__event-col${
                                                                    isPad
                                                                       ? " dayview__event-col--pad"
                                                                       : ""
                                                                 }`}
                                                                 style={{
                                                                    "--event-h": `var(--event-h)`,
                                                                    "--visible-slots":
                                                                       slots.length,
                                                                 }}
                                                                 data-colid={`${day.id}-${inst.id}`}
                                                                 data-dayid={
                                                                    day.id
                                                                 }
                                                              >
                                                                 {/* Header col */}
                                                                 <div
                                                                    className="dayview__column-head"
                                                                    style={{
                                                                       "--col-idx":
                                                                          colIdx,
                                                                       position:
                                                                          "relative",
                                                                    }}
                                                                 >
                                                                    <div className="dv-inst-name">
                                                                       {highlightTokens(
                                                                          displayName,
                                                                          tokens
                                                                       ) ||
                                                                          "\u00A0"}
                                                                    </div>
                                                                    <div className="dv-inst-plate">
                                                                       {highlightTokens(
                                                                          displayPlate,
                                                                          tokens
                                                                       ) ||
                                                                          "\u00A0"}
                                                                       {displayInstPhone ? (
                                                                          <>
                                                                             {
                                                                                " • "
                                                                             }
                                                                             {highlightTokens(
                                                                                displayInstPhone,
                                                                                tokens
                                                                             )}
                                                                          </>
                                                                       ) : null}
                                                                    </div>
                                                                 </div>

                                                                 {/* Pad editare */}
                                                                 {editMode &&
                                                                    !isPad && (
                                                                       <div className="dv-move-pad">
                                                                          <span />
                                                                          <button
                                                                             onClick={() =>
                                                                                nudge(
                                                                                   0,
                                                                                   -1
                                                                                )
                                                                             }
                                                                             title="Sus"
                                                                             disabled={
                                                                                !canUp
                                                                             }
                                                                          >
                                                                             ↑
                                                                          </button>
                                                                          <span />
                                                                          <button
                                                                             onClick={() =>
                                                                                nudge(
                                                                                   -1,
                                                                                   0
                                                                                )
                                                                             }
                                                                             title="Stânga"
                                                                             disabled={
                                                                                !canLeft
                                                                             }
                                                                             style={{
                                                                                gridColumn:
                                                                                   "1 / 2",
                                                                             }}
                                                                          >
                                                                             ←
                                                                          </button>
                                                                          <span />
                                                                          <button
                                                                             onClick={() =>
                                                                                nudge(
                                                                                   1,
                                                                                   0
                                                                                )
                                                                             }
                                                                             title="Dreapta"
                                                                             disabled={
                                                                                !canRight
                                                                             }
                                                                             style={{
                                                                                gridColumn:
                                                                                   "3 / 4",
                                                                             }}
                                                                          >
                                                                             →
                                                                          </button>
                                                                          <span />
                                                                          <button
                                                                             onClick={() =>
                                                                                nudge(
                                                                                   0,
                                                                                   1
                                                                                )
                                                                             }
                                                                             title="Jos"
                                                                             disabled={
                                                                                !canDown
                                                                             }
                                                                          >
                                                                             ↓
                                                                          </button>
                                                                          <span />
                                                                       </div>
                                                                    )}

                                                                 {/* Body: sloturi fixe */}
                                                                 {!editMode &&
                                                                    slots.map(
                                                                       (
                                                                          slot,
                                                                          sIdx
                                                                       ) => {
                                                                          const ev =
                                                                             eventsToRender.find(
                                                                                (
                                                                                   e
                                                                                ) =>
                                                                                   Math.max(
                                                                                      e.start.getTime(),
                                                                                      slot.start.getTime()
                                                                                   ) <
                                                                                   Math.min(
                                                                                      e.end.getTime(),
                                                                                      slot.end.getTime()
                                                                                   )
                                                                             );
                                                                          const cellKey = `${
                                                                             day.id
                                                                          }-${
                                                                             inst?.id
                                                                          }-${slot.start.getTime()}`;

                                                                          return (
                                                                             <div
                                                                                key={
                                                                                   cellKey
                                                                                }
                                                                                className="dv-slot"
                                                                                style={{
                                                                                   gridRow:
                                                                                      sIdx +
                                                                                      2,
                                                                                   height:
                                                                                      "var(--event-h)",
                                                                                }}
                                                                             >
                                                                                {ev ? (
                                                                                   (() => {
                                                                                      const normalize =
                                                                                         (
                                                                                            t
                                                                                         ) => {
                                                                                            const s =
                                                                                               String(
                                                                                                  t ||
                                                                                                     ""
                                                                                               )
                                                                                                  .trim()
                                                                                                  .replace(
                                                                                                     /^var\(/,
                                                                                                     ""
                                                                                                  )
                                                                                                  .replace(
                                                                                                     /\)$/,
                                                                                                     ""
                                                                                                  )
                                                                                                  .replace(
                                                                                                     /^--event-/,
                                                                                                     "--"
                                                                                                  );
                                                                                            const ok =
                                                                                               [
                                                                                                  "--default",
                                                                                                  "--yellow",
                                                                                                  "--green",
                                                                                                  "--red",
                                                                                                  "--orange",
                                                                                                  "--purple",
                                                                                                  "--pink",
                                                                                                  "--blue",
                                                                                                  "--indigo",
                                                                                               ];
                                                                                            return ok.includes(
                                                                                               s
                                                                                            )
                                                                                               ? s
                                                                                               : "--default";
                                                                                         };
                                                                                      const colorToken =
                                                                                         normalize(
                                                                                            ev.color
                                                                                         );
                                                                                      const colorClass =
                                                                                         {
                                                                                            "--default":
                                                                                               "dayview__event--default",
                                                                                            "--yellow":
                                                                                               "dayview__event--yellow",
                                                                                            "--green":
                                                                                               "dayview__event--green",
                                                                                            "--red":
                                                                                               "dayview__event--red",
                                                                                            "--orange":
                                                                                               "dayview__event--orange",
                                                                                            "--purple":
                                                                                               "dayview__event--purple",
                                                                                            "--pink":
                                                                                               "dayview__event--pink",
                                                                                            "--blue":
                                                                                               "dayview__event--blue",
                                                                                            "--indigo":
                                                                                               "dayview__event--indigo",
                                                                                         }[
                                                                                            colorToken
                                                                                         ];

                                                                                      const person =
                                                                                         `${
                                                                                            ev.studentFirst ||
                                                                                            ""
                                                                                         } ${
                                                                                            ev.studentLast ||
                                                                                            ""
                                                                                         }`.trim();
                                                                                      const studentObj =
                                                                                         ev.studentId
                                                                                            ? {
                                                                                                 id: ev.studentId,
                                                                                                 firstName:
                                                                                                    ev.studentFirst,
                                                                                                 lastName:
                                                                                                    ev.studentLast,
                                                                                                 phone: ev.studentPhone,
                                                                                                 isConfirmed:
                                                                                                    ev.isConfirmed,
                                                                                              }
                                                                                            : null;

                                                                                      return (
                                                                                         <div
                                                                                            className={`dayview__event ${colorClass}`}
                                                                                            onDoubleClick={() => {
                                                                                               if (
                                                                                                  !editMode &&
                                                                                                  !dragRef
                                                                                                     .current
                                                                                                     ?.dragging
                                                                                               )
                                                                                                  openReservationOnDbl(
                                                                                                     ev.id
                                                                                                  );
                                                                                            }}
                                                                                         >
                                                                                            <div className="dayview__event-top">
                                                                                               <div className="dayview__event-person">
                                                                                                  <button
                                                                                                     type="button"
                                                                                                     className="dayview__event-person-name dayview__event-person-name--link"
                                                                                                     onClick={(
                                                                                                        e
                                                                                                     ) => {
                                                                                                        if (
                                                                                                           e.detail >=
                                                                                                              2 ||
                                                                                                           editMode
                                                                                                        )
                                                                                                           return;
                                                                                                        if (
                                                                                                           studentObj
                                                                                                        ) {
                                                                                                           openPopup(
                                                                                                              "studentDetails",
                                                                                                              {
                                                                                                                 student:
                                                                                                                    studentObj,
                                                                                                              }
                                                                                                           );
                                                                                                           onViewStudent?.(
                                                                                                              {
                                                                                                                 studentId:
                                                                                                                    studentObj.id,
                                                                                                              }
                                                                                                           );
                                                                                                        }
                                                                                                     }}
                                                                                                  >
                                                                                                     {highlightTokens(
                                                                                                        person,
                                                                                                        tokens
                                                                                                     )}
                                                                                                  </button>
                                                                                               </div>
                                                                                            </div>

                                                                                            {ev.studentPhone && (
                                                                                               <span className="dv-phone">
                                                                                                  {highlightTokens(
                                                                                                     ev.studentPhone,
                                                                                                     tokens
                                                                                                  )}
                                                                                               </span>
                                                                                            )}

                                                                                            <div className="dv-meta-row">
                                                                                               <span className="dv-meta-pill">
                                                                                                  {ev.isConfirmed
                                                                                                     ? "Da"
                                                                                                     : "Nu"}
                                                                                               </span>
                                                                                               <span className="dv-meta-pill">
                                                                                                  {hhmm(
                                                                                                     ev.start
                                                                                                  )}
                                                                                               </span>
                                                                                               {ev.gearboxLabel && (
                                                                                                  <span className="dv-meta-pill">
                                                                                                     {
                                                                                                        ev.gearboxLabel
                                                                                                     }
                                                                                                  </span>
                                                                                               )}
                                                                                            </div>

                                                                                            {ev.privateMessage && (
                                                                                               <p className="dayview__event-note">
                                                                                                  {highlightTokens(
                                                                                                     ev.privateMessage,
                                                                                                     tokens
                                                                                                  )}
                                                                                               </p>
                                                                                            )}
                                                                                         </div>
                                                                                      );
                                                                                   })()
                                                                                ) : (
                                                                                   <div
                                                                                      className="dayview__event dayview__event--default"
                                                                                      data-empty="1"
                                                                                      onDoubleClick={() => {
                                                                                         if (
                                                                                            !isPad &&
                                                                                            !editMode
                                                                                         ) {
                                                                                            createFromEmptyOnDbl(
                                                                                               {
                                                                                                  start: slot.start,
                                                                                                  end: slot.end,
                                                                                                  instructorId:
                                                                                                     String(
                                                                                                        inst.id
                                                                                                     ),
                                                                                                  groupId:
                                                                                                     String(
                                                                                                        inst.id
                                                                                                     ),
                                                                                                  sector:
                                                                                                     "",
                                                                                               }
                                                                                            );
                                                                                         }
                                                                                      }}
                                                                                   >
                                                                                      <div className="dv-meta-row dv-meta-row--solo">
                                                                                         <span className="dv-meta-pill">
                                                                                            {hhmm(
                                                                                               slot.start
                                                                                            )}
                                                                                         </span>
                                                                                      </div>
                                                                                   </div>
                                                                                )}
                                                                             </div>
                                                                          );
                                                                       }
                                                                    )}
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
                                })()
                              : null}
                        </div>
                     );
                  })}
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
   if (localizer && typeof localizer.format === "function")
      return localizer.format(date, "dddd, DD MMMM YYYY");
   return new Date(date).toLocaleDateString("ro-RO", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
   });
};
