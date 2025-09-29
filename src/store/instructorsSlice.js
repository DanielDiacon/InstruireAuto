import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
   getInstructors,
   createInstructors,
   patchInstructors,
   deleteInstructors,
} from "../api/instructorsService";
import { createUser, updateUser } from "../api/usersService";

/** doar câmpurile permise pe /users */
const pickUserFields = (d = {}) => ({
   email: d.email,
   firstName: d.firstName,
   lastName: d.lastName,
   phone: d.phone,
   privateMessage: d.privateMessage, // aici ținem “Înlocuitor: ...”
});

/* ===== Thunks de bază ===== */
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

/* ===== Add: creează mai întâi user, apoi instructor ===== */
export const addInstructorWithUser = createAsyncThunk(
   "instructors/addWithUser",
   async (payload) => {
      const user = await createUser(pickUserFields(payload));
      const userId = user?.id ?? user?.userId ?? user?.data?.id;

      const instructor = await createInstructors({
         firstName: payload.firstName,
         lastName: payload.lastName,
         phone: payload.phone,
         email: payload.email,
         sector: payload.sector,
         isActive: payload.isActive,
         instructorsGroupId: payload.instructorsGroupId,
         userId,
      });

      return instructor;
   }
);

/* ===== Update: sincronizează user (privateMessage) + instructor ===== */
export const updateInstructorWithUser = createAsyncThunk(
   "instructors/updateWithUser",
   async ({ id, data }, { getState }) => {
      const state = getState();
      const instr = state.instructors.list.find(
         (i) => String(i.id) === String(id)
      );
      const userId = data.userId ?? instr?.userId;

      if (userId) {
         await updateUser(userId, pickUserFields(data)); // aici ajunge “Înlocuitor: …”
      }

      await patchInstructors(id, {
         email: data.email,
         firstName: data.firstName,
         lastName: data.lastName,
         phone: data.phone,
         sector: data.sector,
         isActive: data.isActive,
         instructorsGroupId: data.instructorsGroupId,
         userId,
      });

      return { id, ...data };
   }
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
               (i) => String(i.id) === String(a.payload.id)
            );
            if (idx !== -1) s.list[idx] = { ...s.list[idx], ...a.payload };
         })
         .addCase(removeInstructor.fulfilled, (s, a) => {
            s.list = s.list.filter((i) => String(i.id) !== String(a.payload));
         })
         .addCase(addInstructorWithUser.fulfilled, (s, a) => {
            s.list.push(a.payload);
         })
         .addCase(updateInstructorWithUser.fulfilled, (s, a) => {
            const idx = s.list.findIndex(
               (i) => String(i.id) === String(a.payload.id)
            );
            if (idx !== -1) s.list[idx] = { ...s.list[idx], ...a.payload };
         });
   },
});

export default instructorsSlice.reducer;
