// src/store/groupsSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
   getGroups,
   createGroups,
   patchGroup,
   deleteGroup,
} from "../api/groupsService";
import { getUsers } from "../api/usersService";

// === Thunks pentru acțiuni asincrone ===
export const fetchGroups = createAsyncThunk("groups/fetchGroups", async () => {
   const [users, groups] = await Promise.all([getUsers(), getGroups()]);
   return {
      users,
      groups: groups.sort(
         (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      ),
   };
});

export const addGroup = createAsyncThunk(
   "groups/addGroup",
   async ({ name, instructorId }) => {
      return await createGroups({ name, instructorId });
   }
);

export const updateGroup = createAsyncThunk(
   "groups/updateGroup",
   async ({ id, name, instructorId = 1 }) => {
      // ⚡ trimite corect payload-ul către API
      await patchGroup(id, { name, instructorId });
      return { id, name };
   }
);

export const removeGroup = createAsyncThunk(
   "groups/removeGroup",
   async (id) => {
      await deleteGroup(id);
      return id;
   }
);

// === Slice ===
const groupsSlice = createSlice({
   name: "groups",
   initialState: {
      list: [],
      users: [],
      status: "idle",
      error: null,
   },
   reducers: {},
   extraReducers: (builder) => {
      builder
         .addCase(fetchGroups.pending, (state) => {
            state.status = "loading";
         })
         .addCase(fetchGroups.fulfilled, (state, action) => {
            state.status = "succeeded";
            state.users = action.payload.users;
            state.list = action.payload.groups;
         })
         .addCase(fetchGroups.rejected, (state, action) => {
            state.status = "failed";
            state.error = action.error.message;
         })
         .addCase(addGroup.fulfilled, (state, action) => {
            state.list.push(action.payload);
         })
         .addCase(updateGroup.fulfilled, (state, action) => {
            const group = state.list.find((g) => g.id === action.payload.id);
            if (group) group.name = action.payload.name;
         })
         .addCase(removeGroup.fulfilled, (state, action) => {
            state.list = state.list.filter((g) => g.id !== action.payload);
         });
   },
});

export default groupsSlice.reducer;
