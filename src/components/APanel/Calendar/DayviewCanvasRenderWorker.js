/* eslint-env worker */
/* eslint-disable no-restricted-globals */
import {
   drawAll,
   buildDayRenderModel,
   clearColorCache,
   setStaticColorOverrides,
} from "./render";

let renderCanvas = null;
let renderCtx = null;
let staticLayerCanvas = null;
let staticLayerCtx = null;
let staticLayerKey = null;
let dynamicLayerCanvas = null;
let dynamicLayerCtx = null;
let dynamicLayerKey = null;
let scene = null;
let sceneReady = false;
let sceneEventState = new Map();
let lastHitMapSignature = "";
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

function ensureStaticLayerContext(pixelWidth, pixelHeight) {
   if (!renderCanvas) return null;

   if (!staticLayerCanvas) {
      if (typeof OffscreenCanvas === "undefined") return null;
      staticLayerCanvas = new OffscreenCanvas(pixelWidth, pixelHeight);
      staticLayerCtx = staticLayerCanvas.getContext("2d");
      staticLayerKey = null;
      return staticLayerCtx;
   }

   if (staticLayerCanvas.width !== pixelWidth)
      staticLayerCanvas.width = pixelWidth;
   if (staticLayerCanvas.height !== pixelHeight)
      staticLayerCanvas.height = pixelHeight;
   if (!staticLayerCtx) staticLayerCtx = staticLayerCanvas.getContext("2d");

   return staticLayerCtx;
}

function ensureDynamicLayerContext(pixelWidth, pixelHeight) {
   if (!renderCanvas) return null;

   if (!dynamicLayerCanvas) {
      if (typeof OffscreenCanvas === "undefined") return null;
      dynamicLayerCanvas = new OffscreenCanvas(pixelWidth, pixelHeight);
      dynamicLayerCtx = dynamicLayerCanvas.getContext("2d");
      dynamicLayerKey = null;
      return dynamicLayerCtx;
   }

   if (dynamicLayerCanvas.width !== pixelWidth)
      dynamicLayerCanvas.width = pixelWidth;
   if (dynamicLayerCanvas.height !== pixelHeight)
      dynamicLayerCanvas.height = pixelHeight;
   if (!dynamicLayerCtx) dynamicLayerCtx = dynamicLayerCanvas.getContext("2d");

   return dynamicLayerCtx;
}

function updateCanvasSize(cssWidth, cssHeight, dpr) {
   if (!renderCanvas) return;
   const pixelWidth = toPositiveInt(cssWidth * dpr, 1);
   const pixelHeight = toPositiveInt(cssHeight * dpr, 1);
   if (renderCanvas.width !== pixelWidth) renderCanvas.width = pixelWidth;
   if (renderCanvas.height !== pixelHeight) renderCanvas.height = pixelHeight;
}

function hashStringValue(hash, value) {
   const str = String(value ?? "");
   let next = hash >>> 0;
   for (let i = 0; i < str.length; i++) {
      next ^= str.charCodeAt(i);
      next = Math.imul(next, 16777619);
   }
   return next >>> 0;
}

function hashNumberValue(hash, value) {
   const numeric = Number(value);
   const normalized = Number.isFinite(numeric) ? Math.round(numeric * 1000) : 0;
   let next = hash >>> 0;
   next ^= normalized;
   next = Math.imul(next, 16777619);
   return next >>> 0;
}

function computeHitMapSignature(hitMap) {
   if (!Array.isArray(hitMap) || !hitMap.length) return "0";

   let hash = 2166136261;
   hash = hashNumberValue(hash, hitMap.length);

   for (let i = 0; i < hitMap.length; i++) {
      const item = hitMap[i] || {};
      hash = hashStringValue(hash, item.kind || "");
      hash = hashNumberValue(hash, item.x);
      hash = hashNumberValue(hash, item.y);
      hash = hashNumberValue(hash, item.w);
      hash = hashNumberValue(hash, item.h);
      hash = hashStringValue(hash, item.instructorId || "");
      hash = hashStringValue(hash, item.slotStart || "");
      hash = hashStringValue(hash, item.slotEnd || "");
      hash = hashNumberValue(hash, item.slotIndex);
      hash = hashNumberValue(hash, item.instIdx);
      hash = hashStringValue(hash, item.reservationId ?? "");
   }

   return `${hitMap.length}:${hash.toString(36)}`;
}

function serializeSceneEventsFromState() {
   if (!sceneEventState || !sceneEventState.size) return [];
   return Array.from(sceneEventState.values())
      .sort((a, b) => {
         const aIdx = toFiniteNumber(a?.index, 0);
         const bIdx = toFiniteNumber(b?.index, 0);
         return aIdx - bIdx;
      })
      .map((entry) => entry?.event)
      .filter(Boolean);
}

function rebuildSceneRenderModel() {
   if (!scene) return;
   scene.dayRenderModel = buildDayRenderModel({
      events: scene.events || [],
      slotGeoms: scene.slotGeoms || [],
   });
}

function applySceneEventReset(entries) {
   const safeEntries = Array.isArray(entries) ? entries : [];
   sceneEventState = new Map();

   for (const entry of safeEntries) {
      const key = String(entry?.key || "");
      if (!key) continue;
      sceneEventState.set(key, {
         index: toFiniteNumber(entry?.index, 0),
         event: entry?.event || null,
      });
   }

   if (scene) {
      scene.events = serializeSceneEventsFromState();
      rebuildSceneRenderModel();
      staticLayerKey = null;
      dynamicLayerKey = null;
   }
}

function applySceneEventPatch(removals, upserts) {
   const nextRemovals = Array.isArray(removals) ? removals : [];
   const nextUpserts = Array.isArray(upserts) ? upserts : [];

   for (const keyRaw of nextRemovals) {
      const key = String(keyRaw || "");
      if (!key) continue;
      sceneEventState.delete(key);
   }

   for (const entry of nextUpserts) {
      const key = String(entry?.key || "");
      if (!key) continue;
      sceneEventState.set(key, {
         index: toFiniteNumber(entry?.index, 0),
         event: entry?.event || null,
      });
   }

   if (scene) {
      scene.events = serializeSceneEventsFromState();
      rebuildSceneRenderModel();
      staticLayerKey = null;
      dynamicLayerKey = null;
   }
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
         staticLayerCanvas = null;
         staticLayerCtx = null;
         staticLayerKey = null;
         dynamicLayerCanvas = null;
         dynamicLayerCtx = null;
         dynamicLayerKey = null;
         sceneEventState = new Map();
         lastHitMapSignature = "";
         if (payload.colorOverrides !== undefined) {
            setStaticColorOverrides(payload.colorOverrides || null);
         }
         clearColorCache();
         self.postMessage({ type: "init-complete" });
         return;
      }

      if (type === "scene") {
         scene = payload.scene ? { ...payload.scene, events: [] } : null;
         sceneReady = !!scene;
         staticLayerKey = null;
         dynamicLayerKey = null;
         sceneEventState = new Map();
         lastHitMapSignature = "";
         if (payload.colorOverrides !== undefined) {
            setStaticColorOverrides(payload.colorOverrides || null);
         }
         if (payload.clearCaches) clearColorCache();
         if (Array.isArray(payload.eventEntries)) {
            applySceneEventReset(payload.eventEntries);
         } else if (scene) {
            rebuildSceneRenderModel();
         }
         return;
      }

      if (type === "scene-events-reset") {
         if (!sceneReady || !scene) return;
         applySceneEventReset(payload.entries);
         return;
      }

      if (type === "scene-events-patch") {
         if (!sceneReady || !scene) return;
         applySceneEventPatch(payload.removals, payload.upserts);
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
         sceneEventState = new Map();
         staticLayerCanvas = null;
         staticLayerCtx = null;
         staticLayerKey = null;
         dynamicLayerCanvas = null;
         dynamicLayerCtx = null;
         dynamicLayerKey = null;
         lastHitMapSignature = "";
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
      const dpr = Math.max(0.01, toFiniteNumber(payload.dpr, 1));
      const drawPayload = payload.draw || {};
      const buildHitMap = drawPayload.buildHitMap !== false;
      const forceHitMapTransfer = drawPayload.forceHitMapTransfer === true;
      const nextStaticLayerKey = String(payload.staticLayerKey || "");
      const nextDynamicLayerKey = String(payload.dynamicLayerKey || "");
      const worldWidth = Math.max(1, toFiniteNumber(drawPayload.worldWidth, width));
      const worldHeight = Math.max(
         1,
         toFiniteNumber(drawPayload.worldHeight, height),
      );
      const renderOriginX = Math.max(
         0,
         toFiniteNumber(drawPayload.renderOriginX, 0),
      );
      const renderOriginY = Math.max(
         0,
         toFiniteNumber(drawPayload.renderOriginY, 0),
      );
      const staticOriginX = Math.max(
         0,
         toFiniteNumber(drawPayload.staticOriginX, renderOriginX),
      );
      const staticOriginY = Math.max(
         0,
         toFiniteNumber(drawPayload.staticOriginY, renderOriginY),
      );
      const staticSurfaceWidth = Math.max(
         width,
         toFiniteNumber(drawPayload.staticSurfaceWidth, width),
      );
      const staticSurfaceHeight = Math.max(
         height,
         toFiniteNumber(drawPayload.staticSurfaceHeight, height),
      );
      const staticSourceOffsetX = Math.max(
         0,
         toFiniteNumber(
            drawPayload.staticSourceOffsetX,
            Math.max(0, renderOriginX - staticOriginX),
         ),
      );
      const staticSourceOffsetY = Math.max(
         0,
         toFiniteNumber(
            drawPayload.staticSourceOffsetY,
            Math.max(0, renderOriginY - staticOriginY),
         ),
      );
      const dynamicOriginX = Math.max(
         0,
         toFiniteNumber(drawPayload.dynamicOriginX, renderOriginX),
      );
      const dynamicOriginY = Math.max(
         0,
         toFiniteNumber(drawPayload.dynamicOriginY, renderOriginY),
      );
      const dynamicSurfaceWidth = Math.max(
         width,
         toFiniteNumber(drawPayload.dynamicSurfaceWidth, width),
      );
      const dynamicSurfaceHeight = Math.max(
         height,
         toFiniteNumber(drawPayload.dynamicSurfaceHeight, height),
      );
      const dynamicSourceOffsetX = Math.max(
         0,
         toFiniteNumber(
            drawPayload.dynamicSourceOffsetX,
            Math.max(0, renderOriginX - dynamicOriginX),
         ),
      );
      const dynamicSourceOffsetY = Math.max(
         0,
         toFiniteNumber(
            drawPayload.dynamicSourceOffsetY,
            Math.max(0, renderOriginY - dynamicOriginY),
         ),
      );
      const sceneMaxRowIdx = Math.max(0, Number(scene?.rowsCount || 0) - 1);
      const sceneMaxColIdx = Math.max(0, Number(scene?.colsPerRow || 0) - 1);
      const staticVisibleRowStart = Math.max(
         0,
         Math.min(
            sceneMaxRowIdx,
            toFiniteNumber(
               drawPayload.staticVisibleRowStart,
               toFiniteNumber(drawPayload.visibleRowStart, 0),
            ),
         ),
      );
      const staticVisibleRowEnd = Math.max(
         staticVisibleRowStart,
         Math.min(
            sceneMaxRowIdx,
            toFiniteNumber(
               drawPayload.staticVisibleRowEnd,
               toFiniteNumber(drawPayload.visibleRowEnd, sceneMaxRowIdx),
            ),
         ),
      );
      const staticVisibleColStart = Math.max(
         0,
         Math.min(
            sceneMaxColIdx,
            toFiniteNumber(
               drawPayload.staticVisibleColStart,
               toFiniteNumber(drawPayload.visibleColStart, 0),
            ),
         ),
      );
      const staticVisibleColEnd = Math.max(
         staticVisibleColStart,
         Math.min(
            sceneMaxColIdx,
            toFiniteNumber(
               drawPayload.staticVisibleColEnd,
               toFiniteNumber(drawPayload.visibleColEnd, sceneMaxColIdx),
            ),
         ),
      );
      const dynamicVisibleRowStart = Math.max(
         0,
         Math.min(
            sceneMaxRowIdx,
            toFiniteNumber(
               drawPayload.dynamicVisibleRowStart,
               toFiniteNumber(drawPayload.visibleRowStart, 0),
            ),
         ),
      );
      const dynamicVisibleRowEnd = Math.max(
         dynamicVisibleRowStart,
         Math.min(
            sceneMaxRowIdx,
            toFiniteNumber(
               drawPayload.dynamicVisibleRowEnd,
               toFiniteNumber(drawPayload.visibleRowEnd, sceneMaxRowIdx),
            ),
         ),
      );
      const dynamicVisibleColStart = Math.max(
         0,
         Math.min(
            sceneMaxColIdx,
            toFiniteNumber(
               drawPayload.dynamicVisibleColStart,
               toFiniteNumber(drawPayload.visibleColStart, 0),
            ),
         ),
      );
      const dynamicVisibleColEnd = Math.max(
         dynamicVisibleColStart,
         Math.min(
            sceneMaxColIdx,
            toFiniteNumber(
               drawPayload.dynamicVisibleColEnd,
               toFiniteNumber(drawPayload.visibleColEnd, sceneMaxColIdx),
            ),
         ),
      );
      const drawOverrides = { ...drawPayload };
      delete drawOverrides.buildHitMap;
      delete drawOverrides.forceHitMapTransfer;
      delete drawOverrides.worldWidth;
      delete drawOverrides.worldHeight;
      delete drawOverrides.renderOriginX;
      delete drawOverrides.renderOriginY;
      delete drawOverrides.staticOriginX;
      delete drawOverrides.staticOriginY;
      delete drawOverrides.staticSurfaceWidth;
      delete drawOverrides.staticSurfaceHeight;
      delete drawOverrides.staticSourceOffsetX;
      delete drawOverrides.staticSourceOffsetY;
      delete drawOverrides.staticVisibleRowStart;
      delete drawOverrides.staticVisibleRowEnd;
      delete drawOverrides.staticVisibleColStart;
      delete drawOverrides.staticVisibleColEnd;
      delete drawOverrides.dynamicOriginX;
      delete drawOverrides.dynamicOriginY;
      delete drawOverrides.dynamicSurfaceWidth;
      delete drawOverrides.dynamicSurfaceHeight;
      delete drawOverrides.dynamicSourceOffsetX;
      delete drawOverrides.dynamicSourceOffsetY;
      delete drawOverrides.dynamicVisibleRowStart;
      delete drawOverrides.dynamicVisibleRowEnd;
      delete drawOverrides.dynamicVisibleColStart;
      delete drawOverrides.dynamicVisibleColEnd;

      updateCanvasSize(width, height, dpr);
      const pixelWidth = renderCanvas.width || toPositiveInt(width * dpr, 1);
      const pixelHeight = renderCanvas.height || toPositiveInt(height * dpr, 1);
      const staticPixelWidth =
         toPositiveInt(staticSurfaceWidth * dpr, pixelWidth);
      const staticPixelHeight =
         toPositiveInt(staticSurfaceHeight * dpr, pixelHeight);
      const staticCtx = ensureStaticLayerContext(staticPixelWidth, staticPixelHeight);
      const hasStaticLayer = !!(staticLayerCanvas && staticCtx);
      const dynamicPixelWidth =
         toPositiveInt(dynamicSurfaceWidth * dpr, pixelWidth);
      const dynamicPixelHeight =
         toPositiveInt(dynamicSurfaceHeight * dpr, pixelHeight);
      const dynamicCtx = ensureDynamicLayerContext(
         dynamicPixelWidth,
         dynamicPixelHeight,
      );
      const hasDynamicLayer = !!(dynamicLayerCanvas && dynamicCtx);

      if (hasStaticLayer && staticLayerKey !== nextStaticLayerKey) {
         staticLayerKey = nextStaticLayerKey;
         staticCtx.setTransform(1, 0, 0, 1, 0, 0);
         staticCtx.clearRect(0, 0, staticPixelWidth, staticPixelHeight);
         staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
         staticCtx.translate(-staticOriginX, -staticOriginY);
         drawAll({
            ...scene,
            ...drawOverrides,
            camera: cameraState,
            ctx: staticCtx,
            width: worldWidth,
            height: worldHeight,
            hitMap: null,
            paintStatic: true,
            paintDynamic: false,
            clearCanvas: false,
            includeEventPayloadInHitMap: false,
            visibleRowStart: staticVisibleRowStart,
            visibleRowEnd: staticVisibleRowEnd,
            visibleColStart: staticVisibleColStart,
            visibleColEnd: staticVisibleColEnd,
         });
      }
      if (!hasDynamicLayer) {
         dynamicLayerCanvas = null;
         dynamicLayerCtx = null;
         dynamicLayerKey = null;
      }

      let hitMap = null;
      const shouldRefreshDynamicLayer =
         buildHitMap || dynamicLayerKey !== nextDynamicLayerKey;
      if (hasDynamicLayer && shouldRefreshDynamicLayer) {
         dynamicLayerKey = nextDynamicLayerKey;
         dynamicCtx.setTransform(1, 0, 0, 1, 0, 0);
         dynamicCtx.clearRect(0, 0, dynamicPixelWidth, dynamicPixelHeight);
         dynamicCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
         dynamicCtx.translate(-dynamicOriginX, -dynamicOriginY);

         hitMap = buildHitMap ? [] : null;
         drawAll({
            ...scene,
            ...drawOverrides,
            camera: cameraState,
            ctx: dynamicCtx,
            width: worldWidth,
            height: worldHeight,
            hitMap,
            paintStatic: false,
            paintDynamic: true,
            clearCanvas: false,
            includeEventPayloadInHitMap: false,
            visibleRowStart: dynamicVisibleRowStart,
            visibleRowEnd: dynamicVisibleRowEnd,
            visibleColStart: dynamicVisibleColStart,
            visibleColEnd: dynamicVisibleColEnd,
         });
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, pixelWidth, pixelHeight);
      if (hasStaticLayer) {
         const sourceX = Math.max(
            0,
            Math.min(
               Math.max(0, staticPixelWidth - pixelWidth),
               Math.round(staticSourceOffsetX * dpr),
            ),
         );
         const sourceY = Math.max(
            0,
            Math.min(
               Math.max(0, staticPixelHeight - pixelHeight),
               Math.round(staticSourceOffsetY * dpr),
            ),
         );
         ctx.drawImage(
            staticLayerCanvas,
            sourceX,
            sourceY,
            pixelWidth,
            pixelHeight,
            0,
            0,
            pixelWidth,
            pixelHeight,
         );
      }
      if (hasDynamicLayer) {
         const dynamicSourceX = Math.max(
            0,
            Math.min(
               Math.max(0, dynamicPixelWidth - pixelWidth),
               Math.round(dynamicSourceOffsetX * dpr),
            ),
         );
         const dynamicSourceY = Math.max(
            0,
            Math.min(
               Math.max(0, dynamicPixelHeight - pixelHeight),
               Math.round(dynamicSourceOffsetY * dpr),
            ),
         );
         ctx.drawImage(
            dynamicLayerCanvas,
            dynamicSourceX,
            dynamicSourceY,
            pixelWidth,
            pixelHeight,
            0,
            0,
            pixelWidth,
            pixelHeight,
         );
      } else {
         ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
         ctx.translate(-renderOriginX, -renderOriginY);
         hitMap = buildHitMap ? [] : null;
         drawAll({
            ...scene,
            ...drawOverrides,
            camera: cameraState,
            ctx,
            width: worldWidth,
            height: worldHeight,
            hitMap,
            paintStatic: !hasStaticLayer,
            paintDynamic: true,
            clearCanvas: false,
            includeEventPayloadInHitMap: false,
         });
      }

      let hitMapIncluded = false;
      let hitMapPayload;
      if (buildHitMap) {
         const signature = computeHitMapSignature(hitMap);
         hitMapIncluded =
            forceHitMapTransfer || signature !== lastHitMapSignature;
         if (hitMapIncluded) {
            hitMapPayload = hitMap;
            lastHitMapSignature = signature;
         }
      } else {
         // Când nu construim hitMap (ex: pan/offscreen), forțăm resync la primul draw următor.
         lastHitMapSignature = "";
      }

      self.postMessage({
         type: "draw-complete",
         drawId,
         hitMapIncluded,
         hitMap: hitMapPayload,
      });
   } catch (error) {
      postWorkerError("draw-error", error?.message || error, payload.drawId);
   }
};
