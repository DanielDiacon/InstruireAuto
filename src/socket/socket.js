// src/socket/socket.js
import { io } from "socket.io-client";

export function createSocket(token) {
   return io("https://instruireauto.site", {
      transports: ["websocket"],
      query: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
   });
}
