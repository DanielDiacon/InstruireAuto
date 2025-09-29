// src/store/carsSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
   getCars,
   getCarById,
   createCar,
   patchCar,
   deleteCar,
} from "../api/carsService";

// === Thunks pentru acțiuni asincrone ===
export const fetchCars = createAsyncThunk("cars/fetchCars", async () => {
   const cars = await getCars();
   return cars.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
});

// ✅ Creare mașină
export const addCar = createAsyncThunk(
   "cars/addCar",
   async ({ plateNumber, instructorId, gearbox }) => {
      return await createCar({ plateNumber, instructorId, gearbox });
   }
);

// ✅ Update mașină (doar plateNumber sau instructorId se pot schimba)
// src/store/carsSlice.js
export const updateCar = createAsyncThunk(
   "cars/updateCar",
   async ({ id, plateNumber, instructorId, gearbox }) => {
      // 👇 adăugăm gearbox în payload-ul PATCH
      const updated = await patchCar(id, {
         plateNumber,
         instructorId,
         gearbox,
      });
      return updated;
   }
);

// ✅ Ștergere mașină
export const removeCar = createAsyncThunk("cars/removeCar", async (id) => {
   await deleteCar(id);
   return id;
});

// === Slice ===
const carsSlice = createSlice({
   name: "cars",
   initialState: {
      list: [],
      status: "idle",
      error: null,
   },
   reducers: {},
   extraReducers: (builder) => {
      builder
         .addCase(fetchCars.pending, (state) => {
            state.status = "loading";
         })
         .addCase(fetchCars.fulfilled, (state, action) => {
            state.status = "succeeded";
            state.list = action.payload;
         })
         .addCase(fetchCars.rejected, (state, action) => {
            state.status = "failed";
            state.error = action.error.message;
         })
         .addCase(addCar.fulfilled, (state, action) => {
            state.list.push(action.payload);
         })
         .addCase(updateCar.fulfilled, (state, action) => {
            const index = state.list.findIndex(
               (c) => c.id === action.payload.id
            );
            if (index !== -1) {
               state.list[index] = action.payload; // suprascriem direct cu mașina returnată din backend
            }
         })
         .addCase(removeCar.fulfilled, (state, action) => {
            state.list = state.list.filter((c) => c.id !== action.payload);
         });
   },
});

export default carsSlice.reducer;
