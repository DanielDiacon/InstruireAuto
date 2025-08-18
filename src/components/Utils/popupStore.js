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
