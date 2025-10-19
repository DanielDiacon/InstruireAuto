// src/api/instructorsService.js
import apiClientService from "./ApiClientService";

/* =========================
   Instructors CRUD
========================= */
export async function getInstructors() {
   const res = await apiClientService.get("/instructors");
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}

export async function createInstructors(payload) {
   const res = await apiClientService.post("/instructors", payload);
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}

export async function patchInstructors(id, payload) {
   const res = await apiClientService.patch(`/instructors/${id}`, payload);
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}

export async function patchInstructorOrder(id, order) {
   // Trimitem obiect simplu; ApiClientService se ocupă de JSON & headers
   return patchInstructors(id, { order });
}

export async function deleteInstructors(id) {
   const res = await apiClientService.delete(`/instructors/${id}`);
   if (!res.ok) throw new Error(await res.text());
   return true;
}

/* =========================
   Blackouts (Indisponibilități)
========================= */

/**
 * Adaugă blackouts în masă (SINGLE sau REPEAT).
 * Acceptă fie array-ul de item-uri, fie { blackouts: [...] }.
 * Normalizează câmpurile și garantează că dateTime este setat pentru fiecare obiect.
 */
export async function addInstructorBlackouts(input) {
   // Acceptă fie array-ul de itemuri, fie { blackouts: [...] }
   const payload = Array.isArray(input) ? { blackouts: input } : input || {};
   const asIso = (v) =>
      v ? (typeof v === "string" ? v : new Date(v).toISOString()) : undefined;

   const body = {
      blackouts: (payload.blackouts || []).map((b) => {
         const type = String(b?.type || "SINGLE").toUpperCase();
         const instructorId = Number(b?.instructorId);

         // O SINGURĂ ORĂ: dateTime este obligatoriu (pentru REPEAT îl setăm = start)
         const dateTime = asIso(b?.dateTime) || asIso(b?.startDateTime);

         const out = { instructorId, type, dateTime };

         if (type === "REPEAT") {
            out.startDateTime = asIso(b?.startDateTime) || dateTime;
            out.endDateTime = asIso(b?.endDateTime) || dateTime;
            out.repeatEveryDays = Number(b?.repeatEveryDays || 1);
         }

         return out;
      }),
   };

   const res = await apiClientService.post("/instructors/blackouts", body);
   const text = await res.text();
   if (!res.ok) throw new Error(text || "Failed to add blackouts");

   try {
      return text ? JSON.parse(text) : true;
   } catch {
      return true;
   }
}

/** Helper: adaugă un singur blackout SINGLE. */
export async function addInstructorBlackout(instructorId, dateTime) {
   return addInstructorBlackouts([{ instructorId, dateTime, type: "SINGLE" }]);
}

/** Returnează lista de blackouts pentru un instructor. */
export async function getInstructorBlackouts(instructorId) {
   const res = await apiClientService.get(
      `/instructors/blackouts/${Number(instructorId)}`
   );
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}

/** Returnează lista de blackouts pentru un grup de instructori. */
export async function getInstructorsGroupBlackouts(instructorsGroupId) {
   const res = await apiClientService.get(
      `/instructors-group/blackouts/${Number(instructorsGroupId)}`
   );
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}

/** Șterge un blackout după ID (SINGLE sau seria REPEAT). */
export async function deleteInstructorBlackout(id) {
   const res = await apiClientService.delete(
      `/instructors/blackouts/${Number(id)}`
   );
   if (!res.ok) throw new Error(await res.text());
   return true;
}

/** Actualizează un blackout după ID (opțional). */
export async function updateInstructorBlackout(id, payload) {
   const res = await apiClientService.patch(
      `/instructors/blackouts/${Number(id)}`,
      payload
   );
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}
