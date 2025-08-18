import apiClientService from "./ApiClientService";

export async function getUsers() {
   const response = await apiClientService.get("/users");

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error: ${text}`);
   }

   return await response.json();
}
