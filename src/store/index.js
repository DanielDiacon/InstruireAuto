// src/store/index.js
import { configureStore, combineReducers } from "@reduxjs/toolkit";
import {
   persistStore,
   persistReducer,
   FLUSH,
   REHYDRATE,
   PAUSE,
   PERSIST,
   PURGE,
   REGISTER,
   createTransform,
} from "redux-persist";
import localforage from "localforage";

import groupsReducer from "./groupsSlice";
import studentsReducer from "./studentsSlice";
import reservationsReducer from "./reservationsSlice";
import instructorsReducer from "./instructorsSlice";
import instructorsGroupsReducer from "./instructorsGroupSlice";
import carsReducer from "./carsSlice";
import usersReducer from "./usersSlice";

const rootReducer = combineReducers({
   groups: groupsReducer,
   students: studentsReducer,
   instructors: instructorsReducer,
   reservations: reservationsReducer,
   instructorsGroups: instructorsGroupsReducer,
   cars: carsReducer,
   users: usersReducer,
});

const DAY_MS = 24 * 60 * 60 * 1000;

// Prune: păstrăm în storage doar rezervările din [-30; +60] zile
const pruneReservations = createTransform(
   (state) => {
      if (!state?.list) return state;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const minTs = now.getTime() - 30 * DAY_MS;
      const maxTs = now.getTime() + 60 * DAY_MS;

      const filtered = state.list.filter((r) => {
         const sRaw =
            r.startTime ??
            r.start ??
            r.startedAt ??
            r.start_at ??
            r.startDate ??
            r.start_date;
         if (!sRaw) return false;
         const s = new Date(sRaw);
         const ts = new Date(
            s.getFullYear(),
            s.getMonth(),
            s.getDate()
         ).getTime();
         return ts >= minTs && ts <= maxTs;
      });
      return { ...state, list: filtered };
   },
   (state) => {
      if (!state?.list) return state;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const minTs = now.getTime() - 30 * DAY_MS;
      const maxTs = now.getTime() + 60 * DAY_MS;

      const filtered = state.list.filter((r) => {
         const sRaw =
            r.startTime ??
            r.start ??
            r.startedAt ??
            r.start_at ??
            r.startDate ??
            r.start_date;
         if (!sRaw) return false;
         const s = new Date(sRaw);
         const ts = new Date(
            s.getFullYear(),
            s.getMonth(),
            s.getDate()
         ).getTime();
         return ts >= minTs && ts <= maxTs;
      });
      return { ...state, list: filtered };
   },
   { whitelist: ["reservations"] }
);

const persistConfig = {
   key: "root",
   storage: localforage, // IndexedDB
   whitelist: [
      "reservations",
      "instructors",
      "instructorsGroups",
      "students",
      "cars",
      "users",
   ],
   version: 1,
   transforms: [pruneReservations],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
   reducer: persistedReducer,
   middleware: (getDefault) =>
      getDefault({
         serializableCheck: {
            ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
         },
      }),
});

export const persistor = persistStore(store);
