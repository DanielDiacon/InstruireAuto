import React, {
   useMemo,
   useState,
   useCallback,
   useRef,
   useEffect,
} from "react";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import EventCard from "./EventCard";
import EmptySlot from "./EmptySlot";
import { updateUser } from "../../../store/usersSlice";

const digits = (s = "") => String(s).replace(/\D+/g, "");
const norm = (s = "") =>
   s
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

const ymd = (d) => {
   const dt = d instanceof Date ? d : new Date(d);
   const Y = dt.getFullYear();
   const M = String(dt.getMonth() + 1).padStart(2, "0");
   const D = String(dt.getDate()).padStart(2, "0");
   return `${Y}-${M}-${D}`;
};

function extractCanonLines(pm = "") {
   const lines = String(pm || "").split(/\r?\n/);
   const out = [];
   for (const raw of lines) {
      const s = raw.trim();
      if (!s) continue;
      const m = /^\[(\d{4})-(\d{2})-(\d{2})]\s*(.*)$/.exec(s);
      if (m) {
         out.push({
            dateStr: `${m[1]}-${m[2]}-${m[3]}`,
            text: m[4] || "",
            raw,
         });
      }
   }
   return out;
}
function getNoteForDate(pm, dateObj) {
   const target = ymd(dateObj);
   const all = extractCanonLines(pm);
   const hit = all.find((x) => x.dateStr === target);
   return hit ? hit.text : "";
}
function upsertNoteForDate(pm, dateObj, newText) {
   const target = ymd(dateObj);
   const lines = String(pm || "").split(/\r?\n/);
   const kept = lines.filter((raw) => {
      const s = raw.trim();
      if (!s) return false;
      const m = /^\[(\d{4})-(\d{2})-(\d{2})]/.exec(s);
      if (m) {
         const k = `${m[1]}-${m[2]}-${m[3]}`;
         return k !== target;
      }
      return true;
   });
   const base = kept.join("\n").trim();
   if (!newText || !newText.trim()) return base;
   const canon = `[${target}] ${newText.trim()}`;
   return (base ? base + "\n" : "") + canon;
}

function InstructorColumnConnected({
   day,
   inst,
   events,
   slots,
   editMode,
   instructorMeta,
   instructorsGroups,
   highlightTokens,
   tokens,
   getOrderStringForInst,
   getPosGeneric,
   getDayOnlyPos,
   nudgeInstructor,
   rowIdxLocal,
   colIdx,
   rowsCount,
   onOpenReservation,
   onCreateFromEmpty,
}) {
   const dispatch = useDispatch();

   const isPad = String(inst?.id || "").startsWith("__pad_");
   const meta = isPad ? null : instructorMeta.get(String(inst.id)) || null;

   const cars = useSelector((s) => s.cars?.list ?? [], shallowEqual);
   const allInstructors = useSelector(
      (s) => s.instructors?.list ?? [],
      shallowEqual
   );
   const allUsers = useSelector((s) => s.users?.list ?? [], shallowEqual);

   const instrFull = useMemo(
      () =>
         allInstructors.find((x) => String(x.id) === String(inst?.id)) || null,
      [allInstructors, inst?.id]
   );

   const instructorUser = useMemo(() => {
      if (!instrFull) return null;
      const directUid = instrFull.userId ?? instrFull.user_id;
      if (directUid != null) {
         const byId = allUsers.find((u) => String(u.id) === String(directUid));
         if (byId) return byId;
      }
      const phoneKey = digits(instrFull.phone ?? instrFull.phoneNumber ?? "");
      if (phoneKey) {
         const byPhone = allUsers.find(
            (u) =>
               String(u.role ?? "").toUpperCase() === "INSTRUCTOR" &&
               digits(u.phone ?? "") === phoneKey
         );
         if (byPhone) return byPhone;
      }
      const nameKey = norm(
         `${instrFull.firstName ?? ""} ${instrFull.lastName ?? ""}`
      );
      return (
         allUsers.find(
            (u) =>
               String(u.role ?? "").toUpperCase() === "INSTRUCTOR" &&
               norm(`${u.firstName ?? ""} ${u.lastName ?? ""}`) === nameKey
         ) || null
      );
   }, [instrFull, allUsers]);

   const carForInst = useMemo(() => {
      if (isPad) return null;
      const iid = String(inst?.id ?? "");
      return (
         cars.find(
            (c) =>
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
        `${fromGroups?.firstName ?? fromGroups?.name ?? ""} ${
           fromGroups?.lastName ?? ""
        }`.trim() ||
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

   const eventsToRender = isPad ? [] : Array.isArray(events) ? events : [];
   const slotList = Array.isArray(slots) ? slots : [];

   const privateMsg = (instructorUser?.privateMessage ?? "").toString();
   const todaysText = useMemo(
      () => getNoteForDate(privateMsg, day.date),
      [privateMsg, day.date]
   );

   const [isEditing, setIsEditing] = useState(false);
   const [inputText, setInputText] = useState("");
   const inputRef = useRef(null);

   const openEditor = useCallback(() => {
      if (isPad || editMode) return;
      setInputText(todaysText || "");
      setIsEditing(true);
   }, [isPad, editMode, todaysText]);

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
      const nextPM = upsertNoteForDate(privateMsg, day.date, inputText);
      try {
         await dispatch(
            updateUser({
               id: String(instructorUser.id),
               data: { privateMessage: nextPM },
            })
         );
      } finally {
         setIsEditing(false);
      }
   }, [dispatch, instructorUser?.id, privateMsg, day.date, inputText]);

   const cancelEdit = useCallback(() => {
      setIsEditing(false);
      setInputText(todaysText || "");
   }, [todaysText]);

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
      nudgeInstructor(
         inst.id,
         day.date,
         dx,
         dy,
         colIdx + 1,
         rowIdxLocal + 1,
         rowsCount,
         3
      );

   const isHydrating = day && day.hydrated === false;

   const safeHighlight = (txt) =>
      (typeof highlightTokens === "function" ? highlightTokens(txt) : txt) ||
      "\u00A0";

   return (
      <div
         className={`dayview__event-col${
            isPad ? " dayview__event-col--pad" : ""
         }`}
         style={{
            "--event-h": `var(--event-h)`,
            "--visible-slots": slotList.length,
         }}
         data-colid={`${day.id}-${inst.id}`}
         data-dayid={day.id}
      >
         <div
            className="dayview__column-head"
            style={{ position: "relative", cursor: isPad ? "default" : "text" }}
            onDoubleClick={(e) => {
               e.stopPropagation();
               openEditor();
            }}
         >
            <div className="dv-inst-name">{safeHighlight(displayName)}</div>

            {!isEditing && todaysText && (
               <div className="dv-inst-notes">
                  <div className="dv-inst-note-line">
                     {safeHighlight(todaysText)}
                  </div>
               </div>
            )}

            {!isEditing && (
               <div className="dv-inst-plate">
                  {safeHighlight(displayPlate)}
                  {displayInstPhone ? (
                     <>
                        {" • "}
                        {safeHighlight(displayInstPhone)}
                     </>
                  ) : null}
               </div>
            )}

            {isEditing && !editMode && (
               <input
                  ref={inputRef}
                  className="dv-subst-input"
                  placeholder="Nota pentru această zi"
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

         {editMode && !isPad && (
            <div
               className="dv-move-pad"
               onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
               }}
               onPointerMove={(e) => e.stopPropagation()}
               onPointerUp={(e) => e.stopPropagation()}
               onClick={(e) => e.stopPropagation()}
               onWheel={(e) => e.stopPropagation()}
            >
               <span />
               <button
                  type="button"
                  title="Sus"
                  disabled={!canUp}
                  onClick={() => nudge(0, -1)}
               >
                  ↑
               </button>
               <span />
               <button
                  type="button"
                  title="Stânga (schimbă cu vecinul)"
                  disabled={!canLeft}
                  onClick={() => nudge(-1, 0)}
               >
                  ←
               </button>
               <span />
               <button
                  type="button"
                  title="Dreapta (schimbă cu vecinul)"
                  disabled={!canRight}
                  onClick={() => nudge(1, 0)}
               >
                  →
               </button>
               <span />
               <button
                  type="button"
                  title="Jos"
                  disabled={!canDown}
                  onClick={() => nudge(0, 1)}
               >
                  ↓
               </button>
               <span />
            </div>
         )}

         {!editMode &&
            slotList.map((slot, sIdx) => {
               const cellKey = `${day.id}-${inst?.id}-${slot.start.getTime()}`;
               if (isHydrating || isPad) {
                  return (
                     <div
                        key={cellKey}
                        className="dv-slot"
                        style={{ gridRow: sIdx + 2, height: "var(--event-h)" }}
                     >
                        <div className="dv-skel-bar" />
                     </div>
                  );
               }

               const ev = (eventsToRender || []).find(
                  (e) =>
                     Math.max(e.start.getTime(), slot.start.getTime()) <
                     Math.min(e.end.getTime(), slot.end.getTime())
               );

               return (
                  <div
                     key={cellKey}
                     className="dv-slot"
                     style={{ gridRow: sIdx + 2, height: "var(--event-h)" }}
                  >
                     {ev ? (
                        <EventCard
                           ev={ev}
                           editMode={editMode}
                           highlightTokens={highlightTokens}
                           onOpenReservation={onOpenReservation}
                        />
                     ) : (
                        <EmptySlot
                           slot={slot}
                           onCreate={() =>
                              !editMode &&
                              onCreateFromEmpty?.({
                                 start: slot.start,
                                 end: slot.end,
                                 instructorId: String(inst.id),
                                 groupId: null,
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

export default React.memo(InstructorColumnConnected);
