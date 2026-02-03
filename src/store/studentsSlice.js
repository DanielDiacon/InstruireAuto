// src/store/studentsSlice.js
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { 
  getUsers, 
  getUserById, 
  createUser, 
  updateUser, 
  deleteUser, 
  getUsersInGroup 
} from "../api/usersService";

// FETCH ALL STUDENTS
export const fetchStudents = createAsyncThunk(
  "students/fetchStudents",
  async () => {
    const data = await getUsers();
    return data;
  }
);

// FETCH STUDENT BY ID
export const fetchStudentById = createAsyncThunk(
  "students/fetchStudentById",
  async (id) => {
    const data = await getUserById(id);
    return data;
  }
);

// FETCH STUDENTS BY GROUP
export const fetchStudentsByGroup = createAsyncThunk(
  "students/fetchStudentsByGroup",
  async (groupId) => {
    const data = await getUsersInGroup(groupId);
    return data;
  }
);

// ADD NEW STUDENT
export const addStudent = createAsyncThunk(
  "students/addStudent",
  async (userData) => {
    const newUser = await createUser(userData);
    return newUser;
  }
);

// UPDATE STUDENT
export const updateStudent = createAsyncThunk(
  "students/updateStudent",
  async ({ id, data }) => {
    const updatedUser = await updateUser(id, data);
    return updatedUser?.data ?? updatedUser;
  }
);

// DELETE STUDENT
export const removeStudent = createAsyncThunk(
  "students/removeStudent",
  async (id) => {
    await deleteUser(id);
    return id; // returnăm doar id-ul pentru Redux
  }
);

const studentsSlice = createSlice({
  name: "students",
  initialState: {
    list: [],
    loading: false,
    error: null,
    currentStudent: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      // FETCH ALL
      .addCase(fetchStudents.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchStudents.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload;
      })
      .addCase(fetchStudents.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      // FETCH BY ID
      .addCase(fetchStudentById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchStudentById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentStudent = action.payload;
      })
      .addCase(fetchStudentById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      // FETCH BY GROUP
      .addCase(fetchStudentsByGroup.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchStudentsByGroup.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload;
      })
      .addCase(fetchStudentsByGroup.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      // ADD
      .addCase(addStudent.fulfilled, (state, action) => {
        state.list.push(action.payload);
      })
      // UPDATE
      .addCase(updateStudent.fulfilled, (state, action) => {
        const u = action.payload || {};
        const id = u.id ?? action.meta?.arg?.id;
        if (id == null) return;
        const idx = state.list.findIndex((s) => String(s.id) === String(id));
        if (idx !== -1) {
          state.list[idx] = { ...state.list[idx], ...u, id };
        } else {
          state.list.push({ ...u, id });
        }

        if (
          state.currentStudent &&
          String(state.currentStudent.id) === String(id)
        ) {
          state.currentStudent = { ...state.currentStudent, ...u, id };
        }
      })
      // DELETE
      .addCase(removeStudent.fulfilled, (state, action) => {
        state.list = state.list.filter((s) => s.id !== action.payload);
      });
  },
});

export default studentsSlice.reducer;
