// src/socket/socket.js
import { io } from "socket.io-client";

const WS_URL = "https://instruireauto.site";

// singleton per tab
let sharedSocket = null;
let sharedToken = null;
let refCount = 0;

function normToken(token) {
   const t = String(token || "").trim();
   return t || null;
}

export function acquireSocket(token) {
   const t = normToken(token);
   if (!t) return null;

   // reuse același socket dacă token-ul e identic
   if (sharedSocket && sharedToken === t) {
      refCount += 1;
      return sharedSocket;
   }

   // token diferit => închide vechiul
   if (sharedSocket) {
      try {
         sharedSocket.disconnect();
      } catch (_) {}
      sharedSocket = null;
      sharedToken = null;
      refCount = 0;
   }

   sharedToken = t;

   sharedSocket = io(WS_URL, {
      transports: ["websocket"],
      auth: { token: t },
      query: { token: t },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      forceNew: false,
      multiplex: true,
   });

   refCount = 1;
   return sharedSocket;
}

export function releaseSocket(socket) {
   if (!sharedSocket || socket !== sharedSocket) return;

   refCount = Math.max(0, refCount - 1);

   if (refCount === 0) {
      try {
         sharedSocket.disconnect();
      } catch (_) {}
      sharedSocket = null;
      sharedToken = null;
   }
}
