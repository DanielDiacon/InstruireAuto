// src/api/ApiClientService.js
const getCookie = (name) => {
   if (typeof document === "undefined") return null;
   const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
   return match ? match[2] : null;
};

const isJsonContentType = (ct) =>
   !ct || String(ct).toLowerCase().includes("application/json");

const sendRequest = async (
   method,
   endpoint,
   data = null,
   contentType = null,
) => {
   const apiUrl = import.meta.env.API_URL;
   const defaultContentType = "application/json; charset=UTF-8";
   const token = getCookie("access_token");
   // după const token = getCookie("access_token");
   if (!token) {
      console.warn(
         "[AUTH] Nu există access_token în cookies → Authorization nu va fi trimis.",
      );
   } else {
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
      // safe text
      const base = String(apiUrl).replace(/\/+$/, "");
      const path = String(endpoint).startsWith("/") ? endpoint : `/${endpoint}`;
      const url = `${base}${path}`;

      // DEBUG prietenos
      try {
         console.debug("[HTTP]", upper, endpoint, {
            headers,
            body: requestOptions.body,
         });
      } catch {}

      const response = await fetch(url, requestOptions);

      let responseText = "";
      try {
         responseText = await response.clone().text();
      } catch {}
      try {
         console.debug("[HTTP RES]", response.status, endpoint, responseText);
      } catch {}

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
