import apiClientService from "./ApiClientService";
// api/reservationsService.js
const API =
   typeof process !== "undefined" ? process.env.API_BASE || "/api" : "/api";

/** Helper mic: range pentru o lună întreagă (UTC, cum vrea backend-ul) */
export function buildMonthRange(dateLike) {
   const d = dateLike ? new Date(dateLike) : new Date();
   const y = d.getFullYear();
   const m = d.getMonth();

   // prima zi a lunii, 00:00:00Z
   const from = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
   // ultima zi a lunii, 23:59:59.999Z
   const to = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));

   return {
      startDateFrom: from.toISOString(),
      startDateTo: to.toISOString(),
   };
}

/** GET /api/reservations/filter — filtrează după câmpurile din swagger */
export async function filterReservations(filters = {}) {
   const {
      userId,
      instructorId,
      instructorsGroupId,
      carId,
      startDateFrom,
      startDateTo,
      sector,
      gearbox,
      color,
      isConfirmed,
      isCancelled,
      isFavorite,
      isImportant,
      limit,
      skip,
      sortBy,
      sortOrder,
   } = filters || {};

   const qs = new URLSearchParams();

   // id-uri
   if (userId != null) qs.set("userId", String(userId));
   if (instructorId != null) qs.set("instructorId", String(instructorId));
   if (instructorsGroupId != null)
      qs.set("instructorsGroupId", String(instructorsGroupId));
   if (carId != null) qs.set("carId", String(carId));

   // interval dată
   if (startDateFrom) qs.set("startDateFrom", startDateFrom);
   if (startDateTo) qs.set("startDateTo", startDateTo);

   // diverse filtre
   if (sector) qs.set("sector", sector);
   if (gearbox) qs.set("gearbox", gearbox);
   if (color) qs.set("color", color);

   if (typeof isConfirmed === "boolean")
      qs.set("isConfirmed", String(isConfirmed));
   if (typeof isCancelled === "boolean")
      qs.set("isCancelled", String(isCancelled));
   if (typeof isFavorite === "boolean")
      qs.set("isFavorite", String(isFavorite));
   if (typeof isImportant === "boolean")
      qs.set("isImportant", String(isImportant));

   // paginație + sort
   if (limit != null) qs.set("limit", String(limit));
   if (skip != null) qs.set("skip", String(skip));
   if (sortBy) qs.set("sortBy", sortBy);
   if (sortOrder) qs.set("sortOrder", sortOrder);

   const url = qs.toString()
      ? `/reservations/filter?${qs.toString()}`
      : `/reservations/filter`;

   const res = await apiClientService.get(url);

   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Server error (filter): ${text || res.status}`);
   }

   const ct = res.headers?.get?.("content-type") || "";
   if (ct.includes("application/json")) {
      try {
         return await res.json();
      } catch {
         return [];
      }
   }

   const text = await res.text().catch(() => "");
   if (!text) return [];
   try {
      return JSON.parse(text);
   } catch {
      throw new Error(
         `reservations/filter: răspuns non-JSON: ${text.slice(0, 200)}`
      );
   }
}

/** Scurtătură: rezervări doar pentru o anumită lună */
export async function getReservationsForMonth(dateLike, extraFilters = {}) {
   const range = buildMonthRange(dateLike);
   return await filterReservations({
      ...extraFilters,
      ...range,
   });
}
/**
 * Întoarce { changed:boolean, etag?:string, serverTime?:string }
 * Preferat: 304 Not Modified pe un HEAD/GET cu If-None-Match
 * Fallback: /reservations/meta?updated_since=...
 * Super-fallback: GET light cu fields=id,updatedAt (count mic)
 */
export async function getReservationsMeta({ updated_since, etag } = {}) {
   // 1) HEAD cu If-None-Match (dacă backendul tău îl suportă)
   try {
      const url = new URL(`${API}/reservations`);
      if (updated_since) url.searchParams.set("updated_since", updated_since);
      const head = await fetch(url, {
         method: "HEAD",
         headers: etag ? { "If-None-Match": etag } : {},
      });
      if (head.status === 304) {
         return {
            changed: false,
            etag: etag || head.headers.get("ETag") || null,
            serverTime: new Date().toISOString(),
         };
      }
      if (head.ok) {
         return {
            changed: true,
            etag: head.headers.get("ETag") || null,
            serverTime: head.headers.get("Date") || new Date().toISOString(),
         };
      }
   } catch {}

   // 2) Endpoint meta (dacă există)
   try {
      const url = new URL(`${API}/reservations/meta`);
      if (updated_since) url.searchParams.set("updated_since", updated_since);
      const res = await fetch(url, {
         headers: etag ? { "If-None-Match": etag } : {},
      });
      if (res.status === 304)
         return {
            changed: false,
            etag: etag || null,
            serverTime: new Date().toISOString(),
         };
      if (res.ok) {
         const j = await res.json().catch(() => ({}));
         return {
            changed: Boolean(j.changed ?? true),
            etag: res.headers.get("ETag") || j.etag || null,
            serverTime:
               res.headers.get("Date") ||
               j.serverTime ||
               new Date().toISOString(),
         };
      }
   } catch {}

   // 3) Super-fallback: GET ultra ușor (ex: ?fields=id,updatedAt&limit=1&order=updatedAt:desc)
   try {
      const url = new URL(`${API}/reservations`);
      url.searchParams.set("fields", "id,updatedAt");
      url.searchParams.set("limit", "1");
      url.searchParams.set("order", "updatedAt:desc");
      if (updated_since) url.searchParams.set("updated_since", updated_since);
      const res = await fetch(url);
      if (res.ok) {
         const items = await res.json().catch(() => []);
         // dacă serverul zice zero rezultate noi => nu s-a schimbat
         const changed = Array.isArray(items)
            ? items.length > 0
            : Boolean(items?.items?.length);
         return {
            changed,
            etag: res.headers.get("ETag") || null,
            serverTime: res.headers.get("Date") || new Date().toISOString(),
         };
      }
   } catch {}

   // Dacă nu putem decide sigur, presupunem că S-A schimbat (mai sigur pentru consistență)
   return { changed: true, etag: null, serverTime: new Date().toISOString() };
}

/** POST /api/reservations */
export async function createReservations(payload) {
   const res = await apiClientService.post(
      "/reservations",
      JSON.stringify(payload)
   );
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Server error: ${text}`);
   }
   return await res.json();
}

/** GET /api/reservations */
export async function getReservations(opts = {}) {
   const { scope, from, to, pageSize = 5000 } = opts || {};
   const qs = new URLSearchParams();
   if (scope) qs.set("scope", scope);
   if (from) qs.set("from", from);
   if (to) qs.set("to", to);
   if (pageSize) qs.set("pageSize", String(pageSize));

   const url = qs.toString()
      ? `/reservations?${qs.toString()}`
      : `/reservations`;
   const res = await apiClientService.get(url);
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Server error: ${text}`);
   }
   return await res.json();
}

/** GET /api/reservations/user/:userId */
export async function getUserReservations(userId) {
   const res = await apiClientService.get(`/reservations/user/${userId}`);
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Server error: ${text}`);
   }
   return await res.json();
}

/** GET /api/reservations/all */
export async function getAllReservations() {
   const res = await apiClientService.get(`/reservations/all`);
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Server error: ${text}`);
   }
   return await res.json();
}

/** 🔥 GET /api/reservations/instructor/{instructorId}[?userId=...] */
export async function getInstructorReservations(instructorId, userId) {
   if (!instructorId && !userId) {
      throw new Error("instructorId sau userId obligatoriu");
   }

   // preferință: instructorId în path + (opțional) userId ca query
   if (instructorId) {
      const path =
         `/reservations/instructor/${instructorId}` +
         (userId ? `?userId=${encodeURIComponent(userId)}` : "");
      const res = await apiClientService.get(path);
      if (!res.ok) {
         const text = await res.text().catch(() => "");
         throw new Error(`Server error: ${text}`);
      }
      return await res.json();
   }

   // fallback: dacă ai doar userId
   return await getUserReservations(userId);
}

/** PATCH /api/reservations/:id */
export async function patchReservation(id, data) {
   const res = await apiClientService.patch(
      `/reservations/${id}`,
      JSON.stringify(data)
   );
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Server error: ${text}`);
   }
   return await res.json();
}

/** DELETE /api/reservations/:id */
export async function deleteReservation(id) {
   const res = await apiClientService.delete(`/reservations/${id}`);
   if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "");
      throw new Error(`Server error: ${text}`);
   }
   return id;
}

/** GET /reservations/busy-reservation?days=...&gearbox&sector&type */
export async function getBusyReservations(q) {
   const qp = {
      days: q?.days,
      gearbox: q?.gearbox ? String(q.gearbox).toLowerCase() : undefined,
      sector: q?.sector ? String(q.sector).toLowerCase() : undefined,
      type: q?.type ? String(q.type).toLowerCase() : undefined,
   };

   const toDaysParam = () => {
      if (typeof qp.days === "number") return String(qp.days);
      if (Array.isArray(qp.days)) return qp.days.join(",");
      return String(qp.days || "").trim();
   };

   const daysParam = toDaysParam();
   if (!daysParam) throw new Error("days este obligatoriu");

   const params = new URLSearchParams();
   params.set("days", daysParam);
   if (qp.gearbox) params.set("gearbox", qp.gearbox);
   if (qp.sector) params.set("sector", qp.sector);
   if (qp.type) params.set("type", qp.type);

   const res = await apiClientService.get(
      `/reservations/busy-reservation?${params.toString()}`
   );

   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`busy-reservation ${res.status}: ${text}`);
   }
   if (res.status === 204) return [];

   const ct = res.headers?.get?.("content-type") || "";
   if (ct.includes("application/json")) {
      try {
         return await res.json();
      } catch {
         return [];
      }
   } else {
      const text = await res.text().catch(() => "");
      if (!text) return [];
      try {
         return JSON.parse(text);
      } catch {
         throw new Error(
            `busy-reservation: răspuns non-JSON: ${text.slice(0, 200)}`
         );
      }
   }
}
/** GET /api/reservations/busy-reservation/instructor/{instructor_id} */
export async function getBusyForInstructor(instructorId) {
   if (!instructorId && instructorId !== 0) {
      throw new Error("instructorId este obligatoriu");
   }

   const res = await apiClientService.get(
      `/reservations/busy-reservation/instructor/${encodeURIComponent(
         instructorId
      )}`
   );

   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`busy-reservation/instructor ${res.status}: ${text}`);
   }
   if (res.status === 204) return [];

   const ct = res.headers?.get?.("content-type") || "";
   if (ct.includes("application/json")) {
      try {
         return await res.json();
      } catch {
         return [];
      }
   } else {
      const text = await res.text().catch(() => "");
      if (!text) return [];
      try {
         return JSON.parse(text);
      } catch {
         throw new Error(
            `busy-reservation/instructor: răspuns non-JSON: ${text.slice(
               0,
               200
            )}`
         );
      }
   }
}

/** GET /api/reservations/busy-reservation/instructors-group/{instructors_group_id} */
export async function getBusyForInstructorsGroup(groupId) {
   if (!groupId && groupId !== 0) {
      throw new Error("instructors_group_id este obligatoriu");
   }

   const res = await apiClientService.get(
      `/reservations/busy-reservation/instructors-group/${encodeURIComponent(
         groupId
      )}`
   );

   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`busy-reservation/group ${res.status}: ${text}`);
   }
   if (res.status === 204) return [];

   const ct = res.headers?.get?.("content-type") || "";
   if (ct.includes("application/json")) {
      try {
         return await res.json();
      } catch {
         return [];
      }
   } else {
      const text = await res.text().catch(() => "");
      if (!text) return [];
      try {
         return JSON.parse(text);
      } catch {
         throw new Error(
            `busy-reservation/group: răspuns non-JSON: ${text.slice(0, 200)}`
         );
      }
   }
}
// GET /reservations/:id/history  (ajustează dacă ai alt path real)
export async function getReservationHistory(reservationId) {
   const res = await apiClientService.get(
      `/reservations/${reservationId}/history`
   );

   if (!res.ok) {
      let msg = "Nu am putut încărca istoricul.";
      try {
         const err = await res.json();
         if (err?.message) msg = err.message;
      } catch {}
      throw new Error(msg);
   }

   // 🔎 log RAW din server
   try {
      const data = await res.json();
      console.groupCollapsed(
         "%c[History RAW]",
         "color:#888",
         `reservationId=${reservationId}`
      );
      console.log(data);
      // dacă e listă de obiecte “frumoasă”, poți vedea și tabel
      if (Array.isArray(data)) console.table(data);
      console.groupEnd();
      return data;
   } catch {
      console.warn("[History RAW] răspuns fără body (204/201 etc.)");
      return [];
   }
}
/** GET /api/reservations/history/instructor/{instructorId} */
export async function getInstructorReservationHistory(instructorId) {
   const id = Number(instructorId);
   if (!Number.isFinite(id) || id <= 0) {
      throw new Error(
         "getInstructorReservationHistory: instructorId invalid (INT > 0)."
      );
   }

   const res = await apiClientService.get(
      `/reservations/history/instructor/${encodeURIComponent(id)}`
   );

   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
         `history/instructor ${res.status}: ${text || res.status}`
      );
   }

   const ct = res.headers?.get?.("content-type") || "";
   if (ct.includes("application/json")) {
      try {
         return await res.json();
      } catch {
         return [];
      }
   }

   const text = await res.text().catch(() => "");
   if (!text) return [];
   try {
      return JSON.parse(text);
   } catch {
      return [];
   }
}

/** POST /api/reservations/for-user — creează una sau mai multe rezervări pentru un user selectat */
export async function createReservationsForUser(payload) {
   // payload:
   // { instructorsGroupId?: number, instructorId?: number, userId: number, reservations: [{ startTime, sector?, gearbox?, privateMessage?, color? }] }
   const res = await apiClientService.post(
      "/reservations/for-user",
      JSON.stringify(payload)
   );
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Server error: ${text || res.status}`);
   }
   return await res.json();
}
/* alias — dacă ai folosit deja getReservationsAll în alte fișiere */
export { getAllReservations as getReservationsAll };
