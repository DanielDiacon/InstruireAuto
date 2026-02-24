// src/socket/useReservationSocket.js
import { useEffect, useMemo, useRef } from "react";
import { acquireSocket, releaseSocket } from "./socket";

/* ===================== DEBUG ===================== */
const dbg = (...args) => {
   if (typeof window !== "undefined" && window.__WS_DEBUG) {
      // eslint-disable-next-line no-console
      console.log(...args);
   }
};

/* ===================== HELPERS ===================== */
const normalizeReservationId = (rid) => {
   if (rid == null) return null;
   const s = String(rid).trim();
   if (!s) return null;

   const n = Number(s);
   if (Number.isFinite(n) && String(n) === s) return n;
   return s;
};

function normalizeIso(dateLike) {
   try {
      const d = new Date(dateLike);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString();
   } catch {
      return null;
   }
}

function toIntIfPossible(v) {
   if (v == null) return null;
   const s = String(v).trim();
   if (!s) return null;
   const n = Number(s);
   if (Number.isFinite(n) && String(n) === s) return n;
   return v;
}

function isCalendarEventName(eventName) {
   return (
      typeof eventName === "string" &&
      (/^reservation:/.test(eventName) || /^reservations:/.test(eventName))
   );
}

function pickDraftFromAny(x) {
   return x?.reservationDraft ?? x?.reservationDraftOut ?? x?.draft ?? x;
}

function pickStartLike(r) {
   return (
      r?.startTime ??
      r?.start ??
      r?.startedAt ??
      r?.startDate ??
      r?.dateTime ??
      r?.datetime ??
      r?.begin ??
      r?.from ??
      null
   );
}

function parseSlotKeyMaybe(key) {
   const s = String(key || "").trim();
   const idx = s.indexOf("|");
   if (idx === -1) return null;

   const iidRaw = s.slice(0, idx).trim();
   const isoRaw = s.slice(idx + 1).trim();
   const iso = normalizeIso(isoRaw);

   if (!iidRaw || !iso) return null;
   return { instructorId: toIntIfPossible(iidRaw), startTime: iso };
}

function cleanAction(x) {
   const raw = x != null ? String(x).trim() : "";
   return raw ? raw : null;
}

function isClearAction(action) {
   const a = String(action || "")
      .trim()
      .toLowerCase();
   return (
      a === "clear" ||
      a === "cancel" ||
      a === "end" ||
      a === "ended" ||
      a === "stop" ||
      a === "stopped"
   );
}

/* ===================== HOOK ===================== */
export function useReservationSocket(token, opts = {}) {
   const {
      enabled = true,
      ignoreEvents = null,

      onReservationsChanged,
      onConnect,
      onDisconnect,

      onReservationJoined,
      onReservationLeft,
      onReservationJoinDenied,

      onReservationCreateStarted,
      onReservationCreateEnded,

      onAnyEvent,
   } = opts;

   const socketRef = useRef(null);

   // debug: câte instanțe de hook ai în app
   const instanceIdRef = useRef(Math.random().toString(36).slice(2, 8));

   const handlersRef = useRef({
      onReservationsChanged: null,
      onConnect: null,
      onDisconnect: null,

      onReservationJoined: null,
      onReservationLeft: null,
      onReservationJoinDenied: null,

      onReservationCreateStarted: null,
      onReservationCreateEnded: null,

      onAnyEvent: null,
   });

   const ignoreRef = useRef(null);

   useEffect(() => {
      handlersRef.current.onReservationsChanged = onReservationsChanged || null;
      handlersRef.current.onConnect = onConnect || null;
      handlersRef.current.onDisconnect = onDisconnect || null;

      handlersRef.current.onReservationJoined = onReservationJoined || null;
      handlersRef.current.onReservationLeft = onReservationLeft || null;
      handlersRef.current.onReservationJoinDenied =
         onReservationJoinDenied || null;

      handlersRef.current.onReservationCreateStarted =
         onReservationCreateStarted || null;
      handlersRef.current.onReservationCreateEnded =
         onReservationCreateEnded || null;

      handlersRef.current.onAnyEvent = onAnyEvent || null;

      if (ignoreEvents) {
         ignoreRef.current =
            ignoreEvents instanceof Set ? ignoreEvents : new Set(ignoreEvents);
      } else {
         ignoreRef.current = null;
      }
   }, [
      onReservationsChanged,
      onConnect,
      onDisconnect,
      onReservationJoined,
      onReservationLeft,
      onReservationJoinDenied,
      onReservationCreateStarted,
      onReservationCreateEnded,
      onAnyEvent,
      ignoreEvents,
   ]);

   useEffect(() => {
      if (!enabled || !token) return;

      const socket = acquireSocket(token);
      if (!socket) return;

      socketRef.current = socket;

      const handleConnect = () => {
         dbg(
            "[WS connected]",
            "socket.id=",
            socket.id,
            "instance=",
            instanceIdRef.current
         );
         try {
            handlersRef.current.onConnect?.(socket);
         } catch (_) {}
      };

      const handleDisconnect = (reason) => {
         dbg(
            "[WS disconnected]",
            "reason=",
            reason,
            "instance=",
            instanceIdRef.current
         );
         try {
            handlersRef.current.onDisconnect?.(reason);
         } catch (_) {}
      };

      const handleConnectError = (err) => {
         dbg(
            "[WS connect_error]",
            err?.message || err,
            "instance=",
            instanceIdRef.current
         );
      };

      const handleAny = (eventName, payload) => {
         if (!isCalendarEventName(eventName)) return;

         if (typeof window !== "undefined" && window.__WS_DEBUG) {
            // eslint-disable-next-line no-console
            console.log("[WS ANY]", eventName, payload);
         }

         try {
            handlersRef.current.onAnyEvent?.({ eventName, payload });
         } catch (_) {}

         // routing “special” (presence + draft)
         try {
            switch (eventName) {
               case "reservation:joined":
                  handlersRef.current.onReservationJoined?.(payload);
                  break;
               case "reservation:left":
                  handlersRef.current.onReservationLeft?.(payload);
                  break;
               case "reservation:joinDenied":
                  handlersRef.current.onReservationJoinDenied?.(payload);
                  break;

               case "reservation:create:started":
                  handlersRef.current.onReservationCreateStarted?.(payload);
                  break;

               case "reservation:create:ended":
               case "reservation:create:stopped":
                  handlersRef.current.onReservationCreateEnded?.(payload);
                  break;

               default:
                  break;
            }
         } catch (_) {}

         // IMPORTANT: ignoră înainte să ajungă la “DB changed”
         const ignoreSet = ignoreRef.current;
         if (ignoreSet && ignoreSet.has(eventName)) return;

         try {
            handlersRef.current.onReservationsChanged?.({ eventName, payload });
         } catch (_) {}
      };

      socket.on("connect", handleConnect);
      socket.on("disconnect", handleDisconnect);
      socket.on("connect_error", handleConnectError);
      socket.onAny(handleAny);

      if (socket.connected) handleConnect();

      return () => {
         try {
            socket.off("connect", handleConnect);
            socket.off("disconnect", handleDisconnect);
            socket.off("connect_error", handleConnectError);
            socket.offAny(handleAny);
         } catch (_) {}

         releaseSocket(socket);
         if (socketRef.current === socket) socketRef.current = null;
      };
   }, [enabled, token]);

   const api = useMemo(() => {
      const joinReservation = (reservationId) => {
         const id = normalizeReservationId(reservationId);
         if (id == null) return;

         const s = socketRef.current;
         if (!s) return;

         dbg("[WS] EMIT reservation:join", {
            reservationId: id,
            connected: s.connected,
         });
         s.emit("reservation:join", { reservationId: id });
      };

      const leaveReservation = (reservationId) => {
         const id = normalizeReservationId(reservationId);
         if (id == null) return;

         const s = socketRef.current;
         if (!s) return;

         dbg("[WS] EMIT reservation:leave", {
            reservationId: id,
            connected: s.connected,
         });
         s.emit("reservation:leave", { reservationId: id });
      };

      // ✅ FIX: action devine parametru opțional + fallback din payload
      const emitReservationCreateStarted = (draftLike, actionArg) => {
         const s = socketRef.current;
         if (!s) return;

         const outer = draftLike || {};
         const draft = pickDraftFromAny(outer);

         const instructorsGroupId = toIntIfPossible(
            draft?.instructorsGroupId ?? outer?.instructorsGroupId
         );

         let instructorId = toIntIfPossible(
            draft?.instructorId ?? outer?.instructorId
         );

         const slotKey =
            outer?.slotKey ??
            outer?.draftKey ??
            draft?.slotKey ??
            draft?.draftKey ??
            null;

         // ✅ fallback: ia instructorId din slotKey dacă lipsește
         if (instructorId == null && slotKey) {
            const parsed = parseSlotKeyMaybe(slotKey);
            if (parsed?.instructorId != null)
               instructorId = parsed.instructorId;
         }

         // ✅ action: param > outer > draft
         const action = cleanAction(
            actionArg ?? outer?.action ?? draft?.action ?? null
         );

         // reservations normalizate
         const reservations = Array.isArray(draft?.reservations)
            ? draft.reservations
            : Array.isArray(outer?.reservations)
            ? outer.reservations
            : [];

         let normalizedReservations = reservations
            .map((r) => {
               const iso = normalizeIso(pickStartLike(r));
               if (!iso) return null;
               return {
                  startTime: iso,
                  sector: r?.sector ?? undefined,
                  gearbox: r?.gearbox ?? undefined,
                  privateMessage: r?.privateMessage ?? undefined,
                  color: r?.color ?? undefined,
                  isFavorite: r?.isFavorite ?? undefined,
                  isImportant: r?.isImportant ?? undefined,
               };
            })
            .filter(Boolean);

         // fallback: dacă ai slotKey dar nu ai reservations
         if (!normalizedReservations.length && slotKey) {
            const parsed = parseSlotKeyMaybe(slotKey);
            if (parsed?.startTime)
               normalizedReservations = [{ startTime: parsed.startTime }];
         }

         // IMPORTANT: allow “clear” cu reservations: []
         if (!instructorId) return;

         const allowEmpty = isClearAction(action);
         if (!allowEmpty && !normalizedReservations.length) return;

         const core = {
            instructorId,
            ...(instructorsGroupId != null ? { instructorsGroupId } : {}),
            ...(slotKey ? { draftKey: slotKey, slotKey } : {}),
            ...(action ? { action } : {}),
            reservations: allowEmpty ? [] : normalizedReservations,
         };

         const startedBy = outer?.startedBy ?? outer?.by ?? outer?.user ?? null;

         const payload = {
            reservationDraft: core,
            ...core,
            ...(startedBy ? { startedBy } : {}),
         };

         dbg("[WS] EMIT reservation:create:started", payload);
         s.emit("reservation:create:started", payload);
      };

      return {
         get socket() {
            return socketRef.current;
         },

         joinReservation,
         leaveReservation,
         join: joinReservation,
         leave: leaveReservation,

         emitReservationCreateStarted,
      };
   }, []);

   return api;
}
