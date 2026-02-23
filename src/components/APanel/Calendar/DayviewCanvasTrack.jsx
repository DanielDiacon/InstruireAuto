// src/components/APanel/Calendar/DayviewCanvasTrack.jsx
import React, {
   useRef,
   useEffect,
   useState,
   useMemo,
   useCallback,
   memo,
} from "react";
import { useDispatch } from "react-redux";
import { openPopup } from "../../Utils/popupStore";
import { updateUser } from "../../../store/usersSlice";

import {
   createNote,
   fetchWaitNotesRange,
   updateNote,
} from "../../../api/notesService";
import {
   createReservationsForUser,
   deleteReservation,
   getReservationHistory,
   getInstructorReservationHistory,
} from "../../../api/reservationsService";
import {
   fetchReservationsDelta,
   removeReservationLocal,
} from "../../../store/reservationsSlice";
import {
   triggerCalendarRefresh,
   listenCalendarRefresh,
} from "../../Utils/calendarBus";
import { ReactSVG } from "react-svg";

import copyIcon from "../../../assets/svg/material-symbols--file-copy-outline.svg";
import pasteIcon from "../../../assets/svg/streamline-sharp--insert-row-remix.svg";
import cutIcon from "../../../assets/svg/material-symbols--content-cut.svg";
import hystoryIcon from "../../../assets/svg/clock.svg";
import arrowIcon from "../../../assets/svg/arrow-s.svg";
import closeIcon from "../../../assets/svg/add-s.svg";

import {
   retainGlobals,
   setGlobalSelection,
   getSelectedEvent,
   getSelectedSlot,
   getCopyBuffer,
   setCopyBuffer,
   setPasteFn,
   setDeleteFn,
   hideReservationGlobally,
   hasHiddenIds,
   isHidden,
   getHiddenVersion,
} from "./globals";

import {
   norm,
   formatHHMM,
   getNoteForDate,
   upsertNoteForDate,
   MOLDOVA_TZ,
   DEFAULT_TIME_MARKS,
   ymdStrInTZ,
   hhmmInTZ,
   localKeyFromTs,
   buildStartTimeForSlot,
   buildWaitNoteDateIsoForSlot,
   normalizeWaitNotesInput,
   localDateObjFromStr,
   isAutoInstructor,
   isBuiucaniInstructor,
   getInstructorSector,
   isEventCanceled,
   getStudentPhoneFromEv,
   getStudentPrivateMessageFromEv,
   buildBlockedMapFromBlackoutsList,
   WAIT_NOTE_TIME_MARKS,
   WAIT_SLOTS_PER_COLUMN,
   CANCEL_SLOTS_PER_COLUMN,
   LATERAL_TIME_MARKS,
   LATERAL_SLOTS_PER_COLUMN,
   LATERAL_PAD_ID,
   WAIT_NOTES_CACHE,
   WAIT_PLACEHOLDER_TEXT,
} from "./utils";

import {
   drawAll,
   buildDayRenderModel,
   computeWorldHeight,
   getColorRoot,
   clearColorCache,
   buildSlotsSignature,
   buildBlockedSignature,
   buildWaitNotesSignature,
   DEFAULT_EVENT_COLOR_TOKEN,
   NO_COLOR_TOKEN,
} from "./render";

const BUSY_KEYS_MODE = "local-match";
const IS_LOW_SPEC_DEVICE =
   typeof navigator !== "undefined" &&
   ((Number(navigator.deviceMemory) > 0 && Number(navigator.deviceMemory) <= 4) ||
      (Number(navigator.hardwareConcurrency) > 0 &&
         Number(navigator.hardwareConcurrency) <= 4));
const DPR_LIMIT = 2;
// Stabilitate/acuratețe > throughput:
// dezactivăm worker-ul până eliminăm complet mismatch-urile de hitMap din prod.
const ENABLE_CANVAS_WORKER = false;
const WORKER_COLOR_TOKENS_BASE = [
   "--black-p",
   "--black-t",
   "--white-p",
   "--white-s",
   "--event-default",
   "--event-red",
   "--event-orange",
   "--event-yellow",
   "--event-green",
   "--event-blue",
   "--event-indigo",
   "--event-purple",
   "--event-pink",
];

const LONG_PRESS_MS = 200;
const LONG_PRESS_MOVE_PX = 14;
const CLICK_COMMIT_DELAY_MS = 90;
const DAY_OFFSCREEN_MARGIN_BASE_PX = 320;
const CANVAS_MAX_EDGE_PX = IS_LOW_SPEC_DEVICE ? 8192 : 12288;
const CANVAS_MAX_TOTAL_PIXELS = IS_LOW_SPEC_DEVICE ? 8_000_000 : 16_000_000;
const CANVAS_DOUBLE_BUFFER_MAX_PIXELS = IS_LOW_SPEC_DEVICE
   ? 6_000_000
   : 10_000_000;
const CANVAS_MIN_DPR = 0.01;
const ENABLE_DYNAMIC_LAYER_CACHE = false;
const STATIC_LAYER_ORIGIN_SNAP_MAX_PX = IS_LOW_SPEC_DEVICE ? 40 : 56;
const DYNAMIC_LAYER_ORIGIN_SNAP_MAX_PX = IS_LOW_SPEC_DEVICE ? 104 : 148;
const HITMAP_INTERACTION_KEEP_MS = 1600;
const HITMAP_STALE_MAX_AGE_MS = IS_LOW_SPEC_DEVICE ? 520 : 360;

function computeSafeCanvasDpr(cssWidth, cssHeight, desiredDpr) {
   const width = Math.max(1, Number(cssWidth) || 1);
   const height = Math.max(1, Number(cssHeight) || 1);
   const targetDpr = Math.max(CANVAS_MIN_DPR, Number(desiredDpr) || 1);

   const maxByEdgeW = CANVAS_MAX_EDGE_PX / width;
   const maxByEdgeH = CANVAS_MAX_EDGE_PX / height;
   const maxByPixels = Math.sqrt(CANVAS_MAX_TOTAL_PIXELS / (width * height));

   const safeDpr = Math.min(targetDpr, maxByEdgeW, maxByEdgeH, maxByPixels);
   if (!Number.isFinite(safeDpr) || safeDpr <= 0) return CANVAS_MIN_DPR;
   return Math.max(CANVAS_MIN_DPR, safeDpr);
}

function snapViewportOrigin(origin, maxOrigin, step) {
   const clampedOrigin = Math.max(
      0,
      Math.min(Math.max(0, Number(maxOrigin) || 0), Math.round(origin || 0)),
   );
   const snapStep = Math.max(1, Math.round(step || 1));
   if (snapStep <= 1) return clampedOrigin;

   const snapped = Math.floor(clampedOrigin / snapStep) * snapStep;
   return Math.max(
      0,
      Math.min(Math.max(0, Number(maxOrigin) || 0), Math.round(snapped || 0)),
   );
}

function extractCssTokenFromColor(color) {
   const value = String(color || "").trim();
   if (!value) return null;
   if (value.startsWith("--")) return value;
   if (value.startsWith("var(") && value.endsWith(")"))
      return value.slice(4, -1).trim();
   if (/^event-/i.test(value)) return `--${value.toLowerCase()}`;
   return null;
}

function shallowEqualPlainObject(a, b) {
   if (a === b) return true;
   if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
   const keysA = Object.keys(a);
   const keysB = Object.keys(b);
   if (keysA.length !== keysB.length) return false;
   for (const key of keysA) {
      if (a[key] !== b[key]) return false;
   }
   return true;
}

const RANGE_MINUTES = 90; // ✅ 90 min window
/* ================== STRONG SIGNATURE HELPERS (REDRAW FIX) ================== */
const MAX_GAPS_AFTER = 40;
const GAPCOL_PREFIX = "__gapcol_";
const MAX_ORDER_POS = 80; // protecție: să nu-ți creeze 999 coloane din greșeală

const isGapCol = (instOrId) => {
   const id =
      typeof instOrId === "string" ? instOrId : String(instOrId?.id ?? "");
   return !!instOrId?._isGapColumn || (id && id.startsWith(GAPCOL_PREFIX));
};

const makeGapCol = (key) => ({
   id: `${GAPCOL_PREFIX}${key}`,
   name: "",
   _isGapColumn: true,
   _padType: "gap",
});

function parseOrderToken(v) {
   const s = String(v ?? "").trim();
   if (!s)
      return {
         pos: Number.POSITIVE_INFINITY,
         posAlt: null,
         gapsAfter: 0,
         raw: s,
      };

   // ✅ NEW: dual order "3X7" (+ opțional gap-uri după: "3X7XX")
   //    pos = pentru zile cu Buiucani
   //    posAlt = pentru zile fără Buiucani
   let m = s.match(/^(\d+)\s*[xX]\s*(\d+)\s*([xX]*)$/);
   if (m) {
      const pos = Math.max(1, parseInt(m[1], 10));
      const posAlt = Math.max(1, parseInt(m[2], 10));
      const gapsAfter = Math.max(
         0,
         Math.min(MAX_GAPS_AFTER, (m[3] || "").length),
      );
      return { pos, posAlt, gapsAfter, raw: s };
   }

   // legacy: "12XXX" => pos=12, gapsAfter=3
   m = s.match(/^(\d+)([xX]+)$/);
   if (m) {
      const pos = Math.max(1, parseInt(m[1], 10));
      const gapsAfter = Math.max(0, Math.min(MAX_GAPS_AFTER, m[2].length));
      return { pos, posAlt: null, gapsAfter, raw: s };
   }

   m = s.match(/^(\d+)$/);
   if (m) {
      const pos = Math.max(1, parseInt(m[1], 10));
      return { pos, posAlt: null, gapsAfter: 0, raw: s };
   }

   const n = Number(s);
   if (Number.isFinite(n) && n > 0) {
      return {
         pos: Math.max(1, Math.round(n)),
         posAlt: null,
         gapsAfter: 0,
         raw: s,
      };
   }

   return {
      pos: Number.POSITIVE_INFINITY,
      posAlt: null,
      gapsAfter: 0,
      raw: s,
   };
}

function _hashStr(str) {
   const s = String(str || "");
   let h = 5381;
   for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
   return (h >>> 0).toString(36);
}

function _ms(d) {
   if (!d) return 0;
   const x = d instanceof Date ? d : new Date(d);
   const t = x.getTime();
   return Number.isFinite(t) ? t : 0;
}

function hasAnyPresence(v) {
   if (v === true) return true;
   if (!v) return false;

   if (v instanceof Set) return v.size > 0;
   if (Array.isArray(v)) return v.length > 0;

   if (typeof v === "object") return Object.keys(v).length > 0;

   return false;
}

function buildCanvasEventSignaturePart(ev) {
   if (!ev) return "";

   const raw = ev.raw || {};

   const id = raw.id ?? ev.id ?? "";
   const startMs = _ms(ev.start ?? raw.startTime ?? raw.start ?? raw.date);
   const endMs = _ms(ev.end ?? raw.endTime ?? raw.end) || startMs;

   const instId = String(
      raw.instructorId ?? raw.instructor_id ?? ev.instructorId ?? "",
   );

   const userId = String(
      raw.userId ??
         raw.user_id ??
         ev.userId ??
         ev.studentId ??
         raw.user?.id ??
         "",
   );

   const sector = String(raw.sector ?? ev.sector ?? "");
   const gearbox = String(raw.gearbox ?? ev.gearbox ?? "");
   const color = String(raw.color ?? ev.color ?? "");

   const isConf = !!(raw.isConfirmed ?? raw.is_confirmed ?? ev.isConfirmed);
   const isFav = !!(raw.isFavorite ?? raw.is_favorite ?? ev.isFavorite);
   const isImp = !!(raw.isImportant ?? raw.is_important ?? ev.isImportant);
   const isCanc = !!(raw.isCancelled ?? raw.is_cancelled ?? ev.isCancelled);

   const flags = `${isConf ? 1 : 0}${isFav ? 1 : 0}${isImp ? 1 : 0}${
      isCanc ? 1 : 0
   }`;

   // ⚠️ acestea schimbă text/inscripții desenate
   const phone = String(getStudentPhoneFromEv(ev) || "");
   const noteFromEvent = String(
      raw.privateMessage ?? ev.privateMessage ?? ev.eventPrivateMessage ?? "",
   );
   const noteFromProfile = String(getStudentPrivateMessageFromEv(ev) || "");
   const notesHash = _hashStr(`${noteFromEvent}|${noteFromProfile}`);

   // ⚠️ acestea schimbă poziția/randarea în pad-uri
   const padSlotIndex = ev._padSlotIndex != null ? String(ev._padSlotIndex) : "";
   const padColIndex =
      ev._padColumnIndex != null ? String(ev._padColumnIndex) : "";
   const movedCancel = ev._movedToCancelPad ? "1" : "0";
   const fromLateral = ev._fromLateralPad ? "1" : "0";
   const localSlotKey = String(ev.localSlotKey || "");

   // dacă ai updatedAt/version din API, e cel mai bun invalidator
   const ver = String(
      raw.updatedAt ?? raw.updated_at ?? raw.version ?? raw.rev ?? raw._rev ?? "",
   );

   return [
      instId,
      id,
      startMs,
      endMs,
      userId,
      sector,
      gearbox,
      color,
      flags,
      phone,
      notesHash,
      padSlotIndex,
      padColIndex,
      movedCancel,
      fromLateral,
      localSlotKey,
      ver,
   ].join("|");
}

function buildWorkerEventPatchBaseKey(ev) {
   const raw = ev?.raw || {};
   const reservationId = String(raw.id ?? ev?.id ?? "");
   const startMs = _ms(ev?.start ?? raw.startTime ?? raw.start ?? raw.date);
   const instructorId = String(
      ev?.instructorId ?? raw.instructorId ?? raw.instructor_id ?? "",
   );
   const padSlotIndex =
      ev?._padSlotIndex != null ? String(ev._padSlotIndex) : "";
   const padColumnIndex =
      ev?._padColumnIndex != null ? String(ev._padColumnIndex) : "";
   const movedToCancel = ev?._movedToCancelPad ? "1" : "0";
   const fromLateral = ev?._fromLateralPad ? "1" : "0";
   const localSlotKey = String(ev?.localSlotKey || "");

   return [
      reservationId,
      startMs,
      instructorId,
      padSlotIndex,
      padColumnIndex,
      movedToCancel,
      fromLateral,
      localSlotKey,
   ].join("|");
}

function buildWorkerEventState(events) {
   const state = new Map();
   if (!Array.isArray(events) || !events.length) return state;

   const dupCounters = new Map();

   for (let index = 0; index < events.length; index++) {
      const ev = events[index];
      if (!ev) continue;

      const baseKey = buildWorkerEventPatchBaseKey(ev);
      const dupCount = dupCounters.get(baseKey) || 0;
      dupCounters.set(baseKey, dupCount + 1);
      const key = `${baseKey}#${dupCount}`;

      state.set(key, {
         index,
         event: ev,
      });
   }

   return state;
}

function serializeWorkerEventState(state) {
   if (!state || !state.size) return [];

   const entries = [];
   for (const [key, value] of state.entries()) {
      if (!value) continue;
      entries.push({
         key,
         index: Number(value.index) || 0,
         event: value.event || null,
      });
   }
   return entries;
}

function hasWorkerEventStateDiff(prevState, nextState) {
   if (prevState === nextState) return false;
   if (!(prevState instanceof Map) || !(nextState instanceof Map)) return true;
   if (prevState.size !== nextState.size) return true;

   for (const [key, nextValue] of nextState.entries()) {
      const prevValue = prevState.get(key);
      if (!prevValue) return true;
      if ((Number(prevValue.index) || 0) !== (Number(nextValue.index) || 0))
         return true;
      if (prevValue.event !== nextValue.event) {
         const prevEventSig = buildCanvasEventSignaturePart(prevValue.event);
         const nextEventSig = buildCanvasEventSignaturePart(nextValue.event);
         if (prevEventSig !== nextEventSig) return true;
      }
   }

   return false;
}

/**
 * Semnătură robustă pentru canvas:
 * include câmpurile care îți schimbă UI-ul desenat (confirmare, note, favorite, important, etc.)
 * + poziționarea în pad-uri (lateral/cancel) prin _padSlotIndex/_padColumnIndex.
 */
function buildCanvasEventsSignature(events) {
   if (!Array.isArray(events) || !events.length) return "0";
   let hash = 2166136261;
   let count = 0;

   for (let index = 0; index < events.length; index++) {
      const part = buildCanvasEventSignaturePart(events[index]);
      if (!part) continue;
      count++;
      const chunk = `${index}|${part}`;
      for (let i = 0; i < chunk.length; i++) {
         hash ^= chunk.charCodeAt(i);
         hash = Math.imul(hash, 16777619);
      }
   }

   return `${count}:${(hash >>> 0).toString(36)}`;
}

/* ================== SECTOR FILTER HELPERS (NEW) ================== */

function normalizeSectorFilter(raw) {
   const s = String(raw || "")
      .trim()
      .toLowerCase();
   if (!s) return ""; // "" = fără filtru (toate)

   if (s === "all" || s === "toate" || s === "total") return "";

   if (s.includes("bot")) return "botanica";
   if (s.includes("cio")) return "ciocana";
   if (s.includes("bui")) return "buiucani";
   if (s.includes("oth")) return "other";

   return s; // fallback
}

function buildInstructorsLayoutSignature(list) {
   if (!Array.isArray(list) || !list.length) return "0";

   let out = "";
   for (let idx = 0; idx < list.length; idx++) {
      const inst = list[idx];
      if (!inst) {
         out += `${idx}:null;`;
         continue;
      }
      const id = String(inst.id ?? "");
      const sector = String(getInstructorSector(inst) || "").toLowerCase();
      const padType = String(inst._padType ?? "");
      const padIdx =
         typeof inst._padColumnIndex === "number"
            ? String(inst._padColumnIndex)
            : "";
      out += `${idx}:${id}:${sector}:${padType}:${padIdx};`;
   }
   return out;
}

/* ================== HISTORY (Reservation) - helpers ================== */

const HISTORY_FIELD_LABEL = {
   startTime: "Data & ora",
   sector: "Sector",
   gearbox: "Cutie",
   color: "Culoare",
   userId: "Elev",
   instructorId: "Instructor",
   privateMessage: "Notiță",
   isConfirmed: "Confirmare",
   carId: "Mașină",
   instructorsGroupId: "Grup instructori",
   isFavorite: "Favorit",
   isImportant: "Important",
   isCancelled: "Anulat",
};

function fmtHistoryHeaderRO(isoLike, tz = MOLDOVA_TZ) {
   const d = isoLike ? new Date(isoLike) : null;
   if (!d || Number.isNaN(d.getTime())) return "";
   return new Intl.DateTimeFormat("ro-RO", {
      timeZone: tz,
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
   }).format(d);
}

function safeStr(v) {
   if (v == null) return "";
   if (typeof v === "string") return v;
   return String(v);
}

function buildNameMaps({ users = [], instructorsFull = [] } = {}) {
   const userById = new Map();
   const instrById = new Map();

   (users || []).forEach((u) => {
      const id = u?.id;
      if (id == null) return;
      const full = `${u?.firstName || ""} ${u?.lastName || ""}`.trim();
      if (full) userById.set(String(id), full);
   });

   (instructorsFull || []).forEach((i) => {
      const id = i?.id;
      if (id == null) return;
      const full = `${i?.firstName || ""} ${i?.lastName || ""}`.trim();
      if (full) instrById.set(String(id), full);
   });

   return { userById, instrById };
}

function fmtHistoryValue(field, value, maps) {
   if (value == null || value === "") return "";

   if (field === "startTime") {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return safeStr(value);
      return d.toLocaleString("ro-RO", {
         dateStyle: "medium",
         timeStyle: "short",
      });
   }

   if (field === "gearbox") {
      const v = safeStr(value).toLowerCase();
      return v === "automat" ? "Automat" : "Manual";
   }

   if (field === "color") return safeStr(value);

   if (field === "userId") {
      const k = String(value);
      return maps?.userById?.get(k) || k;
   }

   if (field === "instructorId") {
      const k = String(value);
      return maps?.instrById?.get(k) || k;
   }

   if (typeof value === "boolean") return value ? "Da" : "Nu";

   return safeStr(value);
}

function buildChangesFromHistoryItemTrack(h, maps) {
   const action = safeStr(h?.action).toUpperCase();
   if (action === "CREATE" || action === "CREATED") return [];

   if (h && h.changedFields && typeof h.changedFields === "object") {
      return Object.entries(h.changedFields)
         .map(([field, diff]) => {
            if (!diff || typeof diff !== "object") return null;
            if (!("from" in diff) && !("to" in diff)) return null;

            const from = fmtHistoryValue(field, diff.from, maps);
            const to = fmtHistoryValue(field, diff.to, maps);
            if (from === to) return null;

            return {
               field,
               label: HISTORY_FIELD_LABEL[field] || field,
               from,
               to,
            };
         })
         .filter(Boolean);
   }

   if (Array.isArray(h?.changes)) {
      return h.changes
         .map((c) => {
            const field = c?.field || c?.path || "(câmp)";
            const from = fmtHistoryValue(field, c?.from, maps);
            const to = fmtHistoryValue(field, c?.to ?? c?.value, maps);
            if (from === to) return null;

            return {
               field,
               label: HISTORY_FIELD_LABEL[field] || field,
               from,
               to,
            };
         })
         .filter(Boolean);
   }

   return [];
}

function whoFromHistory(h) {
   const u = h?.changedByUser || h?.user || h?.author || null;
   const full = u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "";
   return full || safeStr(h?.changedByName) || safeStr(h?.by) || "";
}

function whenFromHistory(h) {
   return h?.createdAt || h?.timestamp || h?.date || h?.updatedAt || null;
}

function changesToLines(changes) {
   return (changes || []).map((c) => {
      const from = safeStr(c.from);
      const to = safeStr(c.to);
      const label = safeStr(c.label);

      if (!from && to) return `S-a adăugat: ${label} „${to}”`;
      if (from && !to) return `S-a șters: ${label} „${from}”`;
      if (from && to) return `S-a modificat: ${label} „${from}” → „${to}”`;
      return `Modificare: ${label}`;
   });
}

/* ================== RANGE RESERVATIONS from INSTRUCTOR HISTORY (client-side) ================== */

function addMinutes(date, minutes) {
   const d = date instanceof Date ? date : new Date(date);
   if (Number.isNaN(d.getTime())) return null;
   return new Date(d.getTime() + minutes * 60 * 1000);
}

function fmtTimeShortRO(d, tz = MOLDOVA_TZ) {
   if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
   return new Intl.DateTimeFormat("ro-RO", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
   }).format(d);
}

function pickFromChanges(h, field) {
   const cf = h?.changedFields?.[field];
   if (cf && typeof cf === "object") {
      if ("to" in cf) return cf.to;
      if ("value" in cf) return cf.value;
   }
   const ch = Array.isArray(h?.changes)
      ? h.changes.find((c) => c?.field === field || c?.path === field)
      : null;
   if (!ch) return null;
   if ("to" in ch) return ch.to;
   if ("value" in ch) return ch.value;
   return null;
}

function extractReservationSnapshotFromAny(item, maps, fallbackInstructorId) {
   if (!item) return null;

   const r =
      item.reservation ||
      item.reservationData ||
      item.reservationSnapshot ||
      item.data?.reservation ||
      null;

   const src = r || item;

   const idExplicit =
      src.reservationId ??
      src.reservation_id ??
      item.reservationId ??
      item.reservation_id ??
      src.id ??
      src._id ??
      null;

   const rid = idExplicit ?? item.entityId ?? null;
   if (rid == null) return null;

   const startLike =
      src.startTime ??
      src.start_time ??
      src.start ??
      src.date ??
      pickFromChanges(item, "startTime") ??
      pickFromChanges(item, "start_time") ??
      pickFromChanges(item, "start") ??
      null;

   const start = startLike ? new Date(startLike) : null;
   if (!start || Number.isNaN(start.getTime())) return null;

   const instructorId =
      src.instructorId ??
      src.instructor_id ??
      item.instructorId ??
      item.instructor_id ??
      (fallbackInstructorId != null ? String(fallbackInstructorId) : null);

   const userId =
      src.userId ??
      src.user_id ??
      src.user?.id ??
      item.userId ??
      item.user_id ??
      null;

   const userName =
      (src.user
         ? `${src.user.firstName || ""} ${src.user.lastName || ""}`.trim()
         : "") ||
      (userId != null ? maps?.userById?.get(String(userId)) : "") ||
      "";

   const instructorName =
      instructorId != null ? maps?.instrById?.get(String(instructorId)) : "";

   const sector = src.sector ?? pickFromChanges(item, "sector") ?? "";
   const gearbox = src.gearbox ?? pickFromChanges(item, "gearbox") ?? "";

   const isCancelled = !!(
      src.isCancelled ??
      src.is_cancelled ??
      pickFromChanges(item, "isCancelled") ??
      pickFromChanges(item, "is_cancelled")
   );

   const isConfirmed = !!(
      src.isConfirmed ??
      src.is_confirmed ??
      pickFromChanges(item, "isConfirmed") ??
      pickFromChanges(item, "is_confirmed")
   );

   const action = safeStr(item?.action).toUpperCase();
   const looksDeleted =
      action === "DELETE" ||
      action === "DELETED" ||
      action === "REMOVE" ||
      action === "REMOVED";
   if (looksDeleted) return null;

   return {
      id: String(rid),
      start,
      startISO: start.toISOString(),
      end: addMinutes(start, RANGE_MINUTES),
      userId: userId != null ? String(userId) : null,
      userName,
      instructorId: instructorId != null ? String(instructorId) : null,
      instructorName: instructorName || "",
      sector: sector || "",
      gearbox: gearbox || "",
      isCancelled,
      isConfirmed,
      _t: new Date(whenFromHistory(item) || 0).getTime(),
   };
}

function normalizeRangeReservationsFromInstructorHistory(
   raw,
   maps,
   fromMs,
   toMs,
   fallbackInstructorId,
) {
   const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.items)
        ? raw.items
        : [];

   const byId = new Map();

   for (const it of list) {
      const snap = extractReservationSnapshotFromAny(
         it,
         maps,
         fallbackInstructorId,
      );
      if (!snap) continue;

      const t = snap.start.getTime();
      if (!Number.isFinite(t)) continue;
      if (t < fromMs || t >= toMs) continue;

      const prev = byId.get(snap.id);
      if (!prev || (snap._t || 0) >= (prev._t || 0)) byId.set(snap.id, snap);
   }

   const out = Array.from(byId.values());
   out.sort((a, b) => a.start.getTime() - b.start.getTime());
   return out;
}

/* ================== HEADER DOM PESTE CANVAS ================== */

const CanvasInstructorHeader = memo(
   function CanvasInstructorHeader({
      inst,
      dayDate,
      sectorClassName,
      style,
      carsByInstructorId,
      instructorsFullById,
      usersById,
      instructorUsersByNormName,
      zoom = 1,
   }) {
      const dispatch = useDispatch();

      const instrFull = useMemo(() => {
         const iid = inst?.id != null ? String(inst.id) : "";
         if (iid && instructorsFullById?.has(iid)) {
            return instructorsFullById.get(iid);
         }
         return inst || null;
      }, [instructorsFullById, inst]);

      const instructorUser = useMemo(() => {
         if (!instrFull) return null;

         const directUid =
            instrFull.userId ?? instrFull.user_id ?? instrFull.user?.id ?? null;

         const roleInstr = (u) =>
            String(u.role ?? "").toUpperCase() === "INSTRUCTOR";

         if (directUid != null) {
            const byId = usersById?.get?.(String(directUid));
            if (byId && roleInstr(byId)) return byId;
         }

         // fallback doar după nume (fără telefon)
         const nameKey = norm(
            `${instrFull.firstName ?? ""} ${instrFull.lastName ?? ""}`,
         );
         if (!nameKey) return null;

         const byName = instructorUsersByNormName?.get?.(nameKey) || null;
         return byName && roleInstr(byName) ? byName : null;
      }, [instrFull, usersById, instructorUsersByNormName]);

      const carForInst = useMemo(() => {
         const iid = String(inst?.id ?? "");
         if (!iid) return null;
         return carsByInstructorId?.get?.(iid) || null;
      }, [carsByInstructorId, inst]);

      const displayName = useMemo(() => {
         if (!instrFull && !inst) return "–";

         // ✅ prioritate: INSTRUCTOR first/last
         const v =
            `${instrFull?.firstName ?? ""} ${instrFull?.lastName ?? ""}`.trim();
         if (v) return v;

         // fallback la inst.name (care deja vine din instructors după fix-ul de mai sus)
         if (inst?.name && inst.name.trim()) return inst.name.trim();

         return "–";
      }, [inst, instrFull]);

      const displayPlate = useMemo(() => {
         if (!carForInst) return "";
         return (carForInst.plateNumber ?? "").toString().trim();
      }, [carForInst]);

      const privateMsg = (instructorUser?.privateMessage ?? "").toString();
      const todaysText = useMemo(
         () => getNoteForDate(privateMsg, dayDate),
         [privateMsg, dayDate],
      );
      const metaText = useMemo(() => {
         const plate = (displayPlate || "").trim();
         const subst = (todaysText || "").trim();

         if (plate && subst) return `${plate} • ${subst}`;
         if (plate) return plate;
         if (subst) return subst;

         return "—";
      }, [displayPlate, todaysText]);

      const [isEditing, setIsEditing] = useState(false);
      const [inputText, setInputText] = useState("");
      const inputRef = useRef(null);

      const isPad = String(inst?.id || "").startsWith("__pad_");
      const padLabel =
         isPad && inst?.name && inst.name.trim()
            ? inst.name.trim()
            : isPad
              ? String(inst?.id || "") === "__pad_1"
                 ? "Anulari"
                 : "Asteptari"
              : null;

      const openEditor = useCallback(() => {
         if (isPad) return;
         setInputText(todaysText || "");
         setIsEditing(true);
      }, [isPad, todaysText]);

      useEffect(() => {
         if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
         }
      }, [isEditing]);

      const saveEdit = useCallback(async () => {
         if (!instructorUser?.id) {
            setIsEditing(false);
            return;
         }
         const nextPM = upsertNoteForDate(privateMsg, dayDate, inputText);
         try {
            await dispatch(
               updateUser({
                  id: String(instructorUser.id),
                  data: { privateMessage: nextPM },
               }),
            );
         } finally {
            setIsEditing(false);
         }
      }, [dispatch, instructorUser?.id, privateMsg, dayDate, inputText]);

      const cancelEdit = useCallback(() => {
         setIsEditing(false);
         setInputText(todaysText || "");
      }, [todaysText]);

      if (!inst) return null;
      const isGap = isGapCol(inst);

      if (isGap) {
         return (
            <div
               className="dayview__column-head dv-canvas-header dv-canvas-header--gap"
               style={{
                  position: "absolute",
                  boxSizing: "border-box",
                  pointerEvents: "none",
                  ...style,
               }}
            />
         );
      }

      const z = zoom || 1;
      const headerFontSize = 13 * z;
      const plateFontSize = 11 * z;
      const inputFontSize = 12 * z;
      const paddingTop = 8 * z;
      const paddingSides = 10 * z;
      const paddingBottom = 4 * z;
      const gapPx = 2 * z;

      if (isPad) {
         return (
            <div
               className="dayview__column-head dv-canvas-header dv-canvas-header--pad"
               style={{
                  position: "absolute",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: `${paddingTop}px ${paddingSides}px ${paddingBottom}px`,
                  pointerEvents: "none",
                  color: "var(--white-p)",
                  lineHeight: 1.15,
                  textAlign: "center",
                  ...style,
               }}
            >
               <div
                  className="dv-inst-name"
                  style={{
                     fontWeight: 600,
                     fontSize: `${headerFontSize}px`,
                     lineHeight: 1.15,
                     width: "100%",
                  }}
               >
                  {padLabel || "\u00A0"}
               </div>
            </div>
         );
      }

      return (
         <div
            className={
               "dayview__column-head dv-canvas-header" +
               (sectorClassName ? " " + sectorClassName : "")
            }
            style={{
               position: "absolute",
               boxSizing: "border-box",
               display: "flex",
               flexDirection: "column",
               alignItems: "flex-start",
               justifyContent: "flex-start",
               padding: `${paddingTop}px ${paddingSides}px ${paddingBottom}px`,
               gap: gapPx,
               cursor: "text",
               pointerEvents: "auto",
               color: "var(--white-p)",
               lineHeight: 1.15,
               ...style,
            }}
            onDoubleClick={(e) => {
               e.stopPropagation();
               openEditor();
            }}
         >
            {/* RÂND 1: nume instructor */}
            <div
               className="dv-inst-name"
               style={{
                  fontWeight: 500,
                  fontSize: `${headerFontSize}px`,
                  lineHeight: 1.15,
               }}
            >
               {displayName || "\u00A0"}
            </div>

            {/* Editare: input pentru înlocuitor/notă (stă pe rândul 2) */}
            {/* META (plăcuță + înlocuitor) ca paragraf 2 rânduri max */}
            {!isEditing ? (
               <div
                  className="dv-inst-meta"
                  style={{
                     fontSize: `${plateFontSize}px`,
                     lineHeight: 1.2,
                     opacity: metaText === "—" ? 0.55 : 0.9,
                     width: "100%",

                     // ✅ păstrează spațiul (2 rânduri)
                     minHeight: `${plateFontSize * 1.2 * 2}px`,

                     // ✅ 2 rânduri max cu "..."
                     overflow: "hidden",
                     display: "-webkit-box",
                     WebkitBoxOrient: "vertical",
                     WebkitLineClamp: 2,

                     // fallback/ajutor pentru cuvinte lungi
                     wordBreak: "break-word",
                  }}
                  title={metaText === "—" ? "" : metaText}
               >
                  {metaText}
               </div>
            ) : (
               <input
                  ref={inputRef}
                  className="dv-subst-input"
                  style={{
                     width: "100%",
                     fontSize: `${inputFontSize}px`,
                     lineHeight: 1.2,
                  }}
                  placeholder="Înlocuitor / notă pentru zi"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={(e) => {
                     if (e.key === "Enter") {
                        e.preventDefault();
                        saveEdit();
                     } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEdit();
                     }
                  }}
                  onClick={(e) => e.stopPropagation()}
               />
            )}
         </div>
      );
   },
   (prev, next) => {
      return (
         prev.inst === next.inst &&
         prev.dayDate === next.dayDate &&
         prev.sectorClassName === next.sectorClassName &&
         prev.style.left === next.style.left &&
         prev.style.top === next.style.top &&
         prev.style.width === next.style.width &&
         prev.style.height === next.style.height &&
         prev.carsByInstructorId === next.carsByInstructorId &&
         prev.instructorsFullById === next.instructorsFullById &&
         prev.usersById === next.usersById &&
         prev.instructorUsersByNormName === next.instructorUsersByNormName &&
         prev.zoom === next.zoom
      );
   },
);

/* ================== COMPONENTA REACT ================== */

function DayviewCanvasTrack({
   dayStart,
   dayEnd,
   instructors = [],
   events = [],
   slots = [],
   dayOffsetLeft = 0,
   viewportScrollLeft = 0,
   viewportScrollTop = 0,
   viewportWidth = 0,
   viewportHeight = 0,
   layout = {},
   timeMarks = DEFAULT_TIME_MARKS,
   onCreateSlot,
   blockedKeyMap,
   blackoutVer = 0,
   activeEventId = null,
   activeSearchEventId = null,
   onActiveEventRectChange,
   cars = [],
   instructorsFull = [],
   users = [],
   zoom = 1,
   preGrid,
   onManualSelection,
   presenceByReservationUsers = null,
   presenceByReservationColors,
   createDraftBySlotUsers = null,
   createDraftBySlotColors = null,
   isPanInteracting = false,
   // ✅ NEW (optional): poți pasa direct din parent, dar merge și dacă îl pui în layout.*
   sectorFilter: sectorFilterProp = null,
}) {
   const canvasRef = useRef(null);
   const drawBufferRef = useRef(null);
   const staticLayerBufferRef = useRef(null);
   const dynamicLayerBufferRef = useRef(null);
   const staticLayerSigRef = useRef("");
   const dynamicLayerSigRef = useRef("");
   const renderWindowRef = useRef({ x: 0, y: 0, w: 1, h: 1 });
   const hitMapRef = useRef([]);
   const lastDrawSigRef = useRef(null);
   const workerRef = useRef(null);
   const workerReadyRef = useRef(false);
   const workerEnabledRef = useRef(false);
   const workerSceneSigRef = useRef("");
   const workerEventsSigRef = useRef("");
   const workerEventsStateRef = useRef(new Map());
   const workerEventsSourceRef = useRef(null);
   const workerDrawSeqRef = useRef(0);
   const workerAppliedDrawSeqRef = useRef(0);
   const workerDrawInFlightRef = useRef(false);
   const workerPendingDrawPayloadRef = useRef(null);
   const workerDisabledRef = useRef(false);
   const canvasTransferredRef = useRef(false);
   const activeEventIdRef = useRef(activeEventId);
   //console.log(users);

   const longPressStartRef = useRef(null);
   const longPressTimerRef = useRef(null);
   const longPressTargetRef = useRef(null);
   const ignoreClickUntilRef = useRef(0);
   const lastPointerTypeRef = useRef("mouse");
   const pendingClickCommitRef = useRef(0);
   const pendingWaitNotesRef = useRef(null);
   const waitNotesApplyRafRef = useRef(0);
   const isPanInteractingRef = useRef(!!isPanInteracting);
   const hitMapInteractiveUntilRef = useRef(0);
   const hitMapNeedsRebuildRef = useRef(true);
   const hitMapBuiltAtRef = useRef(0);

   const preGridCols =
      !preGrid || preGrid.enabled === false
         ? 0
         : typeof preGrid.columns === "number"
           ? preGrid.columns
           : 3;

   const preGridRows =
      !preGrid || preGrid.enabled === false
         ? 0
         : typeof preGrid.rows === "number"
           ? preGrid.rows
           : 3;

   const hasPreGrid = preGridCols > 0 && preGridRows > 0;

   const [themeTick, setThemeTick] = useState(0);
   const [refreshTick, setRefreshTick] = useState(0);
   const [canvasEpoch, setCanvasEpoch] = useState(0);
   const [hitMapVersion, setHitMapVersion] = useState(0);
   const [workerRuntimeReady, setWorkerRuntimeReady] = useState(false);
   const refreshRafRef = useRef(0);

   const ensureDrawBuffer = useCallback((pixelW, pixelH) => {
      let buffer = drawBufferRef.current;

      if (!buffer) {
         if (typeof OffscreenCanvas !== "undefined") {
            buffer = new OffscreenCanvas(pixelW, pixelH);
         } else if (typeof document !== "undefined") {
            buffer = document.createElement("canvas");
         } else {
            return null;
         }
         drawBufferRef.current = buffer;
      }

      if (buffer.width !== pixelW) buffer.width = pixelW;
      if (buffer.height !== pixelH) buffer.height = pixelH;

      return buffer;
   }, []);

   const ensureStaticLayerBuffer = useCallback((pixelW, pixelH) => {
      let buffer = staticLayerBufferRef.current;

      if (!buffer) {
         if (typeof OffscreenCanvas !== "undefined") {
            buffer = new OffscreenCanvas(pixelW, pixelH);
         } else if (typeof document !== "undefined") {
            buffer = document.createElement("canvas");
         } else {
            return null;
         }
         staticLayerBufferRef.current = buffer;
      }

      if (buffer.width !== pixelW) buffer.width = pixelW;
      if (buffer.height !== pixelH) buffer.height = pixelH;

      return buffer;
   }, []);

   const ensureDynamicLayerBuffer = useCallback((pixelW, pixelH) => {
      let buffer = dynamicLayerBufferRef.current;

      if (!buffer) {
         if (typeof OffscreenCanvas !== "undefined") {
            buffer = new OffscreenCanvas(pixelW, pixelH);
         } else if (typeof document !== "undefined") {
            buffer = document.createElement("canvas");
         } else {
            return null;
         }
         dynamicLayerBufferRef.current = buffer;
      }

      if (buffer.width !== pixelW) buffer.width = pixelW;
      if (buffer.height !== pixelH) buffer.height = pixelH;

      return buffer;
   }, []);

   const notifyHitMapUpdated = useCallback(() => {
      if (activeEventIdRef.current == null) return;
      setHitMapVersion((v) => v + 1);
   }, []);

   const teardownWorker = useCallback(() => {
      const worker = workerRef.current;
      if (worker) {
         try {
            worker.terminate();
         } catch (_) {}
      }
      workerRef.current = null;
      workerReadyRef.current = false;
      workerEnabledRef.current = false;
      workerSceneSigRef.current = "";
      workerEventsSigRef.current = "";
      workerEventsStateRef.current = new Map();
      workerEventsSourceRef.current = null;
      workerDrawSeqRef.current = 0;
      workerAppliedDrawSeqRef.current = 0;
      workerDrawInFlightRef.current = false;
      workerPendingDrawPayloadRef.current = null;
      setWorkerRuntimeReady(false);
   }, []);

   const markWorkerFatal = useCallback(
      (reason) => {
         console.error("Dayview canvas worker disabled:", reason);
         teardownWorker();
         workerDisabledRef.current = true;
         setCanvasEpoch((v) => v + 1);
         lastDrawSigRef.current = null;
         setRefreshTick((t) => t + 1);
      },
      [teardownWorker],
   );

   const postWorkerDraw = useCallback((payload) => {
      const worker = workerRef.current;
      if (
         !worker ||
         !workerEnabledRef.current ||
         !workerReadyRef.current ||
         !payload
      ) {
         return false;
      }

      const drawId = workerDrawSeqRef.current + 1;
      workerDrawSeqRef.current = drawId;
      workerDrawInFlightRef.current = true;

      try {
         worker.postMessage({
            type: "draw",
            drawId,
            ...payload,
         });
         return true;
      } catch (error) {
         workerDrawInFlightRef.current = false;
         throw error;
      }
   }, []);

   const requestRedrawFromBus = useCallback(() => {
      if (refreshRafRef.current) return;
      refreshRafRef.current = requestAnimationFrame(() => {
         refreshRafRef.current = 0;
         lastDrawSigRef.current = null;
         setRefreshTick((t) => t + 1);
      });
   }, []);

   const requestInteractiveHitMap = useCallback(
      ({ keepMs = HITMAP_INTERACTION_KEEP_MS, forceRebuild = false } = {}) => {
         const now = Date.now();
         const wasInteractive = hitMapInteractiveUntilRef.current > now;
         const keepFor = Math.max(120, Number(keepMs) || HITMAP_INTERACTION_KEEP_MS);
         const nextUntil = now + keepFor;
         if (nextUntil > hitMapInteractiveUntilRef.current) {
            hitMapInteractiveUntilRef.current = nextUntil;
         }
         if (forceRebuild) hitMapNeedsRebuildRef.current = true;

         const age = now - hitMapBuiltAtRef.current;
         if (
            forceRebuild ||
            !wasInteractive ||
            hitMapNeedsRebuildRef.current ||
            age > HITMAP_STALE_MAX_AGE_MS
         ) {
            requestRedrawFromBus();
         }
      },
      [requestRedrawFromBus],
   );

   useEffect(() => {
      return () => {
         if (refreshRafRef.current) {
            cancelAnimationFrame(refreshRafRef.current);
            refreshRafRef.current = 0;
         }
         if (pendingClickCommitRef.current) {
            clearTimeout(pendingClickCommitRef.current);
            pendingClickCommitRef.current = 0;
         }
         if (waitNotesApplyRafRef.current) {
            cancelAnimationFrame(waitNotesApplyRafRef.current);
            waitNotesApplyRafRef.current = 0;
         }
         teardownWorker();
         drawBufferRef.current = null;
         staticLayerBufferRef.current = null;
         staticLayerSigRef.current = "";
      };
   }, [teardownWorker]);

   const [selectedEventId, setSelectedEventId] = useState(
      getSelectedEvent()?.id ?? null,
   );

   const [selectedSlot, setSelectedSlot] = useState(() => {
      const s = getSelectedSlot();
      return s
         ? {
              instructorId: s.instructorId,
              slotStart: s.slotStart,
              slotEnd: s.slotEnd,
           }
         : null;
   });

   const [touchToolbar, setTouchToolbar] = useState(null);
   const activeRectResolveRef = useRef({ id: null, resolved: false });

   const [waitNotes, setWaitNotes] = useState({});
   const waitNotesRef = useRef(waitNotes);
   const waitNotesTextMap = useMemo(() => {
      const res = {};
      if (!waitNotes || typeof waitNotes !== "object") return res;
      for (const [key, value] of Object.entries(waitNotes)) {
         if (!value) continue;
         if (typeof value === "string") res[key] = value;
         else if (typeof value === "object" && value.text != null)
            res[key] = String(value.text || "");
      }
      return res;
   }, [waitNotes]);

   useEffect(() => {
      waitNotesRef.current = waitNotes;
   }, [waitNotes]);

   useEffect(() => {
      isPanInteractingRef.current = !!isPanInteracting;
      if (!isPanInteracting && pendingWaitNotesRef.current) {
         const pending = pendingWaitNotesRef.current;
         pendingWaitNotesRef.current = null;
         setWaitNotes((prev) =>
            shallowEqualPlainObject(prev, pending) ? prev : pending,
         );
      }
   }, [isPanInteracting]);

   const applyWaitNotes = useCallback((nextWaitNotes, options = {}) => {
      const urgent = !!options.urgent;
      const deferDuringPan = !!options.deferDuringPan;
      const normalized =
         nextWaitNotes && typeof nextWaitNotes === "object" ? nextWaitNotes : {};

      if (!urgent && deferDuringPan && isPanInteractingRef.current) {
         pendingWaitNotesRef.current = normalized;
         return;
      }

      if (!urgent) {
         pendingWaitNotesRef.current = normalized;
         if (!waitNotesApplyRafRef.current) {
            waitNotesApplyRafRef.current = requestAnimationFrame(() => {
               waitNotesApplyRafRef.current = 0;
               const pending = pendingWaitNotesRef.current;
               if (!pending) return;
               pendingWaitNotesRef.current = null;
               setWaitNotes((prev) =>
                  shallowEqualPlainObject(prev, pending) ? prev : pending,
               );
            });
         }
         return;
      }

      pendingWaitNotesRef.current = null;
      if (waitNotesApplyRafRef.current) {
         cancelAnimationFrame(waitNotesApplyRafRef.current);
         waitNotesApplyRafRef.current = 0;
      }
      setWaitNotes((prev) =>
         shallowEqualPlainObject(prev, normalized) ? prev : normalized,
      );
   }, []);

   const [hiddenVersion, setHiddenVersion] = useState(getHiddenVersion());

   const [waitEdit, setWaitEdit] = useState(null);
   const waitInputRef = useRef(null);
   const waitCommitRef = useRef(false);

   useEffect(() => {
      const id = activeEventId != null ? String(activeEventId) : null;
      const prev = activeRectResolveRef.current;
      if (prev.id === id) return;
      activeRectResolveRef.current = { id, resolved: false };
   }, [activeEventId]);

   useEffect(() => {
      activeEventIdRef.current = activeEventId;
   }, [activeEventId]);

   const dispatch = useDispatch();
   // ===== users index (fast lookup) =====
   const normPhone = (p) => String(p || "").replace(/\D+/g, "");

   const usersById = useMemo(() => {
      const m = new Map();
      (users || []).forEach((u) => {
         if (u?.id == null) return;
         m.set(String(u.id), u);
      });
      return m;
   }, [users]);

   const usersByPhone = useMemo(() => {
      const m = new Map();
      (users || []).forEach((u) => {
         if (u?.id == null) return;
         const k = normPhone(u.phone);
         if (!k) return;
         // dacă există duplicat, păstrează primul (sau poți face array)
         if (!m.has(k)) m.set(k, u);
      });
      return m;
   }, [users]);

   const usersByNormName = useMemo(() => {
      const m = new Map();
      (users || []).forEach((u) => {
         const key = norm(`${u?.firstName ?? ""} ${u?.lastName ?? ""}`);
         if (!key || m.has(key)) return;
         m.set(key, u);
      });
      return m;
   }, [users]);

   const instructorsFullById = useMemo(() => {
      const m = new Map();
      (instructorsFull || []).forEach((inst) => {
         if (inst?.id == null) return;
         m.set(String(inst.id), inst);
      });
      return m;
   }, [instructorsFull]);

   const carsByInstructorId = useMemo(() => {
      const m = new Map();
      (cars || []).forEach((car) => {
         const iid = car?.instructorId ?? car?.instructor_id ?? null;
         if (iid == null) return;
         m.set(String(iid), car);
      });
      return m;
   }, [cars]);

   const instructorUsersByNormName = useMemo(() => {
      const m = new Map();
      (users || []).forEach((u) => {
         if (String(u?.role ?? "").toUpperCase() !== "INSTRUCTOR") return;
         const key = norm(`${u?.firstName ?? ""} ${u?.lastName ?? ""}`);
         if (!key || m.has(key)) return;
         m.set(key, u);
      });
      return m;
   }, [users]);

   const pickUserFromStore = useCallback(
      (userIdRaw, phoneRaw, firstNameSeed, lastNameSeed) => {
         const uid = userIdRaw != null ? String(userIdRaw) : "";
         if (uid && usersById.has(uid)) return usersById.get(uid);

         const p = normPhone(phoneRaw);
         if (p && usersByPhone.has(p)) return usersByPhone.get(p);

         // fallback final: match după nume (riscant, dar mai bine decât nimic)
         const key = norm(`${firstNameSeed || ""} ${lastNameSeed || ""}`);
         if (key) {
            const u = usersByNormName.get(key) || null;
            if (u) return u;
         }

         return null;
      },
      [usersById, usersByPhone, usersByNormName],
   );

   // ✅ NEW: sector activ (din prop sau din layout.*) + invalidare cache redraw
   const activeSectorFilter = useMemo(() => {
      const raw =
         sectorFilterProp ??
         layout?.sectorFilter ??
         layout?.activeSector ??
         layout?.selectedSector ??
         layout?.sector ??
         null;

      return normalizeSectorFilter(raw);
   }, [
      sectorFilterProp,
      layout?.sectorFilter,
      layout?.activeSector,
      layout?.selectedSector,
      layout?.sector,
   ]);

   useEffect(() => {
      // când schimbi sectorul, forțează redraw (altfel poate rămâne canvas vechi)
      lastDrawSigRef.current = null;
   }, [activeSectorFilter]);

   // ✅ B) Normalizează presence -> Set de reservationId-uri (pentru render.js)
   const presenceReservationIds = useMemo(() => {
      const src = presenceByReservationUsers;
      if (!src) return null;

      if (src instanceof Set) {
         // deja e set de rid-uri
         return src.size ? src : null;
      }

      // ✅ IMPORTANT: Map(rid -> Set(userId) / array / object) => păstrează DOAR rid-urile cu utilizatori reali
      if (src instanceof Map) {
         const ids = [];
         for (const [rid, users] of src.entries()) {
            if (!rid) continue;
            if (hasAnyPresence(users)) ids.push(String(rid));
         }
         return ids.length ? new Set(ids) : null;
      }

      if (Array.isArray(src)) {
         const ids = src.map((x) => String(x)).filter(Boolean);
         return ids.length ? new Set(ids) : null;
      }

      if (typeof src === "object") {
         const ids = [];
         for (const [rid, v] of Object.entries(src)) {
            if (!rid) continue;
            if (hasAnyPresence(v)) ids.push(String(rid));
         }
         return ids.length ? new Set(ids) : null;
      }

      return null;
   }, [presenceByReservationUsers]);

   // ✅ A) Culori user + culori prezență per rezervare
   const userColorById = useMemo(() => {
      const m = new Map();
      (users || []).forEach((u) => {
         if (u?.id == null) return;
         const c = (u.color ?? u.profileColor ?? u.colour ?? "")
            .toString()
            .trim();
         if (c) m.set(String(u.id), c);
      });
      return m;
   }, [users]);

   const presenceColorsByReservation = useMemo(() => {
      const src = presenceByReservationColors;
      const m = new Map();

      if (!src) return m;

      if (src instanceof Map) {
         for (const [rid, cols] of src.entries()) {
            if (!rid) continue;
            const arr = Array.isArray(cols)
               ? cols.filter(Boolean).map(String)
               : [];
            if (arr.length) m.set(String(rid), arr); // ✅ doar non-empty
         }
         return m;
      }

      if (typeof src === "object") {
         for (const [rid, cols] of Object.entries(src)) {
            if (!rid) continue;
            const arr = Array.isArray(cols)
               ? cols.filter(Boolean).map(String)
               : [];
            if (arr.length) m.set(String(rid), arr);
         }
      }

      return m;
   }, [presenceByReservationColors]);

   const effectivePresenceReservationIds = useMemo(() => {
      if (presenceReservationIds instanceof Set) return presenceReservationIds;
      if (presenceColorsByReservation?.size)
         return new Set([...presenceColorsByReservation.keys()]);
      return null;
   }, [presenceReservationIds, presenceColorsByReservation]);

   const presenceSig = useMemo(() => {
      if (!presenceColorsByReservation || !presenceColorsByReservation.size)
         return "";
      const parts = [];
      for (const [rid, cols] of presenceColorsByReservation.entries()) {
         parts.push(`${rid}:${(cols || []).join(",")}`);
      }
      parts.sort();
      return parts.join("|");
   }, [presenceColorsByReservation]);

   const createDraftSig = useMemo(() => {
      if (
         !createDraftBySlotColors ||
         !(createDraftBySlotColors instanceof Map) ||
         !createDraftBySlotColors.size
      ) {
         return "";
      }
      const parts = [];
      for (const [k, cols] of createDraftBySlotColors.entries()) {
         parts.push(`${k}:${(cols || []).join(",")}`);
      }
      parts.sort();
      return parts.join("|");
   }, [createDraftBySlotColors]);

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

         const noteFromEvent = (ev.eventPrivateMessage || "").toString().trim();

         const reservationId = raw?.id ?? ev.id;

         const userIdRaw =
            raw?.userId ?? ev?.userId ?? raw?.user_id ?? raw?.user?.id ?? null;

         const firstNameSeed =
            (ev.studentFirst || "").trim() || fallbackName.split(" ")[0] || "";
         const lastNameSeed = (ev.studentLast || "").trim();

         // ✅ HYDRATE din users
         const userFull = pickUserFromStore(
            userIdRaw,
            phoneVal,
            firstNameSeed,
            lastNameSeed,
         );

         const firstName = String(
            userFull?.firstName ?? firstNameSeed ?? "",
         ).trim();
         const lastName = String(
            userFull?.lastName ?? lastNameSeed ?? "",
         ).trim();

         const phone = String(userFull?.phone ?? phoneVal ?? "").trim();
         const email = String(userFull?.email ?? "").trim();
         const idnp = String(userFull?.idnp ?? "").trim();

         // note din profil: preferă user.privateMessage (ăsta e “adevărul”)
         const noteFromProfile = String(
            userFull?.privateMessage ??
               getStudentPrivateMessageFromEv(ev) ??
               "",
         ).trim();

         const desiredInstructorId =
            userFull?.desiredInstructorId != null
               ? userFull.desiredInstructorId
               : null;

         const color = String(
            userFull?.color ?? userFull?.profileColor ?? "",
         ).trim();
         const role = String(userFull?.role ?? "").trim();

         if (ev.studentId || userIdRaw) {
            openPopup("studentDetails", {
               student: {
                  id: ev.studentId ?? null,
                  userId: userFull?.id ?? userIdRaw ?? null,

                  firstName,
                  lastName,
                  phone,
                  email,

                  // ✅ extra fields (ca să nu mai fie undefined în popup)
                  idnp,
                  privateMessage: noteFromProfile,
                  desiredInstructorId,
                  color,
                  role,

                  isConfirmed: !!(raw.isConfirmed ?? ev.isConfirmed),
               },
               noteFromEvent,
               studentPrivateMessage: noteFromProfile,
               fromReservationId: reservationId,
               fromReservationStartISO:
                  raw?.startTime || raw?.start || ev.start || null,
            });
         } else {
            openReservationPopup(ev);
         }
      },
      [cancelInertiaAndMomentum, openReservationPopup, pickUserFromStore],
   );

   /* ================== HISTORY + RANGE PANEL (COMUN) ================== */

   const [canvasPx, setCanvasPx] = useState({ w: 0, h: 0 });

   const [historyUI, setHistoryUI] = useState(null);
   const [historyIdx, setHistoryIdx] = useState(0);

   const [rangeLoading, setRangeLoading] = useState(false);
   const [rangeError, setRangeError] = useState("");
   const [rangeItems, setRangeItems] = useState([]);
   const [rangeMeta, setRangeMeta] = useState(null); // {from, to, label}

   const [rangeHistoryById, setRangeHistoryById] = useState({});
   const [rangeHistLoading, setRangeHistLoading] = useState(false);
   const [rangeHistError, setRangeHistError] = useState("");

   const mapsForHistory = useMemo(
      () => buildNameMaps({ users, instructorsFull }),
      [users, instructorsFull],
   );

   function initialsFromName(full) {
      const parts = String(full || "")
         .trim()
         .split(/\s+/)
         .filter(Boolean);
      return parts
         .slice(0, 2)
         .map((p) => p[0].toUpperCase())
         .join("");
   }

   const desiredInstructorBadgeByUserId = useMemo(() => {
      const instrInitialsById = new Map();

      (instructorsFull || []).forEach((i) => {
         if (i?.id == null) return;

         const full =
            `${i?.firstName || ""} ${i?.lastName || ""}`.trim() ||
            String(i?.name || "").trim();

         const init = initialsFromName(full);
         if (init) instrInitialsById.set(String(i.id), init);
      });

      const out = new Map();

      (users || []).forEach((u) => {
         if (u?.id == null) return;

         const desiredId = u?.desiredInstructorId;
         if (desiredId == null) return;

         const badge = instrInitialsById.get(String(desiredId)) || "";
         if (badge) out.set(String(u.id), badge);
      });

      return out;
   }, [users, instructorsFull]);

   const desiredBadgeSig = useMemo(() => {
      if (
         !desiredInstructorBadgeByUserId ||
         !desiredInstructorBadgeByUserId.size
      )
         return "";
      const parts = [];
      for (const [uid, badge] of desiredInstructorBadgeByUserId.entries()) {
         parts.push(`${uid}:${badge}`);
      }
      parts.sort();
      return parts.join("|");
   }, [desiredInstructorBadgeByUserId]);

   const openRangePanelFromEvent = useCallback((ev, anchor) => {
      const raw = ev?.raw || {};
      const baseStartISO =
         raw?.startTime || raw?.start || ev?.start || raw?.date || null;

      const instructorId =
         raw?.instructorId ?? raw?.instructor_id ?? ev?.instructorId ?? null;

      if (!instructorId || !baseStartISO) return;

      setHistoryUI({
         instructorId: String(instructorId),
         baseStartISO: baseStartISO || null,
         anchor: anchor
            ? {
                 x: anchor.x || 0,
                 y: anchor.y || 0,
                 w: anchor.w || 0,
                 h: anchor.h || 0,
              }
            : { x: 0, y: 0, w: 0, h: 0 },
      });

      setHistoryIdx(0);
   }, []);

   const openRangePanelFromSlot = useCallback((slot, anchor) => {
      if (!slot?.slotStart || !slot?.instructorId) return;

      setHistoryUI({
         instructorId: String(slot.instructorId),
         baseStartISO: slot.slotStart,
         anchor: anchor
            ? {
                 x: anchor.x || 0,
                 y: anchor.y || 0,
                 w: anchor.w || 0,
                 h: anchor.h || 0,
              }
            : { x: 0, y: 0, w: 0, h: 0 },
      });

      setHistoryIdx(0);
   }, []);

   const closeReservationHistory = useCallback(() => {
      setHistoryUI(null);

      setHistoryIdx(0);

      setRangeItems([]);
      setRangeError("");
      setRangeLoading(false);
      setRangeMeta(null);

      setRangeHistoryById({});
      setRangeHistError("");
      setRangeHistLoading(false);
   }, []);

   useEffect(() => {
      if (!historyUI) return;

      const instructorId = historyUI.instructorId;
      const baseStartISO = historyUI.baseStartISO;

      const baseDate = baseStartISO ? new Date(baseStartISO) : null;
      if (!instructorId || !baseDate || Number.isNaN(baseDate.getTime())) {
         setRangeItems([]);
         setRangeError("");
         setRangeLoading(false);
         setRangeMeta(null);
         return;
      }

      const from = baseDate;
      const to = addMinutes(from, RANGE_MINUTES);
      if (!to) return;

      const fromISO = from.toISOString();
      const label = `${fmtHistoryHeaderRO(
         fromISO,
         MOLDOVA_TZ,
      )} – ${fmtTimeShortRO(to, MOLDOVA_TZ)}`;

      let alive = true;
      setRangeLoading(true);
      setRangeError("");
      setRangeItems([]);
      setRangeMeta({ from, to, label });

      (async () => {
         try {
            const data = await getInstructorReservationHistory(
               String(instructorId),
            );

            const normalized = normalizeRangeReservationsFromInstructorHistory(
               data,
               mapsForHistory,
               from.getTime(),
               to.getTime(),
               String(instructorId),
            );

            if (!alive) return;
            setRangeItems(normalized);
         } catch (e) {
            if (!alive) return;
            setRangeError(
               e?.message ||
                  "Nu am putut încărca istoricul instructorului pentru acest interval.",
            );
            setRangeItems([]);
         } finally {
            if (!alive) return;
            setRangeLoading(false);
         }
      })();

      return () => {
         alive = false;
      };
   }, [historyUI?.instructorId, historyUI?.baseStartISO, mapsForHistory]);

   const rangeIdsKey = useMemo(() => {
      const ids = (rangeItems || [])
         .map((r) => String(r.id || ""))
         .filter(Boolean);
      ids.sort();
      return ids.join("|");
   }, [rangeItems]);

   useEffect(() => {
      if (!historyUI) return;

      if (!rangeIdsKey) {
         setRangeHistoryById({});
         setRangeHistError("");
         setRangeHistLoading(false);
         return;
      }

      let alive = true;
      setRangeHistLoading(true);
      setRangeHistError("");
      setRangeHistoryById({});

      const ids = rangeIdsKey.split("|").filter(Boolean);

      const runPool = async (tasks, limit = 4) => {
         const results = new Array(tasks.length);
         let i = 0;

         const worker = async () => {
            while (i < tasks.length) {
               const idx = i++;
               try {
                  results[idx] = await tasks[idx]();
               } catch (e) {
                  results[idx] = { __error: e };
               }
            }
         };

         const workers = new Array(Math.max(1, limit))
            .fill(0)
            .map(() => worker());
         await Promise.all(workers);
         return results;
      };

      (async () => {
         try {
            const tasks = ids.map((rid) => async () => {
               const data = await getReservationHistory(String(rid));
               return { rid, data };
            });

            const results = await runPool(tasks, 4);

            if (!alive) return;

            const map = {};
            let anyErr = false;

            for (const res of results) {
               if (!res) continue;
               if (res.__error) {
                  anyErr = true;
                  continue;
               }
               map[String(res.rid)] = res.data || null;
            }

            setRangeHistoryById(map);

            if (anyErr) {
               setRangeHistError(
                  "Unele istorice nu au putut fi încărcate (dar restul sunt afișate).",
               );
            }
         } catch (e) {
            if (!alive) return;
            setRangeHistError(
               e?.message ||
                  "Nu am putut încărca istoricul rezervărilor din acest interval.",
            );
            setRangeHistoryById({});
         } finally {
            if (!alive) return;
            setRangeHistLoading(false);
         }
      })();

      return () => {
         alive = false;
      };
   }, [historyUI, rangeIdsKey]);

   useEffect(() => {
      if (!historyUI) return;
      const onKey = (e) => {
         if (e.key === "Escape") closeReservationHistory();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
   }, [historyUI, closeReservationHistory]);

   const combinedRangeTimeline = useMemo(() => {
      if (!rangeItems || !rangeItems.length) return [];

      const out = [];

      for (const r of rangeItems) {
         const rid = r?.id != null ? String(r.id) : null;
         if (!rid) continue;

         const histPayload = rangeHistoryById?.[rid];
         const list = Array.isArray(histPayload)
            ? histPayload
            : Array.isArray(histPayload?.items)
              ? histPayload.items
              : Array.isArray(histPayload?.history)
                ? histPayload.history
                : [];

         if (!list.length) continue;

         const rTime = r?.start ? fmtTimeShortRO(r.start, MOLDOVA_TZ) : "";
         const rEnd = r?.end ? fmtTimeShortRO(r.end, MOLDOVA_TZ) : "";
         const ctxLine = `${rTime}${rEnd ? `–${rEnd}` : ""} • ${
            r?.userName || "—"
         }${r?.instructorName ? ` • ${r.instructorName}` : ""}${
            r?.sector ? ` • ${String(r.sector)}` : ""
         }${r?.gearbox ? ` • ${String(r.gearbox)}` : ""}${
            typeof r?.isConfirmed === "boolean"
               ? ` • ${r.isConfirmed ? "Confirmat" : "Neconfirmat"}`
               : ""
         }${r?.isCancelled ? " • Anulat" : ""}`;

         list.forEach((h, idx) => {
            const who = whoFromHistory(h);
            const whenIso = whenFromHistory(h);
            const whenTs = new Date(whenIso || 0).getTime();

            const changes = buildChangesFromHistoryItemTrack(h, mapsForHistory);
            const action = safeStr(h?.action).toUpperCase();

            const lines =
               action === "CREATE" || action === "CREATED"
                  ? ["Rezervarea a fost creată."]
                  : changes.length
                    ? changesToLines(changes)
                    : ["Modificare înregistrată (fără detalii)."];

            const initial = (who || "?").trim().slice(0, 1).toUpperCase();

            out.push({
               key: `${rid}:${h?.id ?? idx}`,
               reservationId: rid,
               ctxLine,
               who,
               initial,
               whenLabel: fmtHistoryHeaderRO(whenIso, MOLDOVA_TZ),
               whenTs: Number.isFinite(whenTs) ? whenTs : 0,
               lines,
            });
         });
      }

      out.sort((a, b) => (b.whenTs || 0) - (a.whenTs || 0));
      return out;
   }, [rangeItems, rangeHistoryById, mapsForHistory]);

   const timelineCount = combinedRangeTimeline.length;
   const currentTimeline =
      timelineCount > 0 ? combinedRangeTimeline[historyIdx] : null;

   useEffect(() => {
      setHistoryIdx(0);
   }, [historyUI?.instructorId, historyUI?.baseStartISO]);

   useEffect(() => {
      setHistoryIdx((i) =>
         timelineCount ? Math.min(i, timelineCount - 1) : 0,
      );
   }, [timelineCount]);

   const historyPanelStyle = useMemo(() => {
      if (!historyUI) return null;

      const panelW = 380;
      const pad = 10;

      const a = historyUI.anchor || { x: 0, y: 0, w: 0, h: 0 };
      const w = canvasPx.w || 0;
      const h = canvasPx.h || 0;

      let left = a.x + a.w / 2 - panelW / 2;
      if (w > 0) left = Math.max(pad, Math.min(w - panelW - pad, left));
      else left = Math.max(pad, left);

      let top = a.y - 12;
      if (top < pad) top = a.y + a.h + 10;
      if (h > 0) top = Math.max(pad, Math.min(h - 120, top));

      return { position: "absolute", width: panelW, left, top, zIndex: 60 };
   }, [historyUI, canvasPx.w, canvasPx.h]);

   const panelTitle = useMemo(() => {
      if (!historyUI) return "";
      return "Istoric";
   }, [historyUI]);

   const panelSubtitle = useMemo(() => {
      if (!historyUI || !rangeMeta?.label) return "";
      return rangeMeta.label;
   }, [historyUI, rangeMeta]);

   /* ================== globals lifetime ================== */

   useEffect(() => {
      const release = retainGlobals();
      return release;
   }, []);
   useEffect(() => {
      if (typeof listenCalendarRefresh !== "function") return;

      // când cineva apelează triggerCalendarRefresh(), invalidăm semnătura + forțăm redraw
      const unsubscribe = listenCalendarRefresh(requestRedrawFromBus);

      return unsubscribe;
   }, [requestRedrawFromBus]);

   /* ================== selection + hidden listeners ================== */

   useEffect(() => {
      if (typeof window === "undefined") return;

      const handleSelChange = () => {
         const ev = getSelectedEvent();
         const slot = getSelectedSlot();
         setSelectedEventId(ev?.id ?? null);
         if (slot) {
            setSelectedSlot({
               instructorId: slot.instructorId,
               highlightInstructorId:
                  slot.highlightInstructorId ?? slot.instructorId,
               actionInstructorId: slot.actionInstructorId ?? null,
               slotStart: slot.slotStart,
               slotEnd: slot.slotEnd,
            });
         } else {
            setSelectedSlot(null);
         }
      };

      window.addEventListener("dayview-selection-change", handleSelChange);
      return () =>
         window.removeEventListener(
            "dayview-selection-change",
            handleSelChange,
         );
   }, []);

   useEffect(() => {
      if (typeof window === "undefined") return;

      const handleHiddenChange = (e) => {
         const v =
            e?.detail && typeof e.detail.version === "number"
               ? e.detail.version
               : null;
         if (v != null) setHiddenVersion(v);
         else setHiddenVersion((prev) => prev + 1);
      };

      window.addEventListener("dayview-hidden-change", handleHiddenChange);
      return () =>
         window.removeEventListener(
            "dayview-hidden-change",
            handleHiddenChange,
         );
   }, []);

   /* ================== theme observer ================== */

   useEffect(() => {
      if (typeof MutationObserver === "undefined") return;
      if (typeof document === "undefined") return;

      const root = getColorRoot();
      if (!root) return;

      const observer = new MutationObserver((mutations) => {
         for (const m of mutations) {
            if (
               m.type === "attributes" &&
               (m.attributeName === "class" || m.attributeName === "style")
            ) {
               clearColorCache();
               setThemeTick((t) => t + 1);
               break;
            }
         }
      });

      observer.observe(root, {
         attributes: true,
         attributeFilter: ["class", "style"],
      });

      let mediaQuery;
      const handleMq = () => {
         clearColorCache();
         setThemeTick((t) => t + 1);
      };

      if (typeof window !== "undefined" && window.matchMedia) {
         mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
         try {
            mediaQuery.addEventListener("change", handleMq);
         } catch (e) {
            if (mediaQuery.addListener) mediaQuery.addListener(handleMq);
         }
      }

      return () => {
         observer.disconnect();
         if (mediaQuery) {
            try {
               mediaQuery.removeEventListener("change", handleMq);
            } catch (e) {
               if (mediaQuery.removeListener)
                  mediaQuery.removeListener(handleMq);
            }
         }
      };
   }, []);

   useEffect(() => {
      canvasTransferredRef.current = false;
   }, [canvasEpoch]);

   useEffect(() => {
      if (!ENABLE_CANVAS_WORKER) {
         setWorkerRuntimeReady(false);
         return;
      }
      if (workerDisabledRef.current) {
         setWorkerRuntimeReady(false);
         return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      const canUseWorker =
         typeof window !== "undefined" &&
         typeof Worker !== "undefined" &&
         typeof OffscreenCanvas !== "undefined" &&
         typeof canvas.transferControlToOffscreen === "function";

      if (!canUseWorker) {
         workerEnabledRef.current = false;
         setWorkerRuntimeReady(false);
         return;
      }

      if (canvasTransferredRef.current) {
         markWorkerFatal("Canvas was already transferred to OffscreenCanvas");
         return;
      }

      let worker;
      try {
         worker = new Worker(
            new URL("./DayviewCanvasRenderWorker.js", import.meta.url),
            { type: "module" },
         );
      } catch (error) {
         console.warn("Dayview worker init failed, fallback to main thread:", error);
         workerEnabledRef.current = false;
         setWorkerRuntimeReady(false);
         return;
      }

      let offscreenCanvas;
      try {
         offscreenCanvas = canvas.transferControlToOffscreen();
         canvasTransferredRef.current = true;
      } catch (error) {
         console.warn(
            "OffscreenCanvas transfer failed, fallback to main thread:",
            error,
         );
         workerEnabledRef.current = false;
         setWorkerRuntimeReady(false);
         try {
            worker.terminate();
         } catch (_) {}
         return;
      }

      workerRef.current = worker;
      workerReadyRef.current = false;
      workerEnabledRef.current = true;
      setWorkerRuntimeReady(false);
      workerSceneSigRef.current = "";
      workerEventsSigRef.current = "";
      workerEventsStateRef.current = new Map();
      workerEventsSourceRef.current = null;
      workerDrawSeqRef.current = 0;
      workerAppliedDrawSeqRef.current = 0;
      workerDrawInFlightRef.current = false;
      workerPendingDrawPayloadRef.current = null;

      worker.onmessage = (evt) => {
         const data = evt?.data || {};
         if (data.type === "init-complete") {
            workerReadyRef.current = true;
            setWorkerRuntimeReady(true);
            lastDrawSigRef.current = null;
            setRefreshTick((t) => t + 1);
            return;
         }

         if (data.type === "draw-complete") {
            workerDrawInFlightRef.current = false;
            const drawId = Number(data.drawId) || 0;
            if (drawId >= workerAppliedDrawSeqRef.current) {
               workerAppliedDrawSeqRef.current = drawId;
               const hitMapIncluded = data.hitMapIncluded !== false;
               if (hitMapIncluded) {
                  hitMapRef.current = Array.isArray(data.hitMap) ? data.hitMap : [];
                  hitMapNeedsRebuildRef.current = false;
                  hitMapBuiltAtRef.current = Date.now();
                  notifyHitMapUpdated();
               }
            }

            const pendingDrawPayload = workerPendingDrawPayloadRef.current;
            if (pendingDrawPayload) {
               workerPendingDrawPayloadRef.current = null;
               try {
                  postWorkerDraw(pendingDrawPayload);
               } catch (error) {
                  markWorkerFatal(error?.message || error);
               }
            }
            return;
         }

         if (data.type === "draw-error") {
            markWorkerFatal(data.message || "Worker draw error");
         }
      };

      worker.onerror = (err) => {
         if (typeof err?.preventDefault === "function") err.preventDefault();
         markWorkerFatal(err?.message || "Worker runtime error");
      };

      worker.onmessageerror = (err) => {
         if (typeof err?.preventDefault === "function") err.preventDefault();
         markWorkerFatal(err?.message || "Worker message error");
      };

      try {
         worker.postMessage(
            {
               type: "init",
               canvas: offscreenCanvas,
            },
            [offscreenCanvas],
         );
      } catch (error) {
         markWorkerFatal(error?.message || error);
      }

      return () => {
         teardownWorker();
      };
   }, [
      canvasEpoch,
      markWorkerFatal,
      notifyHitMapUpdated,
      postWorkerDraw,
      teardownWorker,
   ]);

   useEffect(() => {
      if (waitEdit && waitInputRef.current) waitInputRef.current.focus();
   }, [!!waitEdit]);

   /* ================== wait notes load + cache ================== */

   const dayStartMs = dayStart ? new Date(dayStart).getTime() : null;
   const dayEndMs = dayEnd ? new Date(dayEnd).getTime() : null;

   const reloadWaitNotes = useCallback(async () => {
      if (dayStartMs == null) {
         applyWaitNotes({}, { urgent: true });
         return {};
      }

      const from = new Date(dayStartMs);
      const to = dayEndMs != null ? new Date(dayEndMs) : new Date(dayStartMs);
      const fromStr = ymdStrInTZ(from, MOLDOVA_TZ);
      const toStr = ymdStrInTZ(to, MOLDOVA_TZ);
      const cacheKey = `${fromStr}|${toStr}`;

      try {
         const raw = await fetchWaitNotesRange({ from, to, type: "wait-slot" });
         const normalized = normalizeWaitNotesInput(raw, from);

         const currentFromStr = ymdStrInTZ(from, MOLDOVA_TZ);

         if (currentFromStr !== fromStr) return normalized;

         const cacheEntry = WAIT_NOTES_CACHE.get(cacheKey) || {
            data: null,
            error: null,
            promise: null,
         };
         cacheEntry.data = normalized;
         cacheEntry.error = null;
         cacheEntry.promise = null;
         WAIT_NOTES_CACHE.set(cacheKey, cacheEntry);

         applyWaitNotes(normalized);
         return normalized;
      } catch (err) {
         console.error("fetchWaitNotesRange (reload) error:", err);
         applyWaitNotes({}, { urgent: true });
         return null;
      }
   }, [dayStartMs, dayEndMs, applyWaitNotes]);

   const waitRangeKey = useMemo(() => {
      if (dayStartMs == null) return null;

      const from = new Date(dayStartMs);
      const to = dayEndMs != null ? new Date(dayEndMs) : new Date(dayStartMs);

      const fromStr = ymdStrInTZ(from, MOLDOVA_TZ);
      const toStr = ymdStrInTZ(to, MOLDOVA_TZ);

      return `${fromStr}|${toStr}`;
   }, [dayStartMs, dayEndMs]);

   useEffect(() => {
      if (!waitRangeKey) {
         applyWaitNotes({}, { urgent: true });
         return;
      }

      let isActive = true;

      const [fromStr, toStrRaw] = waitRangeKey.split("|");
      const toStr = toStrRaw || fromStr;

      const from = localDateObjFromStr(fromStr);
      const to = localDateObjFromStr(toStr);

      const cacheKey = waitRangeKey;
      let entry = WAIT_NOTES_CACHE.get(cacheKey);

      if (entry && entry.data) {
         applyWaitNotes(entry.data, { deferDuringPan: true });
      }

      if (!entry) {
         entry = { data: null, error: null, promise: null };
         WAIT_NOTES_CACHE.set(cacheKey, entry);
      }

      if (!entry.promise) {
         entry.promise = fetchWaitNotesRange({ from, to, type: "wait-slot" })
            .then((raw) => {
               const normalized = normalizeWaitNotesInput(raw, from);
               entry.data = normalized;
               entry.error = null;
               return normalized;
            })
            .catch((err) => {
               entry.error = err;
               throw err;
            });
      }

      entry.promise
         .then((normalized) => {
            if (!isActive) return;
            applyWaitNotes(normalized, { deferDuringPan: true });
         })
         .catch((err) => {
            if (!isActive) return;
            console.error(
               "fetchWaitNotesRange error pentru ziua:",
               fromStr,
               err,
            );
            applyWaitNotes({}, { deferDuringPan: true });
         });

      return () => {
         isActive = false;
      };
   }, [waitRangeKey, applyWaitNotes, isPanInteracting]);

   /* ================== layout metrics ================== */

   const z = zoom || 1;

   const layoutColWidthRaw = Number(layout.colWidth) || 150;
   const layoutColWidth = layoutColWidthRaw;
   const layoutColGap = Number(layout.colGap) || 12;

   const baseHeaderHeightRaw =
      typeof layout.headerHeight === "number"
         ? layout.headerHeight
         : Number(layout.headerHeight) || 0;
   const baseHeaderHeight = Math.max(baseHeaderHeightRaw || 0, 60);

   const layoutColsPerRow = Number(layout.colsPerRow) || 4;
   const layoutRowGap = layout.rowGap != null ? Number(layout.rowGap) || 0 : 24;

   const layoutSlotHeight =
      Number(layout.slotHeight) > 0 ? Number(layout.slotHeight) : 50;
   const layoutSlotGap = 4;

   /* ================== aranjare instructori (UPDATED: sectorFilter) ================== */

   const effectiveInstructors = useMemo(() => {
      if (!Array.isArray(instructors) || !instructors.length) return [];

      const base = instructors.slice();

      const cancelPads = [];
      const waitPads = [];
      const lateralPads = [];
      const real = [];

      // 2) Regula Buiucani: Marți/Joi/Duminică
      let showBuiucani = true;
      {
         const d = dayStart instanceof Date ? dayStart : new Date(dayStart);
         if (d && !Number.isNaN(d.getTime())) {
            const wd = d.getDay(); // 0=Sun ... 6=Sat
            showBuiucani = wd === 2 || wd === 4 || wd === 0;
         }
      }

      // 1) Separăm PAD-urile vs reali
      for (let srcIndex = 0; srcIndex < base.length; srcIndex++) {
         const inst = base[srcIndex];
         if (!inst) continue;

         const id = String(inst.id ?? "");
         const nameLower = String(inst.name ?? "").toLowerCase();
         const isPad = id.startsWith("__pad_");

         if (!isPad) {
            real.push({ ...inst, __srcIndex: srcIndex });
            continue;
         }

         let padType = inst._padType || null;
         if (!padType) {
            if (id === "__pad_1" || nameLower.includes("anular"))
               padType = "cancel";
            else if (id === LATERAL_PAD_ID || nameLower.includes("later"))
               padType = "lateral";
            else padType = "wait";
         }

         if (padType === "cancel")
            cancelPads.push({ ...inst, _padType: "cancel" });
         else if (padType === "lateral")
            lateralPads.push({ ...inst, _padType: "lateral" });
         else waitPads.push({ ...inst, _padType: "wait" });
      }

      const lateralTemplate =
         lateralPads[0] || waitPads[0] || cancelPads[0] || null;

      // 2) Regula Buiucani: Marți/Joi/Duminică
      if (dayStart instanceof Date) {
         const wd = dayStart.getDay(); // 0=Sun ... 6=Sat
         showBuiucani = wd === 2 || wd === 4 || wd === 0;
      }

      let realFiltered = showBuiucani
         ? real
         : real.filter((inst) => !isBuiucaniInstructor(inst));

      // 2.1) Sector filter (dacă e activ) — aplicat doar pe instructori reali
      if (activeSectorFilter) {
         realFiltered = realFiltered.filter((inst) => {
            const s = normalizeSectorFilter(getInstructorSector(inst));
            return s === activeSectorFilter;
         });
      }

      // 3) Sortare după order (simplu)
      // 3) Sortare după order + păstrare poziții (gaps) + gapsAfter

      const pickOrderVal = (obj) =>
         obj?.order ??
         obj?.uiOrder ??
         obj?.sortOrder ??
         obj?.position ??
         obj?.sort_index ??
         null;

      const orderMetaCache = new Map();
      const readOrderMeta = (inst) => {
         const cacheKey = String(inst?.id ?? inst?.__srcIndex ?? "");
         if (orderMetaCache.has(cacheKey)) return orderMetaCache.get(cacheKey);

         let v = pickOrderVal(inst);

         if (v == null && inst?.id != null) {
            const full = instructorsFullById.get(String(inst.id));
            if (full) v = pickOrderVal(full);
         }

         const t = parseOrderToken(v);

         const posRaw = showBuiucani ? t.pos : (t.posAlt ?? t.pos);
         const pos =
            Number.isFinite(posRaw) && posRaw > 0
               ? Math.min(MAX_ORDER_POS, Math.max(1, posRaw))
               : Number.POSITIVE_INFINITY;

         const gapsAfter = Math.max(
            0,
            Math.min(MAX_GAPS_AFTER, t.gapsAfter || 0),
         );

         const meta = { pos, gapsAfter };
         orderMetaCache.set(cacheKey, meta);
         return meta;
      };

      // sort (stabil)
      const sorted = realFiltered.slice().sort((a, b) => {
         const ao = readOrderMeta(a).pos;
         const bo = readOrderMeta(b).pos;
         if (ao !== bo) return ao - bo;

         if (showBuiucani) {
            const ab = isBuiucaniInstructor(a) ? 1 : 0;
            const bb = isBuiucaniInstructor(b) ? 1 : 0;
            if (ab !== bb) return bb - ab;
         }

         const ai = a.__srcIndex ?? 0;
         const bi = b.__srcIndex ?? 0;
         if (ai !== bi) return ai - bi;

         const aid = String(a.id ?? "");
         const bid = String(b.id ?? "");
         return aid < bid ? -1 : aid > bid ? 1 : 0;
      });

      // construim lista FINALĂ cu poziții goale (null) + gapsAfter (null)
      const positioned = [];

      for (const inst of sorted) {
         const meta = readOrderMeta(inst);

         // fără order valid -> la coadă (compact)
         if (
            !Number.isFinite(meta.pos) ||
            meta.pos === Number.POSITIVE_INFINITY
         ) {
            positioned.push(inst);
            continue;
         }

         const desiredIndex = meta.pos - 1;

         // umple pozițiile lipsă cu NULL (gol real)
         while (positioned.length < desiredIndex) positioned.push(null);

         // pune instructorul pe index; dacă indexul e liber (null), îl ocupă
         if (positioned.length === desiredIndex) {
            positioned.push(inst);
         } else if (positioned[desiredIndex] == null) {
            positioned[desiredIndex] = inst;
         } else {
            // coliziune (două persoane cu aceeași poziție) -> împinge la dreapta
            positioned.splice(desiredIndex, 0, inst);
         }

         // gapsAfter: inserează N goluri (null) imediat după
         const gapsAfter = Math.max(
            0,
            Math.min(MAX_GAPS_AFTER, meta.gapsAfter || 0),
         );
         for (let g = 0; g < gapsAfter; g++) {
            positioned.splice(desiredIndex + 1 + g, 0, null);
         }
      }

      // helper: clone pad cu index
      const makePad = (inst, padType, columnIndex) => {
         if (!inst) return null;
         return {
            ...inst,
            _padType: padType ?? inst._padType ?? null,
            _padColumnIndex: columnIndex,
         };
      };

      // 4) RÂNDUL 1 fix: 2 anulări + 2 așteptări
      const cancel1Base =
         cancelPads[0] ||
         cancelPads[1] ||
         lateralTemplate ||
         waitPads[0] ||
         null;
      const cancel2Base = cancelPads[1] || cancelPads[0] || cancel1Base;

      const wait1Base =
         waitPads[0] || waitPads[1] || lateralTemplate || cancel1Base || null;
      const wait2Base = waitPads[1] || waitPads[0] || wait1Base;

      const rows = [];
      rows.push([
         makePad(cancel1Base, "cancel", 0),
         makePad(cancel2Base, "cancel", 1),
         makePad(wait1Base, "wait", 0),
         makePad(wait2Base, "wait", 1),
      ]);

      // 5) Rânduri 2+: 3 coloane (pot fi null) + Laterală
      let i = 0;

      const makeLateral = (rowIndex) => {
         if (!lateralTemplate) return null;
         return {
            ...lateralTemplate,
            _padType: "lateral",
            _clone: true,
            _padColumnIndex: rowIndex,
         };
      };

      while (i < positioned.length) {
         const rowIndex = rows.length;

         const c0 = i < positioned.length ? positioned[i++] : null;
         const c1 = i < positioned.length ? positioned[i++] : null;
         const c2 = i < positioned.length ? positioned[i++] : null;

         rows.push([c0, c1, c2, makeLateral(rowIndex)]);
      }

      return rows.flat();
   }, [
      instructors,
      instructorsFullById,
      dayStart,
      activeSectorFilter, // ✅ IMPORTANT (fiindcă filtrăm acum efectiv)
   ]);

   // ✅ NEW: semnătură layout instructori (forțează redraw când se schimbă sector/ordinea)
   const instructorsLayoutSig = useMemo(
      () => buildInstructorsLayoutSignature(effectiveInstructors),
      [effectiveInstructors],
   );

   const headerMetrics = useMemo(() => {
      const colsCount = Math.max(1, effectiveInstructors.length || 1);

      const colWidth = layoutColWidth;
      const colGap = layoutColGap;
      const headerHeight = Math.max(baseHeaderHeight * z, 60 * z);

      const colsPerRow = layoutColsPerRow;
      const rowsCount = Math.max(1, Math.ceil(colsCount / colsPerRow));

      const rowGap = layoutRowGap;

      const slotHeight = layoutSlotHeight;
      const slotGap = layoutSlotGap;
      const slotsCount = Array.isArray(slots) ? slots.length : 0;
      const worldHeight = computeWorldHeight(slotsCount, slotHeight, slotGap);

      const padSlots = Math.min(WAIT_SLOTS_PER_COLUMN, slotsCount || 0);
      const padWorldHeight = padSlots
         ? computeWorldHeight(padSlots, slotHeight, slotGap)
         : worldHeight;

      const rowHeights = new Array(rowsCount);
      for (let row = 0; row < rowsCount; row++) {
         const rowStart = row * colsPerRow;
         const rowEnd = Math.min(colsCount, rowStart + colsPerRow);
         let allPad = true;
         for (let i = rowStart; i < rowEnd; i++) {
            const inst = effectiveInstructors[i];
            if (!inst || !String(inst.id || "").startsWith("__pad_")) {
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

      return {
         colsCount,
         colWidth,
         colGap,
         headerHeight,
         colsPerRow,
         rowsCount,
         rowGap,
         slotHeight,
         slotGap,
         worldHeight,
         padWorldHeight,
         rowHeights,
         rowTops,
      };
   }, [
      effectiveInstructors,
      layoutColWidth,
      layoutColGap,
      layoutColsPerRow,
      layoutRowGap,
      layoutSlotHeight,
      layoutSlotGap,
      slots,
      baseHeaderHeight,
      z,
   ]);

   const workerSceneCacheEnabled =
      ENABLE_CANVAS_WORKER &&
      workerRuntimeReady &&
      workerEnabledRef.current &&
      !!workerRef.current;

   const dayWorldWidth = useMemo(() => {
      const colsPerRow = Math.max(1, Number(headerMetrics?.colsPerRow || 0));
      const colsCount = Math.max(0, Number(headerMetrics?.colsCount || 0));
      const colWidth = Math.max(0, Number(headerMetrics?.colWidth || 0));
      const colGap = Math.max(0, Number(headerMetrics?.colGap || 0));

      const effectiveCols = Math.min(colsPerRow, colsCount);
      const baseWorldWidth =
         effectiveCols * colWidth + Math.max(0, effectiveCols - 1) * colGap;

      const preGridWidthLocal =
         hasPreGrid && preGridCols > 0 && colWidth > 0
            ? preGridCols * colWidth + Math.max(0, preGridCols - 1) * colGap
            : 0;

      return Math.max(0, preGridWidthLocal + baseWorldWidth);
   }, [
      headerMetrics?.colsPerRow,
      headerMetrics?.colsCount,
      headerMetrics?.colWidth,
      headerMetrics?.colGap,
      hasPreGrid,
      preGridCols,
   ]);

   const isDayNearViewport = useMemo(() => {
      const viewWidth = Math.max(0, Number(viewportWidth) || 0);
      if (viewWidth <= 0) return true;

      const viewLeft = Math.max(0, Number(viewportScrollLeft) || 0);
      const viewRight = viewLeft + viewWidth;

      const dayLeft = Math.max(0, Number(dayOffsetLeft) || 0);
      const dayRight = dayLeft + Math.max(0, Number(dayWorldWidth) || 0);
      if (dayRight <= dayLeft) return true;

      const margin = Math.max(
         DAY_OFFSCREEN_MARGIN_BASE_PX,
         Math.round(viewWidth * (IS_LOW_SPEC_DEVICE ? 0.25 : 0.4)),
      );

      return !(dayRight < viewLeft - margin || dayLeft > viewRight + margin);
   }, [viewportWidth, viewportScrollLeft, dayOffsetLeft, dayWorldWidth]);

   const rowRenderRange = useMemo(() => {
      const rowsCount = Number(headerMetrics?.rowsCount || 0);
      if (!rowsCount) return { start: 0, end: 0 };

      const viewH = Number(viewportHeight) || 0;
      if (viewH <= 0) return { start: 0, end: rowsCount - 1 };

      const rowTops = headerMetrics?.rowTops || [];
      const rowHeights = headerMetrics?.rowHeights || [];
      const headerH = Number(headerMetrics?.headerHeight || 0);
      const fallbackWorldHeight = Number(headerMetrics?.worldHeight || 0);
      const overscanPx = Math.max(120, Math.round(viewH * 0.25));

      const viewTop = Math.max(0, Number(viewportScrollTop) || 0);
      const viewBottom = viewTop + viewH;

      let start = 0;
      let end = rowsCount - 1;

      for (let r = 0; r < rowsCount; r++) {
         const rowTop = Number(rowTops[r] || 0);
         const rowBodyHeight = Number(rowHeights[r] || fallbackWorldHeight);
         const rowBottom = rowTop + headerH + rowBodyHeight;
         if (rowBottom >= viewTop - overscanPx) {
            start = r;
            break;
         }
      }

      for (let r = rowsCount - 1; r >= 0; r--) {
         const rowTop = Number(rowTops[r] || 0);
         if (rowTop <= viewBottom + overscanPx) {
            end = r;
            break;
         }
      }

      if (end < start) return { start: 0, end: rowsCount - 1 };
      return { start, end };
   }, [
      headerMetrics?.rowsCount,
      headerMetrics?.rowTops,
      headerMetrics?.rowHeights,
      headerMetrics?.headerHeight,
      headerMetrics?.worldHeight,
      viewportScrollTop,
      viewportHeight,
   ]);

   const colRenderRange = useMemo(() => {
      const colsPerRow = Math.max(1, Number(headerMetrics?.colsPerRow || 0));
      if (!colsPerRow) return { start: 0, end: 0 };

      const viewW = Number(viewportWidth) || 0;
      if (viewW <= 0) return { start: 0, end: colsPerRow - 1 };

      const colWidth = Number(headerMetrics?.colWidth || 0);
      const colGap = Number(headerMetrics?.colGap || 0);
      if (colWidth <= 0) return { start: 0, end: colsPerRow - 1 };

      const preGridWidth =
         hasPreGrid && preGridCols > 0
            ? preGridCols * colWidth + Math.max(0, preGridCols - 1) * colGap
            : 0;

      const stride = Math.max(1, colWidth + colGap);
      const overscanPx = Math.max(180, Math.round(colWidth * 1.5));

      const globalViewLeft = Math.max(0, Number(viewportScrollLeft) || 0);
      const localDayLeft = Math.max(0, Number(dayOffsetLeft) || 0);
      const localViewLeft = Math.max(0, globalViewLeft - localDayLeft);
      const localViewRight = localViewLeft + viewW;

      const scanStart = localViewLeft - preGridWidth - overscanPx;
      const scanEnd = localViewRight - preGridWidth + overscanPx;

      const start = Math.max(0, Math.floor(scanStart / stride));
      const end = Math.min(colsPerRow - 1, Math.ceil(scanEnd / stride));

      if (end < start) return { start: 0, end: -1 };
      return { start, end };
   }, [
      headerMetrics?.colsPerRow,
      headerMetrics?.colWidth,
      headerMetrics?.colGap,
      viewportWidth,
      viewportScrollLeft,
      dayOffsetLeft,
      hasPreGrid,
      preGridCols,
   ]);

   const rowRenderStartDep = rowRenderRange.start;
   const rowRenderEndDep = rowRenderRange.end;
   const colRenderStartDep = colRenderRange.start;
   const colRenderEndDep = colRenderRange.end;

   useEffect(() => {
      if (!workerSceneCacheEnabled) return;
      if (!isDayNearViewport) return;
      const worker = workerRef.current;
      if (!worker) return;

      const localViewportLeft = Math.max(
         0,
         (Number(viewportScrollLeft) || 0) - (Number(dayOffsetLeft) || 0),
      );
      const localViewportTop = Math.max(0, Number(viewportScrollTop) || 0);
      const localViewportWidth = Math.max(0, Number(viewportWidth) || 0);
      const localViewportHeight = Math.max(0, Number(viewportHeight) || 0);

      try {
         worker.postMessage({
            type: "camera",
            camera: {
               x: localViewportLeft,
               y: localViewportTop,
               width: localViewportWidth,
               height: localViewportHeight,
               zoom: Number(zoom) || 1,
            },
         });
      } catch {}
   }, [
      workerSceneCacheEnabled,
      viewportScrollLeft,
      dayOffsetLeft,
      viewportScrollTop,
      viewportWidth,
      viewportHeight,
      zoom,
      isDayNearViewport,
   ]);

   /* ================== slot geoms ================== */

   const slotGeoms = useMemo(() => {
      return (slots || [])
         .map((slot, index) => {
            const s =
               slot.start instanceof Date ? slot.start : new Date(slot.start);
            const e = slot.end instanceof Date ? slot.end : new Date(slot.end);
            const startMs = s.getTime();
            const endMs = e.getTime();
            if (!Number.isFinite(startMs) || !Number.isFinite(endMs))
               return null;
            return {
               slot: { ...slot, start: s, end: e },
               index,
               startMs,
               endMs,
               label: formatHHMM(s),
            };
         })
         .filter(Boolean);
   }, [slots]);

   const padCancelColumns = useMemo(
      () =>
         effectiveInstructors.filter(
            (inst) => inst && inst._padType === "cancel",
         ),
      [effectiveInstructors],
   );

   /* ================== eventsForCanvas (hidden + cancel pad + Laterală) ================== */

   const eventsForCanvas = useMemo(() => {
      if (!Array.isArray(events) || !events.length) return [];

      const hasHidden = hasHiddenIds();
      const source = hasHidden
         ? events.filter((ev) => {
              const raw = ev.raw || {};
              const id = raw.id ?? ev.id;
              if (id == null) return true;
              return !isHidden(id);
           })
         : events;

      if (!source.length) return [];
      const useCancelPad = padCancelColumns.length > 0 && slotGeoms.length > 0;

      const colsPerRow = layoutColsPerRow || 4;
      const hasSlots = slotGeoms.length > 0;

      const instIdToRow = new Map();
      const rowToLateralInst = new Map();
      let hasLateralPads = false;

      if (hasSlots && effectiveInstructors && effectiveInstructors.length) {
         effectiveInstructors.forEach((inst, idx) => {
            if (!inst) return;
            const id = String(inst.id ?? "");
            const row = Math.floor(idx / colsPerRow);
            const padType = inst._padType || null;

            if (padType === "lateral") {
               rowToLateralInst.set(row, inst);
               hasLateralPads = true;
            } else if (id && !id.startsWith("__pad_")) {
               instIdToRow.set(id, row);
            }
         });
      }

      const base = [];
      const canceled = [];

      for (const ev of source) {
         if (useCancelPad && isEventCanceled(ev)) {
            canceled.push(ev);
            continue;
         }

         let outEv = ev;

         if (hasLateralPads && hasSlots) {
            const startDate =
               ev.start instanceof Date ? ev.start : new Date(ev.start || 0);
            if (!Number.isNaN(startDate.getTime())) {
               const hhmm = hhmmInTZ(startDate, MOLDOVA_TZ);
               const lateralSlotRawIndex = LATERAL_TIME_MARKS.indexOf(hhmm);

               if (lateralSlotRawIndex >= 0) {
                  const raw = ev.raw || {};
                  const origInstId = String(
                     raw.instructorId ??
                        raw.instructor_id ??
                        ev.instructorId ??
                        "",
                  );

                  const row = instIdToRow.get(origInstId);
                  if (row != null) {
                     const lateralInst = rowToLateralInst.get(row);
                     if (lateralInst) {
                        const padSlotIndex = Math.min(
                           lateralSlotRawIndex,
                           LATERAL_SLOTS_PER_COLUMN - 1,
                           slotGeoms.length - 1,
                        );

                        const padColumnIndex =
                           typeof lateralInst._padColumnIndex === "number"
                              ? lateralInst._padColumnIndex
                              : row;

                        outEv = {
                           ...ev,
                           instructorId: lateralInst.id,
                           _padSlotIndex: padSlotIndex,
                           _padColumnIndex: padColumnIndex,
                           _fromLateralPad: true,
                        };
                     }
                  }
               }
            }
         }

         base.push(outEv);
      }

      if (!useCancelPad || !canceled.length) return base;

      const padSlots = slotGeoms.slice(0, CANCEL_SLOTS_PER_COLUMN);
      if (!padSlots.length) return base;

      const maxSlotsTotal = padSlots.length * padCancelColumns.length;

      const canceledSorted = canceled.slice().sort((a, b) => {
         const aStartMs =
            a.start instanceof Date
               ? a.start.getTime()
               : new Date(a.start || 0).getTime();
         const bStartMs =
            b.start instanceof Date
               ? b.start.getTime()
               : new Date(b.start || 0).getTime();
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
      });

      canceledSorted.slice(0, maxSlotsTotal).forEach((ev, idx) => {
         const padIdx = Math.floor(idx / padSlots.length);
         const localSlotIdx = idx % padSlots.length;
         const inst = padCancelColumns[padIdx];
         const sg = padSlots[localSlotIdx];

         if (!inst || !sg || !sg.slot) return;

         const s = ev.start instanceof Date ? ev.start : new Date(ev.start);
         const padColumnIndex =
            typeof inst._padColumnIndex === "number"
               ? inst._padColumnIndex
               : padIdx;

         base.push({
            ...ev,
            instructorId: inst.id,
            _padSlotIndex: sg.index,
            localSlotKey: localKeyFromTs(s),
            _movedToCancelPad: true,
            _padColumnIndex: padColumnIndex,
         });
      });

      return base;
   }, [
      events,
      padCancelColumns,
      slotGeoms,
      hiddenVersion,
      effectiveInstructors,
      layoutColsPerRow,
      refreshTick,
   ]);

   const eventsByReservationId = useMemo(() => {
      const map = new Map();
      if (!Array.isArray(eventsForCanvas) || !eventsForCanvas.length) return map;
      for (const ev of eventsForCanvas) {
         if (!ev) continue;
         const rid = ev?.raw?.id ?? ev?.id;
         if (rid == null) continue;
         const key = String(rid);
         if (!map.has(key)) map.set(key, ev);
      }
      return map;
   }, [eventsForCanvas]);

   const workerColorOverrides = useMemo(() => {
      void themeTick;
      if (typeof document === "undefined" || typeof getComputedStyle !== "function")
         return null;
      const root = getColorRoot();
      if (!root) return null;

      const tokens = new Set(WORKER_COLOR_TOKENS_BASE);
      if (Array.isArray(eventsForCanvas)) {
         for (const ev of eventsForCanvas) {
            const token = extractCssTokenFromColor(ev?.color ?? ev?.raw?.color);
            if (token) tokens.add(token);
         }
      }

      const styles = getComputedStyle(root);
      const output = {};
      for (const token of tokens) {
         const val = String(styles.getPropertyValue(token) || "").trim();
         if (val) output[token] = val;
      }

      return Object.keys(output).length ? output : null;
   }, [eventsForCanvas, themeTick]);

   // Când densitatea e mare folosim desen compact, dar NU îl forțăm în pan;
   // păstrăm textul stabil și evităm "dispariția" în timpul drag/pan.
   const dynamicDenseRenderMode = useMemo(() => {
      const eventCount = Array.isArray(eventsForCanvas) ? eventsForCanvas.length : 0;
      const instructorCount = Array.isArray(effectiveInstructors)
         ? effectiveInstructors.length
         : 0;
      return eventCount >= 260 || instructorCount >= 72;
   }, [eventsForCanvas, effectiveInstructors]);
   const denseRenderMode = dynamicDenseRenderMode;
   const ultraFastRenderMode = false;

   /* ================== blocked normalize + canceled slots per inst ================== */

   const { blockedKeyMapForSlots, canceledSlotKeysByInst } = useMemo(() => {
      const canceledKeysByInst = new Map();

      const markCanceled = (instId, localKey) => {
         if (!instId || !localKey) return;
         const keyInst = String(instId);
         let set = canceledKeysByInst.get(keyInst);
         if (!set) {
            set = new Set();
            canceledKeysByInst.set(keyInst, set);
         }
         set.add(String(localKey));
      };

      (events || []).forEach((ev) => {
         if (!isEventCanceled(ev)) return;
         const instId =
            ev.instructorId ??
            ev.raw?.instructorId ??
            ev.raw?.instructor_id ??
            null;
         if (!instId) return;
         const start =
            ev.start instanceof Date ? ev.start : new Date(ev.start || 0);
         if (!Number.isFinite(start.getTime())) return;
         markCanceled(instId, localKeyFromTs(start));
      });

      let normalizedBlocked = null;

      if (!blockedKeyMap) normalizedBlocked = null;
      else if (blockedKeyMap instanceof Map) normalizedBlocked = blockedKeyMap;
      else if (Array.isArray(blockedKeyMap))
         normalizedBlocked = buildBlockedMapFromBlackoutsList(blockedKeyMap);
      else if (
         typeof blockedKeyMap === "object" &&
         Array.isArray(blockedKeyMap.blackouts)
      )
         normalizedBlocked = buildBlockedMapFromBlackoutsList(
            blockedKeyMap.blackouts,
         );
      else if (typeof blockedKeyMap === "object") {
         const m = new Map();
         for (const [key, value] of Object.entries(blockedKeyMap))
            m.set(key, value);
         normalizedBlocked = m;
      }

      return {
         blockedKeyMapForSlots: normalizedBlocked,
         canceledSlotKeysByInst: canceledKeysByInst,
      };
   }, [blockedKeyMap, events, refreshTick]);

   /* ================== overlapEventsByInst (active only) ================== */

   const overlapEventsByInst = useMemo(() => {
      const map = new Map();
      if (!Array.isArray(events) || !events.length) return map;

      events.forEach((ev) => {
         if (!ev) return;
         if (isEventCanceled(ev)) return;

         const raw = ev.raw || {};
         let iid = null;
         if (raw.instructorId != null) iid = raw.instructorId;
         else if (raw.instructor_id != null) iid = raw.instructor_id;
         else if (ev.instructorId != null) iid = ev.instructorId;

         if (iid == null) return;

         const start =
            ev.start instanceof Date ? ev.start : new Date(ev.start || 0);
         const end = ev.end instanceof Date ? ev.end : new Date(ev.end || 0);

         if (
            !Number.isFinite(start.getTime()) ||
            !Number.isFinite(end.getTime())
         )
            return;

         const key = String(iid);
         if (!map.has(key)) map.set(key, []);
         map.get(key).push({ start, end });
      });

      return map;
   }, [events, refreshTick]);

   /* ================== signatures (redraw memo) ================== */

   // Calculăm semnătura la fiecare render pentru a prinde și mutațiile in-place
   // (în prod pot apărea update-uri socket fără referințe noi de array).
   const eventsSig = buildCanvasEventsSignature(eventsForCanvas);

   const workerEventState = useMemo(
      () => {
         // menținem și invalidarea pe eventsSig pentru cazurile cu mutații in-place
         void eventsSig;
         return buildWorkerEventState(eventsForCanvas);
      },
      [eventsForCanvas, eventsSig],
   );

   const workerEventEntries = useMemo(
      () => serializeWorkerEventState(workerEventState),
      [workerEventState],
   );

   const slotsSig = useMemo(() => buildSlotsSignature(slotGeoms), [slotGeoms]);

   const blockedSig = useMemo(
      () => buildBlockedSignature(blockedKeyMapForSlots, effectiveInstructors),
      [blockedKeyMapForSlots, effectiveInstructors],
   );

   const waitSig = useMemo(
      () => buildWaitNotesSignature(waitNotes),
      [waitNotes],
   );

   const dayRenderModel = useMemo(
      () => {
         void themeTick;
         return buildDayRenderModel({
            events: eventsForCanvas,
            slotGeoms,
            overlapEventsByInst,
            canceledSlotKeysByInst,
         });
      },
      [
         eventsForCanvas,
         slotGeoms,
         overlapEventsByInst,
         canceledSlotKeysByInst,
         themeTick,
      ],
   );

   useEffect(() => {
      hitMapNeedsRebuildRef.current = true;
   }, [
      eventsSig,
      slotsSig,
      blockedSig,
      waitSig,
      activeSectorFilter,
      instructorsLayoutSig,
      rowRenderStartDep,
      rowRenderEndDep,
      colRenderStartDep,
      colRenderEndDep,
      dayStart,
      dayEnd,
   ]);

   /* ================== draw effect ================== */

   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const {
         colsCount,
         colWidth,
         colGap,
         headerHeight,
         colsPerRow,
         rowsCount,
         rowGap,
         slotHeight,
         slotGap,
         worldHeight,
         rowHeights,
      } = headerMetrics;

      const hoursColWidth = 0;

      const effectiveCols = Math.min(colsPerRow, colsCount);
      const baseWorldWidth =
         effectiveCols * colWidth + Math.max(0, effectiveCols - 1) * colGap;

      const preGridWidth =
         hasPreGrid && colWidth > 0
            ? preGridCols * colWidth + Math.max(0, preGridCols - 1) * colGap
            : 0;

      const worldWidth = preGridWidth + baseWorldWidth;

      const desiredDpr =
         typeof window !== "undefined"
            ? Math.min(window.devicePixelRatio || 1, DPR_LIMIT)
            : 1;

      const eventsSafe = Array.isArray(eventsForCanvas) ? eventsForCanvas : [];
      const nowTs = Date.now();
      const hasHitMapDemand =
         activeEventId != null || hitMapInteractiveUntilRef.current > nowTs;
      const hitMapAgeMs = nowTs - hitMapBuiltAtRef.current;
      const shouldBuildHitMap = !!(
         !isPanInteracting &&
         (hasHitMapDemand ||
            hitMapNeedsRebuildRef.current ||
            hitMapAgeMs > HITMAP_STALE_MAX_AGE_MS)
      );
      const dayHasActiveEvent =
         activeEventId != null &&
         eventsByReservationId.has(String(activeEventId));
      const forceFullSceneForFocus = !!(
         dayHasActiveEvent &&
         activeEventId &&
         activeRectResolveRef.current.id === String(activeEventId) &&
         !activeRectResolveRef.current.resolved
      );
      const visibleRowStartForDraw = forceFullSceneForFocus
         ? 0
         : rowRenderStartDep;
      const visibleRowEndForDraw = forceFullSceneForFocus
         ? rowsCount - 1
         : rowRenderEndDep;
      const visibleColStartForDraw = forceFullSceneForFocus
         ? 0
         : colRenderStartDep;
      const visibleColEndForDraw = forceFullSceneForFocus
         ? Math.max(0, colsPerRow - 1)
         : colRenderEndDep;
      const shouldRenderScene = isDayNearViewport || forceFullSceneForFocus;
      const highlightEventIdForRender =
         selectedEventId || activeEventId || null;

      const highlightSlot =
         selectedSlot && selectedSlot.slotStart
            ? {
                 instructorId: String(
                    selectedSlot.highlightInstructorId ??
                       selectedSlot.instructorId,
                 ),
                 slotStart: selectedSlot.slotStart,
                 highlightInstructorId:
                    selectedSlot.highlightInstructorId ??
                    selectedSlot.instructorId,
              }
            : null;

      const editingWaitForRender = waitEdit
         ? {
              instId: String(waitEdit.instId),
              slotIndex: Number(waitEdit.slotIndex || 0),
           }
         : null;

      const sceneBaseSig = {
         dayStart: dayStart ? ymdStrInTZ(dayStart) : "0",
         dayEnd: dayEnd ? ymdStrInTZ(dayEnd) : "0",
         colsCount,
         colWidth,
         colGap,
         headerHeight,
         rowsCount,
         rowHeights: rowHeights.join(","),
         slotHeight,
         slotGap,
         worldHeight,
         zoom,
         blackoutVer,
         themeTick,
         slotsSig,
         blockedSig,
         waitSig,
         presenceSig,
         desiredBadgeSig,
         createDraftSig,
         denseRenderMode: denseRenderMode ? 1 : 0,

         // ✅ NEW: forțează redraw când schimbi sector/ordonare instructori
         sectorSig: activeSectorFilter || "ALL",
         instructorsLayoutSig,
      };

      const sceneBaseKey = JSON.stringify(sceneBaseSig);

      let width = hoursColWidth + worldWidth;

      const totalRowsHeight =
         rowHeights && rowHeights.length
            ? rowHeights.reduce((sum, h) => sum + (headerHeight + h), 0)
            : rowsCount * (headerHeight + worldHeight);

      let height =
         totalRowsHeight + (rowsCount > 0 ? (rowsCount - 1) * rowGap : 0);

      width = Math.max(width, effectiveCols * colWidth);
      height = Math.max(height, headerHeight + 200);
      const canvasDpr = computeSafeCanvasDpr(width, height, desiredDpr);
      const localViewportLeft = Math.max(
         0,
         (Number(viewportScrollLeft) || 0) - (Number(dayOffsetLeft) || 0),
      );
      const localViewportTop = Math.max(0, Number(viewportScrollTop) || 0);
      const viewW = Math.max(0, Number(viewportWidth) || 0);
      const viewH = Math.max(0, Number(viewportHeight) || 0);
      const overscanX = isPanInteracting
         ? Math.max(56, Math.round(colWidth * 0.45))
         : Math.max(80, Math.round(colWidth * 0.75));
      const overscanY = isPanInteracting
         ? Math.max(84, Math.round(slotHeight * 1.0))
         : Math.max(120, Math.round(slotHeight * 1.5));
      const canWindow = shouldRenderScene && viewW > 0 && viewH > 0;
      const renderSurfaceWidth = canWindow
         ? Math.max(1, Math.min(width, Math.round(viewW + overscanX * 2)))
         : Math.max(1, Math.round(width));
      const renderSurfaceHeight = canWindow
         ? Math.max(1, Math.min(height, Math.round(viewH + overscanY * 2)))
         : Math.max(1, Math.round(height));
      const maxOriginX = Math.max(0, Math.round(width - renderSurfaceWidth));
      const maxOriginY = Math.max(0, Math.round(height - renderSurfaceHeight));
      const renderOriginX = canWindow
         ? Math.max(
              0,
              Math.min(maxOriginX, Math.round(localViewportLeft - overscanX)),
           )
         : 0;
      const renderOriginY = canWindow
         ? Math.max(
              0,
              Math.min(maxOriginY, Math.round(localViewportTop - overscanY)),
           )
         : 0;
      const staticSnapStepX = canWindow
         ? Math.max(
              8,
              Math.min(
                 STATIC_LAYER_ORIGIN_SNAP_MAX_PX,
                 Math.round(Math.max(16, overscanX * 0.5)),
              ),
           )
         : 1;
      const staticSnapStepY = canWindow
         ? Math.max(
              8,
              Math.min(
                 STATIC_LAYER_ORIGIN_SNAP_MAX_PX,
                 Math.round(Math.max(16, overscanY * 0.5)),
              ),
           )
         : 1;
      const staticOriginX = canWindow
         ? snapViewportOrigin(renderOriginX, maxOriginX, staticSnapStepX)
         : renderOriginX;
      const staticOriginY = canWindow
         ? snapViewportOrigin(renderOriginY, maxOriginY, staticSnapStepY)
         : renderOriginY;
      const staticSourceOffsetX = Math.max(0, renderOriginX - staticOriginX);
      const staticSourceOffsetY = Math.max(0, renderOriginY - staticOriginY);
      const staticSurfaceWidth = canWindow
         ? Math.max(
              renderSurfaceWidth,
              Math.min(
                 Math.max(1, Math.round(width - staticOriginX)),
                 Math.round(renderSurfaceWidth + staticSnapStepX),
              ),
           )
         : renderSurfaceWidth;
      const staticSurfaceHeight = canWindow
         ? Math.max(
              renderSurfaceHeight,
              Math.min(
                 Math.max(1, Math.round(height - staticOriginY)),
                 Math.round(renderSurfaceHeight + staticSnapStepY),
              ),
           )
         : renderSurfaceHeight;
      const dynamicSnapStepX =
         canWindow && isPanInteracting
            ? Math.max(
                 12,
                 Math.min(
                    DYNAMIC_LAYER_ORIGIN_SNAP_MAX_PX,
                    Math.round(Math.max(20, overscanX * 0.95)),
                 ),
              )
            : 1;
      const dynamicSnapStepY =
         canWindow && isPanInteracting
            ? Math.max(
                 16,
                 Math.min(
                    DYNAMIC_LAYER_ORIGIN_SNAP_MAX_PX,
                    Math.round(Math.max(26, overscanY * 0.95)),
                 ),
              )
            : 1;
      const dynamicOriginX = canWindow
         ? snapViewportOrigin(renderOriginX, maxOriginX, dynamicSnapStepX)
         : renderOriginX;
      const dynamicOriginY = canWindow
         ? snapViewportOrigin(renderOriginY, maxOriginY, dynamicSnapStepY)
         : renderOriginY;
      const dynamicSourceOffsetX = Math.max(0, renderOriginX - dynamicOriginX);
      const dynamicSourceOffsetY = Math.max(0, renderOriginY - dynamicOriginY);
      const dynamicSurfaceWidth = canWindow
         ? Math.max(
              renderSurfaceWidth,
              Math.min(
                 Math.max(1, Math.round(width - dynamicOriginX)),
                 Math.round(renderSurfaceWidth + dynamicSnapStepX),
              ),
           )
         : renderSurfaceWidth;
      const dynamicSurfaceHeight = canWindow
         ? Math.max(
              renderSurfaceHeight,
              Math.min(
                 Math.max(1, Math.round(height - dynamicOriginY)),
                 Math.round(renderSurfaceHeight + dynamicSnapStepY),
              ),
           )
         : renderSurfaceHeight;
      const maxSceneRowIdx = Math.max(0, rowsCount - 1);
      const maxSceneColIdx = Math.max(0, colsPerRow - 1);
      const staticVisibleRowStart = Math.max(
         0,
         Math.min(maxSceneRowIdx, Number(visibleRowStartForDraw || 0) - 1),
      );
      const staticVisibleRowEnd = Math.max(
         staticVisibleRowStart,
         Math.min(maxSceneRowIdx, Number(visibleRowEndForDraw || 0) + 1),
      );
      const staticVisibleColStart = Math.max(
         0,
         Math.min(maxSceneColIdx, Number(visibleColStartForDraw || 0) - 1),
      );
      const staticVisibleColEnd = Math.max(
         staticVisibleColStart,
         Math.min(maxSceneColIdx, Number(visibleColEndForDraw || 0) + 1),
      );
      const dynamicVisibleRowStart = Math.max(
         0,
         Math.min(maxSceneRowIdx, Number(visibleRowStartForDraw || 0) - 1),
      );
      const dynamicVisibleRowEnd = Math.max(
         dynamicVisibleRowStart,
         Math.min(maxSceneRowIdx, Number(visibleRowEndForDraw || 0) + 1),
      );
      const dynamicVisibleColStart = Math.max(
         0,
         Math.min(maxSceneColIdx, Number(visibleColStartForDraw || 0) - 1),
      );
      const dynamicVisibleColEnd = Math.max(
         dynamicVisibleColStart,
         Math.min(maxSceneColIdx, Number(visibleColEndForDraw || 0) + 1),
      );
      renderWindowRef.current = {
         x: renderOriginX,
         y: renderOriginY,
         w: renderSurfaceWidth,
         h: renderSurfaceHeight,
      };
      const staticLayerKey = JSON.stringify({
         sceneBaseKey,
         width: renderSurfaceWidth,
         height: renderSurfaceHeight,
         staticW: staticSurfaceWidth,
         staticH: staticSurfaceHeight,
         dpr: Number(canvasDpr.toFixed(3)),
         originX: staticOriginX,
         originY: staticOriginY,
         staticRows: `${staticVisibleRowStart}:${staticVisibleRowEnd}`,
         staticCols: `${staticVisibleColStart}:${staticVisibleColEnd}`,
      });
      const dynamicLayerKey = JSON.stringify({
         sceneBaseKey,
         eventsSig,
         searchActiveId: activeSearchEventId ? String(activeSearchEventId) : "",
         highlightId: highlightEventIdForRender,
         highlightSlotKey: highlightSlot
            ? `${highlightSlot.instructorId}|${highlightSlot.slotStart}`
            : "",
         waitEditSlot:
            editingWaitForRender && editingWaitForRender.slotIndex != null
               ? String(editingWaitForRender.slotIndex)
               : "",
         denseMode: denseRenderMode ? 1 : 0,
         ultraFastMode: ultraFastRenderMode ? 1 : 0,
         width: renderSurfaceWidth,
         height: renderSurfaceHeight,
         dynamicW: dynamicSurfaceWidth,
         dynamicH: dynamicSurfaceHeight,
         dpr: Number(canvasDpr.toFixed(3)),
         originX: dynamicOriginX,
         originY: dynamicOriginY,
         dynamicRows: `${dynamicVisibleRowStart}:${dynamicVisibleRowEnd}`,
         dynamicCols: `${dynamicVisibleColStart}:${dynamicVisibleColEnd}`,
      });
      const sigKey = JSON.stringify({
         sceneBaseKey,
         eventsSig,
         searchActiveId: activeSearchEventId ? String(activeSearchEventId) : "",
         renderScene: shouldRenderScene ? 1 : 0,
         forceFullSceneForFocus: forceFullSceneForFocus ? 1 : 0,
         visibleRows: `${visibleRowStartForDraw}:${visibleRowEndForDraw}`,
         visibleCols: `${visibleColStartForDraw}:${visibleColEndForDraw}`,
         highlightId: highlightEventIdForRender,
         highlightSlotKey: highlightSlot
            ? `${highlightSlot.instructorId}|${highlightSlot.slotStart}`
            : "",
         waitEditSlot:
            editingWaitForRender && editingWaitForRender.slotIndex != null
               ? String(editingWaitForRender.slotIndex)
               : "",
         window: `${renderOriginX}:${renderOriginY}:${renderSurfaceWidth}:${renderSurfaceHeight}`,
      });

      const noSkip =
         typeof window !== "undefined" && window.__DV_NO_SKIP === true;

      if (!noSkip && lastDrawSigRef.current === sigKey) return;
      lastDrawSigRef.current = sigKey;

      const workerOwnsCanvas =
         canvasTransferredRef.current ||
         (ENABLE_CANVAS_WORKER && workerEnabledRef.current);
      if (!workerOwnsCanvas) {
         if (shouldRenderScene) {
            const nextPixelW = Math.max(
               1,
               Math.floor(renderSurfaceWidth * canvasDpr),
            );
            const nextPixelH = Math.max(
               1,
               Math.floor(renderSurfaceHeight * canvasDpr),
            );
            if (canvas.width !== nextPixelW) canvas.width = nextPixelW;
            if (canvas.height !== nextPixelH) canvas.height = nextPixelH;
         } else {
            if (canvas.width !== 1) canvas.width = 1;
            if (canvas.height !== 1) canvas.height = 1;
         }
      }
      canvas.style.position = "absolute";
      canvas.style.left = `${shouldRenderScene ? renderOriginX : 0}px`;
      canvas.style.top = `${shouldRenderScene ? renderOriginY : 0}px`;
      canvas.style.width = `${
         shouldRenderScene ? renderSurfaceWidth : 1
      }px`;
      canvas.style.height = `${
         shouldRenderScene ? renderSurfaceHeight : 1
      }px`;

      setCanvasPx((prev) =>
         prev.w === width && prev.h === height ? prev : { w: width, h: height },
      );

      const workerCanRender = workerSceneCacheEnabled;
      if (!shouldRenderScene) {
         renderWindowRef.current = { x: 0, y: 0, w: 1, h: 1 };
         staticLayerBufferRef.current = null;
         dynamicLayerBufferRef.current = null;
         staticLayerSigRef.current = "";
         dynamicLayerSigRef.current = "";
         hitMapBuiltAtRef.current = 0;
         hitMapNeedsRebuildRef.current = true;
         if (hitMapRef.current.length) {
            hitMapRef.current = [];
            notifyHitMapUpdated();
         }

         if (workerCanRender) {
            const shrinkDrawPayload = {
               width: 1,
               height: 1,
               dpr: 1,
               staticLayerKey: "__offscreen__",
               dynamicLayerKey: "__offscreen__",
               draw: {
                  buildHitMap: false,
                  highlightEventId: null,
                  highlightSlot: null,
                  editingWait: null,
                  activeSearchEventId: null,
                  visibleRowStart: 0,
                  visibleRowEnd: -1,
                  visibleColStart: 0,
                  visibleColEnd: -1,
               },
            };

            if (workerDrawInFlightRef.current) {
               workerPendingDrawPayloadRef.current = shrinkDrawPayload;
            } else {
               try {
                  postWorkerDraw(shrinkDrawPayload);
               } catch (error) {
                  markWorkerFatal(error?.message || error);
               }
            }
         } else if (
            canvasTransferredRef.current ||
            (ENABLE_CANVAS_WORKER && workerEnabledRef.current)
         ) {
            // Canvas-ul este deja transferat la OffscreenCanvas.
            // Evităm getContext() pe HTMLCanvasElement până revine worker-ul.
         } else {
            const frontCtx = canvas.getContext("2d");
            if (frontCtx) {
               frontCtx.setTransform(1, 0, 0, 1, 0, 0);
               frontCtx.clearRect(0, 0, canvas.width, canvas.height);
            }
         }
         return;
      }

      if (workerCanRender) {
         staticLayerBufferRef.current = null;
         dynamicLayerBufferRef.current = null;
         staticLayerSigRef.current = "";
         dynamicLayerSigRef.current = "";
         const worker = workerRef.current;
         if (!worker) return;

         const nextWorkerEventState = workerEventState;
         const nextWorkerEventEntries = workerEventEntries;
         const workerBaseScene = {
            hoursColWidth,
            headerHeight,
            colWidth,
            colGap,
            colsCount,
            colsPerRow,
            rowsCount,
            rowGap,
            rowHeights,
            instructors: effectiveInstructors,
            slotGeoms,
            slotHeight,
            slotGap,
            blockedKeyMap: blockedKeyMapForSlots || null,
            zoom,
            preGrid: hasPreGrid
               ? { columns: preGridCols, rows: preGridRows }
               : null,
            preGridWidth,
            waitNotesMap: waitNotesTextMap,
            presenceByReservationColors: presenceColorsByReservation,
            presenceReservationIds: effectivePresenceReservationIds,
            desiredInstructorBadgeByUserId,
            createDraftBySlotUsers,
            createDraftBySlotColors,
            denseMode: denseRenderMode,
         };

         if (workerSceneSigRef.current !== sceneBaseKey) {
            workerSceneSigRef.current = sceneBaseKey;
            try {
               worker.postMessage({
                  type: "scene",
                  colorOverrides: workerColorOverrides,
                  scene: workerBaseScene,
                  eventEntries: nextWorkerEventEntries,
               });
            } catch (error) {
               markWorkerFatal(error?.message || error);
               return;
            }

            workerEventsSigRef.current = eventsSig;
            workerEventsStateRef.current = nextWorkerEventState;
            workerEventsSourceRef.current = eventsSafe;
         } else if (
            workerEventsSigRef.current !== eventsSig ||
            workerEventsSourceRef.current !== eventsSafe
         ) {
            const shouldResetWorkerEvents =
               workerEventsSigRef.current !== eventsSig ||
               hasWorkerEventStateDiff(
                  workerEventsStateRef.current,
                  nextWorkerEventState,
               );
            if (shouldResetWorkerEvents) {
               try {
                  worker.postMessage({
                     type: "scene-events-reset",
                     entries: nextWorkerEventEntries,
                  });
               } catch (error) {
                  markWorkerFatal(error?.message || error);
                  return;
               }
            }

            workerEventsSigRef.current = eventsSig;
            workerEventsStateRef.current = nextWorkerEventState;
            workerEventsSourceRef.current = eventsSafe;
         }

         const drawPayload = {
            width: renderSurfaceWidth,
            height: renderSurfaceHeight,
            dpr: canvasDpr,
            staticLayerKey,
            dynamicLayerKey,
            draw: {
               buildHitMap: shouldBuildHitMap,
               worldWidth: width,
               worldHeight: height,
               renderOriginX,
               renderOriginY,
               staticOriginX,
               staticOriginY,
               staticSurfaceWidth,
               staticSurfaceHeight,
               staticSourceOffsetX,
               staticSourceOffsetY,
               staticVisibleRowStart,
               staticVisibleRowEnd,
               staticVisibleColStart,
               staticVisibleColEnd,
               dynamicOriginX,
               dynamicOriginY,
               dynamicSurfaceWidth,
               dynamicSurfaceHeight,
               dynamicSourceOffsetX,
               dynamicSourceOffsetY,
               dynamicVisibleRowStart,
               dynamicVisibleRowEnd,
               dynamicVisibleColStart,
               dynamicVisibleColEnd,
               ultraFastMode: ultraFastRenderMode ? 1 : 0,
               highlightEventId: highlightEventIdForRender,
               highlightSlot,
               editingWait: editingWaitForRender,
               activeSearchEventId,
               visibleRowStart: visibleRowStartForDraw,
               visibleRowEnd: visibleRowEndForDraw,
               visibleColStart: visibleColStartForDraw,
               visibleColEnd: visibleColEndForDraw,
            },
         };

         if (shouldBuildHitMap) {
            hitMapNeedsRebuildRef.current = false;
            hitMapBuiltAtRef.current = nowTs;
         }

         if (workerDrawInFlightRef.current) {
            workerPendingDrawPayloadRef.current = drawPayload;
            return;
         }

         try {
            postWorkerDraw(drawPayload);
         } catch (error) {
            markWorkerFatal(error?.message || error);
         }
         return;
      }

      if (canvasTransferredRef.current) return;
      if (ENABLE_CANVAS_WORKER && workerEnabledRef.current) return;

      const frontCtx = canvas.getContext("2d");
      if (!frontCtx) return;

      const pixelW = canvas.width;
      const pixelH = canvas.height;

      const canUseDoubleBuffer =
         pixelW > 0 &&
         pixelH > 0 &&
         pixelW * pixelH <= CANVAS_DOUBLE_BUFFER_MAX_PIXELS;

      if (!canUseDoubleBuffer) drawBufferRef.current = null;

      const drawBuffer = canUseDoubleBuffer
         ? ensureDrawBuffer(pixelW, pixelH)
         : null;
      const drawCtx = canUseDoubleBuffer ? drawBuffer?.getContext?.("2d") : frontCtx;
      if (!drawCtx) return;

      const staticPixelW = Math.max(1, Math.floor(staticSurfaceWidth * canvasDpr));
      const staticPixelH = Math.max(1, Math.floor(staticSurfaceHeight * canvasDpr));
      const staticLayerBuffer = ensureStaticLayerBuffer(staticPixelW, staticPixelH);
      const staticLayerCtx = staticLayerBuffer?.getContext?.("2d");
      if (!staticLayerBuffer || !staticLayerCtx) {
         staticLayerBufferRef.current = null;
         staticLayerSigRef.current = "";
      } else if (staticLayerSigRef.current !== staticLayerKey) {
         staticLayerSigRef.current = staticLayerKey;
         staticLayerCtx.setTransform(1, 0, 0, 1, 0, 0);
         staticLayerCtx.clearRect(0, 0, staticPixelW, staticPixelH);
         staticLayerCtx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
         staticLayerCtx.translate(-staticOriginX, -staticOriginY);

         drawAll({
            ctx: staticLayerCtx,
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
            instructors: effectiveInstructors,
            events: eventsSafe,
            slotGeoms,
            slotHeight,
            slotGap,
            hitMap: null,
            blockedKeyMap: blockedKeyMapForSlots || null,
            highlightEventId: null,
            highlightSlot: null,
            zoom,
            preGrid: hasPreGrid
               ? { columns: preGridCols, rows: preGridRows }
               : null,
            preGridWidth,
            waitNotesMap: waitNotesTextMap,
            editingWait: null,
            overlapEventsByInst,
            canceledSlotKeysByInst,
            presenceByReservationColors: presenceColorsByReservation,
            presenceReservationIds: effectivePresenceReservationIds,
            desiredInstructorBadgeByUserId,
            createDraftBySlotUsers,
            createDraftBySlotColors,
            dayRenderModel,
            activeSearchEventId: null,
            denseMode: denseRenderMode,
            ultraFastMode: ultraFastRenderMode,
            visibleRowStart: staticVisibleRowStart,
            visibleRowEnd: staticVisibleRowEnd,
            visibleColStart: staticVisibleColStart,
            visibleColEnd: staticVisibleColEnd,
            paintStatic: true,
            paintDynamic: false,
            clearCanvas: false,
         });
      }

      const dynamicPixelW = Math.max(
         1,
         Math.floor(dynamicSurfaceWidth * canvasDpr),
      );
      const dynamicPixelH = Math.max(
         1,
         Math.floor(dynamicSurfaceHeight * canvasDpr),
      );
      const dynamicLayerBuffer = ENABLE_DYNAMIC_LAYER_CACHE
         ? ensureDynamicLayerBuffer(dynamicPixelW, dynamicPixelH)
         : null;
      const dynamicLayerCtx = ENABLE_DYNAMIC_LAYER_CACHE
         ? dynamicLayerBuffer?.getContext?.("2d")
         : null;
      const hasDynamicLayer =
         ENABLE_DYNAMIC_LAYER_CACHE && !!(dynamicLayerBuffer && dynamicLayerCtx);
      const shouldRefreshDynamicLayer =
         shouldBuildHitMap || dynamicLayerSigRef.current !== dynamicLayerKey;
      let hitMap = null;

      if (!hasDynamicLayer) {
         dynamicLayerBufferRef.current = null;
         dynamicLayerSigRef.current = "";
      } else if (shouldRefreshDynamicLayer) {
         dynamicLayerSigRef.current = dynamicLayerKey;
         dynamicLayerCtx.setTransform(1, 0, 0, 1, 0, 0);
         dynamicLayerCtx.clearRect(0, 0, dynamicPixelW, dynamicPixelH);
         dynamicLayerCtx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
         dynamicLayerCtx.translate(-dynamicOriginX, -dynamicOriginY);

         hitMap = shouldBuildHitMap ? [] : null;
         drawAll({
            ctx: dynamicLayerCtx,
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
            instructors: effectiveInstructors,
            events: eventsSafe,
            slotGeoms,
            slotHeight,
            slotGap,
            hitMap,
            blockedKeyMap: blockedKeyMapForSlots || null,
            highlightEventId: highlightEventIdForRender,
            highlightSlot,
            zoom,
            preGrid: hasPreGrid
               ? { columns: preGridCols, rows: preGridRows }
               : null,
            preGridWidth,
            waitNotesMap: waitNotesTextMap,
            editingWait: editingWaitForRender,
            overlapEventsByInst,
            canceledSlotKeysByInst,
            presenceByReservationColors: presenceColorsByReservation,
            presenceReservationIds: effectivePresenceReservationIds,
            desiredInstructorBadgeByUserId,
            createDraftBySlotUsers,
            createDraftBySlotColors,
            dayRenderModel,
            activeSearchEventId,
            denseMode: denseRenderMode,
            ultraFastMode: ultraFastRenderMode,
            visibleRowStart: dynamicVisibleRowStart,
            visibleRowEnd: dynamicVisibleRowEnd,
            visibleColStart: dynamicVisibleColStart,
            visibleColEnd: dynamicVisibleColEnd,
            paintStatic: false,
            paintDynamic: true,
            clearCanvas: false,
         });
      }

      drawCtx.setTransform(1, 0, 0, 1, 0, 0);
      drawCtx.clearRect(0, 0, pixelW, pixelH);
      if (staticLayerBuffer) {
         const staticSourceDeviceX = Math.max(
            0,
            Math.min(
               Math.max(0, staticPixelW - pixelW),
               Math.round(staticSourceOffsetX * canvasDpr),
            ),
         );
         const staticSourceDeviceY = Math.max(
            0,
            Math.min(
               Math.max(0, staticPixelH - pixelH),
               Math.round(staticSourceOffsetY * canvasDpr),
            ),
         );
         drawCtx.drawImage(
            staticLayerBuffer,
            staticSourceDeviceX,
            staticSourceDeviceY,
            pixelW,
            pixelH,
            0,
            0,
            pixelW,
            pixelH,
         );
      }
      if (hasDynamicLayer) {
         const dynamicSourceDeviceX = Math.max(
            0,
            Math.min(
               Math.max(0, dynamicPixelW - pixelW),
               Math.round(dynamicSourceOffsetX * canvasDpr),
            ),
         );
         const dynamicSourceDeviceY = Math.max(
            0,
            Math.min(
               Math.max(0, dynamicPixelH - pixelH),
               Math.round(dynamicSourceOffsetY * canvasDpr),
            ),
         );
         drawCtx.drawImage(
            dynamicLayerBuffer,
            dynamicSourceDeviceX,
            dynamicSourceDeviceY,
            pixelW,
            pixelH,
            0,
            0,
            pixelW,
            pixelH,
         );
      } else {
         drawCtx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
         drawCtx.translate(-renderOriginX, -renderOriginY);
         hitMap = shouldBuildHitMap ? [] : null;
         drawAll({
            ctx: drawCtx,
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
            instructors: effectiveInstructors,
            events: eventsSafe,
            slotGeoms,
            slotHeight,
            slotGap,
            hitMap,
            blockedKeyMap: blockedKeyMapForSlots || null,
            highlightEventId: highlightEventIdForRender,
            highlightSlot,
            zoom,
            preGrid: hasPreGrid
               ? { columns: preGridCols, rows: preGridRows }
               : null,
            preGridWidth,
            waitNotesMap: waitNotesTextMap,
            editingWait: editingWaitForRender,
            overlapEventsByInst,
            canceledSlotKeysByInst,
            presenceByReservationColors: presenceColorsByReservation,
            presenceReservationIds: effectivePresenceReservationIds,
            desiredInstructorBadgeByUserId,
            createDraftBySlotUsers,
            createDraftBySlotColors,
            dayRenderModel,
            activeSearchEventId,
            denseMode: denseRenderMode,
            ultraFastMode: ultraFastRenderMode,
            visibleRowStart: visibleRowStartForDraw,
            visibleRowEnd: visibleRowEndForDraw,
            visibleColStart: visibleColStartForDraw,
            visibleColEnd: visibleColEndForDraw,
            paintStatic: !staticLayerBuffer,
            paintDynamic: true,
            clearCanvas: false,
         });
      }

      if (canUseDoubleBuffer && drawBuffer) {
         // Double-buffer present: desenul se compune în buffer și apoi se blitează pe canvas.
         frontCtx.setTransform(1, 0, 0, 1, 0, 0);
         frontCtx.clearRect(0, 0, pixelW, pixelH);
         frontCtx.drawImage(drawBuffer, 0, 0);
      }

      if (shouldBuildHitMap) {
         hitMapRef.current = hitMap;
         hitMapNeedsRebuildRef.current = false;
         hitMapBuiltAtRef.current = nowTs;
         notifyHitMapUpdated();
      }
   }, [
      dayStart,
      dayEnd,
      effectiveInstructors,
      eventsForCanvas,
      slotGeoms,
      headerMetrics,
      themeTick,
      blackoutVer,
      refreshTick,
      activeEventId,
      selectedEventId,
      selectedSlot,
      blockedKeyMapForSlots,
      zoom,
      hasPreGrid,
      preGridCols,
      preGridRows,
      waitNotes,
      waitNotesTextMap,
      waitEdit,
      eventsSig,
      workerEventState,
      workerEventEntries,
      slotsSig,
      blockedSig,
      waitSig,
      dayRenderModel,
      overlapEventsByInst,
      canceledSlotKeysByInst,
      presenceReservationIds,
      presenceSig,
      presenceColorsByReservation,
      effectivePresenceReservationIds,
      desiredBadgeSig,
      desiredInstructorBadgeByUserId,
      createDraftSig,
      createDraftBySlotUsers,
      createDraftBySlotColors,
      activeSearchEventId,
      isPanInteracting,
      denseRenderMode,
      ultraFastRenderMode,
      rowRenderStartDep,
      rowRenderEndDep,
      colRenderStartDep,
      colRenderEndDep,
      workerSceneCacheEnabled,
      ensureDrawBuffer,
      ensureStaticLayerBuffer,
      ensureDynamicLayerBuffer,
      workerColorOverrides,
      postWorkerDraw,
      markWorkerFatal,
      notifyHitMapUpdated,

      // ✅ NEW
      activeSectorFilter,
      instructorsLayoutSig,
      isDayNearViewport,
      eventsByReservationId,
   ]);

   /* ================== active rect callback ================== */

   useEffect(() => {
      if (!activeEventId) return;
      if (typeof onActiveEventRectChange !== "function") return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const hitMap = hitMapRef.current || [];
      const activeHit = hitMap.find(
         (item) =>
            item.kind === "reservation" &&
            String(item.reservationId ?? item.ev?.raw?.id ?? item.ev?.id) ===
               String(activeEventId),
      );
      if (!activeHit) {
         requestInteractiveHitMap({
            keepMs: HITMAP_INTERACTION_KEEP_MS,
            forceRebuild: true,
         });
         return;
      }

      if (
         activeRectResolveRef.current.id === String(activeEventId) &&
         !activeRectResolveRef.current.resolved
      ) {
         activeRectResolveRef.current = {
            id: String(activeEventId),
            resolved: true,
         };
      }

      const canvasRect = canvas.getBoundingClientRect();
      const renderWin = renderWindowRef.current || { x: 0, y: 0 };
      const topY = canvasRect.top + (activeHit.y - (renderWin.y || 0));
      const bottomY = topY + activeHit.h;
      const centerY = (topY + bottomY) / 2;

      onActiveEventRectChange({
         centerY,
         topY,
         bottomY,
         item: activeHit,
         canvasRect,
      });
   }, [
      activeEventId,
      onActiveEventRectChange,
      hitMapVersion,
      requestInteractiveHitMap,
   ]);

   /* ================== delete (Ctrl+X) ================== */

   const deleteReservationById = useCallback(
      async (reservationId) => {
         if (!reservationId) return;

         const idStr = String(reservationId);

         dispatch(removeReservationLocal(idStr));
         hideReservationGlobally(idStr);

         try {
            await deleteReservation(idStr);
         } catch (err) {
            console.error("Eroare la ștergerea programării (Ctrl+X):", err);
            try {
               await dispatch(fetchReservationsDelta());
            } catch (err2) {
               console.error(
                  "fetchReservationsDelta după delete eșuat a eșuat și el:",
                  err2,
               );
            }
            return;
         }

         try {
            await dispatch(fetchReservationsDelta());
         } catch (err) {
            console.error("fetchReservationsDelta după delete a eșuat:", err);
         }

         triggerCalendarRefresh();
         setGlobalSelection({ event: null, slot: null });
      },
      [dispatch],
   );

   useEffect(() => {
      setDeleteFn(deleteReservationById);
   }, [deleteReservationById]);

   /* ================== copy/cut helper (toolbar) ================== */

   const copyFromEvent = useCallback(
      (ev, { cut = false } = {}) => {
         if (!ev) return null;

         const raw = ev.raw || {};
         const userId =
            raw.userId ??
            raw.user_id ??
            ev.userId ??
            ev.studentId ??
            raw.user?.id ??
            null;

         if (!userId) return null;

         const sector = raw.sector || ev.sector || "Botanica";
         const gearbox = raw.gearbox || ev.gearbox || "Manual";
         const colorRaw = raw.color ?? ev.color ?? DEFAULT_EVENT_COLOR_TOKEN;
         const privateMessageRaw =
            raw.privateMessage ??
            ev.privateMessage ??
            ev.eventPrivateMessage ??
            "";

         const instructorId =
            raw.instructorId ?? raw.instructor_id ?? ev.instructorId ?? null;

         const payload = {
            userId,
            sector,
            gearbox,
            color: colorRaw,
            privateMessage: String(privateMessageRaw || ""),
            instructorId,
         };

         setCopyBuffer(payload);

         if (cut) {
            const reservationId = raw.id ?? ev.id;
            if (reservationId) deleteReservationById(reservationId);
         }

         return payload;
      },
      [deleteReservationById],
   );

   /* ================== paste ================== */

   const pasteFromCopyToSlot = useCallback(
      async (copy, slot) => {
         if (!copy || !slot) return;

         const startTimeToSend = buildStartTimeForSlot(slot.slotStart);
         if (!startTimeToSend) return;

         let instructorIdNum = Number(
            slot.actionInstructorId ?? slot.instructorId,
         );
         if (!Number.isFinite(instructorIdNum) || instructorIdNum <= 0) {
            instructorIdNum = Number(copy.instructorId);
         }

         const userIdNum = Number(copy.userId);

         if (!Number.isFinite(instructorIdNum) || instructorIdNum <= 0) return;
         if (!Number.isFinite(userIdNum) || userIdNum <= 0) return;

         const payload = {
            userId: userIdNum,
            instructorId: instructorIdNum,
            reservations: [
               {
                  startTime: startTimeToSend,
                  sector: copy.sector || "Botanica",
                  gearbox:
                     (copy.gearbox || "Manual").toLowerCase() === "automat"
                        ? "Automat"
                        : "Manual",
                  privateMessage: copy.privateMessage || "",
                  color:
                     typeof copy.color === "string" && copy.color.trim()
                        ? copy.color.trim()
                        : NO_COLOR_TOKEN,
                  instructorId: instructorIdNum,
               },
            ],
         };

         try {
            await createReservationsForUser(payload);
         } catch (err) {
            console.error("Eroare la crearea programării (paste):", err);
         } finally {
            try {
               await dispatch(fetchReservationsDelta());
            } catch (err2) {
               console.error(
                  "fetchReservationsDelta după paste a eșuat:",
                  err2,
               );
            }
            triggerCalendarRefresh();
         }
      },
      [dispatch],
   );

   useEffect(() => {
      setPasteFn(pasteFromCopyToSlot);
   }, [pasteFromCopyToSlot]);

   /* ================== wait edit commit ================== */

   const finishWaitEdit = (commit) => {
      const current = waitEdit;
      setWaitEdit(null);

      if (!commit || !current) return;

      const text = (current.text || "").trim();
      const slotIndex = Number(current.slotIndex ?? 0);

      if (waitCommitRef.current) return;
      waitCommitRef.current = true;

      const prevNote =
         waitNotes && typeof waitNotes === "object"
            ? waitNotes[slotIndex]
            : null;

      const existingId =
         prevNote && typeof prevNote === "object"
            ? (prevNote.id ??
              prevNote._id ??
              prevNote.noteId ??
              prevNote.note_id ??
              null)
            : null;

      setWaitNotes((prev) => {
         const old = prev[slotIndex];
         const oldId =
            old && typeof old === "object"
               ? (old.id ?? old._id ?? old.noteId ?? old.note_id ?? existingId)
               : existingId;

         const next = { ...prev };
         if (text) next[slotIndex] = { id: oldId, text };
         else delete next[slotIndex];

         if (waitRangeKey) {
            const cacheEntry = WAIT_NOTES_CACHE.get(waitRangeKey) || {
               data: null,
               error: null,
               promise: null,
            };
            cacheEntry.data = next;
            cacheEntry.error = null;
            cacheEntry.promise = null;
            WAIT_NOTES_CACHE.set(waitRangeKey, cacheEntry);
         }

         return next;
      });

      if (!text) {
         waitCommitRef.current = false;
         return;
      }

      const title = String(slotIndex);
      const dateIso = buildWaitNoteDateIsoForSlot(
         dayStart,
         slotIndex,
         BUSY_KEYS_MODE,
      );

      const payload = { title, content: text, type: "wait-slot" };
      if (dateIso) payload.date = dateIso;

      const persistPromise = existingId
         ? updateNote(existingId, payload)
         : createNote(payload);

      persistPromise
         .then((saved) => {
            if (!saved) return;

            const realId =
               saved.id ??
               saved._id ??
               saved.noteId ??
               saved.note_id ??
               existingId;
            if (!realId) return;

            setWaitNotes((prev) => {
               const prevNote2 = prev[slotIndex];
               if (!prevNote2) return prev;
               if (prevNote2.id === realId) return prev;

               const next = {
                  ...prev,
                  [slotIndex]: { ...prevNote2, id: realId },
               };

               if (waitRangeKey) {
                  const cacheEntry = WAIT_NOTES_CACHE.get(waitRangeKey) || {
                     data: null,
                     error: null,
                     promise: null,
                  };
                  cacheEntry.data = next;
                  cacheEntry.error = null;
                  cacheEntry.promise = null;
                  WAIT_NOTES_CACHE.set(waitRangeKey, cacheEntry);
               }

               return next;
            });
         })
         .catch((err) => {
            console.error(
               existingId
                  ? "notesService.updateNote (wait-slot) error"
                  : "notesService.createNote (wait-slot) error",
               err,
            );
         })
         .finally(() => {
            waitCommitRef.current = false;
         });
   };

   const handleWaitBlur = () => finishWaitEdit(true);

   const handleWaitKeyDown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
         e.preventDefault();
         finishWaitEdit(true);
      } else if (e.key === "Escape") {
         e.preventDefault();
         finishWaitEdit(false);
      }
   };

   /* ================== canvas click/dblclick/longpress ================== */

   const resolveInstructorIdForHit = useCallback(
      (hit) => {
         if (!hit) return null;
         const directRaw = hit.instructorId;
         if (directRaw != null) {
            const directStr = String(directRaw);
            if (
               directStr &&
               !directStr.startsWith("__pad_") &&
               !directStr.startsWith(GAPCOL_PREFIX)
            ) {
               return directStr;
            }
         }
         if (hit.kind === "empty-slot" || hit.kind === "wait-slot") return null;
         const idx = hit.instIdx;
         if (typeof idx === "number" && idx >= 0) {
            const inst = effectiveInstructors[idx];
            if (inst && !isGapCol(inst)) {
               const idStr = String(inst.id ?? "");
               if (idStr && !idStr.startsWith("__pad_")) return idStr;
            }
         }
         return null;
      },
      [effectiveInstructors],
   );

   const resolveEventFromHit = useCallback(
      (hit) => {
         if (!hit) return null;
         if (hit.ev) return hit.ev;
         const rid = hit.reservationId;
         if (rid == null) return null;
         const found = eventsByReservationId.get(String(rid));
         if (found) return found;
         return { id: rid, raw: { id: rid } };
      },
      [eventsByReservationId],
   );

   const clearPendingClickCommit = useCallback(() => {
      if (!pendingClickCommitRef.current) return;
      clearTimeout(pendingClickCommitRef.current);
      pendingClickCommitRef.current = 0;
   }, []);

   const commitSelectionFromHit = useCallback(
      ({ eventHit = null, slotHit = null, touchLike = false } = {}) => {
         if (eventHit?.ev && eventHit.ev.id != null) {
            const foundEvent = eventHit.ev;
            const foundEventItem = eventHit.item;
            setSelectedEventId(foundEvent.id);
            setSelectedSlot(null);
            setGlobalSelection({ event: foundEvent, slot: null });

            if (touchLike && foundEventItem) {
               setTouchToolbar({
                  type: "event",
                  ev: foundEvent,
                  x: foundEventItem.x,
                  y: foundEventItem.y,
                  w: foundEventItem.w,
                  h: foundEventItem.h,
               });
            } else {
               setTouchToolbar(null);
            }
            return;
         }

         if (slotHit?.item) {
            const foundSlotItem = slotHit.item;
            const resolvedInstructorId = resolveInstructorIdForHit(foundSlotItem);
            if (!resolvedInstructorId) {
               setSelectedEventId(null);
               setSelectedSlot(null);
               setGlobalSelection({ event: null, slot: null });
               setTouchToolbar(null);
               return;
            }
            const slotPayload = {
               instructorId: resolvedInstructorId,
               actionInstructorId: resolvedInstructorId,
               highlightInstructorId: foundSlotItem.instructorId,
               slotStart: foundSlotItem.slotStart,
               slotEnd: foundSlotItem.slotEnd,
            };
            setSelectedEventId(null);
            setSelectedSlot(slotPayload);
            setGlobalSelection({ event: null, slot: slotPayload });

            if (touchLike && getCopyBuffer()) {
               setTouchToolbar({
                  type: "slot",
                  slot: slotPayload,
                  x: foundSlotItem.x,
                  y: foundSlotItem.y,
                  w: foundSlotItem.w,
                  h: foundSlotItem.h,
               });
            } else {
               setTouchToolbar(null);
            }
            return;
         }

         setSelectedEventId(null);
         setSelectedSlot(null);
         setGlobalSelection({ event: null, slot: null });
         setTouchToolbar(null);
      },
      [resolveInstructorIdForHit],
   );

   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const handleClick = (e) => {
         if (Date.now() < ignoreClickUntilRef.current) return;
         requestInteractiveHitMap({
            keepMs: HITMAP_INTERACTION_KEEP_MS,
         });

         const rect = canvas.getBoundingClientRect();
         const localX = e.clientX - rect.left;
         const localY = e.clientY - rect.top;
         const renderWin = renderWindowRef.current || { x: 0, y: 0 };
         const x = localX + (renderWin.x || 0);
         const y = localY + (renderWin.y || 0);

         const items = hitMapRef.current || [];
         let foundEvent = null;
         let foundEventItem = null;
         let foundSlotItem = null;

         for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            if (
               x >= item.x &&
               x <= item.x + item.w &&
               y >= item.y &&
               y <= item.y + item.h
            ) {
               if (item.kind === "reservation" || item.kind === "student") {
                  foundEvent = resolveEventFromHit(item);
                  foundEventItem = item;
                  break;
               }
               if (item.kind === "empty-slot" || item.kind === "wait-slot") {
                  foundSlotItem = item;
                  break;
               }
            }
         }

         const isTouchLike =
            lastPointerTypeRef.current === "touch" ||
            lastPointerTypeRef.current === "pen";
         const eventHit =
            foundEvent && foundEvent.id != null
               ? { ev: foundEvent, item: foundEventItem }
               : null;
         const slotHit = foundSlotItem ? { item: foundSlotItem } : null;

         clearPendingClickCommit();

         // Pentru mouse amânăm puțin selecția ca dblclick să deschidă instant popup-ul
         if (!isTouchLike) {
            pendingClickCommitRef.current = window.setTimeout(() => {
               pendingClickCommitRef.current = 0;
               commitSelectionFromHit({
                  eventHit,
                  slotHit,
                  touchLike: false,
               });
            }, CLICK_COMMIT_DELAY_MS);
            return;
         }

         commitSelectionFromHit({
            eventHit,
            slotHit,
            touchLike: true,
         });
      };

      canvas.addEventListener("click", handleClick);
      return () => canvas.removeEventListener("click", handleClick);
   }, [
      clearPendingClickCommit,
      commitSelectionFromHit,
      resolveEventFromHit,
      requestInteractiveHitMap,
   ]);

   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const handleDblClick = (e) => {
         if (Date.now() < ignoreClickUntilRef.current) return;
         clearPendingClickCommit();
         requestInteractiveHitMap({
            keepMs: HITMAP_INTERACTION_KEEP_MS,
            forceRebuild: true,
         });

         const rect = canvas.getBoundingClientRect();
         const localX = e.clientX - rect.left;
         const localY = e.clientY - rect.top;
         const renderWin = renderWindowRef.current || { x: 0, y: 0 };
         const x = localX + (renderWin.x || 0);
         const y = localY + (renderWin.y || 0);

         const items = hitMapRef.current || [];
         if (!items.length) return;

         for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            if (
               x >= item.x &&
               x <= item.x + item.w &&
               y >= item.y &&
               y <= item.y + item.h
            ) {
               if (item.kind === "wait-slot") {
                  const slotIndex =
                     typeof item.slotIndex === "number" ? item.slotIndex : 0;
                  waitCommitRef.current = false;

                  (async () => {
                     const latest = await reloadWaitNotes();
                     const map = latest || waitNotesRef.current || {};

                     const key = String(slotIndex);
                     const noteObj = map[key] || map[slotIndex];
                     const existingText =
                        typeof noteObj === "string"
                           ? noteObj
                           : (noteObj && noteObj.text) || "";

                     setWaitEdit({
                        instId: resolveInstructorIdForHit(item),
                        slotIndex,
                        x: item.x,
                        y: item.y,
                        w: item.w,
                        h: item.h,
                        text: existingText,
                     });
                  })();
               } else if (item.kind === "student") {
                  const ev = resolveEventFromHit(item);
                  if (!ev) break;
                  openStudentPopup(ev);
               } else if (item.kind === "reservation") {
                  const ev = resolveEventFromHit(item);
                  if (ev) openReservationPopup(ev);
               } else if (
                  item.kind === "empty-slot" &&
                  typeof onCreateSlot === "function"
               ) {
                  const resolvedInstructorId =
                     resolveInstructorIdForHit(item);
                  if (!resolvedInstructorId) break;
                  const slotPayload = {
                     instructorId: resolvedInstructorId,
                     actionInstructorId: resolvedInstructorId ?? null,
                     highlightInstructorId: item.instructorId,
                     slotStart: item.slotStart,
                     slotEnd: item.slotEnd,
                  };

                  setSelectedEventId(null);
                  setSelectedSlot(slotPayload);
                  setGlobalSelection({ event: null, slot: slotPayload });

                  const payload = {
                     instructorId: resolvedInstructorId,
                     start: new Date(item.slotStart),
                     end: new Date(item.slotEnd),
                  };

                  onCreateSlot(payload);
               }
               break;
            }
         }
      };

      canvas.addEventListener("dblclick", handleDblClick);
      return () => canvas.removeEventListener("dblclick", handleDblClick);
   }, [
      onCreateSlot,
      reloadWaitNotes,
      openStudentPopup,
      openReservationPopup,
      resolveInstructorIdForHit,
      resolveEventFromHit,
      clearPendingClickCommit,
      requestInteractiveHitMap,
   ]);

   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const getHitAtClient = (clientX, clientY) => {
         const rect = canvas.getBoundingClientRect();
         const localX = clientX - rect.left;
         const localY = clientY - rect.top;
         const renderWin = renderWindowRef.current || { x: 0, y: 0 };
         const x = localX + (renderWin.x || 0);
         const y = localY + (renderWin.y || 0);

         const items = hitMapRef.current || [];
         for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            if (
               x >= item.x &&
               x <= item.x + item.w &&
               y >= item.y &&
               y <= item.y + item.h
            )
               return item;
         }
         return null;
      };

      const openToolbarForHit = (hit) => {
         if (!hit) {
            setTouchToolbar(null);
            return;
         }

         if (hit.kind === "reservation" || hit.kind === "student") {
            const ev = resolveEventFromHit(hit);
            if (ev && ev.id != null) {
               setSelectedEventId(ev.id);
               setSelectedSlot(null);
               setGlobalSelection({ event: ev, slot: null });
            }
            setTouchToolbar({
               type: "event",
               x: hit.x,
               y: hit.y,
               w: hit.w,
               h: hit.h,
               ev,
            });
            return;
         }

         if (hit.kind === "empty-slot" || hit.kind === "wait-slot") {
            const resolvedInstructorId = resolveInstructorIdForHit(hit);
            if (!resolvedInstructorId) {
               setTouchToolbar(null);
               return;
            }
            const slotPayload = {
               instructorId: resolvedInstructorId,
               actionInstructorId: resolvedInstructorId,
               highlightInstructorId: hit.instructorId,
               slotStart: hit.slotStart,
               slotEnd: hit.slotEnd,
            };
            setSelectedEventId(null);
            setSelectedSlot(slotPayload);
            setGlobalSelection({ event: null, slot: slotPayload });
            setTouchToolbar({
               type: "slot",
               x: hit.x,
               y: hit.y,
               w: hit.w,
               h: hit.h,
               slot: slotPayload,
            });
            return;
         }

         setTouchToolbar(null);
      };

      const clearLongPress = () => {
         if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
         }
         longPressTargetRef.current = null;
         longPressStartRef.current = null;
      };

      const handleContextMenu = (e) => {
         e.preventDefault();
         requestInteractiveHitMap({
            keepMs: HITMAP_INTERACTION_KEEP_MS,
         });
         const hit = getHitAtClient(e.clientX, e.clientY);
         openToolbarForHit(hit);
      };

      const fireLongPress = (hit) => {
         if (!hit) return;
         ignoreClickUntilRef.current = Date.now() + 600;

         if (hit.kind === "reservation" || hit.kind === "student") {
            const ev = resolveEventFromHit(hit);
            if (!ev) return;

            if (ev.id != null) {
               setSelectedEventId(ev.id);
               setSelectedSlot(null);
               setGlobalSelection({ event: ev, slot: null });
            }

            setTouchToolbar(null);
            requestAnimationFrame(() => openStudentPopup(ev));
         }
      };

      const handlePointerDown = (e) => {
         clearPendingClickCommit();
         if (e.pointerType) lastPointerTypeRef.current = e.pointerType;
         if (e.button !== 0 && e.button !== undefined) return;
         requestInteractiveHitMap({
            keepMs: HITMAP_INTERACTION_KEEP_MS,
            forceRebuild: true,
         });

         const hit = getHitAtClient(e.clientX, e.clientY);
         if (!hit) return;
         if (hit.kind !== "reservation" && hit.kind !== "student") return;

         longPressTargetRef.current = hit;
         longPressStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            pointerId: e.pointerId ?? null,
         };

         if (canvas.setPointerCapture && e.pointerId != null) {
            try {
               canvas.setPointerCapture(e.pointerId);
            } catch (_) {}
         }

         longPressTimerRef.current = window.setTimeout(() => {
            const target = longPressTargetRef.current;
            clearLongPress();
            fireLongPress(target);
         }, LONG_PRESS_MS);
      };

      const handlePointerMove = (e) => {
         if (!longPressTimerRef.current) return;
         const s = longPressStartRef.current;
         if (!s) return;

         if (
            s.pointerId != null &&
            e.pointerId != null &&
            s.pointerId !== e.pointerId
         )
            return;

         const dx = e.clientX - s.x;
         const dy = e.clientY - s.y;
         const dist2 = dx * dx + dy * dy;
         if (dist2 > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) clearLongPress();
      };

      const handlePointerUp = () => clearLongPress();
      const handlePointerLeave = () => clearLongPress();
      const handlePointerCancel = () => clearLongPress();

      canvas.addEventListener("contextmenu", handleContextMenu);
      canvas.addEventListener("pointerdown", handlePointerDown);
      canvas.addEventListener("pointermove", handlePointerMove);
      canvas.addEventListener("pointerup", handlePointerUp);
      canvas.addEventListener("pointerleave", handlePointerLeave);
      canvas.addEventListener("pointercancel", handlePointerCancel);

      return () => {
         canvas.removeEventListener("contextmenu", handleContextMenu);
         canvas.removeEventListener("pointerdown", handlePointerDown);
         canvas.removeEventListener("pointermove", handlePointerMove);
         canvas.removeEventListener("pointerup", handlePointerUp);
         canvas.removeEventListener("pointerleave", handlePointerLeave);
         canvas.removeEventListener("pointercancel", handlePointerCancel);
      };
   }, [
      openStudentPopup,
      resolveInstructorIdForHit,
      resolveEventFromHit,
      clearPendingClickCommit,
      requestInteractiveHitMap,
   ]);

   /* ================== UI overlay ================== */

   const { colWidth, colGap, headerHeight, colsPerRow, rowTops } =
      headerMetrics;

   const preGridWidth2 =
      hasPreGrid && colWidth > 0
         ? preGridCols * colWidth + Math.max(0, preGridCols - 1) * colGap
         : 0;

   const dayDateForHeaders = useMemo(() => {
      if (dayStart instanceof Date) return dayStart;
      const d = new Date(dayStart);
      return Number.isFinite(d.getTime()) ? d : new Date();
   }, [dayStart]);

   return (
      <div
         style={{
            position: "relative",
            flex: "0 0 auto",
            width: `${Math.max(1, Math.round(canvasPx.w || 1))}px`,
            height: `${Math.max(1, Math.round(canvasPx.h || 1))}px`,
         }}
      >
         <canvas key={canvasEpoch} ref={canvasRef} />

         {effectiveInstructors.map((inst, idx) => {
            if (!inst) return null; // ✅ deja
            if (isGapCol?.(inst)) return null; // (opțional defensiv)
            const row = Math.floor(idx / colsPerRow);
            const col = idx % colsPerRow;
            if (!isDayNearViewport) return null;
            if (row < rowRenderStartDep || row > rowRenderEndDep) return null;
            if (col < colRenderStartDep || col > colRenderEndDep) return null;

            const left = preGridWidth2 + col * (colWidth + colGap);
            const top = rowTops[row] ?? 0;

            return (
               <CanvasInstructorHeader
                  key={`${String(inst.id)}:${idx}`}
                  inst={inst}
                  dayDate={dayDateForHeaders}
                  sectorClassName=""
                  style={{ left, top, width: colWidth, height: headerHeight }}
                  carsByInstructorId={carsByInstructorId}
                  instructorsFullById={instructorsFullById}
                  usersById={usersById}
                  instructorUsersByNormName={instructorUsersByNormName}
                  zoom={z}
               />
            );
         })}

         {touchToolbar && (
            <div
               className="dv-touch-toolbar"
               style={{
                  position: "absolute",
                  transform: "translateX(-50%)",
                  left: touchToolbar.x + touchToolbar.w / 2,
                  top: Math.max(2, touchToolbar.y - 42),
                  zIndex: 30,
               }}
               onClick={(e) => e.stopPropagation()}
               onPointerDown={(e) => e.stopPropagation()}
            >
               <button
                  type="button"
                  className={
                     "dv-touch-toolbar__btn" +
                     (touchToolbar.type === "event"
                        ? " dv-touch-toolbar__btn--active"
                        : " dv-touch-toolbar__btn--disabled")
                  }
                  onClick={() => {
                     if (touchToolbar.type !== "event" || !touchToolbar.ev)
                        return;
                     copyFromEvent(touchToolbar.ev, { cut: false });
                     setTouchToolbar(null);
                  }}
               >
                  <ReactSVG src={copyIcon} className="dv-touch-toolbar__icon" />
               </button>

               <button
                  type="button"
                  className={
                     "dv-touch-toolbar__btn" +
                     (touchToolbar.type === "slot" && getCopyBuffer()
                        ? " dv-touch-toolbar__btn--active"
                        : " dv-touch-toolbar__btn--disabled")
                  }
                  onClick={() => {
                     if (touchToolbar.type !== "slot" || !touchToolbar.slot)
                        return;
                     const buf = getCopyBuffer();
                     if (!buf) return;
                     pasteFromCopyToSlot(buf, touchToolbar.slot);
                     setTouchToolbar(null);
                  }}
               >
                  <ReactSVG
                     src={pasteIcon}
                     className="dv-touch-toolbar__icon"
                  />
               </button>

               <button
                  type="button"
                  className={
                     "dv-touch-toolbar__btn" +
                     (touchToolbar.type === "event"
                        ? " dv-touch-toolbar__btn--active"
                        : " dv-touch-toolbar__btn--disabled")
                  }
                  onClick={() => {
                     if (touchToolbar.type !== "event" || !touchToolbar.ev)
                        return;
                     copyFromEvent(touchToolbar.ev, { cut: true });
                     setTouchToolbar(null);
                  }}
               >
                  <ReactSVG src={cutIcon} className="dv-touch-toolbar__icon" />
               </button>

               <button
                  type="button"
                  className={
                     "dv-touch-toolbar__btn" +
                     (touchToolbar.type === "event" ||
                     touchToolbar.type === "slot"
                        ? " dv-touch-toolbar__btn--active"
                        : " dv-touch-toolbar__btn--disabled")
                  }
                  onClick={() => {
                     if (touchToolbar.type === "event" && touchToolbar.ev) {
                        openRangePanelFromEvent(touchToolbar.ev, touchToolbar);
                        setTouchToolbar(null);
                        return;
                     }
                     if (touchToolbar.type === "slot" && touchToolbar.slot) {
                        openRangePanelFromSlot(touchToolbar.slot, touchToolbar);
                        setTouchToolbar(null);
                        return;
                     }
                  }}
               >
                  <ReactSVG
                     src={hystoryIcon}
                     className="dv-touch-toolbar__icon"
                  />
               </button>
            </div>
         )}

         {waitEdit && (
            <textarea
               ref={waitInputRef}
               value={waitEdit.text || ""}
               onChange={(e) =>
                  setWaitEdit((prev) =>
                     prev ? { ...prev, text: e.target.value } : prev,
                  )
               }
               onBlur={handleWaitBlur}
               onKeyDown={handleWaitKeyDown}
               placeholder={WAIT_PLACEHOLDER_TEXT}
               style={{
                  position: "absolute",
                  left: waitEdit.x + 6,
                  top: waitEdit.y + 6,
                  width: Math.max(40, waitEdit.w - 12),
                  height: Math.max(28, waitEdit.h - 12),
                  resize: "none",
                  zIndex: 40,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.25)",
                  background: "rgba(0,0,0,0.25)",
                  color: "white",
                  padding: 8,
                  outline: "none",
               }}
               onClick={(e) => e.stopPropagation()}
               onPointerDown={(e) => e.stopPropagation()}
            />
         )}

         {historyUI && (
            <div
               className="dv-history"
               style={{ position: "absolute", inset: 0, zIndex: 455 }}
               onClick={closeReservationHistory}
            >
               <div
                  className="dv-history__panel"
                  style={{ ...(historyPanelStyle || {}) }}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
               >
                  <div className="dv-history__header">
                     <div className="dv-history__title">{panelTitle}</div>

                     <div className="dv-history__actions">
                        <span className="dv-history__counter">
                           {timelineCount
                              ? `${historyIdx + 1}/${timelineCount}`
                              : ""}
                        </span>

                        <button
                           type="button"
                           className="dv-history__nav-btn dv-history__nav-btn--prev"
                           disabled={timelineCount === 0 || historyIdx <= 0}
                           onClick={() =>
                              setHistoryIdx((i) => Math.max(0, i - 1))
                           }
                        >
                           <ReactSVG
                              src={arrowIcon}
                              className="dv-history__icon"
                           />
                        </button>

                        <button
                           type="button"
                           className="dv-history__nav-btn dv-history__nav-btn--next"
                           disabled={
                              timelineCount === 0 ||
                              historyIdx >= timelineCount - 1
                           }
                           onClick={() =>
                              setHistoryIdx((i) =>
                                 Math.min(
                                    Math.max(0, timelineCount - 1),
                                    i + 1,
                                 ),
                              )
                           }
                        >
                           <ReactSVG
                              src={arrowIcon}
                              className="dv-history__icon reverse"
                           />
                        </button>

                        <button
                           type="button"
                           className="dv-history__close-btn"
                           onClick={closeReservationHistory}
                        >
                           <ReactSVG
                              src={closeIcon}
                              className="dv-history__icon add"
                           />
                        </button>
                     </div>
                  </div>

                  {rangeError ? (
                     <div className="dv-history__state dv-history__state--error">
                        {rangeError}
                     </div>
                  ) : rangeLoading ? (
                     <div className="dv-history__state dv-history__state--loading">
                        Se încarcă rezervările din interval…
                     </div>
                  ) : rangeItems.length === 0 ? (
                     <div className="dv-history__state dv-history__state--empty">
                        Nu există rezervări în acest interval.
                     </div>
                  ) : (
                     <>
                        <div className="dv-history__section dv-history__section--timeline">
                           {rangeHistError ? (
                              <div className="dv-history__state dv-history__state--error">
                                 {rangeHistError}
                              </div>
                           ) : rangeHistLoading ? (
                              <div className="dv-history__state dv-history__state--loading">
                                 Se încarcă istoricul rezervărilor…
                              </div>
                           ) : !currentTimeline ? (
                              <div className="dv-history__state dv-history__state--empty">
                                 Nu există istoric disponibil pentru rezervările
                                 din interval.
                              </div>
                           ) : (
                              <>
                                 <div className="dv-history__meta">
                                    <div className="dv-history__avatar">
                                       {currentTimeline.initial}
                                    </div>

                                    <div className="dv-history__meta-text">
                                       <div className="dv-history__who">
                                          {currentTimeline.who || "—"}
                                       </div>
                                       <div className="dv-history__when">
                                          {currentTimeline.whenLabel || ""}
                                       </div>
                                    </div>
                                 </div>

                                 <div className="dv-history__changes">
                                    <div className="dv-history__subtitle">
                                       {currentTimeline.ctxLine}
                                    </div>
                                    {currentTimeline.lines.map((line, i) => (
                                       <div
                                          key={i}
                                          className="dv-history__change"
                                       >
                                          {line}
                                       </div>
                                    ))}
                                 </div>
                              </>
                           )}
                        </div>
                     </>
                  )}
               </div>
            </div>
         )}
      </div>
   );
}

export default memo(DayviewCanvasTrack);
