// src/store/index.js
import { configureStore } from "@reduxjs/toolkit";
import groupsReducer from "./groupsSlice";
import studentsReducer from "./studentsSlice"; // nou
import reservationsReducer from "./reservationsSlice"; // nou
import instructorsReducer from "./instructorsSlice"; // nou
import instructorsGroupsReducer from "./instructorsGroupSlice"; // nou
import carsReducer from "./carsSlice"; // nou

export const store = configureStore({
   reducer: {
      groups: groupsReducer,
      students: studentsReducer,
      instructors: instructorsReducer,
      reservations: reservationsReducer,
      instructorsGroups: instructorsGroupsReducer,
      cars: carsReducer,
   },
});
