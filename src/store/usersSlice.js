// src/store/usersSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { getUsers } from "../api/usersService";

export const fetchUsers = createAsyncThunk("users/fetchUsers", async () => {
  const users = await getUsers();
  return Array.isArray(users) ? users : (users?.data ?? []);
});

const usersSlice = createSlice({
  name: "users",
  initialState: { list: [], status: "idle", error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
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
      });
  },
});

export default usersSlice.reducer;
