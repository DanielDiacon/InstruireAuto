// src/components/APanel/Calendar/dayview/utils.js

/* ================== CONSTANTE ================== */

export const MOLDOVA_TZ = "Europe/Chisinau";

export const DEFAULT_TIME_MARKS = [
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

// 🔹 orele “logice” pentru notițele din Așteptări (6 pe zi)
export const WAIT_NOTE_TIME_MARKS = [
   "07:00",
   "08:30",
   "10:00",
   "11:30",
   "13:30",
   "15:00",
];

// Așteptări = 3 sloturi / coloană (UI)
export const WAIT_SLOTS_PER_COLUMN = 3;
// Anulari = 3 sloturi / coloană (UI)
export const CANCEL_SLOTS_PER_COLUMN = 3;

// 👉 ID fix pentru coloana "Laterala"
export const LATERAL_PAD_ID = "__pad_4";

// 👉 orele virtuale pentru Laterala
export const LATERAL_TIME_MARKS = [
   "00:00",
   "00:30",
   "01:00",
   "02:00",
   "02:30",
   "03:00",
   "03:30",
   "04:00",
   "04:30",
];

export const LATERAL_SLOTS_PER_COLUMN = LATERAL_TIME_MARKS.length;

export const WAIT_PLACEHOLDER_TEXT = "Scrie aici";

// Cache global pentru wait notes pe range: "YYYY-MM-DD|YYYY-MM-DD"
export const WAIT_NOTES_CACHE = new Map();

/* ================== FORMAT HELPERS ================== */

const HHMM_FMT = new Intl.DateTimeFormat("ro-RO", {
   timeZone: MOLDOVA_TZ,
   hour: "2-digit",
   minute: "2-digit",
   hour12: false,
});

const TZ_PARTS_FMT = new Intl.DateTimeFormat("en-GB", {
   timeZone: MOLDOVA_TZ,
   hour12: false,
   year: "numeric",
   month: "2-digit",
   day: "2-digit",
   hour: "2-digit",
   minute: "2-digit",
   second: "2-digit",
});

export function formatHHMM(val) {
   const d = val instanceof Date ? val : new Date(val);
   if (Number.isNaN(d.getTime())) return "";
   return HHMM_FMT.format(d);
}

/* ================== STRING HELPERS ================== */

export const digits = (s = "") => String(s).replace(/\D+/g, "");
export const norm = (s = "") =>
   s
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

export const ymd = (d) => {
   const dt = d instanceof Date ? d : new Date(d);
   const Y = dt.getFullYear();
   const M = String(dt.getMonth() + 1).padStart(2, "0");
   const D = String(dt.getDate()).padStart(2, "0");
   return `${Y}-${M}-${D}`;
};

/* ================== NOTE (privateMessage) helpers ================== */

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

export function getNoteForDate(pm, dateObj) {
   const target = ymd(dateObj);
   const all = extractCanonLines(pm);
   const hit = all.find((x) => x.dateStr === target);
   return hit ? hit.text : "";
}

export function upsertNoteForDate(pm, dateObj, newText) {
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

/* ================== Event helpers ================== */

export function getStudentPrivateMessageFromEv(ev) {
   const v =
      ev?.privateMessage ??
      ev?.student?.privateMessage ??
      ev?.raw?.student?.privateMessage ??
      ev?.raw?.user?.privateMessage ??
      "";
   return typeof v === "string" ? v : String(v ?? "");
}

// telefonul studentului (user), nu al instructorului
export function getStudentPhoneFromEv(ev) {
   const raw = ev?.raw || {};
   const v =
      ev?.studentPhone ??
      raw?.clientPhone ??
      raw?.phoneNumber ??
      raw?.phone ??
      raw?.user?.phone ??
      raw?.user?.phoneNumber ??
      "";
   return typeof v === "string" ? v.trim() : String(v ?? "").trim();
}

export function slotOverlapsEvents(slotStartMs, slotEndMs, eventsForInst = []) {
   if (!eventsForInst.length) return false;
   for (const ev of eventsForInst) {
      const s = ev.start.getTime();
      const e = ev.end.getTime();
      if (s < slotEndMs && e > slotStartMs) return true;
   }
   return false;
}

export function isEventCanceled(ev) {
   if (!ev) return false;
   const raw = ev.raw || {};
   return raw.isCancelled === true;
}

/* ================== Instructor helpers ================== */

export function isAutoInstructor(inst, cars = []) {
   if (!inst) return false;

   const rawGear = (
      inst.gearbox ||
      inst.gearboxType ||
      inst.carGearbox ||
      inst.transmission ||
      ""
   )
      .toString()
      .toLowerCase();

   if (rawGear.includes("auto")) return true;
   if (rawGear.includes("mec")) return false;

   const idStr = String(inst.id ?? "");
   if (!idStr || !Array.isArray(cars)) return false;

   const car = cars.find(
      (c) => String(c.instructorId ?? c.instructor_id ?? "") === idStr
   );
   if (!car) return false;

   const carGear = (car.gearbox || car.gearboxType || car.transmission || "")
      .toString()
      .toLowerCase();

   if (carGear.includes("auto")) return true;
   if (carGear.includes("mec")) return false;

   return false; // default mecanic
}

export function isBuiucaniInstructor(inst) {
   if (!inst) return false;
   const sectorRaw = (inst.sectorSlug ?? inst.sector ?? inst.sectorName ?? "")
      .toString()
      .toLowerCase();

   return sectorRaw.includes("buiucani");
}

export function getInstructorSector(inst) {
   if (!inst) return "other";
   const sectorRaw = (inst.sectorSlug ?? inst.sector ?? inst.sectorName ?? "")
      .toString()
      .toLowerCase();

   if (sectorRaw.includes("botanica")) return "botanica";
   if (sectorRaw.includes("ciocana")) return "ciocana";
   if (sectorRaw.includes("buiucani")) return "buiucani";
   return "other";
}

/* ================== TZ helpers ================== */

export function partsInTZ(dateLike, timeZone = MOLDOVA_TZ) {
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

   const p = TZ_PARTS_FMT.formatToParts(d);
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

export function ymdStrInTZ(dateLike, timeZone = MOLDOVA_TZ) {
   const { y, m, d } = partsInTZ(dateLike, timeZone);
   return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function hhmmInTZ(dateLike, timeZone = MOLDOVA_TZ) {
   const { H, M } = partsInTZ(dateLike, timeZone);
   return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
}

export function tzOffsetMinutesAt(tsMs, timeZone = MOLDOVA_TZ) {
   const { y, m, d, H, M, S } = partsInTZ(tsMs, timeZone);
   const asUTC = Date.UTC(y, m - 1, d, H, M, S);
   return (asUTC - tsMs) / 60000;
}

export function toUtcIsoFromMoldova(localDateObj, timeStrHHMM) {
   const [hh, mm] = (timeStrHHMM || "00:00").split(":").map(Number);
   const utcGuess = Date.UTC(
      localDateObj.getFullYear(),
      localDateObj.getMonth(),
      localDateObj.getDate(),
      hh,
      mm,
      0,
      0
   );
   const offMin = tzOffsetMinutesAt(utcGuess, MOLDOVA_TZ);
   const fixedUtcMs = utcGuess - offMin * 60000;
   return new Date(fixedUtcMs).toISOString();
}

export const toUtcIsoFromLocal = toUtcIsoFromMoldova;

export function isoForDbMatchLocalHour(isoUtcFromMoldova) {
   const base = new Date(isoUtcFromMoldova);
   const offMin = tzOffsetMinutesAt(base.getTime(), MOLDOVA_TZ);
   const shifted = new Date(base.getTime() + offMin * 60000);

   const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: MOLDOVA_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
   }).formatToParts(shifted);

   const Y = parts.find((p) => p.type === "year").value;
   const Mo = parts.find((p) => p.type === "month").value;
   const Da = parts.find((p) => p.type === "day").value;
   const HH = parts.find((p) => p.type === "hour").value;
   const MM = parts.find((p) => p.type === "minute").value;

   const offMin2 = tzOffsetMinutesAt(shifted.getTime(), MOLDOVA_TZ);
   const sign = offMin2 >= 0 ? "+" : "-";
   const abs = Math.abs(offMin2);
   const offHH = String(Math.floor(abs / 60)).padStart(2, "0");
   const offMM2 = String(abs % 60).padStart(2, "0");

   return `${Y}-${Mo}-${Da}T${HH}:${MM}:00${sign}${offHH}:${offMM2}`;
}

export function localDateObjFromStr(s) {
   const [y, m, d] = String(s || "")
      .split("-")
      .map(Number);
   return new Date(y || 1970, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

/** Chei locale stabile: "YYYY-MM-DD|HH:mm" */
export function localKeyFromTs(dateLike, timeZone = MOLDOVA_TZ) {
   return `${ymdStrInTZ(dateLike, timeZone)}|${hhmmInTZ(dateLike, timeZone)}`;
}

/** construit startTime pentru DB pornind de la slotStart (ISO) */
export function buildStartTimeForSlot(slotStartIso) {
   if (!slotStartIso) return null;
   const dt = new Date(slotStartIso);
   if (Number.isNaN(dt.getTime())) return null;
   const dayStr = ymdStrInTZ(dt, MOLDOVA_TZ);
   const hhmm = hhmmInTZ(dt, MOLDOVA_TZ);
   const localDay = localDateObjFromStr(dayStr);
   const rawIso = toUtcIsoFromLocal(localDay, hhmm);
   return isoForDbMatchLocalHour(rawIso);
}

/** Slot virtual în aceeași zi, dar la ora HH:MM (folosit pentru Laterala) */
export function buildVirtualSlotForDayHHMM(dayLike, hhmm) {
   if (!dayLike || !hhmm) return null;
   try {
      const dayStr = ymdStrInTZ(dayLike, MOLDOVA_TZ);
      const localDay = localDateObjFromStr(dayStr);
      const isoStart = toUtcIsoFromLocal(localDay, hhmm);
      const start = new Date(isoStart);
      if (Number.isNaN(start.getTime())) return null;
      const end = new Date(start.getTime() + 60 * 60000);
      return { start, end };
   } catch (e) {
      console.error("buildVirtualSlotForDayHHMM error", e);
      return null;
   }
}

/* ================== Wait-notes helpers ================== */

/**
 * Notițele merg pe server “cu offset”, ca la programări/blackouts.
 */
export function buildWaitNoteDateIsoForSlot(
   dayLike,
   slotIndex,
   busyKeysMode = "local-match"
) {
   if (slotIndex == null) return null;
   const idx = Number(slotIndex);
   if (Number.isNaN(idx) || idx < 0 || idx >= WAIT_NOTE_TIME_MARKS.length) {
      return null;
   }

   const timeStr = WAIT_NOTE_TIME_MARKS[idx];
   if (!dayLike || !timeStr) return null;

   try {
      const dayStr = ymdStrInTZ(dayLike, MOLDOVA_TZ);
      const localDay = localDateObjFromStr(dayStr);
      const rawIso = toUtcIsoFromLocal(localDay, timeStr);

      return busyKeysMode === "local-match"
         ? isoForDbMatchLocalHour(rawIso)
         : rawIso;
   } catch (e) {
      console.error("buildWaitNoteDateIsoForSlot error", e);
      return null;
   }
}

/** extrage indexul de slot (0..5) din `date` de notiță, după ora locală */
export function slotIndexFromWaitNoteDate(dateLike) {
   if (!dateLike) return null;
   const hhmm = hhmmInTZ(dateLike, MOLDOVA_TZ);
   const idx = WAIT_NOTE_TIME_MARKS.indexOf(hhmm);
   return idx === -1 ? null : idx;
}

/**
 * Normalizează răspunsul de la API pentru notițele din Așteptări.
 */
export function normalizeWaitNotesInput(raw, dayStart) {
   if (!raw) return {};

   let list = [];

   if (Array.isArray(raw)) list = raw;
   else if (Array.isArray(raw.items)) list = raw.items;
   else if (Array.isArray(raw.notes)) list = raw.notes;
   else if (Array.isArray(raw.results)) list = raw.results;
   else if (Array.isArray(raw.data)) list = raw.data;
   else if (
      typeof raw === "object" &&
      Object.values(raw).every((v) => typeof v === "string")
   ) {
      const outMap = {};
      for (const [k, v] of Object.entries(raw)) {
         const idx = Number(k);
         const text = String(v || "").trim();
         if (!Number.isNaN(idx) && text) outMap[idx] = { id: null, text };
      }
      return outMap;
   } else if (typeof raw === "object") {
      for (const v of Object.values(raw)) {
         if (Array.isArray(v)) list.push(...v);
      }
   }

   if (!list.length) return {};

   const targetDay = dayStart ? ymdStrInTZ(dayStart, MOLDOVA_TZ) : null;
   const out = {};

   for (const note of list) {
      if (!note) continue;

      const dateLike =
         note.date ||
         note.startTime ||
         note.start_time ||
         note.datetime ||
         note.time ||
         note.createdAt ||
         null;

      if (targetDay && dateLike) {
         const dayStr = ymdStrInTZ(dateLike, MOLDOVA_TZ);
         if (dayStr !== targetDay) continue;
      }

      let idx = null;
      if (note.slotIndex != null) idx = Number(note.slotIndex);
      else if (note.title != null && /^\d+$/.test(String(note.title)))
         idx = Number(note.title);

      if (idx == null) continue;
      if (idx < 0 || idx >= WAIT_NOTE_TIME_MARKS.length) continue;

      const rawText =
         note.content ??
         note.text ??
         note.note ??
         note.message ??
         note.body ??
         "";

      const text = String(rawText || "").trim();
      if (!text) continue;

      const id =
         note.id ??
         note._id ??
         note.noteId ??
         note.note_id ??
         (note.note && (note.note.id ?? note.note._id)) ??
         null;

      out[idx] = { id, text };
   }

   return out;
}

/* ================== Blocked helpers ================== */

export function getBlockedSetForInstructor(blockedKeyMap, instId) {
   if (!blockedKeyMap || instId == null) return null;

   const idStr = String(instId);
   const idNum = Number(idStr);
   const possibleKeys = [idStr];

   if (!Number.isNaN(idNum)) possibleKeys.push(idNum);

   if (blockedKeyMap instanceof Map) {
      for (const k of possibleKeys) {
         if (blockedKeyMap.has(k)) return blockedKeyMap.get(k);
      }
      return null;
   }

   if (typeof blockedKeyMap === "object") {
      for (const k of possibleKeys) {
         if (blockedKeyMap[k] != null) return blockedKeyMap[k];
      }
   }

   return null;
}

export function buildBlockedMapFromBlackoutsList(list) {
   if (!Array.isArray(list) || !list.length) return null;

   const map = new Map();

   for (const item of list) {
      if (!item) continue;

      const instId =
         item.instructorId ??
         item.instructor_id ??
         (item.instructor && (item.instructor.id ?? item.instructorId)) ??
         null;
      if (instId == null) continue;

      const rawDateTime =
         item.dateTime ?? item.datetime ?? item.startTime ?? item.time ?? null;
      if (!rawDateTime) continue;

      const d = new Date(rawDateTime);
      if (!Number.isFinite(d.getTime())) continue;

      const localKey = localKeyFromTs(d);

      const keyInstStr = String(instId);
      let set = map.get(keyInstStr);
      if (!set) {
         set = new Set();
         map.set(keyInstStr, set);
      }
      set.add(localKey);
   }

   return map;
}
