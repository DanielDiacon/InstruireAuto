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
   computeWorldHeight,
   getColorRoot,
   clearColorCache,
   buildEventsSignatureForDay,
   buildSlotsSignature,
   buildBlockedSignature,
   buildWaitNotesSignature,
   DEFAULT_EVENT_COLOR_TOKEN,
   NO_COLOR_TOKEN,
} from "./render";

const BUSY_KEYS_MODE = "local-match";
const DPR_LIMIT = 2;

const LONG_PRESS_MS = 200;
const LONG_PRESS_MOVE_PX = 14;

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

/**
 * Semnătură robustă pentru canvas:
 * include câmpurile care îți schimbă UI-ul desenat (confirmare, note, favorite, important, etc.)
 * + poziționarea în pad-uri (lateral/cancel) prin _padSlotIndex/_padColumnIndex.
 */
function buildCanvasEventsSignature(events) {
   if (!Array.isArray(events) || !events.length) return "0";

   const parts = [];

   for (const ev of events) {
      if (!ev) continue;

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
         raw.privateMessage ??
            ev.privateMessage ??
            ev.eventPrivateMessage ??
            "",
      );
      const noteFromProfile = String(getStudentPrivateMessageFromEv(ev) || "");
      const notesHash = _hashStr(`${noteFromEvent}|${noteFromProfile}`);

      // ⚠️ acestea schimbă poziția/randarea în pad-uri
      const padSlotIndex =
         ev._padSlotIndex != null ? String(ev._padSlotIndex) : "";
      const padColIndex =
         ev._padColumnIndex != null ? String(ev._padColumnIndex) : "";
      const movedCancel = ev._movedToCancelPad ? "1" : "0";
      const fromLateral = ev._fromLateralPad ? "1" : "0";
      const localSlotKey = String(ev.localSlotKey || "");

      // dacă ai updatedAt/version din API, e cel mai bun invalidator
      const ver = String(
         raw.updatedAt ??
            raw.updated_at ??
            raw.version ??
            raw.rev ??
            raw._rev ??
            "",
      );

      parts.push(
         [
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
         ].join("|"),
      );
   }

   parts.sort();
   return parts.join(";");
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
      cars,
      instructorsFull,
      users,
      zoom = 1,
   }) {
      const dispatch = useDispatch();

      const instrFull = useMemo(
         () =>
            instructorsFull.find((x) => String(x.id) === String(inst?.id)) ||
            inst ||
            null,
         [instructorsFull, inst],
      );

      const instructorUser = useMemo(() => {
         if (!instrFull) return null;

         const directUid =
            instrFull.userId ?? instrFull.user_id ?? instrFull.user?.id ?? null;

         const roleInstr = (u) =>
            String(u.role ?? "").toUpperCase() === "INSTRUCTOR";

         if (directUid != null) {
            const byId = users.find(
               (u) => String(u.id) === String(directUid) && roleInstr(u),
            );
            if (byId) return byId;
         }

         // fallback doar după nume (fără telefon)
         const nameKey = norm(
            `${instrFull.firstName ?? ""} ${instrFull.lastName ?? ""}`,
         );

         return (
            users.find(
               (u) =>
                  roleInstr(u) &&
                  norm(`${u.firstName ?? ""} ${u.lastName ?? ""}`) === nameKey,
            ) || null
         );
      }, [instrFull, users]);

      const carForInst = useMemo(() => {
         const iid = String(inst?.id ?? "");
         if (!iid) return null;
         return cars.find((c) => String(c.instructorId ?? "") === iid) || null;
      }, [cars, inst]);

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
         prev.cars === next.cars &&
         prev.instructorsFull === next.instructorsFull &&
         prev.users === next.users &&
         prev.zoom === next.zoom
      );
   },
);

/* ================== COMPONENTA REACT ================== */

export default function DayviewCanvasTrack({
   dayStart,
   dayEnd,
   instructors = [],
   events = [],
   slots = [],
   layout = {},
   timeMarks = DEFAULT_TIME_MARKS,
   onCreateSlot,
   blockedKeyMap,
   blackoutVer = 0,
   activeEventId = null,
   activeSearchEventId = null,
   searchHitEventIds = null,
   onActiveEventRectChange,
   cars = [],
   instructorsFull = [],
   users = [],
   zoom = 1,
   preGrid,
   onManualSelection,
   onReservationJoin,
   presenceByReservationUsers = null,
   presenceByReservationColors,
   createDraftBySlotUsers = null,
   createDraftBySlotColors = null,
   // ✅ NEW (optional): poți pasa direct din parent, dar merge și dacă îl pui în layout.*
   sectorFilter: sectorFilterProp = null,
}) {
   const canvasRef = useRef(null);
   const hitMapRef = useRef([]);
   const lastDrawSigRef = useRef(null);
   //console.log(users);

   const longPressStartRef = useRef(null);
   const longPressTimerRef = useRef(null);
   const longPressTargetRef = useRef(null);
   const ignoreClickUntilRef = useRef(0);
   const lastPointerTypeRef = useRef("mouse");

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

   const [waitNotes, setWaitNotes] = useState({});
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

   const [hiddenVersion, setHiddenVersion] = useState(getHiddenVersion());

   const [waitEdit, setWaitEdit] = useState(null);
   const waitInputRef = useRef(null);
   const waitCommitRef = useRef(false);

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

   const pickUserFromStore = useCallback(
      (userIdRaw, phoneRaw, firstNameSeed, lastNameSeed) => {
         const uid = userIdRaw != null ? String(userIdRaw) : "";
         if (uid && usersById.has(uid)) return usersById.get(uid);

         const p = normPhone(phoneRaw);
         if (p && usersByPhone.has(p)) return usersByPhone.get(p);

         // fallback final: match după nume (riscant, dar mai bine decât nimic)
         const key = norm(`${firstNameSeed || ""} ${lastNameSeed || ""}`);
         if (key) {
            const u =
               (users || []).find(
                  (x) =>
                     norm(`${x?.firstName || ""} ${x?.lastName || ""}`) === key,
               ) || null;
            if (u) return u;
         }

         return null;
      },
      [usersById, usersByPhone, users],
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

   const joinReservationSafe = useCallback(
      (reservationId) => {
         const rid = String(reservationId ?? "").trim();
         if (!rid) return;
         try {
            if (typeof onReservationJoin === "function") onReservationJoin(rid);
         } catch (e) {
            console.warn("onReservationJoin error:", e);
         }
      },
      [onReservationJoin],
   );

   const openReservationPopup = useCallback(
      (ev) => {
         if (!ev) return;
         const reservationId = ev.raw?.id ?? ev.id;
         if (!reservationId) return;

         // ✅ JOIN înainte de popup
         joinReservationSafe(reservationId);

         openPopup("reservationEdit", { reservationId });
      },
      [joinReservationSafe],
   );

   const openStudentPopup = useCallback(
      (ev) => {
         if (!ev) return;
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
      [openReservationPopup, pickUserFromStore],
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
      const unsubscribe = listenCalendarRefresh(() => {
         lastDrawSigRef.current = null;
         setRefreshTick((t) => t + 1);
      });

      return unsubscribe;
   }, []);

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
      if (waitEdit && waitInputRef.current) waitInputRef.current.focus();
   }, [!!waitEdit]);

   /* ================== wait notes load + cache ================== */

   const dayStartMs = dayStart ? new Date(dayStart).getTime() : null;
   const dayEndMs = dayEnd ? new Date(dayEnd).getTime() : null;

   const reloadWaitNotes = useCallback(async () => {
      if (dayStartMs == null) {
         setWaitNotes({});
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

         setWaitNotes(normalized);
         return normalized;
      } catch (err) {
         console.error("fetchWaitNotesRange (reload) error:", err);
         setWaitNotes({});
         return null;
      }
   }, [dayStartMs, dayEndMs]);

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
         setWaitNotes({});
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
         setWaitNotes(entry.data);
      } else {
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
               setWaitNotes(normalized);
            })
            .catch((err) => {
               if (!isActive) return;
               console.error(
                  "fetchWaitNotesRange error pentru ziua:",
                  fromStr,
                  err,
               );
               setWaitNotes({});
            });
      }

      return () => {
         isActive = false;
      };
   }, [waitRangeKey]);

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

      // ✅ order reader: 12 / "12" / "12XXX" / "3X7" / "3X7XX"
      const readOrderNumber = (v) => {
         const t = parseOrderToken(v);
         const n = showBuiucani ? t.pos : (t.posAlt ?? t.pos);
         return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
      };

      // helper: ia order din inst sau din instructorsFull (fallback)
      const readOrder = (inst) => {
         const pick = (obj) =>
            obj?.order ??
            obj?.uiOrder ??
            obj?.sortOrder ??
            obj?.position ??
            obj?.sort_index ??
            null;

         let v = pick(inst);

         if (v == null && Array.isArray(instructorsFull) && inst?.id != null) {
            const full = instructorsFull.find(
               (x) => String(x?.id) === String(inst.id),
            );
            if (full) v = pick(full);
         }

         return readOrderNumber(v);
      };

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

      const readOrderMeta = (inst) => {
         let v = pickOrderVal(inst);

         if (v == null && Array.isArray(instructorsFull) && inst?.id != null) {
            const full = instructorsFull.find(
               (x) => String(x?.id) === String(inst.id),
            );
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

         return { pos, gapsAfter };
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
      instructorsFull,
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
         const as = a.start instanceof Date ? a.start : new Date(a.start || 0);
         const bs = b.start instanceof Date ? b.start : new Date(b.start || 0);
         return as - bs;
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

   const eventsSig = useMemo(
      () => buildCanvasEventsSignature(eventsForCanvas),
      // ⚠️ refreshTick forțează recalcul chiar dacă upstream a păstrat aceleași referințe
      [eventsForCanvas, refreshTick],
   );

   const overlapSig = useMemo(
      () => buildCanvasEventsSignature(events || []),
      [events, refreshTick],
   );

   const slotsSig = useMemo(() => buildSlotsSignature(slotGeoms), [slotGeoms]);

   const blockedSig = useMemo(
      () => buildBlockedSignature(blockedKeyMapForSlots, effectiveInstructors),
      [blockedKeyMapForSlots, effectiveInstructors],
   );

   const canceledSig = useMemo(
      () => buildBlockedSignature(canceledSlotKeysByInst, effectiveInstructors),
      [canceledSlotKeysByInst, effectiveInstructors],
   );

   const waitSig = useMemo(
      () => buildWaitNotesSignature(waitNotes),
      [waitNotes],
   );

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

      const dpr =
         typeof window !== "undefined"
            ? Math.min(window.devicePixelRatio || 1, DPR_LIMIT)
            : 1;

      const eventsSafe = Array.isArray(eventsForCanvas) ? eventsForCanvas : [];

      const sig = {
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
         eventsSig,
         overlapSig,
         slotsSig,
         blockedSig,
         canceledSig,
         waitSig,
         presenceSig,
         desiredBadgeSig,
         createDraftSig,

         // ✅ NEW: forțează redraw când schimbi sector/ordonare instructori
         sectorSig: activeSectorFilter || "ALL",
         instructorsLayoutSig,
         searchActiveId: activeSearchEventId ? String(activeSearchEventId) : "",
         searchHitsSig:
            searchHitEventIds instanceof Set
               ? [...searchHitEventIds].sort().join(",")
               : Array.isArray(searchHitEventIds)
                 ? [...searchHitEventIds].map(String).sort().join(",")
                 : searchHitEventIds &&
                       typeof searchHitEventIds === "object"
                   ? Object.keys(searchHitEventIds)
                        .filter((k) => !!searchHitEventIds[k])
                        .sort()
                        .join(",")
                   : "",

         highlightId: selectedEventId || activeEventId || null,
         highlightSlotKey:
            selectedSlot && selectedSlot.slotStart
               ? `${selectedSlot.highlightInstructorId ?? selectedSlot.instructorId}|${selectedSlot.slotStart}`
               : "",
         waitEditSlot:
            waitEdit && waitEdit.slotIndex != null
               ? String(waitEdit.slotIndex)
               : "",
      };

      const sigKey = JSON.stringify(sig);

      const noSkip =
         typeof window !== "undefined" && window.__DV_NO_SKIP === true;

      if (!noSkip && lastDrawSigRef.current === sigKey) return;
      lastDrawSigRef.current = sigKey;

      let width = hoursColWidth + worldWidth;

      const totalRowsHeight =
         rowHeights && rowHeights.length
            ? rowHeights.reduce((sum, h) => sum + (headerHeight + h), 0)
            : rowsCount * (headerHeight + worldHeight);

      let height =
         totalRowsHeight + (rowsCount > 0 ? (rowsCount - 1) * rowGap : 0);

      width = Math.max(width, effectiveCols * colWidth);
      height = Math.max(height, headerHeight + 200);

      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      setCanvasPx((prev) =>
         prev.w === width && prev.h === height ? prev : { w: width, h: height },
      );

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const hitMap = [];
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

      drawAll({
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
         editingWait: waitEdit
            ? {
                 instId: String(waitEdit.instId),
                 slotIndex: Number(waitEdit.slotIndex || 0),
              }
            : null,
         overlapEventsByInst,
         canceledSlotKeysByInst,
         presenceByReservationColors,
         presenceReservationIds: effectivePresenceReservationIds,
         desiredInstructorBadgeByUserId,
         presenceColorsByReservation,
         createDraftBySlotUsers,
         createDraftBySlotColors,
         activeSearchEventId,
      });
      hitMapRef.current = hitMap;
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
      overlapSig,
      slotsSig,
      blockedSig,
      canceledSig,
      waitSig,
      overlapEventsByInst,
      canceledSlotKeysByInst,
      presenceReservationIds,
      presenceSig,
      presenceColorsByReservation,
      presenceByReservationColors,
      desiredInstructorBadgeByUserId,
      createDraftSig,
      createDraftBySlotUsers,
      createDraftBySlotColors,
      searchHitEventIds,
      activeSearchEventId,

      // ✅ NEW
      activeSectorFilter,
      instructorsLayoutSig,
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
            item.ev &&
            String(item.ev.id) === String(activeEventId),
      );
      if (!activeHit) return;

      const canvasRect = canvas.getBoundingClientRect();
      const topY = canvasRect.top + activeHit.y;
      const bottomY = topY + activeHit.h;
      const centerY = (topY + bottomY) / 2;

      onActiveEventRectChange({
         centerY,
         topY,
         bottomY,
         item: activeHit,
         canvasRect,
      });
   }, [activeEventId, onActiveEventRectChange]);

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

         let instructorIdNum = Number(slot.instructorId);
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
         if (!hit) return hit?.instructorId ?? null;
         const idx = hit.instIdx;
         if (typeof idx === "number" && idx >= 0) {
            const inst = effectiveInstructors[idx];
            if (inst && !isGapCol(inst)) {
               const idStr = String(inst.id ?? "");
               if (idStr && !idStr.startsWith("__pad_")) return idStr;
            }
         }
         const fallback = hit.instructorId;
         if (!fallback) return null;
         const fallbackStr = String(fallback);
         if (fallbackStr.startsWith("__pad_")) return null;
         if (fallbackStr.startsWith(GAPCOL_PREFIX)) return null;
         return fallbackStr;
      },
      [effectiveInstructors],
   );

   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const handleClick = (e) => {
         if (Date.now() < ignoreClickUntilRef.current) return;

         const rect = canvas.getBoundingClientRect();
         const x = e.clientX - rect.left;
         const y = e.clientY - rect.top;

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
                  foundEvent = item.ev;
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

         if (foundEvent && foundEvent.id != null) {
            setSelectedEventId(foundEvent.id);
            setSelectedSlot(null);
            setGlobalSelection({ event: foundEvent, slot: null });

            if (isTouchLike && foundEventItem) {
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
         } else if (foundSlotItem) {
            const resolvedInstructorId =
               resolveInstructorIdForHit(foundSlotItem);
            const slotPayload = {
               instructorId: resolvedInstructorId ?? foundSlotItem.instructorId,
               actionInstructorId: resolvedInstructorId ?? null,
               highlightInstructorId: foundSlotItem.instructorId,
               slotStart: foundSlotItem.slotStart,
               slotEnd: foundSlotItem.slotEnd,
            };
            setSelectedEventId(null);
            setSelectedSlot(slotPayload);
            setGlobalSelection({ event: null, slot: slotPayload });

            if (isTouchLike && getCopyBuffer()) {
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
         } else {
            setSelectedEventId(null);
            setSelectedSlot(null);
            setGlobalSelection({ event: null, slot: null });
            setTouchToolbar(null);
         }
      };

      canvas.addEventListener("click", handleClick);
      return () => canvas.removeEventListener("click", handleClick);
   }, [openRangePanelFromSlot, resolveInstructorIdForHit]);

   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const handleDblClick = (e) => {
         if (Date.now() < ignoreClickUntilRef.current) return;

         const rect = canvas.getBoundingClientRect();
         const x = e.clientX - rect.left;
         const y = e.clientY - rect.top;

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
                     const map = latest || waitNotes;

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
                  requestAnimationFrame(() => openStudentPopup(item.ev));
               } else if (item.kind === "reservation") {
                  requestAnimationFrame(() => openReservationPopup(item.ev));
               } else if (
                  item.kind === "empty-slot" &&
                  typeof onCreateSlot === "function"
               ) {
                  const resolvedInstructorId =
                     resolveInstructorIdForHit(item);
                  const slotPayload = {
                     instructorId:
                        resolvedInstructorId ?? item.instructorId,
                     actionInstructorId: resolvedInstructorId ?? null,
                     highlightInstructorId: item.instructorId,
                     slotStart: item.slotStart,
                     slotEnd: item.slotEnd,
                  };

                  setSelectedEventId(null);
                  setSelectedSlot(slotPayload);
                  setGlobalSelection({ event: null, slot: slotPayload });

                  const payload = {
                     instructorId:
                        resolvedInstructorId ?? item.instructorId,
                     start: new Date(item.slotStart),
                     end: new Date(item.slotEnd),
                  };

                  requestAnimationFrame(() => onCreateSlot(payload));
               }
               break;
            }
         }
      };

      canvas.addEventListener("dblclick", handleDblClick);
      return () => canvas.removeEventListener("dblclick", handleDblClick);
   }, [
      onCreateSlot,
      waitNotes,
      reloadWaitNotes,
      openStudentPopup,
      openReservationPopup,
      resolveInstructorIdForHit,
   ]);

   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const getHitAtClient = (clientX, clientY) => {
         const rect = canvas.getBoundingClientRect();
         const x = clientX - rect.left;
         const y = clientY - rect.top;

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
            const ev = hit.ev;
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
            const slotPayload = {
               instructorId: resolvedInstructorId ?? hit.instructorId,
               actionInstructorId: resolvedInstructorId ?? null,
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
         const hit = getHitAtClient(e.clientX, e.clientY);
         openToolbarForHit(hit);
      };

      const fireLongPress = (hit) => {
         if (!hit) return;
         ignoreClickUntilRef.current = Date.now() + 600;

         if (hit.kind === "reservation" || hit.kind === "student") {
            const ev = hit.ev;
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
         if (e.pointerType) lastPointerTypeRef.current = e.pointerType;
         if (e.button !== 0 && e.button !== undefined) return;

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
   }, [reloadWaitNotes, waitNotes, openStudentPopup]);

   /* ================== UI overlay ================== */

   const { colWidth, colGap, headerHeight, colsPerRow, rowTops } =
      headerMetrics;

   const preGridWidth2 =
      hasPreGrid && colWidth > 0
         ? preGridCols * colWidth + Math.max(0, preGridCols - 1) * colGap
         : 0;

   return (
      <div style={{ position: "relative", flex: "0 0 auto" }}>
         <canvas ref={canvasRef} />

         {effectiveInstructors.map((inst, idx) => {
            if (!inst) return null; // ✅ deja
            if (isGapCol?.(inst)) return null; // (opțional defensiv)
            const row = Math.floor(idx / colsPerRow);
            const col = idx % colsPerRow;

            const left = preGridWidth2 + col * (colWidth + colGap);
            const top = rowTops[row] ?? 0;

            return (
               <CanvasInstructorHeader
                  key={`${String(inst.id)}:${idx}`}
                  inst={inst}
                  dayDate={dayStart instanceof Date ? dayStart : new Date()}
                  sectorClassName=""
                  style={{ left, top, width: colWidth, height: headerHeight }}
                  cars={cars}
                  instructorsFull={instructorsFull}
                  users={users}
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
