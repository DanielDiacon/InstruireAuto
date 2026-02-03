// src/components/APanel/ReservationHistory.jsx
import React, {
   useMemo,
   useRef,
   useCallback,
   useEffect,
   useState,
} from "react";
import { useDispatch } from "react-redux";

import { openPopup } from "../Utils/popupStore";
import { listenCalendarRefresh } from "../Utils/calendarBus";

import IconButton from "../Common/IconButton";
import UIIcon from "../Common/UIIcon";

import {
   fetchUserReservations,
   fetchReservationsForMonth,
} from "../../store/reservationsSlice";

import { getReservationHistory } from "../../api/reservationsService";

/* ===================== Config ===================== */

const MOLDOVA_TZ = "Europe/Chisinau";
const HISTORY_CACHE_TTL_MS = 25 * 1000;

const PAGE_STEP = 10;
const INITIAL_VISIBLE = 16;

const SCAN_BATCH = 25;
const SCAN_CONCURRENCY = 3;

const MAX_EVENTS_PER_RESERVATION = 12;

/* ===================== Utils ===================== */

const pad2 = (n) => String(n).padStart(2, "0");

const getYearMonthInTZ = (val, tz = MOLDOVA_TZ) => {
   if (!val) return null;
   const d = val instanceof Date ? val : new Date(val);
   if (isNaN(d.getTime())) return null;

   const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
   }).formatToParts(d);

   const y = +(parts.find((p) => p.type === "year")?.value || 0);
   const m = +(parts.find((p) => p.type === "month")?.value || 0);
   if (!y || !m) return null;
   return { year: y, month: m };
};

const fmtIsoDateDMY = (val) => {
   if (!val) return "—";
   if (typeof val === "string") {
      const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[3]} ${m[2]} ${m[1]}`;
      return String(val);
   }
   const d = val instanceof Date ? val : new Date(val);
   if (isNaN(d)) return "—";
   return `${pad2(d.getUTCDate())} ${pad2(d.getUTCMonth() + 1)} ${d.getUTCFullYear()}`;
};

const toFloating = (val) => {
   if (!val) return null;
   if (val instanceof Date) return val;
   const s = String(val || "");
   const m = s.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
   );
   if (m) {
      return new Date(
         +m[1],
         +m[2] - 1,
         +m[3],
         +(m[4] || 0),
         +(m[5] || 0),
         +(m[6] || 0),
         0,
      );
   }
   const d = new Date(s);
   return isNaN(d) ? null : d;
};

const addMinutes = (d, minutes) => new Date(d.getTime() + minutes * 60000);

const HHMM = (d) =>
   new Intl.DateTimeFormat("ro-RO", {
      timeZone: MOLDOVA_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
   }).format(d);

const fmtDateTimeRO = (isoLike) => {
   if (!isoLike) return "";
   const d = new Date(isoLike);
   if (isNaN(d.getTime())) return String(isoLike);
   return d.toLocaleString("ro-RO", {
      dateStyle: "medium",
      timeStyle: "short",
   });
};

const boolish = (v) =>
   v === true ||
   v === 1 ||
   v === "1" ||
   String(v || "").toLowerCase() === "true";

const getIsCancelled = (r) => {
   const direct =
      r?.isCancelled ??
      r?.is_cancelled ??
      r?.isCanceled ??
      r?.is_canceled ??
      null;
   if (direct !== null && direct !== undefined) return boolish(direct);

   const st = String(r?.status || "").toLowerCase();
   return st === "cancelled" || st === "canceled";
};

const getStatus = (r) => {
   const raw = String(r?.status || "").toLowerCase();
   if (raw) return raw;
   if (getIsCancelled(r)) return "cancelled";
   if (boolish(r?.isCompleted ?? r?.is_completed)) return "completed";
   return "pending";
};

const gearboxLabel = (g) => {
   const v = String(g || "").toLowerCase();
   if (!v) return "";
   return v === "automat" ? "Automat" : "Manual";
};

const getReservationId = (r) => {
   const id =
      r?.id ??
      r?._id ??
      r?.reservationId ??
      r?.reservation_id ??
      r?.resId ??
      r?.uuid ??
      null;
   return id == null ? null : String(id);
};

const getStudentId = (r) => {
   const sid =
      r?.userId ??
      r?.studentId ??
      r?.student_id ??
      r?.user?.id ??
      r?.student?.id ??
      r?.clientId ??
      null;
   return sid == null ? null : String(sid);
};

const getStartRawFromAny = (x) =>
   x?.startTime ??
   x?.start ??
   x?.start_time ??
   x?.startedAt ??
   x?.start_at ??
   x?.startDate ??
   x?.start_date ??
   x?.dateTime ??
   x?.datetime ??
   x?.date ??
   x?.begin ??
   x?.__rawReservation?.startTime ??
   x?.__rawReservation?.start ??
   null;

const getCandidateUpdatedAt = (r) =>
   r?.updatedAt ??
   r?.updated_at ??
   r?.modifiedAt ??
   r?.modified_at ??
   r?.lastModified ??
   r?.last_modified ??
   r?.__rawReservation?.updatedAt ??
   r?.__rawReservation?.updated_at ??
   null;

/* ===================== History formatting ===================== */

const FIELD_LABEL = {
   startTime: "Data & ora",
   sector: "Sector",
   gearbox: "Cutie",
   color: "Culoare",
   userId: "Elev",
   instructorId: "Instructor",
   privateMessage: "Notiță",
   isConfirmed: "Confirmare",
   carId: "Mașină",
   instructorsGroupId: "Grup instructori",
   isCancelled: "Anulat",
};

const makeResolvers = (users, instructors, h) => {
   const uById = new Map(
      (users || []).map((u) => [
         String(u.id),
         `${u.firstName || ""} ${u.lastName || ""}`.trim(),
      ]),
   );
   const iById = new Map(
      (instructors || []).map((i) => [
         String(i.id),
         `${i.firstName || ""} ${i.lastName || ""}`.trim(),
      ]),
   );

   if (h?.user?.id) {
      uById.set(
         String(h.user.id),
         `${h.user.firstName || ""} ${h.user.lastName || ""}`.trim(),
      );
   }
   if (h?.instructor?.id) {
      iById.set(
         String(h.instructor.id),
         `${h.instructor.firstName || ""} ${h.instructor.lastName || ""}`.trim(),
      );
   }

   const nameForUserId = (val) =>
      val == null ? "" : uById.get(String(val)) || String(val);
   const nameForInstructorId = (val) =>
      val == null ? "" : iById.get(String(val)) || String(val);

   return { nameForUserId, nameForInstructorId };
};

const fmtValue = (field, value, resolvers) => {
   if (value == null || value === "") return "";
   if (field === "startTime") return fmtDateTimeRO(value);
   if (field === "gearbox") return gearboxLabel(value) || String(value);
   if (field === "userId")
      return resolvers?.nameForUserId
         ? resolvers.nameForUserId(value)
         : String(value);
   if (field === "instructorId")
      return resolvers?.nameForInstructorId
         ? resolvers.nameForInstructorId(value)
         : String(value);
   if (typeof value === "boolean") return value ? "Da" : "Nu";
   return String(value);
};

const buildChangesFromHistoryItem = (h, resolvers) => {
   const action = String(h?.action || "").toUpperCase();
   if (action === "CREATE" || action === "CREATED") return [];

   if (h && h.changedFields && typeof h.changedFields === "object") {
      return Object.entries(h.changedFields)
         .map(([field, diff]) => {
            if (
               diff &&
               typeof diff === "object" &&
               ("from" in diff || "to" in diff)
            ) {
               const from = fmtValue(field, diff.from, resolvers);
               const to = fmtValue(field, diff.to, resolvers);

               // ✅ filtrăm "schimbări" care nu-s schimbări (ex: startTime same → same)
               if (from === to) return null;

               return { field, label: FIELD_LABEL[field] || field, from, to };
            }
            return null;
         })
         .filter(Boolean);
   }

   if (Array.isArray(h?.changes)) {
      return h.changes
         .map((c) => {
            const field = c.field || c.path || "(câmp)";
            const from = fmtValue(field, c.from, resolvers);
            const to = fmtValue(field, c.to ?? c.value, resolvers);
            if (from === to) return null;
            return { field, label: FIELD_LABEL[field] || field, from, to };
         })
         .filter(Boolean);
   }

   return [];
};

const statusFromHistory = (h) => {
   const s = String(h?.status || h?.action || h?.type || "").toUpperCase();
   if (s.includes("CANCEL")) return "cancelled";
   if (s.includes("COMPLETE")) return "completed";
   if (s.includes("CONFIRM")) return "confirmed";
   if (s === "CREATE" || s === "CREATED") return "created";
   if (s === "UPDATE" || s === "UPDATED" || s.includes("EDIT"))
      return "updated";
   return "pending";
};

const historyIconName = (st) => {
   if (st === "updated") return "edit";
   if (st === "created") return "clock";
   if (st === "confirmed" || st === "completed") return "check";
   if (st === "cancelled") return "close";
   return "clock";
};

const HISTORY_BADGE = {
   created: "Creată",
   updated: "Modificată",
   confirmed: "Confirmată",
   completed: "Finalizată",
   cancelled: "Anulată",
   pending: "Modificare",
};

const getHistoryWhenRaw = (h) =>
   h?.timestamp ??
   h?.date ??
   h?.createdAt ??
   h?.updatedAt ??
   h?.time ??
   h?.created_at ??
   h?.updated_at ??
   null;

const getHistoryWhenMs = (h) => {
   const raw = getHistoryWhenRaw(h);
   if (!raw) return 0;
   const d = new Date(raw);
   const ms = d.getTime();
   return Number.isFinite(ms) ? ms : 0;
};

/* ===================== Component ===================== */

function ReservationHistory({
   reservations = [],
   users = [],
   instructors = [],
   durationMinDefault = 90,
   formattedReservations = [],
}) {
   const dispatch = useDispatch();
   const lastFetchedStudentRef = useRef(null);

   // ===== list normalize =====
   const list = useMemo(() => {
      if (formattedReservations?.length) {
         return formattedReservations
            .map((x) => {
               const id = getReservationId(x);
               const studentId = getStudentId(x);

               const startRaw = getStartRawFromAny(x);
               const start = toFloating(startRaw || x.start) || new Date();

               const status = String(getStatus(x) || "pending").toLowerCase();
               const isCancelled = getIsCancelled(x);

               return {
                  ...x,
                  id,
                  studentId,
                  start,
                  startTime: startRaw || null,
                  __rawReservation: x.__rawReservation || x,
                  status,
                  isCancelled,
                  date: x.date ?? (start ? fmtIsoDateDMY(start) : "—"),
                  timeRange:
                     x.timeRange ??
                     (start ? `${HHMM(start)}` : (x.time ?? "—")),
               };
            })
            .filter((x) => !!x.id);
      }

      const uMap = new Map((users || []).map((u) => [String(u.id), u]));
      const iMap = new Map((instructors || []).map((i) => [String(i.id), i]));
      const norm = (x) => (x || "").toString().trim();

      return (reservations || [])
         .map((r) => {
            const id = getReservationId(r);
            const studentId = getStudentId(r);

            const startRaw = getStartRawFromAny(r);
            const start = toFloating(startRaw) || new Date();

            const endRaw =
               r.endTime ??
               r.end ??
               r.end_at ??
               r.endDate ??
               r.end_date ??
               null;

            const end = endRaw
               ? toFloating(endRaw)
               : addMinutes(
                    start,
                    Number(r.durationMinutes ?? durationMinDefault),
                 );

            const u =
               uMap.get(String(r.userId ?? r.studentId ?? "")) ||
               r.user ||
               r.student ||
               null;

            const inst =
               iMap.get(String(r.instructorId ?? r.instructor_id ?? "")) ||
               r.instructor ||
               null;

            const person =
               norm(`${u?.firstName ?? ""} ${u?.lastName ?? ""}`) ||
               norm(r.clientName ?? r.customerName ?? r.name ?? "Anonim");

            const instructorName =
               norm(`${inst?.firstName ?? ""} ${inst?.lastName ?? ""}`) ||
               norm(r.instructorName ?? "Necunoscut");

            const isCancelled = getIsCancelled(r);
            const status = String(getStatus(r) || "pending").toLowerCase();

            return {
               id,
               studentId,
               start,
               startTime: startRaw || null,
               __rawReservation: r,
               end,
               date: fmtIsoDateDMY(startRaw),
               timeRange: `${HHMM(start)} - ${HHMM(end)}`,
               person,
               instructor: instructorName,
               status,
               isCancelled,
            };
         })
         .filter((x) => !!x.id);
   }, [
      reservations,
      users,
      instructors,
      durationMinDefault,
      formattedReservations,
   ]);

   // ===== open popup =====
   const prefetchMonthForReservation = useCallback(
      async (startRawOrDate) => {
         const ym = getYearMonthInTZ(startRawOrDate, MOLDOVA_TZ);
         if (!ym) return;
         try {
            await (dispatch(
               fetchReservationsForMonth({ year: ym.year, month: ym.month }),
            ).unwrap?.() ??
               dispatch(
                  fetchReservationsForMonth({ year: ym.year, month: ym.month }),
               ));
         } catch {
            // soft fail
         }
      },
      [dispatch],
   );

   const openReservation = useCallback(
      async (entry) => {
         const rid = entry?.id ? String(entry.id) : null;
         if (!rid) return;

         const sid = entry?.studentId ? String(entry.studentId) : null;
         if (sid && lastFetchedStudentRef.current !== sid) {
            lastFetchedStudentRef.current = sid;
            dispatch(fetchUserReservations(sid));
         }

         const startRaw = getStartRawFromAny(entry);
         await prefetchMonthForReservation(startRaw || entry?.start || null);

         openPopup("reservationEdit", { reservationId: rid });
      },
      [dispatch, prefetchMonthForReservation],
   );

   // ===================== History cache/load =====================

   const [historyById, setHistoryById] = useState(() => new Map());
   const historyByIdRef = useRef(historyById);
   useEffect(() => {
      historyByIdRef.current = historyById;
   }, [historyById]);

   const cacheRef = useRef(new Map()); // rid -> entry
   const inflightRef = useRef(new Map()); // rid -> Promise

   const loadHistoryFor = useCallback(async (rid, { force = false } = {}) => {
      const id = String(rid ?? "").trim();
      if (!id) return;

      const now = Date.now();
      const cached = cacheRef.current.get(id);

      if (
         !force &&
         cached &&
         now - (cached.fetchedAt || 0) < HISTORY_CACHE_TTL_MS
      ) {
         if (!historyByIdRef.current?.has?.(id)) {
            setHistoryById((prev) => {
               const next = new Map(prev);
               next.set(id, cached);
               return next;
            });
         }
         return;
      }

      if (inflightRef.current.has(id)) return inflightRef.current.get(id);

      setHistoryById((prev) => {
         const next = new Map(prev);
         const prevEntry = next.get(id) || cacheRef.current.get(id) || {};
         next.set(id, { ...prevEntry, loading: true, error: "" });
         return next;
      });

      const p = (async () => {
         try {
            const data = await getReservationHistory(id);
            const items = Array.isArray(data) ? data : data?.items || [];

            items.sort((a, b) => getHistoryWhenMs(b) - getHistoryWhenMs(a));

            const entry = {
               items,
               loading: false,
               error: "",
               fetchedAt: Date.now(),
            };

            cacheRef.current.set(id, entry);
            setHistoryById((prev) => {
               const next = new Map(prev);
               next.set(id, entry);
               return next;
            });
         } catch (e) {
            const entry = {
               items: [],
               loading: false,
               error: e?.message || "Nu am putut încărca istoricul.",
               fetchedAt: Date.now(),
            };
            cacheRef.current.set(id, entry);
            setHistoryById((prev) => {
               const next = new Map(prev);
               next.set(id, entry);
               return next;
            });
         }
      })();

      inflightRef.current.set(id, p);
      try {
         await p;
      } finally {
         inflightRef.current.delete(id);
      }
   }, []);

   // ===================== Activity feed logic =====================

   const candidates = useMemo(() => {
      const arr = (list || []).slice();

      const tsOf = (r) => {
         const upd = getCandidateUpdatedAt(r);
         const updMs = upd ? new Date(upd).getTime() : 0;
         if (Number.isFinite(updMs) && updMs) return updMs;

         const startRaw = getStartRawFromAny(r);
         const startMs = startRaw ? new Date(startRaw).getTime() : 0;
         if (Number.isFinite(startMs) && startMs) return startMs;

         const s = r?.start instanceof Date ? r.start.getTime() : 0;
         return Number.isFinite(s) ? s : 0;
      };

      arr.sort((a, b) => tsOf(b) - tsOf(a));
      return arr;
   }, [list]);

   const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
   const [scanCount, setScanCount] = useState(() =>
      Math.min(SCAN_BATCH, candidates.length),
   );
   const [scanLoading, setScanLoading] = useState(false);

   useEffect(() => {
      let cancelled = false;

      const slice = candidates.slice(0, scanCount).filter((x) => x?.id);
      const idsToLoad = slice
         .map((x) => String(x.id))
         .filter((rid) => {
            const cached = cacheRef.current.get(rid);
            if (!cached) return true;
            return Date.now() - (cached.fetchedAt || 0) > HISTORY_CACHE_TTL_MS;
         });

      if (!idsToLoad.length) return;

      setScanLoading(true);

      let idx = 0;
      const workers = Array.from({ length: SCAN_CONCURRENCY }).map(async () => {
         while (!cancelled && idx < idsToLoad.length) {
            const rid = idsToLoad[idx++];
            try {
               // eslint-disable-next-line no-await-in-loop
               await loadHistoryFor(rid, { force: false });
            } catch {
               // ignore
            }
         }
      });

      Promise.all(workers)
         .catch(() => {})
         .finally(() => {
            if (!cancelled) setScanLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [candidates, scanCount, loadHistoryFor]);

   const activity = useMemo(() => {
      const byId = historyByIdRef.current || historyById;
      const resById = new Map((candidates || []).map((r) => [String(r.id), r]));

      const out = [];

      for (const [rid, entry] of byId.entries()) {
         const r = resById.get(String(rid));
         if (!r) continue;

         const items = Array.isArray(entry?.items) ? entry.items : [];
         const take = items.slice(0, MAX_EVENTS_PER_RESERVATION);

         for (let i = 0; i < take.length; i++) {
            const h = take[i];
            const whenMs = getHistoryWhenMs(h);
            if (!whenMs) continue;

            out.push({
               key: `${rid}_${h?.id || i}_${whenMs}`,
               rid: String(rid),
               reservation: r,
               history: h,
               whenMs,
            });
         }
      }

      out.sort((a, b) => b.whenMs - a.whenMs);
      return out;
   }, [historyById, candidates]);

   useEffect(() => {
      if (activity.length >= visibleCount) return;
      if (scanCount >= candidates.length) return;
      setScanCount((prev) => Math.min(candidates.length, prev + SCAN_BATCH));
   }, [visibleCount, activity.length, scanCount, candidates.length]);

   useEffect(() => {
      return listenCalendarRefresh((payload) => {
         if (!payload) return;

         const rid =
            payload?.id ??
            payload?.reservationId ??
            payload?.reservation_id ??
            null;

         if (rid) void loadHistoryFor(rid, { force: true });
      });
   }, [loadHistoryFor]);

   // ===================== Render helpers =====================

   const visibleActivity = activity.slice(0, visibleCount);
   const canLoadMore =
      visibleCount < activity.length || scanCount < candidates.length;

   const onLoadMore = () => setVisibleCount((v) => v + PAGE_STEP);

   const renderEventOnlyChanges = (h) => {
      const action = String(h?.action || "").toUpperCase();
      const st = statusFromHistory(h);
      const icon = historyIconName(st);

      const whenRaw = getHistoryWhenRaw(h);
      const who = h.changedByUser
         ? `${h.changedByUser.firstName || ""} ${h.changedByUser.lastName || ""}`.trim()
         : "";

      const resolvers = makeResolvers(users, instructors, h);
      const changes = buildChangesFromHistoryItem(h, resolvers);

      const isCreate = action.startsWith("CREATE");

      return (
         <div className="reservationHistoryUI__eventBox">
               <span className="reservationHistoryUI__eventMeta">
                  {whenRaw ? fmtDateTimeRO(whenRaw) : ""}
                  {who ? ` • ${who}` : ""}
               </span>

            <div className="reservationHistoryUI__eventLines">
               {isCreate ? (
                  <div className="reservationHistoryUI__eventLine">
                     Rezervare creată.
                  </div>
               ) : changes?.length ? (
                  changes.map((c, i) => (
                     <div key={i} className="reservationHistoryUI__eventLine">
                        <span className="reservationHistoryUI__eventField">
                           {c.label}
                        </span>
                        :{" "}
                        {c.from ? (
                           <>
                              <span className="reservationHistoryUI__eventFrom">
                                 {c.from}
                              </span>
                              <span className="reservationHistoryUI__eventArrow">
                                 →
                              </span>
                           </>
                        ) : null}
                        <span className="reservationHistoryUI__eventTo">
                           {c.to}
                        </span>
                     </div>
                  ))
               ) : (
                  <div className="reservationHistoryUI__eventLine">
                     Modificare.
                  </div>
               )}
            </div>
         </div>
      );
   };

   return (
      <div className="reservationHistoryUI">
         <div className="reservationHistoryUI__header">
            <h2 className="reservationHistoryUI__title">Istoric</h2>

            <IconButton
               className="reservationHistoryUI__iconBtn"
               icon="add"
               iconClassName="reservationHistoryUI__icon"
               onClick={() => openPopup("addProg")}
               title="Adaugă programare"
               aria-label="Adaugă programare"
            />
         </div>

         <div className="reservationHistoryUI__gridWrapper">
            <div className="reservationHistoryUI__grid" role="list">
               {!visibleActivity.length ? (
                  <div className="reservationHistoryUI__empty">
                     {scanLoading
                        ? "Se încarcă istoricul…"
                        : "Nu există istoric încă."}
                  </div>
               ) : (
                  visibleActivity.map((ev) => {
                     const r = ev.reservation;
                     const h = ev.history;

                     return (
                        <div key={ev.key} className="reservationHistoryUI__row">
                           <div
                              className={`reservationHistoryUI__item reservationHistoryUI__item--${r.status} is-clickable`}
                              role="button"
                              tabIndex={0}
                              onClick={() => void openReservation(r)}
                              onKeyDown={(e) => {
                                 if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    void openReservation(r);
                                 }
                              }}
                              title="Deschide editarea programării"
                           >
                              <div className="reservationHistoryUI__itemLeft">
                                 <div className="reservationHistoryUI__mainWrapper">
                                    <div className="reservationHistoryUI__main">
                                       <h3 className="reservationHistoryUI__person">
                                          {r.person}
                                       </h3>
                                       <p className="reservationHistoryUI__subtitle">
                                          {r.instructor
                                             ? `cu ${r.instructor}`
                                             : "fără instructor"}
                                       </p>
                                    </div>
                                    <div
                                       className={`reservationHistoryUI__timelineStatus is-${statusFromHistory(h)}`}
                                       aria-label="Tip eveniment"
                                    >
                                       <UIIcon
                                          name={historyIconName(
                                             statusFromHistory(h),
                                          )}
                                       />
                                    </div>
                                 </div>

                                 <div className="reservationHistoryUI__metaRow">
                                    <span className="reservationHistoryUI__meta">
                                       <UIIcon
                                          name="calendar"
                                          className="reservationHistoryUI__metaIcon"
                                       />
                                       {r.date}
                                    </span>

                                    <span className="reservationHistoryUI__meta">
                                       <UIIcon
                                          name="clock"
                                          className="reservationHistoryUI__metaIcon"
                                       />
                                       {r.timeRange}
                                    </span>
                                 </div>

                                 {/* ✅ DOAR detalii din modificări (changedFields) */}
                                 {renderEventOnlyChanges(h)}
                              </div>
                           </div>
                        </div>
                     );
                  })
               )}

               <div className="reservationHistoryUI__loadMoreRow">
                  <button
                     type="button"
                     className="reservationHistoryUI__loadMoreBtn"
                     onClick={onLoadMore}
                     disabled={!canLoadMore || scanLoading}
                  >
                     {scanLoading
                        ? "Se încarcă…"
                        : canLoadMore
                          ? "Încarcă încă 10"
                          : "Nu mai sunt"}
                  </button>

                  <div className="reservationHistoryUI__loadMoreHint">
                     Afișate: {Math.min(visibleCount, activity.length)} /{" "}
                     {activity.length || 0}
                  </div>
               </div>
            </div>
         </div>
      </div>
   );
}

export default ReservationHistory;
