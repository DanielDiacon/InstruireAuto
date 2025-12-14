// src/api/questionsService.js
import apiClientService from "./ApiClientService";

async function parseJsonSafe(res, fallback) {
   const ct = res.headers?.get?.("content-type") || "";
   if (ct.includes("application/json")) {
      try {
         return await res.json();
      } catch {
         return fallback;
      }
   }
   const text = await res.text().catch(() => "");
   if (!text) return fallback;
   try {
      return JSON.parse(text);
   } catch {
      return fallback;
   }
}

// GET /exams/questions?page=&limit=&q=&categoryId=
export async function searchQuestions({
   q = "",
   page = 1,
   limit = 60,
   categoryId,
} = {}) {
   const params = new URLSearchParams();
   params.set("page", String(page ?? 1));
   params.set("limit", String(limit ?? 60));

   const qq = String(q || "").trim();
   if (qq) params.set("q", qq);

   // dacă backend-ul suportă filtrare după categoryId, îl trimitem
   if (categoryId != null && String(categoryId) !== "") {
      params.set("categoryId", String(categoryId));
   }

   const res = await apiClientService.get(`/exams/questions?${params.toString()}`);
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`searchQuestions ${res.status}: ${text || res.statusText}`);
   }

   // API-ul tău: { data: [...] }
   return await parseJsonSafe(res, { data: [] });
}

// PUT /exams/questions/:id  (update complet / partial - noi trimitem câmpurile importante)
export async function updateQuestion(id, payload) {
   const qid = Number(id);
   if (!Number.isInteger(qid) || qid <= 0) {
      throw new Error("updateQuestion: id invalid.");
   }

   const res = await apiClientService.put(
      `/exams/questions/${qid}`,
      JSON.stringify(payload || {})
   );

   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`updateQuestion ${res.status}: ${text || res.statusText}`);
   }

   return await parseJsonSafe(res, null);
}
