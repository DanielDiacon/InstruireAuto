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
export async function getReservations() {
   const res = await apiClientService.get(`/reservations`);
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

/* alias — dacă ai folosit deja getReservationsAll în alte fișiere */
export { getAllReservations as getReservationsAll };
