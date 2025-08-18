import apiClientService from "./ApiClientService";

export async function getInstructors() {
   const response = await apiClientService.get("/instructors");

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error: ${text}`);
   }

   return await response.json();
}

export async function createInstructors(payload) {
   const response = await apiClientService.post(
      "/instructors",
      JSON.stringify(payload)
   );

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error: ${text}`);
   }

   return await response.json();
}

export async function patchInstructors(id, payload) {
   const response = await apiClientService.patch(
      `/instructors/${id}`,
      JSON.stringify(payload)
   );

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error: ${text}`);
   }

   return await response.json();
}

export async function deleteInstructors(id) {
   const response = await apiClientService.delete(`/instructors/${id}`);

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error: ${text}`);
   }

   return true; // sau poți returna ceva dacă vrei
}
