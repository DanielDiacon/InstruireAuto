// src/components/APanel/Calendar/dayview/globals.js
import { DEFAULT_EVENT_COLOR_TOKEN } from "./render";

/* ========= GLOBAL copy/paste + selecție unică pe tot calendarul ========= */

let GLOBAL_COPY_BUFFER = null; // { userId, sector, gearbox, color, privateMessage, instructorId }
let GLOBAL_SELECTED_EVENT = null; // event selectat global
let GLOBAL_SELECTED_SLOT = null; // { instructorId, slotStart, slotEnd }

let GLOBAL_PASTE_FN = null; // funcția de paste (injectată din componentă)
let GLOBAL_DELETE_FN = null; // funcția de delete (injectată din componentă)
let GLOBAL_BLOCK_FN = null; // funcția de block slot (injectată din componentă)

let GLOBAL_KEY_HANDLER_INSTALLED = false;
let GLOBAL_KEY_HANDLER = null;

let GLOBAL_TRACK_MOUNT_COUNT = 0;

let GLOBAL_SELECTION_VERSION = 0;

// 🔹 IDs de rezervări ascunse global după Ctrl+X
let GLOBAL_HIDDEN_IDS = new Set();
let GLOBAL_HIDDEN_VERSION = 0;

function firstDefined() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = arguments[i];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function toDateSafe(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeEventId(eventLike) {
  if (!eventLike || typeof eventLike !== "object") return "";
  const raw = eventLike.raw || {};
  const id = firstDefined(raw.id, eventLike.id, null);
  return id != null ? String(id) : "";
}

function normalizeEventStartMs(eventLike) {
  if (!eventLike || typeof eventLike !== "object") return null;
  const raw = eventLike.raw || {};
  const startRaw = firstDefined(
    raw.startTime,
    raw.start,
    raw.start_at,
    raw.startDate,
    eventLike.start,
    null,
  );
  const d = toDateSafe(startRaw);
  return d ? d.getTime() : null;
}

function normalizeSlotKey(slotLike) {
  if (!slotLike || typeof slotLike !== "object") return "";
  const keyRaw = firstDefined(slotLike.localSlotKey, slotLike.slotKey, null);
  return keyRaw != null ? String(keyRaw).trim() : "";
}

function normalizeSlotInstructorId(slotLike) {
  if (!slotLike || typeof slotLike !== "object") return "";
  const idRaw = firstDefined(
    slotLike.actionInstructorId,
    slotLike.instructorId,
    null,
  );
  return idRaw != null ? String(idRaw).trim() : "";
}

function normalizeSlotStartMs(slotLike) {
  if (!slotLike || typeof slotLike !== "object") return null;
  const d = toDateSafe(firstDefined(slotLike.slotStart, null));
  return d ? d.getTime() : null;
}

function buildSelectionMarker(eventLike, slotLike) {
  return {
    eventId: normalizeEventId(eventLike),
    eventStartMs: normalizeEventStartMs(eventLike),
    slotInstructorId: normalizeSlotInstructorId(slotLike),
    slotKey: normalizeSlotKey(slotLike),
    slotStartMs: normalizeSlotStartMs(slotLike),
  };
}

function markersEqual(a, b) {
  const one = a || {};
  const two = b || {};
  return (
    String(one.eventId || "") === String(two.eventId || "") &&
    Number(one.eventStartMs ?? -1) === Number(two.eventStartMs ?? -1) &&
    String(one.slotInstructorId || "") === String(two.slotInstructorId || "") &&
    String(one.slotKey || "") === String(two.slotKey || "") &&
    Number(one.slotStartMs ?? -1) === Number(two.slotStartMs ?? -1)
  );
}

/* ================== Broadcast helpers ================== */

function broadcastSelectionChange(extraDetail = null) {
  if (typeof window === "undefined") return;

  try {
    const ev = new CustomEvent("dayview-selection-change", {
      detail: {
        version: GLOBAL_SELECTION_VERSION,
        ...(extraDetail && typeof extraDetail === "object" ? extraDetail : {}),
      },
    });
    window.dispatchEvent(ev);
  } catch (e) {
    const ev = new Event("dayview-selection-change");
    window.dispatchEvent(ev);
  }
}

function broadcastHiddenChange(reservationId) {
  GLOBAL_HIDDEN_VERSION += 1;

  if (typeof window === "undefined") return;

  try {
    const ev = new CustomEvent("dayview-hidden-change", {
      detail: {
        version: GLOBAL_HIDDEN_VERSION,
        reservationId: reservationId != null ? String(reservationId) : null,
      },
    });
    window.dispatchEvent(ev);
  } catch (e) {
    const ev = new Event("dayview-hidden-change");
    window.dispatchEvent(ev);
  }
}

/* ================== Public API: copy buffer ================== */

export function getCopyBuffer() {
  return GLOBAL_COPY_BUFFER;
}
export function setCopyBuffer(v) {
  GLOBAL_COPY_BUFFER = v || null;
}

/* ================== Public API: selection ================== */

export function getSelectedEvent() {
  return GLOBAL_SELECTED_EVENT;
}
export function getSelectedSlot() {
  return GLOBAL_SELECTED_SLOT;
}
export function getSelectionVersion() {
  return GLOBAL_SELECTION_VERSION;
}

/**
 * setează selecția globală (fie event, fie slot, fie nimic)
 */
export function setGlobalSelection({ event = null, slot = null } = {}) {
  const nextEvent = event || null;
  const nextSlot = slot || null;
  const prevMarker = buildSelectionMarker(GLOBAL_SELECTED_EVENT, GLOBAL_SELECTED_SLOT);
  const nextMarker = buildSelectionMarker(nextEvent, nextSlot);
  if (markersEqual(prevMarker, nextMarker)) return;

  GLOBAL_SELECTED_EVENT = nextEvent;
  GLOBAL_SELECTED_SLOT = nextSlot;
  GLOBAL_SELECTION_VERSION += 1;
  broadcastSelectionChange({
    prev: prevMarker,
    next: nextMarker,
  });
}

/* ================== Public API: hidden ids ================== */

export function getHiddenVersion() {
  return GLOBAL_HIDDEN_VERSION;
}

export function hasHiddenIds() {
  return !!(GLOBAL_HIDDEN_IDS && GLOBAL_HIDDEN_IDS.size > 0);
}

export function isHidden(reservationId) {
  if (reservationId == null) return false;
  return GLOBAL_HIDDEN_IDS.has(String(reservationId));
}

export function hideReservationGlobally(reservationId) {
  if (!reservationId) return;
  GLOBAL_HIDDEN_IDS.add(String(reservationId));
  broadcastHiddenChange(reservationId);
}

export function resetHidden() {
  GLOBAL_HIDDEN_IDS = new Set();
  GLOBAL_HIDDEN_VERSION = 0;
  broadcastHiddenChange(null);
}

/* ================== Public API: injected fns ================== */

export function setPasteFn(fn) {
  GLOBAL_PASTE_FN = typeof fn === "function" ? fn : null;
}
export function setDeleteFn(fn) {
  GLOBAL_DELETE_FN = typeof fn === "function" ? fn : null;
}
export function setBlockFn(fn) {
  GLOBAL_BLOCK_FN = typeof fn === "function" ? fn : null;
}

/* ================== Key handler (Ctrl/Cmd + C/X/V/L) ================== */

export function installGlobalKeyHandler() {
  if (GLOBAL_KEY_HANDLER_INSTALLED) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const handleKeyDown = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;

    const target = e.target;
    if (target) {
      const tag = (target.tagName || "").toLowerCase();
      const isEditable =
        tag === "input" || tag === "textarea" || target.isContentEditable;
      if (isEditable) return;
    }

    const key = (e.key || "").toLowerCase();

    // Ctrl+C – copiem din event-ul selectat global
    if (key === "c") {
      const ev = GLOBAL_SELECTED_EVENT;
      if (!ev) return;

      const raw = ev.raw || {};
      const userId =
        raw.userId ??
        raw.user_id ??
        ev.userId ??
        ev.studentId ??
        raw.user?.id ??
        null;

      if (!userId) return;

      const sector = raw.sector || ev.sector || "Botanica";
      const gearbox = raw.gearbox || ev.gearbox || "Manual";
      const colorRaw = raw.color ?? ev.color ?? DEFAULT_EVENT_COLOR_TOKEN;
      const privateMessageRaw =
        raw.privateMessage ??
        ev.privateMessage ??
        ev.eventPrivateMessage ??
        "";

      // 👇 instructorul original (nu pad-ul!)
      const instructorId =
        raw.instructorId ?? raw.instructor_id ?? ev.instructorId ?? null;

      GLOBAL_COPY_BUFFER = {
        userId,
        sector,
        gearbox,
        color: colorRaw,
        privateMessage: String(privateMessageRaw || ""),
        instructorId,
      };

      e.preventDefault();
      return;
    }

    // Ctrl+X – copiem + ștergem
    if (key === "x") {
      const ev = GLOBAL_SELECTED_EVENT;
      if (!ev) return;

      const raw = ev.raw || {};
      const reservationId = raw.id ?? ev.id;
      if (!reservationId) return;

      const userId =
        raw.userId ??
        raw.user_id ??
        ev.userId ??
        ev.studentId ??
        raw.user?.id ??
        null;

      if (!userId) return;

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

      GLOBAL_COPY_BUFFER = {
        userId,
        sector,
        gearbox,
        color: colorRaw,
        privateMessage: String(privateMessageRaw || ""),
        instructorId,
      };

      e.preventDefault();
      if (GLOBAL_DELETE_FN) GLOBAL_DELETE_FN(reservationId);
      return;
    }

    // Ctrl+V – lipim în slot-ul selectat global
    if (key === "v") {
      if (!GLOBAL_COPY_BUFFER || !GLOBAL_SELECTED_SLOT || !GLOBAL_PASTE_FN) {
        return;
      }
      e.preventDefault();
      GLOBAL_PASTE_FN(GLOBAL_COPY_BUFFER, GLOBAL_SELECTED_SLOT);
      return;
    }

    // Ctrl+L – blocăm slot-ul selectat global
    if (key === "l") {
      if (!GLOBAL_SELECTED_SLOT || !GLOBAL_BLOCK_FN) return;
      e.preventDefault();
      GLOBAL_BLOCK_FN(GLOBAL_SELECTED_SLOT);
      return;
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  GLOBAL_KEY_HANDLER = handleKeyDown;
  GLOBAL_KEY_HANDLER_INSTALLED = true;
}

export function uninstallGlobalKeyHandler() {
  if (!GLOBAL_KEY_HANDLER_INSTALLED || !GLOBAL_KEY_HANDLER) return;
  if (typeof window === "undefined") return;

  window.removeEventListener("keydown", GLOBAL_KEY_HANDLER);
  GLOBAL_KEY_HANDLER_INSTALLED = false;
  GLOBAL_KEY_HANDLER = null;
}

/* ================== Lifetime helpers (mount/unmount) ================== */

function resetAllGlobals() {
  GLOBAL_COPY_BUFFER = null;
  GLOBAL_SELECTED_EVENT = null;
  GLOBAL_SELECTED_SLOT = null;

  GLOBAL_PASTE_FN = null;
  GLOBAL_DELETE_FN = null;
  GLOBAL_BLOCK_FN = null;

  GLOBAL_SELECTION_VERSION = 0;

  GLOBAL_HIDDEN_IDS = new Set();
  GLOBAL_HIDDEN_VERSION = 0;
}

/**
 * Cheamă în `useEffect(() => retainGlobals(); return release; , [])`
 * Ca să păstrezi handlerul global instalat cât timp există cel puțin un DayviewCanvasTrack montat.
 */
export function retainGlobals() {
  GLOBAL_TRACK_MOUNT_COUNT += 1;
  installGlobalKeyHandler();

  return () => {
    GLOBAL_TRACK_MOUNT_COUNT -= 1;
    if (GLOBAL_TRACK_MOUNT_COUNT <= 0) {
      uninstallGlobalKeyHandler();
      GLOBAL_TRACK_MOUNT_COUNT = 0;
      resetAllGlobals();
    }
  };
}
