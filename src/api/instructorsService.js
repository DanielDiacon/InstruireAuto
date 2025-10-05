// src/api/instructorsService.js
import apiClientService from "./ApiClientService";

export async function getInstructors() {
   const res = await apiClientService.get("/instructors");
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}

export async function createInstructors(payload) {
   const res = await apiClientService.post("/instructors", payload); // obiect, NU stringify
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}

export async function patchInstructors(id, payload) {
   const res = await apiClientService.patch(`/instructors/${id}`, payload); // obiect
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}

export async function patchInstructorOrder(id, order) {
   // trimitem doar order; backend-ul tău ar trebui să accepte PATCH parțial
   const res = await apiClientService.patch(`/instructors/${id}`, { order });
   if (!res.ok) throw new Error(await res.text());
   return res.json(); // așteptăm să întoarcă instructorul actualizat sau cel puțin { order }
}

export async function deleteInstructors(id) {
   const res = await apiClientService.delete(`/instructors/${id}`);
   if (!res.ok) throw new Error(await res.text());
   return true;
}
