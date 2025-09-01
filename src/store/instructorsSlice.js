// src/store/instructorsSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
   getInstructors,
   createInstructors,
   patchInstructors,
   deleteInstructors,
} from "../api/instructorsService";
import { createUser, updateUser } from "../api/usersService";

// helper: ținem doar câmpurile de user acceptate de backend
const pickUserFields = (d = {}) => ({
   email: d.email,
   firstName: d.firstName,
   lastName: d.lastName,
   phone: d.phone,
});

// === Thunks existente ===
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
   async (p) => {
      return await createInstructors(p);
   }
);
export const updateInstructor = createAsyncThunk(
   "instructors/updateInstructor",
   async ({ id, data }) => {
      await patchInstructors(id, data);
      return { id, ...data };
   }
);
export const removeInstructor = createAsyncThunk(
   "instructors/removeInstructor",
   async (id) => {
      await deleteInstructors(id);
      return id;
   }
);

// === NOI: ADD user -> apoi instructor (cu dubluri) ===
export const addInstructorWithUser = createAsyncThunk(
   "instructors/addWithUser",
   async (payload) => {
      const user = await createUser(pickUserFields(payload)); // email, firstName, lastName, phone (+password dacă ai în createUser)
      const userId = user?.id ?? user?.userId ?? user?.data?.id;

      const instructor = await createInstructors({
         firstName: payload.firstName,
         lastName: payload.lastName,
         phone: payload.phone,
         email: payload.email, // dublură pe instructor
         sector: payload.sector,
         isActive: payload.isActive,
         instructorsGroupId: payload.instructorsGroupId,
         userId, // legătura
      });

      return instructor; // serverul ar trebui să returneze recordul complet
   }
);

// === NOI: UPDATE user + instructor cu aceleași valori ===
export const updateInstructorWithUser = createAsyncThunk(
   "instructors/updateWithUser",
   async ({ id, data }, { getState }) => {
      // găsim userId din store dacă nu e furnizat
      const state = getState();
      const instr = state.instructors.list.find((i) => i.id === id);
      const userId = data.userId ?? instr?.userId;

      if (userId) {
         await updateUser(userId, pickUserFields(data)); // PATCH /users/:id
      }

      await patchInstructors(id, {
         email: data.email, // dubluri
         firstName: data.firstName,
         lastName: data.lastName,
         phone: data.phone,
         sector: data.sector,
      });

      return { id, ...data }; // pentru merge local
   }
);

// === Slice ===
const instructorsSlice = createSlice({
   name: "instructors",
   initialState: { list: [], status: "idle", error: null },
   reducers: {},
   extraReducers: (builder) => {
      builder
         // FETCH
         .addCase(fetchInstructors.pending, (s) => {
            s.status = "loading";
         })
         .addCase(fetchInstructors.fulfilled, (s, a) => {
            s.status = "succeeded";
            s.list = a.payload;
         })
         .addCase(fetchInstructors.rejected, (s, a) => {
            s.status = "failed";
            s.error = a.error.message;
         })

         // ADD (vechi)
         .addCase(addInstructor.fulfilled, (s, a) => {
            s.list.push(a.payload);
         })

         // UPDATE (vechi)
         .addCase(updateInstructor.fulfilled, (s, a) => {
            const idx = s.list.findIndex((i) => i.id === a.payload.id);
            if (idx !== -1) s.list[idx] = { ...s.list[idx], ...a.payload };
         })

         // REMOVE
         .addCase(removeInstructor.fulfilled, (s, a) => {
            s.list = s.list.filter((i) => i.id !== a.payload);
         })

         // ADD + USER (nou)
         .addCase(addInstructorWithUser.fulfilled, (s, a) => {
            s.list.push(a.payload);
         })

         // UPDATE + USER (nou)
         .addCase(updateInstructorWithUser.fulfilled, (s, a) => {
            const idx = s.list.findIndex((i) => i.id === a.payload.id);
            if (idx !== -1) s.list[idx] = { ...s.list[idx], ...a.payload };
         });
   },
});

export default instructorsSlice.reducer;
