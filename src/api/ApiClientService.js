// src/api/ApiClientService.js
const getCookie = (name) => {
   if (typeof document === "undefined") return null;
   const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
   return match ? match[2] : null;
};

const isJsonContentType = (ct) =>
   !ct || String(ct).toLowerCase().includes("application/json");

const IS_DEV = process.env.NODE_ENV !== "production";
let warnedMissingToken = false;

const isHttpDebugEnabled = () => {
   if (!IS_DEV) return false;
   if (typeof window === "undefined") return true;
   if (window.__HTTP_DEBUG === true) return true;
   try {
      return localStorage.getItem("__HTTP_DEBUG") === "1";
   } catch {
      return false;
   }
};

const warnMissingTokenOnce = () => {
   if (!IS_DEV || warnedMissingToken) return;
   warnedMissingToken = true;
   console.warn(
      "[AUTH] Nu există access_token în cookies; cererile vor merge fără Authorization.",
   );
};

const sendRequest = async (
   method,
   endpoint,
   data = null,
   contentType = null,
) => {
   const apiUrl = process.env.REACT_APP_API_URL;
   const debugEnabled = isHttpDebugEnabled();

   const defaultContentType = "application/json; charset=UTF-8";
   const token = getCookie("access_token");
   if (!token) {
      warnMissingTokenOnce();
   } else if (debugEnabled) {
      console.debug(
         "[AUTH] Token prezent. Primele 12 caractere:",
         token.slice(0, 12),
         "...",
      );
   }

   const headers = {
      Accept: "application/json",
   };

   // adaugă Authorization doar dacă există token
   if (token) {
      headers.Authorization = `Bearer ${token}`;
   }

   const upper = method.toUpperCase();
   if (upper !== "GET" && upper !== "HEAD") {
      // setează Content-Type doar pentru metode cu body
      headers["Content-Type"] = contentType ?? defaultContentType;
   }

   const requestOptions = { method: upper, headers };

   if (data != null && upper !== "GET" && upper !== "HEAD") {
      if (data instanceof FormData) {
         delete requestOptions.headers["Content-Type"];
         requestOptions.body = data;
      } else if (typeof data === "string" || data instanceof Blob) {
         requestOptions.body = data;
      } else if (isJsonContentType(requestOptions.headers["Content-Type"])) {
         requestOptions.body = JSON.stringify(data);
      } else {
         requestOptions.body = data;
      }
   }

   try {
      const base = String(apiUrl || "").replace(/\/+$/, "");
      const path = String(endpoint || "").startsWith("/")
         ? endpoint
         : `/${endpoint}`;
      const url = `${base}${path}`;

      if (debugEnabled) {
         console.debug("[HTTP]", upper, endpoint, {
            headers,
            body: requestOptions.body,
         });
      }

      const response = await fetch(url, requestOptions);

      if (debugEnabled) {
         let responseText = "";
         try {
            responseText = await response.clone().text();
         } catch {}
         console.debug("[HTTP RES]", response.status, endpoint, responseText);
      }

      return response;
   } catch (error) {
      console.error("API call error:", error);
      throw error;
   }
};

const apiClientService = {
   get: (endpoint) => sendRequest("GET", endpoint),
   post: (endpoint, data, contentType = null) =>
      sendRequest("POST", endpoint, data, contentType),
   put: (endpoint, data, contentType = null) =>
      sendRequest("PUT", endpoint, data, contentType),
   patch: (endpoint, data, contentType = null) =>
      sendRequest("PATCH", endpoint, data, contentType),
   delete: (endpoint) => sendRequest("DELETE", endpoint),
};

export default apiClientService;
