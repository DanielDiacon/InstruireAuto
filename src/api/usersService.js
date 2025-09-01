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

/** POST /users  — IMPORTANT: trimitem JSON stringificat */
export async function createUser(userData) {
   const payload = clean(userData);
   console.log("[createUser] payload JSON ->", payload);

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
   console.log("[createUser] response <-", json);
   return json;
}

/** PATCH /users/:id — IMPORTANT: trimitem JSON stringificat */
export async function updateUser(userId, userData) {
   const payload = clean(userData);
   console.log("[updateUser] payload JSON ->", payload);

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
   console.log("[updateUser] response <-", json);
   return json;
}

/** DELETE /users/:id */
export async function deleteUser(userId) {
   const res = await apiClientService.delete(`/users/${userId}`);
   if (!res.ok) throw new Error(await res.text());
   return true;
}

/** GET /users/group/:groupId */
export async function getUsersInGroup(groupId) {
   const res = await apiClientService.get(`/users/group/${groupId}`);
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}
