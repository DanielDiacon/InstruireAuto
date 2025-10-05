// src/components/SPanel/PracticeStatistics.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
   getAllMyPracticeHistory,
   getTicketQuestions,
} from "../../api/examService";
import AlertPills from "../Utils/AlertPills";

/* ===== Config din .env =====
   - VITE_TICKETS_START (ex: 246)
   - VITE_TICKETS_COUNT (ex: 14)  ← câte bilete vrei să contezi
   - opțional: VITE_TICKETS_LIST = "P1,P2,P5" (dacă vrei să alegi exact biletele după P#)
*/
const readEnv = (viteKey, craKey) =>
   (typeof import.meta !== "undefined" &&
      import.meta?.env &&
      import.meta.env[viteKey]) ||
   (typeof process !== "undefined" && process?.env && process.env[craKey]) ||
   "";

const START_ID = Number(
   readEnv("VITE_TICKETS_START", "REACT_APP_TICKETS_START") || 246
);
const COUNT = Number(
   readEnv("VITE_TICKETS_COUNT", "REACT_APP_TICKETS_COUNT") || 24
);
const TICKETS_LIST_RAW = readEnv("VITE_TICKETS_LIST", "REACT_APP_TICKETS_LIST"); // ex: "P1,P3,P7"

/* ——— Helpers ——— */
const percent = (num, den) =>
   den > 0 ? Math.round((num * 10000) / den) / 100 : 0;
const ts = (x) => (x ? Date.parse(x) || 0 : 0);
const DISPLAY_BASE = START_ID - 1;
const pToId = (pNum) => DISPLAY_BASE + Number(pNum || 0);

/** extrage P# din "Practice P2" => 2 */
const parsePIndex = (ticketName) => {
   const m = String(ticketName || "").match(/P\s*(\d+)/i);
   return m ? Number(m[1]) : null;
};

/** "Practice P2" -> ticketId (ex: 246 + (2-1)) */
const idFromTicketName = (ticketName) => {
   const p = parsePIndex(ticketName);
   return Number.isFinite(p) ? pToId(p) : null;
};

/* ============ Bară (Corecte / Greșite / Necompletate) ============ */
function SegmentedBar({ pctCorrect, pctWrong, pctUnanswered, basePx = 32 }) {
   const [ok, setOk] = useState(0);
   const [bad, setBad] = useState(0);
   const [skip, setSkip] = useState(1);
   const shareOk = Math.max(0, Math.min(1, (pctCorrect ?? 0) / 100));
   const shareBad = Math.max(0, Math.min(1, (pctWrong ?? 0) / 100));
   const shareSkip = Math.max(0, Math.min(1, (pctUnanswered ?? 0) / 100));

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
               "--base": `${basePx}px`,
               "--basesum": `calc(3 * ${basePx}px)`,
            }}
         >
            <div
               className="practice-stats__bar-seg practice-stats__bar-seg--ok"
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
   const [historyItems, setHistoryItems] = useState([]);
   const [ticketQuestionCount, setTicketQuestionCount] = useState({}); // { [ticketId]: number }

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

   /* ——— lista de bilete selectate ——— */
   const selectedTicketIds = useMemo(() => {
      if (TICKETS_LIST_RAW) {
         // Acceptă "P1,P3, P7" sau direct "246,247"
         const parts = String(TICKETS_LIST_RAW)
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter(Boolean);
         const ids = [];
         for (const p of parts) {
            const m = p.match(/^P\s*(\d+)$/i);
            if (m) ids.push(pToId(Number(m[1])));
            else if (/^\d+$/.test(p)) ids.push(Number(p));
         }
         return Array.from(new Set(ids.filter((x) => Number.isFinite(x))));
      }
      // fallback: interval continuu din .env
      return Array.from({ length: COUNT }, (_, i) => START_ID + i);
   }, []);

   /* ——— 1) istoric din server ——— */
   useEffect(() => {
      (async () => {
         try {
            setLoading(true);
            const all = await getAllMyPracticeHistory({
               pageSize: 500,
               maxPages: 10,
            });
            const norm = (all || []).map((it) => ({
               id: it.id,
               ticketName: it.ticketName ?? null, // "Practice P2"
               status: String(it.status || "").toUpperCase(), // IN_PROGRESS / FAILED / FINISHED / PASSED
               score: Number.isFinite(Number(it.score))
                  ? Number(it.score)
                  : null, // corecte
               totalFromServer: Number.isFinite(Number(it.totalQuestions))
                  ? Number(it.totalQuestions)
                  : null,
               startedAt: it.startedAt ?? it.createdAt ?? null,
               finishedAt: it.completedAt ?? it.finishedAt ?? null,
            }));
            setHistoryItems(norm);
         } catch (e) {
            pushError(e?.message || "Nu am putut încărca istoricul.");
         } finally {
            setLoading(false);
         }
      })();
   }, []);

   /* ——— 2) număr real de întrebări pentru fiecare bilet selectat ——— */
   useEffect(() => {
      let alive = true;
      (async () => {
         try {
            const entries = await Promise.all(
               selectedTicketIds.map(async (tid) => {
                  try {
                     const q = await getTicketQuestions(tid);
                     // suportă {questions: []} sau [] direct
                     const count = Array.isArray(q)
                        ? q.length
                        : Array.isArray(q?.questions)
                        ? q.questions.length
                        : 0;
                     return [tid, count];
                  } catch {
                     return [tid, 0];
                  }
               })
            );
            if (!alive) return;
            const map = {};
            for (const [tid, cnt] of entries) map[tid] = cnt;
            setTicketQuestionCount(map);
         } catch (e) {
            pushError(
               "Nu am putut încărca numărul de întrebări pentru unele bilete."
            );
         }
      })();
      return () => {
         alive = false;
      };
   }, [selectedTicketIds]);

   /* ——— 3) ultima încercare FINALIZATĂ per bilet (după ticketName -> P# -> ticketId) ——— */
   const lastFinishedByTicketId = useMemo(() => {
      const map = new Map(); // ticketId -> attempt
      for (const it of historyItems) {
         if (it.status === "IN_PROGRESS") continue; // ignorăm cele în curs
         const tid = idFromTicketName(it.ticketName);
         if (!tid) continue;
         if (!selectedTicketIds.includes(tid)) continue; // doar biletele alese
         if (it.score == null) continue;
         const prev = map.get(tid);
         const curTs = ts(it.finishedAt || it.startedAt);
         const prevTs = prev ? ts(prev.finishedAt || prev.startedAt) : -1;
         if (!prev || curTs > prevTs) map.set(tid, it);
      }
      return map;
   }, [historyItems, selectedTicketIds]);

   /* ——— 4) univers = suma întrebărilor reale din biletele alese ——— */
   const universeTotal = useMemo(() => {
      return selectedTicketIds.reduce(
         (s, tid) => s + (ticketQuestionCount[tid] || 0),
         0
      );
   }, [selectedTicketIds, ticketQuestionCount]);

   /* ——— 5) agregare: corecte / greșite / necompletate ———
        - Pentru fiecare bilet selectat:
            dacă are o încercare finalizată:  corecte += scor; greșite += (întrebări_bilet - scor)
            altfel:                          necompletate += întrebări_bilet
  */
   const aggregates = useMemo(() => {
      let correct = 0;
      let wrong = 0;
      let unanswered = 0;

      for (const tid of selectedTicketIds) {
         const totalQ = ticketQuestionCount[tid] || 0;
         const att = lastFinishedByTicketId.get(tid);
         if (att) {
            const c = Math.max(0, Math.min(totalQ, Number(att.score || 0)));
            correct += c;
            wrong += Math.max(0, totalQ - c);
         } else {
            unanswered += totalQ;
         }
      }

      return {
         selectedTicketsCount: selectedTicketIds.length,
         totalUniverse: universeTotal,
         correct,
         wrong,
         unanswered,
         pctCorrect: percent(correct, universeTotal),
         pctWrong: percent(wrong, universeTotal),
         pctUnanswered: percent(unanswered, universeTotal),
      };
   }, [
      selectedTicketIds,
      lastFinishedByTicketId,
      ticketQuestionCount,
      universeTotal,
   ]);

   /* ——— recent (informativ) ——— */
   const recent = useMemo(() => {
      const arr = [...(historyItems || [])]
         .filter((a) => {
            const tid = idFromTicketName(a.ticketName);
            return tid && selectedTicketIds.includes(tid);
         })
         .sort(
            (a, b) =>
               ts(b.finishedAt || b.startedAt) - ts(a.finishedAt || a.startedAt)
         );
      return arr.slice(0, 10);
   }, [historyItems, selectedTicketIds]);

   return (
      <div className="practice-stats">
         <AlertPills messages={pillMsgs} onDismiss={dismissLastPill} />

         <div className="practice-stats__head">
            <h2>
               Statistici Practică 
            </h2>
         </div>

         {loading && <div className="practice-stats__loading">Se încarcă…</div>}

         {!loading && (
            <>
               {/* ——— REZUMAT GLOBAL ——— */}
               <div className="practice-stats__section">
                  <div className="practice-stats__table">
                     <div className="practice-stats__col">
                        <div className="practice-stats__item">
                           <p>Total întrebări </p>
                           <span>{aggregates.totalUniverse}</span>
                        </div>
                        <div className="practice-stats__item">
                           <p>Răspunsuri corecte (sumă scoruri)</p>
                           <span>{aggregates.correct}</span>
                        </div>
                        <div className="practice-stats__item">
                           <p>Răspunsuri greșite</p>
                           <span>{aggregates.wrong}</span>
                        </div>
                        <div className="practice-stats__item">
                           <p>Întrebări necompletate</p>
                           <span>{aggregates.unanswered}</span>
                        </div>
                     </div>
                  </div>
               </div>

               {/* ——— BARĂ PROCENTE ——— */}
               <div className="practice-stats__section">
                  <SegmentedBar
                     pctCorrect={aggregates.pctCorrect}
                     pctWrong={aggregates.pctWrong}
                     pctUnanswered={aggregates.pctUnanswered}
                  />
               </div>
            </>
         )}
      </div>
   );
}
