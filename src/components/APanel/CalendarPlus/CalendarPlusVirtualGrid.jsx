import React, {
   useCallback,
   useEffect,
   useLayoutEffect,
   useMemo,
   useRef,
   useState,
} from "react";
import { Grid } from "react-window";
import { useDispatch, useSelector } from "react-redux";

import { listenCalendarRefresh } from "../../Utils/calendarBus";
import { openPopup } from "../../Utils/popupStore";

import { fetchInstructors } from "../../../store/instructorsSlice";
import { fetchStudents } from "../../../store/studentsSlice";
import { fetchUsers } from "../../../store/usersSlice";
import { fetchReservationsForMonth } from "../../../store/reservationsSlice";

const START_HOUR = 7;
const END_HOUR = 21;
const STEP_MIN = 30;
const LESSON_MIN = 90;

const ROW_HEIGHT = 42;
const COLUMN_WIDTH = 220;
const GUTTER_WIDTH = 72;
const HEADER_HEIGHT = 54;
const MIN_GRID_HEIGHT = 360;

const SLOT_COUNT = ((END_HOUR - START_HOUR) * 60) / STEP_MIN;

function pad2(n) {
   return String(n).padStart(2, "0");
}

function toYmd(dateLike) {
   const d = new Date(dateLike);
   return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toHm(dateLike) {
   const d = new Date(dateLike);
   return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseFloatingDate(value) {
   if (!value) return null;
   if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value);
   const m = String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
   );
   if (m) {
      const [, Y, Mo, D, h = "0", mi = "0", s = "0"] = m;
      return new Date(+Y, +Mo - 1, +D, +h, +mi, +s, 0);
   }
   const d = new Date(value);
   return Number.isNaN(d.getTime()) ? null : d;
}

function getReservationStartRaw(r) {
   return (
      r?.startTime ??
      r?.start ??
      r?.start_time ??
      r?.dateTime ??
      r?.datetime ??
      r?.date ??
      r?.begin ??
      null
   );
}

function getReservationEndRaw(r) {
   return r?.endTime ?? r?.end ?? r?.end_time ?? r?.finishTime ?? null;
}

function getInstructorId(r) {
   return (
      r?.instructorId ??
      r?.instructor_id ??
      r?.instructor?.id ??
      r?.reservation?.instructorId ??
      null
   );
}

function getUserId(r) {
   return (
      r?.userId ??
      r?.user_id ??
      r?.studentId ??
      r?.student_id ??
      r?.user?.id ??
      r?.student?.id ??
      r?.reservation?.userId ??
      null
   );
}

function getFullName(person) {
   return `${person?.firstName || ""} ${person?.lastName || ""}`.trim();
}

function resolveColorToken(color) {
   const raw = String(color || "--event-default").trim();
   if (!raw) return "var(--event-default)";
   if (raw.startsWith("--")) return `var(${raw})`;
   return raw;
}

function useElementSize() {
   const ref = useRef(null);
   const [size, setSize] = useState({ width: 0, height: 0 });

   useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return undefined;

      const update = () => {
         setSize({
            width: Math.max(0, Math.floor(el.clientWidth || 0)),
            height: Math.max(0, Math.floor(el.clientHeight || 0)),
         });
      };

      update();

      if (typeof ResizeObserver === "undefined") {
         window.addEventListener("resize", update);
         return () => window.removeEventListener("resize", update);
      }

      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
   }, []);

   return [ref, size];
}

function Cell({
   columnIndex,
   rowIndex,
   style,
   instructors,
   eventStartByCell,
   coveredCellSet,
   rowHeight,
   selectedCellKey,
   selectedReservationId,
   onSelectCell,
   onSelectReservation,
}) {

   const instructor = instructors[columnIndex];
   const key = `${instructor.id}|${rowIndex}`;
   const item = eventStartByCell.get(key) || null;
   const covered = coveredCellSet.has(key);
   const isSelectedSlot = selectedCellKey === key;
   const isSelectedReservation =
      item && String(item.reservationId) === String(selectedReservationId || "");

   return (
      <div style={style} className="cpvgrid__cell-wrap">
         <button
            type="button"
            className={
               "cpvgrid__cell" +
               (covered ? " is-covered" : "") +
               (isSelectedSlot ? " is-selected-slot" : "")
            }
            disabled={covered && !item}
            onClick={() => {
               if (item) onSelectReservation(item, key);
               else onSelectCell({ instructorId: instructor.id, slotIndex: rowIndex }, key);
            }}
         >
            {item ? (
               <span
                  className={
                     "cpvgrid__event" +
                     (isSelectedReservation ? " is-selected-reservation" : "")
                  }
                  style={{
                     height: `${Math.max(rowHeight * item.spanSlots - 6, rowHeight - 6)}px`,
                     background: resolveColorToken(item.color),
                  }}
               >
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
               </span>
            ) : (
               <span className="cpvgrid__slot-dot" />
            )}
         </button>
      </div>
   );
}

export default function CalendarPlusVirtualGrid() {
   const dispatch = useDispatch();

   const reservations = useSelector((s) => s.reservations?.list || []);
   const loadingReservations = useSelector((s) => !!s.reservations?.loadingAll);
   const instructors = useSelector((s) => s.instructors?.list || []);
   const students = useSelector((s) => s.students?.list || []);
   const users = useSelector((s) => s.users?.list || []);

   const [selectedDate, setSelectedDate] = useState(() => new Date());
   const [selectedCell, setSelectedCell] = useState(null);
   const [selectedCellKey, setSelectedCellKey] = useState("");
   const [selectedReservationId, setSelectedReservationId] = useState(null);
   const [scrollPos, setScrollPos] = useState({ left: 0, top: 0 });

   const [hostRef, hostSize] = useElementSize();

   const monthKey = useMemo(() => {
      return `${selectedDate.getFullYear()}-${selectedDate.getMonth() + 1}`;
   }, [selectedDate]);

   const loadMonth = useCallback(() => {
      dispatch(fetchReservationsForMonth({ date: selectedDate }));
   }, [dispatch, selectedDate]);

   useEffect(() => {
      dispatch(fetchInstructors());
      dispatch(fetchStudents());
      dispatch(fetchUsers());
   }, [dispatch]);

   useEffect(() => {
      loadMonth();
   }, [loadMonth, monthKey]);

   useEffect(() => {
      const unlisten = listenCalendarRefresh(() => {
         loadMonth();
      });
      return unlisten;
   }, [loadMonth]);

   const instructorsOrdered = useMemo(() => {
      const list = [...(instructors || [])];
      list.sort((a, b) => {
         const oa = Number(a?.order);
         const ob = Number(b?.order);
         if (Number.isFinite(oa) && Number.isFinite(ob) && oa !== ob) return oa - ob;
         return String(getFullName(a)).localeCompare(String(getFullName(b)), "ro");
      });
      return list.map((i) => ({
         id: String(i?.id ?? ""),
         name: getFullName(i) || `Instructor ${i?.id ?? ""}`,
         sector: i?.sector || "Botanica",
         gearbox: String(i?.gearbox || "").toLowerCase().includes("auto")
            ? "Automat"
            : "Manual",
      }));
   }, [instructors]);

   const usersById = useMemo(() => {
      const map = new Map();
      for (const u of students || []) {
         if (u?.id == null) continue;
         map.set(String(u.id), u);
      }
      for (const u of users || []) {
         if (u?.id == null) continue;
         if (!map.has(String(u.id))) map.set(String(u.id), u);
      }
      return map;
   }, [students, users]);

   const dayStart = useMemo(() => {
      const d = new Date(selectedDate);
      d.setHours(START_HOUR, 0, 0, 0);
      return d;
   }, [selectedDate]);
   const dayEnd = useMemo(() => {
      const d = new Date(selectedDate);
      d.setHours(END_HOUR, 0, 0, 0);
      return d;
   }, [selectedDate]);

   const timeLabels = useMemo(() => {
      return Array.from({ length: SLOT_COUNT }, (_, idx) => {
         const t = new Date(dayStart.getTime() + idx * STEP_MIN * 60 * 1000);
         return toHm(t);
      });
   }, [dayStart]);

   const indexed = useMemo(() => {
      const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

      const instructorIds = new Set(instructorsOrdered.map((i) => String(i.id)));
      const eventStartByCell = new Map();
      const coveredCellSet = new Set();
      let eventsCount = 0;

      for (const row of reservations || []) {
         const start = parseFloatingDate(getReservationStartRaw(row));
         if (!start) continue;
         if (toYmd(start) !== toYmd(selectedDate)) continue;

         const instructorId = String(getInstructorId(row) ?? "");
         if (!instructorIds.has(instructorId)) continue;

         const minsFromStart = Math.floor((start.getTime() - dayStart.getTime()) / 60000);
         const slotIndex = Math.floor(minsFromStart / STEP_MIN);
         if (slotIndex < 0 || slotIndex >= SLOT_COUNT) continue;

         const endParsed = parseFloatingDate(getReservationEndRaw(row));
         const end = endParsed && endParsed > start
            ? endParsed
            : new Date(start.getTime() + LESSON_MIN * 60 * 1000);

         const durationMin = Math.max(STEP_MIN, Math.floor((end.getTime() - start.getTime()) / 60000));
         const spanSlots = Math.max(
            1,
            Math.min(SLOT_COUNT - slotIndex, Math.ceil(durationMin / STEP_MIN)),
         );

         const key = `${instructorId}|${slotIndex}`;
         if (eventStartByCell.has(key)) continue;

         const userId = String(getUserId(row) ?? "");
         const user = usersById.get(userId) || row?.user || row?.student || null;
         const title = getFullName(user) || "Elev";
         const subtitle = `${toHm(start)} - ${toHm(end)} • ${String(
            row?.sector || "Sector",
         )}`;

         eventStartByCell.set(key, {
            reservationId: row?.id,
            instructorId,
            slotIndex,
            spanSlots,
            title,
            subtitle,
            color: row?.color || "--event-default",
         });

         for (let i = slotIndex + 1; i < slotIndex + spanSlots; i++) {
            coveredCellSet.add(`${instructorId}|${i}`);
         }

         eventsCount += 1;
      }

      const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();

      return {
         eventStartByCell,
         coveredCellSet,
         eventsCount,
         buildMs: (t1 - t0).toFixed(1),
      };
   }, [dayStart, instructorsOrdered, reservations, selectedDate, usersById]);

   const viewportWidth = Math.max(0, hostSize.width - GUTTER_WIDTH);
   const viewportHeight = Math.max(
      MIN_GRID_HEIGHT,
      hostSize.height - HEADER_HEIGHT,
   );

   const onSelectSlot = useCallback(
      ({ instructorId, slotIndex }, key) => {
         setSelectedReservationId(null);
         setSelectedCell({ instructorId, slotIndex });
         setSelectedCellKey(key);
      },
      [],
   );

   const onSelectReservation = useCallback((item, key) => {
      setSelectedCell(null);
      setSelectedCellKey(key);
      setSelectedReservationId(item?.reservationId || null);

      if (item?.reservationId != null) {
         openPopup("reservationEdit", { reservationId: item.reservationId });
      }
   }, []);

   const openCreateFromSelected = useCallback(() => {
      if (!selectedCell?.instructorId && instructorsOrdered.length) {
         return;
      }
      const instructorId =
         selectedCell?.instructorId || String(instructorsOrdered[0]?.id || "");
      if (!instructorId) return;

      const slotIndex = Number(selectedCell?.slotIndex || 0);
      const start = new Date(dayStart.getTime() + slotIndex * STEP_MIN * 60 * 1000);
      const end = new Date(start.getTime() + LESSON_MIN * 60 * 1000);

      const inst = instructorsOrdered.find((i) => String(i.id) === String(instructorId));
      const sector = inst?.sector || "Botanica";
      const gearbox = inst?.gearbox || "Manual";

      openPopup("createRezervation", {
         start,
         end,
         instructorId,
         sector,
         gearbox,
         initialStartTime: start.toISOString(),
         initialDate: toYmd(start),
         initialTime: toHm(start),
         initialInstructorId: instructorId,
         initialSector: sector,
         initialGearbox: gearbox,
      });
   }, [dayStart, instructorsOrdered, selectedCell]);

   const itemData = useMemo(
      () => ({
         instructors: instructorsOrdered,
         eventStartByCell: indexed.eventStartByCell,
         coveredCellSet: indexed.coveredCellSet,
         rowHeight: ROW_HEIGHT,
         selectedCellKey,
         selectedReservationId,
         onSelectCell: onSelectSlot,
         onSelectReservation,
      }),
      [
         instructorsOrdered,
         indexed.coveredCellSet,
         indexed.eventStartByCell,
         onSelectReservation,
         onSelectSlot,
         selectedCellKey,
         selectedReservationId,
      ],
   );

   return (
      <div className="cpvgrid">
         <header className="cpvgrid__toolbar">
            <div className="cpvgrid__toolbar-left">
               <button
                  type="button"
                  onClick={() => {
                     const d = new Date(selectedDate);
                     d.setDate(d.getDate() - 1);
                     setSelectedDate(d);
                  }}
               >
                  Ziua -1
               </button>
               <button
                  type="button"
                  onClick={() => setSelectedDate(new Date())}
               >
                  Azi
               </button>
               <button
                  type="button"
                  onClick={() => {
                     const d = new Date(selectedDate);
                     d.setDate(d.getDate() + 1);
                     setSelectedDate(d);
                  }}
               >
                  Ziua +1
               </button>
               <input
                  type="date"
                  value={toYmd(selectedDate)}
                  onChange={(e) => {
                     const d = parseFloatingDate(`${e.target.value}T00:00`);
                     if (d) setSelectedDate(d);
                  }}
               />
            </div>

            <div className="cpvgrid__toolbar-right">
               <button type="button" onClick={openCreateFromSelected}>
                  Creează din slot selectat
               </button>
               <span>
                  Instr: {instructorsOrdered.length} | Evenimente: {indexed.eventsCount}
               </span>
               <span>
                  Build: {indexed.buildMs}ms {loadingReservations ? "| Sync..." : ""}
               </span>
            </div>
         </header>

         <div className="cpvgrid__header">
            <div className="cpvgrid__gutter-head">Ora</div>
            <div className="cpvgrid__header-scroll">
               <div
                  className="cpvgrid__header-track"
                  style={{
                     width: `${instructorsOrdered.length * COLUMN_WIDTH}px`,
                     transform: `translateX(${-scrollPos.left}px)`,
                  }}
               >
                  {instructorsOrdered.map((i) => (
                     <div
                        key={i.id}
                        className="cpvgrid__header-cell"
                        style={{ width: `${COLUMN_WIDTH}px` }}
                     >
                        <strong>{i.name}</strong>
                        <small>{i.sector}</small>
                     </div>
                  ))}
               </div>
            </div>
         </div>

         <div className="cpvgrid__body" ref={hostRef}>
            <div className="cpvgrid__gutter">
               <div
                  className="cpvgrid__gutter-track"
                  style={{ transform: `translateY(${-scrollPos.top}px)` }}
               >
                  {timeLabels.map((label) => (
                     <div
                        key={label}
                        className="cpvgrid__gutter-cell"
                        style={{ height: `${ROW_HEIGHT}px` }}
                     >
                        {label}
                     </div>
                  ))}
               </div>
            </div>

            <div className="cpvgrid__grid-wrap">
               {viewportWidth > 0 && viewportHeight > 0 && instructorsOrdered.length > 0 ? (
                  <Grid
                     className="cpvgrid__grid"
                     columnCount={instructorsOrdered.length}
                     rowCount={SLOT_COUNT}
                     columnWidth={COLUMN_WIDTH}
                     rowHeight={ROW_HEIGHT}
                     defaultWidth={viewportWidth}
                     defaultHeight={viewportHeight}
                     style={{ width: viewportWidth, height: viewportHeight }}
                     cellComponent={Cell}
                     cellProps={itemData}
                     onScroll={(e) => {
                        const el = e.currentTarget;
                        setScrollPos({
                           left: Math.max(0, el.scrollLeft || 0),
                           top: Math.max(0, el.scrollTop || 0),
                        });
                     }}
                  />
               ) : (
                  <div className="cpvgrid__empty">
                     {instructorsOrdered.length === 0
                        ? "Nu există instructori încă."
                        : "Se calculează viewport-ul..."}
                  </div>
               )}
            </div>
         </div>

         <footer className="cpvgrid__footer">
            <span>
               Data: {toYmd(selectedDate)} | Interval: {toHm(dayStart)} - {toHm(dayEnd)}
            </span>
            <span>Motor: react-window Virtual Grid</span>
         </footer>
      </div>
   );
}
