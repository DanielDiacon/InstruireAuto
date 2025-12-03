// src/store/calendarSelectors.js
import { createSelector } from "@reduxjs/toolkit";

/* ========== SELECTORI DE BAZĂ ========== */

const selectReservationsList = (state) => state.reservations?.list ?? [];
const selectInstructorsGroupsList = (state) =>
   state.instructorsGroups?.list ?? [];
const selectInstructorsList = (state) => state.instructors?.list ?? [];
const selectStudentsList = (state) => state.students?.list ?? [];
const selectCarsList = (state) => state.cars?.list ?? [];
const selectUsersList = (state) => state.users?.list ?? [];

/**
 * Tot ce e baza pentru calendar (doar listele brute din store).
 * Dacă niciuna din liste nu își schimbă referința, acest obiect rămâne același.
 */
export const selectCalendarBaseData = createSelector(
   [
      selectReservationsList,
      selectInstructorsGroupsList,
      selectInstructorsList,
      selectStudentsList,
      selectCarsList,
      selectUsersList,
   ],
   (reservations, instructorsGroups, instructors, students, cars, users) => ({
      reservations,
      instructorsGroups,
      instructors,
      students,
      cars,
      users,
   })
);

/* ========== HELPERI INTERNI ========== */

const digitsOnly = (s = "") => s.toString().replace(/\D+/g, "");

const norm = (s = "") =>
   s
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

const normPlate = (s = "") => s.toString().replace(/[\s-]/g, "").toUpperCase();

/* ========== DERIVATE GRELE (MAP-URI, DICT-URI) ========== */

/**
 * Map(instructorId -> { plate, gearbox })
 */
export const selectInstructorPlates = createSelector(
   [selectCarsList],
   (cars) => {
      const m = new Map();

      (cars || []).forEach((c) => {
         const iId = String(
            c.instructorId ??
               c.instructor_id ??
               c.instructor ??
               c.instructorIdFk ??
               ""
         );

         const plate =
            c.plateNumber ??
            c.plate ??
            c.number ??
            c.registration ??
            c.plate_number ??
            "";

         const gearbox =
            c.gearbox ??
            c.transmission ??
            c.transmissionType ??
            c.gearboxType ??
            null;

         if (iId) {
            m.set(iId, { plate, gearbox });
         }
      });

      return m;
   }
);

/**
 * Map(instructorId -> meta) cu:
 *  - name, nameNorm
 *  - phoneDigits
 *  - plateRaw / plateNorm / plateDigits
 *  - gearbox
 *  - sectorNorm
 */
export const selectInstructorMeta = createSelector(
   [selectInstructorsList, selectInstructorsGroupsList, selectInstructorPlates],
   (instructors, instructorsGroups, instructorPlates) => {
      const dict = new Map();
      const instSectorIndex = new Map();

      // indexăm sectorul din groups
      (instructorsGroups || []).forEach((g) => {
         const sectorRaw = g?.sector ?? g?.location ?? "";
         const sectorNorm = String(sectorRaw).trim().toLowerCase();
         (g?.instructors || []).forEach((ii) => {
            const idStr = String(ii?.id ?? ii);
            if (sectorNorm && !instSectorIndex.has(idStr)) {
               instSectorIndex.set(idStr, sectorNorm);
            }
         });
      });

      (instructors || []).forEach((i) => {
         const id = String(i.id);
         const name = `${i.firstName ?? ""} ${i.lastName ?? ""}`.trim();
         const phone = i.phone ?? i.phoneNumber ?? i.mobile ?? i.telefon ?? "";

         const plate = instructorPlates.get(id)?.plate ?? "";
         const gearbox =
            instructorPlates.get(id)?.gearbox ??
            i.gearbox ??
            i.transmission ??
            null;

         const sectorRaw = i.sector ?? instSectorIndex.get(id) ?? "";
         const sectorNorm = String(sectorRaw).trim().toLowerCase();

         dict.set(id, {
            name,
            nameNorm: norm(name),
            phoneDigits: digitsOnly(phone),
            plateRaw: plate,
            plateNorm: normPlate(plate),
            plateDigits: digitsOnly(plate),
            gearbox: gearbox ? String(gearbox).toLowerCase() : null,
            sectorNorm,
         });
      });

      return dict;
   }
);

/**
 * Map(studentId -> { firstName, lastName, phone, privateMessage })
 */
export const selectStudentDict = createSelector(
   [selectStudentsList],
   (students) => {
      const map = new Map();
      (students || []).forEach((u) => {
         map.set(String(u.id), {
            id: String(u.id),
            firstName: u.firstName ?? u.prenume ?? "",
            lastName: u.lastName ?? u.nume ?? "",
            phone: u.phone ?? u.phoneNumber ?? u.mobile ?? u.telefon ?? null,
            privateMessage: u.privateMessage ?? u.privateMessaje ?? "",
         });
      });
      return map;
   }
);

/**
 * Map(groupId -> groupObject)
 */
export const selectInstructorsGroupDict = createSelector(
   [selectInstructorsGroupsList],
   (instructorsGroups) => {
      const m = new Map();
      (instructorsGroups || []).forEach((g) => {
         if (!g) return;
         m.set(String(g.id), g);
      });
      return m;
   }
);

/**
 * Pachet compact de derivate pentru DayView:
 *  - instructorPlates (Map)
 *  - instructorMeta (Map)
 *  - studentDict (Map)
 *  - instructorsGroupDict (Map)
 *
 * Asta se schimbă doar când se schimbă unul din:
 *  cars / instructors / students / instructorGroups.
 */
export const selectCalendarDerivedData = createSelector(
   [
      selectInstructorPlates,
      selectInstructorMeta,
      selectStudentDict,
      selectInstructorsGroupDict,
   ],
   (instructorPlates, instructorMeta, studentDict, instructorsGroupDict) => ({
      instructorPlates,
      instructorMeta,
      studentDict,
      instructorsGroupDict,
   })
);
