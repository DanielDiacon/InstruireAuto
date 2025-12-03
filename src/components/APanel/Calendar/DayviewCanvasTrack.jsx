// src/components/APanel/Calendar/DayviewCanvasTrack.jsx
import React, {
   useRef,
   useEffect,
   useState,
   useMemo,
   useCallback,
   memo,
} from "react";
import { useDispatch } from "react-redux";
import { openPopup } from "../../Utils/popupStore";
import { updateUser } from "../../../store/usersSlice";
import { createNote } from "../../../api/notesService";

const MOLDOVA_TZ = "Europe/Chisinau";
const DPR_LIMIT = 2;
const ENABLE_STUDENT_HITS = false;
const WAIT_PLACEHOLDER_TEXT = "Scrie aici";
const DEFAULT_EVENT_COLOR_TOKEN = "--event-default";
const NO_COLOR_TOKEN = "--black-t";

function normalizeEventColorToken(raw) {
   if (!raw || typeof raw !== "string") {
      return DEFAULT_EVENT_COLOR_TOKEN;
   }

   const trimmed = raw.trim();

   if (!trimmed || trimmed.toUpperCase() === "DEFAULT") {
      return DEFAULT_EVENT_COLOR_TOKEN;
   }

   if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
      return DEFAULT_EVENT_COLOR_TOKEN;
   }

   return trimmed;
}

const DEFAULT_TIME_MARKS = [
   "07:00",
   "08:30",
   "10:00",
   "11:30",
   "13:30",
   "15:00",
   "16:30",
   "18:00",
   "19:30",
];

const HHMM_FMT = new Intl.DateTimeFormat("ro-RO", {
   timeZone: MOLDOVA_TZ,
   hour: "2-digit",
   minute: "2-digit",
   hour12: false,
});

const TZ_PARTS_FMT_CANVAS = new Intl.DateTimeFormat("en-GB", {
   timeZone: MOLDOVA_TZ,
   hour12: false,
   year: "numeric",
   month: "2-digit",
   day: "2-digit",
   hour: "2-digit",
   minute: "2-digit",
   second: "2-digit",
});

function formatHHMM(val) {
   const d = val instanceof Date ? val : new Date(val);
   if (Number.isNaN(d.getTime())) return "";
   return HHMM_FMT.format(d);
}

function drawRoundRect(ctx, x, y, w, h, r) {
   const radius =
      typeof r === "number"
         ? { tl: r, tr: r, br: r, bl: r }
         : { tl: 0, tr: 0, br: 0, bl: 0, ...r };

   ctx.beginPath();
   ctx.moveTo(x + radius.tl, y);
   ctx.lineTo(x + w - radius.tr, y);
   ctx.quadraticCurveTo(x + w, y, x + w, y + radius.tr);
   ctx.lineTo(x + w, y + h - radius.br);
   ctx.quadraticCurveTo(x + w, y + h, x + w - radius.br, y + h);
   ctx.lineTo(x + radius.bl, y + h);
   ctx.quadraticCurveTo(x, y + h, x, y + h - radius.bl);
   ctx.lineTo(x, y + radius.tl);
   ctx.quadraticCurveTo(x, y, x + radius.tl, y);
   ctx.closePath();
}

// ctx PRIMUL parametru
function wrapText(ctx, text, maxWidth, maxLines = Infinity) {
   const raw = String(text || "");
   const words = raw.split(/\s+/).filter(Boolean);

   const lines = [];
   let current = "";
   let truncated = false; // ✅ adevărat doar dacă nu încape TOT textul

   const pushLine = (line) => {
      if (!line) return;
      lines.push(line);
   };

   outer: for (const word of words) {
      const test = current ? current + " " + word : word;

      // 1) încă încape în linia curentă
      if (ctx.measureText(test).width <= maxWidth) {
         current = test;
         continue;
      }

      // 2) nu mai încape, împingem linia curentă
      if (current) {
         pushLine(current);
         current = "";
         if (lines.length >= maxLines) {
            // am ajuns la limita de linii și încă mai avem cuvinte → text tăiat
            truncated = true;
            break outer;
         }
      }

      // 3) încercăm să punem cuvântul singur pe linie
      if (ctx.measureText(word).width <= maxWidth) {
         current = word;
      } else {
         // 4) cuvântul e prea lung -> tăiem pe litere
         let part = "";
         for (const ch of word) {
            const testPart = part + ch;
            if (ctx.measureText(testPart).width <= maxWidth) {
               part = testPart;
            } else {
               pushLine(part);
               part = ch;
               if (lines.length >= maxLines) {
                  truncated = true;
                  break;
               }
            }
         }
         current = part;
         if (truncated) break outer;
      }
   }

   // 5) mai avem ceva în buffer și NU am tăiat din cauza maxLines
   if (!truncated && current) {
      pushLine(current);
   }

   // 6) safety: dacă totuși avem mai multe linii decât maxLines
   if (lines.length > maxLines) {
      lines.length = maxLines;
      truncated = true;
   }

   // 7) adăugăm "…" doar dacă TEXTUL A FOST TRUNCAT
   if (truncated && isFinite(maxLines) && maxLines > 0 && lines.length) {
      const lastIndex = lines.length - 1;
      let last = lines[lastIndex];
      const ellipsis = "…";

      if (!last.endsWith(ellipsis)) {
         if (ctx.measureText(last + ellipsis).width <= maxWidth) {
            lines[lastIndex] = last + ellipsis;
         } else {
            let trimmed = last;
            while (
               trimmed.length &&
               ctx.measureText(trimmed + ellipsis).width > maxWidth
            ) {
               trimmed = trimmed.slice(0, -1);
            }
            lines[lastIndex] = trimmed ? trimmed + ellipsis : last;
         }
      }
   }

   return lines;
}

/* ================== PALETĂ & DARK MODE ================== */

let COLOR_ROOT = null;
let COLOR_CACHE = new Map();

function getColorRoot() {
   if (typeof document === "undefined") return null;

   if (COLOR_ROOT && document.contains(COLOR_ROOT)) return COLOR_ROOT;

   COLOR_ROOT =
      document.querySelector(".darkmode") ||
      document.getElementById("root") ||
      document.body ||
      document.documentElement;

   return COLOR_ROOT;
}

export function clearColorCache() {
   COLOR_CACHE.clear();
}

function resolveColor(color) {
   if (!color) return "#616161";

   if (typeof window === "undefined" || typeof document === "undefined") {
      return color;
   }

   const cached = COLOR_CACHE.get(color);
   if (cached) return cached;

   const root = getColorRoot();
   if (!root) {
      COLOR_CACHE.set(color, color);
      return color;
   }

   let result = color;

   if (color.startsWith("var(")) {
      const name = color.slice(4, -1).trim();
      const val = getComputedStyle(root).getPropertyValue(name).trim();
      result = val || "#616161";
   } else if (color.startsWith("--")) {
      const val = getComputedStyle(root).getPropertyValue(color).trim();
      result = val || "#616161";
   }

   COLOR_CACHE.set(color, result);
   return result;
}

const EVENT_COLOR_MAP = {
   DEFAULT: DEFAULT_EVENT_COLOR_TOKEN,
   RED: "--event-red",
   ORANGE: "--event-orange",
   YELLOW: "--event-yellow",
   GREEN: "--event-green",
   BLUE: "--event-blue",
   INDIGO: "--event-indigo",
   PURPLE: "--event-purple",
   PINK: "--event-pink",
   BLACK: NO_COLOR_TOKEN,
   "BLACK-S": NO_COLOR_TOKEN,
   "BLACK-T": NO_COLOR_TOKEN,
};

function normalizeEventColor(dbColor) {
   if (!dbColor) return DEFAULT_EVENT_COLOR_TOKEN;

   let v = String(dbColor).trim();

   if (/^#[0-9a-fA-F]{3,8}$/.test(v)) {
      return DEFAULT_EVENT_COLOR_TOKEN;
   }

   if (v.toLowerCase() === "black" || v.toLowerCase() === "black-t") {
      return NO_COLOR_TOKEN;
   }

   if (v.toLowerCase() === "transparent") {
      return NO_COLOR_TOKEN;
   }

   if (/^(rgb\(|hsl\()/i.test(v)) {
      return v;
   }

   if (v.startsWith("var(")) {
      return v;
   }

   if (v.startsWith("--")) {
      const short = v.slice(2).toLowerCase();

      if (!short || short === "default") {
         return DEFAULT_EVENT_COLOR_TOKEN;
      }

      if (short === "black-s" || short === "black" || short === "black-t") {
         return NO_COLOR_TOKEN;
      }

      if (short.startsWith("event-")) {
         return `--${short}`;
      }

      return `--event-${short}`;
   }

   if (/^event-/i.test(v)) {
      const rest = v.slice("event-".length).toLowerCase();

      if (!rest || rest === "default") {
         return DEFAULT_EVENT_COLOR_TOKEN;
      }

      if (rest === "black-s" || rest === "black" || rest === "black-t") {
         return NO_COLOR_TOKEN;
      }

      return `--event-${rest}`;
   }

   const key = v.toUpperCase();
   const cssVar = EVENT_COLOR_MAP[key];
   if (cssVar) {
      return cssVar;
   }

   return DEFAULT_EVENT_COLOR_TOKEN;
}

/* ================== HELPERE PENTRU POPUP-URI ================== */

function getStudentPrivateMessageFromEv(ev) {
   const v =
      ev?.student?.privateMessage ??
      ev?.raw?.student?.privateMessage ??
      ev?.raw?.user?.privateMessage ??
      ev?.raw?.privateMessage ??
      "";
   return typeof v === "string" ? v : String(v ?? "");
}

function openReservationPopup(ev) {
   if (!ev) return;
   const reservationId = ev.raw?.id ?? ev.id;
   if (!reservationId) return;
   openPopup("reservationEdit", { reservationId });
}

function openStudentPopup(ev) {
   if (!ev) return;
   const raw = ev.raw || {};

   const fallbackName =
      raw?.clientName ||
      raw?.customerName ||
      raw?.name ||
      ev.title ||
      "Programare";

   const phoneVal =
      ev.studentPhone ||
      raw?.clientPhone ||
      raw?.phoneNumber ||
      raw?.phone ||
      "";

   const noteFromEvent = (
      ev.privateMessage ||
      raw?.note ||
      raw?.comment ||
      raw?.privateMessage ||
      raw?.privateMessaje ||
      ""
   )
      .toString()
      .trim();

   const noteFromProfile = (getStudentPrivateMessageFromEv(ev) || "")
      .toString()
      .trim();

   const reservationId = raw?.id ?? ev.id;

   const userIdRaw =
      raw?.userId ?? ev?.userId ?? raw?.user_id ?? raw?.user?.id ?? null;

   const emailRaw = raw?.user?.email ?? raw?.email ?? ev?.studentEmail ?? "";

   const firstNameSeed =
      (ev.studentFirst || "").trim() || fallbackName.split(" ")[0] || "";
   const lastNameSeed = (ev.studentLast || "").trim();

   if (ev.studentId || userIdRaw) {
      openPopup("studentDetails", {
         student: {
            id: ev.studentId ?? null,
            userId: userIdRaw ?? null,
            firstName: firstNameSeed,
            lastName: lastNameSeed,
            phone: phoneVal || "",
            email: emailRaw || "",
            privateMessage: noteFromProfile,
            isConfirmed: !!ev.isConfirmed,
         },
         noteFromEvent,
         studentPrivateMessage: noteFromProfile,
         fromReservationId: reservationId,
         fromReservationStartISO:
            raw?.startTime || raw?.start || ev.start || null,
      });
   } else {
      openReservationPopup(ev);
   }
}

function slotOverlapsEvents(slotStartMs, slotEndMs, eventsForInst = []) {
   if (!eventsForInst.length) return false;
   for (const ev of eventsForInst) {
      const s = ev.start.getTime();
      const e = ev.end.getTime();
      if (s < slotEndMs && e > slotStartMs) return true;
   }
   return false;
}

function isEventCanceled(ev) {
   if (!ev) return false;
   const raw = ev.raw || {};
   const status = String(ev.status || raw.status || "").toLowerCase();

   return (
      ev.isCanceled === true ||
      ev.isCancelled === true ||
      raw.isCanceled === true ||
      raw.isCancelled === true ||
      status === "canceled" ||
      status === "cancelled"
   );
}

/* ================== HELPERE NOTIȚE & SECTOR ================== */

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

/* ================== UTILS TZ ================== */

function partsInTZ(dateLike, timeZone = MOLDOVA_TZ) {
   const d = new Date(dateLike);

   if (timeZone && timeZone !== MOLDOVA_TZ) {
      const p = new Intl.DateTimeFormat("en-GB", {
         timeZone,
         hour12: false,
         year: "numeric",
         month: "2-digit",
         day: "2-digit",
         hour: "2-digit",
         minute: "2-digit",
         second: "2-digit",
      }).formatToParts(d);
      const get = (t) => +p.find((x) => x.type === t).value;
      return {
         y: get("year"),
         m: get("month"),
         d: get("day"),
         H: get("hour"),
         M: get("minute"),
         S: get("second"),
      };
   }

   const p = TZ_PARTS_FMT_CANVAS.formatToParts(d);
   const get = (t) => +p.find((x) => x.type === t).value;
   return {
      y: get("year"),
      m: get("month"),
      d: get("day"),
      H: get("hour"),
      M: get("minute"),
      S: get("second"),
   };
}

function ymdStrInTZ(dateLike, timeZone = MOLDOVA_TZ) {
   const { y, m, d } = partsInTZ(dateLike, timeZone);
   return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function hhmmInTZ(dateLike, timeZone = MOLDOVA_TZ) {
   const { H, M } = partsInTZ(dateLike, timeZone);
   return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
}

function localKeyFromTs(dateLike, timeZone = MOLDOVA_TZ) {
   return `${ymdStrInTZ(dateLike, timeZone)}|${hhmmInTZ(dateLike, timeZone)}`;
}

/* ================== GEOMETRIE SLOTURI ================== */

const CONTENT_PAD_TOP = 0;
const CONTENT_PAD_BOTTOM = 4;
const WAIT_SLOTS_PER_COLUMN = 3;

function computeWorldHeight(slotsCount, slotHeight, slotGap) {
   if (!slotsCount) return 0;
   return (
      CONTENT_PAD_TOP +
      slotsCount * slotHeight +
      Math.max(0, slotsCount - 1) * slotGap +
      CONTENT_PAD_BOTTOM
   );
}

/* ================== HEADER DOM PESTE CANVAS ================== */

const CanvasInstructorHeader = memo(
   function CanvasInstructorHeader({
      inst,
      dayDate,
      sectorClassName,
      style,
      cars,
      instructorsFull,
      users,
      zoom = 1,
   }) {
      const dispatch = useDispatch();

      const instrFull = useMemo(
         () =>
            instructorsFull.find((x) => String(x.id) === String(inst?.id)) ||
            inst ||
            null,
         [instructorsFull, inst]
      );

      const instructorUser = useMemo(() => {
         if (!instrFull) return null;
         const directUid = instrFull.userId ?? instrFull.user_id;
         const roleInstr = (u) =>
            String(u.role ?? "").toUpperCase() === "INSTRUCTOR";

         if (directUid != null) {
            const byId = users.find(
               (u) => String(u.id) === String(directUid) && roleInstr(u)
            );
            if (byId) return byId;
         }

         const phoneKey = digits(
            instrFull.phone ?? instrFull.phoneNumber ?? ""
         );
         if (phoneKey) {
            const byPhone = users.find(
               (u) => roleInstr(u) && digits(u.phone ?? "") === phoneKey
            );
            if (byPhone) return byPhone;
         }

         const nameKey = norm(
            `${instrFull.firstName ?? ""} ${instrFull.lastName ?? ""}`
         );
         return (
            users.find(
               (u) =>
                  roleInstr(u) &&
                  norm(`${u.firstName ?? ""} ${u.lastName ?? ""}`) === nameKey
            ) || null
         );
      }, [instrFull, users]);

      const carForInst = useMemo(() => {
         const iid = String(inst?.id ?? "");
         if (!iid) return null;
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
      }, [cars, inst]);

      const displayName = useMemo(() => {
         if (!inst && !instrFull) return "–";
         if (inst?.name && inst.name.trim()) return inst.name.trim();
         const v = `${instrFull?.firstName ?? ""} ${
            instrFull?.lastName ?? ""
         }`.trim();
         return v || "–";
      }, [inst, instrFull]);

      const displayPlate = useMemo(() => {
         if (!carForInst) return "";
         return (
            carForInst.plateNumber ??
            carForInst.plate ??
            carForInst.number ??
            ""
         )
            .toString()
            .trim();
      }, [carForInst]);

      const displayInstPhone = useMemo(() => {
         return (
            instrFull?.phone ??
            instrFull?.phoneNumber ??
            instructorUser?.phone ??
            ""
         )
            .toString()
            .trim();
      }, [instrFull, instructorUser]);

      const privateMsg = (instructorUser?.privateMessage ?? "").toString();
      const todaysText = useMemo(
         () => getNoteForDate(privateMsg, dayDate),
         [privateMsg, dayDate]
      );

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
               })
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
               {!isEditing && todaysText && (
                  <span className="dv-inst-notes">
                     {" / "}
                     {todaysText}
                  </span>
               )}
            </div>

            {!isEditing && (displayPlate || displayInstPhone) && (
               <div
                  className="dv-inst-plate"
                  style={{
                     fontSize: `${plateFontSize}px`,
                     lineHeight: 1.2,
                  }}
               >
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
         prev.style.left === next.style.left &&
         prev.style.top === next.style.top &&
         prev.style.width === next.style.width &&
         prev.style.height === next.style.height &&
         prev.cars === next.cars &&
         prev.instructorsFull === next.instructorsFull &&
         prev.users === next.users &&
         prev.zoom === next.zoom
      );
   }
);

/* ================== DESENARE CANVAS ================== */

function buildEventsSignatureForDay(events) {
   if (!Array.isArray(events) || !events.length) return "0";

   const simplified = events.map((ev) => {
      const id = ev?.id ?? ev?.raw?.id ?? "";
      const s =
         ev.start instanceof Date ? ev.start.getTime() : +new Date(ev.start);
      const e = ev.end instanceof Date ? ev.end.getTime() : +new Date(ev.end);
      const instId = ev.instructorId ?? ev.raw?.instructorId ?? "";
      const color = ev.color || "";
      return {
         id: String(id),
         s,
         e,
         instId: String(instId),
         color: String(color),
      };
   });

   simplified.sort((a, b) => {
      if (a.instId !== b.instId) return a.instId < b.instId ? -1 : 1;
      if (a.s !== b.s) return a.s - b.s;
      if (a.id !== b.id) return a.id < b.id ? -1 : 1;
      return 0;
   });

   let out = "";
   for (const ev of simplified) {
      out += `${ev.instId}:${ev.id}:${ev.s}-${ev.e}:${ev.color};`;
   }
   return out;
}

function buildSlotsSignature(slotGeoms) {
   if (!Array.isArray(slotGeoms) || !slotGeoms.length) return "0";
   let out = "";
   for (const sg of slotGeoms) {
      out += `${sg.index}:${sg.startMs}-${sg.endMs};`;
   }
   return out;
}

function buildBlockedSignature(blockedKeyMap, instructors) {
   if (!blockedKeyMap || !Array.isArray(instructors) || !instructors.length)
      return "0";

   const ids = instructors
      .map((inst) => (inst && inst.id != null ? String(inst.id) : ""))
      .filter(Boolean)
      .sort();

   const parts = [];

   for (const id of ids) {
      let set = null;

      if (blockedKeyMap instanceof Map) {
         set = blockedKeyMap.get(id);
      } else if (typeof blockedKeyMap === "object") {
         set = blockedKeyMap[id];
      }

      if (!set) continue;

      let arr =
         set instanceof Set
            ? Array.from(set)
            : Array.isArray(set)
            ? set.slice()
            : [];

      arr = arr.map(String).sort();
      if (!arr.length) continue;

      parts.push(`${id}:${arr.join(",")}`);
   }

   return parts.join("|") || "0";
}

function buildWaitNotesSignature(waitNotes) {
   if (!waitNotes || typeof waitNotes !== "object") return "0";
   const keys = Object.keys(waitNotes);
   if (!keys.length) return "0";
   keys.sort();
   let out = "";
   for (const k of keys) {
      const v = (waitNotes[k] || "").toString();
      out += `${k}:${v};`;
   }
   return out;
}

function drawAll({
   ctx,
   width,
   height,
   hoursColWidth,
   headerHeight,
   colWidth,
   colGap,
   colsCount,
   colsPerRow,
   rowsCount,
   rowGap,
   rowHeights,
   instructors,
   events,
   slotGeoms,
   slotHeight,
   slotGap,
   hitMap,
   blockedKeyMap,
   highlightEventId,
   zoom = 1,
   preGrid = null,
   preGridWidth = 0,
   waitNotesMap = null,
   editingWait = null,
}) {
   if (!ctx || !width || !height) return;

   const slotsCount = slotGeoms.length || 0;
   const worldHeight = computeWorldHeight(slotsCount, slotHeight, slotGap);

   const effectiveRowHeights =
      rowHeights && rowHeights.length
         ? rowHeights
         : new Array(rowsCount).fill(worldHeight);

   const maxWorldHeight = effectiveRowHeights.reduce(
      (max, h) => (h > max ? h : max),
      worldHeight
   );

   const eventsByInst = {};
   (events || []).forEach((ev) => {
      const iid = String(ev.instructorId);
      if (!eventsByInst[iid]) eventsByInst[iid] = [];
      eventsByInst[iid].push(ev);
   });

   const slotIndexByLabel = new Map();
   slotGeoms.forEach((sg, idx) => {
      if (sg.label) slotIndexByLabel.set(sg.label, idx);
   });

   const baseBg = resolveColor("--black-p");

   const emptySlotBgPads = resolveColor(NO_COLOR_TOKEN);
   const emptySlotBgDefault = resolveColor(DEFAULT_EVENT_COLOR_TOKEN);

   const emptySlotTextColor = resolveColor("--white-s");
   const blackoutFillColor = resolveColor("--event-red");
   const blackoutBorderColor = baseBg;
   const eventTextColor = resolveColor("--white-p");
   const activeBorderColor = resolveColor("--event-yellow");

   const z = zoom || 1;
   const fontScale = Math.max(0.6, Math.min(1.6, z));
   const fontMetaPx = 11 * fontScale;
   const fontNotesPx = 10 * fontScale;
   const padX = 8 * fontScale;
   const padY = 6 * fontScale;
   const lineHeight = 13 * fontScale;

   const BASE_EVENT_RADIUS = 18;
   const BASE_COL_DELTA = 4;
   const BASE_BORDER_DELTA = -1;

   const eventRadius = BASE_EVENT_RADIUS * fontScale;
   const columnRadius = eventRadius + BASE_COL_DELTA * fontScale;
   const slotRadius = eventRadius;
   const eventBorderRadius = Math.max(
      0,
      eventRadius + BASE_BORDER_DELTA * fontScale
   );

   const hasPreGrid =
      preGrid && preGrid.columns > 0 && preGrid.rows > 0 && colWidth > 0;
   const preCols = hasPreGrid ? preGrid.columns : 0;
   const preRows = hasPreGrid ? preGrid.rows : 0;

   const waitPadIndexByInstId = new Map();
   let waitPadCounter = 0;

   ctx.save();
   ctx.clearRect(0, 0, width, height);

   if (hasPreGrid && preCols > 0 && preRows > 0) {
      const rowTop = 0;
      const colHeight = headerHeight + maxWorldHeight;
      const slotAreaTopGlobal = rowTop + headerHeight + CONTENT_PAD_TOP;

      for (let pgCol = 0; pgCol < preCols; pgCol++) {
         const colX = hoursColWidth + pgCol * (colWidth + colGap);
         const w = colWidth;

         ctx.save();
         const grad = ctx.createLinearGradient(
            0,
            rowTop,
            0,
            rowTop + colHeight
         );
         grad.addColorStop(0, baseBg);
         grad.addColorStop(0.1, baseBg);
         grad.addColorStop(1, baseBg);
         ctx.fillStyle = grad;
         drawRoundRect(ctx, colX, rowTop, w, colHeight, columnRadius);
         ctx.fill();
         ctx.restore();

         for (let pgRow = 0; pgRow < preRows; pgRow++) {
            let cellY;
            let cellH = slotHeight;

            if (slotGeoms.length >= preRows) {
               const sg = slotGeoms[pgRow];
               const idx = sg.index;
               cellY = slotAreaTopGlobal + idx * (slotHeight + slotGap);
            } else {
               const usableH =
                  maxWorldHeight - CONTENT_PAD_TOP - CONTENT_PAD_BOTTOM;
               const totalGaps = Math.max(0, preRows - 1) * slotGap;
               const hPer = preRows > 0 ? (usableH - totalGaps) / preRows : 0;
               cellY = slotAreaTopGlobal + pgRow * (hPer + slotGap);
               cellH = hPer || slotHeight;
            }

            if (cellY > height || cellY + cellH < 0) continue;

            ctx.save();
            ctx.fillStyle = emptySlotBgDefault;
            drawRoundRect(ctx, colX + 4, cellY, w - 8, cellH, slotRadius);
            ctx.fill();
            ctx.restore();
         }
      }
   }

   const highlightEventIdForRender = highlightEventId;

   let currentRowTop = 0;

   for (let row = 0; row < rowsCount; row++) {
      const rowHeight = effectiveRowHeights[row] ?? worldHeight;
      const rowTop = currentRowTop;
      const rowContentTop = rowTop + headerHeight;

      const rowStartIdx = row * colsPerRow;
      const colsInThisRow = Math.min(
         colsPerRow,
         Math.max(0, colsCount - rowStartIdx)
      );

      const slotAreaTop = rowContentTop + CONTENT_PAD_TOP;

      for (let c = 0; c < colsInThisRow; c++) {
         const instIdx = rowStartIdx + c;
         const inst = instructors[instIdx];
         if (!inst) continue;

         const colX = hoursColWidth + preGridWidth + c * (colWidth + colGap);
         const w = colWidth;

         const instId = String(inst.id ?? "");
         const instEvents = eventsByInst[instId] || [];
         const instBlockedSet = blockedKeyMap
            ? blockedKeyMap.get
               ? blockedKeyMap.get(instId) || null
               : blockedKeyMap[instId] || null
            : null;

         const isPadCol = instId.startsWith("__pad_");
         const instNameLower = String(inst.name || "").toLowerCase();
         const isCancelPad =
            isPadCol &&
            (instId === "__pad_1" || instNameLower.includes("anular"));
         const isWaitPad = isPadCol && !isCancelPad;

         let waitPadIndex = null;
         if (isWaitPad) {
            if (!waitPadIndexByInstId.has(instId)) {
               waitPadIndexByInstId.set(instId, waitPadCounter++);
            }
            waitPadIndex = waitPadIndexByInstId.get(instId);
         }

         const maxSlotsForThisColumn = isPadCol
            ? Math.min(WAIT_SLOTS_PER_COLUMN, slotGeoms.length)
            : slotGeoms.length;

         const worldHeightForColumn = isPadCol
            ? computeWorldHeight(maxSlotsForThisColumn, slotHeight, slotGap)
            : worldHeight;

         ctx.save();

         const sectorSlug = (
            inst.sectorSlug ||
            inst.sector ||
            inst.metaSector ||
            inst.sector_norm ||
            ""
         )
            .toString()
            .toLowerCase();

         let colTopColor = baseBg;
         let colBottomColor = baseBg;

         if (sectorSlug.includes("botanica")) {
            colBottomColor = resolveColor("--event-blue");
         } else if (sectorSlug.includes("ciocana")) {
            colBottomColor = resolveColor("--event-pink");
         } else if (sectorSlug.includes("buiucani")) {
            colBottomColor = resolveColor("--event-green");
         }

         const colHeight = headerHeight + worldHeightForColumn;

         const grad = ctx.createLinearGradient(
            0,
            rowTop,
            0,
            rowTop + colHeight
         );
         grad.addColorStop(0, colBottomColor);
         grad.addColorStop(0.1, colTopColor);
         grad.addColorStop(1, colTopColor);

         ctx.fillStyle = grad;
         drawRoundRect(ctx, colX, rowTop, w, colHeight, columnRadius);
         ctx.fill();
         ctx.restore();

         // =================== SLOTURI GOALE / ASTEPTARI / ANULARI ===================
         for (let si = 0; si < maxSlotsForThisColumn; si++) {
            const sg = slotGeoms[si];
            if (!sg) break;

            const idx = sg.index;
            const slotY = slotAreaTop + idx * (slotHeight + slotGap);
            const slotH = slotHeight;
            const slotX = colX + 4;
            const slotW = w - 8;

            if (slotY > height || slotY + slotH < 0) continue;

            if (
               sg.startMs &&
               sg.endMs &&
               slotOverlapsEvents(sg.startMs, sg.endMs, instEvents)
            ) {
               continue;
            }

            const slotKey =
               sg.slot && sg.slot.start ? localKeyFromTs(sg.slot.start) : null;

            // slot de 19:30 ?
            const isSlot19_30 = sg.label === "19:30";

            let isBlocked =
               !!instBlockedSet && slotKey && instBlockedSet.has
                  ? instBlockedSet.has(slotKey)
                  : !!(
                       instBlockedSet &&
                       Array.isArray(instBlockedSet) &&
                       instBlockedSet.includes(slotKey)
                    );

            // ✅ pentru sloturile de 19:30 fără eveniment, ignorăm blocajele
            if (isSlot19_30) {
               isBlocked = false;
            }

            ctx.save();

            const slotBaseBg =
               isCancelPad || isWaitPad ? emptySlotBgPads : emptySlotBgDefault;

            let fillColor = slotBaseBg;

            if (isBlocked) {
               fillColor = blackoutFillColor;
            } else if (isSlot19_30) {
               // ✅ 19:30 fără event: roșu, fără border
               fillColor = blackoutFillColor;
            }

            ctx.fillStyle = fillColor;
            drawRoundRect(ctx, slotX, slotY, slotW, slotH, slotRadius);
            ctx.fill();

            if (isBlocked) {
               ctx.lineWidth = 1.5;
               ctx.strokeStyle = blackoutBorderColor;
               drawRoundRect(
                  ctx,
                  slotX + 1.5,
                  slotY + 1.5,
                  slotW - 3,
                  slotH - 3,
                  Math.max(0, slotRadius - 1.5 * fontScale)
               );
               ctx.stroke();
            }

            ctx.fillStyle = emptySlotTextColor;
            ctx.font = `${fontMetaPx}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
            ctx.textBaseline = "top";

            let slotLabelText = sg.label || "";
            let shouldDrawText = true;
            let waitSlotGlobalIndex = null;

            if (isWaitPad) {
               const localIdx = si;
               waitSlotGlobalIndex =
                  waitPadIndex != null
                     ? waitPadIndex * WAIT_SLOTS_PER_COLUMN + localIdx
                     : localIdx;

               const key1 = String(waitSlotGlobalIndex);
               const fromMap =
                  waitNotesMap && typeof waitNotesMap === "object"
                     ? waitNotesMap[key1] || waitNotesMap[waitSlotGlobalIndex]
                     : "";

               slotLabelText = fromMap || WAIT_PLACEHOLDER_TEXT;

               if (
                  editingWait &&
                  String(editingWait.instId) === instId &&
                  Number(editingWait.slotIndex) === waitSlotGlobalIndex
               ) {
                  shouldDrawText = false;
               }
            }

            if (shouldDrawText && slotLabelText) {
               const maxTextWidth = Math.max(0, slotW - padX * 2);
               const lines = wrapText(ctx, slotLabelText, maxTextWidth, 3);
               for (let li = 0; li < lines.length; li++) {
                  ctx.fillText(
                     lines[li],
                     slotX + padX,
                     slotY + padY + li * lineHeight
                  );
               }
            }

            ctx.restore();

            if (hitMap && sg.slot?.start && sg.slot?.end) {
               if (!isPadCol) {
                  hitMap.push({
                     x: slotX,
                     y: slotY,
                     w: slotW,
                     h: slotH,
                     kind: "empty-slot",
                     instructorId: instId,
                     slotStart: sg.slot.start.toISOString(),
                     slotEnd: sg.slot.end.toISOString(),
                  });
               } else if (isWaitPad) {
                  const localIdx = si;
                  const globalIdx =
                     waitPadIndex != null
                        ? waitPadIndex * WAIT_SLOTS_PER_COLUMN + localIdx
                        : idx;
                  hitMap.push({
                     x: slotX,
                     y: slotY,
                     w: slotW,
                     h: slotH,
                     kind: "wait-slot",
                     instructorId: instId,
                     slotIndex: globalIdx,
                     slotStart: sg.slot.start.toISOString(),
                     slotEnd: sg.slot.end.toISOString(),
                  });
               }
            }
         }

         // =================== EVENIMENTE ===================
         for (const ev of instEvents) {
            const displayStart = ev.start;
            const displayEnd = ev.end;

            let slotIdx;

            if (typeof ev._padSlotIndex === "number") {
               slotIdx = ev._padSlotIndex;
            } else {
               const labelForIndex = formatHHMM(ev.start);
               slotIdx = slotIndexByLabel.get(labelForIndex);

               if (slotIdx == null) {
                  let bestIdx = 0;
                  let bestDiff = Infinity;
                  const evMs = ev.start.getTime();
                  slotGeoms.forEach((sg, idx2) => {
                     const diff = Math.abs(evMs - sg.startMs);
                     if (diff < bestDiff) {
                        bestDiff = diff;
                        bestIdx = idx2;
                     }
                  });
                  slotIdx = bestIdx;
               }
            }

            const cardX = colX + 4;
            const cardY = slotAreaTop + slotIdx * (slotHeight + slotGap);
            const cardW = w - 8;
            const cardH = slotHeight;

            if (
               cardX + cardW < hoursColWidth ||
               cardX > width ||
               cardY > height ||
               cardY + cardH < 0
            ) {
               continue;
            }

            const color = resolveColor(normalizeEventColor(ev.color));
            const raw = ev.raw || {};

            const evLocalKey =
               ev.localSlotKey || (ev.start ? localKeyFromTs(ev.start) : null);

            let isBlockedEvent =
               !!instBlockedSet && evLocalKey && instBlockedSet.has
                  ? instBlockedSet.has(evLocalKey)
                  : !!(
                       instBlockedSet &&
                       Array.isArray(instBlockedSet) &&
                       instBlockedSet.includes(evLocalKey)
                    );

            // ✅ evenimente mutate în coloana „Anulari” NU mai primesc bordură de blackout
            if (ev._movedToCancelPad) {
               isBlockedEvent = false;
            }

            const isHighlighted =
               highlightEventIdForRender &&
               String(ev.id) === String(highlightEventIdForRender);

            ctx.save();

            ctx.fillStyle = color;
            drawRoundRect(ctx, cardX, cardY, cardW, cardH, eventRadius);
            ctx.fill();

            const paddingX = padX;
            const textX = cardX + paddingX;
            let textY = cardY + padY;
            const lineH = lineHeight;
            const maxTextWidth = Math.max(0, cardW - paddingX * 2);

            ctx.save();
            ctx.beginPath();
            ctx.rect(cardX, cardY, cardW, cardH);
            ctx.clip();

            ctx.fillStyle = eventTextColor;
            ctx.textBaseline = "top";
            ctx.font = `${fontMetaPx}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;

            // ORA (start–end + cutie)
            let timeText = formatHHMM(displayStart);

            // ⭐ / ❗ din flag-urile rezervării
            const isFavorite = raw.isFavorite === true;
            const isImportant = raw.isImportant === true;

            let statusEmoji = "";
            if (isFavorite) statusEmoji += "⭐";
            if (isImportant) statusEmoji += statusEmoji ? " · ❗" : "❗";

            // construim linia meta (pill-ul de sus din card)
            const metaParts = [];
            if (timeText) metaParts.push(timeText);
            if (ev.gearboxLabel) metaParts.push(ev.gearboxLabel);
            if (statusEmoji) metaParts.push(statusEmoji);

            const metaLine = metaParts.join(" · ");

            if (metaLine) {
               const metaLines = wrapText(ctx, metaLine, maxTextWidth, 1);
               for (const line of metaLines) {
                  ctx.fillText(line, textX, textY);
                  textY += lineH;
               }
            }

            const fallbackName =
               raw?.clientName ||
               raw?.customerName ||
               raw?.name ||
               ev.title ||
               "Programare";

            const person = (
               `${ev.studentFirst || ""} ${ev.studentLast || ""}`.trim() ||
               fallbackName
            ).trim();

            const phoneVal = raw?.phone || "";

            const noteFromEvent = (ev.privateMessage || "").toString().trim();

            const noteFromProfile = (getStudentPrivateMessageFromEv(ev) || "")
               .toString()
               .trim();

            const bothNotes = [
               noteFromEvent && `${noteFromEvent}`,
               noteFromProfile && `${noteFromProfile}`,
            ]
               .filter(Boolean)
               .join(" — ");

            let nameY = null;
            let nameLinesCount = 0;

            if (person) {
               const nameLines = wrapText(ctx, person, maxTextWidth, 2);
               if (nameLines.length) {
                  nameY = textY;
                  nameLinesCount = nameLines.length;
                  for (const line of nameLines) {
                     ctx.fillText(line, textX, textY);
                     textY += lineH;
                  }
               }
            }

            if (phoneVal) {
               const phoneLines = wrapText(ctx, phoneVal, maxTextWidth, 1);
               for (const line of phoneLines) {
                  ctx.fillText(line, textX, textY);
                  textY += lineH;
               }
            }

            if (bothNotes) {
               ctx.font = `${fontNotesPx}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
               const notesLines = wrapText(
                  ctx,
                  bothNotes.replace(/\s+/g, " ").trim(),
                  maxTextWidth,
                  2
               );
               for (const line of notesLines) {
                  ctx.fillText(line, textX, textY);
                  textY += lineH;
               }
            }

            ctx.restore();

            if (isBlockedEvent) {
               ctx.lineWidth = 1.3;
               ctx.strokeStyle = blackoutBorderColor;
               drawRoundRect(
                  ctx,
                  cardX + 1,
                  cardY + 1,
                  cardW - 2,
                  cardH - 2,
                  eventBorderRadius
               );
               ctx.stroke();
            }

            if (isHighlighted) {
               ctx.lineWidth = 2;
               ctx.strokeStyle = activeBorderColor;
               drawRoundRect(
                  ctx,
                  cardX + 1,
                  cardY + 1,
                  cardW - 2,
                  cardH - 2,
                  eventBorderRadius
               );
               ctx.stroke();
            }

            ctx.restore();

            if (hitMap) {
               const reservationId = raw?.id ?? ev.id;

               hitMap.push({
                  x: cardX,
                  y: cardY,
                  w: cardW,
                  h: cardH,
                  kind: "reservation",
                  reservationId,
                  ev,
               });

               if (
                  ENABLE_STUDENT_HITS &&
                  nameY !== null &&
                  nameLinesCount > 0
               ) {
                  hitMap.push({
                     x: cardX,
                     y: nameY - 2,
                     w: cardW,
                     h: nameLinesCount * lineHeight + 4,
                     kind: "student",
                     reservationId,
                     ev,
                  });
               }
            }
         }
      }

      currentRowTop += headerHeight + rowHeight + rowGap;
   }

   ctx.restore();
}

/* ================== COMPONENTA REACT ================== */

function DayviewCanvasTrack({
   dayStart,
   dayEnd,
   instructors = [],
   events = [],
   slots = [],
   layout = {},
   timeMarks = DEFAULT_TIME_MARKS, // eslint-disable-line no-unused-vars
   onCreateSlot,
   blockedKeyMap,
   blackoutVer = 0,
   activeEventId = null,
   onActiveEventRectChange,
   cars = [],
   instructorsFull = [],
   users = [],
   zoom = 1,
   preGrid,
   initialWaitNotes = null,
}) {
   const canvasRef = useRef(null);
   const hitMapRef = useRef([]);
   const lastDrawSigRef = useRef(null);

   // 🔹 pentru long-press / hold
   const longPressTimerRef = useRef(null);
   const longPressTargetRef = useRef(null);
   const ignoreClickUntilRef = useRef(0);

   const preGridCols =
      !preGrid || preGrid.enabled === false
         ? 0
         : typeof preGrid.columns === "number"
         ? preGrid.columns
         : 3;
   const preGridRows =
      !preGrid || preGrid.enabled === false
         ? 0
         : typeof preGrid.rows === "number"
         ? preGrid.rows
         : 3;
   const hasPreGrid = preGridCols > 0 && preGridRows > 0;

   const [themeTick, setThemeTick] = useState(0);
   const [selectedEventId, setSelectedEventId] = useState(null);

   const [waitNotes, setWaitNotes] = useState(() => initialWaitNotes || {});

   useEffect(() => {
      if (initialWaitNotes && typeof initialWaitNotes === "object") {
         setWaitNotes(initialWaitNotes);
      }
   }, [initialWaitNotes, dayStart]);

   const [waitEdit, setWaitEdit] = useState(null);
   const waitInputRef = useRef(null);
   const waitCommitRef = useRef(false);

   useEffect(() => {
      if (typeof MutationObserver === "undefined") return;
      if (typeof document === "undefined") return;

      const root = getColorRoot();
      if (!root) return;

      const observer = new MutationObserver((mutations) => {
         for (const m of mutations) {
            if (
               m.type === "attributes" &&
               (m.attributeName === "class" || m.attributeName === "style")
            ) {
               clearColorCache();
               setThemeTick((t) => t + 1);
               break;
            }
         }
      });

      observer.observe(root, {
         attributes: true,
         attributeFilter: ["class", "style"],
      });

      let mediaQuery;
      const handleMq = () => {
         clearColorCache();
         setThemeTick((t) => t + 1);
      };

      if (typeof window !== "undefined" && window.matchMedia) {
         mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
         try {
            mediaQuery.addEventListener("change", handleMq);
         } catch (e) {
            if (mediaQuery.addListener) mediaQuery.addListener(handleMq);
         }
      }

      return () => {
         observer.disconnect();
         if (mediaQuery) {
            try {
               mediaQuery.removeEventListener("change", handleMq);
            } catch (e) {
               if (mediaQuery.removeListener)
                  mediaQuery.removeListener(handleMq);
            }
         }
      };
   }, []);

   useEffect(() => {
      if (waitEdit && waitInputRef.current) {
         waitInputRef.current.focus();
      }
   }, [!!waitEdit]);

   const z = zoom || 1;

   const layoutColWidthRaw = Number(layout.colWidth) || 150;
   const layoutColWidth = layoutColWidthRaw;
   const layoutColGap = Number(layout.colGap) || 12;

   const baseHeaderHeightRaw =
      typeof layout.headerHeight === "number"
         ? layout.headerHeight
         : Number(layout.headerHeight) || 0;
   const baseHeaderHeight = Math.max(baseHeaderHeightRaw || 0, 40);

   const layoutColsPerRow = Number(layout.colsPerRow) || 3;
   const layoutRowGap = layout.rowGap != null ? Number(layout.rowGap) || 0 : 24;

   const layoutSlotHeight =
      Number(layout.slotHeight) > 0 ? Number(layout.slotHeight) : 50;
   const layoutSlotGap = 4;

   const headerMetrics = useMemo(() => {
      const colsCount = Math.max(1, instructors.length || 1);

      const colWidth = layoutColWidth;
      const colGap = layoutColGap;
      const headerHeight = Math.max(baseHeaderHeight * z, 40 * z);

      const colsPerRow = layoutColsPerRow;
      const rowsCount = Math.max(1, Math.ceil(colsCount / colsPerRow));

      const rowGap = layoutRowGap;

      const slotHeight = layoutSlotHeight;
      const slotGap = layoutSlotGap;
      const slotsCount = Array.isArray(slots) ? slots.length : 0;
      const worldHeight = computeWorldHeight(slotsCount, slotHeight, slotGap);

      const padSlots = Math.min(WAIT_SLOTS_PER_COLUMN, slotsCount || 0);
      const padWorldHeight = padSlots
         ? computeWorldHeight(padSlots, slotHeight, slotGap)
         : worldHeight;

      const rowHeights = new Array(rowsCount);
      for (let row = 0; row < rowsCount; row++) {
         const rowStart = row * colsPerRow;
         const rowEnd = Math.min(colsCount, rowStart + colsPerRow);
         let allPad = true;
         for (let i = rowStart; i < rowEnd; i++) {
            const inst = instructors[i];
            if (!inst || !String(inst.id || "").startsWith("__pad_")) {
               allPad = false;
               break;
            }
         }
         rowHeights[row] = allPad ? padWorldHeight : worldHeight;
      }

      const rowTops = new Array(rowsCount);
      let acc = 0;
      for (let row = 0; row < rowsCount; row++) {
         rowTops[row] = acc;
         acc += headerHeight + rowHeights[row] + rowGap;
      }

      return {
         colsCount,
         colWidth,
         colGap,
         headerHeight,
         colsPerRow,
         rowsCount,
         rowGap,
         slotHeight,
         slotGap,
         worldHeight,
         padWorldHeight,
         rowHeights,
         rowTops,
      };
   }, [
      instructors,
      layoutColWidth,
      layoutColGap,
      layoutColsPerRow,
      layoutRowGap,
      layoutSlotHeight,
      layoutSlotGap,
      slots,
      baseHeaderHeight,
      z,
   ]);

   const slotGeoms = useMemo(() => {
      return (slots || [])
         .map((slot, index) => {
            const s =
               slot.start instanceof Date ? slot.start : new Date(slot.start);
            const e = slot.end instanceof Date ? slot.end : new Date(slot.end);
            const startMs = s.getTime();
            const endMs = e.getTime();
            if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
               return null;
            }
            return {
               slot: { ...slot, start: s, end: e },
               index,
               startMs,
               endMs,
               label: formatHHMM(s),
            };
         })
         .filter(Boolean);
   }, [slots]);

   const padCancelColumn = useMemo(
      () =>
         instructors.find((inst) => {
            const id = String(inst?.id || "");
            const name = String(inst?.name || "").toLowerCase();
            return id === "__pad_1" || name.includes("anular");
         }) || null,
      [instructors]
   );

   const eventsForCanvas = useMemo(() => {
      if (!Array.isArray(events) || !events.length) return [];

      const result = [];
      const usePad = !!padCancelColumn && slotGeoms.length > 0;
      const canceled = usePad ? [] : null;

      for (const ev of events) {
         if (usePad && isEventCanceled(ev)) {
            canceled.push(ev);
         } else {
            result.push(ev);
         }
      }

      if (!usePad || !canceled || !canceled.length) {
         return result;
      }

      const padSlots = slotGeoms.slice(0, WAIT_SLOTS_PER_COLUMN);
      if (!padSlots.length) return result;

      const canceledSorted = canceled.slice().sort((a, b) => {
         const as = a.start instanceof Date ? a.start : new Date(a.start || 0);
         const bs = b.start instanceof Date ? b.start : new Date(b.start || 0);
         return as - bs;
      });

      canceledSorted.slice(0, padSlots.length).forEach((ev, idx) => {
         const sg = padSlots[idx];
         if (!sg || !sg.slot) return;

         const s = ev.start instanceof Date ? ev.start : new Date(ev.start);
         result.push({
            ...ev,
            instructorId: padCancelColumn.id,
            _padSlotIndex: sg.index,
            localSlotKey: localKeyFromTs(s),
            _movedToCancelPad: true,
         });
      });

      return result;
   }, [events, padCancelColumn, slotGeoms]);

   // ✅ filtrăm blockedKeyMap pentru rezervările ANULATE:
   // sloturile lor devin libere (fără roșu / border) în coloana instructorului
   const blockedKeyMapFiltered = useMemo(() => {
      if (!blockedKeyMap) return null;

      const canceledKeysByInst = new Map();

      const markCanceled = (instId, localKey) => {
         if (!instId || !localKey) return;
         const keyInst = String(instId);
         let set = canceledKeysByInst.get(keyInst);
         if (!set) {
            set = new Set();
            canceledKeysByInst.set(keyInst, set);
         }
         set.add(String(localKey));
      };

      (events || []).forEach((ev) => {
         if (!isEventCanceled(ev)) return;
         const instId =
            ev.instructorId ??
            ev.raw?.instructorId ??
            ev.raw?.instructor_id ??
            null;
         if (!instId) return;
         const start =
            ev.start instanceof Date ? ev.start : new Date(ev.start || 0);
         if (!Number.isFinite(start.getTime())) return;
         const localKey = localKeyFromTs(start);
         markCanceled(instId, localKey);
      });

      if (!canceledKeysByInst.size) {
         return blockedKeyMap;
      }

      if (blockedKeyMap instanceof Map) {
         const out = new Map();
         blockedKeyMap.forEach((val, key) => {
            const instId = String(key);
            const canceledSet = canceledKeysByInst.get(instId);
            if (!canceledSet || !canceledSet.size) {
               out.set(key, val);
               return;
            }

            if (val instanceof Set) {
               const next = new Set();
               val.forEach((slotKey) => {
                  if (!canceledSet.has(String(slotKey))) {
                     next.add(slotKey);
                  }
               });
               out.set(key, next);
            } else if (Array.isArray(val)) {
               const nextArr = val.filter(
                  (slotKey) => !canceledSet.has(String(slotKey))
               );
               out.set(key, nextArr);
            } else {
               out.set(key, val);
            }
         });
         return out;
      }

      if (typeof blockedKeyMap === "object") {
         const outObj = {};
         Object.keys(blockedKeyMap).forEach((instIdRaw) => {
            const val = blockedKeyMap[instIdRaw];
            const instId = String(instIdRaw);
            const canceledSet = canceledKeysByInst.get(instId);
            if (!canceledSet || !canceledSet.size) {
               outObj[instIdRaw] = val;
               return;
            }

            if (val instanceof Set) {
               const next = new Set();
               val.forEach((slotKey) => {
                  if (!canceledSet.has(String(slotKey))) {
                     next.add(slotKey);
                  }
               });
               outObj[instIdRaw] = next;
            } else if (Array.isArray(val)) {
               const nextArr = val.filter(
                  (slotKey) => !canceledSet.has(String(slotKey))
               );
               outObj[instIdRaw] = nextArr;
            } else {
               outObj[instIdRaw] = val;
            }
         });
         return outObj;
      }

      return blockedKeyMap;
   }, [blockedKeyMap, events]);

   const eventsSig = useMemo(
      () => buildEventsSignatureForDay(eventsForCanvas),
      [eventsForCanvas]
   );

   const slotsSig = useMemo(() => buildSlotsSignature(slotGeoms), [slotGeoms]);

   const blockedSig = useMemo(
      () => buildBlockedSignature(blockedKeyMapFiltered, instructors),
      [blockedKeyMapFiltered, instructors]
   );

   const waitSig = useMemo(
      () => buildWaitNotesSignature(waitNotes),
      [waitNotes]
   );

   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const {
         colsCount,
         colWidth,
         colGap,
         headerHeight,
         colsPerRow,
         rowsCount,
         rowGap,
         slotHeight,
         slotGap,
         worldHeight,
         rowHeights,
      } = headerMetrics;

      const hoursColWidth = 0;

      const effectiveCols = Math.min(colsPerRow, colsCount);
      const baseWorldWidth =
         effectiveCols * colWidth + Math.max(0, effectiveCols - 1) * colGap;

      const preGridWidth =
         hasPreGrid && colWidth > 0
            ? preGridCols * colWidth + Math.max(0, preGridCols - 1) * colGap
            : 0;

      const worldWidth = preGridWidth + baseWorldWidth;

      const dpr =
         typeof window !== "undefined"
            ? Math.min(window.devicePixelRatio || 1, DPR_LIMIT)
            : 1;

      const eventsSafe = Array.isArray(eventsForCanvas) ? eventsForCanvas : [];

      const sig = {
         dayStart: dayStart ? ymdStrInTZ(dayStart) : "0",
         dayEnd: dayEnd ? ymdStrInTZ(dayEnd) : "0",
         colsCount,
         colWidth,
         colGap,
         headerHeight,
         rowsCount,
         rowHeights: rowHeights.join(","),
         slotHeight,
         slotGap,
         worldHeight,
         zoom,
         blackoutVer,
         themeTick,
         eventsSig,
         slotsSig,
         blockedSig,
         waitSig,
         highlightId: activeEventId || selectedEventId || null,
         waitEditSlot:
            waitEdit && waitEdit.slotIndex != null
               ? String(waitEdit.slotIndex)
               : "",
      };

      const sigKey = JSON.stringify(sig);

      if (lastDrawSigRef.current === sigKey) {
         return;
      }
      lastDrawSigRef.current = sigKey;

      let width = hoursColWidth + worldWidth;

      const totalRowsHeight =
         rowHeights && rowHeights.length
            ? rowHeights.reduce((sum, h) => sum + (headerHeight + h), 0)
            : rowsCount * (headerHeight + worldHeight);

      let height =
         totalRowsHeight + (rowsCount > 0 ? (rowsCount - 1) * rowGap : 0);

      width = Math.max(width, effectiveCols * colWidth);
      height = Math.max(height, headerHeight + 200);

      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const hitMap = [];
      const highlightEventIdForRender = activeEventId || selectedEventId;

      drawAll({
         ctx,
         width,
         height,
         hoursColWidth,
         headerHeight,
         colWidth,
         colGap,
         colsCount,
         colsPerRow,
         rowsCount,
         rowGap,
         rowHeights,
         instructors,
         events: eventsSafe,
         slotGeoms,
         slotHeight,
         slotGap,
         hitMap,
         blockedKeyMap: blockedKeyMapFiltered || null,
         highlightEventId: highlightEventIdForRender,
         zoom,
         preGrid: hasPreGrid
            ? {
                 columns: preGridCols,
                 rows: preGridRows,
              }
            : null,
         preGridWidth,
         waitNotesMap: waitNotes,
         editingWait: waitEdit
            ? {
                 instId: String(waitEdit.instId),
                 slotIndex: Number(waitEdit.slotIndex || 0),
              }
            : null,
      });

      hitMapRef.current = hitMap;
   }, [
      dayStart,
      dayEnd,
      instructors,
      eventsForCanvas,
      slotGeoms,
      headerMetrics,
      themeTick,
      blackoutVer,
      activeEventId,
      selectedEventId,
      blockedKeyMapFiltered,
      zoom,
      hasPreGrid,
      preGridCols,
      preGridRows,
      waitNotes,
      waitEdit,
      eventsSig,
      slotsSig,
      blockedSig,
      waitSig,
   ]);

   const finishWaitEdit = (commit) => {
      if (waitCommitRef.current) return;
      waitCommitRef.current = true;

      const current = waitEdit;
      setWaitEdit(null);

      if (!commit || !current) return;

      const text = (current.text || "").trim();
      const slotIndex = Number(current.slotIndex ?? 0);

      setWaitNotes((prev) => {
         const next = { ...prev };
         if (text) next[slotIndex] = text;
         else delete next[slotIndex];
         return next;
      });

      if (!text) return;

      const title = String(slotIndex);

      createNote({
         title,
         content: text,
      }).catch((err) => {
         console.error("notesService.createNote (wait-slot) error", err);
      });
   };

   const handleWaitBlur = () => {
      finishWaitEdit(true);
   };

   const handleWaitKeyDown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
         e.preventDefault();
         finishWaitEdit(true);
      } else if (e.key === "Escape") {
         e.preventDefault();
         finishWaitEdit(false);
      }
   };

   useEffect(() => {
      if (!activeEventId) return;
      if (typeof onActiveEventRectChange !== "function") return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const hitMap = hitMapRef.current || [];
      const activeHit = hitMap.find(
         (item) =>
            item.kind === "reservation" &&
            item.ev &&
            String(item.ev.id) === String(activeEventId)
      );
      if (!activeHit) return;

      const canvasRect = canvas.getBoundingClientRect();
      const topY = canvasRect.top + activeHit.y;
      const bottomY = topY + activeHit.h;
      const centerY = (topY + bottomY) / 2;

      onActiveEventRectChange({
         centerY,
         topY,
         bottomY,
         item: activeHit,
         canvasRect,
      });
   }, [activeEventId, onActiveEventRectChange]);

   // CLICK simplu – selectează evenimentul
   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const handleClick = (e) => {
         // dacă abia am făcut long-press, ignorăm click-ul
         if (Date.now() < ignoreClickUntilRef.current) {
            return;
         }

         const rect = canvas.getBoundingClientRect();
         const x = e.clientX - rect.left;
         const y = e.clientY - rect.top;

         const items = hitMapRef.current || [];
         let found = null;

         for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            if (
               x >= item.x &&
               x <= item.x + item.w &&
               y >= item.y &&
               y <= item.y + item.h
            ) {
               if (item.kind === "reservation" || item.kind === "student") {
                  found = item.ev;
                  break;
               }
            }
         }

         if (found && found.id != null) {
            setSelectedEventId(found.id);
         } else {
            setSelectedEventId(null);
         }
      };

      canvas.addEventListener("click", handleClick);
      return () => {
         canvas.removeEventListener("click", handleClick);
      };
   }, []);

   // DUBLUL-CLICK – acțiunile existente (student / rezervare / empty-slot)
   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const handleDblClick = (e) => {
         // după long-press ignorăm dblclick-ul accidental
         if (Date.now() < ignoreClickUntilRef.current) {
            return;
         }

         const rect = canvas.getBoundingClientRect();
         const x = e.clientX - rect.left;
         const y = e.clientY - rect.top;

         const items = hitMapRef.current || [];
         if (!items.length) return;

         for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            if (
               x >= item.x &&
               x <= item.x + item.w &&
               y >= item.y &&
               y <= item.y + item.h
            ) {
               if (item.kind === "wait-slot") {
                  const slotIndex =
                     typeof item.slotIndex === "number" ? item.slotIndex : 0;
                  const key = String(slotIndex);
                  const existingText =
                     waitNotes[key] || waitNotes[slotIndex] || "";

                  waitCommitRef.current = false;
                  setWaitEdit({
                     instId: item.instructorId,
                     slotIndex,
                     x: item.x,
                     y: item.y,
                     w: item.w,
                     h: item.h,
                     text: existingText,
                  });
               } else if (item.kind === "student") {
                  const ev = item.ev;
                  requestAnimationFrame(() => {
                     openStudentPopup(ev);
                  });
               } else if (item.kind === "reservation") {
                  const ev = item.ev;
                  requestAnimationFrame(() => {
                     openReservationPopup(ev);
                  });
               } else if (
                  item.kind === "empty-slot" &&
                  typeof onCreateSlot === "function"
               ) {
                  const payload = {
                     instructorId: item.instructorId,
                     start: new Date(item.slotStart),
                     end: new Date(item.slotEnd),
                  };
                  requestAnimationFrame(() => {
                     onCreateSlot(payload);
                  });
               }
               break;
            }
         }
      };

      canvas.addEventListener("dblclick", handleDblClick);
      return () => {
         canvas.removeEventListener("dblclick", handleDblClick);
      };
   }, [onCreateSlot, waitNotes]);

   // LONG-PRESS (HOLD) – deschide profilul studentului pe toată caseta
   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const getHitAt = (e) => {
         const rect = canvas.getBoundingClientRect();
         const x = e.clientX - rect.left;
         const y = e.clientY - rect.top;

         const items = hitMapRef.current || [];
         for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            if (
               x >= item.x &&
               x <= item.x + item.w &&
               y >= item.y &&
               y <= item.y + item.h
            ) {
               return item;
            }
         }
         return null;
      };

      const clearLongPress = () => {
         if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
         }
         longPressTargetRef.current = null;
      };

      const handlePointerDown = (e) => {
         // doar button principal (mouse) sau touch
         if (e.button !== 0 && e.button !== undefined) return;

         const hit = getHitAt(e);
         if (!hit) return;
         if (hit.kind !== "reservation" && hit.kind !== "student") return;

         longPressTargetRef.current = hit.ev;

         longPressTimerRef.current = window.setTimeout(() => {
            const ev = longPressTargetRef.current;
            if (!ev) return;

            // blocăm click/dblclick-urile care vin imediat după hold
            ignoreClickUntilRef.current = Date.now() + 500;

            longPressTargetRef.current = null;
            longPressTimerRef.current = null;

            requestAnimationFrame(() => {
               openStudentPopup(ev);
            });
         }, 600); // ms până la long-press (poți ajusta 500–700)
      };

      const handlePointerUp = () => {
         clearLongPress();
      };

      const handlePointerLeave = () => {
         clearLongPress();
      };

      const handlePointerCancel = () => {
         clearLongPress();
      };

      canvas.addEventListener("pointerdown", handlePointerDown);
      canvas.addEventListener("pointerup", handlePointerUp);
      canvas.addEventListener("pointerleave", handlePointerLeave);
      canvas.addEventListener("pointercancel", handlePointerCancel);

      return () => {
         canvas.removeEventListener("pointerdown", handlePointerDown);
         canvas.removeEventListener("pointerup", handlePointerUp);
         canvas.removeEventListener("pointerleave", handlePointerLeave);
         canvas.removeEventListener("pointercancel", handlePointerCancel);
      };
   }, []);

   const {
      colWidth,
      colGap,
      headerHeight,
      colsPerRow,
      rowGap,
      worldHeight,
      rowTops,
   } = headerMetrics;

   const preGridWidth2 =
      hasPreGrid && colWidth > 0
         ? preGridCols * colWidth + Math.max(0, preGridCols - 1) * colGap
         : 0;

   return (
      <div
         style={{
            position: "relative",
            flex: "0 0 auto",
         }}
      >
         <canvas ref={canvasRef} />

         {waitEdit && (
            <div
               style={{
                  position: "absolute",
                  left: waitEdit.x,
                  top: waitEdit.y,
                  width: waitEdit.w,
                  height: waitEdit.h,
                  pointerEvents: "auto",
                  zIndex: 3,
                  display: "flex",
                  alignItems: "stretch",
                  justifyContent: "center",
               }}
            >
               <textarea
                  ref={waitInputRef}
                  className="dv-wait-input"
                  placeholder={WAIT_PLACEHOLDER_TEXT}
                  value={waitEdit.text}
                  onChange={(e) => {
                     const val = e.target.value;
                     setWaitEdit((prev) =>
                        prev ? { ...prev, text: val } : prev
                     );
                  }}
                  onBlur={handleWaitBlur}
                  onKeyDown={handleWaitKeyDown}
                  style={{
                     width: "100%",
                     height: "100%",
                     fontSize: `${10 * z}px`,
                     padding: "4px 8px",
                     borderRadius: "18px",
                     border: "none",
                     color: "var(--white-p, #f5f5f5)",
                     fontWeight: 300,
                     outline: "none",
                     resize: "none",
                     lineHeight: 1.25,
                     whiteSpace: "pre-wrap",
                     overflowY: "auto",
                  }}
               />
            </div>
         )}

         <div
            className="dv-canvas-header-layer"
            style={{
               position: "absolute",
               left: 0,
               top: 0,
               width: "100%",
               height: "100%",
               pointerEvents: "none",
               zIndex: 2,
            }}
         >
            {instructors.map((inst, idx) => {
               const row = Math.floor(idx / colsPerRow);
               const col = idx % colsPerRow;
               const rowTop =
                  rowTops[row] ?? row * (headerHeight + worldHeight + rowGap);
               const colLeft = preGridWidth2 + col * (colWidth + colGap);

               return (
                  <CanvasInstructorHeader
                     key={inst?.id ?? idx}
                     inst={inst}
                     dayDate={dayStart}
                     cars={cars}
                     instructorsFull={instructorsFull}
                     users={users}
                     zoom={zoom}
                     style={{
                        left: colLeft,
                        top: rowTop,
                        width: colWidth,
                        height: headerHeight,
                     }}
                  />
               );
            })}
         </div>
      </div>
   );
}

export default memo(DayviewCanvasTrack);
