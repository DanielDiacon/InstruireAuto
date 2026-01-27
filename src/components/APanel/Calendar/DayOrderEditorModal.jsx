// src/components/APanel/Calendar/DayOrderEditorModal.jsx
import React, {
   useEffect,
   useMemo,
   useState,
   useCallback,
   useRef,
} from "react";

import {
   DndContext,
   DragOverlay,
   KeyboardSensor,
   PointerSensor,
   useSensor,
   useSensors,
   closestCenter,
} from "@dnd-kit/core";
import {
   SortableContext,
   useSortable,
   arrayMove,
   rectSortingStrategy,
   sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/* ===================== helpers ===================== */

const isPadId = (id) => String(id || "").startsWith("__pad_");

// ✅ local-only “gap/spacer” items
const GAP_PREFIX = "__gap_";
const isGapId = (id) => String(id || "").startsWith(GAP_PREFIX);

const L = "L"; // left list (cu Buiucani)
const R = "R"; // right list (fără Buiucani)
const toDndId = (ctx, realId) => `${ctx}:${String(realId)}`;

function parseDndId(id) {
   const s = String(id ?? "");
   const i = s.indexOf(":");
   if (i === -1) return { ctx: "", realId: s };
   return { ctx: s.slice(0, i), realId: s.slice(i + 1) };
}

/* ===== order token helpers: "12XXX" ===== */

const MAX_GAPS_AFTER = 40;

function parseOrderToken(v) {
   const s = String(v ?? "").trim();
   if (!s) return { pos: Number.POSITIVE_INFINITY, gapsAfter: 0, raw: s };

   // "12XXX"
   let m = s.match(/^(\d+)([xX]+)$/);
   if (m) {
      const pos = Math.max(1, parseInt(m[1], 10));
      const gapsAfter = Math.max(0, Math.min(MAX_GAPS_AFTER, m[2].length));
      return { pos, gapsAfter, raw: s };
   }

   // "12"
   m = s.match(/^(\d+)$/);
   if (m) {
      const pos = Math.max(1, parseInt(m[1], 10));
      return { pos, gapsAfter: 0, raw: s };
   }

   // fallback numeric-ish
   const n = Number(s);
   if (Number.isFinite(n) && n > 0) {
      return { pos: Math.max(1, Math.round(n)), gapsAfter: 0, raw: s };
   }

   return { pos: Number.POSITIVE_INFINITY, gapsAfter: 0, raw: s };
}

function encodeOrderToken(pos, gapsAfter = 0) {
   const p = Math.max(1, Math.trunc(Number(pos) || 1));
   const g = Math.max(
      0,
      Math.min(MAX_GAPS_AFTER, Math.trunc(Number(gapsAfter) || 0)),
   );
   return g > 0 ? `${p}${"X".repeat(g)}` : String(p);
}

/* ===== car meta helpers ===== */

function pickPlate(car) {
   return String(
      car?.plateNumber ??
         car?.plate ??
         car?.plate_number ??
         car?.registrationNumber ??
         car?.regNumber ??
         "",
   ).trim();
}

function pickGearbox(car) {
   const raw = String(
      car?.gearbox ??
         car?.gearBox ??
         car?.transmission ??
         car?.gear_box ??
         car?.gear ??
         "",
   ).trim();

   const v = raw.toLowerCase();
   if (!v) return "";

   if (v.includes("auto")) return "Automat";
   if (v.includes("man")) return "Manual";

   return raw;
}

function buildCarMeta(car) {
   const g = pickGearbox(car);
   const p = pickPlate(car);
   if (g && p) return `${g} • ${p}`;
   if (g) return g;
   if (p) return p;
   return "";
}

/* ===== instructor helpers ===== */

function safeName(inst) {
   const n = String(inst?.name || "").trim();
   if (n) return n;
   const f = String(inst?.firstName || "").trim();
   const l = String(inst?.lastName || "").trim();
   const v = `${f} ${l}`.trim();
   return v || "—";
}

function normalizeOrder(v) {
   const { pos } = parseOrderToken(v);
   return Number.isFinite(pos) && pos > 0 ? pos : Number.POSITIVE_INFINITY;
}

function sortLikeCurrent(insts) {
   return (insts || []).slice().sort((a, b) => {
      const ao = normalizeOrder(a?.order);
      const bo = normalizeOrder(b?.order);
      if (ao !== bo) return ao - bo;

      const an = safeName(a).toLowerCase();
      const bn = safeName(b).toLowerCase();
      if (an !== bn) return an < bn ? -1 : 1;

      return String(a?.id || "").localeCompare(String(b?.id || ""));
   });
}

function sectorKey(inst) {
   const raw = inst?.sector ?? inst?.groupSector ?? "";
   return String(raw || "").toLowerCase();
}

function sectorCanon(inst) {
   const s = sectorKey(inst);
   if (s.includes("bui")) return "buiucani";
   if (s.includes("bot")) return "botanica";
   if (s.includes("cio")) return "ciocana";
   return "other";
}

function sectorClass(inst) {
   const k = sectorCanon(inst);
   if (k === "buiucani") return "is-buiucani";
   if (k === "botanica") return "is-botanica";
   if (k === "ciocana") return "is-ciocana";
   return "is-other";
}

function isBuiucani(inst) {
   const s = sectorKey(inst);
   return s.includes("bui");
}

/* ===================== Sortable item (editor pane) ===================== */

function SortableCard({ dndId, inst, carMeta }) {
   const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
   } = useSortable({ id: dndId });

   const secCls = sectorClass(inst);

   const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.25 : 1,
   };

   return (
      <div
         ref={setNodeRef}
         className={
            "dv-order-card" + (isDragging ? " is-dragging" : "") + " " + secCls
         }
         style={style}
         {...attributes}
         {...listeners}
      >
         <div className="dv-order-card__top">
            <div className="dv-order-card__handle" aria-hidden="true">
               ⋮⋮
            </div>
            <div className="dv-order-card__title">
               <div className="dv-order-card__name">{safeName(inst)}</div>
               <div className="dv-order-card__sub">
                  {carMeta ? (
                     <span className="dv-order-card__car" title={carMeta}>
                        {carMeta}
                     </span>
                  ) : null}
               </div>
            </div>
         </div>
      </div>
   );
}

/* ✅ Sortable Preview card (right side) */
function SortablePreviewCard({ dndId, inst, carMeta }) {
   const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
   } = useSortable({ id: dndId });

   const secCls = sectorClass(inst);

   const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.25 : 1,
   };

   return (
      <div
         ref={setNodeRef}
         className={"dv-order-card is-preview " + secCls}
         style={style}
         {...attributes}
         {...listeners}
      >
         <div className="dv-order-card__top">
            <div className="dv-order-card__handle" aria-hidden="true">
               ⋮⋮
            </div>

            <div className="dv-order-card__title">
               <div className="dv-order-card__name">{safeName(inst)}</div>
               <div className="dv-order-card__sub">
                  {carMeta ? (
                     <span className="dv-order-card__car" title={carMeta}>
                        {carMeta}
                     </span>
                  ) : null}
               </div>
            </div>
         </div>
      </div>
   );
}

/* ✅ GAP (spacer) card */
function SortableGapCard({ dndId, preview = false, onRemove }) {
   const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
   } = useSortable({ id: dndId });

   const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.25 : 1,
   };

   return (
      <div
         ref={setNodeRef}
         className={
            "dv-order-card dv-order-card--gap" +
            (preview ? " is-preview" : "") +
            (isDragging ? " is-dragging" : "")
         }
         style={style}
         {...attributes}
         {...listeners}
         title="Spațiu (element gol) — trage-l sau șterge-l"
      >
         <div className="dv-order-card__top">
            <div className="dv-order-card__handle" aria-hidden="true">
               ⋮⋮
            </div>

            <div className="dv-order-card__title">
               <div className="dv-order-card__name">Spațiu</div>
               <div className="dv-order-card__sub">
                  <span className="dv-order-card__car" style={{ opacity: 0.7 }}>
                     element gol
                  </span>
               </div>
            </div>

            <button
               type="button"
               className="dv-order-card__handle"
               title="Șterge spațiul"
               onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemove?.();
               }}
               onPointerDown={(e) => e.stopPropagation()}
            >
               {"✕\u00A0"}
            </button>
         </div>
      </div>
   );
}

/* ✅ Add-gap card (not sortable) */
function AddGapCard({ onAdd }) {
   return (
      <button
         type="button"
         className="dv-order-card dv-order-card--add"
         title="Adaugă un spațiu (element gol)"
         onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAdd?.();
         }}
      >
         <div className="dv-order-card__top">
            <div className="dv-order-card__handle" aria-hidden="true">
               ✢
            </div>
            <div className="dv-order-card__title">
               <div className="dv-order-card__name">Adaugă spațiu</div>
               <div className="dv-order-card__sub">
                  <span className="dv-order-card__car" style={{ opacity: 0.7 }}>
                     pentru “salturi” în ordine
                  </span>
               </div>
            </div>
         </div>
      </button>
   );
}

function OverlayCard({ inst, carMeta }) {
   if (!inst) return null;
   const secCls = sectorClass(inst);

   return (
      <div className={"dv-order-card dv-order-card--overlay " + secCls}>
         <div className="dv-order-card__top">
            <div className="dv-order-card__handle" aria-hidden="true">
               ⋮⋮
            </div>

            <div className="dv-order-card__title">
               <div className="dv-order-card__name">{safeName(inst)}</div>
               <div className="dv-order-card__sub">
                  {carMeta ? (
                     <span className="dv-order-card__car" title={carMeta}>
                        {carMeta}
                     </span>
                  ) : null}
               </div>
            </div>
         </div>
      </div>
   );
}

function OverlayGap() {
   return (
      <div className="dv-order-card dv-order-card--overlay dv-order-card--gap">
         <div className="dv-order-card__top">
            <div className="dv-order-card__handle" aria-hidden="true">
               ⋮⋮
            </div>
            <div className="dv-order-card__title">
               <div className="dv-order-card__name">Spațiu</div>
               <div className="dv-order-card__sub">
                  <span className="dv-order-card__car" style={{ opacity: 0.7 }}>
                     element gol
                  </span>
               </div>
            </div>
         </div>
      </div>
   );
}

/* ===================== component ===================== */

export default function DayOrderEditorModal({
   open,
   inline = true,
   dayLabel = "",
   instructors = [],
   cars = [],
   onClose,
   onSave,
}) {
   const realInstructors = useMemo(() => {
      const list = Array.isArray(instructors) ? instructors : [];
      return sortLikeCurrent(list.filter((x) => x && !isPadId(x.id)));
   }, [instructors]);

   const [items, setItems] = useState(() => []);
   const [activeDndId, setActiveDndId] = useState(null);

   const didInitRef = useRef(false);

   // ✅ gap id generator (local only)
   const gapSeqRef = useRef(1);
   const makeGapId = useCallback(() => {
      const id = `${GAP_PREFIX}${gapSeqRef.current}`;
      gapSeqRef.current += 1;
      return id;
   }, []);

   const byId = useMemo(() => {
      const m = new Map();
      realInstructors.forEach((i) => {
         const id = String(i?.id || "");
         if (id) m.set(id, i);
      });
      return m;
   }, [realInstructors]);

   const carMetaByInstructorId = useMemo(() => {
      const m = new Map();

      (cars || []).forEach((car) => {
         const iid = String(
            car?.instructorId ?? car?.instructor_id ?? "",
         ).trim();
         if (!iid) return;

         const meta = buildCarMeta(car);
         if (meta) m.set(iid, meta);
      });

      return m;
   }, [cars]);

   const getCarMetaForInst = useCallback(
      (inst) => {
         const iid = String(inst?.id ?? "").trim();
         if (!iid) return "";
         return carMetaByInstructorId.get(iid) || "";
      },
      [carMetaByInstructorId],
   );

   /**
    * ✅ Inițializare:
    * - construim slots după pos (din token "posXXX")
    * - apoi EXPAND: după fiecare instructor adăugăm gapsAfter gap-uri (local)
    */
   const buildInitialItems = useCallback(() => {
      const list = Array.isArray(realInstructors) ? realInstructors : [];

      // meta map: id -> {pos,gapsAfter}
      const metaById = new Map();
      for (const inst of list) {
         const id = String(inst?.id || "").trim();
         if (!id) continue;
         metaById.set(id, parseOrderToken(inst?.order));
      }

      const rows = list
         .map((x) => ({
            id: String(x?.id || "").trim(),
            order: normalizeOrder(x?.order), // doar pos
            name: safeName(x).toLowerCase(),
         }))
         .filter((x) => x.id);

      const finite = rows
         .filter(
            (x) =>
               Number.isFinite(x.order) && x.order !== Number.POSITIVE_INFINITY,
         )
         .map((x) => ({ ...x, order: Math.max(1, Math.trunc(x.order)) }))
         .sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            if (a.name !== b.name) return a.name < b.name ? -1 : 1;
            return String(a.id).localeCompare(String(b.id));
         });

      if (!finite.length) {
         // fallback: în ordinea curentă sortLikeCurrent + expand
         const base = rows.map((x) => x.id);
         const expanded = [];
         for (const id of base) {
            expanded.push(id);
            const meta = metaById.get(String(id));
            const g = meta?.gapsAfter || 0;
            for (let k = 0; k < g; k += 1) expanded.push(makeGapId());
         }
         return expanded;
      }

      const rawMax = Math.max(...finite.map((x) => x.order));
      const MAX_MATERIALIZED = 160;
      const maxOrder = Math.min(rawMax, MAX_MATERIALIZED);

      const slots = Array.from({ length: maxOrder }, () => makeGapId());

      const placed = new Set();
      const overflow = [];

      for (const r of finite) {
         if (placed.has(r.id)) {
            overflow.push(r.id);
            continue;
         }

         const idx = r.order - 1;
         if (idx < 0 || idx >= slots.length) {
            overflow.push(r.id);
            continue;
         }

         if (!isGapId(slots[idx])) {
            overflow.push(r.id);
            continue;
         }

         slots[idx] = r.id;
         placed.add(r.id);
      }

      const remaining = rows
         .map((x) => x.id)
         .filter((id) => !placed.has(id) && !overflow.includes(id));

      const resultIds = [...slots, ...overflow, ...remaining];

      // ✅ EXPAND după token gapsAfter: "1XXX"
      const expanded = [];
      for (const id of resultIds) {
         expanded.push(id);

         if (isGapId(id)) continue;

         const meta = metaById.get(String(id));
         const g = meta?.gapsAfter || 0;
         for (let k = 0; k < g; k += 1) expanded.push(makeGapId());
      }

      return expanded;
   }, [realInstructors, makeGapId]);

   useEffect(() => {
      if (!open) {
         didInitRef.current = false;
         setActiveDndId(null);
         gapSeqRef.current = 1;
         return;
      }
      if (didInitRef.current) return;

      didInitRef.current = true;
      setItems(buildInitialItems());
   }, [open, buildInitialItems]);

   // ✅ right list ids (fără Buiucani) derivată din items
   const noBuiIds = useMemo(() => {
      return (items || []).filter((id) => {
         if (isGapId(id)) return true;
         const inst = byId.get(String(id));
         if (!inst) return true;
         return !isBuiucani(inst);
      });
   }, [items, byId]);

   // ✅ DnD ids (unique) per list
   const leftDndIds = useMemo(() => items.map((id) => toDndId(L, id)), [items]);
   const rightDndIds = useMemo(
      () => noBuiIds.map((id) => toDndId(R, id)),
      [noBuiIds],
   );

   const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
      useSensor(KeyboardSensor, {
         coordinateGetter: sortableKeyboardCoordinates,
      }),
   );

   const handleDragStart = useCallback((event) => {
      const id = event?.active?.id != null ? String(event.active.id) : null;
      setActiveDndId(id);
   }, []);

   const handleDragCancel = useCallback(() => setActiveDndId(null), []);

   const handleDragEnd = useCallback(
      (event) => {
         const aRaw =
            event?.active?.id != null ? String(event.active.id) : null;
         const oRaw = event?.over?.id != null ? String(event.over.id) : null;

         setActiveDndId(null);

         if (!aRaw || !oRaw || aRaw === oRaw) return;

         const a = parseDndId(aRaw);
         const o = parseDndId(oRaw);

         // nu permitem mutare între liste (stânga <-> dreapta)
         if (!a.ctx || a.ctx !== o.ctx) return;

         // ===== LEFT: reorder direct pe items (toți, inclusiv Bui + gaps)
         if (a.ctx === L) {
            setItems((prev) => {
               const prevDnd = prev.map((id) => toDndId(L, id));
               const oldIndex = prevDnd.indexOf(aRaw);
               const newIndex = prevDnd.indexOf(oRaw);
               if (oldIndex === -1 || newIndex === -1) return prev;

               const nextDnd = arrayMove(prevDnd, oldIndex, newIndex);
               return nextDnd.map((x) => parseDndId(x).realId);
            });
            return;
         }

         // ===== RIGHT: reorder DOAR subsetul "fără Buiucani" în items (gaps incluse)
         if (a.ctx === R) {
            setItems((prev) => {
               const prevNoBui = prev.filter((id) => {
                  if (isGapId(id)) return true;
                  const inst = byId.get(String(id));
                  if (!inst) return true;
                  return !isBuiucani(inst);
               });

               const prevNoBuiDnd = prevNoBui.map((id) => toDndId(R, id));
               const oldIndex = prevNoBuiDnd.indexOf(aRaw);
               const newIndex = prevNoBuiDnd.indexOf(oRaw);
               if (oldIndex === -1 || newIndex === -1) return prev;

               const nextNoBuiDnd = arrayMove(prevNoBuiDnd, oldIndex, newIndex);
               const nextNoBui = nextNoBuiDnd.map((x) => parseDndId(x).realId);

               // reconstruim items: păstrăm Buiucani pe pozițiile lor,
               // înlocuim în ordine doar non-Buiucani (gaps incluse)
               let p = 0;
               return prev.map((id) => {
                  if (isGapId(id)) return nextNoBui[p++] ?? id;

                  const inst = byId.get(String(id));
                  if (inst && isBuiucani(inst)) return id;

                  const repl = nextNoBui[p++];
                  return repl ?? id;
               });
            });
         }
      },
      [byId],
   );

   const addGap = useCallback(() => {
      setItems((prev) => [...prev, makeGapId()]);
   }, [makeGapId]);

   const removeGap = useCallback((gapId) => {
      const gid = String(gapId || "");
      if (!isGapId(gid)) return;
      setItems((prev) => prev.filter((x) => x !== gid));
   }, []);

   const handleSave = useCallback(() => {
      const overrides = new Map(); // id -> forcedPos

      // 1) Bui trage vecinul imediat din dreapta dacă:
      //    - next NU e gap
      //    - next NU e Bui
      for (let i = 0; i < (items || []).length; i += 1) {
         const curId = String(items?.[i] ?? "");
         if (!curId || isGapId(curId)) continue;

         const curInst = byId.get(curId);
         if (!curInst || !isBuiucani(curInst)) continue;

         const nextId = String(items?.[i + 1] ?? "");
         if (!nextId || isGapId(nextId)) continue;

         const nextInst = byId.get(nextId);
         if (!nextInst) continue;

         if (!isBuiucani(nextInst)) {
            overrides.set(nextId, i + 1); // aceeași poziție ca Bui (index vizual)
         }
      }

      // 2) numărăm gap-urile consecutive DUPĂ fiecare instructor (pentru XXX)
      const gapsAfter = new Map(); // id -> count
      for (let i = 0; i < (items || []).length; i += 1) {
         const id = String(items?.[i] ?? "");
         if (!id || isGapId(id)) continue;

         let c = 0;
         for (let j = i + 1; j < items.length; j += 1) {
            const nid = String(items[j] ?? "");
            if (isGapId(nid)) c += 1;
            else break;
         }
         gapsAfter.set(id, c);
      }

      // 3) changes: order devine STRING "posXXX"
      const changes = [];

      (items || []).forEach((id, idx) => {
         const realId = String(id || "");
         if (!realId || isGapId(realId)) return;

         const inst = byId.get(realId);
         if (!inst) return;

         const basePos = idx + 1; // poziție vizuală (include gaps)
         const pos = overrides.get(realId) ?? basePos;

         const g = gapsAfter.get(realId) || 0;
         const order = encodeOrderToken(pos, g);

         changes.push({ id: realId, order });
      });

      // eslint-disable-next-line no-console
      console.log("[OrderEditor] SAVE tokenized", {
         items: [...(items || [])],
         overrides: Object.fromEntries(overrides.entries()),
         changes,
      });

      try {
         onSave?.(changes);
      } catch (e) {
         console.warn("DayOrderEditorModal onSave error:", e);
      }
   }, [items, onSave, byId]);

   if (!open) return null;

   const overlayParsed = activeDndId ? parseDndId(activeDndId) : null;
   const overlayRealId = overlayParsed?.realId
      ? String(overlayParsed.realId)
      : "";
   const overlayIsGap = overlayRealId && isGapId(overlayRealId);
   const overlayInst =
      overlayRealId && !overlayIsGap ? byId.get(overlayRealId) : null;
   const overlayCarMeta = overlayInst ? getCarMetaForInst(overlayInst) : "";

   return (
      <div
         className={
            "dv-order-editor" + (inline ? " dv-order-editor--inline" : "")
         }
         data-dv-interactive="1"
         style={{ width: "100%", height: "100%" }}
         onClick={(e) => e.stopPropagation()}
         onPointerDown={(e) => e.stopPropagation()}
      >
         <div className="dv-order-editor__panel">
            <div className="dv-order-editor__top">
               <div className="dv-order-editor__title">{dayLabel || ""}</div>

               <div className="dv-order-editor__actions">
                  <button
                     type="button"
                     className="dv-order-btn dv-order-btn--ghost"
                     onClick={() => onClose?.()}
                  >
                     Închide
                  </button>

                  <button
                     type="button"
                     className="dv-order-btn dv-order-btn--primary"
                     onClick={handleSave}
                  >
                     Salvează
                  </button>
               </div>
            </div>

            <DndContext
               sensors={sensors}
               collisionDetection={closestCenter}
               onDragStart={handleDragStart}
               onDragEnd={handleDragEnd}
               onDragCancel={handleDragCancel}
            >
               <div className="dv-order-day-wrapper">
                  {/* ===================== LEFT ===================== */}
                  <div className="dv-order-day">
                     <div className="dv-order-day__head">
                        <div className="dv-order-day__title">
                           Marți • Joi • Duminică{" "}
                           <span className="dv-order-day__sub">
                              cu Buiucani
                           </span>
                        </div>
                     </div>

                     <div className="dv-order-day__body">
                        <SortableContext
                           items={leftDndIds}
                           strategy={rectSortingStrategy}
                        >
                           <div className="dv-order-grid dv-order-grid--3">
                              {items.map((realId) => {
                                 if (isGapId(realId)) {
                                    return (
                                       <SortableGapCard
                                          key={toDndId(L, realId)}
                                          dndId={toDndId(L, realId)}
                                          onRemove={() => removeGap(realId)}
                                       />
                                    );
                                 }

                                 const inst = byId.get(String(realId));
                                 if (!inst) return null;

                                 return (
                                    <SortableCard
                                       key={toDndId(L, realId)}
                                       dndId={toDndId(L, realId)}
                                       inst={inst}
                                       carMeta={getCarMetaForInst(inst)}
                                    />
                                 );
                              })}

                              <AddGapCard onAdd={addGap} />
                           </div>
                        </SortableContext>
                     </div>
                  </div>

                  {/* ===================== RIGHT ===================== */}
                  <div className="dv-order-day">
                     <div className="dv-order-day__head">
                        <div className="dv-order-day__title">
                           Restul zilelor{" "}
                           <span className="dv-order-day__sub">
                              fără Buiucani
                           </span>
                        </div>
                     </div>

                     <div className="dv-order-day__body">
                        <SortableContext
                           items={rightDndIds}
                           strategy={rectSortingStrategy}
                        >
                           <div className="dv-order-grid dv-order-grid--3 is-preview">
                              {noBuiIds.map((realId) => {
                                 if (isGapId(realId)) {
                                    return (
                                       <SortableGapCard
                                          key={toDndId(R, realId)}
                                          dndId={toDndId(R, realId)}
                                          preview
                                          onRemove={() => removeGap(realId)}
                                       />
                                    );
                                 }

                                 const inst = byId.get(String(realId));
                                 if (!inst) return null;

                                 return (
                                    <SortablePreviewCard
                                       key={toDndId(R, realId)}
                                       dndId={toDndId(R, realId)}
                                       inst={inst}
                                       carMeta={getCarMetaForInst(inst)}
                                    />
                                 );
                              })}
                           </div>
                        </SortableContext>
                     </div>
                  </div>
               </div>

               <DragOverlay
                  dropAnimation={{ duration: 160, easing: "ease-out" }}
               >
                  {overlayIsGap ? (
                     <OverlayGap />
                  ) : overlayInst ? (
                     <OverlayCard inst={overlayInst} carMeta={overlayCarMeta} />
                  ) : null}
               </DragOverlay>
            </DndContext>
         </div>
      </div>
   );
}
