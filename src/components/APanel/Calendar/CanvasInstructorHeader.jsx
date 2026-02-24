import React, {
   memo,
   useCallback,
   useEffect,
   useMemo,
   useRef,
   useState,
} from "react";
import { useDispatch } from "react-redux";

import { updateUser } from "../../../store/usersSlice";
import { getNoteForDate, norm, upsertNoteForDate } from "./utils";

const GAPCOL_PREFIX = "__gapcol_";

const isGapCol = (instOrId) => {
   const id =
      typeof instOrId === "string" ? instOrId : String(instOrId?.id ?? "");
   return !!instOrId?._isGapColumn || (id && id.startsWith(GAPCOL_PREFIX));
};

const CanvasInstructorHeader = memo(
   function CanvasInstructorHeader({
      inst,
      dayDate,
      sectorClassName,
      style,
      carsByInstructorId,
      instructorsFullById,
      usersById,
      instructorUsersByNormName,
      zoom = 1,
   }) {
      const dispatch = useDispatch();

      const instrFull = useMemo(() => {
         const iid = inst?.id != null ? String(inst.id) : "";
         if (iid && instructorsFullById?.has(iid)) {
            return instructorsFullById.get(iid);
         }
         return inst || null;
      }, [instructorsFullById, inst]);

      const instructorUser = useMemo(() => {
         if (!instrFull) return null;

         const directUid =
            instrFull.userId ?? instrFull.user_id ?? instrFull.user?.id ?? null;

         const roleInstr = (u) =>
            String(u.role ?? "").toUpperCase() === "INSTRUCTOR";

         if (directUid != null) {
            const byId = usersById?.get?.(String(directUid));
            if (byId && roleInstr(byId)) return byId;
         }

         const nameKey = norm(
            `${instrFull.firstName ?? ""} ${instrFull.lastName ?? ""}`,
         );
         if (!nameKey) return null;

         const byName = instructorUsersByNormName?.get?.(nameKey) || null;
         return byName && roleInstr(byName) ? byName : null;
      }, [instrFull, usersById, instructorUsersByNormName]);

      const carForInst = useMemo(() => {
         const iid = String(inst?.id ?? "");
         if (!iid) return null;
         return carsByInstructorId?.get?.(iid) || null;
      }, [carsByInstructorId, inst]);

      const displayName = useMemo(() => {
         if (!instrFull && !inst) return "–";

         const v =
            `${instrFull?.firstName ?? ""} ${instrFull?.lastName ?? ""}`.trim();
         if (v) return v;
         if (inst?.name && inst.name.trim()) return inst.name.trim();
         return "–";
      }, [inst, instrFull]);

      const displayPlate = useMemo(() => {
         if (!carForInst) return "";
         return (carForInst.plateNumber ?? "").toString().trim();
      }, [carForInst]);

      const privateMsg = (instructorUser?.privateMessage ?? "").toString();
      const todaysText = useMemo(
         () => getNoteForDate(privateMsg, dayDate),
         [privateMsg, dayDate],
      );
      const metaText = useMemo(() => {
         const plate = (displayPlate || "").trim();
         const subst = (todaysText || "").trim();
         if (plate && subst) return `${plate} • ${subst}`;
         if (plate) return plate;
         if (subst) return subst;
         return "—";
      }, [displayPlate, todaysText]);

      const [isEditing, setIsEditing] = useState(false);
      const [inputText, setInputText] = useState("");
      const inputRef = useRef(null);

      const isPad = String(inst?.id || "").startsWith("__pad_");
      const padLabel =
         isPad && inst?.name && inst.name.trim()
            ? inst.name.trim()
            : isPad
              ? String(inst?.id || "") === "__pad_1"
                 ? "Anulari"
                 : "Asteptari"
              : null;

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
         const nextPM = upsertNoteForDate(privateMsg, dayDate, inputText);
         try {
            await dispatch(
               updateUser({
                  id: String(instructorUser.id),
                  data: { privateMessage: nextPM },
               }),
            );
         } finally {
            setIsEditing(false);
         }
      }, [dispatch, instructorUser?.id, privateMsg, dayDate, inputText]);

      const cancelEdit = useCallback(() => {
         setIsEditing(false);
         setInputText(todaysText || "");
      }, [todaysText]);

      if (!inst) return null;
      const isGap = isGapCol(inst);

      if (isGap) {
         return (
            <div
               className="dayview__column-head dv-canvas-header dv-canvas-header--gap"
               style={{
                  position: "absolute",
                  boxSizing: "border-box",
                  pointerEvents: "none",
                  ...style,
               }}
            />
         );
      }

      const z = zoom || 1;
      const headerFontSize = 13 * z;
      const plateFontSize = 11 * z;
      const inputFontSize = 12 * z;
      const paddingTop = 8 * z;
      const paddingSides = 10 * z;
      const paddingBottom = 4 * z;
      const gapPx = 2 * z;

      if (isPad) {
         return (
            <div
               className="dayview__column-head dv-canvas-header dv-canvas-header--pad"
               style={{
                  position: "absolute",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: `${paddingTop}px ${paddingSides}px ${paddingBottom}px`,
                  pointerEvents: "none",
                  color: "var(--white-p)",
                  lineHeight: 1.15,
                  textAlign: "center",
                  ...style,
               }}
            >
               <div
                  className="dv-inst-name"
                  style={{
                     fontWeight: 600,
                     fontSize: `${headerFontSize}px`,
                     lineHeight: 1.15,
                     width: "100%",
                  }}
               >
                  {padLabel || "\u00A0"}
               </div>
            </div>
         );
      }

      return (
         <div
            className={
               "dayview__column-head dv-canvas-header" +
               (sectorClassName ? " " + sectorClassName : "")
            }
            style={{
               position: "absolute",
               boxSizing: "border-box",
               display: "flex",
               flexDirection: "column",
               alignItems: "flex-start",
               justifyContent: "flex-start",
               padding: `${paddingTop}px ${paddingSides}px ${paddingBottom}px`,
               gap: gapPx,
               cursor: "text",
               pointerEvents: "auto",
               color: "var(--white-p)",
               lineHeight: 1.15,
               ...style,
            }}
            onDoubleClick={(e) => {
               e.stopPropagation();
               openEditor();
            }}
         >
            <div
               className="dv-inst-name"
               style={{
                  fontWeight: 500,
                  fontSize: `${headerFontSize}px`,
                  lineHeight: 1.15,
               }}
            >
               {displayName || "\u00A0"}
            </div>

            {!isEditing ? (
               <div
                  className="dv-inst-meta"
                  style={{
                     fontSize: `${plateFontSize}px`,
                     lineHeight: 1.2,
                     opacity: metaText === "—" ? 0.55 : 0.9,
                     width: "100%",
                     minHeight: `${plateFontSize * 1.2 * 2}px`,
                     overflow: "hidden",
                     display: "-webkit-box",
                     WebkitBoxOrient: "vertical",
                     WebkitLineClamp: 2,
                     wordBreak: "break-word",
                  }}
                  title={metaText === "—" ? "" : metaText}
               >
                  {metaText}
               </div>
            ) : (
               <input
                  ref={inputRef}
                  className="dv-subst-input"
                  style={{
                     width: "100%",
                     fontSize: `${inputFontSize}px`,
                     lineHeight: 1.2,
                  }}
                  placeholder="Înlocuitor / notă pentru zi"
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
      );
   },
   (prev, next) => {
      return (
         prev.inst === next.inst &&
         prev.dayDate === next.dayDate &&
         prev.sectorClassName === next.sectorClassName &&
         prev.style?.left === next.style?.left &&
         prev.style?.top === next.style?.top &&
         prev.style?.width === next.style?.width &&
         prev.style?.height === next.style?.height &&
         prev.carsByInstructorId === next.carsByInstructorId &&
         prev.instructorsFullById === next.instructorsFullById &&
         prev.usersById === next.usersById &&
         prev.instructorUsersByNormName === next.instructorUsersByNormName &&
         prev.zoom === next.zoom
      );
   },
);

export default CanvasInstructorHeader;
