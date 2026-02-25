/* eslint-env worker */
/* eslint-disable no-restricted-globals */

var DEFAULT_LESSON_MINUTES = 90;
var MOLDOVA_TZ_ID = "Europe/Chisinau";

var TZ_PARTS_FMT_MAIN = null;
try {
   TZ_PARTS_FMT_MAIN = new Intl.DateTimeFormat("en-GB", {
      timeZone: MOLDOVA_TZ_ID,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
   });
} catch (_err) {
   TZ_PARTS_FMT_MAIN = null;
}

var scene = {
   monthKey: "",
   timeZone: MOLDOVA_TZ_ID,
   lessonMinutes: DEFAULT_LESSON_MINUTES,
   studentsById: {},
   groupNameById: {},
   instructorMetaById: {},
   entriesByKey: new Map(),
};

function firstDefined() {
   for (var i = 0; i < arguments.length; i++) {
      var value = arguments[i];
      if (value !== null && value !== undefined) return value;
   }
   return null;
}

function normalizeEntityId(value) {
   if (value === null || value === undefined) return null;
   var out = String(value).trim();
   return out ? out : null;
}

function toFloatingDate(val) {
   if (!val) return null;
   if (val instanceof Date && !Number.isNaN(val.getTime())) return new Date(val);

   var m =
      typeof val === "string" &&
      val.match(
         /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
      );
   if (m) {
      var Y = Number(m[1]);
      var Mo = Number(m[2]);
      var D = Number(m[3]);
      var h = Number(m[4] || "0");
      var mi = Number(m[5] || "0");
      var s = Number(m[6] || "0");
      return new Date(Y, Mo - 1, D, h, mi, s, 0);
   }

   var d = new Date(val);
   return Number.isNaN(d.getTime()) ? null : d;
}

function partsInTZ(dateLike, timeZone) {
   var d = new Date(dateLike);
   var tz = String(timeZone || MOLDOVA_TZ_ID);

   if (!TZ_PARTS_FMT_MAIN || tz !== MOLDOVA_TZ_ID) {
      var fmt = new Intl.DateTimeFormat("en-GB", {
         timeZone: tz,
         hour12: false,
         year: "numeric",
         month: "2-digit",
         day: "2-digit",
         hour: "2-digit",
         minute: "2-digit",
         second: "2-digit",
      });
      var p0 = fmt.formatToParts(d);
      var get0 = function (t) {
         for (var i = 0; i < p0.length; i++) {
            if (p0[i].type === t) return Number(p0[i].value);
         }
         return 0;
      };
      return {
         y: get0("year"),
         m: get0("month"),
         d: get0("day"),
         H: get0("hour"),
         M: get0("minute"),
         S: get0("second"),
      };
   }

   var p = TZ_PARTS_FMT_MAIN.formatToParts(d);
   var get = function (t) {
      for (var i = 0; i < p.length; i++) {
         if (p[i].type === t) return Number(p[i].value);
      }
      return 0;
   };
   return {
      y: get("year"),
      m: get("month"),
      d: get("day"),
      H: get("hour"),
      M: get("minute"),
      S: get("second"),
   };
}

function ymdStrInTZ(dateLike, timeZone) {
   var p = partsInTZ(dateLike, timeZone || MOLDOVA_TZ_ID);
   return (
      String(p.y) +
      "-" +
      String(p.m).padStart(2, "0") +
      "-" +
      String(p.d).padStart(2, "0")
   );
}

function hhmmInTZ(dateLike, timeZone) {
   var p = partsInTZ(dateLike, timeZone || MOLDOVA_TZ_ID);
   return String(p.H).padStart(2, "0") + ":" + String(p.M).padStart(2, "0");
}

function localKeyFromTs(dateLike, timeZone) {
   var tz = timeZone || MOLDOVA_TZ_ID;
   return ymdStrInTZ(dateLike, tz) + "|" + hhmmInTZ(dateLike, tz);
}

function startOfDayTs(dateLike) {
   var d = new Date(dateLike);
   return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function norm(input) {
   return String(input || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
}

function digitsOnly(input) {
   return String(input || "").replace(/\D+/g, "");
}

function normPlate(input) {
   return String(input || "").replace(/[\s-]/g, "").toUpperCase();
}

function toFiniteMs(value, fallback) {
   var n = Number(value);
   if (Number.isFinite(n)) return n;
   return Number(fallback || 0);
}

function getEndMs(startMs, endRaw, lessonMinutes) {
   var parsed = toFloatingDate(endRaw);
   var endMs = parsed ? parsed.getTime() : NaN;
   if (Number.isFinite(endMs) && endMs > startMs) return endMs;
   return startMs + Math.max(1, Number(lessonMinutes || DEFAULT_LESSON_MINUTES)) * 60000;
}

function compareEvents(a, b) {
   var aStart = toFiniteMs(a && a.startMs, 0);
   var bStart = toFiniteMs(b && b.startMs, 0);
   if (aStart !== bStart) return aStart - bStart;

   var aInst = String((a && a.instructorId) || "");
   var bInst = String((b && b.instructorId) || "");
   if (aInst !== bInst) return aInst < bInst ? -1 : 1;

   var aId = String((a && a.id) || "");
   var bId = String((b && b.id) || "");
   if (aId !== bId) return aId < bId ? -1 : 1;

   var aLocal = String((a && a.localSlotKey) || "");
   var bLocal = String((b && b.localSlotKey) || "");
   if (aLocal !== bLocal) return aLocal < bLocal ? -1 : 1;

   return 0;
}

function buildEvent(entry, payload) {
   if (!entry || typeof entry !== "object") return null;

   var startMs = toFiniteMs(entry.startMs, NaN);
   if (!Number.isFinite(startMs) || startMs <= 0) return null;

   var instructorId = normalizeEntityId(entry.instructorId) || "__unknown";
   var groupIdRaw = firstDefined(entry.groupId, entry.groupID, null);
   var studentId = normalizeEntityId(entry.studentId);

   var studentsById = payload.studentsById || {};
   var studentFromStore = studentId ? studentsById[String(studentId)] : null;

   var userFirst = firstDefined(
      studentFromStore && studentFromStore.firstName,
      entry.userFirst,
      "",
   );
   var userLast = firstDefined(
      studentFromStore && studentFromStore.lastName,
      entry.userLast,
      "",
   );
   var userPhone = firstDefined(
      studentFromStore && studentFromStore.phone,
      entry.userPhone,
      null,
   );

   var studentPrivateMsg = firstDefined(
      studentFromStore && studentFromStore.privateMessage,
      "",
   );

   var groupNameById = payload.groupNameById || {};
   var groupName = "";
   if (groupIdRaw != null) {
      var groupIdStr = String(groupIdRaw);
      groupName = String(groupNameById[groupIdStr] || "");
      if (!groupName) groupName = "Grupa " + groupIdStr;
   }

   var instructorMetaById = payload.instructorMetaById || {};
   var instMeta = instructorMetaById[instructorId] || {};
   var gearboxNorm = String(
      firstDefined(entry.gearbox, instMeta.gearbox, ""),
   ).toLowerCase();
   var gearboxLabel = gearboxNorm
      ? gearboxNorm.indexOf("auto") >= 0
         ? "A"
         : gearboxNorm.indexOf("man") >= 0
            ? "M"
            : String(firstDefined(entry.gearbox, ""))
      : null;

   var eventIdRaw = firstDefined(entry.id, null);
   var eventId =
      eventIdRaw != null
         ? String(eventIdRaw)
         : instructorId + "|" + new Date(startMs).toISOString();

   var fallbackName =
      String(firstDefined(entry.fallbackName, "") || "").trim() || "Programare";
   var fullName = (String(userFirst || "") + " " + String(userLast || "")).trim() ||
      fallbackName;

   var allNotesRaw = [
      studentPrivateMsg,
      firstDefined(entry.privateMessage, ""),
      firstDefined(entry.privateMessaje, ""),
      firstDefined(entry.comment, ""),
   ]
      .filter(Boolean)
      .join(" ");

   var searchNorm = norm(
      [fullName, groupName, firstDefined(instMeta.name, ""), allNotesRaw]
         .filter(Boolean)
         .join(" "),
   );

   var searchPhoneDigits = digitsOnly(
      firstDefined(
         userPhone,
         entry.clientPhone,
         entry.phoneNumber,
         entry.phone,
         entry.telefon,
         "",
      ),
   );

   var lessonMinutes = Math.max(
      1,
      Number(payload.lessonMinutes || DEFAULT_LESSON_MINUTES),
   );

   return {
      entryKey: String(entry.entryKey || ""),
      id: eventId,
      title: "Programare",
      startMs: startMs,
      endMs: getEndMs(startMs, entry.endRaw, lessonMinutes),
      instructorId: instructorId,
      groupId: groupIdRaw != null ? String(groupIdRaw) : "__ungrouped",
      groupName: groupName,
      sector: String(firstDefined(entry.sector, "") || ""),
      studentId: studentId,
      studentFirst: String(userFirst || ""),
      studentLast: String(userLast || ""),
      studentPhone: userPhone,
      eventPrivateMessage: String(firstDefined(entry.privateMessage, "") || ""),
      privateMessage: String(studentPrivateMsg || ""),
      color: String(firstDefined(entry.color, "--default") || "--default"),
      gearboxLabel: gearboxLabel,
      isConfirmed: !!entry.isConfirmed,
      programareOrigine: null,
      instructorPlateNorm: normPlate(firstDefined(instMeta.plateRaw, "")),
      localSlotKey: localKeyFromTs(startMs, payload.timeZone || MOLDOVA_TZ_ID),
      searchNorm: searchNorm,
      searchPhoneDigits: searchPhoneDigits,
   };
}

function readPlainObject(input) {
   if (!input || typeof input !== "object") return {};
   return input;
}

function resetScene(payload) {
   scene.monthKey = String(payload.monthKey || "");
   scene.timeZone = String(payload.timeZone || MOLDOVA_TZ_ID);
   scene.lessonMinutes = Number(payload.lessonMinutes || DEFAULT_LESSON_MINUTES);
   scene.studentsById = readPlainObject(payload.studentsById);
   scene.groupNameById = readPlainObject(payload.groupNameById);
   scene.instructorMetaById = readPlainObject(payload.instructorMetaById);
   scene.entriesByKey = new Map();

   var reservations = Array.isArray(payload.reservations) ? payload.reservations : [];
   for (var i = 0; i < reservations.length; i++) {
      var entry = reservations[i];
      var entryKey = String(entry && entry.entryKey ? entry.entryKey : "").trim();
      if (!entryKey) continue;
      scene.entriesByKey.set(entryKey, entry);
   }
}

function patchScene(payload) {
   var monthKey = String(payload.monthKey || "");
   if (!scene.monthKey || (monthKey && monthKey !== scene.monthKey)) {
      return false;
   }

   var removals = Array.isArray(payload.removals) ? payload.removals : [];
   for (var i = 0; i < removals.length; i++) {
      var rmKey = String(removals[i] || "").trim();
      if (!rmKey) continue;
      scene.entriesByKey.delete(rmKey);
   }

   var upserts = Array.isArray(payload.upserts) ? payload.upserts : [];
   for (var j = 0; j < upserts.length; j++) {
      var up = upserts[j];
      var upKey = String(up && up.entryKey ? up.entryKey : "").trim();
      if (!upKey) continue;
      scene.entriesByKey.set(upKey, up);
   }

   return true;
}

function indexScene() {
   var t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
   var byDay = new Map();

   var payload = {
      lessonMinutes: scene.lessonMinutes,
      timeZone: scene.timeZone,
      studentsById: scene.studentsById,
      groupNameById: scene.groupNameById,
      instructorMetaById: scene.instructorMetaById,
   };

   scene.entriesByKey.forEach(function (entry) {
      var eventItem = buildEvent(entry, payload);
      if (!eventItem) return;

      var dayTs = startOfDayTs(eventItem.startMs);
      if (!byDay.has(dayTs)) byDay.set(dayTs, []);
      byDay.get(dayTs).push(eventItem);
   });

   var dayEntries = [];
   var searchCatalog = [];
   var eventIdToDayEntries = [];
   var eventIdSeen = new Set();

   byDay.forEach(function (arr, dayTs) {
      arr.sort(compareEvents);
      dayEntries.push([dayTs, arr]);

      for (var i = 0; i < arr.length; i++) {
         var ev = arr[i];
         var eventId = ev && ev.id != null ? String(ev.id) : "";
         if (!eventId) continue;

         if (!eventIdSeen.has(eventId)) {
            eventIdSeen.add(eventId);
            eventIdToDayEntries.push([eventId, dayTs]);
         }

         searchCatalog.push({
            dayTs: dayTs,
            eventId: eventId,
            searchNorm: String((ev && ev.searchNorm) || ""),
            searchPhoneDigits: String((ev && ev.searchPhoneDigits) || ""),
         });
      }
   });

   dayEntries.sort(function (a, b) {
      return Number(a[0] || 0) - Number(b[0] || 0);
   });

   var t1 = typeof performance !== "undefined" ? performance.now() : Date.now();

   return {
      monthKey: scene.monthKey,
      dayEntries: dayEntries,
      searchCatalog: searchCatalog,
      eventIdToDayEntries: eventIdToDayEntries,
      eventsCount: searchCatalog.length,
      buildMs: Number((t1 - t0).toFixed(1)),
   };
}

function postIndexResult(requestId) {
   var result = indexScene();
   self.postMessage({
      type: "month-index-result",
      requestId: requestId,
      monthKey: result.monthKey,
      dayEntries: result.dayEntries,
      searchCatalog: result.searchCatalog,
      eventIdToDayEntries: result.eventIdToDayEntries,
      eventsCount: result.eventsCount,
      buildMs: result.buildMs,
   });
}

function postWorkerError(requestId, message) {
   self.postMessage({
      type: "month-index-error",
      requestId: requestId,
      error: String(message || "unknown worker error"),
   });
}

self.onmessage = function (event) {
   var msg = event && event.data;
   var type = msg && msg.type;
   if (!msg || !type) return;

   try {
      if (type === "index-month" || type === "index-month-reset") {
         resetScene(msg.payload || {});
         postIndexResult(msg.requestId);
         return;
      }

      if (type === "index-month-patch") {
         var patched = patchScene(msg.payload || {});
         if (!patched) {
            postWorkerError(msg.requestId, "month mismatch or scene not initialized");
            return;
         }
         postIndexResult(msg.requestId);
      }
   } catch (err) {
      postWorkerError(msg.requestId, err && err.message);
   }
};
