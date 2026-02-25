import React, {
   memo,
   useCallback,
   useEffect,
   useLayoutEffect,
   useMemo,
   useRef,
   useState,
} from "react";
import { useDispatch } from "react-redux";

import { openPopup } from "../../Utils/popupStore";
import {
   scheduleCalendarRefresh,
   triggerCalendarRefresh,
} from "../../Utils/calendarBus";
import {
   createReservationsForUser,
   deleteReservation,
} from "../../../api/reservationsService";
import {
   createNote,
   fetchWaitNotesRange,
   updateNote,
} from "../../../api/notesService";
import { getUserById } from "../../../api/usersService";
import { addInstructorBlackout } from "../../../api/instructorsService";
import {
   addReservationLocal,
   patchReservationLocal,
   removeReservationLocal,
} from "../../../store/reservationsSlice";
import { reservationsApi } from "../../../store/reservationsApi";
import { updateUser } from "../../../store/usersSlice";
import { DEFAULT_EVENT_COLOR_TOKEN, NO_COLOR_TOKEN } from "./render";
import {
   MOLDOVA_TZ,
   buildStartTimeForSlot,
   buildVirtualSlotForDayHHMM,
   getInstructorSector,
   getNoteForDate,
   getStudentPhoneFromEv,
   getStudentPrivateMessageFromEv,
   isEventCanceled,
   localKeyFromTs,
   norm,
   WAIT_SLOTS_PER_COLUMN,
   CANCEL_SLOTS_PER_COLUMN,
   LATERAL_TIME_MARKS,
   LATERAL_SLOTS_PER_COLUMN,
   WAIT_PLACEHOLDER_TEXT,
   WAIT_NOTES_CACHE,
   normalizeWaitNotesInput,
   upsertNoteForDate,
   ymdStrInTZ,
   buildWaitNoteDateIsoForSlot,
} from "./utils";
import {
   getSelectionVersion,
   hideReservationGlobally,
   isHidden,
   retainGlobals,
   setBlockFn,
   setDeleteFn,
   setGlobalSelection,
   setPasteFn,
   getSelectedEvent,
   getSelectedSlot,
} from "./globals";

const IS_LOW_SPEC_DEVICE =
   typeof navigator !== "undefined" &&
   ((Number(navigator.deviceMemory) > 0 && Number(navigator.deviceMemory) <= 4) ||
      (Number(navigator.hardwareConcurrency) > 0 &&
         Number(navigator.hardwareConcurrency) <= 4));
const DAY_OFFSCREEN_MARGIN_BASE_PX = IS_LOW_SPEC_DEVICE ? 620 : 860;
const DISABLE_SECTION_VIRTUALIZATION = false;
const LONG_PRESS_MS = 200;
const LONG_PRESS_MOVE_PX = 14;
const ACTIVE_EVENT_RECT_RETRY_FRAMES = 40;
const DELETE_ANIMATION_MS = 170;
const EMPTY_CELL_ITEMS = [];
const GAP_COL_PREFIX = "__gapcol_";
const WAIT_NOTE_MODE = "local-match";
const RANGE_BLOCK_BATCH_DELAY_MS = 0;
const RANGE_BLOCK_BATCH_CONCURRENCY = 2;
const RANGE_SLOT_SELECTOR = "[data-cp-kind='slot'][data-selectable='1']";
const DAYVIEW_STRUCTURE_CACHE = new WeakMap();
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

function isRangeMultiSelectPressed(eventLike) {
   return !!eventLike?.shiftKey;
}

function normalizeColorToken(input) {
   if (!input) return DEFAULT_EVENT_COLOR_TOKEN;

   const raw = String(input).trim();
   if (!raw) return DEFAULT_EVENT_COLOR_TOKEN;

   const lower = raw.toLowerCase();
   if (lower === "transparent" || lower === "black" || lower === "black-t")
      return NO_COLOR_TOKEN;

   if (/^(rgb\(|hsl\()/i.test(raw) || /^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw;
   if (raw.startsWith("var(")) return raw;

   if (raw.startsWith("--")) {
      const short = raw.slice(2).toLowerCase();
      if (!short || short === "default") return DEFAULT_EVENT_COLOR_TOKEN;
      if (short === "black" || short === "black-t" || short === "black-s")
         return NO_COLOR_TOKEN;
      if (short.startsWith("event-")) return `--${short}`;
      return `--event-${short}`;
   }

   if (/^event-/i.test(raw)) {
      const rest = raw.slice("event-".length).toLowerCase();
      if (!rest || rest === "default") return DEFAULT_EVENT_COLOR_TOKEN;
      if (rest === "black" || rest === "black-t" || rest === "black-s")
         return NO_COLOR_TOKEN;
      return `--event-${rest}`;
   }

   const mapped = EVENT_COLOR_MAP[raw.toUpperCase()];
   return mapped || raw;
}

function resolveCssColor(input) {
   const token = normalizeColorToken(input);
   return token.startsWith("--") ? `var(${token})` : token;
}

function toDateSafe(value) {
   const d = value instanceof Date ? value : new Date(value);
   return Number.isNaN(d.getTime()) ? null : d;
}

function toFiniteTimeMs(value) {
   const d = toDateSafe(value);
   return d ? d.getTime() : null;
}

function selectionMarkerTouchesDay(marker, dayStartMs, dayEndMs) {
   if (!marker || dayStartMs == null || dayEndMs == null) return false;

   const candidates = [marker?.slotStartMs, marker?.eventStartMs];
   for (const raw of candidates) {
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      if (n >= dayStartMs && n < dayEndMs) return true;
   }

   return false;
}

function hhmm(value) {
   const d = toDateSafe(value);
   if (!d) return "";
   return `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
   ).padStart(2, "0")}`;
}

function toLocalDateTimeString(value) {
   const d = toDateSafe(value);
   if (!d) return "";
   const y = d.getFullYear();
   const m = String(d.getMonth() + 1).padStart(2, "0");
   const day = String(d.getDate()).padStart(2, "0");
   const h = String(d.getHours()).padStart(2, "0");
   const min = String(d.getMinutes()).padStart(2, "0");
   return `${y}-${m}-${day}T${h}:${min}:00`;
}

function toSlotKeyForCompare(value) {
   const d = toDateSafe(value);
   if (!d) return "";
   return localKeyFromTs(d, MOLDOVA_TZ);
}

function isEditableTarget(target) {
   if (!target || typeof target !== "object") return false;
   const tag = String(target.tagName || "").toLowerCase();
   return tag === "input" || tag === "textarea" || !!target.isContentEditable;
}

function reservationIdFromAny(node) {
   if (!node || typeof node !== "object") return null;
   return (
      node.id ??
      node._id ??
      node.reservationId ??
      node.reservation_id ??
      node.reservation?.id ??
      null
   );
}

function reservationStartFromAny(node) {
   if (!node || typeof node !== "object") return null;
   return (
      node.startTime ??
      node.start_time ??
      node.start ??
      node.dateTime ??
      node.datetime ??
      node.date ??
      node.reservation?.startTime ??
      node.reservation?.start ??
      node.reservation?.dateTime ??
      null
   );
}

function reservationInstructorIdFromAny(node) {
   if (!node || typeof node !== "object") return null;
   return (
      node.instructorId ??
      node.instructor_id ??
      node.instructor?.id ??
      node.reservation?.instructorId ??
      node.reservation?.instructor_id ??
      node.reservation?.instructor?.id ??
      null
   );
}

function reservationUserIdFromAny(node) {
   if (!node || typeof node !== "object") return null;
   return (
      node.userId ??
      node.user_id ??
      node.user?.id ??
      node.studentId ??
      node.student_id ??
      node.student?.id ??
      node.reservation?.userId ??
      node.reservation?.user_id ??
      node.reservation?.user?.id ??
      null
   );
}

function extractCreatedReservations(payload) {
   const out = [];
   const seen = new Set();

   const visit = (node, depth = 0) => {
      if (node == null || depth > 7) return;
      if (Array.isArray(node)) {
         for (const item of node) visit(item, depth + 1);
         return;
      }
      if (typeof node !== "object") return;

      const rid = reservationIdFromAny(node);
      const startRaw = reservationStartFromAny(node);
      const instructorId = reservationInstructorIdFromAny(node);
      const userId = reservationUserIdFromAny(node);

      const looksLikeReservation = !!(
         (rid != null && (startRaw != null || userId != null || instructorId != null)) ||
         (startRaw != null && (userId != null || instructorId != null))
      );

      if (looksLikeReservation) {
         const key = `${String(rid ?? "")}|${String(startRaw ?? "")}|${String(
            userId ?? "",
         )}|${String(instructorId ?? "")}`;
         if (!seen.has(key)) {
            seen.add(key);
            out.push(node);
         }
      }

      for (const value of Object.values(node)) {
         if (value && typeof value === "object") visit(value, depth + 1);
      }
   };

   visit(payload, 0);
   return out;
}

function rectIntersectsCoords(
   aLeft,
   aTop,
   aRight,
   aBottom,
   bLeft,
   bTop,
   bRight,
   bBottom,
) {
   return !(
      bLeft >= aRight ||
      bRight <= aLeft ||
      bTop >= aBottom ||
      bBottom <= aTop
   );
}

function compareRangeEntry(a, b) {
   if ((a?.row || 0) !== (b?.row || 0)) return (a?.row || 0) - (b?.row || 0);
   if ((a?.slotIdx || 0) !== (b?.slotIdx || 0))
      return (a?.slotIdx || 0) - (b?.slotIdx || 0);
   if ((a?.col || 0) !== (b?.col || 0)) return (a?.col || 0) - (b?.col || 0);
   return String(a?.rangeKey || "").localeCompare(String(b?.rangeKey || ""));
}

function rangeBoxSig(box) {
   if (!box) return "";
   return `${box.left}|${box.top}|${box.width}|${box.height}`;
}

function escapeAttrSelectorValue(value) {
   return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
}

function getReservationId(ev) {
   return ev?.raw?.id ?? ev?.id ?? null;
}

function getInstructorId(ev) {
   return (
      ev?.instructorId ??
      ev?.raw?.instructorId ??
      ev?.raw?.instructor_id ??
      null
   );
}

function getEventUserId(ev) {
   return (
      ev?.raw?.userId ??
      ev?.raw?.user_id ??
      ev?.userId ??
      ev?.studentId ??
      ev?.raw?.user?.id ??
      null
   );
}

function normalizeGearbox(input) {
   const raw = String(input || "").toLowerCase();
   return raw.includes("auto") ? "Automat" : "Manual";
}

function computeWorldHeight(slotsCount, slotHeight, slotGap) {
   const count = Math.max(0, Number(slotsCount) || 0);
   if (!count) return 0;
   const h = Math.max(1, Number(slotHeight) || 0);
   const g = Math.max(0, Number(slotGap) || 0);
   return count * h + Math.max(0, count - 1) * g;
}

function closestSlotIndex(slots, slotIndexByKey, startDate) {
   if (!slots.length) return -1;

   const k = localKeyFromTs(startDate, MOLDOVA_TZ);
   if (slotIndexByKey.has(k)) return slotIndexByKey.get(k);

   const startMs = startDate.getTime();
   let best = 0;
   let bestDelta = Number.POSITIVE_INFINITY;

   for (let i = 0; i < slots.length; i++) {
      const ms = slots[i].start.getTime();
      const d = Math.abs(ms - startMs);
      if (d < bestDelta) {
         bestDelta = d;
         best = i;
      }
   }

   return best;
}

function buildHeadersMeta(instructors, colsPerRow) {
   const instList = Array.isArray(instructors) ? instructors : [];
   const cols = Math.max(1, Number(colsPerRow) || 1);
   return instList.map((inst, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      return { inst, idx, row, col };
   });
}

function isPadInstructor(inst) {
   const id = String(inst?.id || "");
   return !!inst?._padType || id.startsWith("__pad_");
}

function isGapInstructor(inst) {
   const id = String(inst?.id || "");
   return id.startsWith(GAP_COL_PREFIX) || inst?._isGapColumn === true;
}

function detectPadType(inst) {
   if (!inst) return null;
   if (inst?._padType) return String(inst._padType);

   const id = String(inst?.id || "");
   const nameLower = String(inst?.name || "").toLowerCase();

   if (id === "__pad_1" || nameLower.includes("anular")) return "cancel";
   if (id === "__pad_4" || nameLower.includes("later")) return "lateral";
   if (id.startsWith("__pad_")) return "wait";
   return null;
}

function normalizeBlockedSetValue(value) {
   if (!value) return new Set();
   if (value instanceof Set) return value;
   if (Array.isArray(value)) return new Set(value.map((x) => String(x)));
   if (typeof value?.has === "function") return value;
   if (typeof value === "object") {
      return new Set(
         Object.entries(value)
            .filter(([, v]) => !!v)
            .map(([k]) => String(k)),
      );
   }
   return new Set();
}

function normalizeBlockedMapInput(blockedKeyMap) {
   if (!blockedKeyMap) return null;
   if (blockedKeyMap instanceof Map) {
      // Fast path: in CalendarPlus, payload-ul este deja Map<string, Set<string>>.
      return blockedKeyMap;
   }

   const out = new Map();

   if (typeof blockedKeyMap === "object") {
      for (const [key, value] of Object.entries(blockedKeyMap)) {
         const k = String(key ?? "").trim();
         if (!k) continue;
         out.set(k, normalizeBlockedSetValue(value));
      }
      return out;
   }

   return null;
}

function makeGapColumn(rowIndex, colIndex) {
   return {
      id: `${GAP_COL_PREFIX}${rowIndex}_${colIndex}`,
      name: "",
      _isGapColumn: true,
      _padType: "gap",
      sectorSlug: null,
   };
}

function computeHeaderMetricsForStructure({
   headersMeta,
   colsPerRow,
   slotsCount,
   slotHeight,
   slotGap,
   headerHeight,
   rowGap,
   colWidth,
   colGap,
}) {
   const colsCount = Math.max(1, headersMeta.length || 1);
   const rowsCount = Math.max(1, Math.ceil(colsCount / colsPerRow));
   const worldHeight = computeWorldHeight(slotsCount, slotHeight, slotGap);
   const padSlots = Math.min(
      Math.max(WAIT_SLOTS_PER_COLUMN, CANCEL_SLOTS_PER_COLUMN),
      slotsCount,
   );
   const padWorldHeight = padSlots
      ? computeWorldHeight(padSlots, slotHeight, slotGap)
      : worldHeight;
   const rowHeights = new Array(rowsCount);
   for (let row = 0; row < rowsCount; row++) {
      const rowStart = row * colsPerRow;
      const rowEnd = Math.min(colsCount, rowStart + colsPerRow);
      let allPad = rowEnd > rowStart;
      for (let i = rowStart; i < rowEnd; i++) {
         const inst = headersMeta[i]?.inst || null;
         if (!inst || (!isPadInstructor(inst) && !isGapInstructor(inst))) {
            allPad = false;
            break;
         }
      }
      rowHeights[row] = allPad ? padWorldHeight : worldHeight;
   }

   const rowTops = new Array(rowsCount);
   let acc = 0;
   for (let row = 0; row < rowsCount; row++) {
      rowTops[row] = acc;
      acc += headerHeight + rowHeights[row] + rowGap;
   }

   const totalHeight = Math.max(1, acc - rowGap);
   const dayWidth =
      Math.min(colsPerRow, colsCount) * colWidth +
      Math.max(0, Math.min(colsPerRow, colsCount) - 1) * colGap;

   return {
      colsCount,
      rowsCount,
      rowHeights,
      rowTops,
      totalHeight,
      dayWidth,
      worldHeight,
   };
}

function getCachedDayviewStructure({
   instructors,
   colsPerRow,
   slotsCount,
   slotHeight,
   slotGap,
   headerHeight,
   rowGap,
   colWidth,
   colGap,
}) {
   if (!Array.isArray(instructors)) {
      const effectiveInstructors = [];
      const headersMeta = buildHeadersMeta(effectiveInstructors, colsPerRow);
      const headerMetrics = computeHeaderMetricsForStructure({
         headersMeta,
         colsPerRow,
         slotsCount,
         slotHeight,
         slotGap,
         headerHeight,
         rowGap,
         colWidth,
         colGap,
      });
      return { effectiveInstructors, headersMeta, headerMetrics };
   }

   let byParams = DAYVIEW_STRUCTURE_CACHE.get(instructors);
   if (!byParams) {
      byParams = new Map();
      DAYVIEW_STRUCTURE_CACHE.set(instructors, byParams);
   }

   const key = [
      colsPerRow,
      slotsCount,
      slotHeight,
      slotGap,
      headerHeight,
      rowGap,
      colWidth,
      colGap,
   ].join("|");
   const cached = byParams.get(key);
   if (cached) return cached;

   const effectiveInstructors = buildEffectiveInstructorsLayout(instructors);
   const headersMeta = buildHeadersMeta(effectiveInstructors, colsPerRow);
   const headerMetrics = computeHeaderMetricsForStructure({
      headersMeta,
      colsPerRow,
      slotsCount,
      slotHeight,
      slotGap,
      headerHeight,
      rowGap,
      colWidth,
      colGap,
   });

   const result = { effectiveInstructors, headersMeta, headerMetrics };
   byParams.set(key, result);
   if (byParams.size > 8) {
      const oldestKey = byParams.keys().next().value;
      byParams.delete(oldestKey);
   }
   return result;
}

function buildEffectiveInstructorsLayout(instructors) {
   const list = Array.isArray(instructors) ? instructors : [];
   if (!list.length) return [];

   const cancelPads = [];
   const waitPads = [];
   const lateralPads = [];
   const real = [];

   for (const inst of list) {
      if (!inst) continue;
      if (isGapInstructor(inst)) {
         real.push({ ...inst, _isGapColumn: true, _padType: "gap" });
         continue;
      }

      const padType = detectPadType(inst);
      if (!padType) {
         real.push(inst);
         continue;
      }

      if (padType === "cancel") cancelPads.push({ ...inst, _padType: "cancel" });
      else if (padType === "lateral")
         lateralPads.push({ ...inst, _padType: "lateral" });
      else if (padType === "wait")
         waitPads.push({ ...inst, _padType: "wait" });
      else if (padType === "gap")
         real.push({ ...inst, _isGapColumn: true, _padType: "gap" });
      else waitPads.push({ ...inst, _padType: "wait" });
   }

   const lateralTemplate = lateralPads[0] || waitPads[0] || cancelPads[0] || null;
   const cancel1Base = cancelPads[0] || cancelPads[1] || lateralTemplate || null;
   const cancel2Base = cancelPads[1] || cancelPads[0] || cancel1Base;
   const wait1Base = waitPads[0] || waitPads[1] || lateralTemplate || cancel1Base;
   const wait2Base = waitPads[1] || waitPads[0] || wait1Base;

   const makePad = (base, padType, padColumnIndex, rowIndex) => {
      if (!base) return makeGapColumn(rowIndex, padColumnIndex);
      const baseId = String(base.id || "__pad_");
      return {
         ...base,
         id: `${baseId}__r${rowIndex}__c${padColumnIndex}`,
         _basePadId: baseId,
         _padType: padType,
         _padColumnIndex: padColumnIndex,
      };
   };

   const rows = [];
   rows.push([
      makePad(cancel1Base, "cancel", 0, 0),
      makePad(cancel2Base, "cancel", 1, 0),
      makePad(wait1Base, "wait", 0, 0),
      makePad(wait2Base, "wait", 1, 0),
   ]);

   const makeLateral = (rowIndex) => {
      if (!lateralTemplate) return makeGapColumn(rowIndex, 3);
      const baseId = String(lateralTemplate.id || "__pad_4");
      return {
         ...lateralTemplate,
         id: `${baseId}__r${rowIndex}__lateral`,
         _basePadId: baseId,
         _padType: "lateral",
         _padColumnIndex: rowIndex,
      };
   };

   let i = 0;
   while (i < real.length) {
      const rowIndex = rows.length;
      const c0 = i < real.length ? real[i++] : makeGapColumn(rowIndex, 0);
      const c1 = i < real.length ? real[i++] : makeGapColumn(rowIndex, 1);
      const c2 = i < real.length ? real[i++] : makeGapColumn(rowIndex, 2);
      rows.push([c0, c1, c2, makeLateral(rowIndex)]);
   }

   return rows.flat();
}

function buildInstructorBadge(name) {
   const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
   if (!parts.length) return "";
   if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
   return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function resolveGearboxBadge(value) {
   const raw = String(value || "").toLowerCase();
   if (!raw) return "";
   if (raw.includes("auto")) return "A";
   if (raw.includes("man")) return "M";
   return "";
}

function readWaitNoteSnapshot(notesMap, globalIdx) {
   if (!notesMap || globalIdx == null) return { id: null, text: "" };
   const raw =
      notesMap?.[globalIdx] ?? notesMap?.[String(globalIdx)] ?? null;
   if (!raw) return { id: null, text: "" };

   if (typeof raw === "string") {
      return { id: null, text: String(raw || "").trim() };
   }

   if (typeof raw === "object") {
      const idRaw = raw.id ?? raw._id ?? raw.noteId ?? raw.note_id ?? null;
      const textRaw = raw.text ?? raw.content ?? raw.note ?? "";
      return {
         id: idRaw != null ? String(idRaw) : null,
         text: String(textRaw || "").trim(),
      };
   }

   return { id: null, text: "" };
}

function buildWaitNoteSnapshotSignature(snapshot) {
   const id = snapshot?.id != null ? String(snapshot.id) : "";
   const text = String(snapshot?.text || "").trim();
   return `${id}|${text}`;
}

function DayviewDomTrack({
   dayStart,
   dayEnd,
   instructors,
   events,
   slots,
   dayOffsetLeft,
   viewportScrollLeft,
   viewportScrollTop,
   viewportWidth,
   viewportHeight,
   layout,
   blockedKeyMap,
   blackoutVer = 0,
   activeEventId,
   activeSearchEventId,
   onActiveEventRectChange,
   onCreateSlot,
   users = [],
   cars = [],
   instructorsFull = [],
   sharedLookups = null,
   createDraftBySlotUsers,
   createDraftBySlotColors,
   presenceByReservationUsers,
   presenceByReservationColors,
   isPanInteracting = false,
}) {
   const dispatch = useDispatch();
   const rootRef = useRef(null);
   const eventRefMap = useRef(new Map());
   const longPressTimerRef = useRef(0);
   const longPressStateRef = useRef(null);
   const ignoreClickUntilRef = useRef(0);
   const waitInputRef = useRef(null);
   const waitCommitRef = useRef(false);
   const headerInputRef = useRef(null);
   const waitEditFocusKeyRef = useRef("");
   const headerEditFocusKeyRef = useRef("");
   const rangeDragRef = useRef({
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      rafId: 0,
   });
   const rangeSelectionSigRef = useRef("");
   const rangeSelectedEntriesRef = useRef([]);
   const rangeBatchRunningRef = useRef(false);
   const rangeOwnerTokenRef = useRef(
      `cpdom-range-${Math.random().toString(36).slice(2, 10)}`,
   );
   const rangeHitCacheRef = useRef({
      root: null,
      built: false,
      items: [],
   });
   const rangeBoxSigRef = useRef("");
   const deleteTimersRef = useRef(new Map());

   const [selectionVersion, setSelectionVersionState] = useState(() =>
      getSelectionVersion(),
   );
   const [waitNotes, setWaitNotes] = useState({});
   const [waitEdit, setWaitEdit] = useState(null);
   const [headerEdit, setHeaderEdit] = useState(null);
   const waitNotesRef = useRef(waitNotes);
   const [deletingReservationIds, setDeletingReservationIds] = useState(
      () => new Set(),
   );
   const deletingReservationIdsRef = useRef(deletingReservationIds);
   const [rangeSelectedEntries, setRangeSelectedEntries] = useState([]);
   const [rangeBox, setRangeBox] = useState(null);
   const rangeSelectedKeySet = useMemo(
      () => new Set(rangeSelectedEntries.map((entry) => entry.rangeKey)),
      [rangeSelectedEntries],
   );
   const setRangeEntries = useCallback((entriesRaw) => {
      const entries = Array.isArray(entriesRaw) ? entriesRaw : [];
      const sig = entries.map((entry) => entry.rangeKey).join("|");
      if (sig === rangeSelectionSigRef.current) return;
      rangeSelectionSigRef.current = sig;
      rangeSelectedEntriesRef.current = entries;
      setRangeSelectedEntries(entries);
   }, []);
   const invalidateRangeHitCache = useCallback(() => {
      rangeHitCacheRef.current = {
         root: null,
         built: false,
         items: [],
      };
   }, []);
   const clearRangeSelection = useCallback(() => {
      const drag = rangeDragRef.current;
      if (drag.rafId) {
         cancelAnimationFrame(drag.rafId);
         drag.rafId = 0;
      }
      drag.active = false;
      drag.pointerId = null;
      if (rangeBoxSigRef.current) {
         rangeBoxSigRef.current = "";
         setRangeBox(null);
      }
      invalidateRangeHitCache();
      setRangeEntries([]);
   }, [invalidateRangeHitCache, setRangeEntries]);

   useEffect(() => {
      const release = retainGlobals();
      return release;
   }, []);

   useEffect(
      () => () => {
         if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = 0;
         }
         longPressStateRef.current = null;
         const drag = rangeDragRef.current;
         if (drag.rafId) {
            cancelAnimationFrame(drag.rafId);
            drag.rafId = 0;
         }
         rangeBoxSigRef.current = "";
         invalidateRangeHitCache();
         const deleteTimers = deleteTimersRef.current;
         deleteTimers.forEach((timerId) => clearTimeout(timerId));
         deleteTimers.clear();
      },
      [invalidateRangeHitCache],
   );

   useEffect(() => {
      const onSel = (ev) => {
         const detail = ev?.detail || null;
         if (detail && (detail.prev || detail.next)) {
            const dayStartMs = toFiniteTimeMs(dayStart);
            const dayEndMs = toFiniteTimeMs(dayEnd);
            const touchesPrev = selectionMarkerTouchesDay(
               detail.prev,
               dayStartMs,
               dayEndMs,
            );
            const touchesNext = selectionMarkerTouchesDay(
               detail.next,
               dayStartMs,
               dayEndMs,
            );
            if (!touchesPrev && !touchesNext) return;
         }
         setSelectionVersionState(getSelectionVersion());
      };
      window.addEventListener("dayview-selection-change", onSel);
      return () => window.removeEventListener("dayview-selection-change", onSel);
   }, [dayStart, dayEnd]);
   useEffect(() => {
      const onRangeOwner = (ev) => {
         const owner = String(ev?.detail?.owner || "").trim();
         if (!owner || owner === rangeOwnerTokenRef.current) return;
         clearRangeSelection();
      };
      window.addEventListener("cpdom-range-owner-change", onRangeOwner);
      return () =>
         window.removeEventListener("cpdom-range-owner-change", onRangeOwner);
   }, [clearRangeSelection]);
   useEffect(() => {
      const onDeletePreview = (ev) => {
         const rid = String(ev?.detail?.reservationId || "").trim();
         if (!rid) return;

         const phase = String(ev?.detail?.phase || "start")
            .trim()
            .toLowerCase();

         if (phase === "end" || phase === "stop" || phase === "clear") {
            setDeletingReservationIds((prev) => {
               if (!prev.has(rid)) return prev;
               const next = new Set(prev);
               next.delete(rid);
               return next;
            });
            return;
         }

         setDeletingReservationIds((prev) => {
            if (prev.has(rid)) return prev;
            const next = new Set(prev);
            next.add(rid);
            return next;
         });
      };

      window.addEventListener("cpdom-delete-preview", onDeletePreview);
      return () =>
         window.removeEventListener("cpdom-delete-preview", onDeletePreview);
   }, []);

   useEffect(() => {
      if (!waitEdit) {
         waitEditFocusKeyRef.current = "";
         return;
      }
      const focusKey = `${String(waitEdit.instId || "")}|${Number(
         waitEdit.slotIdx ?? -1,
      )}|${Number(waitEdit.globalIdx ?? -1)}`;
      if (waitEditFocusKeyRef.current === focusKey) return;
      waitEditFocusKeyRef.current = focusKey;

      const input = waitInputRef.current;
      if (!input) return;
      input.focus();
      try {
         const len = Number(input.value?.length || 0);
         input.setSelectionRange(len, len);
      } catch {}
   }, [waitEdit]);
   useEffect(() => {
      waitNotesRef.current = waitNotes;
   }, [waitNotes]);
   useEffect(() => {
      deletingReservationIdsRef.current = deletingReservationIds;
   }, [deletingReservationIds]);
   useEffect(() => {
      if (!headerEdit) {
         headerEditFocusKeyRef.current = "";
         return;
      }
      const focusKey = `${String(headerEdit.instId || "")}|${String(
         headerEdit.userId || "",
      )}`;
      if (headerEditFocusKeyRef.current === focusKey) return;
      headerEditFocusKeyRef.current = focusKey;

      const input = headerInputRef.current;
      if (!input) return;
      input.focus();
      try {
         const len = Number(input.value?.length || 0);
         input.setSelectionRange(len, len);
      } catch {}
   }, [headerEdit]);

   const dayStartMs = useMemo(() => {
      const d = toDateSafe(dayStart);
      return d ? d.getTime() : null;
   }, [dayStart]);
   const dayEndMs = useMemo(() => {
      const d = toDateSafe(dayEnd);
      return d ? d.getTime() : null;
   }, [dayEnd]);

   const waitRangeKey = useMemo(() => {
      if (dayStartMs == null) return "";
      const from = new Date(dayStartMs);
      const to = dayEndMs != null ? new Date(dayEndMs) : new Date(dayStartMs);
      return `${ymdStrInTZ(from, MOLDOVA_TZ)}|${ymdStrInTZ(to, MOLDOVA_TZ)}`;
   }, [dayStartMs, dayEndMs]);

   const fetchLatestWaitNotesMap = useCallback(async () => {
      if (!waitRangeKey || dayStartMs == null) {
         setWaitNotes({});
         return {};
      }

      const from = new Date(dayStartMs);
      const to = dayEndMs != null ? new Date(dayEndMs) : new Date(dayStartMs);
      const raw = await fetchWaitNotesRange({ from, to, type: "wait-slot" });
      const normalized = normalizeWaitNotesInput(raw, from);

      const entry = WAIT_NOTES_CACHE.get(waitRangeKey) || {
         data: null,
         error: null,
         promise: null,
      };
      entry.data = normalized;
      entry.error = null;
      entry.promise = null;
      WAIT_NOTES_CACHE.set(waitRangeKey, entry);

      waitNotesRef.current = normalized;
      setWaitNotes(normalized);

      return normalized;
   }, [waitRangeKey, dayStartMs, dayEndMs]);

   useEffect(() => {
      if (!waitRangeKey || dayStartMs == null) {
         setWaitNotes({});
         return;
      }

      let alive = true;
      const from = new Date(dayStartMs);
      const to = dayEndMs != null ? new Date(dayEndMs) : new Date(dayStartMs);

      const apply = (value) => {
         if (!alive) return;
         setWaitNotes(value && typeof value === "object" ? value : {});
      };

      const existing = WAIT_NOTES_CACHE.get(waitRangeKey);
      if (existing?.data) apply(existing.data);

      let entry = existing;
      if (!entry) {
         entry = { data: null, error: null, promise: null };
         WAIT_NOTES_CACHE.set(waitRangeKey, entry);
      }

      if (!entry.promise) {
         entry.promise = fetchWaitNotesRange({ from, to, type: "wait-slot" })
            .then((raw) => {
               const normalized = normalizeWaitNotesInput(raw, from);
               entry.data = normalized;
               entry.error = null;
               entry.promise = null;
               WAIT_NOTES_CACHE.set(waitRangeKey, entry);
               return normalized;
            })
            .catch((err) => {
               entry.error = err;
               entry.promise = null;
               WAIT_NOTES_CACHE.set(waitRangeKey, entry);
               throw err;
            });
      }

      entry.promise
         .then((normalized) => apply(normalized))
         .catch((err) => {
            console.error("fetchWaitNotesRange (DOM) error:", err);
            apply(existing?.data || {});
         });

      return () => {
         alive = false;
      };
   }, [waitRangeKey, dayStartMs, dayEndMs]);

   useEffect(() => {
      setWaitEdit(null);
      waitCommitRef.current = false;
   }, [waitRangeKey]);
   useEffect(() => {
      setHeaderEdit(null);
   }, [dayStartMs]);
   useEffect(() => {
      clearRangeSelection();
   }, [dayStartMs, clearRangeSelection]);

   const invalidateMonthReservations = useCallback(() => {
      dispatch(
         reservationsApi.util.invalidateTags([{ type: "ReservationsMonth" }]),
      );
   }, [dispatch]);

   const deleteReservationById = useCallback(
      (reservationId) => {
         if (!reservationId) return;
         const idStr = String(reservationId).trim();
         if (!idStr) return;
         if (deleteTimersRef.current.has(idStr)) return;
         if (deletingReservationIdsRef.current.has(idStr)) return;

         setGlobalSelection({ event: null, slot: null });
         try {
            window.dispatchEvent(
               new CustomEvent("cpdom-delete-preview", {
                  detail: { reservationId: idStr, phase: "start" },
               }),
            );
         } catch {}
         setDeletingReservationIds((prev) => {
            if (prev.has(idStr)) return prev;
            const next = new Set(prev);
            next.add(idStr);
            return next;
         });

         const timerId = setTimeout(async () => {
            deleteTimersRef.current.delete(idStr);

            dispatch(removeReservationLocal(idStr));
            hideReservationGlobally(idStr);

            try {
               triggerCalendarRefresh({
                  source: "dom-shortcut",
                  type: "delete-optimistic",
                  forceReload: false,
               });
            } catch {}

            let deletedOnServer = false;
            try {
               await deleteReservation(idStr);
               deletedOnServer = true;
            } catch (err) {
               console.error("Delete reservation failed (CalendarPlus DOM):", err);
               try {
                  invalidateMonthReservations();
                  triggerCalendarRefresh({
                     source: "dom-shortcut",
                     type: "delete-rollback",
                     forceReload: false,
                  });
               } catch {}
            } finally {
               try {
                  window.dispatchEvent(
                     new CustomEvent("cpdom-delete-preview", {
                        detail: { reservationId: idStr, phase: "end" },
                     }),
                  );
               } catch {}
               setDeletingReservationIds((prev) => {
                  if (!prev.has(idStr)) return prev;
                  const next = new Set(prev);
                  next.delete(idStr);
                  return next;
               });
            }

            if (!deletedOnServer) return;

            setTimeout(async () => {
               try {
                  invalidateMonthReservations();
               } catch {}
               try {
                  triggerCalendarRefresh({
                     source: "dom-shortcut",
                     type: "delete-sync",
                     forceReload: false,
                  });
               } catch {}
            }, 0);
         }, DELETE_ANIMATION_MS);

         deleteTimersRef.current.set(idStr, timerId);
      },
      [dispatch, invalidateMonthReservations],
   );

   useEffect(() => {
      setDeleteFn(deleteReservationById);
   }, [deleteReservationById]);

   const pasteFromCopyToSlot = useCallback(
      async (copy, slot) => {
         if (!copy || !slot) return;

         const slotStartDate = toDateSafe(slot.slotStart);
         if (!slotStartDate) return;

         const startTimeToSend = buildStartTimeForSlot(slot.slotStart);
         if (!startTimeToSend) return;

         // Pentru preview-ul optimist folosim exact ora slotului selectat,
         // ca să evităm orice offset/shift la randarea locală.
         const optimisticStartTime =
            toLocalDateTimeString(slotStartDate) || startTimeToSend;

         let instructorIdNum = Number(
            slot.actionInstructorId ?? slot.instructorId,
         );
         if (!Number.isFinite(instructorIdNum) || instructorIdNum <= 0) {
            instructorIdNum = Number(copy.instructorId);
         }
         const userIdNum = Number(copy.userId);
         if (!Number.isFinite(instructorIdNum) || instructorIdNum <= 0) return;
         if (!Number.isFinite(userIdNum) || userIdNum <= 0) return;

         const fallbackSector = copy.sector || "Botanica";
         const fallbackGearbox = normalizeGearbox(copy.gearbox || "Manual");
         const fallbackColor =
            typeof copy.color === "string" && copy.color.trim()
               ? copy.color.trim()
               : NO_COLOR_TOKEN;
         const fallbackPrivateMessage =
            typeof copy.privateMessage === "string" ? copy.privateMessage : "";

         const optimisticId = `tmp-dom-paste-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;
         dispatch(
            addReservationLocal({
               id: optimisticId,
               userId: userIdNum,
               instructorId: instructorIdNum,
               startTime: optimisticStartTime,
               sector: fallbackSector,
               gearbox: fallbackGearbox,
               privateMessage: fallbackPrivateMessage,
               color: fallbackColor,
               _optimistic: true,
               _optimisticPending: true,
            }),
         );

         try {
            triggerCalendarRefresh({
               source: "dom-shortcut",
               type: "paste-optimistic",
               forceReload: false,
            });
         } catch {}

         try {
            const createResult = await createReservationsForUser({
               userId: userIdNum,
               instructorId: instructorIdNum,
               reservations: [
                  {
                     startTime: startTimeToSend,
                     sector: fallbackSector,
                     gearbox: fallbackGearbox,
                     privateMessage: fallbackPrivateMessage,
                     color: fallbackColor,
                     instructorId: instructorIdNum,
                  },
               ],
            });

            const createdCandidates = extractCreatedReservations(createResult);
            const createdIds = createdCandidates
               .map((item) => reservationIdFromAny(item))
               .filter((id) => id != null)
               .map((id) => String(id));
            const targetSlotKey = toSlotKeyForCompare(startTimeToSend);
            let createdReservation = null;
            let bestScore = Number.NEGATIVE_INFINITY;
            for (const item of createdCandidates) {
               const uid = Number(reservationUserIdFromAny(item));
               const iid = Number(reservationInstructorIdFromAny(item));
               const rid = reservationIdFromAny(item);
               const slotKey = toSlotKeyForCompare(reservationStartFromAny(item));

               let score = 0;
               if (rid != null) score += 2;
               if (Number.isFinite(uid) && uid === userIdNum) score += 4;
               if (Number.isFinite(iid) && iid === instructorIdNum) score += 4;
               if (targetSlotKey && slotKey && targetSlotKey === slotKey) score += 8;

               if (score > bestScore) {
                  bestScore = score;
                  createdReservation = item;
               }
            }
            if (!createdReservation) {
               createdReservation = createdCandidates[0] || null;
            }

            const createdId = reservationIdFromAny(createdReservation);
            const confirmedId =
               createdId != null ? String(createdId) : String(optimisticId);
            if (confirmedId && confirmedId !== String(optimisticId)) {
               dispatch(removeReservationLocal(confirmedId));
            }
            dispatch(
               patchReservationLocal({
                  id: optimisticId,
                  changes: {
                     id: confirmedId,
                     userId: userIdNum,
                     instructorId: instructorIdNum,
                     // Păstrăm ora slotului selectat pentru confirmarea locală:
                     // elimină saltul de oră cauzat de formate TZ diferite în răspuns.
                     startTime: optimisticStartTime,
                     sector:
                        createdReservation?.sector ??
                        createdReservation?.reservation?.sector ??
                        fallbackSector,
                     gearbox: normalizeGearbox(
                        createdReservation?.gearbox ??
                           createdReservation?.reservation?.gearbox ??
                           fallbackGearbox,
                     ),
                     privateMessage:
                        createdReservation?.privateMessage ??
                        createdReservation?.reservation?.privateMessage ??
                        fallbackPrivateMessage,
                     color:
                        createdReservation?.color ??
                        createdReservation?.reservation?.color ??
                        fallbackColor,
                     _optimistic: false,
                     _optimisticPending: false,
                     ...(createdReservation?.user
                        ? { user: createdReservation.user }
                        : {}),
                  },
               }),
            );

            try {
               triggerCalendarRefresh({
                  source: "dom-shortcut",
                  type: "paste-sync",
                  forceReload: false,
               });
            } catch {}

            try {
               if (typeof window !== "undefined") {
                  window.dispatchEvent(
                     new CustomEvent("calendarplus-local-mutation", {
                        detail: {
                           type: "create",
                           source: "paste",
                           reservationId:
                              createdId != null ? String(createdId) : undefined,
                           reservationIds: createdIds,
                        },
                     }),
                  );
               }
            } catch {}
         } catch (err) {
            console.error("Paste create failed (CalendarPlus DOM):", err);
            dispatch(removeReservationLocal(optimisticId));
            try {
               triggerCalendarRefresh({
                  source: "dom-shortcut",
                  type: "paste-failed",
                  forceReload: false,
               });
            } catch {}
            return;
         }

         return;
      },
      [dispatch],
   );

   useEffect(() => {
      setPasteFn(pasteFromCopyToSlot);
   }, [pasteFromCopyToSlot]);

   const isSlotBusyByReservation = useCallback((instructorId, slotKey) => {
      const inst = String(instructorId || "").trim();
      const key = String(slotKey || "").trim();
      if (!inst || !key) return false;

      const root = rootRef.current;
      if (!root) return false;

      const selector = `[data-cp-kind="slot"][data-inst-id="${escapeAttrSelectorValue(
         inst,
      )}"][data-slot-key="${escapeAttrSelectorValue(key)}"]`;
      const slotEl = root.querySelector(selector);
      if (!slotEl) return false;

      return slotEl.getAttribute("data-has-event") === "1";
   }, []);

   const blockSelectedSlot = useCallback(async (slot) => {
      if (!slot?.slotStart) return;

      let instructorIdNum = Number(slot.actionInstructorId ?? slot.instructorId);
      if (!Number.isFinite(instructorIdNum) || instructorIdNum <= 0) return;

      const dateTimeToSend = buildStartTimeForSlot(slot.slotStart);
      if (!dateTimeToSend) return;

      const slotStartDate = toDateSafe(slot.slotStart);
      if (!slotStartDate) return;
      const slotKey = localKeyFromTs(slotStartDate, MOLDOVA_TZ);
      const instructorIdStr = String(instructorIdNum);
      if (isSlotBusyByReservation(instructorIdStr, slotKey)) {
         return;
      }

      try {
         triggerCalendarRefresh({
            source: "dom-shortcut",
            type: "blackout-slot-patch",
            instructorId: instructorIdStr,
            op: "add",
            slotKey,
            forceReload: false,
         });
      } catch {}

      try {
         await addInstructorBlackout(instructorIdNum, dateTimeToSend);
         scheduleCalendarRefresh({
            source: "dom-shortcut",
            type: "blackouts-changed",
            instructorId: instructorIdStr,
            forceReload: false,
         });
      } catch (err) {
         console.error("Block slot failed (CalendarPlus DOM):", err);
         try {
            triggerCalendarRefresh({
               source: "dom-shortcut",
               type: "blackout-slot-patch",
               instructorId: instructorIdStr,
               op: "remove",
               slotKey,
               forceReload: false,
            });
         } catch {}
      }
   }, [isSlotBusyByReservation]);

   useEffect(() => {
      setBlockFn(blockSelectedSlot);
   }, [blockSelectedSlot]);

   const blockRangeSelectedSlots = useCallback(async () => {
      if (rangeBatchRunningRef.current) return;

      const queue = (rangeSelectedEntriesRef.current || []).filter(
         (entry) => entry && !entry.blocked && !entry.hasEvent,
      );
      if (!queue.length) return;

      rangeBatchRunningRef.current = true;
      try {
         const workersCount = Math.max(
            1,
            Math.min(RANGE_BLOCK_BATCH_CONCURRENCY, queue.length),
         );
         let nextIndex = 0;

         const worker = async () => {
            while (nextIndex < queue.length) {
               const idx = nextIndex;
               nextIndex += 1;
               const entry = queue[idx];

               await blockSelectedSlot({
                  instructorId: entry.instructorId,
                  actionInstructorId: entry.instructorId,
                  slotStart: entry.slotStart,
                  slotEnd: entry.slotEnd,
                  localSlotKey: entry.slotKey,
               });

               if (RANGE_BLOCK_BATCH_DELAY_MS > 0 && idx < queue.length - 1) {
                  await new Promise((resolve) =>
                     setTimeout(resolve, RANGE_BLOCK_BATCH_DELAY_MS),
                  );
               }
            }
         };

         await Promise.all(
            Array.from({ length: workersCount }, () => worker()),
         );
      } finally {
         rangeBatchRunningRef.current = false;
      }
   }, [blockSelectedSlot]);

   useEffect(() => {
      const onKeyDownCapture = (e) => {
         if (!isRangeMultiSelectPressed(e)) return;
         if (isEditableTarget(e.target)) return;
         if (String(e.key || "").toLowerCase() !== "l") return;

         const hasRangeSelection =
            (rangeSelectedEntriesRef.current || []).filter(
               (x) => !x?.blocked && !x?.hasEvent,
            ).length > 0;
         if (!hasRangeSelection) return;

         e.preventDefault();
         e.stopPropagation();
         if (typeof e.stopImmediatePropagation === "function") {
            e.stopImmediatePropagation();
         }
         void blockRangeSelectedSlots();
      };

      window.addEventListener("keydown", onKeyDownCapture, true);
      return () =>
         window.removeEventListener("keydown", onKeyDownCapture, true);
   }, [blockRangeSelectedSlots]);

   const slotsSafe = useMemo(() => {
      const out = [];
      for (const slot of Array.isArray(slots) ? slots : []) {
         const start = toDateSafe(slot?.start);
         const end = toDateSafe(slot?.end);
         if (!start || !end) continue;
         out.push({
            start,
            end,
            key: localKeyFromTs(start, MOLDOVA_TZ),
            label: hhmm(start),
         });
      }
      return out;
   }, [slots]);

   const slotIndexByKey = useMemo(() => {
      const map = new Map();
      slotsSafe.forEach((slot, idx) => {
         map.set(slot.key, idx);
      });
      return map;
   }, [slotsSafe]);

   const z = 1;
   const colWidth = Math.max(80, Math.round(Number(layout?.colWidth || 150)));
   const colGap = 0;
   const headerHeight = Math.max(
      60,
      Math.round(Number(layout?.headerHeight || 100) * z),
   );
   const colsPerRow = 4;
   const rowGap = 10;
   const slotHeight = Math.max(24, Math.round(Number(layout?.slotHeight || 120)));
   const slotGap = 0;
   const dayviewStructure = useMemo(
      () =>
         getCachedDayviewStructure({
            instructors,
            colsPerRow,
            slotsCount: slotsSafe.length,
            slotHeight,
            slotGap,
            headerHeight,
            rowGap,
            colWidth,
            colGap,
         }),
      [
         instructors,
         colsPerRow,
         slotsSafe.length,
         slotHeight,
         slotGap,
         headerHeight,
         rowGap,
         colWidth,
         colGap,
      ],
   );
   const effectiveInstructors = dayviewStructure.effectiveInstructors;
   const headersMeta = dayviewStructure.headersMeta;
   const headerMetrics = dayviewStructure.headerMetrics;

   const isDayNearViewport = useMemo(() => {
      if (DISABLE_SECTION_VIRTUALIZATION) return true;

      const viewWidth = Math.max(0, Number(viewportWidth) || 0);
      if (viewWidth <= 0) return true;

      const viewLeft = Math.max(0, Number(viewportScrollLeft) || 0);
      const viewRight = viewLeft + viewWidth;
      const dayLeft = Math.max(0, Number(dayOffsetLeft) || 0);
      const dayRight = dayLeft + Math.max(0, Number(headerMetrics.dayWidth) || 0);
      if (dayRight <= dayLeft) return true;

      const baseMargin = isPanInteracting
         ? DAY_OFFSCREEN_MARGIN_BASE_PX
         : Math.round(
              DAY_OFFSCREEN_MARGIN_BASE_PX * (IS_LOW_SPEC_DEVICE ? 0.78 : 0.72),
           );
      const viewportMargin = Math.round(
         viewWidth *
            (isPanInteracting
               ? IS_LOW_SPEC_DEVICE
                  ? 0.9
                  : 1.05
               : IS_LOW_SPEC_DEVICE
                 ? 0.65
                 : 0.8),
      );
      const dayWidthMargin = Math.round(
         Math.max(0, Number(headerMetrics.dayWidth) || 0) *
            (isPanInteracting ? 0.6 : 0.42),
      );
      const margin = Math.max(
         baseMargin,
         viewportMargin,
         dayWidthMargin,
      );

      return !(dayRight < viewLeft - margin || dayLeft > viewRight + margin);
   }, [
      viewportWidth,
      viewportScrollLeft,
      dayOffsetLeft,
      headerMetrics.dayWidth,
      isPanInteracting,
   ]);
   const isDayIntersectingViewport = useMemo(() => {
      const viewWidth = Math.max(0, Number(viewportWidth) || 0);
      if (viewWidth <= 0) return true;

      const viewLeft = Math.max(0, Number(viewportScrollLeft) || 0);
      const viewRight = viewLeft + viewWidth;
      const dayLeft = Math.max(0, Number(dayOffsetLeft) || 0);
      const dayRight = dayLeft + Math.max(0, Number(headerMetrics.dayWidth) || 0);
      if (dayRight <= dayLeft) return true;

      return !(dayRight < viewLeft || dayLeft > viewRight);
   }, [viewportWidth, viewportScrollLeft, dayOffsetLeft, headerMetrics.dayWidth]);
   const dayNearViewportSeenAtRef = useRef(0);
   const dayNearViewportNowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
   if (isDayNearViewport) {
      dayNearViewportSeenAtRef.current = dayNearViewportNowMs;
   }
   const dayNearViewportBuffered =
      isDayNearViewport ||
      dayNearViewportNowMs - (dayNearViewportSeenAtRef.current || 0) <=
         (isPanInteracting
            ? IS_LOW_SPEC_DEVICE
               ? 520
               : 400
            : IS_LOW_SPEC_DEVICE
              ? 280
              : 200);
   useEffect(() => {
      if (dayNearViewportBuffered) return;
      clearRangeSelection();
   }, [dayNearViewportBuffered, clearRangeSelection]);

   const rowRenderRange = useMemo(() => {
      const rowsCount = Number(headerMetrics.rowsCount || 0);
      if (!rowsCount) return { start: 0, end: 0 };
      if (DISABLE_SECTION_VIRTUALIZATION) return { start: 0, end: rowsCount - 1 };

      const viewH = Number(viewportHeight) || 0;
      if (viewH <= 0) return { start: 0, end: rowsCount - 1 };

      const viewTop = Math.max(0, Number(viewportScrollTop) || 0);
      const viewBottom = viewTop + viewH;
      const overscanPx = Math.max(
         isPanInteracting
            ? IS_LOW_SPEC_DEVICE
               ? 250
               : 330
            : IS_LOW_SPEC_DEVICE
              ? 170
              : 230,
         Math.round(
            viewH *
               (isPanInteracting
                  ? IS_LOW_SPEC_DEVICE
                     ? 0.62
                     : 0.8
                  : IS_LOW_SPEC_DEVICE
                    ? 0.45
                    : 0.6),
         ),
      );

      let start = 0;
      let end = rowsCount - 1;

      for (let r = 0; r < rowsCount; r++) {
         const rowTop = Number(headerMetrics.rowTops[r] || 0);
         const rowBottom = rowTop + headerMetrics.rowHeights[r] + headerHeight;
         if (rowBottom >= viewTop - overscanPx) {
            start = r;
            break;
         }
      }

      for (let r = rowsCount - 1; r >= 0; r--) {
         const rowTop = Number(headerMetrics.rowTops[r] || 0);
         if (rowTop <= viewBottom + overscanPx) {
            end = r;
            break;
         }
      }

      if (end < start) return { start: 0, end: rowsCount - 1 };
      return { start, end };
   }, [
      headerMetrics,
      viewportScrollTop,
      viewportHeight,
      headerHeight,
      isPanInteracting,
   ]);

   const colRenderRange = useMemo(() => {
      if (DISABLE_SECTION_VIRTUALIZATION) return { start: 0, end: colsPerRow - 1 };
      if (isPanInteracting && isDayIntersectingViewport) {
         return { start: 0, end: colsPerRow - 1 };
      }
      const viewW = Number(viewportWidth) || 0;
      if (viewW <= 0) return { start: 0, end: colsPerRow - 1 };

      const stride = Math.max(1, colWidth + colGap);
      const overscanPx = Math.max(
         isPanInteracting
            ? IS_LOW_SPEC_DEVICE
               ? 370
               : 500
            : IS_LOW_SPEC_DEVICE
              ? 240
              : 330,
         Math.round(
            colWidth *
               (isPanInteracting
                  ? IS_LOW_SPEC_DEVICE
                     ? 2.7
                     : 3.5
                  : IS_LOW_SPEC_DEVICE
                    ? 1.95
                    : 2.6),
         ),
      );
      const globalViewLeft = Math.max(0, Number(viewportScrollLeft) || 0);
      const localDayLeft = Math.max(0, Number(dayOffsetLeft) || 0);
      const localViewLeft = Math.max(0, globalViewLeft - localDayLeft);
      const localViewRight = localViewLeft + viewW;
      const scanStart = localViewLeft - overscanPx;
      const scanEnd = localViewRight + overscanPx;

      const start = Math.max(0, Math.floor(scanStart / stride));
      const end = Math.min(colsPerRow - 1, Math.ceil(scanEnd / stride));
      if (end < start) return { start: 0, end: -1 };
      return { start, end };
   }, [
      viewportWidth,
      viewportScrollLeft,
      dayOffsetLeft,
      colsPerRow,
      colWidth,
      colGap,
      isPanInteracting,
      isDayIntersectingViewport,
   ]);

   const slotLabelByIndex = useMemo(() => {
      return slotsSafe.map((slot) => slot.label);
   }, [slotsSafe]);

   const eventsPrepared = useMemo(() => {
      if (!dayNearViewportBuffered) return EMPTY_CELL_ITEMS;

      const list = Array.isArray(events) ? events : [];
      if (!list.length || !slotsSafe.length) return EMPTY_CELL_ITEMS;

      const hasHidden = list.some((ev) => {
         const rid = getReservationId(ev);
         return rid != null && isHidden(rid);
      });
      const base = hasHidden
         ? list.filter((ev) => {
              const rid = getReservationId(ev);
              return rid == null || !isHidden(rid);
           })
         : list;

      const metaByInst = new Map();
      headersMeta.forEach((h) => {
         const inst = h?.inst;
         if (!inst) return;
         metaByInst.set(String(inst.id || ""), h);
      });

      const cancelPads = headersMeta.filter((h) => h?.inst?._padType === "cancel");
      const lateralPadsByRow = new Map();
      headersMeta.forEach((h) => {
         if (h?.inst?._padType === "lateral") lateralPadsByRow.set(h.row, h);
      });

      const plain = [];
      const canceledForPad = [];

      for (const ev of base) {
         const rid = getReservationId(ev);
         if (rid != null && isHidden(rid)) continue;

         const start = toDateSafe(ev?.start);
         if (!start) continue;

         const instId = String(getInstructorId(ev) || "");
         const currentMeta = metaByInst.get(instId);

         let mappedInstId = instId;
         let mappedPadSlotIndex = null;

         const hhmmLabel = hhmm(start);
         const lateralIdx = LATERAL_TIME_MARKS.indexOf(hhmmLabel);
         if (lateralIdx >= 0 && currentMeta) {
            const lateralMeta = lateralPadsByRow.get(currentMeta.row);
            if (lateralMeta?.inst?.id) {
               mappedInstId = String(lateralMeta.inst.id);
               mappedPadSlotIndex = Math.min(
                  lateralIdx,
                  LATERAL_SLOTS_PER_COLUMN - 1,
                  Math.max(0, slotsSafe.length - 1),
               );
            }
         }

         const slotIdx =
            mappedPadSlotIndex != null
               ? mappedPadSlotIndex
               : closestSlotIndex(slotsSafe, slotIndexByKey, start);

         if (slotIdx < 0) continue;

         const student =
            `${ev?.studentFirst || ""} ${ev?.studentLast || ""}`.trim() ||
            "Programare";
         const phone = getStudentPhoneFromEv(ev);
         const privateMessage =
            String(ev?.eventPrivateMessage || "").trim() ||
            String(getStudentPrivateMessageFromEv(ev) || "").trim();
         const raw = ev?.raw || {};
         const reservationId =
            rid != null ? String(rid) : String(ev?.id || "");
         const isOptimisticPending = !!(
            raw?._optimisticPending ??
            raw?._optimistic ??
            ev?._optimisticPending ??
            ev?._optimistic
         );
         const isDeleting =
            !!reservationId && deletingReservationIds.has(reservationId);
         const isFavorite = raw?.isFavorite === true || raw?.is_favorite === true;
         const isImportant = raw?.isImportant === true || raw?.is_important === true;
         const statusMarks = [];
         if (isFavorite) statusMarks.push("⁂");
         if (isImportant) statusMarks.push("‼");
         const gearboxBadge =
            resolveGearboxBadge(ev?.gearboxLabel) ||
            resolveGearboxBadge(raw?.gearbox || ev?.gearbox);
         const timeText = hhmm(start);
         const baseItem = {
            id: ev?.id != null ? String(ev.id) : "",
            reservationId,
            instructorId: mappedInstId,
            slotIdx,
            start,
            end: toDateSafe(ev?.end),
            student,
            phone,
            privateMessage,
            rawEvent: ev,
            userId: getEventUserId(ev),
            sector: ev?.raw?.sector || ev?.sector || "Botanica",
            gearbox: ev?.raw?.gearbox || ev?.gearbox || "Manual",
            timeText,
            gearboxBadge,
            statusMarks: statusMarks.join(" · "),
            isFavorite,
            isImportant,
            isOptimisticPending,
            isDeleting,
         };

         if (isEventCanceled(ev)) {
            // marcajul rămâne în locul original, colorat galben.
            plain.push({
               ...baseItem,
               colorToken: "--event-yellow",
               canceled: false,
               isCanceledOriginMarker: true,
            });
            canceledForPad.push({
               ...baseItem,
               colorToken: normalizeColorToken(ev?.color),
               canceled: true,
               isCanceledOriginMarker: false,
            });
            continue;
         }

         plain.push({
            ...baseItem,
            colorToken: normalizeColorToken(ev?.color),
            canceled: false,
            isCanceledOriginMarker: false,
         });
      }

      if (canceledForPad.length && cancelPads.length) {
         const maxSlots = Math.max(1, Math.min(CANCEL_SLOTS_PER_COLUMN, slotsSafe.length));
         canceledForPad
            .slice()
            .sort((a, b) => {
               const aa = a?.start?.getTime?.() || 0;
               const bb = b?.start?.getTime?.() || 0;
               return aa - bb;
            })
            .forEach((item, idx) => {
               const padMeta = cancelPads[Math.floor(idx / maxSlots) % cancelPads.length];
               const slotIdx = idx % maxSlots;
               if (!padMeta?.inst?.id || !item?.start) return;

               plain.push({
                  ...item,
                  instructorId: String(padMeta.inst.id),
                  slotIdx,
                  canceled: true,
                  isCanceledOriginMarker: false,
               });
            });
      }

      return plain;
   }, [
      events,
      headersMeta,
      slotsSafe,
      slotIndexByKey,
      dayNearViewportBuffered,
      deletingReservationIds,
   ]);

   const byCell = useMemo(() => {
      const map = new Map();
      for (const item of eventsPrepared) {
         const key = `${item.instructorId}|${item.slotIdx}`;
         const arr = map.get(key) || [];
         arr.push(item);
         map.set(key, arr);
      }
      return map;
   }, [eventsPrepared]);
   const eventByReservationId = useMemo(() => {
      const map = new Map();
      for (const item of eventsPrepared) {
         const rid = String(item?.reservationId || item?.id || "");
         if (!rid || map.has(rid)) continue;
         map.set(rid, item);
      }
      return map;
   }, [eventsPrepared]);

   const selectedEvent = getSelectedEvent();
   const selectedSlot = getSelectedSlot();
   const selectedEventId = String(selectedEvent?.raw?.id ?? selectedEvent?.id ?? "");
   const selectedSlotInstructorId = String(
      selectedSlot?.actionInstructorId ?? selectedSlot?.instructorId ?? "",
   );
   const selectedSlotKey =
      selectedSlot?.localSlotKey ||
      (selectedSlot?.slotStart
         ? localKeyFromTs(selectedSlot.slotStart, MOLDOVA_TZ)
         : "");

   const renderActiveId = String(activeEventId ?? "");
   const renderSearchId = String(activeSearchEventId ?? "");
   const displayEventByCellKey = useMemo(() => {
      const map = new Map();
      for (const [cellKey, itemsRaw] of byCell.entries()) {
         const items = Array.isArray(itemsRaw) ? itemsRaw : EMPTY_CELL_ITEMS;
         if (!items.length) continue;

         let chosen = null;

         if (renderActiveId) {
            chosen =
               items.find(
                  (item) => String(item?.reservationId || "") === renderActiveId,
               ) || null;
         }
         if (!chosen && renderSearchId) {
            chosen =
               items.find(
                  (item) => String(item?.reservationId || "") === renderSearchId,
               ) || null;
         }
         if (!chosen && selectedEventId) {
            chosen =
               items.find(
                  (item) => String(item?.reservationId || "") === selectedEventId,
               ) || null;
         }
         if (
            !chosen &&
            presenceByReservationUsers instanceof Map &&
            presenceByReservationUsers.size
         ) {
            chosen =
               items.find((item) =>
                  presenceByReservationUsers.has(
                     String(item?.reservationId || ""),
                  ),
               ) || null;
         }
         if (!chosen) chosen = items[0] || null;
         if (chosen) map.set(cellKey, chosen);
      }
      return map;
   }, [
      byCell,
      renderActiveId,
      renderSearchId,
      selectedEventId,
      presenceByReservationUsers,
   ]);

   const sharedUsersById =
      sharedLookups?.usersById instanceof Map ? sharedLookups.usersById : null;
   const sharedUsersByPhone =
      sharedLookups?.usersByPhone instanceof Map
         ? sharedLookups.usersByPhone
         : null;
   const sharedUsersByNormName =
      sharedLookups?.usersByNormName instanceof Map
         ? sharedLookups.usersByNormName
         : null;
   const sharedInstructorUsersByNormName =
      sharedLookups?.instructorUsersByNormName instanceof Map
         ? sharedLookups.instructorUsersByNormName
         : null;
   const sharedInstructorsFullById =
      sharedLookups?.instructorsFullById instanceof Map
         ? sharedLookups.instructorsFullById
         : null;
   const sharedCarsByInstructorId =
      sharedLookups?.carsByInstructorId instanceof Map
         ? sharedLookups.carsByInstructorId
         : null;

   const usersById = useMemo(() => {
      if (sharedUsersById) return sharedUsersById;
      const map = new Map();
      for (const user of Array.isArray(users) ? users : []) {
         if (user?.id == null) continue;
         map.set(String(user.id), user);
      }
      return map;
   }, [sharedUsersById, users]);
   const usersByPhone = useMemo(() => {
      if (sharedUsersByPhone) return sharedUsersByPhone;
      const map = new Map();
      for (const user of Array.isArray(users) ? users : []) {
         const key = String(user?.phone || "").replace(/\D+/g, "");
         if (!key || map.has(key)) continue;
         map.set(key, user);
      }
      return map;
   }, [sharedUsersByPhone, users]);
   const usersByNormName = useMemo(() => {
      if (sharedUsersByNormName) return sharedUsersByNormName;
      const map = new Map();
      for (const user of Array.isArray(users) ? users : []) {
         const key = norm(`${user?.firstName ?? ""} ${user?.lastName ?? ""}`);
         if (!key || map.has(key)) continue;
         map.set(key, user);
      }
      return map;
   }, [sharedUsersByNormName, users]);
   const instructorUsersByNormName = useMemo(() => {
      if (sharedInstructorUsersByNormName) return sharedInstructorUsersByNormName;
      const map = new Map();
      for (const user of Array.isArray(users) ? users : []) {
         if (String(user?.role || "").toUpperCase() !== "INSTRUCTOR") continue;
         const key = norm(`${user?.firstName ?? ""} ${user?.lastName ?? ""}`);
         if (!key || map.has(key)) continue;
         map.set(key, user);
      }
      return map;
   }, [sharedInstructorUsersByNormName, users]);
   const instructorsFullById = useMemo(() => {
      if (sharedInstructorsFullById) return sharedInstructorsFullById;
      const map = new Map();
      for (const inst of Array.isArray(instructorsFull) ? instructorsFull : []) {
         if (inst?.id == null) continue;
         map.set(String(inst.id), inst);
      }
      return map;
   }, [sharedInstructorsFullById, instructorsFull]);
   const carsByInstructorId = useMemo(() => {
      if (sharedCarsByInstructorId) return sharedCarsByInstructorId;
      const map = new Map();
      for (const car of Array.isArray(cars) ? cars : []) {
         const iid = String(car?.instructorId ?? car?.instructor_id ?? "").trim();
         if (!iid || map.has(iid)) continue;
         map.set(iid, car);
      }
      return map;
   }, [sharedCarsByInstructorId, cars]);
   const dayDateForHeaders = useMemo(() => {
      const d = toDateSafe(dayStart);
      return d || new Date();
   }, [dayStart]);
   const instructorBadgeById = useMemo(() => {
      const map = new Map();
      for (const meta of headersMeta) {
         const inst = meta?.inst;
         if (!inst || isPadInstructor(inst) || isGapInstructor(inst)) continue;
         const iid = String(inst.id || "").trim();
         if (!iid) continue;
         const badge = buildInstructorBadge(inst?.name || "");
         if (badge) map.set(iid, badge);
      }
      return map;
   }, [headersMeta]);
   const headerMetaByInstructorId = useMemo(() => {
      const map = new Map();

      for (const meta of headersMeta) {
         const inst = meta?.inst || null;
         if (!inst || isPadInstructor(inst) || isGapInstructor(inst)) continue;

         const instId = String(inst.id || "").trim();
         if (!instId) continue;

         const full = instructorsFullById.get(instId) || inst;
         const directUserId =
            full?.userId ?? full?.user_id ?? full?.user?.id ?? null;

         const hasInstructorRole = (user) =>
            String(user?.role || "").toUpperCase() === "INSTRUCTOR";

         let instructorUser = null;
         if (directUserId != null) {
            const candidate = usersById.get(String(directUserId)) || null;
            if (candidate && hasInstructorRole(candidate)) instructorUser = candidate;
         }

         if (!instructorUser) {
            const fullNameSeed = `${full?.firstName ?? ""} ${
               full?.lastName ?? ""
            }`.trim();
            const nameKey = norm(fullNameSeed || String(inst?.name || ""));
            if (nameKey) {
               const byName = instructorUsersByNormName.get(nameKey) || null;
               if (byName && hasInstructorRole(byName)) instructorUser = byName;
            }
         }

         const privateMsg = String(instructorUser?.privateMessage ?? "").trim();
         const noteForDay = getNoteForDate(privateMsg, dayDateForHeaders);
         const plate = String(
            carsByInstructorId.get(instId)?.plateNumber ?? "",
         ).trim();

         map.set(instId, {
            userId: instructorUser?.id ?? null,
            privateMessage: privateMsg,
            noteForDay,
            plate,
         });
      }

      return map;
   }, [
      headersMeta,
      instructorsFullById,
      usersById,
      instructorUsersByNormName,
      dayDateForHeaders,
      carsByInstructorId,
   ]);
   const blockedKeyMapNormalized = useMemo(() => {
      return normalizeBlockedMapInput(blockedKeyMap);
   }, [blockedKeyMap, blackoutVer]);
   const pickUserFromStore = useCallback(
      (userIdRaw, phoneRaw, firstNameSeed, lastNameSeed) => {
         const userId = userIdRaw != null ? String(userIdRaw) : "";
         if (userId && usersById.has(userId)) return usersById.get(userId);

         const phoneKey = String(phoneRaw || "").replace(/\D+/g, "");
         if (phoneKey && usersByPhone.has(phoneKey)) return usersByPhone.get(phoneKey);

         const nameKey = norm(`${firstNameSeed || ""} ${lastNameSeed || ""}`);
         if (nameKey && usersByNormName.has(nameKey))
            return usersByNormName.get(nameKey);

         return null;
      },
      [usersById, usersByPhone, usersByNormName],
   );

   const cancelInertiaAndMomentum = useCallback(() => {
      if (typeof window === "undefined") return;
      try {
         window.dispatchEvent(new CustomEvent("dvcancelinertia-all"));
      } catch {}
   }, []);
   const openReservationPopup = useCallback(
      (ev) => {
         if (!ev) return;
         const reservationId = ev.raw?.id ?? ev.id;
         if (!reservationId) return;
         cancelInertiaAndMomentum();
         openPopup("reservationEdit", { reservationId });
      },
      [cancelInertiaAndMomentum],
   );
   const openStudentPopup = useCallback(
      (ev) => {
         if (!ev) return;
         cancelInertiaAndMomentum();

         const raw = ev.raw || {};
         const fallbackName =
            raw?.clientName ||
            raw?.customerName ||
            raw?.name ||
            ev.title ||
            "Programare";

         const phoneVal = getStudentPhoneFromEv(ev);
         const noteFromEvent = String(ev?.eventPrivateMessage || "").trim();
         const reservationId = raw?.id ?? ev.id;
         const userIdRaw =
            raw?.userId ?? ev?.userId ?? raw?.user_id ?? raw?.user?.id ?? null;
         const firstNameSeed =
            String(ev?.studentFirst || "").trim() ||
            String(fallbackName || "").split(" ")[0] ||
            "";
         const lastNameSeed = String(ev?.studentLast || "").trim();

         const userFull = pickUserFromStore(
            userIdRaw,
            phoneVal,
            firstNameSeed,
            lastNameSeed,
         );

         const firstName = String(userFull?.firstName ?? firstNameSeed ?? "").trim();
         const lastName = String(userFull?.lastName ?? lastNameSeed ?? "").trim();
         const phone = String(userFull?.phone ?? phoneVal ?? "").trim();
         const email = String(userFull?.email ?? "").trim();
         const idnp = String(userFull?.idnp ?? "").trim();
         const noteFromProfile = String(
            userFull?.privateMessage ?? getStudentPrivateMessageFromEv(ev) ?? "",
         ).trim();
         const desiredInstructorId =
            userFull?.desiredInstructorId != null
               ? userFull.desiredInstructorId
               : null;
         const color = String(
            userFull?.color ?? userFull?.profileColor ?? "",
         ).trim();
         const role = String(userFull?.role ?? "").trim();

         if (ev?.studentId || userIdRaw) {
            openPopup("studentDetails", {
               student: {
                  id: ev.studentId ?? null,
                  userId: userFull?.id ?? userIdRaw ?? null,
                  firstName,
                  lastName,
                  phone,
                  email,
                  idnp,
                  privateMessage: noteFromProfile,
                  desiredInstructorId,
                  color,
                  role,
                  isConfirmed: !!(raw?.isConfirmed ?? ev?.isConfirmed),
               },
               noteFromEvent,
               studentPrivateMessage: noteFromProfile,
               fromReservationId: reservationId,
               fromReservationStartISO: raw?.startTime || raw?.start || ev?.start || null,
            });
            return;
         }

         openReservationPopup(ev);
      },
      [cancelInertiaAndMomentum, openReservationPopup, pickUserFromStore],
   );

   const finishWaitEdit = useCallback(
      async (commit) => {
         const current = waitEdit;
         setWaitEdit(null);

         if (!commit || !current) return;

         const text = String(current.text || "").trim();
         const globalIdx = Number(current.globalIdx);
         if (!Number.isFinite(globalIdx) || globalIdx < 0) return;

         if (waitCommitRef.current) return;
         waitCommitRef.current = true;

         const openedFallbackSnapshot = readWaitNoteSnapshot(
            waitNotesRef.current || {},
            globalIdx,
         );

         let liveMap = waitNotesRef.current || {};
         try {
            const latest = await fetchLatestWaitNotesMap();
            if (latest && typeof latest === "object") liveMap = latest;
         } catch (err) {
            console.error("wait-slot reload before save failed:", err);
         }

         const liveSnapshot = readWaitNoteSnapshot(liveMap, globalIdx);
         const openedSnapshot = {
            id:
               current.baseNoteId != null
                  ? String(current.baseNoteId)
                  : openedFallbackSnapshot.id,
            text:
               current.baseText != null
                  ? String(current.baseText || "").trim()
                  : openedFallbackSnapshot.text,
         };

         const openedSig = buildWaitNoteSnapshotSignature(openedSnapshot);
         const liveSig = buildWaitNoteSnapshotSignature(liveSnapshot);

         if (liveSig !== openedSig) {
            console.warn(
               "wait-slot conflict detected: another user changed this note before save",
               { globalIdx },
            );
            setWaitEdit({
               instId: current.instId,
               slotIdx: current.slotIdx,
               globalIdx,
               text: liveSnapshot.text,
               baseNoteId: liveSnapshot.id,
               baseText: liveSnapshot.text,
            });
            waitCommitRef.current = false;
            return;
         }

         const existingId = liveSnapshot.id;

         setWaitNotes((prev) => {
            const next = { ...(prev || {}) };
            if (text) next[globalIdx] = { id: existingId, text };
            else delete next[globalIdx];

            waitNotesRef.current = next;

            if (waitRangeKey) {
               WAIT_NOTES_CACHE.set(waitRangeKey, {
                  data: next,
                  error: null,
                  promise: null,
               });
            }
            return next;
         });

         if (!text) {
            waitCommitRef.current = false;
            return;
         }

         const payload = {
            title: String(globalIdx),
            content: text,
            type: "wait-slot",
         };
         const noteDateIso = buildWaitNoteDateIsoForSlot(
            dayStart,
            globalIdx,
            WAIT_NOTE_MODE,
         );
         if (noteDateIso) payload.date = noteDateIso;

         const persist = existingId
            ? updateNote(existingId, payload)
            : createNote(payload);

         persist
            .then((saved) => {
               const realId =
                  saved?.id ??
                  saved?._id ??
                  saved?.noteId ??
                  saved?.note_id ??
                  existingId;
               if (!realId) return;

               setWaitNotes((prev) => {
                  const prevNote2 = prev?.[globalIdx];
                  if (!prevNote2) return prev;
                  if (prevNote2.id === realId) return prev;

                  const next = {
                     ...prev,
                     [globalIdx]: { ...prevNote2, id: realId },
                  };

                  waitNotesRef.current = next;

                  if (waitRangeKey) {
                     WAIT_NOTES_CACHE.set(waitRangeKey, {
                        data: next,
                        error: null,
                        promise: null,
                     });
                  }

                  return next;
               });
            })
            .catch((err) => {
               console.error("notesService upsert wait-slot error:", err);
            })
            .finally(() => {
               waitCommitRef.current = false;
            });
      },
      [waitEdit, waitRangeKey, dayStart, fetchLatestWaitNotesMap],
   );

   const handleWaitBlur = useCallback(() => {
      finishWaitEdit(true);
   }, [finishWaitEdit]);

   const handleWaitKeyDown = useCallback(
      (e) => {
         if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            finishWaitEdit(true);
         } else if (e.key === "Escape") {
            e.preventDefault();
            finishWaitEdit(false);
         }
      },
      [finishWaitEdit],
   );
   const startHeaderEdit = useCallback(
      (instId) => {
         const id = String(instId || "").trim();
         if (!id) return;
         const meta = headerMetaByInstructorId.get(id) || null;
         if (!meta?.userId) return;
         setHeaderEdit({
            instId: id,
            userId: String(meta.userId),
            privateMessage: String(meta.privateMessage || ""),
            text: String(meta.noteForDay || ""),
         });
      },
      [headerMetaByInstructorId],
   );
   const finishHeaderEdit = useCallback(
      async (commit) => {
         const current = headerEdit;
         setHeaderEdit(null);
         if (!commit || !current?.userId) return;

         const basePrivateMessage = String(current.privateMessage || "");
         let latestPrivateMessage = basePrivateMessage;
         try {
            const freshUser = await getUserById(String(current.userId));
            latestPrivateMessage = String(freshUser?.privateMessage ?? "");
         } catch (err) {
            console.error("header note preflight failed:", err);
            return;
         }

         if (latestPrivateMessage !== basePrivateMessage) {
            const latestText = getNoteForDate(
               latestPrivateMessage,
               dayDateForHeaders,
            );
            console.warn(
               "header note conflict detected: another user updated this note before save",
               { instId: current.instId, userId: current.userId },
            );
            setHeaderEdit({
               instId: current.instId,
               userId: String(current.userId),
               privateMessage: latestPrivateMessage,
               text: latestText,
            });
            return;
         }

         const nextPrivateMessage = upsertNoteForDate(
            latestPrivateMessage,
            dayDateForHeaders,
            current.text || "",
         );
         if (nextPrivateMessage === latestPrivateMessage) return;

         try {
            await dispatch(
               updateUser({
                  id: String(current.userId),
                  data: { privateMessage: nextPrivateMessage },
               }),
            ).unwrap();
         } catch (err) {
            console.error("header note update failed:", err);
         }
      },
      [headerEdit, dayDateForHeaders, dispatch],
   );
   const handleHeaderBlur = useCallback(() => {
      finishHeaderEdit(true);
   }, [finishHeaderEdit]);
   const handleHeaderKeyDown = useCallback(
      (e) => {
         if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            finishHeaderEdit(true);
         } else if (e.key === "Escape") {
            e.preventDefault();
            finishHeaderEdit(false);
         }
      },
      [finishHeaderEdit],
   );

   const clearLongPress = useCallback(() => {
      if (longPressTimerRef.current) {
         clearTimeout(longPressTimerRef.current);
         longPressTimerRef.current = 0;
      }
      longPressStateRef.current = null;
   }, []);
   const handleEventPointerDown = useCallback(
      (e, item) => {
         if (!item?.rawEvent) return;
         if (e.button !== 0 && e.button !== undefined) return;

         clearLongPress();
         longPressStateRef.current = {
            x: e.clientX,
            y: e.clientY,
            pointerId: e.pointerId ?? null,
            item,
         };
         longPressTimerRef.current = window.setTimeout(() => {
            const state = longPressStateRef.current;
            clearLongPress();
            if (!state?.item?.rawEvent) return;

            ignoreClickUntilRef.current = Date.now() + 600;
            setGlobalSelection({ event: state.item.rawEvent, slot: null });
            openStudentPopup(state.item.rawEvent);
         }, LONG_PRESS_MS);
      },
      [clearLongPress, openStudentPopup],
   );
   const handleEventPointerMove = useCallback(
      (e) => {
         const state = longPressStateRef.current;
         if (!state || !longPressTimerRef.current) return;
         if (
            state.pointerId != null &&
            e.pointerId != null &&
            state.pointerId !== e.pointerId
         ) {
            return;
         }

         const dx = e.clientX - state.x;
         const dy = e.clientY - state.y;
         if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) {
            clearLongPress();
         }
      },
      [clearLongPress],
   );
   const handleEventPointerUp = useCallback(() => {
      clearLongPress();
   }, [clearLongPress]);

   const buildRangeHitCache = useCallback(() => {
      const root = rootRef.current;
      if (!root) return null;

      const rootRect = root.getBoundingClientRect();
      const els = root.querySelectorAll(RANGE_SLOT_SELECTOR);
      const items = [];

      for (const el of els) {
         const rangeKey = String(el.getAttribute("data-range-key") || "").trim();
         const instructorId = String(el.getAttribute("data-inst-id") || "").trim();
         const slotKey = String(el.getAttribute("data-slot-key") || "").trim();
         const slotStart = String(el.getAttribute("data-slot-start") || "").trim();
         const slotEnd = String(el.getAttribute("data-slot-end") || "").trim();
         if (!rangeKey || !instructorId || !slotKey || !slotStart || !slotEnd)
            continue;

         const slotRect = el.getBoundingClientRect();
         const leftRel = slotRect.left - rootRect.left;
         const topRel = slotRect.top - rootRect.top;
         const row = Number(el.getAttribute("data-grid-row"));
         const col = Number(el.getAttribute("data-grid-col"));
         const slotIdx = Number(el.getAttribute("data-slot-idx"));

         items.push({
            rangeKey,
            instructorId,
            slotKey,
            slotStart,
            slotEnd,
            blocked: el.getAttribute("data-blocked") === "1",
            hasEvent: el.getAttribute("data-has-event") === "1",
            row: Number.isFinite(row) ? row : 0,
            col: Number.isFinite(col) ? col : 0,
            slotIdx: Number.isFinite(slotIdx) ? slotIdx : 0,
            leftRel,
            topRel,
            rightRel: leftRel + slotRect.width,
            bottomRel: topRel + slotRect.height,
         });
      }

      items.sort(compareRangeEntry);
      const cache = {
         root,
         built: true,
         items,
      };
      rangeHitCacheRef.current = cache;
      return cache;
   }, []);

   const updateRangeSelectionFromPointer = useCallback(
      (clientX, clientY) => {
         const root = rootRef.current;
         const drag = rangeDragRef.current;
         if (!root || !drag.active) return;

         let cache = rangeHitCacheRef.current;
         if (cache.root !== root || !cache.built) {
            cache = buildRangeHitCache();
         }
         if (!cache) return;

         const x0 = drag.startX;
         const y0 = drag.startY;
         const x1 = Number.isFinite(clientX) ? clientX : drag.currentX;
         const y1 = Number.isFinite(clientY) ? clientY : drag.currentY;
         const rect = {
            left: Math.min(x0, x1),
            top: Math.min(y0, y1),
            right: Math.max(x0, x1) + 1,
            bottom: Math.max(y0, y1) + 1,
         };

         const rootRect = root.getBoundingClientRect();
         const clippedLeft = Math.max(rect.left, rootRect.left);
         const clippedTop = Math.max(rect.top, rootRect.top);
         const clippedRight = Math.min(rect.right, rootRect.right);
         const clippedBottom = Math.min(rect.bottom, rootRect.bottom);
         if (clippedRight > clippedLeft && clippedBottom > clippedTop) {
            const nextBox = {
               left: Math.round(clippedLeft - rootRect.left),
               top: Math.round(clippedTop - rootRect.top),
               width: Math.round(clippedRight - clippedLeft),
               height: Math.round(clippedBottom - clippedTop),
            };
            const nextSig = rangeBoxSig(nextBox);
            if (nextSig !== rangeBoxSigRef.current) {
               rangeBoxSigRef.current = nextSig;
               setRangeBox(nextBox);
            }
         } else {
            if (rangeBoxSigRef.current) {
               rangeBoxSigRef.current = "";
               setRangeBox(null);
            }
         }

         const next = [];
         for (const item of cache.items) {
            const left = rootRect.left + item.leftRel;
            const top = rootRect.top + item.topRel;
            const right = rootRect.left + item.rightRel;
            const bottom = rootRect.top + item.bottomRel;
            if (
               !rectIntersectsCoords(
                  rect.left,
                  rect.top,
                  rect.right,
                  rect.bottom,
                  left,
                  top,
                  right,
                  bottom,
               )
            )
               continue;
            next.push(item);
         }
         setRangeEntries(next);
      },
      [buildRangeHitCache, setRangeEntries],
   );

   const handleRangePointerDownCapture = useCallback(
      (e) => {
         if (!isRangeMultiSelectPressed(e)) return;
         if (e.button !== 0 && e.button !== undefined) return;

         const target = e.target;
         if (!target?.closest) return;
         if (target.closest("[data-dv-interactive='1']")) return;

         const slotEl = target.closest(
            "[data-cp-kind='slot'][data-selectable='1']",
         );
         if (!slotEl) return;

         clearLongPress();
         try {
            window.dispatchEvent(
               new CustomEvent("cpdom-range-owner-change", {
                  detail: { owner: rangeOwnerTokenRef.current },
               }),
            );
         } catch {}
         clearRangeSelection();

         const drag = rangeDragRef.current;
         drag.active = true;
         drag.pointerId = e.pointerId ?? null;
         drag.startX = e.clientX;
         drag.startY = e.clientY;
         drag.currentX = e.clientX;
         drag.currentY = e.clientY;
         if (drag.rafId) {
            cancelAnimationFrame(drag.rafId);
            drag.rafId = 0;
         }

         const root = rootRef.current;
         if (root && drag.pointerId != null && root.setPointerCapture) {
            try {
               root.setPointerCapture(drag.pointerId);
            } catch {}
         }

         buildRangeHitCache();
         updateRangeSelectionFromPointer(e.clientX, e.clientY);

         e.preventDefault();
         e.stopPropagation();
      },
      [
         buildRangeHitCache,
         clearLongPress,
         clearRangeSelection,
         updateRangeSelectionFromPointer,
      ],
   );

   const handleRangePointerMoveCapture = useCallback(
      (e) => {
         const drag = rangeDragRef.current;
         if (!drag.active) return;
         if (
            drag.pointerId != null &&
            e.pointerId != null &&
            drag.pointerId !== e.pointerId
         ) {
            return;
         }

         drag.currentX = e.clientX;
         drag.currentY = e.clientY;
         if (!drag.rafId) {
            drag.rafId = requestAnimationFrame(() => {
               drag.rafId = 0;
               updateRangeSelectionFromPointer(drag.currentX, drag.currentY);
            });
         }

         e.preventDefault();
         e.stopPropagation();
      },
      [updateRangeSelectionFromPointer],
   );

   const finishRangePointerDrag = useCallback(
      (e = null) => {
         const drag = rangeDragRef.current;
         if (!drag.active) return;

         if (e) {
            if (
               drag.pointerId != null &&
               e.pointerId != null &&
               drag.pointerId !== e.pointerId
            ) {
               return;
            }
            drag.currentX = e.clientX;
            drag.currentY = e.clientY;
         }

         if (drag.rafId) {
            cancelAnimationFrame(drag.rafId);
            drag.rafId = 0;
         }
         updateRangeSelectionFromPointer(drag.currentX, drag.currentY);

         const root = rootRef.current;
         if (root && drag.pointerId != null && root.releasePointerCapture) {
            try {
               root.releasePointerCapture(drag.pointerId);
            } catch {}
         }

         drag.active = false;
         drag.pointerId = null;
         if (rangeBoxSigRef.current) {
            rangeBoxSigRef.current = "";
            setRangeBox(null);
         }
         invalidateRangeHitCache();
         ignoreClickUntilRef.current = Date.now() + 260;

         if (e) {
            e.preventDefault();
            e.stopPropagation();
         }
      },
      [invalidateRangeHitCache, updateRangeSelectionFromPointer],
   );

   const handleRangePointerUpCapture = useCallback(
      (e) => {
         finishRangePointerDrag(e);
      },
      [finishRangePointerDrag],
   );

   const handleRangePointerCancelCapture = useCallback(
      (e) => {
         finishRangePointerDrag(e);
      },
      [finishRangePointerDrag],
   );

   const visibleColumns = useMemo(() => {
      if (!dayNearViewportBuffered) return [];
      const out = [];
      const rowStart = rowRenderRange.start;
      const rowEnd = rowRenderRange.end;
      const colStart = colRenderRange.start;
      const colEnd = colRenderRange.end;

      for (const meta of headersMeta) {
         if (meta.row < rowStart || meta.row > rowEnd) continue;
         if (meta.col < colStart || meta.col > colEnd) continue;

         const top = Number(headerMetrics.rowTops[meta.row] || 0);
         const left = meta.col * (colWidth + colGap);
         const isPad = isPadInstructor(meta.inst);

         out.push({
            ...meta,
            top,
            left,
            isPad,
            rowHeight: Number(headerMetrics.rowHeights[meta.row] || 0),
         });
      }

      return out;
   }, [
      headersMeta,
      dayNearViewportBuffered,
      rowRenderRange,
      colRenderRange,
      headerMetrics,
      colWidth,
      colGap,
   ]);

   const handleSelectSlot = useCallback((instId, slot, override = null) => {
      const instructorId = String(instId || "");
      if (!instructorId || !slot) return;

      const slotStart = toDateSafe(override?.start || slot.start);
      const slotEnd = toDateSafe(override?.end || slot.end);
      const localSlotKey =
         String(override?.key || "").trim() ||
         localKeyFromTs(slotStart || slot.start, MOLDOVA_TZ);
      if (!slotStart || !slotEnd) return;

      setGlobalSelection({
         event: null,
         slot: {
            instructorId,
            actionInstructorId: instructorId,
            slotStart,
            slotEnd,
            localSlotKey,
         },
      });
   }, []);

   const handleCreateFromSlot = useCallback(
      (inst, slot) => {
         const instructorId = String(inst?.id || "");
         if (!instructorId || isPadInstructor(inst) || isGapInstructor(inst)) return;

         handleSelectSlot(instructorId, slot);
         if (typeof onCreateSlot !== "function") return;

         onCreateSlot({
            id: `slot-${instructorId}-${slot.key}`,
            instructorId,
            groupId: "__ungrouped",
            sector: inst?.sectorSlug || inst?.sector || "",
            start: new Date(slot.start),
            end: new Date(slot.end),
            raw: {
               instructorId,
               slotKey: slot.key,
            },
         });
      },
      [handleSelectSlot, onCreateSlot],
   );

   const onGridClick = useCallback(
      (e) => {
         if (Date.now() < ignoreClickUntilRef.current) return;
         if (!isRangeMultiSelectPressed(e)) {
            clearRangeSelection();
         }
         const eventEl = e.target?.closest?.("[data-cp-kind='event']");
         if (eventEl) {
            const rid = String(eventEl.getAttribute("data-res-id") || "");
            if (!rid) return;
            const item = eventByReservationId.get(rid) || null;
            if (!item) return;

            setGlobalSelection({ event: item.rawEvent, slot: null });
            return;
         }

         const slotEl = e.target?.closest?.("[data-cp-kind='slot']");
         if (!slotEl) return;

         const instId = String(slotEl.getAttribute("data-inst-id") || "");
         const slotIdx = Number(slotEl.getAttribute("data-slot-idx"));
         if (!instId || !Number.isFinite(slotIdx)) return;
         const padType = String(slotEl.getAttribute("data-pad-type") || "");
         const hasEventInCell = slotEl.getAttribute("data-has-event") === "1";
         if (hasEventInCell) {
            const rid = String(slotEl.getAttribute("data-res-id") || "");
            if (!rid) return;
            const item = eventByReservationId.get(rid) || null;
            if (!item?.rawEvent) return;
            setGlobalSelection({ event: item.rawEvent, slot: null });
            return;
         }

         const slot = slotsSafe[slotIdx] || null;
         if (!slot) return;
         if (
            padType === "wait" ||
            padType === "cancel" ||
            padType === "gap"
         )
            return;
         if (padType === "lateral") {
            const mark = LATERAL_TIME_MARKS[slotIdx] || slot.label;
            const virtual = buildVirtualSlotForDayHHMM(dayStart, mark);
            if (virtual?.start && virtual?.end) {
               handleSelectSlot(instId, slot, {
                  start: virtual.start,
                  end: virtual.end,
                  key: localKeyFromTs(virtual.start, MOLDOVA_TZ),
               });
               return;
            }
         }

         handleSelectSlot(instId, slot);
      },
      [eventByReservationId, handleSelectSlot, slotsSafe, dayStart, clearRangeSelection],
   );

   const onGridDoubleClick = useCallback(
      (e) => {
         if (Date.now() < ignoreClickUntilRef.current) return;
         if (!isRangeMultiSelectPressed(e)) {
            clearRangeSelection();
         }
         clearLongPress();
         const eventEl = e.target?.closest?.("[data-cp-kind='event']");
         if (eventEl) {
            const rid = String(eventEl.getAttribute("data-res-id") || "");
            if (!rid) return;
            const item = eventByReservationId.get(rid) || null;
            if (!item?.rawEvent) return;
            openReservationPopup(item.rawEvent);
            return;
         }

         const slotEl = e.target?.closest?.("[data-cp-kind='slot']");
         if (!slotEl) return;

         const instId = String(slotEl.getAttribute("data-inst-id") || "");
         const slotIdx = Number(slotEl.getAttribute("data-slot-idx"));
         const padType = String(slotEl.getAttribute("data-pad-type") || "");
         if (!instId || !Number.isFinite(slotIdx)) return;
         const hasEventInCell = slotEl.getAttribute("data-has-event") === "1";
         if (hasEventInCell) {
            const rid = String(slotEl.getAttribute("data-res-id") || "");
            if (!rid) return;
            const item = eventByReservationId.get(rid) || null;
            if (!item?.rawEvent) return;
            openReservationPopup(item.rawEvent);
            return;
         }

         const slot = slotsSafe[slotIdx] || null;
         if (!slot) return;
         if (padType === "cancel" || padType === "gap")
            return;
         if (padType === "wait") {
            const globalIdx = Number(
               slotEl.getAttribute("data-wait-global-idx"),
            );
            if (!Number.isFinite(globalIdx) || globalIdx < 0) return;
            waitCommitRef.current = false;
            void (async () => {
               let map = waitNotesRef.current || {};
               try {
                  const latest = await fetchLatestWaitNotesMap();
                  if (latest && typeof latest === "object") map = latest;
               } catch (err) {
                  console.error("wait-slot reload before edit failed:", err);
               }
               const snap = readWaitNoteSnapshot(map, globalIdx);
               setWaitEdit({
                  instId,
                  slotIdx,
                  globalIdx,
                  text: snap.text,
                  baseNoteId: snap.id,
                  baseText: snap.text,
               });
            })();
            return;
         }
         if (padType === "lateral") {
            const mark = LATERAL_TIME_MARKS[slotIdx] || slot.label;
            const virtual = buildVirtualSlotForDayHHMM(dayStart, mark);
            if (virtual?.start && virtual?.end) {
               handleSelectSlot(instId, slot, {
                  start: virtual.start,
                  end: virtual.end,
                  key: localKeyFromTs(virtual.start, MOLDOVA_TZ),
               });
               return;
            }
            handleSelectSlot(instId, slot);
            return;
         }

         const inst =
            headersMeta.find((h) => String(h.inst?.id || "") === instId)?.inst ||
            null;
         handleCreateFromSlot(inst, slot);
      },
      [
         clearLongPress,
         eventByReservationId,
         fetchLatestWaitNotesMap,
         openReservationPopup,
         headersMeta,
         handleSelectSlot,
         handleCreateFromSlot,
         slotsSafe,
         dayStart,
         clearRangeSelection,
      ],
   );

   useLayoutEffect(() => {
      if (typeof onActiveEventRectChange !== "function") return;
      const id = String(activeEventId ?? "");
      if (!id) return;
      if (!eventByReservationId.has(id)) return;

      let rafId = 0;
      let cancelled = false;
      let tries = 0;

      const emitRect = () => {
         if (cancelled) return;
         tries += 1;

         const el = eventRefMap.current.get(id);
         if (el) {
            const rect = el.getBoundingClientRect();
            if (rect && rect.height > 0) {
               onActiveEventRectChange({
                  leftX: rect.left,
                  rightX: rect.right,
                  centerX: rect.left + rect.width / 2,
                  topY: rect.top,
                  bottomY: rect.bottom,
                  centerY: rect.top + rect.height / 2,
                  canvasRect: rootRef.current?.getBoundingClientRect?.() || null,
               });
            }
         }

         if (!cancelled && tries < ACTIVE_EVENT_RECT_RETRY_FRAMES) {
            rafId = requestAnimationFrame(emitRect);
         }
      };

      emitRect();

      return () => {
         cancelled = true;
         if (rafId) cancelAnimationFrame(rafId);
      };
   }, [
      activeEventId,
      onActiveEventRectChange,
      byCell,
      selectionVersion,
      dayNearViewportBuffered,
      eventByReservationId,
   ]);

   if (!dayNearViewportBuffered) {
      return <div className="dayview__skeleton" style={{ height: "100%" }} />;
   }

   return (
      <div
         ref={rootRef}
         className="cpdom"
         style={{
            width: `${Math.max(1, headerMetrics.dayWidth)}px`,
            height: `${Math.max(1, headerMetrics.totalHeight)}px`,
            position: "relative",
         }}
         onClick={onGridClick}
         onDoubleClick={onGridDoubleClick}
         onPointerDownCapture={handleRangePointerDownCapture}
         onPointerMoveCapture={handleRangePointerMoveCapture}
         onPointerUpCapture={handleRangePointerUpCapture}
         onPointerCancelCapture={handleRangePointerCancelCapture}
      >
         {visibleColumns.map(({ inst, idx, row, col, top, left, isPad, rowHeight }) => {
            const instId = String(inst?.id || "");
            const padType = detectPadType(inst) || "";
            const isGap = isGapInstructor(inst);
            const isCancelPad = padType === "cancel";
            const isWaitPad = padType === "wait";
            const isLateralPad = padType === "lateral";
            const headerMeta = headerMetaByInstructorId.get(instId) || null;
            const waitPadColumnIndex = Math.max(
               0,
               Math.trunc(Number(inst?._padColumnIndex || 0)),
            );

            const maxSlots = isGap
               ? slotsSafe.length
               : isPad
                 ? isCancelPad
                    ? Math.min(CANCEL_SLOTS_PER_COLUMN, slotsSafe.length)
                    : isLateralPad
                      ? Math.min(LATERAL_SLOTS_PER_COLUMN, slotsSafe.length)
                      : Math.min(WAIT_SLOTS_PER_COLUMN, slotsSafe.length)
                 : slotsSafe.length;

            const sectorSlugRaw = getInstructorSector(inst);
            const sectorSlug =
               sectorSlugRaw === "botanica" ||
               sectorSlugRaw === "ciocana" ||
               sectorSlugRaw === "buiucani"
                  ? sectorSlugRaw
                  : "other";
            const headClassName =
               "cpdom__head dayview__column-head" +
               (isGap
                  ? " cpdom__head--gap"
                  : isPad
                    ? " cpdom__head--pad"
                    : ` cpdom__head--${sectorSlug}`);
            const isHeaderEditing =
               !isPad && !isGap && headerEdit?.instId === instId;
            const headerPlateText = String(headerMeta?.plate || "").trim() || "—";
            const headerNoteText = String(headerMeta?.noteForDay || "").trim() || "—";

            const padTitle = isCancelPad
               ? "Anulari"
               : isWaitPad
                 ? "Asteptari"
                 : isLateralPad
                   ? "Laterala"
                   : "Coloana sistem";

            return (
               <section
                  key={`${instId || "inst"}-${idx}`}
                  className={
                     "cpdom__col" +
                     (isPad ? " cpdom__col--pad" : "") +
                     (isGap ? " cpdom__col--gap" : "")
                  }
                  style={{
                     position: "absolute",
                     left: `${left}px`,
                     top: `${top}px`,
                     width: `${colWidth}px`,
                     height: `${headerHeight + rowHeight}px`,
                  }}
               >
                  <header
                     className={headClassName}
                     style={{ minHeight: `${headerHeight}px` }}
                     onDoubleClick={(e) => {
                        if (isPad || isGap) return;
                        e.preventDefault();
                        e.stopPropagation();
                        startHeaderEdit(instId);
                     }}
                  >
                     <strong className="dv-inst-name">
                        {isGap ? "\u00A0" : isPad ? padTitle : inst?.name || "—"}
                     </strong>
                     {!isGap && isPad ? <small className="cpdom__sub"> </small> : null}
                     {!isGap && !isPad ? (
                        isHeaderEditing ? (
                           <textarea
                              ref={headerInputRef}
                              className="cpdom__head-note-input"
                              data-dv-interactive="1"
                              value={headerEdit?.text || ""}
                              onChange={(e) =>
                                 setHeaderEdit((prev) =>
                                    prev ? { ...prev, text: e.target.value } : prev,
                                 )
                              }
                              onBlur={handleHeaderBlur}
                              onKeyDown={handleHeaderKeyDown}
                              placeholder="Notita pe zi"
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                           />
                        ) : (
                           <>
                              <small className="cpdom__sub">{headerPlateText}</small>
                              <small className="cpdom__sub cpdom__sub--meta">
                                 {headerNoteText}
                              </small>
                           </>
                        )
                     ) : null}
                  </header>

                  <div
                     className="cpdom__slots"
                     style={{
                        gridTemplateRows: `repeat(${Math.max(1, maxSlots)}, ${slotHeight}px)`,
                        rowGap: `${slotGap}px`,
                     }}
                  >
                     {Array.from({ length: maxSlots }).map((_, i) => {
                        const slot = slotsSafe[i];
                        if (!slot) return null;

                        const waitGlobalIdx = isWaitPad
                           ? waitPadColumnIndex * WAIT_SLOTS_PER_COLUMN + i
                           : -1;
                        const waitNoteObj =
                           waitGlobalIdx >= 0
                              ? waitNotes?.[waitGlobalIdx] ??
                                waitNotes?.[String(waitGlobalIdx)]
                              : null;
                        const waitNoteText =
                           typeof waitNoteObj === "string"
                              ? waitNoteObj
                              : String(waitNoteObj?.text || "");

                        const slotLabel = isCancelPad
                           ? ""
                           : isWaitPad
                             ? waitNoteText || WAIT_PLACEHOLDER_TEXT
                             : isLateralPad
                               ? LATERAL_TIME_MARKS[i] ||
                                 slotLabelByIndex[i] ||
                                 slot.label
                               : slot.label;
                        const lateralVirtualStart = isLateralPad
                           ? buildVirtualSlotForDayHHMM(dayStart, slotLabel)?.start || null
                           : null;
                        const slotSelectKey =
                           lateralVirtualStart != null
                              ? localKeyFromTs(lateralVirtualStart, MOLDOVA_TZ)
                              : slot.key;
                        const isRangeSelectable =
                           !isPad &&
                           !isGap &&
                           !isWaitPad &&
                           !isCancelPad &&
                           !isLateralPad;
                        const isRegularInstructorSlot = !isPad && !isGap;
                        const isClosingSlot =
                           isRegularInstructorSlot && slot.label === "19:30";
                        const slotRangeKey = isRangeSelectable
                           ? `${instId}|${slot.key}`
                           : "";
                        const slotStartIso = slot.start.toISOString();
                        const slotEndIso = slot.end.toISOString();

                        const blockedSet =
                           blockedKeyMapNormalized?.get(instId) ||
                           blockedKeyMapNormalized?.get(
                              String(Number(instId)),
                           ) ||
                           null;
                        const isBlocked = !isPad && !!blockedSet?.has?.(slot.key);

                        const draftKey = `${instId}|${slot.start.toISOString()}`;
                        const hasDraft =
                           createDraftBySlotUsers instanceof Map &&
                           createDraftBySlotUsers.has(draftKey);
                        const draftColor =
                           createDraftBySlotColors instanceof Map
                              ? createDraftBySlotColors.get(draftKey)
                              : null;

                        const cellKey = `${instId}|${i}`;
                        const eventsInCell = byCell.get(cellKey) || EMPTY_CELL_ITEMS;
                        const displayEvent =
                           displayEventByCellKey.get(cellKey) || eventsInCell[0] || null;
                        const hasEventInCell = eventsInCell.length > 0;
                        const slotReservationId = String(displayEvent?.reservationId || "");
                        const isDeletingEvent = !!displayEvent?.isDeleting;
                        const isOptimisticCreateEvent =
                           !!displayEvent?.isOptimisticPending;

                        const isSelectedSlot =
                           (!isPad || isLateralPad) &&
                           selectedSlotInstructorId === instId &&
                           selectedSlotKey === slotSelectKey;

                        const isWaitEditing =
                           !!waitEdit &&
                           waitEdit.instId === instId &&
                           Number(waitEdit.slotIdx) === i;
                        const isRangeSelected =
                           isRangeSelectable && rangeSelectedKeySet.has(slotRangeKey);

                        const evUser =
                           displayEvent?.userId != null
                              ? usersById.get(String(displayEvent.userId))
                              : null;
                        const desiredBadge =
                           evUser?.desiredInstructorId != null
                              ? instructorBadgeById.get(
                                   String(evUser.desiredInstructorId),
                                ) || ""
                              : "";
                        const isCancelOriginMarker = !!displayEvent?.isCanceledOriginMarker;
                        const cancelOriginLabel = isCancelOriginMarker
                           ? `${displayEvent.timeText || hhmm(displayEvent.start)} - anulat`
                           : "";
                        const eventMeta = displayEvent
                           ? isCancelOriginMarker
                              ? cancelOriginLabel
                              : [
                                   displayEvent.timeText || hhmm(displayEvent.start),
                                   displayEvent.gearboxBadge ||
                                      resolveGearboxBadge(displayEvent.gearbox),
                                   displayEvent.statusMarks || "",
                                   desiredBadge,
                                ]
                                   .filter(Boolean)
                                   .join(" · ")
                           : "";

                        return (
                           <div
                              key={cellKey}
                              className={
                                 "cpdom__slot" +
                                 (isBlocked ? " is-blocked" : "") +
                                 (isSelectedSlot ? " is-selected-slot" : "") +
                                 (isRangeSelected ? " is-range-selected" : "") +
                                 (hasDraft ? " is-draft" : "") +
                                 (isDeletingEvent ? " has-deleting-event" : "") +
                                 (isWaitPad ? " is-wait-slot" : "") +
                                 (isCancelPad ? " is-cancel-slot" : "") +
                                 (isLateralPad ? " is-lateral-slot" : "") +
                                 (isClosingSlot ? " is-closing-slot" : "") +
                                 (isGap ? " is-gap-slot" : "")
                              }
                              data-cp-kind="slot"
                              data-inst-id={instId}
                              data-slot-idx={i}
                              data-blocked={isBlocked ? "1" : "0"}
                              data-selectable={isRangeSelectable ? "1" : "0"}
                              data-slot-key={slot.key}
                              data-slot-start={slotStartIso}
                              data-slot-end={slotEndIso}
                              data-range-key={slotRangeKey}
                              data-grid-row={row}
                              data-grid-col={col}
                              data-has-event={hasEventInCell ? "1" : "0"}
                              data-res-id={slotReservationId}
                              data-pad-type={padType}
                              data-wait-global-idx={waitGlobalIdx >= 0 ? waitGlobalIdx : ""}
                              style={{
                                 height: `${slotHeight}px`,
                                 minHeight: `${slotHeight}px`,
                                 maxHeight: `${slotHeight}px`,
                                 ...(hasDraft && draftColor
                                    ? {
                                         "--cpdom-draft-color": resolveCssColor(draftColor),
                                      }
                                    : undefined),
                              }}
                           >
                              <div className="cpdom__slot-body">
                                 {displayEvent ? (
                                    <button
                                       ref={(el) => {
                                          const id = String(displayEvent.reservationId || "");
                                          if (!id) return;
                                          if (el) eventRefMap.current.set(id, el);
                                          else eventRefMap.current.delete(id);
                                       }}
                                       type="button"
                                       className={
                                          "cpdom__event dayview__event" +
                                          (selectedEventId === displayEvent.reservationId
                                             ? " is-selected-event"
                                             : "") +
                                          (renderActiveId === displayEvent.reservationId
                                             ? " is-active-event"
                                             : "") +
                                          (renderSearchId === displayEvent.reservationId
                                             ? " is-search-event"
                                             : "") +
                                          (isOptimisticCreateEvent
                                             ? " is-optimistic-create"
                                             : "") +
                                          (isDeletingEvent ? " is-deleting" : "") +
                                          (isCancelOriginMarker
                                             ? " is-cancel-origin"
                                             : "")
                                       }
                                       data-cp-kind="event"
                                       data-res-id={displayEvent.reservationId}
                                       data-dv-pan-allow="1"
                                       style={{
                                          background: resolveCssColor(displayEvent.colorToken),
                                       }}
                                       title={
                                          isCancelOriginMarker
                                             ? cancelOriginLabel
                                             : `${displayEvent.student} (${hhmm(
                                                  displayEvent.start,
                                               )})`
                                       }
                                       onPointerDown={(e) =>
                                          handleEventPointerDown(e, displayEvent)
                                       }
                                       onPointerMove={handleEventPointerMove}
                                       onPointerUp={handleEventPointerUp}
                                       onPointerCancel={handleEventPointerUp}
                                       onPointerLeave={handleEventPointerUp}
                                       onContextMenu={(e) => {
                                          e.preventDefault();
                                          openStudentPopup(displayEvent.rawEvent);
                                       }}
                                    >
                                       {isCancelOriginMarker ? (
                                          <span className="cpdom__event-meta cpdom__event-meta--cancel-origin">
                                             {eventMeta || "\u00A0"}
                                          </span>
                                       ) : (
                                          <>
                                             <span className="cpdom__event-meta">
                                                {eventMeta || "\u00A0"}
                                             </span>
                                             <span className="dayview__event-person-name">
                                                {displayEvent.student}
                                             </span>
                                             <span className="dayview__event-phone">
                                                {displayEvent.phone || " "}
                                             </span>
                                             <span className="dayview__event-note">
                                                {displayEvent.privateMessage || " "}
                                             </span>
                                             {presenceByReservationUsers instanceof Map &&
                                             presenceByReservationUsers.has(
                                                displayEvent.reservationId,
                                             ) ? (
                                                <span
                                                   className="cpdom__presence"
                                                   style={{
                                                      background:
                                                         presenceByReservationColors instanceof
                                                         Map
                                                            ? resolveCssColor(
                                                                 presenceByReservationColors.get(
                                                                    displayEvent.reservationId,
                                                                 ) || "--accent-l",
                                                              )
                                                            : "var(--accent-l)",
                                                   }}
                                                />
                                             ) : null}
                                          </>
                                       )}
                                    </button>
                                 ) : isWaitEditing ? (
                                    <textarea
                                       ref={waitInputRef}
                                       className="cpdom__wait-input"
                                       value={waitEdit?.text || ""}
                                       onChange={(e) =>
                                          setWaitEdit((prev) =>
                                             prev
                                                ? { ...prev, text: e.target.value }
                                                : prev,
                                          )
                                       }
                                       onBlur={handleWaitBlur}
                                       onKeyDown={handleWaitKeyDown}
                                       placeholder={WAIT_PLACEHOLDER_TEXT}
                                       onClick={(e) => e.stopPropagation()}
                                       onPointerDown={(e) => e.stopPropagation()}
                                    />
                                 ) : (
                                    <div
                                       className={
                                          "cpdom__empty" +
                                          (isRegularInstructorSlot
                                             ? " cpdom__empty--regular"
                                             : "") +
                                          (isClosingSlot ? " cpdom__empty--closing" : "") +
                                          (isWaitPad ? " cpdom__empty--wait" : "") +
                                          (isCancelPad ? " cpdom__empty--cancel" : "")
                                       }
                                    >
                                       {isBlocked &&
                                       !isWaitPad &&
                                       !isCancelPad &&
                                       !isLateralPad ? (
                                          <span className="cpdom__blocked-label">
                                             Blocat
                                          </span>
                                       ) : null}
                                       {slotLabel ? (
                                          <span className="cpdom__time">{slotLabel}</span>
                                       ) : null}
                                    </div>
                                 )}
                              </div>
                           </div>
                        );
                     })}
                  </div>
               </section>
            );
         })}
         {rangeBox ? (
            <div
               className="cpdom__range-box"
               style={{
                  left: `${Math.round(rangeBox.left)}px`,
                  top: `${Math.round(rangeBox.top)}px`,
                  width: `${Math.round(rangeBox.width)}px`,
                  height: `${Math.round(rangeBox.height)}px`,
               }}
            />
         ) : null}
      </div>
   );
}

function areTrackPropsEqual(prev, next) {
   if (prev === next) return true;

   if (prev.dayStart !== next.dayStart) return false;
   if (prev.dayEnd !== next.dayEnd) return false;
   if (prev.instructors !== next.instructors) return false;
   if (prev.events !== next.events) return false;
   if (prev.slots !== next.slots) return false;
   if (prev.dayOffsetLeft !== next.dayOffsetLeft) return false;
   if (prev.layout !== next.layout) return false;
   if (prev.timeMarks !== next.timeMarks) return false;
   if (prev.blockedKeyMap !== next.blockedKeyMap) return false;
   if (prev.blackoutVer !== next.blackoutVer) return false;
   if (prev.activeEventId !== next.activeEventId) return false;
   if (prev.activeSearchEventId !== next.activeSearchEventId) return false;
   if (prev.onActiveEventRectChange !== next.onActiveEventRectChange) return false;
   if (prev.onCreateSlot !== next.onCreateSlot) return false;
   if (prev.users !== next.users) return false;
   if (prev.cars !== next.cars) return false;
   if (prev.instructorsFull !== next.instructorsFull) return false;
   if (prev.sharedLookups !== next.sharedLookups) return false;
   if (prev.createDraftBySlotUsers !== next.createDraftBySlotUsers) return false;
   if (prev.createDraftBySlotColors !== next.createDraftBySlotColors) return false;
   if (prev.presenceByReservationUsers !== next.presenceByReservationUsers)
      return false;
   if (prev.presenceByReservationColors !== next.presenceByReservationColors)
      return false;
   if (prev.isPanInteracting !== next.isPanInteracting) return false;
   if (prev.panPointerType !== next.panPointerType) return false;

   const panNow = !!prev.isPanInteracting || !!next.isPanInteracting;
   const pointerType = String(next.panPointerType || prev.panPointerType || "")
      .trim()
      .toLowerCase();
   const isMousePan = panNow && pointerType === "mouse";
   const xThreshold = isMousePan ? 40 : panNow ? 14 : 1;
   const yThreshold = isMousePan ? 56 : panNow ? 14 : 1;

   const dx = Math.abs(
      Number(prev.viewportScrollLeft || 0) - Number(next.viewportScrollLeft || 0),
   );
   const dy = Math.abs(
      Number(prev.viewportScrollTop || 0) - Number(next.viewportScrollTop || 0),
   );
   const dw = Math.abs(
      Number(prev.viewportWidth || 0) - Number(next.viewportWidth || 0),
   );
   const dh = Math.abs(
      Number(prev.viewportHeight || 0) - Number(next.viewportHeight || 0),
   );

   if (dx >= xThreshold) return false;
   if (dy >= yThreshold) return false;
   if (dw > 1) return false;
   if (dh > 1) return false;

   return true;
}

export default memo(DayviewDomTrack, areTrackPropsEqual);
