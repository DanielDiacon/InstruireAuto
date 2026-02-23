import React, { useContext, useEffect } from "react";
import { useDispatch } from "react-redux";

import CalendarPlusOptimized from "../../components/APanel/CalendarPlus/ACalendarOptimized";
import { fetchInstructors } from "../../store/instructorsSlice";
import { UserContext } from "../../UserContext";

export default function APCalendarPlus() {
   const dispatch = useDispatch();
   const { user } = useContext(UserContext);

   useEffect(() => {
      document.title = "Instruire Auto | Calendar Plus";
   }, []);

   useEffect(() => {
      if (!user || user.role !== "ADMIN") return;
      dispatch(fetchInstructors());
   }, [user, dispatch]);

   return (
      <main className="main">
         <CalendarPlusOptimized />
      </main>
   );
}
