import apiClientService from "./ApiClientService";

export async function createReservations(payload) {
   const response = await apiClientService.post(
      "/reservations",
      JSON.stringify(payload)
   );

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error: ${text}`);
   }

   return await response.json();
}

export async function getReservations() {
   const response = await apiClientService.get(`/reservations`);

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error: ${text}`);
   }

   return await response.json();
}

export async function getUserReservations(userId) {
  const response = await apiClientService.get(`/reservations/user/${userId}`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server error: ${text}`);
  }

  return await response.json();
}

export async function getAllReservations() {
   const response = await apiClientService.get(`/reservations/all`);

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error: ${text}`);
   }

   return await response.json();
}
