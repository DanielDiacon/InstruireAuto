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

export const updateGroup = createAsyncThunk(
   "instructorsGroups/updateGroup",
   async ({ id, ...payload }) => {
      const updated = await patchInstructorsGroup(id, payload);
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
   initialState: {
      list: [],
      status: "idle",
      error: null,
   },
   reducers: {},
   extraReducers: (builder) => {
      builder
         .addCase(fetchInstructorsGroups.pending, (state) => {
            state.status = "loading";
         })
         .addCase(fetchInstructorsGroups.fulfilled, (state, action) => {
            state.status = "succeeded";
            state.list = action.payload;
         })
         .addCase(fetchInstructorsGroups.rejected, (state, action) => {
            state.status = "failed";
            state.error = action.error.message;
         })
         .addCase(addGroup.fulfilled, (state, action) => {
            state.list.push({
               ...action.payload,
               instructors: action.payload.instructors || [],
               cars: action.payload.cars || [],
            });
         })
         .addCase(updateGroup.fulfilled, (state, action) => {
            const index = state.list.findIndex(
               (g) => g.id === action.payload.id
            );
            if (index !== -1)
               state.list[index] = { ...state.list[index], ...action.payload };
         })
         .addCase(removeGroup.fulfilled, (state, action) => {
            state.list = state.list.filter((g) => g.id !== action.payload);
         })
         .addCase(addInstructor.fulfilled, (state, action) => {
            const group = state.list.find(
               (g) => g.id === action.payload.groupId
            );
            if (group) {
               group.instructors = group.instructors || [];
               group.cars = group.cars || [];
               group.instructors.push(action.payload.instructor);
               group.cars.push(action.payload.car);
            }
         })
         .addCase(removeInstructor.fulfilled, (state, action) => {
            const group = state.list.find(
               (g) => g.id === action.payload.groupId
            );
            if (group) {
               group.instructors = group.instructors.filter(
                  (i) => i.id !== action.payload.instructorId
               );
            }
         })
         .addCase(swapInstructor.fulfilled, (state, action) => {
            const group = state.list.find((g) => g.id === action.payload.id);
            if (group) group.instructors = action.payload.instructors;
         });
   },
});

export default instructorsGroupSlice.reducer;
