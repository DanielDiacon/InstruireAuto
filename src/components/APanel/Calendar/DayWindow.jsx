// src/components/Calendar/Day/DayWindow.jsx
import React from "react";
import DaySection from "./DaySection";

export default function DayWindow({
  visibleDays,
  winStart,
  WINDOW,
  DAY_W,
  DAY_GAP,
  maxColsPerGroup,
  COL_W,
  metrics,
  ROW_GAP,
  toRowsOfN,
  buildUiDay,
  mkStandardSlotsForDay,
  instructorMeta,
  instructorsGroups,
  editMode,
  getDayOnlyPos,
  highlightTokens,
  tokens,
  getOrderStringForInst,
  swapColumnsForDay,
  getPosGeneric,
  nudgeInstructor,
  onOpenReservation,
  onCreateFromEmpty,
}) {
  return (
    <div
      className="dv-window"
      style={{
        position: "absolute",
        left: `${winStart * DAY_W}px`,
        top: 0,
        display: "flex",
        gap: `${DAY_GAP}px`,
        width: `${WINDOW * DAY_W - DAY_GAP}px`,
        willChange: "transform",
        transform: "translateZ(0)",
      }}
    >
      {Array.from({ length: WINDOW }).map((_, slotIdx) => {
        const dayIdx = winStart + slotIdx;
        const inRange = dayIdx >= 0 && dayIdx < visibleDays.length;
        return (
          <div key={`wslot-${slotIdx}`} style={{ flex: "0 0 auto", width: `${DAY_W - 20}px` }}>
            {inRange ? (() => {
              const d = visibleDays[dayIdx];
              const day = buildUiDay(d);
              const instList = day.instructors || [];
              const rows = toRowsOfN(instList, maxColsPerGroup, true);

              return (
                <DaySection
                  day={day}
                  rows={rows}
                  maxColsPerGroup={maxColsPerGroup}
                  COL_W={COL_W}
                  metrics={metrics}
                  ROW_GAP={ROW_GAP}
                  mkStandardSlotsForDay={mkStandardSlotsForDay}
                  instructorMeta={instructorMeta}
                  instructorsGroups={instructorsGroups}
                  getDayOnlyPos={getDayOnlyPos}
                  editMode={editMode}
                  highlightTokens={highlightTokens}
                  tokens={tokens}
                  swapColumnsForDay={swapColumnsForDay}
                  getOrderStringForInst={getOrderStringForInst}
                  getPosGeneric={getPosGeneric}
                  nudgeInstructor={nudgeInstructor}
                  onOpenReservation={onOpenReservation}
                  onCreateFromEmpty={onCreateFromEmpty}
                />
              );
            })() : null}
          </div>
        );
      })}
    </div>
  );
}
