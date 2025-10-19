import React, { createContext, useMemo } from "react";

export const CalendarBusCtx = createContext({
   editReservation: () => {},
   createFromEmpty: () => {},
   changeInstructorOrder: () => {},
   refresh: () => {},
   jumpToDate: () => {},
});

export function CalendarBusProvider({ actions, children }) {
   const stable = useMemo(
      () => ({
         editReservation: actions?.editReservation ?? (() => {}),
         createFromEmpty: actions?.createFromEmpty ?? (() => {}),
         changeInstructorOrder: actions?.changeInstructorOrder ?? (() => {}),
         refresh: actions?.refresh ?? (() => {}),
         jumpToDate: actions?.jumpToDate ?? (() => {}),
      }),
      [actions]
   );

   return (
      <CalendarBusCtx.Provider value={stable}>
         {children}
      </CalendarBusCtx.Provider>
   );
}
