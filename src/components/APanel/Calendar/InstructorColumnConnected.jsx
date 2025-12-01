// src/components/APanel/Calendar/InstructorColumnConnected.jsx
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

const MOLDOVA_TZ = "Europe/Chisinau";

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
   instructorMeta,
   instructorsGroups,
   onOpenReservation,
   onCreateFromEmpty,
   blockedKeySet,
   blackoutVer, // doar pentru memo
   isHydrating, // vine din ACalendarOptimized (true = evenimentele sunt încă skeleton)
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

   const slotList = Array.isArray(slots) ? slots : [];
   const eventsToRender = isPad ? [] : Array.isArray(events) ? events : [];

   const privateMsg = (instructorUser?.privateMessage ?? "").toString();
   const todaysText = useMemo(
      () => getNoteForDate(privateMsg, day.date),
      [privateMsg, day.date]
   );

   const [isEditing, setIsEditing] = useState(false);
   const [inputText, setInputText] = useState("");
   const inputRef = useRef(null);

   const openEditor = useCallback(() => {
      if (isPad) return;
      setInputText(todaysText || "");
      setIsEditing(true);
   }, [isPad, todaysText]);

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

   const keyFromDateMD = (dateLike) => {
      const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
      const dayStr = new Intl.DateTimeFormat("en-CA", {
         timeZone: MOLDOVA_TZ,
         year: "numeric",
         month: "2-digit",
         day: "2-digit",
      }).format(d);
      const hm = new Intl.DateTimeFormat("en-GB", {
         timeZone: MOLDOVA_TZ,
         hour: "2-digit",
         minute: "2-digit",
         hour12: false,
      }).format(d);
      return `${dayStr}|${hm}`;
   };

   const sectorNormVal =
      meta?.sectorNorm ??
      norm(
         instrFull?.sector ?? fromGroups?.sector ?? fromGroups?.location ?? ""
      );
   const sectorSlug = sectorNormVal ? sectorNormVal.replace(/\s+/g, "-") : "";
   const sectorClass = !isPad && sectorSlug ? ` instr-${sectorSlug}` : "";

   const colClasses =
      `dayview__event-col` +
      (isPad ? " dayview__event-col--pad" : "") +
      sectorClass +
      (isHydrating && !isPad ? " dayview__event-col--hydrating" : "");

   return (
      <div
         className={colClasses}
         style={{
            "--visible-slots": slotList.length,
         }}
         data-colid={`${day.id}-${inst.id}`}
         data-dayid={day.id}
         data-sector={sectorSlug || undefined}
      >
         {/* HEADER – se vede mereu, fără skeleton */}
         <div
            className="dayview__column-head"
            style={{ position: "relative", cursor: isPad ? "default" : "text" }}
            onDoubleClick={(e) => {
               e.stopPropagation();
               openEditor();
            }}
         >
            <div className="dv-inst-name">
               {displayName || "\u00A0"}

               {!isEditing && todaysText && (
                  <span className="dv-inst-notes">
                     {" "}
                     {" / "}
                     {todaysText}
                  </span>
               )}
            </div>

            {!isEditing && (
               <div className="dv-inst-plate">
                  {displayPlate}
                  {displayInstPhone ? (
                     <>
                        {" • "}
                        {displayInstPhone}
                     </>
                  ) : null}
               </div>
            )}

            {isEditing && (
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

         {/* BODY – când e hydrating → doar blocuri gri, cu animație la nivel de coloană */}
         {slotList.map((slot, sIdx) => {
            const cellKey = `${day.id}-${inst?.id}-${slot.start.getTime()}`;

            if (isHydrating || isPad) {
               return (
                  <div
                     key={cellKey}
                     className="dv-slot dv-slot--skeleton"
                     style={{ gridRow: sIdx + 2 }}
                  />
               );
            }

            const ev = (eventsToRender || []).find(
               (e) =>
                  Math.max(e.start.getTime(), slot.start.getTime()) <
                  Math.min(e.end.getTime(), slot.end.getTime())
            );

            const isSlotBlackout =
               !!blockedKeySet && blockedKeySet.has(keyFromDateMD(slot.start));
            const isEventBlackout =
               !!blockedKeySet &&
               ev &&
               blockedKeySet.has(keyFromDateMD(ev.start));

            return (
               <div
                  key={cellKey}
                  className="dv-slot"
                  style={{ gridRow: sIdx + 2 }}
               >
                  {ev ? (
                     <EventCard
                        ev={ev}
                        onOpenReservation={onOpenReservation}
                        isBlackout={!!isEventBlackout}
                     />
                  ) : (
                     <EmptySlot
                        slot={slot}
                        onCreate={() =>
                           onCreateFromEmpty?.({
                              start: slot.start,
                              end: slot.end,
                              instructorId: String(inst.id),
                              groupId: null,
                              sector: "",
                           })
                        }
                        isBlackout={!!isSlotBlackout}
                     />
                  )}
               </div>
            );
         })}
      </div>
   );
}

export default React.memo(InstructorColumnConnected);
