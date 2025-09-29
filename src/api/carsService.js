import apiClientService from "./ApiClientService";

// Get all cars
export async function getCars() {
   const response = await apiClientService.get("/cars");
   if (!response.ok) throw new Error(await response.text());
   return await response.json();
}

// Get a car by id
export async function getCarById(id) {
   const response = await apiClientService.get(`/cars/${id}`);
   if (!response.ok) throw new Error(await response.text());
   return await response.json();
}

// ✅ Create a new car
export async function createCar(payload) {
   const response = await apiClientService.post(
      "/cars",
      JSON.stringify(payload)
   );
   if (!response.ok) throw new Error(await response.text());
   return await response.json();
}

// Update a car
export async function patchCar(id, payload) {
   const response = await apiClientService.patch(
      `/cars/${id}`,
      JSON.stringify(payload)
   );
   if (!response.ok) throw new Error(await response.text());
   return await response.json();
}

// Delete a car
export async function deleteCar(id) {
   const response = await apiClientService.delete(`/cars/${id}`);
   if (!response.ok) throw new Error(await response.text());
   return true;
}

