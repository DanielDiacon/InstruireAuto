// src/components/APanel/Calendar/dayview/render.js
import {
   MOLDOVA_TZ,
   formatHHMM,
   hhmmInTZ,
   localKeyFromTs,
   buildVirtualSlotForDayHHMM,
   getBlockedSetForInstructor,
   getStudentPhoneFromEv,
   getStudentPrivateMessageFromEv,
   slotOverlapsEvents,
   WAIT_SLOTS_PER_COLUMN,
   CANCEL_SLOTS_PER_COLUMN,
   LATERAL_TIME_MARKS,
   LATERAL_SLOTS_PER_COLUMN,
   LATERAL_PAD_ID,
   WAIT_PLACEHOLDER_TEXT,
} from "./utils";

/* ================== TOKENS ================== */

export const DEFAULT_EVENT_COLOR_TOKEN = "--event-default";
export const NO_COLOR_TOKEN = "--black-t";

/* ================== PALETĂ & DARK MODE ================== */

let COLOR_ROOT = null;
let COLOR_CACHE = new Map();
let LAST_EVENTS_REF = null;
let LAST_EVENTS_WITH_COLOR = [];
let LAST_EVENTS_BY_INST = {};
let LAST_OVERLAP_SOURCE_REF = null;
let LAST_OVERLAP_MAP = null;
let LAST_CANCELED_SOURCE_REF = null;
let LAST_CANCELED_MAP = null;
let LAST_SLOT_GEOMS_REF = null;
let LAST_SLOT_INDEX_BY_LABEL = null;
let LAST_SLOT_INDEX_BY_START_MS = null;
let LAST_SLOT_START_POINTS = null;
let LAST_EVENT_LAYOUT_EVENTS_REF = null;
let LAST_EVENT_LAYOUT_SLOTS_REF = null;
let STATIC_COLOR_OVERRIDES = null;
let EVENTS_SIGNATURE_CACHE = new WeakMap();
let SLOTS_SIGNATURE_CACHE = new WeakMap();
let WAIT_NOTES_SIGNATURE_CACHE = new WeakMap();
let BLOCKED_SIGNATURE_CACHE = new WeakMap();
let WRAP_TEXT_CACHE = new Map();
const WRAP_TEXT_CACHE_MAX = 20000;

export function getColorRoot() {
   if (typeof document === "undefined") return null;

   if (COLOR_ROOT && document.contains(COLOR_ROOT)) return COLOR_ROOT;

   COLOR_ROOT =
      document.querySelector(".darkmode") ||
      document.getElementById("root") ||
      document.body ||
      document.documentElement;

   return COLOR_ROOT;
}

export function clearColorCache() {
   COLOR_CACHE.clear();
   LAST_EVENTS_REF = null;
   LAST_EVENTS_WITH_COLOR = [];
   LAST_EVENTS_BY_INST = {};
   LAST_OVERLAP_SOURCE_REF = null;
   LAST_OVERLAP_MAP = null;
   LAST_CANCELED_SOURCE_REF = null;
   LAST_CANCELED_MAP = null;
   LAST_SLOT_GEOMS_REF = null;
   LAST_SLOT_INDEX_BY_LABEL = null;
   LAST_SLOT_INDEX_BY_START_MS = null;
   LAST_SLOT_START_POINTS = null;
   LAST_EVENT_LAYOUT_EVENTS_REF = null;
   LAST_EVENT_LAYOUT_SLOTS_REF = null;
   EVENTS_SIGNATURE_CACHE = new WeakMap();
   SLOTS_SIGNATURE_CACHE = new WeakMap();
   WAIT_NOTES_SIGNATURE_CACHE = new WeakMap();
   BLOCKED_SIGNATURE_CACHE = new WeakMap();
   WRAP_TEXT_CACHE = new Map();
}

function normalizeColorLookupKey(color) {
   const value = String(color || "").trim();
   if (!value) return "";
   if (value.startsWith("var(") && value.endsWith(")")) {
      return value.slice(4, -1).trim();
   }
   return value;
}

function lookupStaticColor(color) {
   if (!STATIC_COLOR_OVERRIDES || !STATIC_COLOR_OVERRIDES.size) return null;
   const key = normalizeColorLookupKey(color);
   if (!key) return null;
   const direct = STATIC_COLOR_OVERRIDES.get(key);
   if (direct != null && String(direct).trim()) return String(direct).trim();
   return null;
}

export function setStaticColorOverrides(overrides) {
   if (!overrides) {
      STATIC_COLOR_OVERRIDES = null;
      COLOR_CACHE.clear();
      return;
   }

   const next = new Map();

   const register = (key, value) => {
      const normalizedKey = normalizeColorLookupKey(key);
      const normalizedValue = String(value ?? "").trim();
      if (!normalizedKey || !normalizedValue) return;
      next.set(normalizedKey, normalizedValue);
   };

   if (overrides instanceof Map) {
      for (const [key, value] of overrides.entries()) register(key, value);
   } else if (typeof overrides === "object") {
      for (const [key, value] of Object.entries(overrides))
         register(key, value);
   }

   STATIC_COLOR_OVERRIDES = next.size ? next : null;
   COLOR_CACHE.clear();
}

function resolveColor(color) {
   if (!color) return "#616161";

   const key = String(color).trim();
   if (!key) return "#616161";

   const cached = COLOR_CACHE.get(key);
   if (cached) return cached;

   const staticResolved = lookupStaticColor(key);
   if (staticResolved) {
      COLOR_CACHE.set(key, staticResolved);
      return staticResolved;
   }

   if (typeof window === "undefined" || typeof document === "undefined") {
      COLOR_CACHE.set(key, key);
      return key;
   }

   const root = getColorRoot();
   if (!root) {
      COLOR_CACHE.set(key, key);
      return key;
   }

   let result = key;

   if (key.startsWith("var(")) {
      const name = normalizeColorLookupKey(key);
      const val = getComputedStyle(root).getPropertyValue(name).trim();
      result = val || "#616161";
   } else if (key.startsWith("--")) {
      const val = getComputedStyle(root).getPropertyValue(key).trim();
      result = val || "#616161";
   }

   if (!result || result === key) {
      const fallback = lookupStaticColor(key);
      if (fallback) result = fallback;
   }

   COLOR_CACHE.set(key, result);
   return result;
} /* ================== PRESENCE (colored borders) ================== */

function resolveCanvasColor(input) {
   const s = String(input || "").trim();
   if (!s) return "";

   // token CSS
   if (s.startsWith("--") || s.startsWith("var(")) return resolveColor(s);

   // hex / rgb / hsl
   if (/^#[0-9a-fA-F]{3,8}$/.test(s) || /^(rgb\(|hsl\()/i.test(s)) return s;

   // nume CSS (red/green/blue etc.)
   if (/^[a-z]+$/i.test(s)) return s;

   // fallback: acceptă "GREEN", "event-green", etc.
   return resolveColor(normalizeEventColor(s));
}

function isCanceledReservation(ev) {
   if (!ev || typeof ev !== "object") return false;
   const raw = ev.raw || {};
   return !!(
      raw.isCancelled ??
      raw.is_cancelled ??
      ev.isCancelled ??
      ev.is_cancelled
   );
}

function getPresenceColorsForId(presenceMap, reservationId) {
   if (!presenceMap || reservationId == null) return null;

   const ridStr = String(reservationId);
   const ridNum = Number(reservationId);

   if (presenceMap instanceof Map) {
      // IMPORTANT: suport și chei string și chei number
      return (
         presenceMap.get(ridStr) ||
         (Number.isFinite(ridNum) ? presenceMap.get(ridNum) : null) ||
         null
      );
   }

   if (typeof presenceMap === "object") {
      const v =
         presenceMap[ridStr] ??
         (Number.isFinite(ridNum) ? presenceMap[ridNum] : undefined);
      return Array.isArray(v) ? v : null;
   }

   return null;
}

function drawPresenceBorder(
   ctx,
   x,
   y,
   w,
   h,
   colors,
   baseRadius = 0,
   fontScale = 1,
) {
   if (!colors || !colors.length) return;

   const max = Math.min(3, colors.length);
   const lineW = Math.max(2, 3 * (fontScale || 1));
   const gap = Math.max(1, 2 * (fontScale || 1));

   ctx.save();
   ctx.lineJoin = "round";

   for (let i = 0; i < max; i++) {
      const inset = i * (lineW + gap);
      const c = resolveCanvasColor(colors[i]) || "#31d17c";

      const rx = x + inset + 0.5;
      const ry = y + inset + 0.5;
      const rw = w - inset * 2 - 1;
      const rh = h - inset * 2 - 1;
      if (rw <= 1 || rh <= 1) continue;

      ctx.strokeStyle = c;
      ctx.lineWidth = lineW;

      const r = Math.max(0, (baseRadius || 0) - inset);
      drawRoundRect(ctx, rx, ry, rw, rh, r);
      ctx.stroke();
   }

   ctx.restore();
}

const EVENT_COLOR_MAP = {
   DEFAULT: DEFAULT_EVENT_COLOR_TOKEN,
   RED: "--event-red",
   ORANGE: "--event-orange",
   YELLOW: "--event-yellow",
   GREEN: "--event-green",
   BLUE: "--event-blue",
   INDIGO: "--event-indigo",
   PURPLE: "--event-purple",
   PINK: "--event-pink",
   BLACK: NO_COLOR_TOKEN,
   "BLACK-S": NO_COLOR_TOKEN,
   "BLACK-T": NO_COLOR_TOKEN,
};

function normalizeEventColor(dbColor) {
   if (!dbColor) return DEFAULT_EVENT_COLOR_TOKEN;

   let v = String(dbColor).trim();

   if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return DEFAULT_EVENT_COLOR_TOKEN;

   if (v.toLowerCase() === "black" || v.toLowerCase() === "black-t") {
      return NO_COLOR_TOKEN;
   }

   if (v.toLowerCase() === "transparent") return NO_COLOR_TOKEN;

   if (/^(rgb\(|hsl\()/i.test(v)) return v;

   if (v.startsWith("var(")) return v;

   if (v.startsWith("--")) {
      const short = v.slice(2).toLowerCase();

      if (!short || short === "default") return DEFAULT_EVENT_COLOR_TOKEN;

      if (short === "black-s" || short === "black" || short === "black-t") {
         return NO_COLOR_TOKEN;
      }

      if (short.startsWith("event-")) return `--${short}`;

      return `--event-${short}`;
   }

   if (/^event-/i.test(v)) {
      const rest = v.slice("event-".length).toLowerCase();

      if (!rest || rest === "default") return DEFAULT_EVENT_COLOR_TOKEN;

      if (rest === "black-s" || rest === "black" || rest === "black-t") {
         return NO_COLOR_TOKEN;
      }

      return `--event-${rest}`;
   }

   const key = v.toUpperCase();
   const cssVar = EVENT_COLOR_MAP[key];
   if (cssVar) return cssVar;

   return DEFAULT_EVENT_COLOR_TOKEN;
}

/* ================== CANVAS HELPERS ================== */

export function drawRoundRect(ctx, x, y, w, h, r) {
   const radius =
      typeof r === "number"
         ? { tl: r, tr: r, br: r, bl: r }
         : { tl: 0, tr: 0, br: 0, bl: 0, ...r };

   ctx.beginPath();
   ctx.moveTo(x + radius.tl, y);
   ctx.lineTo(x + w - radius.tr, y);
   ctx.quadraticCurveTo(x + w, y, x + w, y + radius.tr);
   ctx.lineTo(x + w, y + h - radius.br);
   ctx.quadraticCurveTo(x + w, y + h, x + w - radius.br, y + h);
   ctx.lineTo(x + radius.bl, y + h);
   ctx.quadraticCurveTo(x, y + h, x, y + h - radius.bl);
   ctx.lineTo(x, y + radius.tl);
   ctx.quadraticCurveTo(x, y, x + radius.tl, y);
   ctx.closePath();
}

export function wrapText(ctx, text, maxWidth, maxLines = Infinity) {
   const raw = String(text || "");
   if (!raw) return [];

   const safeWidth = Math.max(0, Math.round(Number(maxWidth) || 0));
   const fontKey = String(ctx?.font || "");
   const linesKey = Number.isFinite(maxLines) ? Number(maxLines) : -1;
   const cacheKey = `${fontKey}|${safeWidth}|${linesKey}|${raw}`;

   const cached = WRAP_TEXT_CACHE.get(cacheKey);
   if (cached) return cached;

   const words = raw.split(/\s+/).filter(Boolean);

   const lines = [];
   let current = "";
   let truncated = false;

   const pushLine = (line) => {
      if (!line) return;
      lines.push(line);
   };

   outer: for (const word of words) {
      const test = current ? current + " " + word : word;

      if (ctx.measureText(test).width <= maxWidth) {
         current = test;
         continue;
      }

      if (current) {
         pushLine(current);
         current = "";
         if (lines.length >= maxLines) {
            truncated = true;
            break outer;
         }
      }

      if (ctx.measureText(word).width <= maxWidth) {
         current = word;
      } else {
         let part = "";
         for (const ch of word) {
            const testPart = part + ch;
            if (ctx.measureText(testPart).width <= maxWidth) {
               part = testPart;
            } else {
               pushLine(part);
               part = ch;
               if (lines.length >= maxLines) {
                  truncated = true;
                  break;
               }
            }
         }
         current = part;
         if (truncated) break outer;
      }
   }

   if (!truncated && current) pushLine(current);

   if (lines.length > maxLines) {
      lines.length = maxLines;
      truncated = true;
   }

   if (truncated && isFinite(maxLines) && maxLines > 0 && lines.length) {
      const lastIndex = lines.length - 1;
      let last = lines[lastIndex];
      const ellipsis = "…";

      if (!last.endsWith(ellipsis)) {
         if (ctx.measureText(last + ellipsis).width <= maxWidth) {
            lines[lastIndex] = last + ellipsis;
         } else {
            let trimmed = last;
            while (
               trimmed.length &&
               ctx.measureText(trimmed + ellipsis).width > maxWidth
            ) {
               trimmed = trimmed.slice(0, -1);
            }
            lines[lastIndex] = trimmed ? trimmed + ellipsis : last;
         }
      }
   }

   if (WRAP_TEXT_CACHE.size >= WRAP_TEXT_CACHE_MAX) {
      WRAP_TEXT_CACHE.clear();
   }
   WRAP_TEXT_CACHE.set(cacheKey, lines);

   return lines;
}

function findClosestSlotIndex(slotStartPoints, targetMs) {
   const points = Array.isArray(slotStartPoints) ? slotStartPoints : [];
   if (!points.length || !Number.isFinite(targetMs)) return 0;

   let lo = 0;
   let hi = points.length - 1;

   while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const midMs = Number(points[mid]?.ms);
      if (!Number.isFinite(midMs) || midMs >= targetMs) hi = mid;
      else lo = mid + 1;
   }

   let bestIdx = Math.max(0, Math.min(points.length - 1, lo));

   if (bestIdx > 0) {
      const currentMs = Number(points[bestIdx]?.ms);
      const prevMs = Number(points[bestIdx - 1]?.ms);
      if (
         Number.isFinite(currentMs) &&
         Number.isFinite(prevMs) &&
         Math.abs(targetMs - prevMs) <= Math.abs(currentMs - targetMs)
      ) {
         bestIdx -= 1;
      }
   }

   const resolved = Number(points[bestIdx]?.idx);
   return Number.isFinite(resolved) ? resolved : 0;
}

/* ================== Geometrie ================== */

export const CONTENT_PAD_TOP = 0;
export const CONTENT_PAD_BOTTOM = 4;

export function computeWorldHeight(slotsCount, slotHeight, slotGap) {
   if (!slotsCount) return 0;
   return (
      CONTENT_PAD_TOP +
      slotsCount * slotHeight +
      Math.max(0, slotsCount - 1) * slotGap +
      CONTENT_PAD_BOTTOM
   );
}

/* ================== Signatures (pentru redraw memo) ================== */

export function buildEventsSignatureForDay(events) {
   if (!Array.isArray(events) || !events.length) return "0";
   const cached = EVENTS_SIGNATURE_CACHE.get(events);
   if (cached) return cached;

   const simplified = events.map((ev) => {
      const id = ev?.id ?? ev?.raw?.id ?? "";
      const s =
         ev.start instanceof Date ? ev.start.getTime() : +new Date(ev.start);
      const e = ev.end instanceof Date ? ev.end.getTime() : +new Date(ev.end);
      const instId = ev.instructorId ?? ev.raw?.instructorId ?? "";
      const color = ev.color || "";
      return {
         id: String(id),
         s,
         e,
         instId: String(instId),
         color: String(color),
      };
   });

   simplified.sort((a, b) => {
      if (a.instId !== b.instId) return a.instId < b.instId ? -1 : 1;
      if (a.s !== b.s) return a.s - b.s;
      if (a.id !== b.id) return a.id < b.id ? -1 : 1;
      return 0;
   });

   let out = "";
   for (const ev of simplified) {
      out += `${ev.instId}:${ev.id}:${ev.s}-${ev.e}:${ev.color};`;
   }
   EVENTS_SIGNATURE_CACHE.set(events, out);
   return out;
}

export function buildSlotsSignature(slotGeoms) {
   if (!Array.isArray(slotGeoms) || !slotGeoms.length) return "0";
   const cached = SLOTS_SIGNATURE_CACHE.get(slotGeoms);
   if (cached) return cached;
   let out = "";
   for (const sg of slotGeoms) out += `${sg.index}:${sg.startMs}-${sg.endMs};`;
   SLOTS_SIGNATURE_CACHE.set(slotGeoms, out);
   return out;
}

export function buildBlockedSignature(blockedKeyMap, instructors) {
   if (!blockedKeyMap || !Array.isArray(instructors) || !instructors.length)
      return "0";

   const blockedIsObject =
      typeof blockedKeyMap === "object" && blockedKeyMap !== null;
   if (blockedIsObject) {
      const cachedByInstructors = BLOCKED_SIGNATURE_CACHE.get(blockedKeyMap);
      if (cachedByInstructors) {
         const cached = cachedByInstructors.get(instructors);
         if (cached) return cached;
      }
   }

   const ids = instructors
      .map((inst) => (inst && inst.id != null ? String(inst.id) : ""))
      .filter(Boolean)
      .sort();

   const parts = [];

   for (const id of ids) {
      const set = getBlockedSetForInstructor(blockedKeyMap, id);
      if (!set) continue;

      let arr;
      if (set instanceof Set) arr = Array.from(set);
      else if (Array.isArray(set)) arr = set.slice();
      else if (typeof set === "object") arr = Object.keys(set);
      else continue;

      arr = arr.map(String).sort();
      if (!arr.length) continue;

      parts.push(`${id}:${arr.join(",")}`);
   }

   const out = parts.join("|") || "0";

   if (blockedIsObject) {
      let cachedByInstructors = BLOCKED_SIGNATURE_CACHE.get(blockedKeyMap);
      if (!cachedByInstructors) {
         cachedByInstructors = new WeakMap();
         BLOCKED_SIGNATURE_CACHE.set(blockedKeyMap, cachedByInstructors);
      }
      cachedByInstructors.set(instructors, out);
   }

   return out;
}

export function buildWaitNotesSignature(waitNotes) {
   if (!waitNotes || typeof waitNotes !== "object") return "0";
   const cached = WAIT_NOTES_SIGNATURE_CACHE.get(waitNotes);
   if (cached) return cached;
   const keys = Object.keys(waitNotes);
   if (!keys.length) return "0";
   keys.sort();
   let out = "";
   for (const k of keys) {
      const val = waitNotes[k];
      const text = typeof val === "string" ? val : (val && val.text) || "";
      out += `${k}:${text};`;
   }
   WAIT_NOTES_SIGNATURE_CACHE.set(waitNotes, out);
   return out;
}

export function buildDayRenderModel({
   events = [],
   slotGeoms = [],
   overlapEventsByInst = null,
   canceledSlotKeysByInst = null,
} = {}) {
   const eventsSafe = Array.isArray(events) ? events : [];
   const slotGeomsSafe = Array.isArray(slotGeoms) ? slotGeoms : [];

   let eventsWithColor = LAST_EVENTS_WITH_COLOR;
   let eventsByInst = LAST_EVENTS_BY_INST;
   if (LAST_EVENTS_REF !== eventsSafe) {
      eventsWithColor = eventsSafe.map((ev) => {
         const token = normalizeEventColor(ev.color);
         const resolved = resolveColor(token);
         return {
            ...ev,
            _colorToken: token,
            _resolvedColor: resolved,
         };
      });

      eventsByInst = {};
      eventsWithColor.forEach((ev) => {
         let iid = "";
         if (ev.instructorId != null) iid = String(ev.instructorId);
         else if (ev.raw?.instructorId != null)
            iid = String(ev.raw.instructorId);
         else if (ev.raw?.instructor_id != null)
            iid = String(ev.raw.instructor_id);

         const padIndex =
            typeof ev._padColumnIndex === "number" ? ev._padColumnIndex : -1;
         const key = padIndex >= 0 ? `${iid}#${padIndex}` : `${iid}#default`;
         if (!eventsByInst[key]) eventsByInst[key] = [];
         eventsByInst[key].push(ev);
      });

      LAST_EVENTS_REF = eventsSafe;
      LAST_EVENTS_WITH_COLOR = eventsWithColor;
      LAST_EVENTS_BY_INST = eventsByInst;
   }

   let overlapMap;
   if (overlapEventsByInst && overlapEventsByInst instanceof Map) {
      overlapMap = overlapEventsByInst;
   } else if (LAST_OVERLAP_SOURCE_REF === eventsSafe) {
      overlapMap = LAST_OVERLAP_MAP || new Map();
   } else {
      overlapMap = new Map();
      eventsWithColor.forEach((ev) => {
         if (isCanceledReservation(ev)) return;
         let iid = "";
         if (ev.instructorId != null) iid = String(ev.instructorId);
         else if (ev.raw?.instructorId != null)
            iid = String(ev.raw.instructorId);
         else if (ev.raw?.instructor_id != null)
            iid = String(ev.raw.instructor_id);
         if (!iid) return;

         if (!overlapMap.has(iid)) overlapMap.set(iid, []);
         overlapMap.get(iid).push({
            start:
               ev.start instanceof Date ? ev.start : new Date(ev.start || 0),
            end: ev.end instanceof Date ? ev.end : new Date(ev.end || 0),
         });
      });
      LAST_OVERLAP_SOURCE_REF = eventsSafe;
      LAST_OVERLAP_MAP = overlapMap;
   }

   let canceledMap;
   if (canceledSlotKeysByInst && canceledSlotKeysByInst instanceof Map) {
      canceledMap = canceledSlotKeysByInst;
   } else if (LAST_CANCELED_SOURCE_REF === eventsSafe) {
      canceledMap = LAST_CANCELED_MAP || new Map();
   } else {
      canceledMap = new Map();
      eventsWithColor.forEach((ev) => {
         if (!isCanceledReservation(ev)) return;

         const raw = ev.raw || {};
         const instId = String(
            raw.instructorId ?? raw.instructor_id ?? ev.instructorId ?? "",
         );
         if (!instId) return;

         const start =
            ev.start instanceof Date ? ev.start : new Date(ev.start || 0);
         const startMs = start.getTime();
         if (!Number.isFinite(startMs)) return;

         const localKey = localKeyFromTs(start);
         if (!localKey) return;

         let set = canceledMap.get(instId);
         if (!set) {
            set = new Set();
            canceledMap.set(instId, set);
         }
         set.add(localKey);
      });
      LAST_CANCELED_SOURCE_REF = eventsSafe;
      LAST_CANCELED_MAP = canceledMap;
   }

   let slotIndexByLabel = LAST_SLOT_INDEX_BY_LABEL;
   let slotIndexByStartMs = LAST_SLOT_INDEX_BY_START_MS;
   let slotStartPoints = LAST_SLOT_START_POINTS;
   if (
      LAST_SLOT_GEOMS_REF !== slotGeomsSafe ||
      !slotIndexByLabel ||
      !slotIndexByStartMs ||
      !slotStartPoints
   ) {
      slotIndexByLabel = new Map();
      slotIndexByStartMs = new Map();
      slotStartPoints = [];
      slotGeomsSafe.forEach((sg, idx) => {
         if (sg.label) slotIndexByLabel.set(sg.label, idx);
         const startMs = Number(sg?.startMs);
         if (Number.isFinite(startMs)) {
            if (!slotIndexByStartMs.has(startMs)) slotIndexByStartMs.set(startMs, idx);
            slotStartPoints.push({ ms: startMs, idx });
         }
      });
      slotStartPoints.sort((a, b) => a.ms - b.ms);
      LAST_SLOT_GEOMS_REF = slotGeomsSafe;
      LAST_SLOT_INDEX_BY_LABEL = slotIndexByLabel;
      LAST_SLOT_INDEX_BY_START_MS = slotIndexByStartMs;
      LAST_SLOT_START_POINTS = slotStartPoints;
   }

   if (
      LAST_EVENT_LAYOUT_EVENTS_REF !== eventsSafe ||
      LAST_EVENT_LAYOUT_SLOTS_REF !== slotGeomsSafe
   ) {
      const maxSlotIdx = Math.max(0, slotGeomsSafe.length - 1);
      eventsWithColor.forEach((ev) => {
         const raw = ev?.raw || {};
         const displayStart =
            ev.start instanceof Date ? ev.start : new Date(ev.start || 0);
         const displayStartMs = displayStart.getTime();
         const hasValidStartMs = Number.isFinite(displayStartMs);
         const timeText = hasValidStartMs ? formatHHMM(displayStart) : "";

         let slotIdx;
         if (typeof ev._padSlotIndex === "number") {
            slotIdx = ev._padSlotIndex;
         } else {
            if (timeText) slotIdx = slotIndexByLabel.get(timeText);
            if (slotIdx == null && hasValidStartMs) {
               slotIdx = slotIndexByStartMs.get(displayStartMs);
            }
            if (slotIdx == null && hasValidStartMs) {
               slotIdx = findClosestSlotIndex(slotStartPoints, displayStartMs);
            }
            if (!Number.isFinite(slotIdx)) slotIdx = 0;
            slotIdx = Math.max(0, Math.min(maxSlotIdx, Number(slotIdx)));
         }

         const isFavorite = raw.isFavorite === true;
         const isImportant = raw.isImportant === true;
         const statusMarks = [];
         if (isFavorite) statusMarks.push("⁂");
         if (isImportant) statusMarks.push("‼");
         const statusEmoji = statusMarks.join(" - ");

         const fallbackName =
            raw?.clientName ||
            raw?.customerName ||
            raw?.name ||
            ev.title ||
            "Programare";
         const person = (
            `${ev.studentFirst || ""} ${ev.studentLast || ""}`.trim() ||
            fallbackName
         ).trim();

         const noteFromEvent = (ev.eventPrivateMessage || "").toString().trim();
         const noteFromProfile = (getStudentPrivateMessageFromEv(ev) || "")
            .toString()
            .trim();
         const notesJoined = [noteFromEvent, noteFromProfile]
            .filter(Boolean)
            .join("; ");
         const notesCompact = notesJoined
            ? notesJoined.replace(/\s+/g, " ").trim()
            : "";

         const metaLineBase = [timeText, ev.gearboxLabel, statusEmoji]
            .filter(Boolean)
            .join(" · ");
         const eventIdStr = String(ev.id ?? "");
         const reservationId = raw?.id ?? ev?.raw?.id ?? ev?.id ?? null;
         const reservationIdStr =
            reservationId != null ? String(reservationId) : "";

         ev._displayStart = hasValidStartMs ? displayStart : null;
         ev._timeText = timeText;
         ev._slotIndex = Number(slotIdx);
         ev._statusEmoji = statusEmoji;
         ev._metaLineBase = metaLineBase;
         ev._studentPhone = getStudentPhoneFromEv(ev) || "";
         ev._person = person || "";
         ev._notesCompact = notesCompact;
         ev._eventIdStr = eventIdStr;
         ev._reservationId = reservationId;
         ev._reservationIdStr = reservationIdStr;
      });

      LAST_EVENT_LAYOUT_EVENTS_REF = eventsSafe;
      LAST_EVENT_LAYOUT_SLOTS_REF = slotGeomsSafe;
   }

   return {
      eventsWithColor,
      eventsByInst,
      overlapMap,
      canceledMap,
      slotIndexByLabel,
   };
}

/* ================== DRAW ================== */

export function drawAll({
   ctx,
   width,
   height,
   hoursColWidth,
   headerHeight,
   colWidth,
   colGap,
   colsCount,
   colsPerRow,
   rowsCount,
   rowGap,
   rowHeights,
   instructors,
   events,
   slotGeoms,
   slotHeight,
   slotGap,
   hitMap,
   blockedKeyMap,
   highlightEventId,
   highlightSlot = null,
   zoom = 1,
   preGrid = null,
   preGridWidth = 0,
   waitNotesMap = null,
   editingWait = null,
   overlapEventsByInst = null,
   canceledSlotKeysByInst = null,
   presenceReservationIds = null, // Set<string> | string[] | { [id]: true }
   presenceByReservationColors = null,
   desiredInstructorBadgeByUserId = null, // Map<userId, "AB"> sau object
   presenceColorsByReservation = null,
   createDraftBySlotUsers = null,
   createDraftBySlotColors = null,
   activeSearchEventId = null,
   denseMode = false,
   ultraFastMode = false,
   dayRenderModel = null,
   visibleRowStart = 0,
   visibleRowEnd = null,
   visibleColStart = 0,
   visibleColEnd = null,
   includeEventPayloadInHitMap = true,
   paintStatic = true,
   paintDynamic = true,
   clearCanvas = true,
}) {
   if (!ctx || !width || !height) return;

   const slotsCount = slotGeoms.length || 0;
   const worldHeight = computeWorldHeight(slotsCount, slotHeight, slotGap);

   const effectiveRowHeights =
      rowHeights && rowHeights.length
         ? rowHeights
         : new Array(rowsCount).fill(worldHeight);

   const maxWorldHeight = effectiveRowHeights.reduce(
      (max, h) => (h > max ? h : max),
      worldHeight,
   );

   const resolvedModel =
      dayRenderModel && typeof dayRenderModel === "object"
         ? dayRenderModel
         : buildDayRenderModel({
              events,
              slotGeoms,
              overlapEventsByInst,
              canceledSlotKeysByInst,
           });
   const eventsByInst =
      resolvedModel?.eventsByInst && typeof resolvedModel.eventsByInst === "object"
         ? resolvedModel.eventsByInst
         : {};
   const overlapMap =
      resolvedModel?.overlapMap instanceof Map
         ? resolvedModel.overlapMap
         : new Map();
   const canceledMap =
      resolvedModel?.canceledMap instanceof Map
         ? resolvedModel.canceledMap
         : new Map();
   const baseBg = resolveColor("--black-p");
   const emptySlotBgPads = resolveColor(NO_COLOR_TOKEN);
   const emptySlotBgDefault = resolveColor(DEFAULT_EVENT_COLOR_TOKEN);

   const emptySlotTextColor = resolveColor("--white-s");
   const blackoutFillColor = resolveColor("--event-red");
   const eventTextColor = resolveColor("--white-p");
   const activeBorderColor = resolveColor("--white-p");

   const cancelSlotBgColor = resolveColor("--event-yellow");
   const cancelSlotTextColor = resolveColor("--white-p");

   const z = zoom || 1;
   const isDense = !!denseMode;
   const isUltraFast = !!ultraFastMode;
   const fontScale = Math.max(0.6, Math.min(1.6, z));
   const fontMetaPx = 11 * fontScale;
   const fontNotesPx = 10 * fontScale;
   const padX = 8 * fontScale;
   const padY = 6 * fontScale;
   const lineHeight = 13 * fontScale;

   const BASE_EVENT_RADIUS = 18;
   const BASE_COL_DELTA = 4;
   const BASE_BORDER_DELTA = -1;

   const eventRadius = BASE_EVENT_RADIUS * fontScale;
   const columnRadius = eventRadius + BASE_COL_DELTA * fontScale;
   const slotRadius = eventRadius;
   const eventBorderRadius = Math.max(
      0,
      eventRadius + BASE_BORDER_DELTA * fontScale,
   );

   const hasPreGrid =
      preGrid && preGrid.columns > 0 && preGrid.rows > 0 && colWidth > 0;
   const preCols = hasPreGrid ? preGrid.columns : 0;
   const preRows = hasPreGrid ? preGrid.rows : 0;

   // index global pentru coloanele de tip "Asteptari"
   let waitPadCounter = 0;

   ctx.save();
   if (clearCanvas) ctx.clearRect(0, 0, width, height);

   // preGrid placeholder
   if (paintStatic && hasPreGrid && preCols > 0 && preRows > 0) {
      const rowTop = 0;
      const colHeight = headerHeight + maxWorldHeight;
      const slotAreaTopGlobal = rowTop + headerHeight + CONTENT_PAD_TOP;

      for (let pgCol = 0; pgCol < preCols; pgCol++) {
         const colX = hoursColWidth + pgCol * (colWidth + colGap);
         const w = colWidth;

         ctx.save();
         const grad = ctx.createLinearGradient(
            0,
            rowTop,
            0,
            rowTop + colHeight,
         );
         grad.addColorStop(0, baseBg);
         grad.addColorStop(0.1, baseBg);
         grad.addColorStop(1, baseBg);
         ctx.fillStyle = grad;
         drawRoundRect(ctx, colX, rowTop, w, colHeight, columnRadius);
         ctx.fill();
         ctx.restore();

         for (let pgRow = 0; pgRow < preRows; pgRow++) {
            let cellY;
            let cellH = slotHeight;

            if (slotGeoms.length >= preRows) {
               const sg = slotGeoms[pgRow];
               const idx = sg.index;
               cellY = slotAreaTopGlobal + idx * (slotHeight + slotGap);
            } else {
               const usableH =
                  maxWorldHeight - CONTENT_PAD_TOP - CONTENT_PAD_BOTTOM;
               const totalGaps = Math.max(0, preRows - 1) * slotGap;
               const hPer = preRows > 0 ? (usableH - totalGaps) / preRows : 0;
               cellY = slotAreaTopGlobal + pgRow * (hPer + slotGap);
               cellH = hPer || slotHeight;
            }

            if (cellY > height || cellY + cellH < 0) continue;

            ctx.save();
            ctx.fillStyle = emptySlotBgDefault;
            drawRoundRect(ctx, colX + 4, cellY, w - 8, cellH, slotRadius);
            ctx.fill();
            ctx.restore();
         }
      }
   }

   const highlightEventIdForRender = highlightEventId;
   const activeSearchEventIdStr =
      activeSearchEventId != null ? String(activeSearchEventId) : null;
   const drawRowStart = Math.max(0, Number(visibleRowStart || 0));
   const drawRowEnd = Number.isFinite(visibleRowEnd)
      ? Math.min(rowsCount - 1, Number(visibleRowEnd))
      : rowsCount - 1;
   const drawColStart = Math.max(0, Number(visibleColStart || 0));
   const drawColEnd = Number.isFinite(visibleColEnd)
      ? Math.min(colsPerRow - 1, Number(visibleColEnd))
      : colsPerRow - 1;
   const hasDraftSlotOverlay =
      !!createDraftBySlotColors &&
      (createDraftBySlotColors instanceof Map
         ? createDraftBySlotColors.size > 0
         : Array.isArray(createDraftBySlotColors)
            ? createDraftBySlotColors.length > 0
            : typeof createDraftBySlotColors === "object"
               ? Object.keys(createDraftBySlotColors).length > 0
               : false);
   const hasHighlightedSlot = !!(
      highlightSlot &&
      highlightSlot.instructorId != null &&
      highlightSlot.slotStart
   );
   const needsDynamicSlotPass = !!(
      paintDynamic && (hasDraftSlotOverlay || hasHighlightedSlot)
   );
   const needsSlotPass = !!(paintStatic || !!hitMap || needsDynamicSlotPass);
   const shouldCheckRealSlotOccupancy = !!(paintDynamic || !!hitMap);

   let currentRowTop = 0;

   for (let row = 0; row < rowsCount; row++) {
      const rowHeight = effectiveRowHeights[row] ?? worldHeight;
      const rowTop = currentRowTop;
      const rowContentTop = rowTop + headerHeight;

      if (row < drawRowStart || row > drawRowEnd) {
         currentRowTop += headerHeight + rowHeight + rowGap;
         continue;
      }

      const rowStartIdx = row * colsPerRow;
      const colsInThisRow = Math.min(
         colsPerRow,
         Math.max(0, colsCount - rowStartIdx),
      );

      const slotAreaTop = rowContentTop + CONTENT_PAD_TOP;

      for (let c = 0; c < colsInThisRow; c++) {
         if (c < drawColStart || c > drawColEnd) continue;
         const instIdx = rowStartIdx + c;
         const inst = instructors[instIdx];
         if (!inst) continue;

         const colX = hoursColWidth + preGridWidth + c * (colWidth + colGap);
         const w = colWidth;

         const instId = String(inst.id ?? "");
         const instPadIndex =
            typeof inst._padColumnIndex === "number"
               ? inst._padColumnIndex
               : -1;
         const instKey =
            instPadIndex >= 0
               ? `${instId}#${instPadIndex}`
               : `${instId}#default`;

         const instEvents = eventsByInst[instKey] || [];
         const overlapEventsForInst =
            overlapMap && instId ? overlapMap.get(instId) || [] : instEvents;

         const instBlockedSet = getBlockedSetForInstructor(
            blockedKeyMap,
            instId,
         );

         const instCanceledSet =
            canceledMap && canceledMap.get && instId
               ? canceledMap.get(instId) || null
               : null;

         const isPadCol = instId.startsWith("__pad_");
         const instNameLower = String(inst.name || "").toLowerCase();
         const padType = inst._padType || null;

         const isCancelPad =
            padType === "cancel" ||
            (isPadCol &&
               (instId === "__pad_1" || instNameLower.includes("anular")));

         const isLateralPad =
            padType === "lateral" ||
            (isPadCol &&
               (instId === LATERAL_PAD_ID || instNameLower.includes("later")));

         const isWaitPad =
            padType === "wait" || (isPadCol && !isCancelPad && !isLateralPad);

         let maxSlotsForThisColumn;
         if (isCancelPad) {
            maxSlotsForThisColumn = Math.min(
               CANCEL_SLOTS_PER_COLUMN,
               slotGeoms.length,
            );
         } else if (isLateralPad) {
            maxSlotsForThisColumn = Math.min(
               LATERAL_SLOTS_PER_COLUMN,
               slotGeoms.length,
            );
         } else if (isWaitPad) {
            maxSlotsForThisColumn = Math.min(
               WAIT_SLOTS_PER_COLUMN,
               slotGeoms.length,
            );
         } else {
            maxSlotsForThisColumn = slotGeoms.length;
         }

         const worldHeightForColumn = isPadCol
            ? computeWorldHeight(maxSlotsForThisColumn, slotHeight, slotGap)
            : worldHeight;

         if (paintStatic) {
            // column bg gradient
            ctx.save();

            const sectorSlug = (inst.sectorSlug || "").toString().toLowerCase();
            let colTopColor = baseBg;
            let colBottomColor = baseBg;

            if (sectorSlug.includes("botanica"))
               colBottomColor = resolveColor("--event-blue");
            else if (sectorSlug.includes("ciocana"))
               colBottomColor = resolveColor("--event-pink");
            else if (sectorSlug.includes("buiucani"))
               colBottomColor = resolveColor("--event-green");

            const colHeight = headerHeight + worldHeightForColumn;

            const grad = ctx.createLinearGradient(
               0,
               rowTop,
               0,
               rowTop + colHeight,
            );
            grad.addColorStop(0, colBottomColor);
            grad.addColorStop(0.1, colTopColor);
            grad.addColorStop(1, colTopColor);

            ctx.fillStyle = grad;
            drawRoundRect(ctx, colX, rowTop, w, colHeight, columnRadius);
            ctx.fill();
            ctx.restore();
         }

         let waitPadIndex = null;
         if (isWaitPad) waitPadIndex = waitPadCounter++;

         if (needsSlotPass) {
            // draw empty slots
            for (let si = 0; si < maxSlotsForThisColumn; si++) {
            const sg = slotGeoms[si];
            if (!sg) break;

            const idx = sg.index;
            const slotY = slotAreaTop + idx * (slotHeight + slotGap);
            const slotH = slotHeight;
            const slotX = colX + 4;
            const slotW = w - 8;

            if (slotY > height || slotY + slotH < 0) continue;

            // base slot values
            let slotStartDate = sg.slot?.start || null;
            let slotEndDate = sg.slot?.end || null;
            let slotStartMs = sg.startMs;
            let slotEndMs = sg.endMs;
            let slotLabelText = sg.label || "";

            // Laterala uses virtual times
            if (isLateralPad) {
               const lateralIdx = si;
               const mark =
                  LATERAL_TIME_MARKS[lateralIdx] ||
                  LATERAL_TIME_MARKS[LATERAL_TIME_MARKS.length - 1] ||
                  slotLabelText ||
                  "00:00";

               const baseDaySource =
                  (slotGeoms[0] &&
                     slotGeoms[0].slot &&
                     slotGeoms[0].slot.start) ||
                  slotStartDate;

               const virtual = baseDaySource
                  ? buildVirtualSlotForDayHHMM(baseDaySource, mark)
                  : null;

               slotLabelText = mark;

               if (virtual && virtual.start && virtual.end) {
                  slotStartDate = virtual.start;
                  slotEndDate = virtual.end;
                  slotStartMs = virtual.start.getTime();
                  slotEndMs = virtual.end.getTime();
               }
            }

            // Pentru layerul static putem păstra sloturile sub evenimente;
            // în layerul dinamic/hitmap continuăm să le ascundem când sunt ocupate.
            const isOccupiedRealSlot = !!(
               shouldCheckRealSlotOccupancy &&
               !isPadCol &&
               slotStartMs &&
               slotEndMs &&
               slotOverlapsEvents(slotStartMs, slotEndMs, overlapEventsForInst)
            );
            if (isOccupiedRealSlot) {
               continue;
            }

            const slotKey = slotStartDate
               ? localKeyFromTs(slotStartDate)
               : null;

            const isSlot19_30 = slotLabelText === "19:30";

            let isBlocked = false;

            if (instBlockedSet && slotKey) {
               if (instBlockedSet instanceof Set)
                  isBlocked = instBlockedSet.has(slotKey);
               else if (Array.isArray(instBlockedSet))
                  isBlocked = instBlockedSet.includes(slotKey);
               else if (typeof instBlockedSet === "object") {
                  if (instBlockedSet[slotKey]) isBlocked = true;
                  else if (slotStartDate) {
                     const iso = new Date(slotStartDate).toISOString();
                     if (instBlockedSet[iso]) isBlocked = true;
                  }
               }
            }

            if (isSlot19_30) isBlocked = false;

            const isCancelledHere = !!(
               instCanceledSet &&
               slotKey &&
               instCanceledSet.has &&
               instCanceledSet.has(slotKey)
            );

            const slotBaseBg =
               isWaitPad || isLateralPad || isCancelPad
                  ? emptySlotBgPads
                  : emptySlotBgDefault;

            let fillColor = slotBaseBg;

            if (isCancelledHere) fillColor = cancelSlotBgColor;
            else if (isBlocked || isSlot19_30) fillColor = blackoutFillColor;

            let shouldDrawText = true;
            let waitSlotGlobalIndex = null;

            if (isCancelPad) shouldDrawText = false;

            if (isCancelledHere) {
               slotLabelText = slotLabelText
                  ? `${slotLabelText} • Anulat`
                  : "• Anulat";
            }

            if (isWaitPad) {
               const localIdx = si;
               waitSlotGlobalIndex =
                  waitPadIndex != null
                     ? waitPadIndex * WAIT_SLOTS_PER_COLUMN + localIdx
                     : localIdx;

               const key1 = String(waitSlotGlobalIndex);
               const fromMap =
                  waitNotesMap && typeof waitNotesMap === "object"
                     ? waitNotesMap[key1] || waitNotesMap[waitSlotGlobalIndex]
                     : "";

               slotLabelText = fromMap || WAIT_PLACEHOLDER_TEXT;

               if (
                  editingWait &&
                  String(editingWait.instId) === instId &&
                  Number(editingWait.slotIndex) === waitSlotGlobalIndex
               ) {
                  shouldDrawText = false;
               }
            }

            const isHighlightedSlot =
               highlightSlot &&
               String(highlightSlot.instructorId) === instId &&
               slotStartDate &&
               highlightSlot.slotStart === slotStartDate.toISOString();

            if (paintStatic) {
               ctx.save();
               ctx.fillStyle = fillColor;
               drawRoundRect(ctx, slotX, slotY, slotW, slotH, slotRadius);
               ctx.fill();

               // text
               let slotTextColor = emptySlotTextColor;
               if (isCancelledHere) slotTextColor = cancelSlotTextColor;

               ctx.fillStyle = slotTextColor;
               ctx.font = `${fontMetaPx}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
               ctx.textBaseline = "top";

               if (shouldDrawText && slotLabelText) {
                  const maxTextWidth = Math.max(0, slotW - padX * 2);
                  const lines = wrapText(
                     ctx,
                     slotLabelText,
                     maxTextWidth,
                     isDense ? 1 : 5,
                  );
                  for (let li = 0; li < lines.length; li++) {
                     ctx.fillText(
                        lines[li],
                        slotX + padX,
                        slotY + padY + li * lineHeight,
                     );
                  }
               }
               ctx.restore();
            }

            if (paintDynamic) {
               // CREATE-DRAFT overlay (slot gol)
               if (
                  createDraftBySlotColors &&
                  !isPadCol &&
                  slotStartDate instanceof Date &&
                  !isNaN(slotStartDate)
               ) {
                  const draftKey = `${instId}|${slotStartDate.toISOString()}`;
                  const draftColors = getPresenceColorsForId(
                     createDraftBySlotColors,
                     draftKey,
                  );
                  const isCreatingHere =
                     Array.isArray(draftColors) && draftColors.length;

                  if (isCreatingHere) {
                     ctx.save();
                     ctx.fillStyle = "rgba(0,0,0,0.65)";
                     drawRoundRect(
                        ctx,
                        slotX + 1,
                        slotY + 1,
                        slotW - 2,
                        slotH - 2,
                        slotRadius,
                     );
                     ctx.fill();

                     ctx.fillStyle = "#fff";
                     ctx.textBaseline = "top";
                     ctx.font = `bold ${Math.max(
                        11,
                        12 * fontScale,
                     )}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
                     ctx.fillText(
                        "CREARE",
                        slotX + 8 * fontScale,
                        slotY + 6 * fontScale,
                     );

                     drawPresenceBorder(
                        ctx,
                        slotX,
                        slotY,
                        slotW,
                        slotH,
                        draftColors,
                        slotRadius,
                     );
                     ctx.restore();
                  }
               }

               if (isHighlightedSlot) {
                  ctx.save();
                  ctx.lineWidth = 2;
                  ctx.strokeStyle = activeBorderColor;
                  drawRoundRect(
                     ctx,
                     slotX + 1,
                     slotY + 1,
                     slotW - 2,
                     slotH - 2,
                     Math.max(0, slotRadius - 1.5 * fontScale),
                  );
                  ctx.stroke();
                  ctx.restore();
               }
            }

            // hitMap
            if (hitMap && slotStartDate && slotEndDate) {
               if ((!isPadCol || isLateralPad) && !isCancelledHere) {
                  hitMap.push({
                     x: slotX,
                     y: slotY,
                     w: slotW,
                     h: slotH,
                     kind: "empty-slot",
                     instructorId: instId,
                     instIdx,
                     slotStart: slotStartDate.toISOString(),
                     slotEnd: slotEndDate.toISOString(),
                  });
               } else if (isWaitPad) {
                  const localIdx = si;
                  const globalIdx =
                     waitPadIndex != null
                        ? waitPadIndex * WAIT_SLOTS_PER_COLUMN + localIdx
                        : idx;

                  hitMap.push({
                     x: slotX,
                     y: slotY,
                     w: slotW,
                     h: slotH,
                     kind: "wait-slot",
                     instructorId: instId,
                     instIdx,
                     slotIndex: globalIdx,
                     slotStart: slotStartDate.toISOString(),
                     slotEnd: slotEndDate.toISOString(),
                  });
               }
            }
            }
         }

         // draw events
         if (paintDynamic) {
            for (const ev of instEvents) {
            const slotIdx = Number.isFinite(Number(ev._slotIndex))
               ? Number(ev._slotIndex)
               : 0;

            const cardX = colX + 4;
            const cardY = slotAreaTop + slotIdx * (slotHeight + slotGap);
            const cardW = w - 8;
            const cardH = slotHeight;

            if (
               cardX + cardW < hoursColWidth ||
               cardX > width ||
               cardY > height ||
               cardY + cardH < 0
            ) {
               continue;
            }

            const color =
               ev._resolvedColor || resolveColor(normalizeEventColor(ev.color));
            const raw = ev.raw || {};
            const isOptimistic = !!(
               raw?._optimistic ??
               raw?._optimisticPending ??
               ev?._optimistic ??
               ev?._optimisticPending
            );
            const studentPhone = ev._studentPhone || getStudentPhoneFromEv(ev);
            const reservationId =
               ev._reservationId ?? raw?.id ?? ev?.raw?.id ?? ev?.id ?? null;
            const reservationIdStr =
               ev._reservationIdStr || (reservationId != null ? String(reservationId) : "");

            const isHighlighted =
               highlightEventIdForRender &&
               String(ev.id) === String(highlightEventIdForRender);
            const eventIdStr = ev._eventIdStr || String(ev.id ?? "");
            const isActiveSearchMatch =
               !!eventIdStr &&
               activeSearchEventIdStr != null &&
               eventIdStr === activeSearchEventIdStr;

            ctx.save();

            ctx.fillStyle = color;
            drawRoundRect(ctx, cardX, cardY, cardW, cardH, eventRadius);
            ctx.fill();

            if (isOptimistic) {
               ctx.save();
               ctx.lineWidth = 1.5;
               ctx.strokeStyle = "rgba(255,255,255,0.78)";
               ctx.setLineDash([5, 4]);
               drawRoundRect(
                  ctx,
                  cardX + 1,
                  cardY + 1,
                  cardW - 2,
                  cardH - 2,
                  eventBorderRadius,
               );
               ctx.stroke();
               ctx.restore();
            }

            const paddingX = padX;
            const textX = cardX + paddingX;
            let textY = cardY + padY;
            const lineH = lineHeight;
            const maxTextWidth = Math.max(0, cardW - paddingX * 2);

            ctx.save();
            ctx.beginPath();
            ctx.rect(cardX, cardY, cardW, cardH);
            ctx.clip();

            ctx.fillStyle = eventTextColor;
            ctx.textBaseline = "top";
            ctx.font = `${fontMetaPx}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;

            const displayStart = ev._displayStart || ev.start;
            const timeText = ev._timeText || formatHHMM(displayStart);

            if (isUltraFast) {
               const fastLine = [timeText, ev.gearboxLabel].filter(Boolean).join(" · ");
               if (fastLine) ctx.fillText(fastLine, textX, textY);
            } else {
               const statusEmoji = ev._statusEmoji || "";

               // ✅ userId din rezervare
               const userIdForBadge = raw?.userId ?? null;

               // ✅ badge "AB"
               let desiredBadge = "";
               if (userIdForBadge != null && desiredInstructorBadgeByUserId) {
                  const k = String(userIdForBadge);

                  if (desiredInstructorBadgeByUserId instanceof Map) {
                     desiredBadge = desiredInstructorBadgeByUserId.get(k) || "";
                  } else if (typeof desiredInstructorBadgeByUserId === "object") {
                     desiredBadge = desiredInstructorBadgeByUserId[k] || "";
                  }
               }

               const metaLineBase =
                  ev._metaLineBase ||
                  [timeText, ev.gearboxLabel, statusEmoji].filter(Boolean).join(" · ");
               const metaLine = desiredBadge
                  ? metaLineBase
                     ? `${metaLineBase} · ${desiredBadge}`
                     : desiredBadge
                  : metaLineBase;
               const person = ev._person || "";

               if (isDense) {
                  const compact = [metaLine, person, studentPhone]
                     .filter(Boolean)
                     .join(" · ");
                  if (compact) {
                     const compactLines = wrapText(ctx, compact, maxTextWidth, 2);
                     for (const line of compactLines) {
                        ctx.fillText(line, textX, textY);
                        textY += lineH;
                     }
                  }
               } else {
                  const bothNotes = ev._notesCompact || "";
                  const textBlock = [metaLine, person, studentPhone, bothNotes]
                     .filter(Boolean)
                     .join("\n");

                  if (textBlock) {
                     const blockRows = textBlock.split("\n").filter(Boolean);
                     for (const row of blockRows) {
                        const isMetaRow = row === metaLine;
                        const isPhoneRow = row === studentPhone;
                        const isNotesRow = row === bothNotes;
                        const rowMaxLines = isMetaRow || isPhoneRow ? 1 : 2;

                        ctx.font = `${
                           isNotesRow ? fontNotesPx : fontMetaPx
                        }px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;

                        const wrappedRows = wrapText(
                           ctx,
                           row,
                           maxTextWidth,
                           rowMaxLines,
                        );
                        for (const line of wrappedRows) {
                           ctx.fillText(line, textX, textY);
                           textY += lineH;
                        }
                     }
                  }
               }
            }

            ctx.restore();

            /* ✅ presence border (outer) */
            const presenceColors = getPresenceColorsForId(
               presenceByReservationColors,
               reservationId,
            );

            if (presenceColors && presenceColors.length) {
               drawPresenceBorder(
                  ctx,
                  cardX,
                  cardY,
                  cardW,
                  cardH,
                  presenceColors,
                  eventRadius,
               );
            }

            if (isHighlighted) {
               ctx.lineWidth = 2;
               ctx.strokeStyle = activeBorderColor;
               drawRoundRect(
                  ctx,
                  cardX + 1,
                  cardY + 1,
                  cardW - 2,
                  cardH - 2,
                  eventBorderRadius,
               );
               ctx.stroke();
            }

            if (isActiveSearchMatch) {
               ctx.lineWidth = 3;
               ctx.strokeStyle = activeBorderColor;
               drawRoundRect(
                  ctx,
                  cardX + 1,
                  cardY + 1,
                  cardW - 2,
                  cardH - 2,
                  eventBorderRadius,
               );
               ctx.stroke();
            }

            ctx.restore();
            // ✅ DEBUG: overlay negru dacă rezervarea e în editare (presence)
            const rid = reservationIdStr;

            const isEditing =
               !!rid &&
               (presenceReservationIds instanceof Set
                  ? presenceReservationIds.has(rid)
                  : Array.isArray(presenceReservationIds)
                    ? presenceReservationIds.includes(rid)
                    : presenceReservationIds &&
                        typeof presenceReservationIds === "object"
                      ? !!presenceReservationIds[rid]
                      : false);

            if (isEditing) {
               ctx.save();

               ctx.fillStyle = "rgba(0,0,0,0.65)";
               drawRoundRect(
                  ctx,
                  cardX + 1,
                  cardY + 1,
                  cardW - 2,
                  cardH - 2,
                  eventRadius,
               );
               ctx.fill();

               ctx.fillStyle = "#fff";
               ctx.textBaseline = "top";
               ctx.font = `bold ${Math.max(
                  11,
                  12 * fontScale,
               )}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
               ctx.fillText(
                  "EDITARE",
                  cardX + 8 * fontScale,
                  cardY + 6 * fontScale,
               );

               ctx.restore();
            }

            if (hitMap) {
               const hitItem = {
                  x: cardX,
                  y: cardY,
                  w: cardW,
                  h: cardH,
                  kind: "reservation",
                  reservationId,
               };
               if (includeEventPayloadInHitMap || reservationId == null)
                  hitItem.ev = ev;
               hitMap.push(hitItem);
            }
            }
         }
      }

      currentRowTop += headerHeight + rowHeight + rowGap;
   }

   ctx.restore();
}
