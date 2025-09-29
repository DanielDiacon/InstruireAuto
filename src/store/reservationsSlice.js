import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
   getReservations,
   createReservations,
   getAllReservations,
   getUserReservations,
   patchReservation,
   deleteReservation,
   getBusyReservations,
} from "../api/reservationsService";

// --- Async thunks ---
export const fetchReservations = createAsyncThunk(
   "reservations/fetchReservations",
   async (_, { rejectWithValue }) => {
      try {
         return await getReservations();
      } catch (e) {
         return rejectWithValue(e.message);
      }
   }
);

export const fetchAllReservations = createAsyncThunk(
   "reservations/fetchAllReservations",
   async (_, { rejectWithValue }) => {
      try {
         return await getAllReservations();
      } catch (e) {
         return rejectWithValue(e.message);
      }
   }
);

export const fetchUserReservations = createAsyncThunk(
   "reservations/fetchUserReservations",
   async (userId, { rejectWithValue }) => {
      try {
         return await getUserReservations(userId);
      } catch (e) {
         return rejectWithValue(e.message);
      }
   }
);

export const addReservation = createAsyncThunk(
   "reservations/addReservation",
   async (payload, { rejectWithValue }) => {
      try {
         return await createReservations(payload);
      } catch (e) {
         return rejectWithValue(e.message);
      }
   }
);

export const updateReservation = createAsyncThunk(
   "reservations/updateReservation",
   async ({ id, data }, { rejectWithValue }) => {
      try {
         return await patchReservation(id, data);
      } catch (e) {
         return rejectWithValue(e.message);
      }
   }
);

export const updateReservationColor = createAsyncThunk(
   "reservations/updateReservationColor",
   async ({ id, color }, { rejectWithValue }) => {
      try {
         return await patchReservation(id, { color });
      } catch (e) {
         return rejectWithValue(e.message);
      }
   }
);

export const removeReservation = createAsyncThunk(
   "reservations/removeReservation",
   async (id, { rejectWithValue }) => {
      try {
         await deleteReservation(id);
         return id;
      } catch (e) {
         return rejectWithValue(e.message);
      }
   }
);

export const fetchBusy = createAsyncThunk(
   "reservations/fetchBusy",
   async (query, { rejectWithValue }) => {
      try {
         const data = await getBusyReservations(query);
         return { query, data };
      } catch (e) {
         return rejectWithValue(e.message);
      }
   }
);

// --- helpers interne ---
function getStart(r) {
   return (
      r?.startTime ??
      r?.start ??
      r?.start_time ??
      r?.dateTime ??
      r?.datetime ??
      r?.date ??
      r?.begin ??
      null
   );
}
function getGroupId(r) {
   return (
      r?.instructorsGroupId ??
      r?.groupId ??
      r?.group_id ??
      r?.instructors_group_id ??
      r?.group?.id ??
      null
   );
}
function getInstructorId(r) {
   return (
      r?.instructorId ??
      r?.instructor_id ??
      r?.teacherId ??
      r?.teacher_id ??
      r?.instructor?.id ??
      r?.teacher?.id ??
      null
   );
}

function indexBusyPayload(raw) {
   const arr = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.reservations)
      ? raw.reservations
      : Array.isArray(raw?.busy)
      ? raw.busy
      : [];

   const busyLookup = {};
   const busyIndex = {};
   const groupsSet = new Set();
   const instrSet = new Set();

   for (const r of arr) {
      const start = getStart(r);
      if (!start) continue;
      const iso = new Date(start).toISOString();

      const entry = {
         instructorsGroupId: getGroupId(r),
         instructorId: getInstructorId(r),
      };

      if (!busyIndex[iso]) busyIndex[iso] = [];
      busyIndex[iso].push(entry);
      busyLookup[iso] = true;

      if (entry.instructorsGroupId != null)
         groupsSet.add(String(entry.instructorsGroupId));
      if (entry.instructorId != null) instrSet.add(String(entry.instructorId));
   }

   return {
      busyLookup,
      busyIndex,
      availableGroups: Array.from(groupsSet),
      availableInstructors: Array.from(instrSet),
      raw: arr,
   };
}

// --- Slice ---
const reservationsSlice = createSlice({
   name: "reservations",
   initialState: {
      // calendar (global)
      list: [],
      loadingAll: false,
      errorAll: null,

      // pentru compatibilitate cu locuri vechi (poți elimina treptat):
      loading: false,
      error: null,

      // popup student
      byStudent: {}, // { [studentId]: Reservation[] }
      loadingByStudent: {}, // { [studentId]: boolean }
      errorByStudent: {}, // { [studentId]: string | null }

      // busy
      busyLoading: false,
      busyError: null,
      busyLookup: {},
      busyIndex: {},
      availableGroups: [],
      availableInstructors: [],
      busyQuery: null,
   },
   reducers: {
      setReservationColorLocal: (state, action) => {
         const { id, color } = action.payload || {};
         const idx = state.list.findIndex((r) => String(r.id) === String(id));
         if (idx !== -1) state.list[idx] = { ...state.list[idx], color };
      },
      resetBusy(state) {
         state.busyLoading = false;
         state.busyError = null;
         state.busyLookup = {};
         state.busyIndex = {};
         state.availableGroups = [];
         state.availableInstructors = [];
         state.busyQuery = null;
      },
      // opțional: dacă vrei să cureți cache-ul unui student
      clearStudentReservations(state, action) {
         const sid = String(action.payload);
         delete state.byStudent[sid];
         delete state.loadingByStudent[sid];
         delete state.errorByStudent[sid];
      },
   },
   extraReducers: (builder) => {
      // ===== getReservations (dacă îl folosești într-un alt ecran) =====
      builder
         .addCase(fetchReservations.pending, (s) => {
            s.loadingAll = true;
            s.loading = true;
            s.errorAll = null;
            s.error = null;
         })
         .addCase(fetchReservations.fulfilled, (s, a) => {
            s.loadingAll = false;
            s.loading = false;
            s.list = a.payload;
         })
         .addCase(fetchReservations.rejected, (s, a) => {
            s.loadingAll = false;
            s.loading = false;
            s.errorAll = a.payload;
            s.error = a.payload;
         });

      // ===== ALL (calendar) =====
      builder
         .addCase(fetchAllReservations.pending, (s) => {
            s.loadingAll = true;
            s.loading = true;
            s.errorAll = null;
            s.error = null;
         })
         .addCase(fetchAllReservations.fulfilled, (s, a) => {
            s.loadingAll = false;
            s.loading = false;
            s.list = a.payload;
         })
         .addCase(fetchAllReservations.rejected, (s, a) => {
            s.loadingAll = false;
            s.loading = false;
            s.errorAll = a.payload;
            s.error = a.payload;
         });

      // ===== BY STUDENT (NU mai atingem s.list!) =====
      builder
         .addCase(fetchUserReservations.pending, (s, a) => {
            const sid = String(a.meta.arg);
            s.loadingByStudent[sid] = true;
            s.errorByStudent[sid] = null;
         })
         .addCase(fetchUserReservations.fulfilled, (s, a) => {
            const sid = String(a.meta.arg);
            s.loadingByStudent[sid] = false;
            s.byStudent[sid] = Array.isArray(a.payload) ? a.payload : [];
         })
         .addCase(fetchUserReservations.rejected, (s, a) => {
            const sid = String(a.meta.arg);
            s.loadingByStudent[sid] = false;
            s.errorByStudent[sid] =
               a.payload || "Eroare la rezervările studentului.";
         });

      // ===== CRUD pe list (global) =====
      builder
         .addCase(addReservation.pending, (s) => {
            s.loadingAll = true;
            s.loading = true;
            s.errorAll = null;
            s.error = null;
         })
         .addCase(addReservation.fulfilled, (s, a) => {
            s.loadingAll = false;
            s.loading = false;
            const payload = a.payload;
            if (Array.isArray(payload)) s.list.push(...payload);
            else s.list.push(payload);
         })
         .addCase(addReservation.rejected, (s, a) => {
            s.loadingAll = false;
            s.loading = false;
            s.errorAll = a.payload;
            s.error = a.payload;
         })

         .addCase(updateReservation.pending, (s) => {
            s.loadingAll = true;
            s.loading = true;
            s.errorAll = null;
            s.error = null;
         })
         .addCase(updateReservation.fulfilled, (s, a) => {
            s.loadingAll = false;
            s.loading = false;
            const updated = a.payload;
            const id = updated?.id ?? a.meta.arg?.id;
            const idx = s.list.findIndex((r) => String(r.id) === String(id));
            if (idx !== -1) s.list[idx] = { ...s.list[idx], ...updated };
         })
         .addCase(updateReservation.rejected, (s, a) => {
            s.loadingAll = false;
            s.loading = false;
            s.errorAll = a.payload;
            s.error = a.payload;
         })

         .addCase(updateReservationColor.fulfilled, (s, a) => {
            const updated = a.payload;
            const id = updated?.id ?? a.meta.arg?.id;
            const idx = s.list.findIndex((r) => String(r.id) === String(id));
            if (idx !== -1) s.list[idx] = { ...s.list[idx], ...updated };
         })

         .addCase(removeReservation.fulfilled, (s, a) => {
            const id = a.payload;
            s.list = s.list.filter((r) => String(r.id) !== String(id));
         });

      // ===== BUSY =====
      builder
         .addCase(fetchBusy.pending, (s) => {
            s.busyLoading = true;
            s.busyError = null;
         })
         .addCase(fetchBusy.fulfilled, (s, a) => {
            s.busyLoading = false;
            s.busyQuery = a.payload.query;
            const parsed = indexBusyPayload(a.payload.data);
            s.busyLookup = parsed.busyLookup;
            s.busyIndex = parsed.busyIndex;
            s.availableGroups = parsed.availableGroups;
            s.availableInstructors = parsed.availableInstructors;
         })
         .addCase(fetchBusy.rejected, (s, a) => {
            s.busyLoading = false;
            s.busyError = a.payload;
            s.busyLookup = {};
            s.busyIndex = {};
            s.availableGroups = [];
            s.availableInstructors = [];
         });
   },
});

export const { setReservationColorLocal, resetBusy, clearStudentReservations } =
   reservationsSlice.actions;

export default reservationsSlice.reducer;
