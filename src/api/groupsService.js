// src/api/groupsService.js
import apiClientService from "./ApiClientService";

/* ================= helpers ================= */

function safeLang(lang) {
   const v = String(lang || "").toLowerCase();
   return v === "ru" ? "ru" : "ro";
}

function ensurePositiveInt(value, name) {
   const n = Number(value);
   if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`${name} invalid (INT > 0).`);
   }
   return n;
}

function clampInt(value, def, min, max) {
   let n = Number(value);
   if (!Number.isInteger(n)) n = def;
   if (n < min) n = min;
   if (n > max) n = max;
   return n;
}

async function throwIfNotOk(res, fallbackPrefix = "Server error") {
   if (res.ok) return;

   // citim o singură dată body-ul
   const text = await res.text();

   // încercăm să extragem "message" din JSON (dacă backend-ul trimite JSON)
   let msg = text;
   try {
      const j = JSON.parse(text);
      msg =
         j?.message ||
         j?.error ||
         j?.details?.message ||
         (Array.isArray(j?.message) ? j.message.join(", ") : null) ||
         text;
   } catch (_) {
      // text simplu
   }

   throw new Error(`${fallbackPrefix}: ${msg}`);
}

/* ================= existing (admin/groups CRUD) ================= */

export async function getGroups() {
   const response = await apiClientService.get("/groups");
   await throwIfNotOk(response);
   return await response.json();
}

export async function createGroups(payload) {
   const response = await apiClientService.post(
      "/groups",
      JSON.stringify(payload),
   );
   await throwIfNotOk(response);
   return await response.json();
}

export async function deleteGroup(id) {
   const gid = ensurePositiveInt(id, "deleteGroup: id");
   const response = await apiClientService.delete(`/groups/${gid}`);
   await throwIfNotOk(response);
   return true;
}

export async function patchGroup(id, payload) {
   const gid = ensurePositiveInt(id, "patchGroup: id");
   const response = await apiClientService.patch(
      `/groups/${gid}`,
      JSON.stringify(payload),
   );
   await throwIfNotOk(response);
   return await response.json();
}

/* ================= PROFESSOR endpoints ================= */

export async function getMyGroupStudents() {
   // ✅ Swagger: GET /api/groups/my-groups/students
   const res = await apiClientService.get("/groups/my-groups/students");
   await throwIfNotOk(res, "getMyGroupStudents failed");
   return await res.json();
}

export async function getMyGroupOverview() {
   // ✅ GET /api/groups/my-group/overview -> { totalGroups, groups:[...] }
   const res = await apiClientService.get("/groups/my-group/overview");
   await throwIfNotOk(res, "getMyGroupOverview failed");
   return await res.json();
}

export async function getStudentPracticeProgress({
   studentId,
   page = 1,
   limit = 20,
} = {}) {
   const sid = ensurePositiveInt(
      studentId,
      "getStudentPracticeProgress: studentId",
   );

   const p = clampInt(page, 1, 1, 999999);
   const l = clampInt(limit, 20, 1, 200);

   const qs = new URLSearchParams();
   qs.set("page", String(p));
   qs.set("limit", String(l));

   const url = `/groups/my-group/students/${sid}/practice-progress?${qs.toString()}`;

   const res = await apiClientService.get(url);
   await throwIfNotOk(res, "getStudentPracticeProgress failed");
   return await res.json();
}

export async function getStudentDetailedPracticeSession({
   studentId,
   practiceId,
   lang = "ro",
} = {}) {
   const sid = ensurePositiveInt(
      studentId,
      "getStudentDetailedPracticeSession: studentId",
   );
   const pid = ensurePositiveInt(
      practiceId,
      "getStudentDetailedPracticeSession: practiceId",
   );

   const qs = new URLSearchParams();
   qs.set("practiceId", String(pid));
   qs.set("lang", safeLang(lang));

   const url = `/exams/practice/student/${sid}/detailed?${qs.toString()}`;

   const res = await apiClientService.get(url);
   await throwIfNotOk(res, "getStudentDetailedPracticeSession failed");
   return await res.json();
}
