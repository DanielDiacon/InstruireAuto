import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";

import DayOrderEditorModal from "./DayOrderEditorModal";
import DayviewDomTrack from "./DayviewDomTrack";
import {
   computeHorizontalTileWindow,
   createHorizontalTileEngineState,
   resetHorizontalTileEngineState,
} from "../calendarTileEngine";

const TRACK_DAY_GAP_PX = 10;
const Z_BASE = 0.6;
const IS_LOW_SPEC_DEVICE =
   typeof navigator !== "undefined" &&
   ((Number(navigator.deviceMemory) > 0 && Number(navigator.deviceMemory) <= 4) ||
      (Number(navigator.hardwareConcurrency) > 0 &&
         Number(navigator.hardwareConcurrency) <= 4));

const EMPTY_EVENTS = [];
const EMPTY_SLOTS = [];
const EMPTY_MAP = new Map();

const startOfDayTs = (d) => {
   const x = new Date(d);
   return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
};

const CalendarPlusTrack = memo(function CalendarPlusTrack({
   scrollRef,
   rowHeight,
   dayRefs,
   loadedDays,
   visibleDays,
   stickyVisibleDays,
   isPanInteracting,
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
      () => Math.max(80, Math.round(Number(baseMetrics?.colw || 0))),
      [baseMetrics?.colw],
   );
   const domDayWidth = useMemo(
      () => Math.max(1, maxColsPerGroup * domColWidth),
      [maxColsPerGroup, domColWidth],
   );

   const canvasLayout = useMemo(
      () => ({
         colWidth: domColWidth,
         colGap: 4 * zoom,
         headerHeight: 100 * zoom,
         slotHeight: 125 * zoom,
         colsPerRow: maxColsPerGroup,
         rowGap: 8 * zoom,
         dayWidth: domDayWidth,
      }),
      [domColWidth, domDayWidth, zoom, maxColsPerGroup],
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
         baseOverscanTiles: IS_LOW_SPEC_DEVICE ? 1 : 2,
         panOverscanTiles: IS_LOW_SPEC_DEVICE ? 2 : 3,
         idlePrefetchTiles: 0,
         panPrefetchTiles: IS_LOW_SPEC_DEVICE
            ? Math.max(2, Math.min(4, daysInViewport + 1))
            : Math.max(3, Math.min(5, daysInViewport + 1)),
         maxCacheTiles: Math.max(
            IS_LOW_SPEC_DEVICE ? 10 : 12,
            daysInViewport + (IS_LOW_SPEC_DEVICE ? 3 : 4),
         ),
         keepAliveMs: isPanInteracting ? 900 : 600,
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
                        Math.round((Number(domDayWidth) || 0) * 1.35),
                        Math.round(
                           (Number(viewportWidth) || 0) *
                              (isPanInteracting
                                 ? IS_LOW_SPEC_DEVICE
                                    ? 0.7
                                    : 0.82
                                 : IS_LOW_SPEC_DEVICE
                                   ? 0.78
                                   : 0.92),
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
                     const stickyAllowed = !isPanInteracting;
                     const isVisible = forceAllDaysVisible
                        ? tileVisible || inViewportBand
                        : tileVisible ||
                          inViewportBand ||
                          visibleDays.has(ts) ||
                          (stickyAllowed && stickyVisibleDays?.has?.(ts));
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
});

export default CalendarPlusTrack;
