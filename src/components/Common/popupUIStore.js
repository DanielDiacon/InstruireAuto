// src/components/Common/popupUIStore.js
let currentPopup = null;
const listeners = new Set();

let __id = 0;

function emit() {
   listeners.forEach((cb) => {
      try {
         cb();
      } catch {}
   });
}

export function subscribePopup(cb) {
   listeners.add(cb);
   return () => listeners.delete(cb);
}

export function getCurrentPopup() {
   return currentPopup;
}

export function openPopup(type, props = {}) {
   currentPopup = { id: ++__id, type, props };
   emit();
}

export function closePopup() {
   currentPopup = null;
   emit();
}

/* subpopup stack (opțional, îl lași dacă vrei) */
let __subStack = [];
const __subListeners = new Set();

function __emitSub(action = "set") {
   const top = __subStack[__subStack.length - 1] || null;
   const depth = __subStack.length;
   __subListeners.forEach((cb) => {
      try {
         cb({ detail: top, depth, action });
      } catch {}
   });
}

export function openSubPopup(type, props = {}) {
   __subStack.push({ type, props });
   __emitSub("set");
}

export function closeSubPopup() {
   const depth = __subStack.length;
   __subListeners.forEach((cb) =>
      cb({ detail: null, depth, action: "request-close" }),
   );
}

export function popSubPopup() {
   __subStack.pop();
   __emitSub("set");
}

export function getCurrentSubPopup() {
   return __subStack[__subStack.length - 1] || null;
}

export function subscribeSubPopup(cb) {
   __subListeners.add(cb);
   return () => __subListeners.delete(cb);
}
