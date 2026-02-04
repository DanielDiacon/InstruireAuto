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
}

function resolveColor(color) {
   if (!color) return "#616161";

   if (typeof window === "undefined" || typeof document === "undefined") {
      return color;
   }

   const cached = COLOR_CACHE.get(color);
   if (cached) return cached;

   const root = getColorRoot();
   if (!root) {
      COLOR_CACHE.set(color, color);
      return color;
   }

   let result = color;

   if (color.startsWith("var(")) {
      const name = color.slice(4, -1).trim();
      const val = getComputedStyle(root).getPropertyValue(name).trim();
      result = val || "#616161";
   } else if (color.startsWith("--")) {
      const val = getComputedStyle(root).getPropertyValue(color).trim();
      result = val || "#616161";
   }

   COLOR_CACHE.set(color, result);
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
   fontScale = 1
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

   return lines;
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
   return out;
}

export function buildSlotsSignature(slotGeoms) {
   if (!Array.isArray(slotGeoms) || !slotGeoms.length) return "0";
   let out = "";
   for (const sg of slotGeoms) out += `${sg.index}:${sg.startMs}-${sg.endMs};`;
   return out;
}

export function buildBlockedSignature(blockedKeyMap, instructors) {
   if (!blockedKeyMap || !Array.isArray(instructors) || !instructors.length)
      return "0";

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

   return parts.join("|") || "0";
}

export function buildWaitNotesSignature(waitNotes) {
   if (!waitNotes || typeof waitNotes !== "object") return "0";
   const keys = Object.keys(waitNotes);
   if (!keys.length) return "0";
   keys.sort();
   let out = "";
   for (const k of keys) {
      const val = waitNotes[k];
      const text = typeof val === "string" ? val : (val && val.text) || "";
      out += `${k}:${text};`;
   }
   return out;
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
      worldHeight
   );

   const eventsWithColor = (events || []).map((ev) => {
      const token = normalizeEventColor(ev.color);
      const resolved = resolveColor(token);
      return {
         ...ev,
         _colorToken: token,
         _resolvedColor: resolved,
      };
   });

   // grupare după instructor + pad column index
   const eventsByInst = {};
   eventsWithColor.forEach((ev) => {
      let iid = "";
      if (ev.instructorId != null) iid = String(ev.instructorId);
      else if (ev.raw?.instructorId != null) iid = String(ev.raw.instructorId);
      else if (ev.raw?.instructor_id != null)
         iid = String(ev.raw.instructor_id);

      const padIndex =
         typeof ev._padColumnIndex === "number" ? ev._padColumnIndex : -1;
      const key = padIndex >= 0 ? `${iid}#${padIndex}` : `${iid}#default`;
      if (!eventsByInst[key]) eventsByInst[key] = [];
      eventsByInst[key].push(ev);
   });

   // hartă ocupare reală pe instructor (Map instId -> [{start,end}])
   let overlapMap;
   if (overlapEventsByInst && overlapEventsByInst instanceof Map) {
      overlapMap = overlapEventsByInst;
   } else {
      overlapMap = new Map();
      eventsWithColor.forEach((ev) => {
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
   }

   const slotIndexByLabel = new Map();
   slotGeoms.forEach((sg, idx) => {
      if (sg.label) slotIndexByLabel.set(sg.label, idx);
   });

   const baseBg = resolveColor("--black-p");
   const emptySlotBgPads = resolveColor(NO_COLOR_TOKEN);
   const emptySlotBgDefault = resolveColor(DEFAULT_EVENT_COLOR_TOKEN);

   const emptySlotTextColor = resolveColor("--white-s");
   const blackoutFillColor = resolveColor("--event-red");
   const blackoutBorderColor = baseBg;
   const eventTextColor = resolveColor("--white-p");
   const activeBorderColor = resolveColor("--white-p");

   const cancelSlotBgColor = resolveColor("--event-yellow");
   const cancelSlotTextColor = resolveColor("--black-p");

   const z = zoom || 1;
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
      eventRadius + BASE_BORDER_DELTA * fontScale
   );

   const hasPreGrid =
      preGrid && preGrid.columns > 0 && preGrid.rows > 0 && colWidth > 0;
   const preCols = hasPreGrid ? preGrid.columns : 0;
   const preRows = hasPreGrid ? preGrid.rows : 0;

   // index global pentru coloanele de tip "Asteptari"
   let waitPadCounter = 0;

   ctx.save();
   ctx.clearRect(0, 0, width, height);

   // preGrid placeholder
   if (hasPreGrid && preCols > 0 && preRows > 0) {
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
            rowTop + colHeight
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

   let currentRowTop = 0;

   for (let row = 0; row < rowsCount; row++) {
      const rowHeight = effectiveRowHeights[row] ?? worldHeight;
      const rowTop = currentRowTop;
      const rowContentTop = rowTop + headerHeight;

      const rowStartIdx = row * colsPerRow;
      const colsInThisRow = Math.min(
         colsPerRow,
         Math.max(0, colsCount - rowStartIdx)
      );

      const slotAreaTop = rowContentTop + CONTENT_PAD_TOP;

      for (let c = 0; c < colsInThisRow; c++) {
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
            instId
         );

         const instCanceledSet =
            canceledSlotKeysByInst && canceledSlotKeysByInst.get && instId
               ? canceledSlotKeysByInst.get(instId) || null
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
               slotGeoms.length
            );
         } else if (isLateralPad) {
            maxSlotsForThisColumn = Math.min(
               LATERAL_SLOTS_PER_COLUMN,
               slotGeoms.length
            );
         } else if (isWaitPad) {
            maxSlotsForThisColumn = Math.min(
               WAIT_SLOTS_PER_COLUMN,
               slotGeoms.length
            );
         } else {
            maxSlotsForThisColumn = slotGeoms.length;
         }

         const worldHeightForColumn = isPadCol
            ? computeWorldHeight(maxSlotsForThisColumn, slotHeight, slotGap)
            : worldHeight;

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
            rowTop + colHeight
         );
         grad.addColorStop(0, colBottomColor);
         grad.addColorStop(0.1, colTopColor);
         grad.addColorStop(1, colTopColor);

         ctx.fillStyle = grad;
         drawRoundRect(ctx, colX, rowTop, w, colHeight, columnRadius);
         ctx.fill();
         ctx.restore();

         let waitPadIndex = null;
         if (isWaitPad) waitPadIndex = waitPadCounter++;

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

            // pentru instructori reali: nu desenăm slot dacă e ocupat
            if (
               !isPadCol &&
               slotStartMs &&
               slotEndMs &&
               slotOverlapsEvents(slotStartMs, slotEndMs, overlapEventsForInst)
            ) {
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

            ctx.save();

            const slotBaseBg =
               isWaitPad || isLateralPad || isCancelPad
                  ? emptySlotBgPads
                  : emptySlotBgDefault;

            let fillColor = slotBaseBg;

            if (isCancelledHere) fillColor = cancelSlotBgColor;
            else if (isBlocked || isSlot19_30) fillColor = blackoutFillColor;

            ctx.fillStyle = fillColor;
            drawRoundRect(ctx, slotX, slotY, slotW, slotH, slotRadius);
            ctx.fill();
            // ✅ CREATE-DRAFT indicator (slot gol)
            // ✅ CREATE-DRAFT overlay (slot gol) — ca la EDIT, dar scrie "CREARE"
            // ✅ CREATE-DRAFT overlay (slot gol) — cu border colorat (ca la EDITARE)
            if (
               createDraftBySlotColors &&
               !isPadCol &&
               slotStartDate instanceof Date &&
               !isNaN(slotStartDate)
            ) {
               const draftKey = `${instId}|${slotStartDate.toISOString()}`;

               // re-folosim exact aceeași rezolvare de culori ca la EDITARE
               const draftColors = getPresenceColorsForId(
                  createDraftBySlotColors,
                  draftKey
               );
               const isCreatingHere =
                  Array.isArray(draftColors) && draftColors.length;

               if (isCreatingHere) {
                  ctx.save();

                  // overlay
                  ctx.fillStyle = "rgba(0,0,0,0.65)";
                  drawRoundRect(
                     ctx,
                     slotX + 1,
                     slotY + 1,
                     slotW - 2,
                     slotH - 2,
                     slotRadius
                  );
                  ctx.fill();

                  // text
                  ctx.fillStyle = "#fff";
                  ctx.textBaseline = "top";
                  ctx.font = `bold ${Math.max(
                     11,
                     12 * fontScale
                  )}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
                  ctx.fillText(
                     "CREARE",
                     slotX + 8 * fontScale,
                     slotY + 6 * fontScale
                  );

                  // ✅ border colorat (identic ca la EDITARE)
                  drawPresenceBorder(
                     ctx,
                     slotX,
                     slotY,
                     slotW,
                     slotH,
                     draftColors,
                     slotRadius
                  );

                  ctx.restore();
               }
            }

            // border blackout
            if (isBlocked || isSlot19_30) {
               ctx.lineWidth = 1;
               ctx.strokeStyle = blackoutBorderColor;
               drawRoundRect(
                  ctx,
                  slotX + 1,
                  slotY + 1,
                  slotW - 2,
                  slotH - 2,
                  Math.max(0, slotRadius - 1.5 * fontScale)
               );
               ctx.stroke();
            }

            // text
            let slotTextColor = emptySlotTextColor;
            if (isCancelledHere) slotTextColor = cancelSlotTextColor;

            ctx.fillStyle = slotTextColor;
            ctx.font = `${fontMetaPx}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
            ctx.textBaseline = "top";

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

            if (shouldDrawText && slotLabelText) {
               const maxTextWidth = Math.max(0, slotW - padX * 2);
               const lines = wrapText(ctx, slotLabelText, maxTextWidth, 5);
               for (let li = 0; li < lines.length; li++) {
                  ctx.fillText(
                     lines[li],
                     slotX + padX,
                     slotY + padY + li * lineHeight
                  );
               }
            }

            const isHighlightedSlot =
               highlightSlot &&
               String(highlightSlot.instructorId) === instId &&
               slotStartDate &&
               highlightSlot.slotStart === slotStartDate.toISOString();

            if (isHighlightedSlot) {
               ctx.lineWidth = 2;
               ctx.strokeStyle = activeBorderColor;
               drawRoundRect(
                  ctx,
                  slotX + 1,
                  slotY + 1,
                  slotW - 2,
                  slotH - 2,
                  Math.max(0, slotRadius - 1.5 * fontScale)
               );
               ctx.stroke();
            }

            ctx.restore();

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

         // draw events
         for (const ev of instEvents) {
            const displayStart = ev.start;

            let slotIdx;
            if (typeof ev._padSlotIndex === "number") {
               slotIdx = ev._padSlotIndex;
            } else {
               const labelForIndex = formatHHMM(ev.start);
               slotIdx = slotIndexByLabel.get(labelForIndex);

               if (slotIdx == null) {
                  let bestIdx = 0;
                  let bestDiff = Infinity;
                  const evMs = ev.start.getTime();
                  slotGeoms.forEach((sg, idx2) => {
                     const diff = Math.abs(evMs - sg.startMs);
                     if (diff < bestDiff) {
                        bestDiff = diff;
                        bestIdx = idx2;
                     }
                  });
                  slotIdx = bestIdx;
               }
            }

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
            const studentPhone = getStudentPhoneFromEv(ev);

            const evLocalKey =
               ev.localSlotKey || (ev.start ? localKeyFromTs(ev.start) : null);

            let isBlockedEvent = false;
            if (blockedKeyMap && evLocalKey) {
               const instSet = getBlockedSetForInstructor(
                  blockedKeyMap,
                  instId
               );
               if (instSet) {
                  if (instSet instanceof Set)
                     isBlockedEvent = instSet.has(evLocalKey);
                  else if (Array.isArray(instSet))
                     isBlockedEvent = instSet.includes(evLocalKey);
                  else if (typeof instSet === "object")
                     isBlockedEvent = !!instSet[evLocalKey];
               }
            }

            if (ev._movedToCancelPad) isBlockedEvent = false;

            const isHighlighted =
               highlightEventIdForRender &&
               String(ev.id) === String(highlightEventIdForRender);

            ctx.save();

            ctx.fillStyle = color;
            drawRoundRect(ctx, cardX, cardY, cardW, cardH, eventRadius);
            ctx.fill();

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

            let timeText = formatHHMM(displayStart);

            const isFavorite = raw.isFavorite === true;
            const isImportant = raw.isImportant === true;

            let statusEmoji = "";
            if (isFavorite) statusEmoji += "⁂";
            if (isImportant) statusEmoji += statusEmoji ? " · ‼" : "‼";

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

            const metaParts = [];
            if (timeText) metaParts.push(timeText);
            if (ev.gearboxLabel) metaParts.push(ev.gearboxLabel);
            if (statusEmoji) metaParts.push(statusEmoji);

            // ✅ aici apare inițiala lângă celelalte meta
            if (desiredBadge) metaParts.push(desiredBadge);

            // ✅ IMPORTANT: filter(Boolean) (NU metaParts.push(Boolean)!)
            const metaLine = metaParts.filter(Boolean).join(" · ");

            if (metaLine) {
               const metaLines = wrapText(ctx, metaLine, maxTextWidth, 1);
               for (const line of metaLines) {
                  ctx.fillText(line, textX, textY);
                  textY += lineH;
               }
            }

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

            const noteFromEvent = (ev.eventPrivateMessage || "")
               .toString()
               .trim();
            const noteFromProfile = (getStudentPrivateMessageFromEv(ev) || "")
               .toString()
               .trim();

            const bothNotes = [
               noteFromEvent && noteFromEvent,
               noteFromProfile && noteFromProfile,
            ]
               .filter(Boolean)
               .join("; ");

            if (person) {
               const nameLines = wrapText(ctx, person, maxTextWidth, 2);
               for (const line of nameLines) {
                  ctx.fillText(line, textX, textY);
                  textY += lineH;
               }
            }

            if (studentPhone) {
               const phoneLines = wrapText(ctx, studentPhone, maxTextWidth, 1);
               for (const line of phoneLines) {
                  ctx.fillText(line, textX, textY);
                  textY += lineH;
               }
            }

            if (bothNotes) {
               ctx.font = `${fontNotesPx}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
               const notesLines = wrapText(
                  ctx,
                  bothNotes.replace(/\s+/g, " ").trim(),
                  maxTextWidth,
                  2
               );
               for (const line of notesLines) {
                  ctx.fillText(line, textX, textY);
                  textY += lineH;
               }
            }

            ctx.restore();

            /* ✅ presence border (outer) */
            const ridPresence = raw?.id ?? ev?.raw?.id ?? ev?.id ?? null;
            const presenceColors = getPresenceColorsForId(
               presenceByReservationColors,
               ridPresence
            );
            if (ridPresence != null) {
               // o singură dată, ca să nu-ți omoare consola
               if (!window.__presenceDbgOnce) {
                  window.__presenceDbgOnce = true;
                  console.log(
                     "presenceByReservationColors sample:",
                     presenceByReservationColors
                  );
               }
               //console.log(
               //   "RID:",
               //   String(ridPresence),
               //   "colors:",
               //   presenceColors
               //);
            }

            if (presenceColors && presenceColors.length) {
               drawPresenceBorder(
                  ctx,
                  cardX,
                  cardY,
                  cardW,
                  cardH,
                  presenceColors,
                  eventRadius
               );
            }

            if (isBlockedEvent) {
               ctx.lineWidth = 1.3;
               ctx.strokeStyle = blackoutBorderColor;
               drawRoundRect(
                  ctx,
                  cardX + 1,
                  cardY + 1,
                  cardW - 2,
                  cardH - 2,
                  eventBorderRadius
               );
               ctx.stroke();
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
                  eventBorderRadius
               );
               ctx.stroke();
            }

            ctx.restore();
            // ✅ DEBUG: overlay negru dacă rezervarea e în editare (presence)
            const rid = String(raw?.id ?? ev.id ?? "");

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
                  eventRadius
               );
               ctx.fill();

               ctx.fillStyle = "#fff";
               ctx.textBaseline = "top";
               ctx.font = `bold ${Math.max(
                  11,
                  12 * fontScale
               )}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
               ctx.fillText(
                  "EDITARE",
                  cardX + 8 * fontScale,
                  cardY + 6 * fontScale
               );

               ctx.restore();
            }

            if (hitMap) {
               const reservationId = raw?.id ?? ev.id;
               hitMap.push({
                  x: cardX,
                  y: cardY,
                  w: cardW,
                  h: cardH,
                  kind: "reservation",
                  reservationId,
                  ev,
               });
            }
         }
      }

      currentRowTop += headerHeight + rowHeight + rowGap;
   }

   ctx.restore();
}
