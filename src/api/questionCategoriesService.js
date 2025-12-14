// src/api/questionCategoriesService.js
import apiClientService from "./ApiClientService";

const QUESTION_CATEGORIES_BASE = "/question-categories";

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

export async function createQuestionCategory(payload) {
   const res = await apiClientService.post(
      QUESTION_CATEGORIES_BASE,
      JSON.stringify(payload || {})
   );

   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
         `questionCategoriesService.createQuestionCategory: ${text || res.status}`
      );
   }

   return await parseJsonSafe(res, null);
}

export async function getQuestionCategories(page = 1, limit = 50) {
   const params = new URLSearchParams();
   params.set("page", String(page ?? 1));
   params.set("limit", String(limit ?? 50));

   const res = await apiClientService.get(
      `${QUESTION_CATEGORIES_BASE}?${params.toString()}`
   );

   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
         `questionCategoriesService.getQuestionCategories: ${text || res.status}`
      );
   }

   return await parseJsonSafe(res, []);
}

export async function getQuestionCategoriesWithCount() {
   const res = await apiClientService.get(
      `${QUESTION_CATEGORIES_BASE}/with-count`
   );

   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
         `questionCategoriesService.getQuestionCategoriesWithCount: ${text || res.status}`
      );
   }

   return await parseJsonSafe(res, []);
}

export async function updateQuestionCategory(id, payload) {
   if (id == null)
      throw new Error("updateQuestionCategory: id este obligatoriu");

   const res = await apiClientService.put(
      `${QUESTION_CATEGORIES_BASE}/${id}`,
      JSON.stringify(payload || {})
   );

   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
         `questionCategoriesService.updateQuestionCategory: ${text || res.status}`
      );
   }

   return await parseJsonSafe(res, null);
}

export async function deleteQuestionCategory(id) {
   if (id == null)
      throw new Error("deleteQuestionCategory: id este obligatoriu");

   const res = await apiClientService.delete(`${QUESTION_CATEGORIES_BASE}/${id}`);

   if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "");
      throw new Error(
         `questionCategoriesService.deleteQuestionCategory: ${text || res.status}`
      );
   }

   return id;
}
