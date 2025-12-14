// src/socket/useReservationSocket.js
import { useEffect, useRef, useCallback } from "react";
import { createSocket } from "./socket";

export function useReservationSocket(token, handlers = {}) {
   const socketRef = useRef(null);
   const handlersRef = useRef(handlers);

   useEffect(() => {
      handlersRef.current = handlers;
   }, [handlers]);

   useEffect(() => {
      if (!token) return;

      const socket = createSocket(token);
      socketRef.current = socket;

      socket.on("connect", () => {
         handlersRef.current.onConnect?.(socket);
      });

      socket.on("disconnect", (reason) => {
         handlersRef.current.onDisconnect?.(reason);
      });

      // existing reservation locks/presence
      socket.on("reservation:joined", (data) => {
         handlersRef.current.onReservationJoined?.(data);
      });

      socket.on("reservation:left", (data) => {
         handlersRef.current.onReservationLeft?.(data);
      });

      socket.on("reservation:joinDenied", (data) => {
         handlersRef.current.onReservationJoinDenied?.(data);
      });

      // NEW: dayview slot presence
      socket.on("dayview:slotSelected", (data) => {
         handlersRef.current.onSlotSelected?.(data);
      });

      socket.on("dayview:slotCleared", (data) => {
         handlersRef.current.onSlotCleared?.(data);
      });

      socket.on("dayview:presenceSnapshot", (data) => {
         handlersRef.current.onPresenceSnapshot?.(data);
      });

      return () => {
         socket.disconnect();
         socketRef.current = null;
      };
   }, [token]);

   const joinReservation = useCallback((reservationId) => {
      socketRef.current?.emit("reservation:join", { reservationId });
   }, []);

   const leaveReservation = useCallback((reservationId) => {
      socketRef.current?.emit("reservation:leave", { reservationId });
   }, []);

   // NEW: join/leave “room” for dayview
   const joinDayview = useCallback((dayKey) => {
      if (!dayKey) return;
      socketRef.current?.emit("dayview:join", { dayKey });
   }, []);

   const leaveDayview = useCallback((dayKey) => {
      if (!dayKey) return;
      socketRef.current?.emit("dayview:leave", { dayKey });
   }, []);

   // NEW: emit slot presence
   const selectSlot = useCallback((payload) => {
      socketRef.current?.emit("dayview:selectSlot", payload);
   }, []);

   const clearSlot = useCallback((payload) => {
      socketRef.current?.emit("dayview:clearSlot", payload);
   }, []);

   return {
      joinReservation,
      leaveReservation,
      joinDayview,
      leaveDayview,
      selectSlot,
      clearSlot,
   };
}
