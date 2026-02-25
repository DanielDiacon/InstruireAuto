import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";

import DayOrderEditorModal from "./DayOrderEditorModal";
import DayviewDomTrack from "./DayviewDomTrack";
import { norm } from "./utils";
import {
   computeHorizontalTileWindow,
   createHorizontalTileEngineState,
   resetHorizontalTileEngineState,
} from "../calendarTileEngine";

const TRACK_DAY_GAP_PX = 10;
const TRACK_COL_GAP_PX = 4;
const TRACK_ROW_GAP_PX = 8;
const TRACK_HEADER_HEIGHT_PX = 88;
const TRACK_SLOT_HEIGHT_PX = 90;
const TRACK_COL_EXTRA_WIDTH_PX = 10;
const Z_BASE = 0.6;
const IS_LOW_SPEC_DEVICE =
   typeof navigator !== "undefined" &&
   ((Number(navigator.deviceMemory) > 0 && Number(navigator.deviceMemory) <= 4) ||
      (Number(navigator.hardwareConcurrency) > 0 &&
         Number(navigator.hardwareConcurrency) <= 4));

const EMPTY_EVENTS = [];
const EMPTY_SLOTS = [];
const EMPTY_MAP = new Map();
const digitsOnly = (s = "") => s.toString().replace(/\D+/g, "");

const startOfDayTs = (d) => {
   const x = new Date(d);
   return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
};

function CalendarPlusTrack({
   scrollRef,
   rowHeight,
   dayRefs,
   loadedDays,
   visibleDays,
   stickyVisibleDays,
   hydratedDays,
   isPanInteracting,
   panPointerType = "mouse",
   isDummyMode,
   allowedInstBySector,
   baseMetrics,
   maxColsPerGroup,
   zoom,
   timeMarks,
   handleCreateFromEmpty,
   activeEventId,
   activeSearchEventId,
   handleActiveEventRectChange,
   cars,
   instructors,
   users,
   canvasInstructorsA,
   canvasInstructorsB,
   viewportScrollLeft,
   viewportScrollTop,
   viewportWidth,
   viewportHeight,
   viewModel,
   forceAllDaysVisible,
   createDraftBySlotUsers,
   createDraftBySlotColors,
   presenceByReservationUsers,
   presenceByReservationColors,
   orderEditOpen,
   onToggleOrderEdit,
   onCloseOrderEdit,
   onSaveOrder,
}) {
   const eventsByDay = viewModel?.eventsByDay ?? EMPTY_MAP;
   const standardSlotsByDay = viewModel?.standardSlotsByDay ?? EMPTY_MAP;
   const blackoutKeyMap = viewModel?.blackoutKeyMap || null;
   const blackoutVer = viewModel?.blackoutVer ?? 0;

   const sharedLookups = useMemo(() => {
      const usersById = new Map();
      const usersByPhone = new Map();
      const usersByNormName = new Map();
      const instructorUsersByNormName = new Map();
      const instructorsFullById = new Map();
      const carsByInstructorId = new Map();

      for (const inst of Array.isArray(instructors) ? instructors : []) {
         const idRaw = inst?.id;
         if (idRaw == null) continue;
         instructorsFullById.set(String(idRaw), inst);
      }

      for (const car of Array.isArray(cars) ? cars : []) {
         const iidRaw = car?.instructorId ?? car?.instructor_id ?? null;
         if (iidRaw == null) continue;
         carsByInstructorId.set(String(iidRaw), car);
      }

      for (const user of Array.isArray(users) ? users : []) {
         const idRaw = user?.id;
         if (idRaw != null) {
            usersById.set(String(idRaw), user);
         }

         const phoneKey = digitsOnly(user?.phone);
         if (phoneKey && !usersByPhone.has(phoneKey)) {
            usersByPhone.set(phoneKey, user);
         }

         const nameKey = norm(`${user?.firstName ?? ""} ${user?.lastName ?? ""}`);
         if (nameKey && !usersByNormName.has(nameKey)) {
            usersByNormName.set(nameKey, user);
         }
         if (
            nameKey &&
            String(user?.role ?? "").toUpperCase() === "INSTRUCTOR" &&
            !instructorUsersByNormName.has(nameKey)
         ) {
            instructorUsersByNormName.set(nameKey, user);
         }
      }

      return {
         usersById,
         usersByPhone,
         usersByNormName,
         instructorUsersByNormName,
         instructorsFullById,
         carsByInstructorId,
      };
   }, [users, instructors, cars]);

   const eventsByDayForView = useMemo(() => {
      if (!allowedInstBySector) return eventsByDay;

      const filtered = new Map();
      for (const [ts, evs] of eventsByDay.entries()) {
         if (!Array.isArray(evs) || !evs.length) {
            filtered.set(ts, EMPTY_EVENTS);
            continue;
         }
         const arr = evs.filter((ev) =>
            allowedInstBySector.has(String(ev?.instructorId ?? "__unknown")),
         );
         filtered.set(ts, arr.length ? arr : EMPTY_EVENTS);
      }
      return filtered;
   }, [eventsByDay, allowedInstBySector]);

   const labelFormatter = useMemo(
      () =>
         new Intl.DateTimeFormat("ro-RO", {
            weekday: "short",
            day: "2-digit",
            month: "short",
         }),
      [],
   );
   const domColWidth = useMemo(
      () =>
         Math.max(
            80,
            Math.round(Number(baseMetrics?.colw || 0) + TRACK_COL_EXTRA_WIDTH_PX),
         ),
      [baseMetrics?.colw],
   );
   const domDayWidth = useMemo(
      () => Math.max(1, maxColsPerGroup * domColWidth),
      [maxColsPerGroup, domColWidth],
   );

   const canvasLayout = useMemo(
      () => ({
         colWidth: domColWidth,
         colGap: TRACK_COL_GAP_PX,
         headerHeight: TRACK_HEADER_HEIGHT_PX,
         slotHeight: TRACK_SLOT_HEIGHT_PX,
         colsPerRow: maxColsPerGroup,
         rowGap: TRACK_ROW_GAP_PX,
         dayWidth: domDayWidth,
      }),
      [domColWidth, domDayWidth, maxColsPerGroup],
   );

   const isGroupAForDate = useCallback((dateObj) => {
      const dow = dateObj.getDay();
      return dow === 0 || dow === 2 || dow === 4;
   }, []);

   const dayEntries = useMemo(
      () =>
         loadedDays.map((d) => {
            const ts = startOfDayTs(d);
            const dayStartLocal = new Date(d);
            dayStartLocal.setHours(7, 0, 0, 0);
            const dayEndLocal = new Date(d);
            dayEndLocal.setHours(21, 0, 0, 0);
            return {
               ts,
               label: labelFormatter.format(d).replace(",", ""),
               dayStartTs: dayStartLocal.getTime(),
               dayEndTs: dayEndLocal.getTime(),
               isGroupA: isGroupAForDate(d),
            };
         }),
      [loadedDays, isGroupAForDate, labelFormatter],
   );
   const dayTileEngineRef = useRef(createHorizontalTileEngineState());
   useEffect(() => {
      resetHorizontalTileEngineState(dayTileEngineRef.current);
   }, [dayEntries.length, domDayWidth]);
   const dayTileWindow = useMemo(() => {
      const dayStride = Math.max(1, Number(domDayWidth || 0) + TRACK_DAY_GAP_PX);
      const daysInViewport = Math.max(
         1,
         Math.ceil((Math.max(0, Number(viewportWidth) || 0) + 1) / dayStride),
      );
      return computeHorizontalTileWindow(dayTileEngineRef.current, {
         totalItems: dayEntries.length,
         itemWidthPx: dayStride,
         viewportLeft: viewportScrollLeft,
         viewportWidth,
         isInteracting: isPanInteracting,
         itemsPerTile: 1,
         baseOverscanTiles: 1,
         panOverscanTiles: IS_LOW_SPEC_DEVICE ? 1 : 2,
         idlePrefetchTiles: 0,
         panPrefetchTiles: IS_LOW_SPEC_DEVICE
            ? Math.max(1, Math.min(2, daysInViewport))
            : Math.max(1, Math.min(3, daysInViewport)),
         maxCacheTiles: Math.max(
            IS_LOW_SPEC_DEVICE ? 6 : 8,
            daysInViewport + (IS_LOW_SPEC_DEVICE ? 1 : 2),
         ),
         keepAliveMs: isPanInteracting ? 520 : 420,
         directionEpsilonPx: 2,
      });
   }, [
      dayEntries.length,
      domDayWidth,
      viewportScrollLeft,
      viewportWidth,
      isPanInteracting,
   ]);

   return (
      <div
         className="dv-track-wrap"
         style={{
            position: "relative",
            height: rowHeight ? `${rowHeight}px` : undefined,
         }}
      >
         <button
            type="button"
            data-dv-interactive="1"
            className="dv-track-edit-btn"
            onClick={onToggleOrderEdit}
            title={
               orderEditOpen
                  ? "Înapoi la calendar"
                  : "Editează ordinea instructorilor"
            }
         >
            {orderEditOpen ? "Înapoi" : "Edit"}
         </button>

         <div
            className="dayview__row dv-pan"
            ref={scrollRef}
            style={{
               touchAction: orderEditOpen ? "auto" : "none",
               height: "100%",
               overflowX: "auto",
               overflowY: "auto",
               overscrollBehavior: "contain",
               cursor: orderEditOpen ? "default" : "grab",
               WebkitUserDrag: "none",
               userSelect: "none",
               willChange: "scroll-position",
            }}
         >
            {orderEditOpen ? (
               <DayOrderEditorModal
                  open={true}
                  inline={true}
                  cars={cars}
                  instructors={instructors}
                  onClose={onCloseOrderEdit}
                  onSave={onSaveOrder}
               />
            ) : (
               <div
                  className="dayview__track"
                  style={{
                     display: "flex",
                     alignItems: "stretch",
                     gap: `${TRACK_DAY_GAP_PX}px`,
                     paddingRight: `${TRACK_DAY_GAP_PX}px`,
                     height: "100%",
                  }}
               >
                  {dayEntries.map((entry, dayIdx) => {
                     const { ts, label, dayStartTs, dayEndTs, isGroupA } =
                        entry;
                     const dayOffsetLeft =
                        dayIdx * (domDayWidth + TRACK_DAY_GAP_PX);
                     const dayLeft = dayOffsetLeft;
                     const dayRight = dayLeft + (Number(domDayWidth) || 0);
                     const viewportLeft = Math.max(0, Number(viewportScrollLeft) || 0);
                     const viewportRight =
                        viewportLeft + Math.max(0, Number(viewportWidth) || 0);
                     const viewportBandMargin = Math.max(
                        Math.round((Number(domDayWidth) || 0) * 0.75),
                        Math.round(
                           (Number(viewportWidth) || 0) *
                              (isPanInteracting
                                 ? IS_LOW_SPEC_DEVICE
                                    ? 0.34
                                    : 0.42
                                 : IS_LOW_SPEC_DEVICE
                                   ? 0.4
                                   : 0.5),
                        ),
                     );
                     const inViewportBand =
                        !isPanInteracting &&
                        (viewportRight <= viewportLeft ||
                           !(
                              dayRight < viewportLeft - viewportBandMargin ||
                              dayLeft > viewportRight + viewportBandMargin
                           ));
                     const dayTileIdx = Math.floor(
                        dayIdx / Math.max(1, dayTileWindow.itemsPerTile || 1),
                     );
                     const tileVisible =
                        dayTileIdx >= (dayTileWindow.activeTileStart ?? 0) &&
                        dayTileIdx <= (dayTileWindow.activeTileEnd ?? -1);
                     const panType = String(panPointerType || "")
                        .trim()
                        .toLowerCase();
                     const isMousePan = isPanInteracting && panType === "mouse";
                     const useStateVisibility = !isMousePan;
                     const isCandidateVisible = forceAllDaysVisible
                        ? tileVisible || inViewportBand
                        : tileVisible ||
                          inViewportBand ||
                          (useStateVisibility &&
                             (visibleDays.has(ts) ||
                                stickyVisibleDays?.has?.(ts)));
                     const shouldBypassHydration =
                        isMousePan && (tileVisible || inViewportBand);
                     const isHydrated =
                        forceAllDaysVisible ||
                        shouldBypassHydration ||
                        hydratedDays?.has?.(ts);
                     const isVisible = isCandidateVisible && isHydrated;
                     const dayInstructors = isGroupA
                        ? canvasInstructorsA
                        : canvasInstructorsB;
                     let evs = EMPTY_EVENTS;
                     let slots = EMPTY_SLOTS;

                     if (isVisible) {
                        evs = isDummyMode
                           ? EMPTY_EVENTS
                           : eventsByDayForView.get(ts) || EMPTY_EVENTS;
                        slots = standardSlotsByDay.get(ts) || EMPTY_SLOTS;
                     }

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
                           className="dayview__group-wrap cv-auto cpdom-day-group"
                           data-active="1"
                           data-day-ts={ts}
                           style={{
                              flex: "0 0 auto",
                              width: `${domDayWidth}px`,
                              minWidth: `${domDayWidth}px`,
                              display: "flex",
                              flexDirection: "column",
                              contain: "layout paint",
                           }}
                        >
                           <header className="dayview__group-header">
                              <div className="dayview__group-title">
                                 {label}
                              </div>
                           </header>

                           <div
                              className="dayview__group-content dayview__group-content--row"
                              style={{ flex: "1 1 auto", minHeight: 0 }}
                           >
                              {isVisible ? (
                                 <DayviewDomTrack
                                    dayStart={dayStartTs}
                                    dayEnd={dayEndTs}
                                    instructors={dayInstructors}
                                    events={evs}
                                    slots={slots}
                                    dayOffsetLeft={dayOffsetLeft}
                                    viewportScrollLeft={viewportScrollLeft}
                                    viewportScrollTop={viewportScrollTop}
                                    viewportWidth={viewportWidth}
                                    viewportHeight={viewportHeight}
                                    layout={canvasLayout}
                                    timeMarks={timeMarks}
                                    onCreateSlot={handleCreateFromEmpty}
                                    blockedKeyMap={
                                       isDummyMode ? null : blackoutKeyMap
                                    }
                                    blackoutVer={blackoutVer}
                                    activeEventId={activeEventId}
                                    activeSearchEventId={activeSearchEventId}
                                    onActiveEventRectChange={
                                       handleActiveEventRectChange
                                    }
                                    cars={cars}
                                    instructorsFull={instructors}
                                    users={users}
                                    sharedLookups={sharedLookups}
                                    zoom={zoom / Z_BASE}
                                    presenceByReservationUsers={
                                       presenceByReservationUsers
                                    }
                                    presenceByReservationColors={
                                       presenceByReservationColors
                                    }
                                    createDraftBySlotColors={
                                       createDraftBySlotColors
                                    }
                                    createDraftBySlotUsers={
                                       createDraftBySlotUsers
                                    }
                                    isPanInteracting={isPanInteracting}
                                    panPointerType={panPointerType}
                                 />
                              ) : (
                                 <div className="dayview__skeleton" />
                              )}
                           </div>
                        </section>
                     );
                  })}
               </div>
            )}
         </div>
      </div>
   );
}

function areTrackPropsEqual(prev, next) {
   if (prev === next) return true;

   if (prev.scrollRef !== next.scrollRef) return false;
   if (prev.rowHeight !== next.rowHeight) return false;
   if (prev.dayRefs !== next.dayRefs) return false;
   if (prev.loadedDays !== next.loadedDays) return false;
   if (prev.visibleDays !== next.visibleDays) return false;
   if (prev.stickyVisibleDays !== next.stickyVisibleDays) return false;
   if (prev.hydratedDays !== next.hydratedDays) return false;
   if (prev.isPanInteracting !== next.isPanInteracting) return false;
   if (prev.panPointerType !== next.panPointerType) return false;
   if (prev.isDummyMode !== next.isDummyMode) return false;
   if (prev.allowedInstBySector !== next.allowedInstBySector) return false;
   if (prev.baseMetrics !== next.baseMetrics) return false;
   if (prev.maxColsPerGroup !== next.maxColsPerGroup) return false;
   if (prev.zoom !== next.zoom) return false;
   if (prev.timeMarks !== next.timeMarks) return false;
   if (prev.handleCreateFromEmpty !== next.handleCreateFromEmpty) return false;
   if (prev.activeEventId !== next.activeEventId) return false;
   if (prev.activeSearchEventId !== next.activeSearchEventId) return false;
   if (prev.handleActiveEventRectChange !== next.handleActiveEventRectChange)
      return false;
   if (prev.cars !== next.cars) return false;
   if (prev.instructors !== next.instructors) return false;
   if (prev.users !== next.users) return false;
   if (prev.canvasInstructorsA !== next.canvasInstructorsA) return false;
   if (prev.canvasInstructorsB !== next.canvasInstructorsB) return false;
   if (prev.viewModel !== next.viewModel) return false;
   if (prev.forceAllDaysVisible !== next.forceAllDaysVisible) return false;
   if (prev.createDraftBySlotUsers !== next.createDraftBySlotUsers) return false;
   if (prev.createDraftBySlotColors !== next.createDraftBySlotColors) return false;
   if (prev.presenceByReservationUsers !== next.presenceByReservationUsers)
      return false;
   if (prev.presenceByReservationColors !== next.presenceByReservationColors)
      return false;
   if (prev.orderEditOpen !== next.orderEditOpen) return false;
   if (prev.onToggleOrderEdit !== next.onToggleOrderEdit) return false;
   if (prev.onCloseOrderEdit !== next.onCloseOrderEdit) return false;
   if (prev.onSaveOrder !== next.onSaveOrder) return false;

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

export default memo(CalendarPlusTrack, areTrackPropsEqual);
