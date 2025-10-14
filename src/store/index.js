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
