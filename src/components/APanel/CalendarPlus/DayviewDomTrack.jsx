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
import { addInstructorBlackout } from "../../../api/instructorsService";
import {
   addReservationLocal,
   fetchReservationsDelta,
   removeReservationLocal,
} from "../../../store/reservationsSlice";
import { DEFAULT_EVENT_COLOR_TOKEN, NO_COLOR_TOKEN } from "./render";
import {
   MOLDOVA_TZ,
   buildStartTimeForSlot,
   getStudentPhoneFromEv,
   getStudentPrivateMessageFromEv,
   isEventCanceled,
   localKeyFromTs,
   WAIT_SLOTS_PER_COLUMN,
   CANCEL_SLOTS_PER_COLUMN,
   LATERAL_TIME_MARKS,
   LATERAL_SLOTS_PER_COLUMN,
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

const PAD_IDS = new Set(["__pad_1", "__pad_2", "__pad_3", "__pad_4"]);
const IS_LOW_SPEC_DEVICE =
   typeof navigator !== "undefined" &&
   ((Number(navigator.deviceMemory) > 0 && Number(navigator.deviceMemory) <= 4) ||
      (Number(navigator.hardwareConcurrency) > 0 &&
         Number(navigator.hardwareConcurrency) <= 4));
const DAY_OFFSCREEN_MARGIN_BASE_PX = IS_LOW_SPEC_DEVICE ? 520 : 680;

function normalizeColorToken(input) {
   const raw = String(input || DEFAULT_EVENT_COLOR_TOKEN).trim();
   if (!raw || raw === "--default") return DEFAULT_EVENT_COLOR_TOKEN;
   return raw.startsWith("--") ? raw : DEFAULT_EVENT_COLOR_TOKEN;
}

function resolveCssColor(input) {
   const token = normalizeColorToken(input);
   return token.startsWith("--") ? `var(${token})` : token;
}

function toDateSafe(value) {
   const d = value instanceof Date ? value : new Date(value);
   return Number.isNaN(d.getTime()) ? null : d;
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

export default memo(function DayviewDomTrack({
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
   activeEventId,
   activeSearchEventId,
   onActiveEventRectChange,
   onCreateSlot,
   createDraftBySlotUsers,
   createDraftBySlotColors,
   presenceByReservationUsers,
   presenceByReservationColors,
}) {
   const dispatch = useDispatch();
   const rootRef = useRef(null);
   const eventRefMap = useRef(new Map());

   const [selectionVersion, setSelectionVersionState] = useState(() =>
      getSelectionVersion(),
   );

   useEffect(() => {
      const release = retainGlobals();
      return release;
   }, []);

   useEffect(() => {
      const onSel = () => setSelectionVersionState(getSelectionVersion());
      window.addEventListener("dayview-selection-change", onSel);
      return () => window.removeEventListener("dayview-selection-change", onSel);
   }, []);

   const deleteReservationById = useCallback(
      async (reservationId) => {
         if (!reservationId) return;
         const idStr = String(reservationId);

         dispatch(removeReservationLocal(idStr));
         hideReservationGlobally(idStr);
         setGlobalSelection({ event: null, slot: null });

         try {
            triggerCalendarRefresh({
               source: "dom-shortcut",
               type: "delete-optimistic",
               forceReload: false,
            });
         } catch {}

         try {
            await deleteReservation(idStr);
         } catch (err) {
            console.error("Delete reservation failed (CalendarPlus DOM):", err);
            try {
               await dispatch(fetchReservationsDelta());
               triggerCalendarRefresh({
                  source: "dom-shortcut",
                  type: "delete-rollback",
                  forceReload: false,
               });
            } catch {}
            return;
         }

         setTimeout(async () => {
            try {
               await dispatch(fetchReservationsDelta());
            } catch (err) {
               console.error("Delta refresh after delete failed:", err);
            } finally {
               try {
                  triggerCalendarRefresh({
                     source: "dom-shortcut",
                     type: "delete-sync",
                     forceReload: false,
                  });
               } catch {}
            }
         }, 0);
      },
      [dispatch],
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
            await createReservationsForUser({
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
         } catch (err) {
            console.error("Paste create failed (CalendarPlus DOM):", err);
            dispatch(removeReservationLocal(optimisticId));
            try {
               await dispatch(fetchReservationsDelta());
            } catch {}
            try {
               triggerCalendarRefresh({
                  source: "dom-shortcut",
                  type: "paste-failed",
                  forceReload: false,
               });
            } catch {}
            return;
         }

         setTimeout(async () => {
            try {
               await dispatch(fetchReservationsDelta());
            } catch {}
            dispatch(removeReservationLocal(optimisticId));
            try {
               triggerCalendarRefresh({
                  source: "dom-shortcut",
                  type: "paste-sync",
                  forceReload: false,
               });
            } catch {}
         }, 0);
      },
      [dispatch],
   );

   useEffect(() => {
      setPasteFn(pasteFromCopyToSlot);
   }, [pasteFromCopyToSlot]);

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
   }, []);

   useEffect(() => {
      setBlockFn(blockSelectedSlot);
   }, [blockSelectedSlot]);

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
   const colWidth = Math.max(80, Number(layout?.colWidth || 150));
   const colGap = Math.max(0, Number(layout?.colGap || 12));
   const headerHeight = Math.max(60, Number(layout?.headerHeight || 100) * z);
   const colsPerRow = Math.max(1, Number(layout?.colsPerRow || 4));
   const rowGap = Math.max(0, Number(layout?.rowGap ?? 24));
   const slotHeight = Math.max(24, Number(layout?.slotHeight || 120));
   const slotGap = 4;

   const headersMeta = useMemo(
      () => buildHeadersMeta(instructors, colsPerRow),
      [instructors, colsPerRow],
   );

   const headerMetrics = useMemo(() => {
      const colsCount = Math.max(1, headersMeta.length || 1);
      const rowsCount = Math.max(1, Math.ceil(colsCount / colsPerRow));
      const worldHeight = computeWorldHeight(slotsSafe.length, slotHeight, slotGap);
      const padWorldHeight = computeWorldHeight(
         Math.min(WAIT_SLOTS_PER_COLUMN, slotsSafe.length),
         slotHeight,
         slotGap,
      );

      const rowHeights = new Array(rowsCount);
      for (let row = 0; row < rowsCount; row++) {
         const start = row * colsPerRow;
         const end = Math.min(colsCount, start + colsPerRow);
         let allPad = true;
         for (let i = start; i < end; i++) {
            const instId = String(headersMeta[i]?.inst?.id || "");
            if (!instId.startsWith("__pad_")) {
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
   }, [headersMeta, colsPerRow, slotsSafe.length, slotHeight, slotGap, headerHeight, rowGap, colWidth, colGap]);

   const isDayNearViewport = useMemo(() => {
      const viewWidth = Math.max(0, Number(viewportWidth) || 0);
      if (viewWidth <= 0) return true;

      const viewLeft = Math.max(0, Number(viewportScrollLeft) || 0);
      const viewRight = viewLeft + viewWidth;
      const dayLeft = Math.max(0, Number(dayOffsetLeft) || 0);
      const dayRight = dayLeft + Math.max(0, Number(headerMetrics.dayWidth) || 0);
      if (dayRight <= dayLeft) return true;

      const margin = Math.max(
         DAY_OFFSCREEN_MARGIN_BASE_PX,
         Math.round(viewWidth * (IS_LOW_SPEC_DEVICE ? 0.55 : 0.8)),
      );

      return !(dayRight < viewLeft - margin || dayLeft > viewRight + margin);
   }, [viewportWidth, viewportScrollLeft, dayOffsetLeft, headerMetrics.dayWidth]);

   const rowRenderRange = useMemo(() => {
      const rowsCount = Number(headerMetrics.rowsCount || 0);
      if (!rowsCount) return { start: 0, end: 0 };

      const viewH = Number(viewportHeight) || 0;
      if (viewH <= 0) return { start: 0, end: rowsCount - 1 };

      const viewTop = Math.max(0, Number(viewportScrollTop) || 0);
      const viewBottom = viewTop + viewH;
      const overscanPx = Math.max(
         IS_LOW_SPEC_DEVICE ? 220 : 300,
         Math.round(viewH * (IS_LOW_SPEC_DEVICE ? 0.55 : 0.75)),
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
   }, [headerMetrics, viewportScrollTop, viewportHeight, headerHeight]);

   const colRenderRange = useMemo(() => {
      const viewW = Number(viewportWidth) || 0;
      if (viewW <= 0) return { start: 0, end: colsPerRow - 1 };

      const stride = Math.max(1, colWidth + colGap);
      const overscanPx = Math.max(
         IS_LOW_SPEC_DEVICE ? 320 : 420,
         Math.round(colWidth * (IS_LOW_SPEC_DEVICE ? 2.4 : 3.2)),
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
   }, [viewportWidth, viewportScrollLeft, dayOffsetLeft, colsPerRow, colWidth, colGap]);

   const slotLabelByIndex = useMemo(() => {
      return slotsSafe.map((slot) => slot.label);
   }, [slotsSafe]);

   const eventsPrepared = useMemo(() => {
      const list = Array.isArray(events) ? events : [];
      if (!list.length || !slotsSafe.length) return [];

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
      const canceled = [];

      for (const ev of base) {
         const rid = getReservationId(ev);
         if (rid != null && isHidden(rid)) continue;

         if (isEventCanceled(ev) && cancelPads.length) {
            canceled.push(ev);
            continue;
         }

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

         plain.push({
            id: ev?.id != null ? String(ev.id) : "",
            reservationId: rid != null ? String(rid) : String(ev?.id || ""),
            instructorId: mappedInstId,
            slotIdx,
            start,
            end: toDateSafe(ev?.end),
            student,
            phone,
            privateMessage,
            colorToken: normalizeColorToken(ev?.color),
            canceled: false,
            rawEvent: ev,
            userId: getEventUserId(ev),
            sector: ev?.raw?.sector || ev?.sector || "Botanica",
            gearbox: ev?.raw?.gearbox || ev?.gearbox || "Manual",
         });
      }

      if (canceled.length && cancelPads.length) {
         const maxSlots = Math.max(1, Math.min(CANCEL_SLOTS_PER_COLUMN, slotsSafe.length));
         canceled
            .slice()
            .sort((a, b) => {
               const aa = toDateSafe(a?.start)?.getTime() || 0;
               const bb = toDateSafe(b?.start)?.getTime() || 0;
               return aa - bb;
            })
            .forEach((ev, idx) => {
               const padMeta = cancelPads[Math.floor(idx / maxSlots) % cancelPads.length];
               const slotIdx = idx % maxSlots;
               const rid = getReservationId(ev);
               const start = toDateSafe(ev?.start);
               if (!padMeta?.inst?.id || !start) return;

               plain.push({
                  id: ev?.id != null ? String(ev.id) : "",
                  reservationId: rid != null ? String(rid) : String(ev?.id || ""),
                  instructorId: String(padMeta.inst.id),
                  slotIdx,
                  start,
                  end: toDateSafe(ev?.end),
                  student:
                     `${ev?.studentFirst || ""} ${ev?.studentLast || ""}`.trim() ||
                     "Programare",
                  phone: getStudentPhoneFromEv(ev),
                  privateMessage:
                     String(ev?.eventPrivateMessage || "").trim() ||
                     String(getStudentPrivateMessageFromEv(ev) || "").trim(),
                  colorToken: normalizeColorToken(ev?.color),
                  canceled: true,
                  rawEvent: ev,
                  userId: getEventUserId(ev),
                  sector: ev?.raw?.sector || ev?.sector || "Botanica",
                  gearbox: ev?.raw?.gearbox || ev?.gearbox || "Manual",
               });
            });
      }

      return plain;
   }, [events, headersMeta, slotsSafe, slotIndexByKey]);

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

   const visibleColumns = useMemo(() => {
      if (!isDayNearViewport) return [];
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
         const isPad = PAD_IDS.has(String(meta.inst?.id || ""));

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
      isDayNearViewport,
      rowRenderRange,
      colRenderRange,
      headerMetrics,
      colWidth,
      colGap,
   ]);

   const handleSelectSlot = useCallback((instId, slot) => {
      const instructorId = String(instId || "");
      if (!instructorId || !slot) return;

      setGlobalSelection({
         event: null,
         slot: {
            instructorId,
            actionInstructorId: instructorId,
            slotStart: slot.start,
            slotEnd: slot.end,
            localSlotKey: slot.key,
         },
      });
   }, []);

   const handleCreateFromSlot = useCallback(
      (inst, slot, blocked) => {
         const instructorId = String(inst?.id || "");
         if (!instructorId || PAD_IDS.has(instructorId) || blocked) return;

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
         const eventEl = e.target?.closest?.("[data-cp-kind='event']");
         if (eventEl) {
            const rid = String(eventEl.getAttribute("data-res-id") || "");
            if (!rid) return;
            const item = eventsPrepared.find(
               (x) => String(x.reservationId || x.id || "") === rid,
            );
            if (!item) return;

            setGlobalSelection({ event: item.rawEvent, slot: null });
            openPopup("reservationEdit", { reservationId: rid });
            return;
         }

         const slotEl = e.target?.closest?.("[data-cp-kind='slot']");
         if (!slotEl) return;

         const instId = String(slotEl.getAttribute("data-inst-id") || "");
         const slotIdx = Number(slotEl.getAttribute("data-slot-idx"));
         if (!instId || !Number.isFinite(slotIdx)) return;

         const slot = slotsSafe[slotIdx] || null;
         if (!slot) return;

         handleSelectSlot(instId, slot);
      },
      [eventsPrepared, handleSelectSlot, slotsSafe],
   );

   const onGridDoubleClick = useCallback(
      (e) => {
         const slotEl = e.target?.closest?.("[data-cp-kind='slot']");
         if (!slotEl) return;

         const instId = String(slotEl.getAttribute("data-inst-id") || "");
         const slotIdx = Number(slotEl.getAttribute("data-slot-idx"));
         const blocked = slotEl.getAttribute("data-blocked") === "1";
         if (!instId || !Number.isFinite(slotIdx)) return;

         const slot = slotsSafe[slotIdx] || null;
         if (!slot) return;

         const inst =
            headersMeta.find((h) => String(h.inst?.id || "") === instId)?.inst ||
            null;
         handleCreateFromSlot(inst, slot, blocked);
      },
      [headersMeta, handleCreateFromSlot, slotsSafe],
   );

   useLayoutEffect(() => {
      if (typeof onActiveEventRectChange !== "function") return;
      const id = String(activeEventId ?? "");
      if (!id) return;

      const el = eventRefMap.current.get(id);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (!rect || rect.height <= 0) return;

      onActiveEventRectChange({
         topY: rect.top,
         bottomY: rect.bottom,
         centerY: rect.top + rect.height / 2,
         canvasRect: rootRef.current?.getBoundingClientRect?.() || null,
      });
   }, [activeEventId, onActiveEventRectChange, byCell, selectionVersion]);

   if (!isDayNearViewport) {
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
      >
         {visibleColumns.map(({ inst, idx, top, left, isPad, rowHeight }) => {
            const instId = String(inst?.id || "");
            const padType = String(inst?._padType || "");
            const maxSlots = isPad
               ? padType === "cancel"
                  ? Math.min(CANCEL_SLOTS_PER_COLUMN, slotsSafe.length)
                  : padType === "lateral"
                    ? Math.min(LATERAL_SLOTS_PER_COLUMN, slotsSafe.length)
                    : Math.min(WAIT_SLOTS_PER_COLUMN, slotsSafe.length)
               : slotsSafe.length;

            return (
               <section
                  key={`${instId || "inst"}-${idx}`}
                  className={`cpdom__col${isPad ? " cpdom__col--pad" : ""}`}
                  style={{
                     position: "absolute",
                     left: `${left}px`,
                     top: `${top}px`,
                     width: `${colWidth}px`,
                     height: `${headerHeight + rowHeight}px`,
                  }}
               >
                  <header
                     className="cpdom__head dayview__column-head"
                     style={{ minHeight: `${headerHeight}px` }}
                  >
                     <strong className="dv-inst-name">{inst?.name || "—"}</strong>
                     <small className="cpdom__sub">
                        {isPad
                           ? "Coloană sistem"
                           : inst?.sectorSlug || inst?.sector || "Instructor"}
                     </small>
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

                        const slotLabel =
                           padType === "lateral"
                              ? LATERAL_TIME_MARKS[i] || slotLabelByIndex[i] || slot.label
                              : slot.label;

                        const blockedSet = blockedKeyMap?.get?.(instId);
                        const isBlocked = !!blockedSet?.has?.(slot.key);

                        const draftKey = `${instId}|${slot.start.toISOString()}`;
                        const hasDraft =
                           createDraftBySlotUsers instanceof Map &&
                           createDraftBySlotUsers.has(draftKey);
                        const draftColor =
                           createDraftBySlotColors instanceof Map
                              ? createDraftBySlotColors.get(draftKey)
                              : null;

                        const cellKey = `${instId}|${i}`;
                        const firstEvent = (byCell.get(cellKey) || [])[0] || null;

                        const isSelectedSlot =
                           selectedSlotInstructorId === instId &&
                           selectedSlotKey === slot.key;

                        return (
                           <div
                              key={cellKey}
                              className={
                                 "cpdom__slot" +
                                 (isBlocked ? " is-blocked" : "") +
                                 (isSelectedSlot ? " is-selected-slot" : "") +
                                 (hasDraft ? " is-draft" : "")
                              }
                              data-cp-kind="slot"
                              data-inst-id={instId}
                              data-slot-idx={i}
                              data-blocked={isBlocked ? "1" : "0"}
                              style={
                                 hasDraft && draftColor
                                    ? {
                                         borderStyle: "dashed",
                                         borderColor: resolveCssColor(draftColor),
                                      }
                                    : undefined
                              }
                           >
                              {firstEvent ? (
                                 <button
                                    ref={(el) => {
                                       const id = String(firstEvent.reservationId || "");
                                       if (!id) return;
                                       if (el) eventRefMap.current.set(id, el);
                                       else eventRefMap.current.delete(id);
                                    }}
                                    type="button"
                                    className={
                                       "cpdom__event dayview__event" +
                                       (selectedEventId === firstEvent.reservationId
                                          ? " is-selected-event"
                                          : "") +
                                       (renderActiveId === firstEvent.reservationId
                                          ? " is-active-event"
                                          : "") +
                                       (renderSearchId === firstEvent.reservationId
                                          ? " is-search-event"
                                          : "")
                                    }
                                    data-cp-kind="event"
                                    data-res-id={firstEvent.reservationId}
                                    style={{
                                       background: resolveCssColor(firstEvent.colorToken),
                                    }}
                                    title={`${firstEvent.student} (${hhmm(firstEvent.start)})`}
                                 >
                                    <span className="dayview__event-person-name">
                                       {firstEvent.student}
                                    </span>
                                    <span className="dayview__event-phone">
                                       {firstEvent.phone || slotLabel}
                                    </span>
                                    <span className="dayview__event-note">
                                       {firstEvent.privateMessage || " "}
                                    </span>
                                    {presenceByReservationUsers instanceof Map &&
                                    presenceByReservationUsers.has(
                                       firstEvent.reservationId,
                                    ) ? (
                                       <span
                                          className="cpdom__presence"
                                          style={{
                                             background:
                                                presenceByReservationColors instanceof Map
                                                   ? resolveCssColor(
                                                        presenceByReservationColors.get(
                                                           firstEvent.reservationId,
                                                        ) || "--accent-l",
                                                     )
                                                   : "var(--accent-l)",
                                          }}
                                       />
                                    ) : null}
                                 </button>
                              ) : (
                                 <div className="cpdom__empty">
                                    <span className="cpdom__time">{slotLabel}</span>
                                 </div>
                              )}
                           </div>
                        );
                     })}
                  </div>
               </section>
            );
         })}
      </div>
   );
});
