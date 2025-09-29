// src/store/instructorsGroupSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
   getInstructorsGroups,
   createInstructorsGroup,
   patchInstructorsGroup,
   deleteInstructorsGroup,
   addInstructorToGroup,
   removeInstructorFromGroup,
   swapInstructorInGroup,
} from "../api/instructorsGroupService";

// --- Thunks ---
export const fetchInstructorsGroups = createAsyncThunk(
   "instructorsGroups/fetchInstructorsGroups",
   async () => {
      const groups = await getInstructorsGroups();
      return groups.sort(
         (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
   }
);

export const addGroup = createAsyncThunk(
   "instructorsGroups/addGroup",
   async (payload) => await createInstructorsGroup(payload)
);

// ✅ PATCH corect: trimite doar { data } spre API
export const updateGroup = createAsyncThunk(
   "instructorsGroups/updateGroup",
   async ({ id, data }) => {
      const updated = await patchInstructorsGroup(id, data);
      return updated;
   }
);

export const removeGroup = createAsyncThunk(
   "instructorsGroups/removeGroup",
   async (id) => {
      await deleteInstructorsGroup(id);
      return id;
   }
);

export const addInstructor = createAsyncThunk(
   "instructorsGroups/addInstructor",
   async ({ groupId, instructorId }) => {
      return await addInstructorToGroup(groupId, instructorId);
   }
);

export const removeInstructor = createAsyncThunk(
   "instructorsGroups/removeInstructor",
   async ({ groupId, instructorId }) => {
      await removeInstructorFromGroup(groupId, instructorId);
      return { groupId, instructorId };
   }
);

export const swapInstructor = createAsyncThunk(
   "instructorsGroups/swapInstructor",
   async ({ groupId, oldInstructorId, newInstructorId }) => {
      return await swapInstructorInGroup(
         groupId,
         oldInstructorId,
         newInstructorId
      );
   }
);

// --- Slice ---
const instructorsGroupSlice = createSlice({
   name: "instructorsGroups",
   initialState: { list: [], status: "idle", error: null },
   reducers: {},
   extraReducers: (builder) => {
      builder
         .addCase(fetchInstructorsGroups.pending, (s) => {
            s.status = "loading";
         })
         .addCase(fetchInstructorsGroups.fulfilled, (s, a) => {
            s.status = "succeeded";
            s.list = a.payload;
         })
         .addCase(fetchInstructorsGroups.rejected, (s, a) => {
            s.status = "failed";
            s.error = a.error.message;
         })
         .addCase(addGroup.fulfilled, (s, a) => {
            s.list.push({
               ...a.payload,
               instructors: a.payload.instructors || [],
               cars: a.payload.cars || [],
            });
         })
         .addCase(updateGroup.fulfilled, (state, action) => {
            const idFromPayload = action.payload?.id;
            const idFromArg = action.meta?.arg?.id;
            const idx = state.list.findIndex(
               (g) => g.id === (idFromPayload ?? idFromArg)
            );
            if (idx !== -1) {
               const clientPatch = action.meta?.arg?.data || {};
               state.list[idx] = {
                  ...state.list[idx],
                  ...action.payload,
                  ...clientPatch,
               };
            }
         })

         .addCase(removeGroup.fulfilled, (s, a) => {
            s.list = s.list.filter((g) => g.id !== a.payload);
         })
         .addCase(addInstructor.fulfilled, (s, a) => {
            const g = s.list.find((x) => x.id === a.payload.groupId);
            if (g) {
               g.instructors = g.instructors || [];
               g.cars = g.cars || [];
               g.instructors.push(a.payload.instructor);
               g.cars.push(a.payload.car);
            }
         })
         .addCase(removeInstructor.fulfilled, (s, a) => {
            const g = s.list.find((x) => x.id === a.payload.groupId);
            if (g) {
               g.instructors = g.instructors.filter(
                  (i) => i.id !== a.payload.instructorId
               );
            }
         })
         .addCase(swapInstructor.fulfilled, (s, a) => {
            const g = s.list.find((x) => x.id === a.payload.id);
            if (g) g.instructors = a.payload.instructors;
         });
   },
});

export default instructorsGroupSlice.reducer;
