// src/store/groupsSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
   getGroups,
   createGroups,
   patchGroup,
   deleteGroup,

   // ===== PROFESSOR =====
   getMyGroupStudents,
   getMyGroupOverview,
   getStudentPracticeProgress,
   getStudentDetailedPracticeSession,
} from "../api/groupsService";
import { getUsers } from "../api/usersService";

/* ================= helpers ================= */

function errToMessage(err) {
   if (!err) return "Unknown error";
   if (typeof err === "string") return err;
   return err?.message || "Unknown error";
}

function makeDetailsKey({ studentId, practiceId, lang }) {
   const sid = Number(studentId);
   const pid = Number(practiceId);
   const l = String(lang || "ro").toLowerCase() === "ru" ? "ru" : "ro";
   return `${sid}:${pid}:${l}`;
}

/* ================= ADMIN thunks (existing) ================= */

// === Thunks pentru acțiuni asincrone ===
export const fetchGroups = createAsyncThunk(
   "groups/fetchGroups",
   async (_, thunkApi) => {
      try {
         const [users, groups] = await Promise.all([getUsers(), getGroups()]);
         return {
            users,
            groups: (groups || []).sort(
               (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
            ),
         };
      } catch (err) {
         return thunkApi.rejectWithValue(errToMessage(err));
      }
   }
);

export const addGroup = createAsyncThunk(
   "groups/addGroup",
   async ({ name, professorId, token }, thunkApi) => {
      try {
         return await createGroups({ name, professorId, token });
      } catch (err) {
         return thunkApi.rejectWithValue(errToMessage(err));
      }
   }
);

export const updateGroup = createAsyncThunk(
   "groups/updateGroup",
   async ({ id, name, professorId, token }, thunkApi) => {
      try {
         const payload = {};
         if (typeof name !== "undefined") payload.name = name;
         if (typeof professorId !== "undefined")
            payload.professorId = professorId;
         if (typeof token !== "undefined") payload.token = token;

         await patchGroup(id, payload);
         // întoarcem ce s-a trimis ca să putem actualiza store-ul corect
         return { id, ...payload };
      } catch (err) {
         return thunkApi.rejectWithValue(errToMessage(err));
      }
   }
);

export const removeGroup = createAsyncThunk(
   "groups/removeGroup",
   async (id, thunkApi) => {
      try {
         await deleteGroup(id);
         return id;
      } catch (err) {
         return thunkApi.rejectWithValue(errToMessage(err));
      }
   }
);

/* ================= PROFESSOR thunks (NEW) ================= */

/**
 * 1) List My Group Students
 */
export const fetchMyGroupStudents = createAsyncThunk(
   "groups/fetchMyGroupStudents",
   async (_, thunkApi) => {
      try {
         const data = await getMyGroupStudents();
         return data;
      } catch (err) {
         return thunkApi.rejectWithValue(errToMessage(err));
      }
   }
);

/**
 * 3) Get Group Overview
 */
export const fetchMyGroupOverview = createAsyncThunk(
   "groups/fetchMyGroupOverview",
   async (_, thunkApi) => {
      try {
         const data = await getMyGroupOverview();
         return data;
      } catch (err) {
         return thunkApi.rejectWithValue(errToMessage(err));
      }
   }
);

/**
 * 2) Get Student Practice Progress (paginat)
 */
export const fetchStudentPracticeProgress = createAsyncThunk(
   "groups/fetchStudentPracticeProgress",
   async ({ studentId, page = 1, limit = 20 } = {}, thunkApi) => {
      try {
         const data = await getStudentPracticeProgress({
            studentId,
            page,
            limit,
         });
         return { studentId: Number(studentId), page, limit, data };
      } catch (err) {
         return thunkApi.rejectWithValue(errToMessage(err));
      }
   }
);

/**
 * 4) Get Detailed Practice Session (Professor view)
 */
export const fetchStudentDetailedPracticeSession = createAsyncThunk(
   "groups/fetchStudentDetailedPracticeSession",
   async ({ studentId, practiceId, lang = "ro" } = {}, thunkApi) => {
      try {
         const data = await getStudentDetailedPracticeSession({
            studentId,
            practiceId,
            lang,
         });
         const key = makeDetailsKey({ studentId, practiceId, lang });
         return {
            key,
            studentId: Number(studentId),
            practiceId: Number(practiceId),
            lang: String(lang || "ro").toLowerCase() === "ru" ? "ru" : "ro",
            data,
         };
      } catch (err) {
         return thunkApi.rejectWithValue(errToMessage(err));
      }
   }
);

/* ================= Slice ================= */

const groupsSlice = createSlice({
   name: "groups",
   initialState: {
      // ===== ADMIN (existing) =====
      list: [],
      users: [],
      status: "idle",
      error: null,

      // ===== PROFESSOR (new) =====
      professor: {
         myGroupStudents: null,
         myGroupStudentsStatus: "idle",
         myGroupStudentsError: null,

         myGroupOverview: null,
         myGroupOverviewStatus: "idle",
         myGroupOverviewError: null,

         practiceProgress: {
            byStudentId: {}, // [studentId]: response object (student/statistics/practiceHistory/pagination)
            statusByStudentId: {}, // [studentId]: "idle"|"loading"|"succeeded"|"failed"
            errorByStudentId: {}, // [studentId]: string|null
            lastArgsByStudentId: {}, // [studentId]: {page,limit}
         },

         detailedPractice: {
            byKey: {}, // ["sid:pid:lang"]: detailed session response
            statusByKey: {}, // ["sid:pid:lang"]: "idle"|"loading"|"succeeded"|"failed"
            errorByKey: {}, // ["sid:pid:lang"]: string|null
         },
      },
   },

   reducers: {
      // utile când schimbi studentul / închizi modalul / ieși din pagină
      clearProfessorCache(state) {
         state.professor.myGroupStudents = null;
         state.professor.myGroupStudentsStatus = "idle";
         state.professor.myGroupStudentsError = null;

         state.professor.myGroupOverview = null;
         state.professor.myGroupOverviewStatus = "idle";
         state.professor.myGroupOverviewError = null;

         state.professor.practiceProgress.byStudentId = {};
         state.professor.practiceProgress.statusByStudentId = {};
         state.professor.practiceProgress.errorByStudentId = {};
         state.professor.practiceProgress.lastArgsByStudentId = {};

         state.professor.detailedPractice.byKey = {};
         state.professor.detailedPractice.statusByKey = {};
         state.professor.detailedPractice.errorByKey = {};
      },

      clearStudentPracticeProgress(state, action) {
         const sid = Number(action.payload);
         if (!Number.isFinite(sid)) return;

         delete state.professor.practiceProgress.byStudentId[sid];
         delete state.professor.practiceProgress.statusByStudentId[sid];
         delete state.professor.practiceProgress.errorByStudentId[sid];
         delete state.professor.practiceProgress.lastArgsByStudentId[sid];
      },

      clearDetailedPracticeSession(state, action) {
         const key = String(action.payload || "");
         if (!key) return;

         delete state.professor.detailedPractice.byKey[key];
         delete state.professor.detailedPractice.statusByKey[key];
         delete state.professor.detailedPractice.errorByKey[key];
      },
   },

   extraReducers: (builder) => {
      /* ===== ADMIN reducers (existing) ===== */
      builder
         .addCase(fetchGroups.pending, (state) => {
            state.status = "loading";
            state.error = null;
         })
         .addCase(fetchGroups.fulfilled, (state, action) => {
            state.status = "succeeded";
            state.users = action.payload.users;
            state.list = action.payload.groups;
         })
         .addCase(fetchGroups.rejected, (state, action) => {
            state.status = "failed";
            state.error = action.payload || action.error.message;
         })

         .addCase(addGroup.fulfilled, (state, action) => {
            state.list.push(action.payload);
         })
         .addCase(addGroup.rejected, (state, action) => {
            state.error = action.payload || action.error.message;
         })

         .addCase(updateGroup.fulfilled, (state, action) => {
            const group = state.list.find((g) => g.id === action.payload.id);
            if (group) {
               if (typeof action.payload.name !== "undefined") {
                  group.name = action.payload.name;
               }
               if (typeof action.payload.instructorId !== "undefined") {
                  group.instructorId = action.payload.instructorId;
               }
               if (typeof action.payload.token !== "undefined") {
                  group.token = action.payload.token;
               }
            }
         })
         .addCase(updateGroup.rejected, (state, action) => {
            state.error = action.payload || action.error.message;
         })

         .addCase(removeGroup.fulfilled, (state, action) => {
            state.list = state.list.filter((g) => g.id !== action.payload);
         })
         .addCase(removeGroup.rejected, (state, action) => {
            state.error = action.payload || action.error.message;
         });

      /* ===== PROFESSOR reducers (NEW) ===== */
      builder
         // my group students
         .addCase(fetchMyGroupStudents.pending, (state) => {
            state.professor.myGroupStudentsStatus = "loading";
            state.professor.myGroupStudentsError = null;
         })
         .addCase(fetchMyGroupStudents.fulfilled, (state, action) => {
            state.professor.myGroupStudentsStatus = "succeeded";
            state.professor.myGroupStudents = action.payload;
         })
         .addCase(fetchMyGroupStudents.rejected, (state, action) => {
            state.professor.myGroupStudentsStatus = "failed";
            state.professor.myGroupStudentsError =
               action.payload || action.error.message;
         })

         // my group overview
         .addCase(fetchMyGroupOverview.pending, (state) => {
            state.professor.myGroupOverviewStatus = "loading";
            state.professor.myGroupOverviewError = null;
         })
         .addCase(fetchMyGroupOverview.fulfilled, (state, action) => {
            state.professor.myGroupOverviewStatus = "succeeded";
            state.professor.myGroupOverview = action.payload;
         })
         .addCase(fetchMyGroupOverview.rejected, (state, action) => {
            state.professor.myGroupOverviewStatus = "failed";
            state.professor.myGroupOverviewError =
               action.payload || action.error.message;
         })

         // student practice progress (per student)
         .addCase(fetchStudentPracticeProgress.pending, (state, action) => {
            const sid = Number(action.meta?.arg?.studentId);
            if (!Number.isFinite(sid)) return;

            state.professor.practiceProgress.statusByStudentId[sid] = "loading";
            state.professor.practiceProgress.errorByStudentId[sid] = null;

            state.professor.practiceProgress.lastArgsByStudentId[sid] = {
               page: action.meta?.arg?.page ?? 1,
               limit: action.meta?.arg?.limit ?? 20,
            };
         })
         .addCase(fetchStudentPracticeProgress.fulfilled, (state, action) => {
            const { studentId, data, page, limit } = action.payload;
            const sid = Number(studentId);

            state.professor.practiceProgress.statusByStudentId[sid] =
               "succeeded";
            state.professor.practiceProgress.byStudentId[sid] = data;
            state.professor.practiceProgress.lastArgsByStudentId[sid] = {
               page,
               limit,
            };
         })
         .addCase(fetchStudentPracticeProgress.rejected, (state, action) => {
            const sid = Number(action.meta?.arg?.studentId);
            if (!Number.isFinite(sid)) return;

            state.professor.practiceProgress.statusByStudentId[sid] = "failed";
            state.professor.practiceProgress.errorByStudentId[sid] =
               action.payload || action.error.message;
         })

         // detailed practice (per key)
         .addCase(
            fetchStudentDetailedPracticeSession.pending,
            (state, action) => {
               const key = makeDetailsKey({
                  studentId: action.meta?.arg?.studentId,
                  practiceId: action.meta?.arg?.practiceId,
                  lang: action.meta?.arg?.lang,
               });
               state.professor.detailedPractice.statusByKey[key] = "loading";
               state.professor.detailedPractice.errorByKey[key] = null;
            }
         )
         .addCase(
            fetchStudentDetailedPracticeSession.fulfilled,
            (state, action) => {
               const { key, data } = action.payload;
               state.professor.detailedPractice.statusByKey[key] = "succeeded";
               state.professor.detailedPractice.byKey[key] = data;
            }
         )
         .addCase(
            fetchStudentDetailedPracticeSession.rejected,
            (state, action) => {
               const key = makeDetailsKey({
                  studentId: action.meta?.arg?.studentId,
                  practiceId: action.meta?.arg?.practiceId,
                  lang: action.meta?.arg?.lang,
               });
               state.professor.detailedPractice.statusByKey[key] = "failed";
               state.professor.detailedPractice.errorByKey[key] =
                  action.payload || action.error.message;
            }
         );
   },
});

export const {
   clearProfessorCache,
   clearStudentPracticeProgress,
   clearDetailedPracticeSession,
} = groupsSlice.actions;

export default groupsSlice.reducer;

/* ================= selectors (optional, but handy) ================= */

export const selectGroupsAdmin = (s) => s.groups?.list || [];
export const selectGroupsAdminUsers = (s) => s.groups?.users || [];
export const selectGroupsAdminStatus = (s) => s.groups?.status || "idle";
export const selectGroupsAdminError = (s) => s.groups?.error || null;

export const selectMyGroupStudents = (s) =>
   s.groups?.professor?.myGroupStudents;
export const selectMyGroupStudentsStatus = (s) =>
   s.groups?.professor?.myGroupStudentsStatus || "idle";
export const selectMyGroupStudentsError = (s) =>
   s.groups?.professor?.myGroupStudentsError || null;

export const selectMyGroupOverview = (s) =>
   s.groups?.professor?.myGroupOverview;
export const selectMyGroupOverviewStatus = (s) =>
   s.groups?.professor?.myGroupOverviewStatus || "idle";
export const selectMyGroupOverviewError = (s) =>
   s.groups?.professor?.myGroupOverviewError || null;

export const selectStudentPracticeProgress = (studentId) => (s) =>
   s.groups?.professor?.practiceProgress?.byStudentId?.[Number(studentId)] ||
   null;

export const selectStudentPracticeProgressStatus = (studentId) => (s) =>
   s.groups?.professor?.practiceProgress?.statusByStudentId?.[
      Number(studentId)
   ] || "idle";

export const selectStudentPracticeProgressError = (studentId) => (s) =>
   s.groups?.professor?.practiceProgress?.errorByStudentId?.[
      Number(studentId)
   ] || null;

export const selectDetailedPracticeByKey = (key) => (s) =>
   s.groups?.professor?.detailedPractice?.byKey?.[String(key)] || null;

export const selectDetailedPracticeStatusByKey = (key) => (s) =>
   s.groups?.professor?.detailedPractice?.statusByKey?.[String(key)] || "idle";

export const selectDetailedPracticeErrorByKey = (key) => (s) =>
   s.groups?.professor?.detailedPractice?.errorByKey?.[String(key)] || null;
