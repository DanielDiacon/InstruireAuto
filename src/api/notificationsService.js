import apiClientService from "./ApiClientService";

/**
 * POST /notifications/confirm/{token}
 */
export async function confirmReservationPresence(token) {
   const safe = encodeURIComponent(String(token || ""));
   // NU mai pune /api aici, ApiClientService îl are deja
   const res = await apiClientService.post(`/notifications/confirm/${safe}`);

   if (!res.ok) {
      // încearcă să citești body-ul de eroare (dacă există)
      let msg = "Nu s-a putut confirma prezența.";
      try {
         const err = await res.json();
         if (err?.message) msg = err.message;
      } catch {}
      throw new Error(msg);
   }

   // 201 poate să nu aibă body → protejăm parsarea
   try {
      return await res.json();
   } catch {
      return {};
   }
}

/**
 * POST /notifications/test-tomorrow
 */
export async function testNotificationsTomorrow() {
   const res = await apiClientService.post(`/notifications/test-tomorrow`);

   if (!res.ok) {
      let msg = "Nu s-au putut trimite notificările de test.";
      try {
         const err = await res.json();
         if (err?.message) msg = err.message;
      } catch {}
      throw new Error(msg);
   }

   try {
      return await res.json();
   } catch {
      return {};
   }
}
