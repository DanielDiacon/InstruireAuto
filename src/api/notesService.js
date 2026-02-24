// src/api/notesService.js
import apiClientService from "./ApiClientService";

const NOTES_BASE = "/notes";

/** Helper mic pentru parsare JSON în siguranță – îl lași cum este acum */
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

function normalizeIsoQueryParam(value) {
   if (!value) return "";
   if (value instanceof Date) {
      return Number.isFinite(value.getTime()) ? value.toISOString() : "";
   }
   if (typeof value === "string") return value;
   const d = new Date(value);
   return Number.isFinite(d.getTime()) ? d.toISOString() : "";
}

/**
 * NOTIȚE PENTRU AȘTEPTĂRI – interval de timp (ex: luna curentă),
 * filtrate cu type=wait-slot pe backend.
 *
 * Compat:
 * - fetchWaitNotesRange(fromIso, toIso)
 * - fetchWaitNotesRange({ from, to, type })
 */
export async function fetchWaitNotesRange(fromIsoOrOptions, toIsoMaybe) {
   let fromIso = fromIsoOrOptions;
   let toIso = toIsoMaybe;
   let noteType = "wait-slot";

   if (
      fromIsoOrOptions &&
      typeof fromIsoOrOptions === "object" &&
      !(fromIsoOrOptions instanceof Date)
   ) {
      fromIso =
         fromIsoOrOptions.fromIso ??
         fromIsoOrOptions.from ??
         fromIsoOrOptions.start ??
         null;
      toIso =
         fromIsoOrOptions.toIso ??
         fromIsoOrOptions.to ??
         fromIsoOrOptions.end ??
         null;
      if (fromIsoOrOptions.type) {
         noteType = String(fromIsoOrOptions.type);
      }
   }

   const fromParam = normalizeIsoQueryParam(fromIso);
   const toParam = normalizeIsoQueryParam(toIso);

   const params = new URLSearchParams();
   if (fromParam) params.set("from", fromParam);
   if (toParam) params.set("to", toParam);
   params.set("type", noteType || "wait-slot"); // dacă backend-ul tău folosește acest filtru

   const url =
      params.toString().length > 0
         ? `${NOTES_BASE}?${params.toString()}`
         : NOTES_BASE;

   const res = await apiClientService.get(url);

   if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`notesService.fetchWaitNotesRange: ${txt || res.status}`);
   }

   const data = await parseJsonSafe(res, []);
   return Array.isArray(data) ? data : [];
}

/** GET /api/notes – toate notițele */
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
   // payload: { title, content, date, type?, userId? }
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

/** DELETE /api/notes/:id */
export async function deleteNote(id) {
   if (id == null) throw new Error("deleteNote: id este obligatoriu");

   const res = await apiClientService.delete(`${NOTES_BASE}/${id}`);

   if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "");
      throw new Error(`notesService.deleteNote: ${text || res.status}`);
   }

   return id;
}
