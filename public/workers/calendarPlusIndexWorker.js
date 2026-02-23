var DEFAULT_LESSON_MIN = 90;
var DEFAULT_STEP_MIN = 30;
var DEFAULT_SLOT_COUNT = 28;

function pad2(n) {
   return String(n).padStart(2, "0");
}

function toYmd(dateLike) {
   var d = new Date(dateLike);
   return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function toHm(dateLike) {
   var d = new Date(dateLike);
   return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

function parseFloatingDate(value) {
   if (!value) return null;
   if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value);
   var match = String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
   );
   if (match) {
      var Y = Number(match[1]);
      var Mo = Number(match[2]);
      var D = Number(match[3]);
      var h = Number(match[4] || "0");
      var mi = Number(match[5] || "0");
      var s = Number(match[6] || "0");
      return new Date(Y, Mo - 1, D, h, mi, s, 0);
   }
   var d = new Date(value);
   return Number.isNaN(d.getTime()) ? null : d;
}

function getReservationStartRaw(r) {
   if (!r) return null;
   return (
      r.startTime ||
      r.start ||
      r.start_time ||
      r.dateTime ||
      r.datetime ||
      r.date ||
      r.begin ||
      null
   );
}

function getReservationEndRaw(r) {
   if (!r) return null;
   return r.endTime || r.end || r.end_time || r.finishTime || null;
}

function getInstructorId(r) {
   if (!r) return null;
   return (
      r.instructorId ||
      r.instructor_id ||
      (r.instructor && r.instructor.id) ||
      (r.reservation && r.reservation.instructorId) ||
      null
   );
}

function getUserId(r) {
   if (!r) return null;
   return (
      r.userId ||
      r.user_id ||
      r.studentId ||
      r.student_id ||
      (r.user && r.user.id) ||
      (r.student && r.student.id) ||
      (r.reservation && r.reservation.userId) ||
      null
   );
}

function getFullName(person) {
   if (!person) return "";
   return ((person.firstName || "") + " " + (person.lastName || "")).trim();
}

function indexReservations(payload) {
   var t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

   var reservations = payload && Array.isArray(payload.reservations) ? payload.reservations : [];
   var selectedYmd = payload && payload.selectedYmd ? String(payload.selectedYmd) : "";
   var dayStartMs = payload && payload.dayStartMs ? Number(payload.dayStartMs) : 0;
   var slotCount =
      payload && payload.slotCount ? Number(payload.slotCount) : DEFAULT_SLOT_COUNT;
   var stepMin = payload && payload.stepMin ? Number(payload.stepMin) : DEFAULT_STEP_MIN;
   var lessonMin =
      payload && payload.lessonMin ? Number(payload.lessonMin) : DEFAULT_LESSON_MIN;
   var instructorIds =
      payload && Array.isArray(payload.instructorIds) ? payload.instructorIds : [];
   var userNameById = payload && payload.userNameById ? payload.userNameById : {};

   var instructorIdSet = new Set(instructorIds.map(function (id) {
      return String(id);
   }));
   var starts = [];
   var covered = [];
   var startKeySet = new Set();
   var coveredKeySet = new Set();

   var eventsCount = 0;

   for (var i = 0; i < reservations.length; i++) {
      var row = reservations[i];
      var start = parseFloatingDate(getReservationStartRaw(row));
      if (!start) continue;
      if (toYmd(start) !== selectedYmd) continue;

      var instructorId = String(getInstructorId(row) || "");
      if (!instructorIdSet.has(instructorId)) continue;

      var minsFromStart = Math.floor((start.getTime() - dayStartMs) / 60000);
      var slotIndex = Math.floor(minsFromStart / stepMin);
      if (slotIndex < 0 || slotIndex >= slotCount) continue;

      var endParsed = parseFloatingDate(getReservationEndRaw(row));
      var end =
         endParsed && endParsed > start
            ? endParsed
            : new Date(start.getTime() + lessonMin * 60 * 1000);

      var durationMin = Math.max(
         stepMin,
         Math.floor((end.getTime() - start.getTime()) / 60000),
      );
      var spanSlots = Math.max(
         1,
         Math.min(slotCount - slotIndex, Math.ceil(durationMin / stepMin)),
      );

      var key = instructorId + "|" + slotIndex;
      if (startKeySet.has(key)) continue;
      startKeySet.add(key);

      var userId = String(getUserId(row) || "");
      var fallbackUser = (row && row.user) || (row && row.student) || null;
      var title = userNameById[userId] || getFullName(fallbackUser) || "Elev";
      var subtitle = toHm(start) + " - " + toHm(end) + " • " + String((row && row.sector) || "Sector");

      starts.push({
         key: key,
         reservationId: row ? row.id : null,
         instructorId: instructorId,
         slotIndex: slotIndex,
         spanSlots: spanSlots,
         title: title,
         subtitle: subtitle,
         color: (row && row.color) || "--event-default",
      });

      for (var j = slotIndex + 1; j < slotIndex + spanSlots; j++) {
         var coverKey = instructorId + "|" + j;
         if (coveredKeySet.has(coverKey)) continue;
         coveredKeySet.add(coverKey);
         covered.push(coverKey);
      }

      eventsCount += 1;
   }

   var t1 = typeof performance !== "undefined" ? performance.now() : Date.now();

   return {
      starts: starts,
      covered: covered,
      eventsCount: eventsCount,
      buildMs: Number((t1 - t0).toFixed(1)),
   };
}

self.onmessage = function (event) {
   var msg = event && event.data;
   if (!msg || msg.type !== "index") return;

   try {
      var result = indexReservations(msg.payload || {});
      self.postMessage({
         type: "index-result",
         requestId: msg.requestId,
         starts: result.starts,
         covered: result.covered,
         eventsCount: result.eventsCount,
         buildMs: result.buildMs,
      });
   } catch (err) {
      self.postMessage({
         type: "index-error",
         requestId: msg.requestId,
         error: (err && err.message) || "unknown worker error",
      });
   }
};
