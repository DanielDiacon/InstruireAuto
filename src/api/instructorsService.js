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
/**
 * Adaugă blackouts în masă (SINGLE sau REPEAT).
 * Acceptă fie array-ul de item-uri, fie { blackouts: [...] }.
 * Normalizează strict câmpurile și DEDUPLICĂ la nivel de item.
 */
export async function addInstructorBlackouts(input) {
   const payload = Array.isArray(input) ? { blackouts: input } : input || {};
   const asIso = (v) =>
      v ? (typeof v === "string" ? v : new Date(v).toISOString()) : undefined;

   // normalizare + dedup cheie: instructorId|type|dateTime|repeatEveryDays
   const seen = new Set();
   const out = [];

   for (const b of payload.blackouts || []) {
      const type = String(b?.type || "SINGLE").toUpperCase();
      const instructorId = Number(b?.instructorId);
      if (!instructorId) continue;

      const dateTime = asIso(b?.dateTime) || asIso(b?.startDateTime);
      if (!dateTime) continue;

      if (type === "REPEAT") {
         const startDateTime = asIso(b?.startDateTime) || dateTime;
         const endDateTime = asIso(b?.endDateTime) || startDateTime;
         const repeatEveryDays = Math.max(1, Number(b?.repeatEveryDays || 1));

         const key = `${instructorId}|REPEAT|${startDateTime}|${repeatEveryDays}`;
         if (seen.has(key)) continue;
         seen.add(key);

         out.push({
            instructorId,
            type: "REPEAT",
            dateTime: startDateTime, // opțional pe server, păstrat pentru compat
            startDateTime,
            endDateTime,
            repeatEveryDays,
         });
      } else {
         const key = `${instructorId}|SINGLE|${dateTime}|0`;
         if (seen.has(key)) continue;
         seen.add(key);

         // STRICT SINGLE: nu trimitem start/end/repeat
         out.push({
            instructorId,
            type: "SINGLE",
            dateTime,
         });
      }
   }

   if (out.length === 0) return true;

   const res = await apiClientService.post("/instructors/blackouts", {
      blackouts: out,
   });
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
// src/api/instructorsService.js

/** Returnează lista de blackouts pentru un instructor.
 *  Opțional: filtrează pe perioadă (startDate/endDate) dacă backend-ul acceptă.
 *  startDate/endDate recomandat: "YYYY-MM-DD"
 */
// src/api/instructorsService.js
export async function getInstructorBlackouts(instructorId, opts = {}) {
  const id = encodeURIComponent(String(instructorId)); // ✅ NU Number()

  const qs = new URLSearchParams();
  if (opts?.startDate) qs.set("startDate", String(opts.startDate));
  if (opts?.endDate) qs.set("endDate", String(opts.endDate));

  const url = `/instructors/blackouts/${id}` + (qs.toString() ? `?${qs}` : "");

  const res = await apiClientService.get(url);
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
