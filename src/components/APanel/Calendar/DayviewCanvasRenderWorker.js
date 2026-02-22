/* eslint-env worker */
/* eslint-disable no-restricted-globals */
import { drawAll, clearColorCache, setStaticColorOverrides } from "./render";

let renderCanvas = null;
let renderCtx = null;
let scene = null;
let sceneReady = false;
let cameraState = {
   x: 0,
   y: 0,
   width: 0,
   height: 0,
   zoom: 1,
};

function toFiniteNumber(value, fallback = 0) {
   const numeric = Number(value);
   return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveInt(value, fallback = 1) {
   const numeric = Math.floor(toFiniteNumber(value, fallback));
   return numeric > 0 ? numeric : fallback;
}

function ensureRenderContext() {
   if (!renderCanvas) return null;
   if (renderCtx) return renderCtx;
   renderCtx = renderCanvas.getContext("2d");
   return renderCtx;
}

function updateCanvasSize(cssWidth, cssHeight, dpr) {
   if (!renderCanvas) return;
   const pixelWidth = toPositiveInt(cssWidth * dpr, 1);
   const pixelHeight = toPositiveInt(cssHeight * dpr, 1);
   if (renderCanvas.width !== pixelWidth) renderCanvas.width = pixelWidth;
   if (renderCanvas.height !== pixelHeight) renderCanvas.height = pixelHeight;
}

function postWorkerError(type, message, drawId = null) {
   self.postMessage({
      type,
      drawId,
      message: String(message || "Unknown worker error"),
   });
}

self.onmessage = (event) => {
   const payload = event?.data || {};
   const type = payload.type;

   try {
      if (type === "init") {
         renderCanvas = payload.canvas || null;
         renderCtx = renderCanvas?.getContext?.("2d") || null;
         if (payload.colorOverrides !== undefined) {
            setStaticColorOverrides(payload.colorOverrides || null);
         }
         clearColorCache();
         self.postMessage({ type: "init-complete" });
         return;
      }

      if (type === "scene") {
         scene = payload.scene || null;
         sceneReady = !!scene;
         if (payload.colorOverrides !== undefined) {
            setStaticColorOverrides(payload.colorOverrides || null);
         }
         if (payload.clearCaches) clearColorCache();
         return;
      }

      if (type === "camera") {
         const cam = payload.camera || {};
         cameraState = {
            x: toFiniteNumber(cam.x, 0),
            y: toFiniteNumber(cam.y, 0),
            width: Math.max(0, toFiniteNumber(cam.width, 0)),
            height: Math.max(0, toFiniteNumber(cam.height, 0)),
            zoom: Math.max(0.1, toFiniteNumber(cam.zoom, 1)),
         };
         return;
      }

      if (type === "reset") {
         scene = null;
         sceneReady = false;
         cameraState = {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            zoom: 1,
         };
         clearColorCache();
         return;
      }

      if (type !== "draw") return;

      const ctx = ensureRenderContext();
      if (!ctx || !renderCanvas || !sceneReady || !scene) {
         postWorkerError("draw-error", "Worker renderer is not initialized", payload.drawId);
         return;
      }

      const drawId = toFiniteNumber(payload.drawId, 0);
      const width = Math.max(1, toFiniteNumber(payload.width, 1));
      const height = Math.max(1, toFiniteNumber(payload.height, 1));
      const dpr = Math.max(0.5, toFiniteNumber(payload.dpr, 1));
      const drawPayload = payload.draw || {};
      const buildHitMap = drawPayload.buildHitMap !== false;
      const drawOverrides = { ...drawPayload };
      delete drawOverrides.buildHitMap;

      updateCanvasSize(width, height, dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const hitMap = buildHitMap ? [] : null;
      drawAll({
         ...scene,
         ...drawOverrides,
         camera: cameraState,
         ctx,
         width,
         height,
         hitMap,
         includeEventPayloadInHitMap: false,
      });

      self.postMessage({
         type: "draw-complete",
         drawId,
         hitMapIncluded: buildHitMap,
         hitMap,
      });
   } catch (error) {
      postWorkerError("draw-error", error?.message || error, payload.drawId);
   }
};
