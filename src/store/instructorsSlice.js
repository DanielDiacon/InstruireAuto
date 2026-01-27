// src/store/instructorsSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
   getInstructors,
   createInstructors,
   patchInstructors,
   deleteInstructors,
   patchInstructorOrder,
} from "../api/instructorsService";

/* ===== Thunks de bază (numai instructor) ===== */
export const fetchInstructors = createAsyncThunk(
   "instructors/fetchInstructors",
   async () => {
      const instructors = await getInstructors();
      return instructors.sort(
         (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
   },
);

export const addInstructor = createAsyncThunk(
   "instructors/addInstructor",
   async (payload) => {
      // payload poate conține și `password` la CREATE
      return await createInstructors(payload);
   },
);

export const updateInstructor = createAsyncThunk(
   "instructors/updateInstructor",
   async ({ id, data }) => {
      const updated = await patchInstructors(id, data);
      return { ...(updated || {}), id, ...data };
   },
);

/* ===== Patch doar order (pozițiile coloanei) ===== */
export const updateInstructorOrder = createAsyncThunk(
   "instructors/updateOrder",
   async ({ id, order }, { rejectWithValue }) => {
      try {
         // eslint-disable-next-line no-console
         console.log("[Thunk] updateInstructorOrder start", { id, order });

         const updated = await patchInstructorOrder(id, order);

         // eslint-disable-next-line no-console
         console.log("[Thunk] updateInstructorOrder success", { id, updated });

         return { id, order: updated?.order ?? order };
      } catch (err) {
         // axios error details (dacă folosești axios)
         const status = err?.response?.status;
         const data = err?.response?.data;

         // eslint-disable-next-line no-console
         console.log("[Thunk] updateInstructorOrder ERROR", {
            id,
            order,
            status,
            data,
            err,
         });

         return rejectWithValue({
            id,
            order,
            status,
            data,
            message: err?.message || "Failed to patch order",
         });
      }
   },
);

export const removeInstructor = createAsyncThunk(
   "instructors/removeInstructor",
   async (id) => {
      await deleteInstructors(id);
      return id;
   },
);

/* ===== Back-compat: NU ȘTERGE — wrappers pe noul flux (fără user) ===== */
// Păstrăm numele vechi ca să nu rupem importurile existente.

// create + (opțional) password din payload
export const addInstructorWithUser = createAsyncThunk(
   "instructors/addWithUser",
   async (payload) => {
      const instructor = await createInstructors({
         firstName: payload.firstName,
         lastName: payload.lastName,
         phone: payload.phone,
         email: payload.email,
         sector: payload.sector,
         isActive: payload.isActive,
         instructorsGroupId: payload.instructorsGroupId,
         password: payload.password, // API-ul tău cere password la POST /instructors
         // dacă backend-ul ignoră extra chei, nu e problemă:
         ...(payload.userId ? { userId: payload.userId } : {}),
      });
      return instructor;
   },
);

// update bazat doar pe instructor; dacă primește password, o trimitem pentru reset
export const updateInstructorWithUser = createAsyncThunk(
   "instructors/updateWithUser",
   async ({ id, data }) => {
      const patch = {
         email: data.email,
         firstName: data.firstName,
         lastName: data.lastName,
         phone: data.phone,
         sector: data.sector,
         isActive: data.isActive,
         instructorsGroupId: data.instructorsGroupId,
         ...(data.password ? { password: data.password } : {}),
         ...(data.userId ? { userId: data.userId } : {}),
      };
      const updated = await patchInstructors(id, patch);
      return { ...(updated || {}), id, ...patch };
   },
);

/* ===== Slice ===== */
const instructorsSlice = createSlice({
   name: "instructors",
   initialState: { list: [], status: "idle", error: null },
   reducers: {},
   extraReducers: (b) => {
      b.addCase(fetchInstructors.pending, (s) => {
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
         .addCase(addInstructor.fulfilled, (s, a) => {
            s.list.push(a.payload);
         })
         .addCase(updateInstructor.fulfilled, (s, a) => {
            const idx = s.list.findIndex(
               (i) => String(i.id) === String(a.payload.id),
            );
            if (idx !== -1) s.list[idx] = { ...s.list[idx], ...a.payload };
         })
         .addCase(updateInstructorOrder.fulfilled, (s, a) => {
            const idx = s.list.findIndex(
               (i) => String(i.id) === String(a.payload.id),
            );
            if (idx !== -1) {
               s.list[idx] = { ...s.list[idx], order: a.payload.order };
            }
         })
         .addCase(updateInstructorOrder.rejected, (s, a) => {
            s.error =
               a.payload?.message ||
               a.error?.message ||
               "Failed to update instructor order";
         })
         .addCase(removeInstructor.fulfilled, (s, a) => {
            s.list = s.list.filter((i) => String(i.id) !== String(a.payload));
         })

         /* back-compat handlers */
         .addCase(addInstructorWithUser.fulfilled, (s, a) => {
            s.list.push(a.payload);
         })
         .addCase(updateInstructorWithUser.fulfilled, (s, a) => {
            const idx = s.list.findIndex(
               (i) => String(i.id) === String(a.payload.id),
            );
            if (idx !== -1) s.list[idx] = { ...s.list[idx], ...a.payload };
         });
   },
});

export default instructorsSlice.reducer;
