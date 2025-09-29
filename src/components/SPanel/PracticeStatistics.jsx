// src/components/SPanel/PracticeStatistics.jsx
import React, { useEffect, useMemo, useState } from "react";
import { getPracticeStats } from "../../api/examService";
import AlertPills from "../Utils/AlertPills";

/* ===== Config din .env (aceeași logică ca în Practice) ===== */
const readEnv = (viteKey, craKey) =>
   (typeof import.meta !== "undefined" &&
      import.meta?.env &&
      import.meta.env[viteKey]) ||
   (typeof process !== "undefined" && process?.env && process.env[craKey]) ||
   "";

const START_ID = Number(
   readEnv("VITE_TICKETS_START", "REACT_APP_TICKETS_START") || 130
);
const COUNT = Number(
   readEnv("VITE_TICKETS_COUNT", "REACT_APP_TICKETS_COUNT") || 171 - 130 + 1
);
// dacă e alt număr real, schimbă-l din .env
const QUESTIONS_PER_TICKET = Number(
   readEnv("VITE_QUESTIONS_PER_TICKET", "REACT_APP_QUESTIONS_PER_TICKET") || 24
);

const percent = (num, den) =>
   den > 0 ? Math.round((num * 10000) / den) / 100 : 0;
const ts = (x) => (x ? Date.parse(x) || 0 : 0);

/* === Helpers pentru citirea “ultimei tentative” per bilet din localStorage === */
const attemptResultKey = (tid, aid) => `practice_attempt_result_${tid}_${aid}`;
const answersKey = (tid, aid) => `practice_answers_${tid}_${aid}`;

function readLatestLocalByTicket() {
   const byTicket = new Map();

   // 1) rezultate finalizate
   for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const m = k && k.match(/^practice_attempt_result_(\d+)_(\d+)$/);
      if (!m) continue;
      const tid = Number(m[1]);
      const aid = Number(m[2]);
      let obj = null;
      try {
         obj = JSON.parse(localStorage.getItem(k) || "{}");
      } catch {}
      const prev = byTicket.get(tid);
      const prevAid = prev?.aid ?? -1;
      if (!obj) continue;

      if (aid > prevAid) {
         const correct = Number(obj.ok || 0);
         const wrong = Number(obj.bad || 0);
         const total =
            Number(obj.total) ||
            (typeof obj.ok === "number" &&
            typeof obj.bad === "number" &&
            typeof obj.skip === "number"
               ? obj.ok + obj.bad + obj.skip
               : QUESTIONS_PER_TICKET);
         byTicket.set(tid, {
            source: "result",
            aid,
            correct,
            wrong,
            total,
            when: obj.finishedAt || null,
         });
      }
   }

   // 2) tentative în curs (answers), doar dacă nu avem rezultat finalizat
   const answersByTicket = new Map();
   for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const m = k && k.match(/^practice_answers_(\d+)_(\d+)$/);
      if (!m) continue;
      const tid = Number(m[1]);
      const aid = Number(m[2]);
      if (byTicket.has(tid) && byTicket.get(tid).source === "result") continue;

      let obj = null;
      try {
         obj = JSON.parse(localStorage.getItem(k) || "{}");
      } catch {}
      if (!obj || typeof obj !== "object") continue;

      let correct = 0,
         wrong = 0,
         when = null;
      for (const a of Object.values(obj)) {
         if (!a || a.selected == null) continue;
         if (a.correct === true) correct++;
         else if (a.correct === false) wrong++;
         if (a.at && (!when || Date.parse(a.at) > Date.parse(when)))
            when = a.at;
      }

      const prev = answersByTicket.get(tid);
      if (
         !prev ||
         aid > prev.aid ||
         (aid === prev.aid && ts(when) > ts(prev.when))
      ) {
         answersByTicket.set(tid, {
            source: "answers",
            aid,
            correct,
            wrong,
            total: QUESTIONS_PER_TICKET,
            when,
         });
      }
   }

   for (const [tid, info] of answersByTicket.entries()) {
      if (!byTicket.has(tid)) byTicket.set(tid, info);
   }

   return byTicket;
}

/* ============ Bară cu animație (Corecte + Greșite cresc, Necompletate scade) ============ */
/* ============ Bară cu animație + min 32px per segment ============ */
function SegmentedBar({ pctCorrect, pctWrong, pctUnanswered, basePx = 32 }) {
   // folosim share-uri în [0..1]
   const shareOk = Math.max(0, Math.min(1, (pctCorrect ?? 0) / 100));
   const shareBad = Math.max(0, Math.min(1, (pctWrong ?? 0) / 100));
   const shareSkip = Math.max(0, Math.min(1, (pctUnanswered ?? 0) / 100));

   // pentru animație (de la 32px + 0% → către valoarea finală)
   const [ok, setOk] = useState(0);
   const [bad, setBad] = useState(0);
   const [skip, setSkip] = useState(1); // începe plin, apoi scade

   useEffect(() => {
      const raf = requestAnimationFrame(() => {
         setOk(shareOk);
         setBad(shareBad);
         setSkip(shareSkip);
      });
      return () => cancelAnimationFrame(raf);
   }, [shareOk, shareBad, shareSkip]);

   return (
      <div className="practice-stats__bar">
         <div
            className="practice-stats__bar-inner"
            style={{
               // variabile CSS pt. formula: width = base + (100% - 3*base) * share
               "--base": `${basePx}px`,
               "--basesum": `calc(3 * ${basePx}px)`,
            }}
         >
            <div
               className="practice-stats__bar-seg practice-stats__bar-seg--ok"
               // calc(32px + (100% - 96px) * share)
               style={{
                  width: `calc(var(--base) + (100% - var(--basesum)) * ${ok})`,
               }}
               aria-label={`Corecte ${pctCorrect?.toFixed?.(1) ?? 0}%`}
            />
            <div
               className="practice-stats__bar-seg practice-stats__bar-seg--bad"
               style={{
                  width: `calc(var(--base) + (100% - var(--basesum)) * ${bad})`,
               }}
               aria-label={`Greșite ${pctWrong?.toFixed?.(1) ?? 0}%`}
            />
            <div
               className="practice-stats__bar-seg practice-stats__bar-seg--skip"
               style={{
                  width: `calc(var(--base) + (100% - var(--basesum)) * ${skip})`,
               }}
               aria-label={`Necompletate ${pctUnanswered?.toFixed?.(1) ?? 0}%`}
            />
         </div>
      </div>
   );
}

export default function PracticeStatistics() {
   const [loading, setLoading] = useState(true);
   const [pillMsgs, setPillMsgs] = useState([]);
   const [items, setItems] = useState([]);
   const [source, setSource] = useState("server");

   const pushError = (text) =>
      setPillMsgs((arr) => [
         ...arr,
         { id: Date.now() + Math.random(), type: "error", text },
      ]);
   const dismissLastPill = () => setPillMsgs((arr) => arr.slice(0, -1));
   useEffect(() => {
      if (!pillMsgs.length) return;
      const t = setTimeout(dismissLastPill, 3500);
      return () => clearTimeout(t);
   }, [pillMsgs]);

   useEffect(() => {
      (async () => {
         setLoading(true);
         try {
            const { items, source } = await getPracticeStats({
               pageSize: 200,
               maxPages: 10,
            });
            setItems(items || []);
            setSource(source || "server");
         } catch (e) {
            pushError(e?.message || "Nu am putut încărca statisticile.");
         } finally {
            setLoading(false);
         }
      })();
   }, []);

   /* ========= REZUMAT GLOBAL (ultima tentativă per bilet) ========= */
   const latestByTicket = useMemo(() => readLatestLocalByTicket(), [items]);
   const global = useMemo(() => {
      const totalUniverse = COUNT * QUESTIONS_PER_TICKET;
      let correct = 0;
      let wrong = 0;

      for (const info of latestByTicket.values()) {
         correct += Number(info.correct || 0);
         wrong += Number(info.wrong || 0);
      }
      const unanswered = Math.max(0, totalUniverse - correct - wrong);

      return {
         total: totalUniverse,
         correct,
         wrong,
         unanswered,
         accuracy: percent(correct, correct + wrong),
         pctCorrect: percent(correct, totalUniverse),
         pctWrong: percent(wrong, totalUniverse),
         pctUnanswered: percent(unanswered, totalUniverse),
      };
   }, [latestByTicket]);

   // ===== Ultima stare per bilet (din istoricul server/local) =====
   const lastByTicketFromHistory = useMemo(() => {
      const map = new Map();
      for (const it of items) {
         const key = it.ticketId ?? it.ticketName ?? it.id;
         const prev = map.get(key);
         const t = ts(it.finishedAt || it.startedAt);
         const pt = prev ? ts(prev.finishedAt || prev.startedAt) : -1;
         if (!prev || t > pt) map.set(key, it);
      }
      return map;
   }, [items]);

   const badgeFor = (it) => {
      if (!it) return { label: "Neînceput", cls: "none" };
      if (it.status === "IN_PROGRESS")
         return { label: "În progres", cls: "prog" };
      if (it.correct === it.total && it.total > 0)
         return { label: "Perfect", cls: "ok" };
      if (it.correct === 0 && it.wrong > 0)
         return { label: "Greșit", cls: "bad" };
      if (it.wrong > 0) return { label: "Parțial", cls: "warn" };
      if (it.total > 0 && it.correct > 0 && it.wrong === 0)
         return { label: "Corect", cls: "ok" };
      return { label: "Neînceput", cls: "none" };
   };

   // ===== Tentative recente =====
   const recent = useMemo(() => {
      const arr = [...items].sort(
         (a, b) =>
            ts(b.finishedAt || b.startedAt) - ts(a.finishedAt || a.startedAt)
      );
      return arr.slice(0, 10);
   }, [items]);

   return (
      <div className="practice-stats">
         <AlertPills messages={pillMsgs} onDismiss={dismissLastPill} />

         <div className="practice-stats__head">
            <h2>Statistici Practică</h2>
         </div>

         {loading && <div className="practice-stats__loading">Se încarcă…</div>}

         {!loading && (
            <>
               {/* ——— REZUMAT GLOBAL ——— */}
               <div className="practice-stats__section">
                  <div className="practice-stats__table">
                     <div className="practice-stats__col">
                        <div className="practice-stats__item">
                           <p>Total întrebări</p>
                           <span>{global.total}</span>
                        </div>
                        <div className="practice-stats__item">
                           <p>Răspunsuri corecte</p>
                           <span>{global.correct}</span>
                        </div>
                        <div className="practice-stats__item">
                           <p>Răspunsuri greșite</p>
                           <span>{global.wrong}</span>
                        </div>
                        <div className="practice-stats__item">
                           <p>Necompletate</p>
                           <span>{global.unanswered}</span>
                        </div>
                     </div>
                  </div>
               </div>

               {/* ——— BARĂ (procente) ——— */}
               <div className="practice-stats__section">
                  <SegmentedBar
                     pctCorrect={global.pctCorrect}
                     pctWrong={global.pctWrong}
                     pctUnanswered={global.pctUnanswered}
                  />
               </div>
            </>
         )}
      </div>
   );
}
