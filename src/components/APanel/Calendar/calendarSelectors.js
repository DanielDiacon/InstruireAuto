import { createSelector } from "reselect";

const selReservations = (s) =>
   s && s.reservations && Array.isArray(s.reservations.list)
      ? s.reservations.list
      : [];
const selInstructors = (s) =>
   s && s.instructors && Array.isArray(s.instructors.list)
      ? s.instructors.list
      : [];
const selGroups = (s) =>
   s && s.instructorsGroups && Array.isArray(s.instructorsGroups.list)
      ? s.instructorsGroups.list
      : [];

const startOfDayTs = (d) => {
   const x = new Date(d);
   return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
};

export const makeSelEventIdsByDay = () =>
   createSelector([selReservations], (resList) => {
      const map = new Map(); // ts -> [reservationId]
      for (const r of resList) {
         const raw =
            r.startTime ??
            r.start ??
            r.startedAt ??
            r.start_at ??
            r.startDate ??
            r.start_date;
         if (!raw) continue;
         const s = new Date(raw);
         const ts = startOfDayTs(s);
         const id = String(r.id ?? `${ts}_${Math.random()}`);
         if (!map.has(ts)) map.set(ts, []);
         map.get(ts).push(id);
      }
      return map;
   });

export const selInstructorSectorDict = createSelector(
   [selInstructors, selGroups],
   (instructors, groups) => {
      const dict = new Map();
      const fromGroup = new Map();
      (groups || []).forEach((g) => {
         const sector = String(g?.sector ?? g?.location ?? "")
            .trim()
            .toLowerCase();
         (g?.instructors ?? []).forEach((ii) => {
            const idStr = String(ii?.id ?? ii);
            if (sector && !fromGroup.has(idStr)) fromGroup.set(idStr, sector);
         });
      });
      (instructors || []).forEach((i) => {
         const id = String(i.id);
         const sector = String(i.sector ?? fromGroup.get(id) ?? "")
            .trim()
            .toLowerCase();
         dict.set(id, sector);
      });
      return dict;
   }
);

export const makeSelEventIdsByInstructorForDay = () => {
   const selEventIdsByDay = makeSelEventIdsByDay();
   return createSelector(
      [
         selEventIdsByDay,
         (s, dayTs) => dayTs,
         (s, _dayTs, sectorNorm) =>
            sectorNorm ? sectorNorm.toLowerCase() : "",
         selReservations,
         selInstructorSectorDict,
      ],
      (byDay, dayTs, sectorNorm, resList, sectorDict) => {
         const ids = byDay.get(dayTs) ?? [];
         const grouped = new Map(); // instId -> [resId]

         for (const id of ids) {
            const r = (resList || []).find((x) => String(x.id) === String(id));
            if (!r) continue;
            const instIdRaw =
               r.instructorId ??
               r.instructor_id ??
               r.instructor ??
               r.instructorIdFk;
            const instId = instIdRaw != null ? String(instIdRaw) : "__unknown";
            const instSector = sectorDict.get(instId) || "";
            if (sectorNorm && instSector && instSector !== sectorNorm) continue;
            if (!grouped.has(instId)) grouped.set(instId, []);
            grouped.get(instId).push(String(id));
         }

         const instIds = Array.from(grouped.keys()).sort((a, b) => {
            const na = Number(a),
               nb = Number(b);
            if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
            return String(a).localeCompare(String(b), undefined, {
               numeric: true,
            });
         });

         return { grouped, instIds };
      }
   );
};
