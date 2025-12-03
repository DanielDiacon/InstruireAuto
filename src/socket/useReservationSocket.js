// src/socket/useReservationSocket.js
import { useEffect, useRef, useCallback } from "react";
import { createSocket } from "./socket";

export function useReservationSocket(token, handlers = {}) {
   const socketRef = useRef(null);

   useEffect(() => {
      if (!token) return;

      const socket = createSocket(token);
      socketRef.current = socket;

      // CONNECT / DISCONNECT
      socket.on("connect", () => {
         handlers.onConnect && handlers.onConnect(socket);
      });

      socket.on("disconnect", (reason) => {
         handlers.onDisconnect && handlers.onDisconnect(reason);
      });

      // === EVENIMENTE DE LA SERVER (exemple) ===
      socket.on("reservation:joined", (data) => {
         handlers.onReservationJoined && handlers.onReservationJoined(data);
      });

      socket.on("reservation:left", (data) => {
         handlers.onReservationLeft && handlers.onReservationLeft(data);
      });

      socket.on("reservation:joinDenied", (data) => {
         handlers.onReservationJoinDenied &&
            handlers.onReservationJoinDenied(data);
      });

      // dacă backend-ul trimite un event de tip „s-au schimbat rezervările”
      socket.on("reservations:changed", (data) => {
         handlers.onReservationsChanged && handlers.onReservationsChanged(data);
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

   return {
      joinReservation,
      leaveReservation,
   };
}
