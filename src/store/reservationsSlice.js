// store/reservationsSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
   getReservations,
   createReservations,
   getAllReservations,
   getUserReservations,
} from "../api/reservationsService";

// --- Async thunks ---
export const fetchReservations = createAsyncThunk(
   "reservations/fetchReservations",
   async (_, { rejectWithValue }) => {
      try {
         const data = await getReservations();
         return data;
      } catch (error) {
         return rejectWithValue(error.message);
      }
   }
);

export const fetchAllReservations = createAsyncThunk(
   "reservations/fetchAllReservations",
   async (_, { rejectWithValue }) => {
      try {
         const data = await getAllReservations();
         return data;
      } catch (error) {
         return rejectWithValue(error.message);
      }
   }
);

export const fetchUserReservations = createAsyncThunk(
   "reservations/fetchUserReservations",
   async (userId, { rejectWithValue }) => {
      try {
         const data = await getUserReservations(userId);
         return data;
      } catch (error) {
         return rejectWithValue(error.message);
      }
   }
);

export const addReservation = createAsyncThunk(
   "reservations/addReservation",
   async (payload, { rejectWithValue }) => {
      try {
         const data = await createReservations(payload);
         return data;
      } catch (error) {
         return rejectWithValue(error.message);
      }
   }
);

// --- Slice ---
const reservationsSlice = createSlice({
   name: "reservations",
   initialState: {
      list: [],
      loading: false,
      error: null,
   },
   reducers: {},
   extraReducers: (builder) => {
      // fetchReservations
      builder.addCase(fetchReservations.pending, (state) => {
         state.loading = true;
         state.error = null;
      });
      builder.addCase(fetchReservations.fulfilled, (state, action) => {
         state.loading = false;
         state.list = action.payload;
      });
      builder.addCase(fetchReservations.rejected, (state, action) => {
         state.loading = false;
         state.error = action.payload;
      });

      // fetchAllReservations
      builder.addCase(fetchAllReservations.pending, (state) => {
         state.loading = true;
         state.error = null;
      });
      builder.addCase(fetchAllReservations.fulfilled, (state, action) => {
         state.loading = false;
         state.list = action.payload;
      });
      builder.addCase(fetchAllReservations.rejected, (state, action) => {
         state.loading = false;
         state.error = action.payload;
      });

      // fetchUserReservations
      builder.addCase(fetchUserReservations.pending, (state) => {
         state.loading = true;
         state.error = null;
      });
      builder.addCase(fetchUserReservations.fulfilled, (state, action) => {
         state.loading = false;
         state.list = action.payload;
      });
      builder.addCase(fetchUserReservations.rejected, (state, action) => {
         state.loading = false;
         state.error = action.payload;
      });

      // addReservation
      builder.addCase(addReservation.pending, (state) => {
         state.loading = true;
         state.error = null;
      });
      builder.addCase(addReservation.fulfilled, (state, action) => {
         state.loading = false;
         state.list.push(action.payload); // adaugă noua rezervare în listă
      });
      builder.addCase(addReservation.rejected, (state, action) => {
         state.loading = false;
         state.error = action.payload;
      });
   },
});

export default reservationsSlice.reducer;
