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
   contentType = null
) => {
   const defaultContentType = "application/json; charset=UTF-8";

   const headers = {
      Authorization: `Bearer ${getCookie("access_token") || ""}`.trim(),
   };

   // Setăm Content-Type doar dacă NU e GET/HEAD și doar dacă nu e FormData
   const upper = method.toUpperCase();
   if (upper !== "GET" && upper !== "HEAD") {
      headers["Content-Type"] = contentType ?? defaultContentType;
   }

   // Bun de avut: semnalăm că dorim JSON în răspuns (nu strică dacă serverul îl ignoră)
   headers["Accept"] = "application/json";

   const requestOptions = {
      method: upper,
      headers,
   };

   // Body
   if (data != null && upper !== "GET" && upper !== "HEAD") {
      if (data instanceof FormData) {
         // Lăsăm browserul să seteze boundary-ul corect
         delete requestOptions.headers["Content-Type"];
         requestOptions.body = data;
      } else if (typeof data === "string" || data instanceof Blob) {
         // Dacă trimiți deja un string (ex: JSON.stringify manual) sau Blob, folosește-l ca atare
         requestOptions.body = data;
      } else if (isJsonContentType(requestOptions.headers["Content-Type"])) {
         // Trimitere JSON corectă
         requestOptions.body = JSON.stringify(data);
      } else {
         // Alte tipuri (ex: x-www-form-urlencoded, text/plain) — presupunem că e deja corect
         requestOptions.body = data;
      }
   }

   try {
      const url = "https://instruireauto.site/api" + endpoint;

      // GET/HEAD fără body
      const response =
         upper === "GET" || upper === "HEAD"
            ? await fetch(url, {
                 headers: {
                    Authorization: headers.Authorization,
                    Accept: headers.Accept,
                 },
              })
            : await fetch(url, requestOptions);

      if (response.type === "cors" && response.redirected) {
         window.location.href = response.url;
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
