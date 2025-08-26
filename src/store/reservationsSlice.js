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
      list: [],
      loading: false,
      error: null,
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
   },
   extraReducers: (builder) => {
      builder
         .addCase(fetchReservations.pending, (s) => {
            s.loading = true;
            s.error = null;
         })
         .addCase(fetchReservations.fulfilled, (s, a) => {
            s.loading = false;
            s.list = a.payload;
         })
         .addCase(fetchReservations.rejected, (s, a) => {
            s.loading = false;
            s.error = a.payload;
         })

         .addCase(fetchAllReservations.pending, (s) => {
            s.loading = true;
            s.error = null;
         })
         .addCase(fetchAllReservations.fulfilled, (s, a) => {
            s.loading = false;
            s.list = a.payload;
         })
         .addCase(fetchAllReservations.rejected, (s, a) => {
            s.loading = false;
            s.error = a.payload;
         })

         .addCase(fetchUserReservations.pending, (s) => {
            s.loading = true;
            s.error = null;
         })
         .addCase(fetchUserReservations.fulfilled, (s, a) => {
            s.loading = false;
            s.list = a.payload;
         })
         .addCase(fetchUserReservations.rejected, (s, a) => {
            s.loading = false;
            s.error = a.payload;
         })

         .addCase(addReservation.pending, (s) => {
            s.loading = true;
            s.error = null;
         })
         .addCase(addReservation.fulfilled, (s, a) => {
            s.loading = false;
            const payload = a.payload;
            if (Array.isArray(payload)) s.list.push(...payload);
            else s.list.push(payload);
         })
         .addCase(addReservation.rejected, (s, a) => {
            s.loading = false;
            s.error = a.payload;
         })

         .addCase(updateReservation.pending, (s) => {
            s.loading = true;
            s.error = null;
         })
         .addCase(updateReservation.fulfilled, (s, a) => {
            s.loading = false;
            const updated = a.payload;
            const id = updated?.id ?? a.meta.arg?.id;
            const idx = s.list.findIndex((r) => String(r.id) === String(id));
            if (idx !== -1) s.list[idx] = { ...s.list[idx], ...updated };
         })
         .addCase(updateReservation.rejected, (s, a) => {
            s.loading = false;
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
         })

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

export const { setReservationColorLocal, resetBusy } =
   reservationsSlice.actions;
export default reservationsSlice.reducer;
