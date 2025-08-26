import apiClientService from "./ApiClientService";

// --- CRUD Groups ---
export async function getInstructorsGroups() {
   const res = await apiClientService.get("/instructors-group");
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}

export async function getInstructorsGroupById(id) {
   const res = await apiClientService.get(`/instructors-group/${id}`);
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}

export async function createInstructorsGroup(payload) {
   const res = await apiClientService.post(
      "/instructors-group",
      JSON.stringify(payload)
   );
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}

export async function patchInstructorsGroup(id, payload) {
   const res = await apiClientService.patch(
      `/instructors-group/${id}`,
      JSON.stringify(payload)
   );
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}

export async function deleteInstructorsGroup(id) {
   const res = await apiClientService.delete(`/instructors-group/${id}`);
   if (!res.ok) throw new Error(await res.text());
   return true;
}

// --- Instructors in Group ---
export async function addInstructorToGroup(groupId, instructorId) {
   const res = await apiClientService.post(
      `/instructors-group/${groupId}/instructors/${instructorId}`
   );
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}

export async function removeInstructorFromGroup(groupId, instructorId) {
   const res = await apiClientService.delete(
      `/instructors-group/${groupId}/instructors/${instructorId}`
   );
   if (!res.ok) throw new Error(await res.text());
   return true;
}

export async function swapInstructorInGroup(
   groupId,
   oldInstructorId,
   newInstructorId
) {
   const res = await apiClientService.post(
      `/instructors-group/${groupId}/swap-instructor/${oldInstructorId}/${newInstructorId}`
   );
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}
