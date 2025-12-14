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
   // meta endpoint (ETag / updated_since)
   getReservationsMeta,
   // NOU: filtrare + range pe lună
   filterReservations,
   buildMonthRange,
} from "../api/reservationsService";

/* ───────────────────── NEW: Delta sync (doar ce s-a schimbat) ───────────────────── */
export const fetchReservationsDelta = createAsyncThunk(
   "reservations/fetchReservationsDelta",
   async (_, { getState, rejectWithValue }) => {
      try {
         const st = getState().reservations || {};
         const since = st.lastSyncedAt || null;

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

/* ───────────── NEW: Meta-check inteligent (polling smart) ─────────────
   - Întoarce { refreshed:boolean, reason:string, etag?:string, serverTime?:string }
   - Dacă serverul zice „nu s-a schimbat” → NU mai tragem delta
   - Dacă dă eroare → încercăm delta ca fallback sigur
------------------------------------------------------------------------ */
export const maybeRefreshReservations = createAsyncThunk(
   "reservations/maybeRefreshReservations",
   async (_, { getState, dispatch, rejectWithValue }) => {
      const st = getState().reservations || {};
      const updated_since = st.lastSyncedAt || undefined;
      const etag = st.etag || undefined;

      try {
         const meta = await getReservationsMeta({ updated_since, etag });
         // meta: { changed:boolean, etag?:string, serverTime?:string }
         if (meta?.changed) {
            await dispatch(fetchReservationsDelta());
            return {
               refreshed: true,
               reason: "meta-changed",
               etag: meta?.etag || null,
               serverTime: meta?.serverTime || null,
            };
         }
         return {
            refreshed: false,
            reason: "not-modified",
            etag: meta?.etag || etag || null,
            serverTime: meta?.serverTime || null,
         };
      } catch (err) {
         // fallback sigur: încearcă delta; dacă nici delta nu merge, raportează
         try {
            await dispatch(fetchReservationsDelta());
            return {
               refreshed: true,
               reason: "error-fallback",
               etag: null,
               serverTime: null,
            };
         } catch (e2) {
            return rejectWithValue(
               err?.message || "maybeRefreshReservations failed"
            );
         }
      }
   }
);

// --- Async thunks (ale tale) ---
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

/* ───────────── NEW: filtrare după /api/reservations/filter ───────────── */

/** Generic: orice combinație de filtre suportate de backend */
export const fetchReservationsFiltered = createAsyncThunk(
   "reservations/fetchReservationsFiltered",
   async (filters, { rejectWithValue }) => {
      try {
         const res = await filterReservations(filters);
         const items = Array.isArray(res) ? res : res.items || [];
         return { items, filters };
      } catch (e) {
         return rejectWithValue(e.message);
      }
   }
);

/** Concret: doar pe o lună (după o dată dată) */
export const fetchReservationsForMonth = createAsyncThunk(
   "reservations/fetchReservationsForMonth",
   async ({ date, extraFilters } = {}, { rejectWithValue }) => {
      try {
         const range = buildMonthRange(date);
         const res = await filterReservations({
            ...(extraFilters || {}),
            ...range,
         });
         const items = Array.isArray(res) ? res : res.items || [];
         return { items, range };
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
   return r?.instructorId ?? r?.instructor_id ?? r?.instructor?.id ?? null;
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

      /* ───────────── meta pentru sync ───────────── */
      lastSyncedAt: null, // ultimul timestamp folosit la delta
      etag: null, // dacă serverul trimite ETag
      hydrated: false, // devine true după prima rehidratare / fetch OK

      // 🔥 diapazonul activ de rezervări (ex: luna curentă)
      activeRange: null, // { startDateFrom, startDateTo }
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

      // 🔥 NEW: ștergere instant locală (optimistic)
      removeReservationLocal(state, action) {
         const id = String(action.payload);
         state.list = state.list.filter((r) => String(r.id) !== id);
      },
      patchReservationLocal(state, action) {
         const { id, changes } = action.payload || {};
         if (!id || !changes) return;

         const row = state.list.find((r) => String(r.id) === String(id));
         if (!row) return;

         Object.assign(row, changes);
      },
      // NEW: poți seta manual range-ul activ dacă vrei
      setActiveRange(state, action) {
         state.activeRange = action.payload || null;
      },
   },
   extraReducers: (builder) => {
      /* ───────────── DELTA ───────────── */
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

      // ===== getReservations =====
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
            s.lastSyncedAt = new Date().toISOString();
            s.hydrated = true;
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
            s.lastSyncedAt = new Date().toISOString();
            s.hydrated = true;
         })
         .addCase(fetchAllReservations.rejected, (s, a) => {
            s.loadingAll = false;
            s.loading = false;
            s.errorAll = a.payload;
            s.error = a.payload;
         });

      // ===== add / update / delete =====
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

      // ===== busy =====
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

      /* ───────────── NEW: fetchReservationsFiltered / fetchReservationsForMonth ───────────── */
      builder
         .addCase(fetchReservationsFiltered.pending, (s) => {
            s.loadingAll = true;
            s.loading = true;
            s.errorAll = null;
            s.error = null;
         })
         .addCase(fetchReservationsFiltered.fulfilled, (s, a) => {
            s.loadingAll = false;
            s.loading = false;
            const { items, filters } = a.payload || {};
            s.list = items || [];
            s.lastSyncedAt = new Date().toISOString();
            s.hydrated = true;

            if (filters?.startDateFrom || filters?.startDateTo) {
               s.activeRange = {
                  startDateFrom: filters.startDateFrom || null,
                  startDateTo: filters.startDateTo || null,
               };
            }
         })
         .addCase(fetchReservationsFiltered.rejected, (s, a) => {
            s.loadingAll = false;
            s.loading = false;
            s.errorAll = a.payload;
            s.error = a.payload;
         })
         .addCase(fetchReservationsForMonth.pending, (s) => {
            s.loadingAll = true;
            s.loading = true;
            s.errorAll = null;
            s.error = null;
         })
         .addCase(fetchReservationsForMonth.fulfilled, (s, a) => {
            s.loadingAll = false;
            s.loading = false;
            const { items, range } = a.payload || {};
            s.list = items || [];
            s.lastSyncedAt = new Date().toISOString();
            s.hydrated = true;
            if (range) s.activeRange = range;
         })
         .addCase(fetchReservationsForMonth.rejected, (s, a) => {
            s.loadingAll = false;
            s.loading = false;
            s.errorAll = a.payload;
            s.error = a.payload;
         });

      /* ───────────── state updates din maybeRefreshReservations ───────────── */
      builder
         .addCase(maybeRefreshReservations.fulfilled, (s, a) => {
            const { refreshed, etag, serverTime } = a.payload || {};
            if (etag) s.etag = etag;
            if (!refreshed && serverTime) s.lastSyncedAt = serverTime;
            if (s.list?.length) s.hydrated = true;
         })
         .addCase(maybeRefreshReservations.rejected, (s) => {
            // nimic, evităm să stricăm starea existentă
         });
   },
});

export const {
   setReservationColorLocal,
   resetBusy,
   clearStudentReservations,
   setActiveRange,
   removeReservationLocal,
   patchReservationLocal,
} = reservationsSlice.actions;

export default reservationsSlice.reducer;
