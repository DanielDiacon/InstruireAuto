import { openPopup as openPopupUI } from "../Common/popupUIStore";

// popupStore.js
let currentPopup = null;
let listeners = [];

export function subscribePopup(callback) {
   listeners.push(callback);
   return () => {
      listeners = listeners.filter((l) => l !== callback);
   };
}

export function openPopup(type, props = {}) {
   if (type === "sAddProg") {
      openPopupUI("sAddProg", props);
      return;
   }

   currentPopup = { type, props };
   listeners.forEach((cb) => cb({ detail: currentPopup }));
}

export function closePopup() {
   currentPopup = null;
   listeners.forEach((cb) => cb({ detail: null }));
}

export function getCurrentPopup() {
   return currentPopup;
}
let __subStack = []; // 👈 stivă de subpopup-uri
const __subListeners = new Set();

function __emitSub() {
   const top = __subStack[__subStack.length - 1] || null;
   const depth = __subStack.length;
   __subListeners.forEach((cb) => cb({ detail: top, depth, action: "set" }));
}

export function openSubPopup(type, props = {}) {
   // push
   __subStack.push({ type, props });
   __emitSub();
}

export function closeSubPopup() {
   // doar cere închidere (NU pop încă)
   const depth = __subStack.length;
   __subListeners.forEach((cb) =>
      cb({ detail: null, depth, action: "request-close" }),
   );
}

export function popSubPopup() {
   // efectiv pop după animație
   __subStack.pop();
   __emitSub();
}

export function getCurrentSubPopup() {
   return __subStack[__subStack.length - 1] || null;
}

export function subscribeSubPopup(cb) {
   __subListeners.add(cb);
   return () => __subListeners.delete(cb);
}
