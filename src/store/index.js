// src/store/index.js
import { configureStore } from "@reduxjs/toolkit";
import groupsReducer from "./groupsSlice";
import studentsReducer from "./studentsSlice"; // nou
import reservationsReducer from "./reservationsSlice"; // nou

export const store = configureStore({
   reducer: {
      groups: groupsReducer,
      students: studentsReducer,
      reservations: reservationsReducer,
      // instructors: instructorsReducer (pe viitor)
      // schedules: schedulesReducer (pe viitor)
   },
});
