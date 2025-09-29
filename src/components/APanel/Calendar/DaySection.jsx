// src/components/Calendar/Day/DaySection.jsx
import React, { useMemo } from "react";
import InstructorColumn from "./InstructorColumn";

export default function DaySection(props) {
  const {
    day, rows, maxColsPerGroup, COL_W, metrics, ROW_GAP,
    mkStandardSlotsForDay, instructorMeta, instructorsGroups,
    editMode, highlightTokens, swapColumnsForDay, tokens,
    getOrderStringForInst, getPosGeneric, getDayOnlyPos,
    nudgeInstructor, onOpenReservation, onCreateFromEmpty,
  } = props;

  const cols = maxColsPerGroup;
  const slots = mkStandardSlotsForDay(day.date);

  const shortTitle = useMemo(() => {
    const raw = new Intl.DateTimeFormat("ro-RO", {
      weekday: "short", day: "2-digit", month: "short",
    }).format(new Date(day.date));
    return raw.replace(",", "");
  }, [day.date]);

  return (
    <section
      className="dayview__group-wrap"
      style={{
        "--cols": cols,
        "--colw": `calc(${COL_W})`,
        width: `${metrics.dayWidth + 12}px`,
        flex: "0 0 auto",
      }}
      aria-label={shortTitle}
      data-dayid={day.id}
      data-active="1"
    >
      <header className="dayview__group-header">
        <div className="dayview__group-title">{shortTitle}</div>
      </header>

      {rows.map((row, rowIdxLocal) => (
        <div key={`${day.id}__block__${rowIdxLocal}`} className="dayview__block" style={{ marginTop: rowIdxLocal ? ROW_GAP : 0 }}>
          <div className="dayview__group-content dayview__group-content--row">
            <div className="dayview__columns" style={{ "--cols": 3 }}>
              {row.map(({ inst, events }, colIdx) => (
                <InstructorColumn
                  key={`${day.id}-${inst.id}`}
                  day={day}
                  inst={inst}
                  events={events}
                  slots={slots}
                  editMode={editMode}
                  instructorMeta={instructorMeta}
                  instructorsGroups={instructorsGroups}
                  highlightTokens={highlightTokens}
                  tokens={tokens}
                  getOrderStringForInst={getOrderStringForInst}
                  getPosGeneric={getPosGeneric}
                  swapColumnsForDay={swapColumnsForDay}
                  getDayOnlyPos={getDayOnlyPos}
                  nudgeInstructor={nudgeInstructor}
                  rowIdxLocal={rowIdxLocal}
                  colIdx={colIdx}
                  rowsCount={day.rowsCount}
                  onOpenReservation={onOpenReservation}
                  onCreateFromEmpty={onCreateFromEmpty}
                />
              ))}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
