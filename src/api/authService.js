import apiClientService from "./ApiClientService";

const BASE_URL = `/auth`;
const GIFT_WEBHOOK_URL =
   "https://n8n.srv1198166.hstgr.cloud/webhook/trimitere-email-cadou";

export async function signup(payload) {
   const response = await apiClientService.post(
      BASE_URL + "/register",
      JSON.stringify(payload)
   );

   if (!response.ok) {
      await throwDetailedError(response);
   }

   const data = await response.json();

   if (data.access_token) {
      // Salvezi token-ul după ce ai primit răspunsul OK
      document.cookie = `access_token=${data.access_token}; path=/; max-age=${
         60 * 60 * 24 * 7
      }`;
   }

   return data;
}

export async function signin(payload) {
   const response = await apiClientService.post(
      BASE_URL + "/login",
      JSON.stringify(payload)
   );

   if (!response.ok) {
      await throwDetailedError(response);
   }

   const data = await response.json();

   if (data.access_token) {
      document.cookie = `access_token=${data.access_token}; path=/; max-age=${
         60 * 60 * 24 * 7
      }`;
      console.log(data.access_token);
   }

   return data;
}

export async function signout() {
   const response = await apiClientService.delete(BASE_URL + "/signout");

   if (!response.ok) {
      await throwDetailedError(response);
   }

   // Ștergi cookie-ul token la logout
   document.cookie =
      "access_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure";
}

export async function fetchUserInfo() {
   const response = await apiClientService.get("/auth/me");

   if (!response.ok) {
      throw new Error("Failed to fetch user info");
   }

   return await response.json();
}

async function throwDetailedError(response) {
   const errorResponse = await response.json();
   const message = errorResponse.message || JSON.stringify(errorResponse);
   throw new Error(message);
}
export async function requestPasswordReset(email) {
   const response = await apiClientService.post(
      BASE_URL + "/request-reset-password",
      JSON.stringify({ email })
   );

   if (!response.ok) {
      await throwDetailedError(response);
   }

   // poate să nu aibă body; protejăm parsarea
   try {
      return await response.json();
   } catch {
      return {};
   }
}

export async function resetPassword({ token, newPassword }) {
   const response = await apiClientService.post(
      "/auth/reset-password",
      JSON.stringify({ token, newPassword })
   );

   if (!response.ok) {
      await throwDetailedError(response);
   }

   try {
      return await response.json();
   } catch {
      return {};
   }
}
/* ================== ENROLL / CONTRACTE ================== */
/**
 * Trimite datele studentului către endpoint-ul care generează
 * contractele și le expediază pe email.
 *
 * @param {object} payload  // trebuie să respecte schema backend-ului:
 *  {
 *    nume, prenume, cetatenia, email,
 *    raion, localitate, strada, numar, apartament,
 *    serieActIdentitate, numarActIdentitate, eliberatDe, dataEliberare (dd.MM.yyyy),
 *    dataNasterii (dd.MM.yyyy), sex: "M"|"F",
 *    idnp, telefon, telefonContact, cutie: "MECANICĂ"|"AUTOMATĂ",
 *    deUndeAflat
 *  }
 */
export async function enrollStudent(payload) {
   const response = await apiClientService.post(
      // dacă apiClientService NU are prefix /api, schimbă în "/api/contracts/generate"
      "/contracts/generate",
      JSON.stringify(payload)
   );

   if (!response.ok) {
      await throwDetailedError(response);
   }

   try {
      return await response.json();
   } catch {
      return {};
   }
}

/**
 * Trimite emailul-cadou în n8n după înscriere reușită.
 *
 * @param {object} payload
 *  {
 *    nume, prenume, email
 *  }
 */
export async function sendGiftWebhook(payload) {
   const response = await fetch(GIFT_WEBHOOK_URL, {
      method: "POST",
      headers: {
         Accept: "application/json",
         "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(payload),
   });

   if (!response.ok) {
      let details = "";
      try {
         details = (await response.text())?.trim();
      } catch {}

      throw new Error(
         details || `Webhook cadou a eșuat (status ${response.status}).`,
      );
   }

   try {
      return await response.json();
   } catch {
      return {};
   }
}
