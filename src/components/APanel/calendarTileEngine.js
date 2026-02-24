const clampInt = (value, min, max) => {
   if (!Number.isFinite(value)) return min;
   if (value < min) return min;
   if (value > max) return max;
   return value;
};

const safeNow = () => {
   if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
   }
   return Date.now();
};

export function createHorizontalTileEngineState() {
   return {
      cache: new Map(),
      lastViewportLeft: 0,
      direction: 0,
      signature: "",
   };
}

export function resetHorizontalTileEngineState(state) {
   if (!state || typeof state !== "object") return;
   if (state.cache instanceof Map) state.cache.clear();
   state.lastViewportLeft = 0;
   state.direction = 0;
   state.signature = "";
}

export function computeHorizontalTileWindow(state, options = {}) {
   const engine =
      state && typeof state === "object"
         ? state
         : createHorizontalTileEngineState();
   const cache = engine.cache instanceof Map ? engine.cache : new Map();
   engine.cache = cache;

   const totalItems = Math.max(0, Math.trunc(Number(options.totalItems) || 0));
   const itemWidthPx = Math.max(1, Number(options.itemWidthPx) || 1);
   const viewportLeft = Math.max(0, Number(options.viewportLeft) || 0);
   const viewportWidth = Math.max(0, Number(options.viewportWidth) || 0);
   const itemsPerTile = Math.max(1, Math.trunc(Number(options.itemsPerTile) || 1));
   const baseOverscanTiles = Math.max(
      0,
      Math.trunc(Number(options.baseOverscanTiles) || 0),
   );
   const panOverscanTiles = Math.max(
      baseOverscanTiles,
      Math.trunc(Number(options.panOverscanTiles) || baseOverscanTiles),
   );
   const idlePrefetchTiles = Math.max(
      0,
      Math.trunc(Number(options.idlePrefetchTiles) || 0),
   );
   const panPrefetchTiles = Math.max(
      idlePrefetchTiles,
      Math.trunc(Number(options.panPrefetchTiles) || idlePrefetchTiles),
   );
   const directionEpsilonPx = Math.max(
      0,
      Number(options.directionEpsilonPx) || 6,
   );
   const keepAliveMs = Math.max(0, Number(options.keepAliveMs) || 0);
   const maxCacheTiles = Math.max(1, Math.trunc(Number(options.maxCacheTiles) || 12));
   const isInteracting = !!options.isInteracting;
   const nowMs = Number.isFinite(Number(options.nowMs))
      ? Number(options.nowMs)
      : safeNow();

   const signature = `${totalItems}|${itemWidthPx.toFixed(3)}|${itemsPerTile}`;
   if (engine.signature !== signature) {
      cache.clear();
      engine.direction = 0;
      engine.lastViewportLeft = viewportLeft;
      engine.signature = signature;
   }

   const totalTiles = Math.ceil(totalItems / itemsPerTile);
   if (totalTiles <= 0) {
      return {
         itemsPerTile,
         totalTiles: 0,
         activeTileStart: 0,
         activeTileEnd: -1,
         direction: 0,
         visibleTiles: new Set(),
      };
   }

   const prevViewportLeft = Number.isFinite(Number(engine.lastViewportLeft))
      ? Number(engine.lastViewportLeft)
      : viewportLeft;
   const deltaX = viewportLeft - prevViewportLeft;
   engine.lastViewportLeft = viewportLeft;
   if (Math.abs(deltaX) >= directionEpsilonPx) {
      engine.direction = deltaX > 0 ? 1 : -1;
   }

   const overscanTiles = isInteracting ? panOverscanTiles : baseOverscanTiles;
   const tileWidthPx = Math.max(1, itemWidthPx * itemsPerTile);

   let activeTileStart = 0;
   let activeTileEnd = Math.min(totalTiles - 1, Math.max(1, overscanTiles + 1));
   if (viewportWidth > 0) {
      const viewLeft = Math.max(0, viewportLeft);
      const viewRight = viewLeft + viewportWidth;
      activeTileStart = clampInt(
         Math.floor(viewLeft / tileWidthPx) - overscanTiles,
         0,
         totalTiles - 1,
      );
      activeTileEnd = clampInt(
         Math.floor(Math.max(0, viewRight - 1) / tileWidthPx) + overscanTiles,
         activeTileStart,
         totalTiles - 1,
      );
   }

   const leadPrefetchTiles = isInteracting ? panPrefetchTiles : idlePrefetchTiles;
   const tailPrefetchTiles = Math.max(0, idlePrefetchTiles);
   if (engine.direction > 0) {
      activeTileEnd = clampInt(
         activeTileEnd + leadPrefetchTiles,
         activeTileStart,
         totalTiles - 1,
      );
      activeTileStart = clampInt(activeTileStart - tailPrefetchTiles, 0, activeTileEnd);
   } else if (engine.direction < 0) {
      activeTileStart = clampInt(
         activeTileStart - leadPrefetchTiles,
         0,
         activeTileEnd,
      );
      activeTileEnd = clampInt(activeTileEnd + tailPrefetchTiles, activeTileStart, totalTiles - 1);
   } else if (idlePrefetchTiles > 0) {
      activeTileStart = clampInt(activeTileStart - idlePrefetchTiles, 0, activeTileEnd);
      activeTileEnd = clampInt(activeTileEnd + idlePrefetchTiles, activeTileStart, totalTiles - 1);
   }

   for (let tileIdx = activeTileStart; tileIdx <= activeTileEnd; tileIdx += 1) {
      cache.set(tileIdx, nowMs);
   }

   if (keepAliveMs > 0) {
      for (const [tileIdx, seenAt] of cache.entries()) {
         if (tileIdx >= activeTileStart && tileIdx <= activeTileEnd) continue;
         if (nowMs - (Number(seenAt) || 0) > keepAliveMs) {
            cache.delete(tileIdx);
         }
      }
   }

   const minKeepTiles = activeTileEnd - activeTileStart + 1;
   const effectiveMaxTiles = Math.max(maxCacheTiles, minKeepTiles);
   if (cache.size > effectiveMaxTiles) {
      const candidates = [];
      for (const [tileIdx, seenAt] of cache.entries()) {
         if (tileIdx >= activeTileStart && tileIdx <= activeTileEnd) continue;
         candidates.push([tileIdx, Number(seenAt) || 0]);
      }
      candidates.sort((a, b) => a[1] - b[1]);
      let extra = cache.size - effectiveMaxTiles;
      for (let i = 0; i < candidates.length && extra > 0; i += 1) {
         cache.delete(candidates[i][0]);
         extra -= 1;
      }
   }

   return {
      itemsPerTile,
      totalTiles,
      activeTileStart,
      activeTileEnd,
      direction: engine.direction || 0,
      visibleTiles: new Set(cache.keys()),
   };
}
