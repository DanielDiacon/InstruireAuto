import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { getUsers } from "../api/usersService";

export const fetchStudents = createAsyncThunk(
   "students/fetchStudents",
   async () => {
      const data = await getUsers();
      return data;
   }
);

const studentsSlice = createSlice({
   name: "students",
   initialState: { list: [], loading: false, error: null },
   reducers: {},
   extraReducers: (builder) => {
      builder
         .addCase(fetchStudents.pending, (state) => {
            state.loading = true;
            state.error = null;
         })
         .addCase(fetchStudents.fulfilled, (state, action) => {
            state.loading = false;
            state.list = action.payload; // ⚠ aici trebuie să fie lista de studenți
         })
         .addCase(fetchStudents.rejected, (state, action) => {
            state.loading = false;
            state.error = action.error.message;
         });
   },
});

export default studentsSlice.reducer;
