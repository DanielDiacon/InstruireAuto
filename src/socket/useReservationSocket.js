// src/socket/useReservationSocket.js
import { useEffect, useRef, useCallback } from "react";
import { createSocket } from "./socket";

export function useReservationSocket(token, handlers = {}) {
   const socketRef = useRef(null);
   const handlersRef = useRef(handlers);

   // păstrăm mereu ultimele handlers fără să reînregistrăm listeners
   useEffect(() => {
      handlersRef.current = handlers;
   }, [handlers]);

   useEffect(() => {
      if (!token) return;

      // dacă există un socket vechi (token schimbat / remount), îl închidem
      if (socketRef.current) {
         try {
            socketRef.current.disconnect();
         } catch {}
         socketRef.current = null;
      }

      const socket = createSocket(token);
      socketRef.current = socket;

      const onConnect = () => {
         console.log("WS connected:", socket.id);
         handlersRef.current?.onConnect?.(socket);
      };

      const onJoined = (data) => {
         console.log("JOINED:", data);
         handlersRef.current?.onReservationJoined?.(data);
      };

      const onLeft = (data) => {
         console.log("LEFT:", data);
         handlersRef.current?.onReservationLeft?.(data);
      };

      const onJoinDenied = (data) => {
         console.warn("DENIED:", data);
         handlersRef.current?.onReservationJoinDenied?.(data);
      };

      socket.on("connect", onConnect);
      socket.on("reservation:joined", onJoined);
      socket.on("reservation:left", onLeft);
      socket.on("reservation:joinDenied", onJoinDenied);

      return () => {
         socket.off("connect", onConnect);
         socket.off("reservation:joined", onJoined);
         socket.off("reservation:left", onLeft);
         socket.off("reservation:joinDenied", onJoinDenied);

         socket.disconnect();
         if (socketRef.current === socket) socketRef.current = null;
      };
   }, [token]);

   const joinReservation = useCallback((reservationId) => {
      const id = Number(reservationId);
      if (!Number.isFinite(id) || id <= 0) return;
      socketRef.current?.emit("reservation:join", { reservationId: id });
   }, []);

   const leaveReservation = useCallback((reservationId) => {
      const id = Number(reservationId);
      if (!Number.isFinite(id) || id <= 0) return;
      socketRef.current?.emit("reservation:leave", { reservationId: id });
   }, []);

   return {
      joinReservation,
      leaveReservation,
      socket: socketRef.current, // opțional, dacă vrei acces direct la socket
   };
}
