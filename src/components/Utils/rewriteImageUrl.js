// src/utils/rewriteImageUrl.js
const IMG_HOST = "https://instruireauto.site";

/**
 * EXAMEN_INSTRUIERE_AUTO/...  -> https://instruireauto.site/images/...
 * Acceptă și EXAMEN-INSTRUIERE-AUTO, lowercase, cu/ fără leading slash.
 */
export function rewriteImageUrl(raw) {
   if (!raw) return null;
   try {
      const u = new URL(String(raw).trim(), IMG_HOST);

      const segs = u.pathname.split("/").filter(Boolean);
      const norm = (s) => s.toLowerCase().replace(/[-_]+/g, "");
      const token = "exameninstruireauto";

      let idx = segs.findIndex((p) => norm(p) === token);

      if (idx !== -1) {
         segs[idx] = "images";
      } else {
         if (segs.length && norm(segs[0]) !== "images") {
            segs.unshift("images");
         }
      }

      u.pathname = "/" + segs.join("/");
      u.pathname = u.pathname.replace(/\/{2,}/g, "/");
      return u.origin + u.pathname;
   } catch {
      const tail = String(raw)
         .trim()
         .replace(/^https?:\/\/[^/]+/i, "")
         .replace(/^\/+/, "");
      const m = tail.match(/EXAMEN[-_]?INSTRUIERE[-_]?AUTO\/(.+)/i);
      const tailClean = m ? m[1] : tail;
      return `${IMG_HOST.replace(/\/+$/, "")}/images/${tailClean}`.replace(
         /\/{2,}/g,
         "/"
      );
   }
}
