// src/store/reservationsSlice.js
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

/* ───────────────────── NEW: Delta sync (doar ce s-a schimbat) ───────────────────── */
export const fetchReservationsDelta = createAsyncThunk(
   "reservations/fetchReservationsDelta",
   async (_, { getState, rejectWithValue }) => {
      try {
         const st = getState().reservations || {};
         const since = st.lastSyncedAt || null;

         // Dacă backend-ul tău acceptă updated_since, super.
         // Dacă nu, va returna tot și noi facem upsert local (fallback OK).
         const opts = since
            ? { updated_since: since, pageSize: 5000 }
            : { scope: "all", pageSize: 5000 };

         const res = await getAllReservations(opts);

         // Acceptăm:
         // 1) { items: [...], deleted: [...], etag, serverTime }
         // 2) direct: [...]
         const payload = Array.isArray(res) ? { items: res } : res || {};
         const items = payload.items || [];
         const deleted = payload.deleted || [];
         const etag = payload.etag || null;
         const now = payload.serverTime || new Date().toISOString();

         return { items, deleted, etag, now };
      } catch (e) {
         return rejectWithValue(e.message);
      }
   }
);
/* ──────────────────────────────────────────────────────────────────────────── */

// --- Async thunks (ale tale, neschimbate) ---
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

// --- helpers interne (ale tale) ---
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

      // compat
      loading: false,
      error: null,

      // popup student
      byStudent: {},
      loadingByStudent: {},
      errorByStudent: {},

      // busy
      busyLoading: false,
      busyError: null,
      busyLookup: {},
      busyIndex: {},
      availableGroups: [],
      availableInstructors: [],
      busyQuery: null,

      /* ───────────── NEW: meta pentru sync ───────────── */
      lastSyncedAt: null, // ultimul timestamp folosit la delta
      etag: null, // dacă serverul trimite ETag
      hydrated: false, // devine true după prima rehidratare / fetch OK
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
      clearStudentReservations(state, action) {
         const sid = String(action.payload);
         delete state.byStudent[sid];
         delete state.loadingByStudent[sid];
         delete state.errorByStudent[sid];
      },
   },
   extraReducers: (builder) => {
      /* ───────────── NEW: DELTA ───────────── */
      builder
         .addCase(fetchReservationsDelta.pending, (s) => {
            // nu blocăm UI-ul la delta
         })
         .addCase(fetchReservationsDelta.fulfilled, (s, a) => {
            const {
               items = [],
               deleted = [],
               etag = null,
               now,
            } = a.payload || {};

            // upsert local
            if (Array.isArray(items) && items.length) {
               const byId = new Map(s.list.map((r) => [String(r.id), r]));
               for (const it of items) {
                  const id = String(it?.id);
                  if (!id) continue;
                  const prev = byId.get(id);
                  if (prev) byId.set(id, { ...prev, ...it });
                  else byId.set(id, it);
               }
               s.list = Array.from(byId.values());
            }

            // tombstone (ștergeri)
            if (Array.isArray(deleted) && deleted.length) {
               const rm = new Set(deleted.map((d) => String(d)));
               s.list = s.list.filter((r) => !rm.has(String(r.id)));
            }

            s.lastSyncedAt = now || s.lastSyncedAt || new Date().toISOString();
            if (etag) s.etag = etag;
            s.hydrated = true;
         })
         .addCase(fetchReservationsDelta.rejected, (s) => {
            // lăsăm cache-ul existent în pace
         });

      // ===== getReservations (ale tale) =====
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
            s.lastSyncedAt = new Date().toISOString(); // NEW
            s.hydrated = true; // NEW
         })
         .addCase(fetchReservations.rejected, (s, a) => {
            s.loadingAll = false;
            s.loading = false;
            s.errorAll = a.payload;
            s.error = a.payload;
         });

      // ===== ALL (calendar) (ale tale) =====
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
            s.lastSyncedAt = new Date().toISOString(); // NEW
            s.hydrated = true; // NEW
         })
         .addCase(fetchAllReservations.rejected, (s, a) => {
            s.loadingAll = false;
            s.loading = false;
            s.errorAll = a.payload;
            s.error = a.payload;
         });

      // ===== restul extraReducers (ale tale) — neschimbate =====
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

export const { setReservationColorLocal, resetBusy, clearStudentReservations } =
   reservationsSlice.actions;

export default reservationsSlice.reducer;
