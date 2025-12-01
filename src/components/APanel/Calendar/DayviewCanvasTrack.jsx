import React, {
   useRef,
   useLayoutEffect,
   useEffect,
   useState,
   useMemo,
   useCallback,
   memo,
} from "react";
import { useDispatch } from "react-redux";
import { openPopup } from "../../Utils/popupStore";
import { updateUser } from "../../../store/usersSlice";

const MOLDOVA_TZ = "Europe/Chisinau";

// 🔹 limităm rezoluția reală a canvas-ului (anti-lag de la DPR mare)
const DPR_LIMIT = 1;

// 🔹 putem opri hit separat pe numele studentului (mai puține rect-uri în hitMap)
const ENABLE_STUDENT_HITS = false;

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

// cache pentru HH:MM
const HHMM_FMT = new Intl.DateTimeFormat("ro-RO", {
   timeZone: MOLDOVA_TZ,
   hour: "2-digit",
   minute: "2-digit",
   hour12: false,
});

// cache pentru partsInTZ
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

/** Format HH:MM în timezone Moldova */
function formatHHMM(val) {
   const d = val instanceof Date ? val : new Date(val);
   if (Number.isNaN(d.getTime())) return "";
   return HHMM_FMT.format(d);
}

/** desenare rect cu colțuri rotunjite */
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

/** Rezolvă CSS var sau lasă culoarea așa cum e (cu cache) */
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

   // var(--event-green)
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

/** map DB -> variabile CSS pentru events */
const EVENT_COLOR_MAP = {
   DEFAULT: "--event-default",
   RED: "--event-red",
   ORANGE: "--event-orange",
   YELLOW: "--event-yellow",
   GREEN: "--event-green",
   BLUE: "--event-blue",
   INDIGO: "--event-indigo",
   PURPLE: "--event-purple",
   PINK: "--event-pink",
};

/** Transformă valoarea din DB într-o culoare reală pentru canvas */
function normalizeEventColor(dbColor) {
   if (!dbColor) return "--event-default";

   const v = String(dbColor).trim();

   if (/^#|^rgb|^hsl/.test(v)) return v;

   if (v.startsWith("var(") || v.startsWith("--")) return v;

   const key = v.toUpperCase();
   const cssVar = EVENT_COLOR_MAP[key] || "--event-default";
   return cssVar;
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

/* ================== GEOMETRIE SLOTURI ================== */

const CONTENT_PAD_TOP = 0;
const CONTENT_PAD_BOTTOM = 4;

function computeWorldHeight(slotsCount, slotHeight, slotGap) {
   if (!slotsCount) return 0;
   return (
      CONTENT_PAD_TOP +
      slotsCount * slotHeight +
      Math.max(0, slotsCount - 1) * slotGap +
      CONTENT_PAD_BOTTOM
   );
}

/* ================== UTILS PENTRU CHEI LOCALE (BLACKOUTS) ================== */

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
               padding: "8px 10px 4px",
               gap: 2,
               cursor: isPad ? "default" : "text",
               pointerEvents: isPad ? "none" : "auto",
               color: "var(--white-p)",
               lineHeight: 1.15,
               ...style,
            }}
            onDoubleClick={(e) => {
               e.stopPropagation();
               openEditor();
            }}
         >
            <div className="dv-inst-name">
               {displayName || "\u00A0"}
               {!isEditing && todaysText && (
                  <span className="dv-inst-notes">
                     {" / "}
                     {todaysText}
                  </span>
               )}
            </div>

            {!isEditing && (displayPlate || displayInstPhone) && (
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
                  style={{ width: "100%" }}
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
         prev.users === next.users
      );
   }
);

/* ================== DESENARE CANVAS ================== */

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
   instructors,
   events,
   slotGeoms,
   slotHeight,
   slotGap,
   hitMap,
   blockedKeyMap,
   highlightEventId,
}) {
   if (!ctx || !width || !height) return;

   const slotsCount = slotGeoms.length || 0;
   const worldHeight = computeWorldHeight(slotsCount, slotHeight, slotGap);

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
   const emptySlotBg = resolveColor("--black-t");
   const emptySlotTextColor = resolveColor("--white-s");
   const blackoutFillColor = resolveColor("--event-red");
   const blackoutBorderColor = baseBg;
   const eventTextColor = resolveColor("--white-p");
   const activeBorderColor = resolveColor("--event-yellow");

   ctx.save();
   ctx.clearRect(0, 0, width, height);

   for (let row = 0; row < rowsCount; row++) {
      const rowTop = row * (headerHeight + worldHeight + rowGap);
      const rowContentTop = rowTop + headerHeight;

      const rowStartIdx = row * colsPerRow;
      const colsInThisRow = Math.min(
         colsPerRow,
         Math.max(0, colsCount - rowStartIdx)
      );

      for (let c = 0; c < colsInThisRow; c++) {
         const instIdx = rowStartIdx + c;
         const inst = instructors[instIdx];
         if (!inst) continue;

         const colX = hoursColWidth + c * (colWidth + colGap);
         const w = colWidth;

         const instId = String(inst.id ?? "");
         const instEvents = eventsByInst[instId] || [];
         const instBlockedSet = blockedKeyMap
            ? blockedKeyMap.get(instId) || null
            : null;

         // ===== 1) background coloană instructor (gradient păstrat) =====
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
         }

         const colHeight = headerHeight + worldHeight;
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
         drawRoundRect(ctx, colX, rowTop, w, colHeight, 24);
         ctx.fill();
         ctx.restore();

         // ===== 2) SLOTURI GOALE (inclusiv blackout-uri) =====
         const slotAreaTop = rowContentTop + CONTENT_PAD_TOP;

         for (const sg of slotGeoms) {
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
            const isBlocked =
               !!instBlockedSet && slotKey && instBlockedSet.has(slotKey);

            ctx.save();

            // 🔹 fără transparență: culori solide pentru blackout / normal
            ctx.fillStyle = isBlocked ? blackoutFillColor : emptySlotBg;

            drawRoundRect(ctx, slotX, slotY, slotW, slotH, 18);
            ctx.fill();

            if (isBlocked) {
               ctx.lineWidth = 1;
               ctx.strokeStyle = blackoutBorderColor;
               drawRoundRect(
                  ctx,
                  slotX + 1,
                  slotY + 1,
                  slotW - 2,
                  slotH - 2,
                  18
               );
               ctx.stroke();
            }

            ctx.fillStyle = emptySlotTextColor;
            ctx.font =
               "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
            ctx.textBaseline = "top";
            ctx.fillText(sg.label || "", slotX + 10, slotY + 10);

            ctx.restore();

            if (hitMap && sg.slot?.start && sg.slot?.end) {
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
            }
         }

         // ===== 3) EVENIMENTE =====
         for (const ev of instEvents) {
            const startLabel = formatHHMM(ev.start);
            let slotIdx = slotIndexByLabel.get(startLabel);

            if (slotIdx == null) {
               let bestIdx = 0;
               let bestDiff = Infinity;
               const evMs = ev.start.getTime();
               slotGeoms.forEach((sg, idx) => {
                  const diff = Math.abs(evMs - sg.startMs);
                  if (diff < bestDiff) {
                     bestDiff = diff;
                     bestIdx = idx;
                  }
               });
               slotIdx = bestIdx;
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
            const isBlockedEvent =
               !!instBlockedSet && evLocalKey && instBlockedSet.has(evLocalKey);

            const isHighlighted =
               highlightEventId && String(ev.id) === String(highlightEventId);

            ctx.save();

            // 🔹 fără globalAlpha – totul opac, ca să fie mai ieftin
            ctx.fillStyle = color;

            const radius = 18;
            drawRoundRect(ctx, cardX, cardY, cardW, cardH, radius);
            ctx.fill();

            ctx.fillStyle = eventTextColor;
            ctx.font =
               "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
            ctx.textBaseline = "top";

            const paddingX = 10;
            const textX = cardX + paddingX;
            let textY = cardY + 10;
            const lineH = 13;

            const metaParts = [startLabel];
            if (ev.gearboxLabel) metaParts.push(ev.gearboxLabel);
            const metaLine = metaParts.join(" · ");
            if (metaLine) {
               ctx.fillText(metaLine, textX, textY);
               textY += lineH;
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

            const bothNotes = [
               noteFromEvent && `${noteFromEvent}`,
               noteFromProfile && `${noteFromProfile}`,
            ]
               .filter(Boolean)
               .join(" — ");

            let nameY = null;

            if (person) {
               const nameStr =
                  person.length > 26 ? person.slice(0, 23) + "…" : person;
               nameY = textY;
               ctx.fillText(nameStr, textX, textY);
               textY += lineH;
            }

            if (phoneVal) {
               const phoneStr =
                  phoneVal.length > 26 ? phoneVal.slice(0, 23) + "…" : phoneVal;
               ctx.fillText(phoneStr, textX, textY);
               textY += lineH;
            }

            if (bothNotes) {
               let noteStr = bothNotes.replace(/\s+/g, " ").trim();
               if (noteStr.length > 40) noteStr = noteStr.slice(0, 37) + "…";
               ctx.font =
                  "10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
               ctx.fillText(noteStr, textX, textY);
            }

            // 🔹 event în interval blackout = border simplu solid
            if (isBlockedEvent) {
               ctx.lineWidth = 1.3;
               ctx.strokeStyle = blackoutBorderColor;
               drawRoundRect(
                  ctx,
                  cardX + 1,
                  cardY + 1,
                  cardW - 2,
                  cardH - 2,
                  radius
               );
               ctx.stroke();
            }

            // 🔹 highlight pentru evenimentul activ (search sau select la click)
            if (isHighlighted) {
               ctx.lineWidth = 2;
               ctx.strokeStyle = activeBorderColor;
               drawRoundRect(
                  ctx,
                  cardX + 1,
                  cardY + 1,
                  cardW - 2,
                  cardH - 2,
                  radius
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

               if (ENABLE_STUDENT_HITS && nameY !== null) {
                  hitMap.push({
                     x: cardX,
                     y: nameY - 2,
                     w: cardW,
                     h: lineH + 4,
                     kind: "student",
                     reservationId,
                     ev,
                  });
               }
            }
         }
      }
   }

   ctx.restore();
}

/* ================== COMPONENTĂ REACT ================== */

function DayviewCanvasTrack({
   dayStart,
   dayEnd,
   instructors = [],
   events = [],
   slots = [],
   layout = {},
   timeMarks = DEFAULT_TIME_MARKS,
   onCreateSlot,
   blockedKeyMap,
   blackoutVer = 0,
   activeEventId = null,
   onActiveEventRectChange,
   cars = [],
   instructorsFull = [],
   users = [],
}) {
   const canvasRef = useRef(null);
   const hitMapRef = useRef([]);

   const [themeTick, setThemeTick] = useState(0);
   // 🔹 selecție la click – border galben
   const [selectedEventId, setSelectedEventId] = useState(null);

   // observer de theme
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

   const layoutColWidthRaw = Number(layout.colWidth) || 150;
   const layoutColWidth = layoutColWidthRaw;

   const layoutColGap = Number(layout.colGap) || 12;
   const layoutHeaderHeight = Math.max(Number(layout.headerHeight) || 0, 40);
   const layoutColsPerRow = Number(layout.colsPerRow) || 3;
   const layoutRowGap = layout.rowGap != null ? Number(layout.rowGap) || 0 : 24;

   const layoutSlotHeight =
      Number(layout.slotHeight) > 0 ? Number(layout.slotHeight) : 50;
   const layoutSlotGap = 4;

   const headerMetrics = useMemo(() => {
      const colsCount = Math.max(1, instructors.length || 1);
      const colWidth = layoutColWidth;
      const colGap = layoutColGap;
      const headerHeight = layoutHeaderHeight;
      const colsPerRow = layoutColsPerRow;
      const rowsCount = Math.max(1, Math.ceil(colsCount / colsPerRow));
      const rowGap = layoutRowGap;

      const slotHeight = layoutSlotHeight;
      const slotGap = layoutSlotGap;
      const slotsCount = Array.isArray(slots) ? slots.length : 0;
      const worldHeight = computeWorldHeight(slotsCount, slotHeight, slotGap);

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
      };
   }, [
      instructors.length,
      layoutColWidth,
      layoutColGap,
      layoutHeaderHeight,
      layoutColsPerRow,
      layoutRowGap,
      layoutSlotHeight,
      layoutSlotGap,
      slots,
   ]);

   // slotGeoms memoizat
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

   useLayoutEffect(() => {
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
      } = headerMetrics;

      const hoursColWidth = 0;

      const slotsCount = slotGeoms.length || 0;
      const worldHeight = computeWorldHeight(slotsCount, slotHeight, slotGap);

      const effectiveCols = Math.min(colsPerRow, colsCount);
      const worldWidth =
         effectiveCols * colWidth + Math.max(0, effectiveCols - 1) * colGap;

      const dpr =
         typeof window !== "undefined"
            ? Math.min(window.devicePixelRatio || 1, DPR_LIMIT)
            : 1;

      let width = hoursColWidth + worldWidth;
      let height =
         rowsCount * (headerHeight + worldHeight) + (rowsCount - 1) * rowGap;

      width = Math.max(width, effectiveCols * colWidth);
      height = Math.max(height, headerHeight + 200);

      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const eventsSafe = Array.isArray(events) ? events : [];

      const hitMap = [];
      const { colsCount: cc } = headerMetrics;

      // 🔹 highlight = search sau selecția locală
      const highlightEventId = activeEventId || selectedEventId;

      drawAll({
         ctx,
         width,
         height,
         hoursColWidth,
         headerHeight,
         colWidth,
         colGap,
         colsCount: cc,
         colsPerRow,
         rowsCount,
         rowGap,
         instructors,
         events: eventsSafe,
         slotGeoms,
         slotHeight,
         slotGap,
         hitMap,
         blockedKeyMap: blockedKeyMap || null,
         highlightEventId,
      });

      hitMapRef.current = hitMap;

      if (
         typeof onActiveEventRectChange === "function" &&
         highlightEventId != null
      ) {
         const activeHit = hitMap.find(
            (item) =>
               item.kind === "reservation" &&
               item.ev &&
               String(item.ev.id) === String(highlightEventId)
         );
         if (activeHit) {
            const canvasRect = canvas.getBoundingClientRect();
            const topY = canvasRect.top + activeHit.y;
            const bottomY = canvasRect.top + activeHit.y + activeHit.h;
            const centerY = (topY + bottomY) / 2;

            onActiveEventRectChange({
               topY,
               bottomY,
               centerY,
               item: activeHit,
               canvasRect,
            });
         }
      }
   }, [
      dayStart,
      dayEnd,
      instructors,
      events,
      slotGeoms,
      headerMetrics,
      themeTick,
      blackoutVer,
      activeEventId,
      selectedEventId,
      onActiveEventRectChange,
      blockedKeyMap,
   ]);

   // 🔹 click simplu = doar selectează event (border galben)
   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const handleClick = (e) => {
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

   // 🔹 dublu-click = comportamentul vechi: popup / create slot
   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const handleDblClick = (e) => {
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
               if (item.kind === "student") {
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
   }, [onCreateSlot]);

   const { colWidth, colGap, headerHeight, colsPerRow, rowGap, worldHeight } =
      headerMetrics;

   return (
      <div
         style={{
            position: "relative",
            flex: "0 0 auto",
         }}
      >
         <canvas ref={canvasRef} />

         {/* Layer DOM peste canvas pentru header-ul de instructor */}
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
               const rowTop = row * (headerHeight + worldHeight + rowGap);
               const colLeft = col * (colWidth + colGap);

               return (
                  <CanvasInstructorHeader
                     key={inst?.id ?? idx}
                     inst={inst}
                     dayDate={dayStart}
                     cars={cars}
                     instructorsFull={instructorsFull}
                     users={users}
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
