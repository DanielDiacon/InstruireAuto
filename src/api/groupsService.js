import apiClientService from "./ApiClientService";

export async function getGroups() {
   const response = await apiClientService.get("/groups");

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error: ${text}`);
   }

   return await response.json();
}

export async function createGroups(payload) {
   const response = await apiClientService.post(
      "/groups",
      JSON.stringify(payload)
   );

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error: ${text}`);
   }

   return await response.json();
}

export async function deleteGroup(id) {
   const response = await apiClientService.delete(`/groups/${id}`);

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error: ${text}`);
   }

   return true; // sau poți returna ceva dacă vrei
}

export async function patchGroup(id, payload) {
   const response = await apiClientService.patch(
      `/groups/${id}`,
      JSON.stringify(payload)
   );

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error: ${text}`);
   }

   return await response.json();
}
