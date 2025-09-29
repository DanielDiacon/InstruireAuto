// src/components/Calendar/Day/InstructorColumn.jsx
import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import EventCard from "./EventCard";
import EmptySlot from "./EmptySlot";
import { updateInstructorWithUser } from "../../../store/instructorsSlice";

function InstructorColumn({
  day, inst, events, slots, editMode,
  instructorMeta, instructorsGroups, highlightTokens, tokens,
  getOrderStringForInst, getPosGeneric, getDayOnlyPos, nudgeInstructor,
  rowIdxLocal, colIdx, rowsCount, swapColumnsForDay,
  onOpenReservation, onCreateFromEmpty,
}) {
  const dispatch = useDispatch();

  const isPad = String(inst?.id || "").startsWith("__pad_");
  const meta = isPad ? null : instructorMeta.get(String(inst.id)) || null;

  const cars = useSelector((s) => s.cars?.list ?? [], shallowEqual);
  const allInstructors = useSelector((s) => s.instructors?.list ?? [], shallowEqual);
  const allUsers = useSelector((s) => s.users?.list ?? [], shallowEqual);

  const instrFull = useMemo(
    () => allInstructors.find((x) => String(x.id) === String(inst?.id)) || null,
    [allInstructors, inst?.id]
  );

  const userForInstr = useMemo(() => {
    const uid = instrFull?.userId;
    if (!uid) return null;
    return allUsers.find((u) => String(u.id) === String(uid)) || null;
  }, [allUsers, instrFull?.userId]);

  const carForInst = useMemo(() => {
    if (isPad) return null;
    const iid = String(inst?.id ?? "");
    return (
      cars.find((c) =>
        String(
          c.instructorId ??
            c.instructor_id ??
            c.instructor ??
            c.instructorIdFk ??
            ""
        ) === iid
      ) || null
    );
  }, [cars, inst?.id, isPad]);

  const fromGroups = useMemo(() => {
    return (instructorsGroups || [])
      .flatMap((g) => g.instructors || [])
      .find((i) => String(i.id) === String(inst.id));
  }, [instructorsGroups, inst?.id]);

  const displayName = isPad
    ? ""
    : inst?.name?.trim() ||
      `${fromGroups?.firstName ?? fromGroups?.name ?? ""} ${fromGroups?.lastName ?? ""}`.trim() ||
      "–";

  const displayPlate = isPad
    ? ""
    : (
        carForInst?.plateNumber ??
        carForInst?.plate ??
        carForInst?.number ??
        meta?.plateRaw ??
        ""
      )
        .toString()
        .trim();

  const displayInstPhone = isPad ? "" : (meta?.phoneDigits || "").trim();
  const eventsToRender = isPad ? [] : events;

  // ===== Înlocuitor în user.privateMessage (doar în mod normal) =====
  const currentPrivateMsg = (userForInstr?.privateMessage ?? "").toString();
  const existingSubstName = useMemo(() => {
    const m = /Înlocuitor:\s*([^\n]+)/i.exec(currentPrivateMsg || "");
    return m ? m[1].trim() : "";
  }, [currentPrivateMsg]);

  const [isSubstEditing, setIsSubstEditing] = useState(false);
  const [substText, setSubstText] = useState("");
  const inputRef = useRef(null);

  const openSubstEditor = useCallback(() => {
    if (isPad || editMode) return;
    setSubstText(existingSubstName || "");
    setIsSubstEditing(true);
  }, [existingSubstName, isPad, editMode]);

  useEffect(() => {
    if (isSubstEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isSubstEditing]);

  const buildNewPrivateMessage = useCallback(
    (val) => {
      let next = (currentPrivateMsg || "").replace(
        /(^|\n)\s*Înlocuitor:[^\n]*\n?/gi,
        "$1"
      );
      next = next.trim();
      if (val && val.trim()) {
        next = (next ? next + "\n" : "") + `Înlocuitor: ${val.trim()}`;
      }
      return next;
    },
    [currentPrivateMsg]
  );

  const saveSubstitute = useCallback(async () => {
    const newPM = buildNewPrivateMessage(substText);
    try {
      await dispatch(
        updateInstructorWithUser({
          id: inst.id,
          data: { privateMessage: newPM || null },
        })
      );
    } finally {
      setIsSubstEditing(false);
    }
  }, [dispatch, inst?.id, substText, buildNewPrivateMessage]);

  const cancelSubstitute = useCallback(() => {
    setIsSubstEditing(false);
    setSubstText(existingSubstName || "");
  }, [existingSubstName]);

  // ===== Poziții grilă + săgeți =====
  const currentOrder = getOrderStringForInst(inst.id);
  const dayOnlyPos = getDayOnlyPos
    ? getDayOnlyPos(currentOrder, day.date)
    : getPosGeneric(currentOrder, day.date);
  const curPos = dayOnlyPos || { x: colIdx + 1, y: rowIdxLocal + 1 };

  const canLeft = curPos.x > 1;
  const canRight = curPos.x < 3;
  const canUp = curPos.y > 1;
  const canDown = curPos.y < rowsCount;

  const nudge = (dx, dy) =>
    nudgeInstructor(inst.id, day.date, dx, dy, colIdx + 1, rowIdxLocal + 1, rowsCount, 3);

  const swapColLeft = (e) => {
    e.stopPropagation();
    if (!canLeft) return;
    swapColumnsForDay?.(day.date, curPos.x, curPos.x - 1, 3);
  };
  const swapColRight = (e) => {
    e.stopPropagation();
    if (!canRight) return;
    swapColumnsForDay?.(day.date, curPos.x, curPos.x + 1, 3);
  };

  return (
    <div
      className={`dayview__event-col${isPad ? " dayview__event-col--pad" : ""}`}
      style={{ "--event-h": `var(--event-h)`, "--visible-slots": slots.length }}
      data-colid={`${day.id}-${inst.id}`}
      data-dayid={day.id}
    >
      <div
        className="dayview__column-head"
        style={{ position: "relative", cursor: isPad ? "default" : "text" }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          openSubstEditor();
        }}
      >
        <div className="dv-inst-name">
          {highlightTokens(displayName, tokens) || "\u00A0"}
        </div>

        {!isSubstEditing && (
          <>
            {existingSubstName ? (
              <div className="dv-inst-name">
                {highlightTokens(existingSubstName, tokens)}
              </div>
            ) : null}

            <div className="dv-inst-plate">
              {highlightTokens(displayPlate, tokens) || "\u00A0"}
              {displayInstPhone ? (
                <>
                  {" • "}
                  {highlightTokens(displayInstPhone, tokens)}
                </>
              ) : null}
            </div>
          </>
        )}

        {isSubstEditing && !editMode && (
          <input
            ref={inputRef}
            className="dv-subst-input"
            placeholder="Scrie numele înlocuitorului"
            value={substText}
            onChange={(e) => setSubstText(e.target.value)}
            onBlur={saveSubstitute}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveSubstitute();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelSubstitute();
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>

      {editMode && !isPad && (
        <div
          className="dv-move-pad"
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <span />
          <button type="button" title="Sus" disabled={!canUp} onClick={() => nudge(0, -1)}>↑</button>
          <span />

          <button type="button" title="Stânga (schimbă cu vecinul)" disabled={!canLeft} onClick={() => nudge(-1, 0)}>←</button>
          <span />
          <button type="button" title="Dreapta (schimbă cu vecinul)" disabled={!canRight} onClick={() => nudge(1, 0)}>→</button>

          <span />
          <button type="button" title="Jos" disabled={!canDown} onClick={() => nudge(0, 1)}>↓</button>
          <span />

          <button type="button" title="Schimbă cu toată coloana din stânga" disabled={!canLeft} onClick={swapColLeft}>«</button>
          <span />
          <button type="button" title="Schimbă cu toată coloana din dreapta" disabled={!canRight} onClick={swapColRight}>»</button>
          <span />
        </div>
      )}

      {!editMode &&
        slots.map((slot, sIdx) => {
          const ev = eventsToRender.find(
            (e) =>
              Math.max(e.start.getTime(), slot.start.getTime()) <
              Math.min(e.end.getTime(), slot.end.getTime())
          );
          const cellKey = `${day.id}-${inst?.id}-${slot.start.getTime()}`;
          return (
            <div key={cellKey} className="dv-slot" style={{ gridRow: sIdx + 2, height: "var(--event-h)" }}>
              {ev ? (
                <EventCard
                  ev={ev}
                  editMode={editMode}
                  highlightTokens={highlightTokens}
                  tokens={tokens}
                  onOpenReservation={onOpenReservation}
                />
              ) : (
                <EmptySlot
                  slot={slot}
                  onCreate={() =>
                    !isPad &&
                    !editMode &&
                    onCreateFromEmpty({
                      start: slot.start,
                      end: slot.end,
                      instructorId: String(inst.id),
                      groupId: String(inst.id),
                      sector: "",
                    })
                  }
                />
              )}
            </div>
          );
        })}
    </div>
  );
}

export default React.memo(InstructorColumn);
