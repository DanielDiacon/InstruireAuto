import apiClientService from "./ApiClientService";

// === utils ===
const clean = (o = {}) =>
   Object.fromEntries(
      Object.entries(o).filter(([_, v]) => v !== undefined && v !== null)
   );

/** GET /users */
export async function getUsers() {
   const res = await apiClientService.get("/users");
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}

/** GET /users/:id */
export async function getUserById(userId) {
   const res = await apiClientService.get(`/users/${userId}`);
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}
// ✅ PATCH /users/me/desired-instructor
// Set desired instructor for authenticated user
export async function setDesiredInstructor(instructorId) {
   const id = Number(instructorId);
   if (!Number.isInteger(id) || id <= 0) {
      throw new Error("instructorId invalid (INT > 0).");
   }

   // Unele backend-uri așteaptă chei diferite.
   // Încercăm pe rând, iar dacă prima pică, retry cu alt payload.
   const payloads = [
      { instructorId: id },
      { desiredInstructorId: id },
   ];

   let lastErr = null;

   for (const payload of payloads) {
      const res = await apiClientService.patch(
         "/users/me/desired-instructor",
         JSON.stringify(payload),
         "application/json; charset=UTF-8"
      );

      if (res.ok) {
         // endpoint-ul poate întoarce JSON sau 204
         try {
            return await res.json();
         } catch {
            return true;
         }
      }

      // citim eroarea (o singură dată) și mergem la următorul payload
      try {
         lastErr = await res.text();
      } catch {
         lastErr = `HTTP ${res.status}`;
      }
   }

   throw new Error(lastErr || "Failed to set desired instructor.");
}

/** POST /users  — IMPORTANT: trimitem JSON stringificat */
export async function createUser(userData) {
   const payload = clean(userData);
   //console.log("[createUser] payload JSON ->", payload);

   const res = await apiClientService.post(
      "/users",
      JSON.stringify(payload),
      "application/json; charset=UTF-8"
   );
   if (!res.ok) {
      const text = await res.text();
      console.error("[createUser] HTTP error:", res.status, text);
      throw new Error(text || `HTTP ${res.status}`);
   }
   const json = await res.json();
   //console.log("[createUser] response <-", json);
   return json;
}

/** PATCH /users/:id — IMPORTANT: trimitem JSON stringificat */
export async function updateUser(userId, userData) {
   const payload = clean(userData);
   //console.log("[updateUser] payload JSON ->", payload);

   const res = await apiClientService.patch(
      `/users/${userId}`,
      JSON.stringify(payload),
      "application/json; charset=UTF-8"
   );
   if (!res.ok) {
      const text = await res.text();
      console.error("[updateUser] HTTP error:", res.status, text);
      throw new Error(text || `HTTP ${res.status}`);
   }
   const json = await res.json();
   //console.log("[updateUser] response <-", json);
   return json;
}

/** DELETE /users/:id */
/** DELETE /users/:id */
export async function deleteUser(userId) {
   const res = await apiClientService.delete(`/users/${userId}`);
   if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
         const data = await res.json();
         msg = data?.message || msg;
      } catch {
         try {
            msg = await res.text();
         } catch {}
      }
      console.error("[deleteUser] HTTP error:", res.status, msg);
      throw new Error(msg);
   }
   return true;
}

/** GET /users/group/:groupId */
export async function getUsersInGroup(groupId) {
   const res = await apiClientService.get(`/users/group/${groupId}`);
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}
