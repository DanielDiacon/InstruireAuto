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

// local-only “gap/spacer” items (DOAR UI)
const GAP_PREFIX_L = "__gapL_";
const GAP_PREFIX_R = "__gapR_";
const isGapId = (id) => {
   const s = String(id || "");
   return s.startsWith(GAP_PREFIX_L) || s.startsWith(GAP_PREFIX_R);
};

const L = "L"; // left list (Marți/Joi/Duminică) cu Buiucani
const R = "R"; // right list (restul zilelor) fără Buiucani
const toDndId = (ctx, realId) => `${ctx}:${String(realId)}`;

function parseDndId(id) {
   const s = String(id ?? "");
   const i = s.indexOf(":");
   if (i === -1) return { ctx: "", realId: s };
   return { ctx: s.slice(0, i), realId: s.slice(i + 1) };
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

function sectorKey(inst) {
   const raw = inst?.sector ?? inst?.groupSector ?? "";
   return String(raw || "").toLowerCase();
}

function isBuiucani(inst) {
   return sectorKey(inst).includes("bui");
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

function parseDualOrder(v) {
   const s = String(v ?? "").trim();
   if (!s) return { a: Number.POSITIVE_INFINITY, b: Number.POSITIVE_INFINITY };

   const parts = s.split(/x/i);
   const left = (parts[0] ?? "").trim();
   const right = (parts[1] ?? "").trim();

   const parseSide = (t) => {
      const m = String(t || "").match(/^(\d+)/);
      if (!m) return Number.POSITIVE_INFINITY;
      const n = parseInt(m[1], 10);
      return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
   };

   let a = parseSide(left);
   let b = parseSide(right);

   // compatibilitate: "6" sau "6X" => b=a ; "X7" => a=b
   if (!Number.isFinite(a) && Number.isFinite(b)) a = b;
   if (Number.isFinite(a) && !Number.isFinite(b)) b = a;

   return { a, b };
}

/* ===================== Sortable item ===================== */

function SortableCard({ dndId, inst, carMeta, preview = false }) {
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
            "dv-order-card" +
            (preview ? " is-preview" : "") +
            (isDragging ? " is-dragging" : "") +
            " " +
            secCls
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
                     (nu se salvează ca obiect)
                  </span>
               </div>
            </div>
         </div>
      </button>
   );
}

function OverlayCard({ inst, carMeta, isGap }) {
   if (isGap) {
      return (
         <div className="dv-order-card dv-order-card--overlay dv-order-card--gap">
            <div className="dv-order-card__top">
               <div className="dv-order-card__handle" aria-hidden="true">
                  ⋮⋮
               </div>
               <div className="dv-order-card__title">
                  <div className="dv-order-card__name">Spațiu</div>
                  <div className="dv-order-card__sub">
                     <span
                        className="dv-order-card__car"
                        style={{ opacity: 0.7 }}
                     >
                        element gol
                     </span>
                  </div>
               </div>
            </div>
         </div>
      );
   }

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
      return list.filter((x) => x && !isPadId(x.id));
   }, [instructors]);

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

   // ✅ gap generators (independent)
   const gapSeqL = useRef(1);
   const gapSeqR = useRef(1);

   const makeGapId = useCallback((ctx) => {
      if (ctx === L) {
         const id = `${GAP_PREFIX_L}${gapSeqL.current}`;
         gapSeqL.current += 1;
         return id;
      }
      const id = `${GAP_PREFIX_R}${gapSeqR.current}`;
      gapSeqR.current += 1;
      return id;
   }, []);

   const [itemsA, setItemsA] = useState([]);
   const [itemsB, setItemsB] = useState([]);
   const [activeDndId, setActiveDndId] = useState(null);

   const didInitRef = useRef(false);

   const buildList = useCallback(
      (ctx) => {
         const listAll = Array.isArray(realInstructors) ? realInstructors : [];

         const list =
            ctx === R ? listAll.filter((inst) => !isBuiucani(inst)) : listAll;

         const rows = list
            .map((inst) => {
               const id = String(inst?.id || "").trim();
               if (!id) return null;
               const { a, b } = parseDualOrder(inst?.order);
               const ord = ctx === R ? b : a;
               return {
                  id,
                  ord,
                  name: safeName(inst).toLowerCase(),
               };
            })
            .filter(Boolean);

         const finite = rows
            .filter((x) => Number.isFinite(x.ord))
            .map((x) => ({ ...x, ord: Math.max(1, Math.trunc(x.ord)) }))
            .sort((a, b) => {
               if (a.ord !== b.ord) return a.ord - b.ord;
               if (a.name !== b.name) return a.name < b.name ? -1 : 1;
               return String(a.id).localeCompare(String(b.id));
            });

         if (!finite.length) {
            return rows.map((x) => x.id);
         }

         const rawMax = Math.max(...finite.map((x) => x.ord));
         const MAX_MATERIALIZED = 160;
         const maxOrd = Math.min(rawMax, MAX_MATERIALIZED);

         const slots = Array.from({ length: maxOrd }, () => makeGapId(ctx));

         const placed = new Set();
         const overflow = [];

         for (const r of finite) {
            if (placed.has(r.id)) {
               overflow.push(r.id);
               continue;
            }
            const idx = r.ord - 1;
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

         return [...slots, ...overflow, ...remaining];
      },
      [realInstructors, makeGapId],
   );

   useEffect(() => {
      if (!open) {
         didInitRef.current = false;
         setActiveDndId(null);
         setItemsA([]);
         setItemsB([]);
         gapSeqL.current = 1;
         gapSeqR.current = 1;
         return;
      }
      if (didInitRef.current) return;

      didInitRef.current = true;
      setItemsA(buildList(L));
      setItemsB(buildList(R));
   }, [open, buildList]);

   const leftDndIds = useMemo(
      () => (itemsA || []).map((id) => toDndId(L, id)),
      [itemsA],
   );
   const rightDndIds = useMemo(
      () => (itemsB || []).map((id) => toDndId(R, id)),
      [itemsB],
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

   const handleDragEnd = useCallback((event) => {
      const aRaw = event?.active?.id != null ? String(event.active.id) : null;
      const oRaw = event?.over?.id != null ? String(event.over.id) : null;

      setActiveDndId(null);
      if (!aRaw || !oRaw || aRaw === oRaw) return;

      const a = parseDndId(aRaw);
      const o = parseDndId(oRaw);
      if (!a.ctx || a.ctx !== o.ctx) return;

      if (a.ctx === L) {
         setItemsA((prev) => {
            const prevDnd = prev.map((id) => toDndId(L, id));
            const oldIndex = prevDnd.indexOf(aRaw);
            const newIndex = prevDnd.indexOf(oRaw);
            if (oldIndex === -1 || newIndex === -1) return prev;
            const nextDnd = arrayMove(prevDnd, oldIndex, newIndex);
            return nextDnd.map((x) => parseDndId(x).realId);
         });
         return;
      }

      if (a.ctx === R) {
         setItemsB((prev) => {
            const prevDnd = prev.map((id) => toDndId(R, id));
            const oldIndex = prevDnd.indexOf(aRaw);
            const newIndex = prevDnd.indexOf(oRaw);
            if (oldIndex === -1 || newIndex === -1) return prev;
            const nextDnd = arrayMove(prevDnd, oldIndex, newIndex);
            return nextDnd.map((x) => parseDndId(x).realId);
         });
      }
   }, []);

   const addGapA = useCallback(
      () => setItemsA((p) => [...p, makeGapId(L)]),
      [makeGapId],
   );
   const addGapB = useCallback(
      () => setItemsB((p) => [...p, makeGapId(R)]),
      [makeGapId],
   );

   const removeGapA = useCallback((gapId) => {
      const gid = String(gapId || "");
      if (!gid.startsWith(GAP_PREFIX_L)) return;
      setItemsA((p) => p.filter((x) => x !== gid));
   }, []);

   const removeGapB = useCallback((gapId) => {
      const gid = String(gapId || "");
      if (!gid.startsWith(GAP_PREFIX_R)) return;
      setItemsB((p) => p.filter((x) => x !== gid));
   }, []);

   const handleSave = useCallback(() => {
      const changes = [];

      // map id -> old a/b
      const oldPairById = new Map();
      realInstructors.forEach((inst) => {
         const id = String(inst?.id || "").trim();
         if (!id) return;
         oldPairById.set(id, parseDualOrder(inst?.order));
      });

      const idxA = new Map();
      (itemsA || []).forEach((id, i) => idxA.set(String(id), i));

      const idxB = new Map();
      (itemsB || []).forEach((id, i) => idxB.set(String(id), i));

      for (const inst of realInstructors) {
         const id = String(inst?.id || "").trim();
         if (!id) continue;

         const old = oldPairById.get(id) || {
            a: Number.POSITIVE_INFINITY,
            b: Number.POSITIVE_INFINITY,
         };

         const posA0 = idxA.has(id) ? idxA.get(id) + 1 : old.a;
         let posB0 = idxB.has(id) ? idxB.get(id) + 1 : old.b;

         // dacă nu există în B (de ex. Buiucani) => păstrăm old.b, iar dacă nu există -> posA
         if (!Number.isFinite(posB0)) posB0 = posA0;

         const orderA = Number.isFinite(posA0)
            ? Math.max(1, Math.trunc(posA0))
            : 1;
         const orderB = Number.isFinite(posB0)
            ? Math.max(1, Math.trunc(posB0))
            : orderA;

         const oldA = Number.isFinite(old.a)
            ? Math.max(1, Math.trunc(old.a))
            : orderA;
         const oldB = Number.isFinite(old.b)
            ? Math.max(1, Math.trunc(old.b))
            : oldA;

         if (oldA === orderA && oldB === orderB) continue;

         changes.push({ id, orderA, orderB });
      }

      // eslint-disable-next-line no-console
      console.log("[OrderEditor] SAVE dual order", {
         itemsA: [...(itemsA || [])],
         itemsB: [...(itemsB || [])],
         changes,
      });

      try {
         onSave?.(changes);
      } catch (e) {
         console.warn("DayOrderEditorModal onSave error:", e);
      }
   }, [itemsA, itemsB, onSave, realInstructors]);

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
                  {/* ===================== LEFT (A) ===================== */}
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
                              {(itemsA || []).map((realId) => {
                                 if (isGapId(realId)) {
                                    return (
                                       <SortableGapCard
                                          key={toDndId(L, realId)}
                                          dndId={toDndId(L, realId)}
                                          onRemove={() => removeGapA(realId)}
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

                              <AddGapCard onAdd={addGapA} />
                           </div>
                        </SortableContext>
                     </div>
                  </div>

                  {/* ===================== RIGHT (B) ===================== */}
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
                              {(itemsB || []).map((realId) => {
                                 if (isGapId(realId)) {
                                    return (
                                       <SortableGapCard
                                          key={toDndId(R, realId)}
                                          dndId={toDndId(R, realId)}
                                          preview
                                          onRemove={() => removeGapB(realId)}
                                       />
                                    );
                                 }

                                 const inst = byId.get(String(realId));
                                 if (!inst) return null;

                                 return (
                                    <SortableCard
                                       key={toDndId(R, realId)}
                                       dndId={toDndId(R, realId)}
                                       inst={inst}
                                       carMeta={getCarMetaForInst(inst)}
                                       preview
                                    />
                                 );
                              })}

                              <AddGapCard onAdd={addGapB} />
                           </div>
                        </SortableContext>
                     </div>
                  </div>
               </div>

               <DragOverlay
                  dropAnimation={{ duration: 160, easing: "ease-out" }}
               >
                  <OverlayCard
                     inst={overlayInst}
                     carMeta={overlayCarMeta}
                     isGap={overlayIsGap}
                  />
               </DragOverlay>
            </DndContext>
         </div>
      </div>
   );
}
