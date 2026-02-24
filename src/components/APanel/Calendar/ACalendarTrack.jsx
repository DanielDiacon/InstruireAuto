import React, {
   memo,
   useCallback,
   useEffect,
   useMemo,
   useRef,
   useState,
} from "react";

import {
   computeHorizontalTileWindow,
   createHorizontalTileEngineState,
   resetHorizontalTileEngineState,
} from "../calendarTileEngine";
import DayOrderEditorModal from "./DayOrderEditorModal";
import DayviewCanvasTrack from "./DayviewCanvasTrack";
import { norm } from "./utils";

const EMPTY_EVENTS = [];
const EMPTY_SLOTS = [];
const EMPTY_MAP = new Map();
const DISABLE_DAY_TILE_ENGINE = true;

const digitsOnly = (s = "") => s.toString().replace(/\D+/g, "");

const startOfDayTs = (d) => {
   const x = new Date(d);
   return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
};

const ACalendarTrack = memo(function ACalendarTrack({
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
   trackDayGapPx = 24,
   zBase = 0.6,
   debugCanvasEmpty = false,
   isLowSpecDevice = false,
}) {
   const eventsByDay = viewModel?.eventsByDay ?? EMPTY_MAP;
   const standardSlotsByDay = viewModel?.standardSlotsByDay ?? EMPTY_MAP;
   const blackoutKeyMap = viewModel?.blackoutKeyMap || null;
   const blackoutVer = viewModel?.blackoutVer ?? 0;
   const [viewport, setViewport] = useState(() => ({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
   }));
   const viewportRef = useRef({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
   });
   const isPanInteractingRef = useRef(!!isPanInteracting);

   useEffect(() => {
      isPanInteractingRef.current = !!isPanInteracting;
   }, [isPanInteracting]);

   useEffect(() => {
      const el = scrollRef?.current;
      if (!el) return;

      let rafId = null;
      const commit = () => {
         rafId = null;

         const left = el.scrollLeft || 0;
         const top = el.scrollTop || 0;
         const width = el.clientWidth || 0;
         const height = el.clientHeight || 0;

         const isPanNow = !!isPanInteractingRef.current;
         const horizontalSnapStep = 1;
         const verticalSnapStep = 1;
         const snappedLeft =
            horizontalSnapStep > 1
               ? Math.round(left / horizontalSnapStep) * horizontalSnapStep
               : left;
         const snappedTop =
            verticalSnapStep > 1
               ? Math.round(top / verticalSnapStep) * verticalSnapStep
               : top;

         const prev = viewportRef.current;
         const xThreshold = isPanNow ? 1 : 1;
         const yThreshold = isPanNow ? 1 : 1;

         const shouldBumpLeft = Math.abs((prev.left || 0) - snappedLeft) >= xThreshold;
         const shouldBumpTop = Math.abs((prev.top || 0) - snappedTop) >= yThreshold;
         const shouldBumpWidth = Math.abs((prev.width || 0) - width) > 1;
         const shouldBumpHeight = Math.abs((prev.height || 0) - height) > 1;
         if (!shouldBumpLeft && !shouldBumpTop && !shouldBumpWidth && !shouldBumpHeight) {
            return;
         }

         const next = {
            left: snappedLeft,
            top: snappedTop,
            width,
            height,
         };
         viewportRef.current = next;

         const apply = () => {
            setViewport((prevState) => {
               if (
                  prevState.left === next.left &&
                  prevState.top === next.top &&
                  prevState.width === next.width &&
                  prevState.height === next.height
               ) {
                  return prevState;
               }
               return next;
            });
         };
         apply();
      };

      const scheduleCommit = () => {
         if (rafId != null) return;
         rafId = requestAnimationFrame(commit);
      };

      commit();
      el.addEventListener("scroll", scheduleCommit, { passive: true });
      window.addEventListener("resize", scheduleCommit);
      window.addEventListener("orientationchange", scheduleCommit);

      return () => {
         el.removeEventListener("scroll", scheduleCommit);
         window.removeEventListener("resize", scheduleCommit);
         window.removeEventListener("orientationchange", scheduleCommit);
         if (rafId != null) {
            cancelAnimationFrame(rafId);
            rafId = null;
         }
      };
   }, [scrollRef]);

   const sharedLookups = useMemo(() => {
      const usersById = new Map();
      const usersByPhone = new Map();
      const usersByNormName = new Map();
      const instructorUsersByNormName = new Map();
      const instructorsFullById = new Map();
      const carsByInstructorId = new Map();
      const userColorById = new Map();
      const historyUserById = new Map();
      const historyInstructorById = new Map();
      const instructorInitialsById = new Map();

      for (const inst of Array.isArray(instructors) ? instructors : []) {
         const idRaw = inst?.id;
         if (idRaw == null) continue;
         const id = String(idRaw);

         instructorsFullById.set(id, inst);

         const fullName =
            `${inst?.firstName || ""} ${inst?.lastName || ""}`.trim() ||
            String(inst?.name || "").trim();
         if (fullName) {
            historyInstructorById.set(id, fullName);
            const parts = fullName.split(/\s+/).filter(Boolean);
            const initials = parts
               .slice(0, 2)
               .map((p) => String(p || "").charAt(0).toUpperCase())
               .join("");
            if (initials) instructorInitialsById.set(id, initials);
         }
      }

      for (const car of Array.isArray(cars) ? cars : []) {
         const iidRaw = car?.instructorId ?? car?.instructor_id ?? null;
         if (iidRaw == null) continue;
         carsByInstructorId.set(String(iidRaw), car);
      }

      for (const user of Array.isArray(users) ? users : []) {
         const idRaw = user?.id;
         if (idRaw != null) {
            const id = String(idRaw);
            usersById.set(id, user);

            const historyName =
               `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
            if (historyName && !historyUserById.has(id)) {
               historyUserById.set(id, historyName);
            }

            const color = String(
               user?.color ?? user?.profileColor ?? user?.colour ?? "",
            ).trim();
            if (color && !userColorById.has(id)) {
               userColorById.set(id, color);
            }
         }

         const phoneKey = digitsOnly(user?.phone);
         if (phoneKey && !usersByPhone.has(phoneKey)) {
            usersByPhone.set(phoneKey, user);
         }

         const normName = norm(`${user?.firstName ?? ""} ${user?.lastName ?? ""}`);
         if (normName && !usersByNormName.has(normName)) {
            usersByNormName.set(normName, user);
         }
         if (
            normName &&
            String(user?.role ?? "").toUpperCase() === "INSTRUCTOR" &&
            !instructorUsersByNormName.has(normName)
         ) {
            instructorUsersByNormName.set(normName, user);
         }
      }

      const desiredInstructorBadgeByUserId = new Map();
      for (const user of Array.isArray(users) ? users : []) {
         const uidRaw = user?.id;
         if (uidRaw == null) continue;
         const desiredIdRaw = user?.desiredInstructorId;
         if (desiredIdRaw == null) continue;

         const badge = instructorInitialsById.get(String(desiredIdRaw)) || "";
         if (badge) {
            desiredInstructorBadgeByUserId.set(String(uidRaw), badge);
         }
      }

      return {
         usersById,
         usersByPhone,
         usersByNormName,
         instructorUsersByNormName,
         instructorsFullById,
         carsByInstructorId,
         userColorById,
         desiredInstructorBadgeByUserId,
         mapsForHistory: {
            userById: historyUserById,
            instrById: historyInstructorById,
         },
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

   const dayTileEngineRef = useRef(createHorizontalTileEngineState());
   const tileEngineEnabled = !DISABLE_DAY_TILE_ENGINE && !forceAllDaysVisible;
   useEffect(() => {
      if (!tileEngineEnabled) return;
      resetHorizontalTileEngineState(dayTileEngineRef.current);
   }, [tileEngineEnabled, dayEntries.length, baseMetrics.dayWidth]);

   const dayTileWindow = useMemo(() => {
      if (!tileEngineEnabled) {
         return {
            itemsPerTile: 1,
            visibleTiles: null,
         };
      }

      const dayStride = Math.max(
         1,
         Number(baseMetrics.dayWidth || 0) + trackDayGapPx,
      );
      const daysInViewport = Math.max(
         1,
         Math.ceil((Math.max(0, Number(viewport.width) || 0) + 1) / dayStride),
      );

      return computeHorizontalTileWindow(dayTileEngineRef.current, {
         totalItems: dayEntries.length,
         itemWidthPx: dayStride,
         viewportLeft: viewport.left,
         viewportWidth: viewport.width,
         isInteracting: isPanInteracting,
         itemsPerTile: 1,
         baseOverscanTiles: 2,
         panOverscanTiles: isLowSpecDevice ? 3 : 4,
         idlePrefetchTiles: 1,
         panPrefetchTiles: isLowSpecDevice
            ? Math.max(2, Math.min(3, daysInViewport))
            : Math.max(3, Math.min(4, daysInViewport)),
         maxCacheTiles: Math.max(
            isLowSpecDevice ? 12 : 14,
            daysInViewport + (isLowSpecDevice ? 5 : 7),
         ),
         keepAliveMs: isPanInteracting ? 1800 : 1200,
         directionEpsilonPx: 2,
      });
   }, [
      tileEngineEnabled,
      dayEntries.length,
      baseMetrics.dayWidth,
      trackDayGapPx,
      viewport.left,
      viewport.width,
      isPanInteracting,
      isLowSpecDevice,
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
                     gap: `${trackDayGapPx}px`,
                     paddingRight: `${trackDayGapPx}px`,
                     height: "100%",
                  }}
               >
                  {dayEntries.map((entry, dayIdx) => {
                     const { ts, label, dayStartTs, dayEndTs, isGroupA } =
                        entry;
                     const dayOffsetLeft =
                        dayIdx * (baseMetrics.dayWidth + trackDayGapPx);
                     const dayTileIdx = Math.floor(
                        dayIdx / Math.max(1, dayTileWindow.itemsPerTile || 1),
                     );
                     const tileVisible =
                        !tileEngineEnabled ||
                        dayTileWindow.visibleTiles.has(dayTileIdx);
                     const stickyAllowed = !isPanInteracting;
                     const isVisible =
                        tileVisible ||
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
                                 <DayviewCanvasTrack
                                    dayStart={dayStartTs}
                                    dayEnd={dayEndTs}
                                    instructors={dayInstructors}
                                    events={debugCanvasEmpty ? [] : evs}
                                    slots={slots}
                                    dayOffsetLeft={dayOffsetLeft}
                                    viewportScrollLeft={viewport.left}
                                    viewportScrollTop={viewport.top}
                                    viewportWidth={viewport.width}
                                    viewportHeight={viewport.height}
                                    layout={canvasLayout}
                                    timeMarks={timeMarks}
                                    onCreateSlot={handleCreateFromEmpty}
                                    blockedKeyMap={
                                       debugCanvasEmpty
                                          ? null
                                          : isDummyMode
                                            ? null
                                            : blackoutKeyMap
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
                                    zoom={zoom / zBase}
                                    presenceByReservationUsers={
                                       presenceByReservationUsers
                                    }
                                    presenceByReservationColors={
                                       presenceByReservationColors
                                    }
                                    createDraftBySlotColors={
                                       createDraftBySlotColors
                                    }
                                    createDraftBySlotUsers={createDraftBySlotUsers}
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

export default ACalendarTrack;
