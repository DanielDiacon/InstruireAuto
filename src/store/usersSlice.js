// src/store/usersSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
   getUsers as apiGetUsers,
   updateUser as apiUpdateUser, // 👈 alias pt. service
} from "../api/usersService";

// listare
export const fetchUsers = createAsyncThunk("users/fetchUsers", async () => {
   const users = await apiGetUsers();
   // backend-ul tău întoarce direct array -> returnează-l ca atare
   return Array.isArray(users) ? users : users?.data ?? [];
});

// ✨ update user (ex: privateMessage)
export const updateUser = createAsyncThunk(
   "users/updateUser",
   async ({ id, data }) => {
      const updated = await apiUpdateUser(id, data);
      // poate veni fie ca obiect direct, fie {data: {...}}
      return updated?.data ?? updated;
   }
);

const usersSlice = createSlice({
   name: "users",
   initialState: {
      list: [],
      status: "idle",
      error: null,
      updating: false,
   },
   reducers: {},
   extraReducers: (builder) => {
      builder
         // fetch
         .addCase(fetchUsers.pending, (state) => {
            state.status = "loading";
         })
         .addCase(fetchUsers.fulfilled, (state, action) => {
            state.status = "succeeded";
            state.list = action.payload || [];
         })
         .addCase(fetchUsers.rejected, (state, action) => {
            state.status = "failed";
            state.error = action.error?.message || "Failed to load users";
         })

         // update
         .addCase(updateUser.pending, (state) => {
            state.updating = true;
         })
         .addCase(updateUser.fulfilled, (state, action) => {
            state.updating = false;
            const u = action.payload;
            if (!u?.id) return;
            const idx = state.list.findIndex(
               (x) => String(x.id) === String(u.id)
            );
            if (idx >= 0) state.list[idx] = { ...state.list[idx], ...u };
            else state.list.push(u); // fallback dacă nu era în listă
         })
         .addCase(updateUser.rejected, (state, action) => {
            state.updating = false;
            state.error = action.error?.message || "Failed to update user";
         });
   },
});

export default usersSlice.reducer;
