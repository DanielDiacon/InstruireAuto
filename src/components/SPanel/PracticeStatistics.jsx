// src/components/SPanel/PracticeStatistics.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
   getAllMyPracticeHistory,
   getTicketQuestions,
} from "../../api/examService";
import AlertPills from "../Utils/AlertPills";

/* ================= i18n ================= */
const I18N = {
   ro: {
      stats_title: "Statistici practică",
      loading: "Se încarcă…",
      total_questions: "Total întrebări",
      correct_answers_sum: "Răspunsuri corecte",
      wrong_answers: "Răspunsuri greșite",
      unanswered_questions: "Întrebări necompletate",
      aria_correct: "Corecte {pct}%",
      aria_wrong: "Greșite {pct}%",
      aria_unanswered: "Necompletate {pct}%",
      err_history: "Nu am putut încărca istoricul.",
      err_counts:
         "Nu am putut încărca numărul de întrebări pentru unele bilete.",
   },
   ru: {
      stats_title: "Статистика практики",
      loading: "Загрузка…",
      total_questions: "Всего вопросов",
      correct_answers_sum: "Правильные ответы ",
      wrong_answers: "Неправильные ответы",
      unanswered_questions: "Без ответа",
      aria_correct: "Верно {pct}%",
      aria_wrong: "Ошибки {pct}%",
      aria_unanswered: "Без ответа {pct}%",
      err_history: "Не удалось загрузить историю.",
      err_counts: "Не удалось загрузить число вопросов для части билетов.",
   },
};

const formatI18n = (str, vars) =>
   vars ? str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`) : str;

/* ——— Helpers ——— */
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

/* ===== limbă partajată (citește din localStorage + ascultă evenimentul "exam:lang") ===== */
function useSharedLang() {
   const [lang, setLang] = useState(() => {
      const saved =
         (typeof localStorage !== "undefined" &&
            localStorage.getItem("exam.lang")) ||
         "ro";
      return saved === "ru" ? "ru" : "ro";
   });

   useEffect(() => {
      const onCustom = (e) => setLang(e.detail === "ru" ? "ru" : "ro");
      const onStorage = (e) => {
         if (e.key === "exam.lang") setLang(e.newValue === "ru" ? "ru" : "ro");
      };
      window.addEventListener("exam:lang", onCustom);
      window.addEventListener("storage", onStorage);
      return () => {
         window.removeEventListener("exam:lang", onCustom);
         window.removeEventListener("storage", onStorage);
      };
   }, []);

   return lang;
}

/* ============ Bară (Corecte / Greșite / Necompletate) ============ */
function SegmentedBar({ pctCorrect, pctWrong, pctUnanswered, basePx = 32, t }) {
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

   const ariaOk = t("aria_correct", { pct: (pctCorrect ?? 0).toFixed(1) });
   const ariaBad = t("aria_wrong", { pct: (pctWrong ?? 0).toFixed(1) });
   const ariaSkip = t("aria_unanswered", {
      pct: (pctUnanswered ?? 0).toFixed(1),
   });

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
               aria-label={ariaOk}
            />
            <div
               className="practice-stats__bar-seg practice-stats__bar-seg--bad"
               style={{
                  width: `calc(var(--base) + (100% - var(--basesum)) * ${bad})`,
               }}
               aria-label={ariaBad}
            />
            <div
               className="practice-stats__bar-seg practice-stats__bar-seg--skip"
               style={{
                  width: `calc(var(--base) + (100% - var(--basesum)) * ${skip})`,
               }}
               aria-label={ariaSkip}
            />
         </div>
      </div>
   );
}

export default function PracticeStatistics() {
   const lang = useSharedLang();
   const t = useCallback(
      (key, vars) => {
         const base = (I18N[lang] && I18N[lang][key]) || I18N.ro[key] || key;
         return formatI18n(base, vars);
      },
      [lang]
   );

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
      const tmo = setTimeout(dismissLastPill, 3500);
      return () => clearTimeout(tmo);
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
            pushError(t("err_history"));
         } finally {
            setLoading(false);
         }
      })();
   }, [t]);

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
            pushError(t("err_counts"));
         }
      })();
      return () => {
         alive = false;
      };
   }, [selectedTicketIds, t]);

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

   /* ——— 5) agregare: corecte / greșite / necompletate ——— */
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

   return (
      <div className="practice-stats">
         <AlertPills messages={pillMsgs} onDismiss={dismissLastPill} />

         <div className="practice-stats__head">
            <h2>{t("stats_title")}</h2>
         </div>

         {loading && (
            <div className="practice-stats__loading">{t("loading")}</div>
         )}

         {!loading && (
            <>
               {/* ——— REZUMAT GLOBAL ——— */}
               <div className="practice-stats__section">
                  <div className="practice-stats__table">
                     <div className="practice-stats__col">
                        <div className="practice-stats__item">
                           <p>{t("total_questions")}</p>
                           <span>{aggregates.totalUniverse}</span>
                        </div>
                        <div className="practice-stats__item">
                           <p>{t("correct_answers_sum")}</p>
                           <span>{aggregates.correct}</span>
                        </div>
                        <div className="practice-stats__item">
                           <p>{t("wrong_answers")}</p>
                           <span>{aggregates.wrong}</span>
                        </div>
                        <div className="practice-stats__item">
                           <p>{t("unanswered_questions")}</p>
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
                     t={(key, vars) => {
                        const base =
                           (I18N[lang] && I18N[lang][key]) ||
                           I18N.ro[key] ||
                           key;
                        return formatI18n(base, vars);
                     }}
                  />
               </div>
            </>
         )}
      </div>
   );
}
