import React, { useEffect, useMemo, useState } from "react";

import { getReservations } from "../../api/reservationsService";

function normalizeItems(raw) {
   if (Array.isArray(raw)) return raw;
   if (!raw || typeof raw !== "object") return [];

   const candidates = [
      raw.items,
      raw.data,
      raw.results,
      raw.rows,
      raw.reservations,
      raw.list,
   ];

   for (const c of candidates) {
      if (Array.isArray(c)) return c;
      if (c && typeof c === "object") {
         if (Array.isArray(c.items)) return c.items;
         if (Array.isArray(c.data)) return c.data;
         if (Array.isArray(c.results)) return c.results;
         if (Array.isArray(c.rows)) return c.rows;
         if (Array.isArray(c.reservations)) return c.reservations;
         if (Array.isArray(c.list)) return c.list;
      }
   }

   return [];
}

function toMs(val) {
   if (!val) return 0;
   const d = new Date(val);
   const ms = d.getTime();
   return Number.isFinite(ms) ? ms : 0;
}

function readStart(item) {
   return (
      item?.startTime ??
      item?.start_time ??
      item?.start ??
      item?.dateTime ??
      item?.datetime ??
      item?.date ??
      item?.reservation?.startTime ??
      item?.reservation?.start_time ??
      item?.reservation?.start ??
      item?.reservation?.dateTime ??
      item?.reservation?.datetime ??
      item?.reservation?.date ??
      null
   );
}

function fmtDate(val) {
   if (!val) return "—";
   const d = new Date(val);
   if (Number.isNaN(d.getTime())) return String(val);
   return d.toLocaleDateString("ro-RO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
   });
}

function fmtTime(val) {
   if (!val) return "—";
   const d = new Date(val);
   if (Number.isNaN(d.getTime())) return "—";
   return d.toLocaleTimeString("ro-RO", {
      hour: "2-digit",
      minute: "2-digit",
   });
}

function readSector(item) {
   const raw = item?.sector ?? item?.reservation?.sector ?? "";
   const value = String(raw || "").trim();
   return value || "—";
}

function readGearbox(item) {
   const raw = item?.gearbox ?? item?.reservation?.gearbox ?? "";
   const value = String(raw || "").trim();
   return value || "—";
}

function rowKey(item, idx) {
   const id = item?.id ?? item?._id ?? item?.reservationId ?? null;
   if (id != null) return `id-${String(id)}`;
   return `row-${String(readStart(item) || "x")}-${idx}`;
}

function ReservationCard({ item }) {
   const start = readStart(item);
   return (
      <article className="studentReservationsPopup__card">
         <p className="studentReservationsPopup__date">
            {fmtDate(start)}
            {", "}
            <span className="studentReservationsPopup__time">
               {fmtTime(start)}
            </span>
         </p>
         <p className="studentReservationsPopup__extra">
            {readSector(item)} · {readGearbox(item)}
         </p>
      </article>
   );
}

export default function StudentReservationsPopup() {
   const [list, setList] = useState([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState("");

   useEffect(() => {
      let alive = true;
      (async () => {
         setLoading(true);
         setError("");
         try {
            const raw = await getReservations();
            if (!alive) return;
            setList(normalizeItems(raw));
         } catch (e) {
            if (!alive) return;
            setList([]);
            setError(e?.message || "Nu am putut încărca rezervările.");
         } finally {
            if (alive) setLoading(false);
         }
      })();
      return () => {
         alive = false;
      };
   }, []);

   const sorted = useMemo(() => {
      const clone = Array.isArray(list) ? [...list] : [];
      clone.sort((a, b) => toMs(readStart(a)) - toMs(readStart(b)));
      return clone;
   }, [list]);

   const { upcoming, past } = useMemo(() => {
      const now = Date.now();
      const next = [];
      const prev = [];

      for (const item of sorted) {
         const ms = toMs(readStart(item));
         if (ms && ms >= now) next.push(item);
         else prev.push(item);
      }

      return { upcoming: next, past: prev.reverse() };
   }, [sorted]);

   return (
      <div className="studentReservationsPopup">
         <div className="studentReservationsPopup__header">
            <h3 className="studentReservationsPopup__title">
               Rezervările mele
            </h3>
         </div>

         {loading ? (
            <p className="studentReservationsPopup__state">Se încarcă...</p>
         ) : error ? (
            <p className="studentReservationsPopup__error">{error}</p>
         ) : !sorted.length ? (
            <p className="studentReservationsPopup__state">
               Nu există rezervări.
            </p>
         ) : (
            <div className="studentReservationsPopup__content">
               <section className="studentReservationsPopup__section">
                  <div className="studentReservationsPopup__sectionHead">
                     <h4 className="studentReservationsPopup__sectionTitle">
                        Urmează
                     </h4>
                     <span className="studentReservationsPopup__sectionCount">
                        {upcoming.length}
                     </span>
                  </div>
                  {upcoming.length ? (
                     <div className="studentReservationsPopup__grid">
                        {upcoming.map((item, idx) => (
                           <ReservationCard
                              key={rowKey(item, idx)}
                              item={item}
                           />
                        ))}
                     </div>
                  ) : (
                     <p className="studentReservationsPopup__sectionEmpty">
                        Nu ai rezervări următoare.
                     </p>
                  )}
               </section>

               <section className="studentReservationsPopup__section">
                  <div className="studentReservationsPopup__sectionHead">
                     <h4 className="studentReservationsPopup__sectionTitle">
                        Trecute
                     </h4>
                     <span className="studentReservationsPopup__sectionCount">
                        {past.length}
                     </span>
                  </div>
                  {past.length ? (
                     <div className="studentReservationsPopup__grid">
                        {past.map((item, idx) => (
                           <ReservationCard
                              key={rowKey(item, idx)}
                              item={item}
                           />
                        ))}
                     </div>
                  ) : (
                     <p className="studentReservationsPopup__sectionEmpty">
                        Nu ai rezervări trecute.
                     </p>
                  )}
               </section>
            </div>
         )}
      </div>
   );
}
