import React, { memo, useCallback, useMemo } from "react";

import DayOrderEditorModal from "./DayOrderEditorModal";
import DayviewDomTrack from "./DayviewDomTrack";

const TRACK_DAY_GAP_PX = 24;
const Z_BASE = 0.6;

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

   const canvasLayout = useMemo(
      () => ({
         colWidth: baseMetrics.colw,
         colGap: 12 * zoom,
         headerHeight: 100 * zoom,
         slotHeight: 125 * zoom,
         colsPerRow: maxColsPerGroup,
         rowGap: 24 * zoom,
         dayWidth: baseMetrics.dayWidth,
      }),
      [baseMetrics.colw, baseMetrics.dayWidth, zoom, maxColsPerGroup],
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
                        dayIdx * (baseMetrics.dayWidth + TRACK_DAY_GAP_PX);
                     const viewLeft = Math.max(
                        0,
                        Number(viewportScrollLeft) || 0,
                     );
                     const viewWidth = Math.max(0, Number(viewportWidth) || 0);
                     const viewRight = viewLeft + viewWidth;
                     const dayLeft = Math.max(0, Number(dayOffsetLeft) || 0);
                     const dayRight = dayLeft + Math.max(0, baseMetrics.dayWidth);
                     const isDayInViewport =
                        viewWidth <= 0 ||
                        !(
                           dayRight < viewLeft - TRACK_DAY_GAP_PX ||
                           dayLeft > viewRight + TRACK_DAY_GAP_PX
                        );
                     const stickyAllowed = !isPanInteracting;
                     const isVisible =
                        forceAllDaysVisible ||
                        isDayInViewport ||
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
                           className="dayview__group-wrap cv-auto"
                           data-active="1"
                           data-day-ts={ts}
                           style={{
                              flex: "0 0 auto",
                              width: `${baseMetrics.dayWidth}px`,
                              minWidth: `${baseMetrics.dayWidth}px`,
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
