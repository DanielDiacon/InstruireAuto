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
import { reservationsApi } from "./reservationsApi";
import instructorsReducer from "./instructorsSlice";
import instructorsGroupsReducer from "./instructorsGroupSlice";
import carsReducer from "./carsSlice";
import usersReducer from "./usersSlice";

const rootReducer = combineReducers({
   groups: groupsReducer,
   students: studentsReducer,
   instructors: instructorsReducer,
   reservations: reservationsReducer,
   [reservationsApi.reducerPath]: reservationsApi.reducer,
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
const isProd = process.env.NODE_ENV === "production";
const enableReduxDevChecks = process.env.REACT_APP_REDUX_DEV_CHECKS === "1";
const enableReduxSerializableChecks =
   process.env.REACT_APP_REDUX_SERIALIZABLE_CHECKS === "1";

const serializableIgnoredActions = [
   FLUSH,
   REHYDRATE,
   PAUSE,
   PERSIST,
   PURGE,
   REGISTER,
];

const serializableIgnoredPaths = [
   "reservations.list",
   "students.list",
   "instructors.list",
   "instructorsGroups.list",
   "users.list",
   "cars.list",
   "groups.list",
];

export const store = configureStore({
   reducer: persistedReducer,
   middleware: (getDefault) =>
      getDefault({
         immutableCheck:
            !isProd && enableReduxDevChecks
               ? {
                    warnAfter: 64,
                 }
               : false,
         serializableCheck:
            !isProd && enableReduxDevChecks && enableReduxSerializableChecks
               ? {
                    warnAfter: 128,
                    ignoredActions: serializableIgnoredActions,
                    ignoredPaths: serializableIgnoredPaths,
                 }
               : false,
      }).concat(reservationsApi.middleware),
});

export const persistor = persistStore(store);
