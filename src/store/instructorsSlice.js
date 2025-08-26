// src/store/instructorsSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
   getInstructors,
   createInstructors,
   patchInstructors,
   deleteInstructors,
} from "../api/instructorsService";

// === Thunks asincrone ===
export const fetchInstructors = createAsyncThunk(
   "instructors/fetchInstructors",
   async () => {
      const instructors = await getInstructors();
      return instructors.sort(
         (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
   }
);

export const addInstructor = createAsyncThunk(
   "instructors/addInstructor",
   async (payload) => {
      return await createInstructors(payload);
   }
);

export const updateInstructor = createAsyncThunk(
   "instructors/updateInstructor",
   async ({ id, data }) => {
      const updated = await patchInstructors(id, data);
      return { id, ...data }; // păstrăm doar ce am trimis
   }
);

export const removeInstructor = createAsyncThunk(
   "instructors/removeInstructor",
   async (id) => {
      await deleteInstructors(id);
      return id;
   }
);

// === Slice ===
const instructorsSlice = createSlice({
   name: "instructors",
   initialState: {
      list: [],
      status: "idle",
      error: null,
   },
   reducers: {},
   extraReducers: (builder) => {
      builder
         // FETCH
         
         .addCase(fetchInstructors.pending, (state) => {
            state.status = "loading";
         })
         .addCase(fetchInstructors.fulfilled, (state, action) => {
            state.status = "succeeded";
            state.list = action.payload;
         })
         .addCase(fetchInstructors.rejected, (state, action) => {
            state.status = "failed";
            state.error = action.error.message;
         })
         // ADD
         .addCase(addInstructor.fulfilled, (state, action) => {
            state.list.push(action.payload);
         })
         // UPDATE
         .addCase(updateInstructor.fulfilled, (state, action) => {
            const idx = state.list.findIndex((i) => i.id === action.payload.id);
            if (idx !== -1) {
               state.list[idx] = {
                  ...state.list[idx],
                  ...action.payload,
               };
            }
         })
         // REMOVE
         .addCase(removeInstructor.fulfilled, (state, action) => {
            state.list = state.list.filter((i) => i.id !== action.payload);
         });
   },
});

export default instructorsSlice.reducer;
