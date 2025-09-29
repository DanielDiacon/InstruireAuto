import apiClientService from "./ApiClientService";

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
