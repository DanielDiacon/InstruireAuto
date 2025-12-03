// src/api/notesService.js
import apiClientService from "./ApiClientService";

// ApiClientService are deja base-ul /api, deci aici folosim doar " /notes "
const NOTES_BASE = "/notes";

/** Helper mic pentru parsare JSON în siguranță */
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

/** GET /api/notes  – toate notițele */
export async function getNotes() {
   const res = await apiClientService.get(NOTES_BASE);

   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`notesService.getNotes: ${text || res.status}`);
   }

   return await parseJsonSafe(res, []);
}

/** GET /api/notes/:id – o notiță după id */
export async function getNote(id) {
   if (id == null) throw new Error("getNote: id este obligatoriu");

   const res = await apiClientService.get(`${NOTES_BASE}/${id}`);

   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`notesService.getNote: ${text || res.status}`);
   }

   return await parseJsonSafe(res, null);
}

/** POST /api/notes – crează o notiță nouă */
export async function createNote(payload) {
   // payload: { title: string, content: string }
   const res = await apiClientService.post(
      NOTES_BASE,
      JSON.stringify(payload || {})
   );

   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`notesService.createNote: ${text || res.status}`);
   }

   return await parseJsonSafe(res, null);
}

/** PATCH /api/notes/:id – update la o notiță existentă */
export async function updateNote(id, data) {
   if (id == null) throw new Error("updateNote: id este obligatoriu");

   const res = await apiClientService.patch(
      `${NOTES_BASE}/${id}`,
      JSON.stringify(data || {})
   );

   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`notesService.updateNote: ${text || res.status}`);
   }

   return await parseJsonSafe(res, null);
}

/** (opțional) DELETE /api/notes/:id – ștergere notiță */
export async function deleteNote(id) {
   if (id == null) throw new Error("deleteNote: id este obligatoriu");

   const res = await apiClientService.delete(`${NOTES_BASE}/${id}`);

   if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "");
      throw new Error(`notesService.deleteNote: ${text || res.status}`);
   }

   return id;
}
