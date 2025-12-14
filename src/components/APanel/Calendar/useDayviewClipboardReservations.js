// src/components/APanel/Calendar/dayview/useDayviewClipboardReservations.js
import { useCallback, useEffect } from "react";
import { useDispatch } from "react-redux";

import {
  createReservationsForUser,
  deleteReservation,
} from "../../../../api/reservationsService";

import {
  fetchReservationsDelta,
  removeReservationLocal,
} from "../../../../store/reservationsSlice";

import { triggerCalendarRefresh } from "../../../Utils/calendarBus";

import {
  hideReservationGlobally,
  setGlobalDeleteFn,
  setGlobalPasteFn,
  setGlobalSelection,
  setGlobalCopyBuffer,
} from "./globals";

import { DEFAULT_EVENT_COLOR_TOKEN } from "./constants";

// IMPORTANT: funcția ta existentă din DayviewCanvasTrack
// o lași în fișierul mare sau o muți ulterior; aici doar o importăm după ce o muți.
import { buildStartTimeForSlot } from "./tz"; // vezi pasul 5 (minimal)

export function useDayviewClipboardReservations() {
  const dispatch = useDispatch();

  const deleteReservationById = useCallback(
    async (reservationId) => {
      if (!reservationId) return;
      const idStr = String(reservationId);

      dispatch(removeReservationLocal(idStr));
      hideReservationGlobally(idStr);

      try {
        await deleteReservation(idStr);
      } catch (err) {
        console.error("Eroare la ștergerea programării (Ctrl+X):", err);
        try {
          await dispatch(fetchReservationsDelta());
        } catch (err2) {
          console.error("fetchReservationsDelta după delete eșuat:", err2);
        }
        return;
      }

      try {
        await dispatch(fetchReservationsDelta());
      } catch (err) {
        console.error("fetchReservationsDelta după delete a eșuat:", err);
      }

      triggerCalendarRefresh();
      setGlobalSelection({ event: null, slot: null });
    },
    [dispatch]
  );

  const copyFromEvent = useCallback(
    (ev, { cut = false } = {}) => {
      if (!ev) return null;

      const raw = ev.raw || {};
      const userId =
        raw.userId ??
        raw.user_id ??
        ev.userId ??
        ev.studentId ??
        raw.user?.id ??
        null;

      if (!userId) {
        console.warn("Nu am putut determina userId pentru copy/cut", ev);
        return null;
      }

      const sector = raw.sector || ev.sector || "Botanica";
      const gearbox = raw.gearbox || ev.gearbox || "Manual";
      const colorRaw = raw.color ?? ev.color ?? DEFAULT_EVENT_COLOR_TOKEN;

      const privateMessageRaw =
        raw.privateMessage ??
        ev.privateMessage ??
        ev.eventPrivateMessage ??
        "";

      const instructorId =
        raw.instructorId ?? raw.instructor_id ?? ev.instructorId ?? null;

      const payload = {
        userId,
        sector,
        gearbox,
        color: colorRaw,
        privateMessage: String(privateMessageRaw || ""),
        instructorId,
      };

      setGlobalCopyBuffer(payload);

      if (cut) {
        const reservationId = raw.id ?? ev.id;
        if (!reservationId) {
          console.warn("Nu am id pentru delete (cut)", ev);
          return payload;
        }
        deleteReservationById(reservationId);
      }

      return payload;
    },
    [deleteReservationById]
  );

  const pasteFromCopyToSlot = useCallback(
    async (copy, slot) => {
      if (!copy || !slot) return;

      const startTimeToSend = buildStartTimeForSlot(slot.slotStart);
      if (!startTimeToSend) {
        console.error("Nu am putut calcula startTime pentru slot", slot);
        return;
      }

      // dacă slot e pad (__pad_*), folosim instructorul original din copy-buffer
      let instructorIdNum = Number(slot.instructorId);
      if (!Number.isFinite(instructorIdNum) || instructorIdNum <= 0) {
        instructorIdNum = Number(copy.instructorId);
      }

      const userIdNum = Number(copy.userId);

      if (!Number.isFinite(instructorIdNum) || instructorIdNum <= 0) {
        console.error("InstructorId invalid pentru paste", slot.instructorId, copy.instructorId);
        return;
      }
      if (!Number.isFinite(userIdNum) || userIdNum <= 0) {
        console.error("UserId invalid pentru paste", copy.userId);
        return;
      }

      const payload = {
        userId: userIdNum,
        instructorId: instructorIdNum,
        reservations: [
          {
            startTime: startTimeToSend,
            sector: copy.sector || "Botanica",
            gearbox:
              (copy.gearbox || "Manual").toLowerCase() === "automat"
                ? "Automat"
                : "Manual",
            privateMessage: copy.privateMessage || "",
            color:
              typeof copy.color === "string" && copy.color.trim()
                ? copy.color.trim()
                : "--black-t",
            instructorId: instructorIdNum,
          },
        ],
      };

      try {
        await createReservationsForUser(payload);
      } catch (err) {
        console.error("Eroare la crearea programării (paste):", err);
      } finally {
        try {
          await dispatch(fetchReservationsDelta());
        } catch (err2) {
          console.error("fetchReservationsDelta după paste a eșuat:", err2);
        }
        triggerCalendarRefresh();
      }
    },
    [dispatch]
  );

  // Injectăm în global handler (Ctrl+V / Ctrl+X)
  useEffect(() => {
    setGlobalDeleteFn(deleteReservationById);
    return () => setGlobalDeleteFn(null);
  }, [deleteReservationById]);

  useEffect(() => {
    setGlobalPasteFn(pasteFromCopyToSlot);
    return () => setGlobalPasteFn(null);
  }, [pasteFromCopyToSlot]);

  return {
    deleteReservationById,
    copyFromEvent,
    pasteFromCopyToSlot,
  };
}
