import React, {
   useContext,
   useEffect,
   useMemo,
   useRef,
   useState,
   useCallback,
} from "react";
import { UserContext } from "../../UserContext";
import {
   getMyPermissionStatus,
   grantExamPermissionExact,
   startExam,
   getExam,
   submitExamAnswer,
   isoFromNowPlusMinutes,
   isoToSecondsUTC,
   getTicketQuestions,
   getStudentExamHistory,
   failExam,
} from "../../api/examService";
import { rewriteImageUrl } from "../Utils/rewriteImageUrl";
import { ReactSVG } from "react-svg";
import heartFullIcon from "../../assets/svg/mingcute--heart-fill.svg";
import heartCrackIcon from "../../assets/svg/mingcute--heart-crack-fill.svg";

/** 👉 pentru confirm pe navigare internă (react-router v6) */
import { UNSAFE_NavigationContext as NavigationContext } from "react-router-dom";

/* ---------- helpers ---------- */
const prettyTime = (sec) => {
   const m = Math.floor(sec / 60);
   const s = sec % 60;
   return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const secsRemainingFromServer = (startedAtIso, timeLimitMin) => {
   if (!startedAtIso || !timeLimitMin)
      return timeLimitMin ? timeLimitMin * 60 : 0;
   const startedAt = Date.parse(startedAtIso);
   const elapsed = Math.floor((Date.now() - startedAt) / 1000);
   return clamp(timeLimitMin * 60 - elapsed, 0, timeLimitMin * 60);
};
const computeIsAllowed = (perm) => {
   if (!perm) return false;
   if (perm.allowed === true) return true;
   const isActive = perm.isActive ?? true;
   const untilOk = perm.validUntil
      ? Date.parse(perm.validUntil) > Date.now()
      : true;
   const used = Number(perm.usedAttempts ?? 0);
   const maxA = Number(perm.maxAttempts ?? 1);
   return Boolean(isActive && untilOk && used < maxA);
};

// normalizează indexul corect 0/1-based
const normalizeCorrectIdx = (raw, answersLen) => {
   const n = Number(raw);
   if (!Number.isInteger(n) || answersLen <= 0) return null;
   if (n >= 0 && n < answersLen) return n; // 0-based
   if (n >= 1 && n <= answersLen) return n - 1; // 1-based
   return null;
};

/* ===== helpers: istoric încercări ===== */
const normalizeAttempt = (it) => ({
   id:
      it.id ??
      `${it.examId || "exam"}-${it.startedAt || it.createdAt || Date.now()}`,
   examId: it.examId ?? it.id ?? null,
   startedAt: it.startedAt ?? it.createdAt ?? it.started ?? null,
   finishedAt: it.finishedAt ?? it.completedAt ?? it.endedAt ?? null,
   status: (
      it.status ?? (it.finishedAt ? "FINISHED" : "IN_PROGRESS")
   ).toUpperCase(),
   total: it.total ?? it.totalQuestions ?? it.questionsTotal ?? null,
   correct: it.correct ?? it.correctCount ?? it.right ?? null,
   wrong: it.wrong ?? it.wrongCount ?? it.incorrect ?? null,
   scorePct:
      typeof it.scorePct === "number"
         ? it.scorePct
         : typeof it.percentage === "number"
         ? it.percentage
         : typeof it.score === "number"
         ? it.score
         : null,
});

/* ---------- config ---------- */
const MAX_MISTAKES_TO_END = 3; // la a 3-a greșeală: FAIL
const WRONG_FILL_SENTINEL = 99; // pedeapsă sigur greșit
const LEAVE_WARNING_TEXT =
   "Chiar dorești să părăsești pagina examenului? Întrebarea curentă va fi marcată greșit (penalizare).";

const ROUTE_LEAVE_CONFIRM =
   "Chiar dorești să părăsești /student/exam? Întrebarea curentă va fi marcată greșit (penalizare).";

/** Hook simplu pt. confirm + side-effect la navigare internă (RR v6) */
function useLeaveGuard(when, onConfirm) {
   const nav = useContext(NavigationContext);
   useEffect(() => {
      if (!when || !nav?.navigator?.block) return;
      const unblock = nav.navigator.block(async (tx) => {
         const ok = window.confirm(ROUTE_LEAVE_CONFIRM);
         if (ok) {
            try {
               await onConfirm?.("route-leave");
            } finally {
               unblock(); // deblochează
               tx.retry(); // navighează
            }
         }
         // altfel rămâne pe pagină
      });
      return unblock;
   }, [when, nav, onConfirm]);
}

export default function ExamPracticeUI({ maxLives = 3, useHearts = true }) {
   const { user } = useContext(UserContext) || {};

   const [view, setView] = useState("waiting"); // waiting | test | result
   const [checkingPerm, setCheckingPerm] = useState(true);
   const [perm, setPerm] = useState(null);
   const [error, setError] = useState("");

   const [exam, setExam] = useState(null);
   const [questions, setQuestions] = useState([]);
   const [idx, setIdx] = useState(0);
   const [answersMap, setAnswersMap] = useState({});
   const [remaining, setRemaining] = useState(0);
   const [answerLoading, setAnswerLoading] = useState(null);

   const [correctMap, setCorrectMap] = useState({});
   const [correctMapLoaded, setCorrectMapLoaded] = useState(false);

   const [attempts, setAttempts] = useState([]);
   const [attemptsLoading, setAttemptsLoading] = useState(false);
   const [attemptsError, setAttemptsError] = useState("");

   const qTextRef = useRef(null);
   const timerRef = useRef(null);
   const pollingRef = useRef(null);
   const finishingRef = useRef(false);

   // refs pentru listeners / penalizări
   const answersMapRef = useRef(answersMap);
   const questionsRef = useRef(questions);
   const examRef = useRef(exam);
   const viewRef = useRef(view);
   const idxRef = useRef(idx);
   const penaltyCooldownRef = useRef(0);

   useEffect(() => {
      answersMapRef.current = answersMap;
   }, [answersMap]);
   useEffect(() => {
      questionsRef.current = questions;
   }, [questions]);
   useEffect(() => {
      examRef.current = exam;
   }, [exam]);
   useEffect(() => {
      viewRef.current = view;
   }, [view]);
   useEffect(() => {
      idxRef.current = idx;
   }, [idx]);

   const scrollToQText = () => {
      const el = qTextRef.current;
      if (!el) return;
      const top = window.scrollY + (el.getBoundingClientRect().top || 0);
      if (Math.abs(window.scrollY - top) > 1)
         window.scrollTo({ top, behavior: "smooth" });
   };

   useEffect(() => {
      return () => {
         timerRef.current && clearInterval(timerRef.current);
         pollingRef.current && clearInterval(pollingRef.current);
      };
   }, []);

   const startTimer = (secs) => {
      setRemaining(secs);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(
         () => setRemaining((r) => (r <= 1 ? 0 : r - 1)),
         1000
      );
   };

   // răspunde o singură întrebare ca GREȘIT (99) – folosit la penalizare
   const answerOneAsWrong99 = useCallback(async (q, reason = "penalty") => {
      if (!q || !examRef.current) return false;

      const already = (answersMapRef.current || {})[q.id];
      if (already && already.selected != null) {
         // deja răspunsă – nu mai trimitem încă o dată
         return false;
      }

      // local: marchează greșit cu 99
      setAnswersMap((prev) => ({
         ...prev,
         [q.id]: {
            selected: WRONG_FILL_SENTINEL,
            correct: false,
            at: new Date().toISOString(),
            reason,
         },
      }));

      // server: trimite “99”
      try {
         console.log("%c[UI →] penalty 99", "color:#a00;font-weight:bold", {
            examId: Number(examRef.current.id),
            questionId: Number(q.id),
            selectedAnswer: WRONG_FILL_SENTINEL,
         });

         await submitExamAnswer(Number(examRef.current.id), {
            questionId: Number(q.id),
            selectedAnswer: WRONG_FILL_SENTINEL,
         });

         console.log("%c[UI ←] penalty 99 OK", "color:#0a0;font-weight:bold");
      } catch (e) {
         console.warn("[penalty 99] submit failed", e);
      }

      return true;
   }, []);

   // penalizare o singură dată per eveniment, fără FAIL automat
   const penalizeOnceThenContinue = useCallback(
      async (reason = "visibility") => {
         if (
            viewRef.current !== "test" ||
            !examRef.current ||
            finishingRef.current
         )
            return;

         // cooldown anti dublare
         const now = Date.now();
         if (now - penaltyCooldownRef.current < 1200) return;
         penaltyCooldownRef.current = now;

         const curQ = (questionsRef.current || [])[idxRef.current];
         if (curQ) {
            const changed = await answerOneAsWrong99(curQ, reason);
            if (changed) {
               setError(
                  "Ai părăsit fereastra. Întrebarea curentă a fost marcată greșit (penalizare). Poți continua examenul."
               );
            }
         }

         // re-evaluăm după ce state-ul s-a aplicat
         setTimeout(() => {
            const amap = answersMapRef.current || {};
            const mistakes =
               Object.values(amap).filter(
                  (a) => a?.selected != null && a.correct === false
               ).length || 0;

            if (mistakes = MAX_MISTAKES_TO_END) {
               endExamAsFailed(); // a 3-a greșeală => FAIL
            } else {
               // mergem mai departe la următoarea întrebare necompletată
               autoNext(amap);
            }
         }, 0);
      },
      [answerOneAsWrong99]
   );

   useEffect(() => {
      (async () => {
         try {
            const p = await getMyPermissionStatus();
            setPerm(p);
         } catch (e) {
            setError(e?.message || "Nu am putut verifica permisiunea.");
         } finally {
            setCheckingPerm(false);
         }
      })();
   }, []);

   useEffect(() => {
      if (checkingPerm) return;
      if (computeIsAllowed(perm)) {
         if (pollingRef.current) clearInterval(pollingRef.current);
         pollingRef.current = null;
         return;
      }
      pollingRef.current = setInterval(async () => {
         try {
            const p = await getMyPermissionStatus();
            setPerm(p);
         } catch {}
      }, 3000);
      return () => {
         pollingRef.current && clearInterval(pollingRef.current);
         pollingRef.current = null;
      };
   }, [checkingPerm, perm]);

   useEffect(() => {
      if (view !== "waiting" || !user?.id) return;
      let cancelled = false;

      (async () => {
         setAttemptsLoading(true);
         setAttemptsError("");
         try {
            const pageSize = 50;
            let page = 1;
            const all = [];
            for (;;) {
               const batch = await getStudentExamHistory({
                  page,
                  limit: pageSize,
               });
               const items = Array.isArray(batch)
                  ? batch
                  : batch?.data || batch?.items || batch?.results || [];
               if (!items?.length) break;
               all.push(...items);

               const totalPages =
                  batch?.pagination?.totalPages ??
                  batch?.meta?.totalPages ??
                  batch?.totalPages ??
                  null;

               if (totalPages ? page >= totalPages : items.length < pageSize)
                  break;
               page += 1;
            }

            const normalized = all.map(normalizeAttempt).sort((a, b) => {
               const ta = a.startedAt ? Date.parse(a.startedAt) : 0;
               const tb = b.startedAt ? Date.parse(b.startedAt) : 0;
               return tb - ta;
            });

            if (!cancelled) setAttempts(normalized);
         } catch (e) {
            if (!cancelled)
               setAttemptsError(
                  e?.message || "Nu am putut încărca încercările."
               );
         } finally {
            if (!cancelled) setAttemptsLoading(false);
         }
      })();

      return () => {
         cancelled = true;
      };
   }, [view, user?.id]);

   const buildCorrectMap = async (started) => {
      try {
         const tid =
            Number(started?.ticketId) ||
            Number(started?.ticket?.id) ||
            Number(started?.ticketID) ||
            null;
         if (!Number.isInteger(tid) || tid <= 0) {
            setCorrectMap({});
            setCorrectMapLoaded(true);
            return;
         }
         const qs = await getTicketQuestions(tid);
         const m = {};
         (qs || []).forEach((q) => {
            const qid = Number(q?.id);
            const ci = normalizeCorrectIdx(
               q?.correctAnswer,
               Number(q?.answers?.length || 0)
            );
            if (Number.isInteger(qid) && Number.isInteger(ci)) m[qid] = ci;
         });
         setCorrectMap(m);
      } catch (e) {
         console.warn("[Exam UI] Nu am putut încărca cheia ticketului:", e);
         setCorrectMap({});
      } finally {
         setCorrectMapLoaded(true);
      }
   };

   const verifyAnswerLocal = (qId, selectedIdx0) => {
      if (!Object.prototype.hasOwnProperty.call(correctMap, qId)) return null;
      return Number(correctMap[qId]) === Number(selectedIdx0);
   };

   const handleStart = async () => {
      setError("");
      setCorrectMap({});
      setCorrectMapLoaded(false);
      try {
         let p = await getMyPermissionStatus();
         if (!computeIsAllowed(p)) {
            if (!user?.id)
               throw new Error("Nu știu ID-ul utilizatorului curent.");
            await grantExamPermissionExact({
               userId: Number(user.id),
               validUntil: isoToSecondsUTC(isoFromNowPlusMinutes(90)),
               maxAttempts: 3,
            });
            const t0 = Date.now();
            do {
               await new Promise((r) => setTimeout(r, 400));
               p = await getMyPermissionStatus();
            } while (!computeIsAllowed(p) && Date.now() - t0 < 6000);
            if (!computeIsAllowed(p)) {
               throw new Error(
                  "Permisiunea nu a devenit activă încă. Reîncearcă în câteva secunde."
               );
            }
            setPerm(p);
         }

         const started = await startExam({
            userId: Number(user.id),
            timeLimit: 30,
            passScore: 22,
         });
         setExam(started);

         const serverQs = Array.isArray(started?.questions)
            ? started.questions
            : [];
         let normalized = (serverQs || [])
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((q) => ({
               id: q.id,
               text: q.text,
               image: rewriteImageUrl(q.image || ""),
               answers: q.answers || [],
               order: q.order,
            }));

         if (!serverQs.length) {
            const fresh = await getExam(started.id);
            setExam(fresh);
            const q2 = Array.isArray(fresh?.questions) ? fresh.questions : [];
            normalized = (q2 || [])
               .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
               .map((q) => ({
                  id: q.id,
                  text: q.text,
                  image: rewriteImageUrl(q.image || ""),
                  answers: q.answers || [],
                  order: q.order,
               }));
         }

         setQuestions(normalized);

         const limitMin = Number(started?.timeLimit ?? 30);
         const secs = secsRemainingFromServer(started?.startedAt, limitMin);
         startTimer(secs);

         setIdx(0);
         setAnswersMap({});
         setView("test");

         await buildCorrectMap(started);
         setTimeout(
            () =>
               requestAnimationFrame(() =>
                  requestAnimationFrame(scrollToQText)
               ),
            0
         );
      } catch (e) {
         setError(e?.message || "Nu am putut porni examenul.");
      }
   };

   const current = questions[idx] || null;
   const total = questions.length;
   const passScore = Number(exam?.passScore ?? 22);
   const allowedWrongBackend = Math.max(0, total - passScore);

   const mistakesMade = useMemo(
      () =>
         Object.values(answersMap).filter(
            (a) => a?.selected != null && a.correct === false
         ).length,
      [answersMap]
   );
   const livesLeft = Math.max(0, maxLives - mistakesMade);

   const statusBoard = useMemo(() => {
      if (!questions.length) return [];
      return questions.map((q, i) => {
         const a = answersMap[q.id];
         let status = "none";
         if (a?.selected != null) {
            if (a.correct === true) status = "ok";
            else if (a.correct === false) status = "bad";
         }
         return { i, status };
      });
   }, [questions, answersMap]);

   const jumpTo = (i) => {
      const clamped = Math.max(0, Math.min(i, total - 1));
      setIdx(clamped);
      requestAnimationFrame(() => requestAnimationFrame(scrollToQText));
   };
   const goPrev = () => jumpTo(Math.max(0, idx - 1));
   const goNext = () => jumpTo(Math.min(total - 1, idx + 1));

   useEffect(() => {
      if (!current) return;
      const raf = requestAnimationFrame(() =>
         requestAnimationFrame(scrollToQText)
      );
      return () => cancelAnimationFrame(raf);
   }, [idx, current]);

   const autoNext = (nextMap) => {
      if (!questions.length) return;

      for (let i = idx + 1; i < questions.length; i++) {
         const q = questions[i];
         const a = nextMap[q.id];
         if (!a || a.selected == null) {
            jumpTo(i);
            return;
         }
      }
      for (let i = 0; i < idx; i++) {
         const q = questions[i];
         const a = nextMap[q.id];
         if (!a || a.selected == null) {
            jumpTo(i);
            return;
         }
      }
      setView("result");
   };

   // FAIL pe tot examenul
   const endExamAsFailed = async () => {
      if (finishingRef.current || !examRef.current) return;
      finishingRef.current = true;
      try {
         const id = Number(examRef.current.id);
         console.log("%c[UI →] failExam", "color:#a00;font-weight:bold", {
            examId: id,
         });
         try {
            await failExam(id);
            console.log("%c[UI ←] failExam OK", "color:#0a0;font-weight:bold");
         } catch (e) {
            console.warn("[failExam] call failed:", e);
         }
         timerRef.current && clearInterval(timerRef.current);
         try {
            const fresh = await getExam(id);
            setExam(fresh);
         } catch {}
         setView("result");
      } finally {
         finishingRef.current = false;
      }
   };

   const onChoose = async (clientIdx0) => {
      if (!exam || !current) return;
      if (remaining <= 0) return;

      const existing = answersMap[current.id];
      if (existing && existing.selected != null) return;
      if (answerLoading === current.id || finishingRef.current) return;
      setAnswerLoading(current.id);

      const payload = {
         questionId: Number(current.id),
         selectedAnswer: Number(clientIdx0) + 1,
      };

      const localVerdict = verifyAnswerLocal(current.id, Number(clientIdx0)); // true | false | null

      let next = {
         ...answersMap,
         [current.id]: {
            selected: Number(clientIdx0),
            correct: localVerdict,
            at: new Date().toISOString(),
         },
      };
      setAnswersMap(next);

      let badNow =
         Object.values(next).filter(
            (a) => a?.selected != null && a.correct === false
         ).length || 0;

      // a 3-a greșeală => FAIL
      if (badNow >= MAX_MISTAKES_TO_END) {
         setAnswerLoading(null);
         await endExamAsFailed();
         return;
      }

      setTimeout(() => autoNext(next), 250);

      try {
         const resp = await submitExamAnswer(Number(exam.id), payload);
         const serverCorrect =
            typeof resp?.correct === "boolean" ? resp.correct : null;
         const finalCorrect =
            serverCorrect !== null ? serverCorrect : localVerdict;

         if (finalCorrect !== next[current.id].correct) {
            next = {
               ...next,
               [current.id]: { ...next[current.id], correct: finalCorrect },
            };
            setAnswersMap(next);
         }

         badNow =
            Object.values(next).filter(
               (a) => a?.selected != null && a.correct === false
            ).length || 0;

         if (badNow >= MAX_MISTAKES_TO_END) {
            setAnswerLoading(null);
            await endExamAsFailed();
            return;
         }

         // Dacă oricum nu mai poți atinge scorul de trecere, încheie ca FAIL
         if (
            badNow >
            Math.max(0, questions.length - Number(exam?.passScore ?? 22))
         ) {
            await endExamAsFailed();
            return;
         }
      } catch (e) {
         setError(e?.message || "Nu am putut trimite răspunsul.");
      } finally {
         setAnswerLoading(null);
      }
   };

   /* ====== Protecții la părăsire ====== */

   // 1) Navigare internă (Link / useNavigate) – confirm + penalizare (99) pe întrebarea curentă, dar NU FAIL
   useLeaveGuard(view === "test", penalizeOnceThenContinue);

   // 2) Tab switch/minimize – doar penalizare (99) și continuă; FAIL doar dacă devine greșeala a 3-a
   useEffect(() => {
      if (view !== "test") return;
      let cooldown = false;
      const onVis = () => {
         if (document.hidden) {
            if (cooldown) return;
            cooldown = true;
            penalizeOnceThenContinue("visibility");
            setTimeout(() => (cooldown = false), 1500);
         }
      };
      document.addEventListener("visibilitychange", onVis);
      return () => document.removeEventListener("visibilitychange", onVis);
   }, [view, penalizeOnceThenContinue]);

   // 3) Reload/Close tab (beforeunload) + pagehide – penalizare (99) înainte de a ieși efectiv
   useEffect(() => {
      if (view !== "test") return;

      const onBeforeUnload = (e) => {
         e.preventDefault();
         e.returnValue = LEAVE_WARNING_TEXT;
         return LEAVE_WARNING_TEXT;
      };
      const onPageHide = () => penalizeOnceThenContinue("pagehide");

      window.addEventListener("beforeunload", onBeforeUnload);
      window.addEventListener("pagehide", onPageHide);

      return () => {
         window.removeEventListener("beforeunload", onBeforeUnload);
         window.removeEventListener("pagehide", onPageHide);
      };
   }, [view, penalizeOnceThenContinue]);

   // timer out => închide local (poți apela endExamAsFailed dacă vrei FAIL și aici)
   useEffect(() => {
      if (remaining === 0 && exam && view === "test") {
         setView("result");
         timerRef.current && clearInterval(timerRef.current);
      }
   }, [remaining, exam, view]);

   const verdict = useMemo(() => {
      const failedByLives = mistakesMade >= maxLives;
      const failedByBackend =
         mistakesMade >
         Math.max(0, questions.length - Number(exam?.passScore ?? 22));
      const failed = failedByLives || failedByBackend || remaining === 0;
      return failed ? "FAILED" : "PASSED";
   }, [mistakesMade, maxLives, exam?.passScore, questions.length, remaining]);

   return (
      <div className="practice exam">
         {error && <div className="practice__error">{error}</div>}

         {view === "waiting" && (
            <>
               <div className="card top">
                  {checkingPerm ? (
                     <p>Se verifică permisiunea…</p>
                  ) : computeIsAllowed(perm) ? (
                     <>
                        <h2>Permisiune activă</h2>
                        {perm?.validUntil && (
                           <p>
                              Valabil până la:{" "}
                              {new Date(perm.validUntil).toLocaleString()}
                           </p>
                        )}
                        <button
                           className="practice__back bottom green "
                           onClick={handleStart}
                        >
                           Începe examenul
                        </button>
                     </>
                  ) : (
                     <>
                        <h2>Examen</h2>
                        <p>
                           Nu ai încă permisiune pentru examen. Apasă “Începe
                           examenul”.
                        </p>
                        <button
                           onClick={async () => {
                              try {
                                 const p = await getMyPermissionStatus();
                                 setPerm(p);
                              } catch {}
                           }}
                           className="practice__back bottom"
                        >
                           Re-verifică acum
                        </button>
                     </>
                  )}
               </div>

               {/* ISTORIC ÎNCERCĂRI */}
               <div className="card list">
                  <h4>Încercările tale la examen</h4>
                  {attemptsLoading && <p>Se încarcă încercările…</p>}
                  {attemptsError && <p>{attemptsError}</p>}
                  {!attemptsLoading &&
                     !attemptsError &&
                     attempts.length === 0 && <p>Nu există încercări.</p>}
                  {!attemptsLoading &&
                     !attemptsError &&
                     attempts.length > 0 && (
                        <div className="practice__history">
                           {attempts.slice(0, 20).map((a) => {
                              const status = a.status.toLowerCase();
                              const started = a.startedAt
                                 ? new Date(a.startedAt).toLocaleString()
                                 : "–";
                              const finished = a.finishedAt
                                 ? new Date(a.finishedAt).toLocaleString()
                                 : null;
                              const lineLeft = finished
                                 ? `${started} → ${finished}`
                                 : `${started}`;
                              const scoreText =
                                 a.scorePct != null
                                    ? `${Math.round(a.scorePct)}%`
                                    : a.correct != null && a.total != null
                                    ? `${a.correct}/${a.total}`
                                    : a.correct != null && a.wrong != null
                                    ? `${a.correct} corecte / ${a.wrong} greșite`
                                    : "–";
                              return (
                                 <div
                                    key={a.id}
                                    className={`practice__history-item practice__history-item--${status}`}
                                 >
                                    <div>
                                       <div>{status.toLowerCase()}</div>
                                       <div>{lineLeft}</div>
                                    </div>
                                    <div>
                                       <div>{scoreText}</div>
                                       {a.total != null && (
                                          <div>{a.total} întrebări</div>
                                       )}
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                     )}
               </div>
            </>
         )}

         {view === "test" && exam && current && (
            <>
               {/* Toolbar */}
               <div className="practice__toolbar">
                  <button
                     className="practice__back"
                     onClick={() => {
                        setView("result"); // dacă vrei FAIL la “Încheie”, înlocuiește cu: endExamAsFailed()
                     }}
                  >
                     Încheie
                  </button>

                  <div className="practice__toolbar-center">
                     <div className="practice__question-index">
                        Întrebarea {Math.min(idx + 1, total)}/{total}
                     </div>

                     {useHearts ? (
                        <div
                           className="lives__pill"
                           aria-label={`Vieți: ${livesLeft}/${maxLives}`}
                        >
                           {Array.from({ length: maxLives }).map((_, i) => {
                              const lost = i < mistakesMade;
                              const pulse = i === mistakesMade - 1;
                              return (
                                 <ReactSVG
                                    key={i}
                                    src={lost ? heartCrackIcon : heartFullIcon}
                                    className={
                                       "lives__icon" +
                                       (lost
                                          ? " lives__icon--lost"
                                          : " lives__icon--full") +
                                       (pulse ? " lives__icon--pulse" : "")
                                    }
                                    beforeInjection={(svg) => {
                                       svg.setAttribute("aria-hidden", "true");
                                       svg.setAttribute("focusable", "false");
                                    }}
                                 />
                              );
                           })}
                        </div>
                     ) : (
                        <div
                           className="lives__pill lives__pill--dots"
                           aria-label={`Greșeli: ${mistakesMade}/${maxLives}`}
                        >
                           {Array.from({ length: maxLives }).map((_, i) => {
                              const active = i < mistakesMade;
                              return (
                                 <span
                                    key={i}
                                    className={
                                       "lives__dot" +
                                       (active ? " lives__dot--on" : "")
                                    }
                                 />
                              );
                           })}
                        </div>
                     )}
                  </div>

                  <div className="practice__timer">{prettyTime(remaining)}</div>
               </div>

               {/* Status board */}
               <div className="practice__statusboard">
                  {statusBoard.map(({ i, status }) => (
                     <button
                        key={i}
                        className={
                           "practice__dot" +
                           (i === idx ? " practice__dot--current" : "") +
                           (status === "ok" ? " practice__dot--ok" : "") +
                           (status === "bad" ? " practice__dot--bad" : "") +
                           (status === "none" ? " practice__dot--none" : "")
                        }
                        title={`Întrebarea ${i + 1}`}
                        onClick={() => jumpTo(i)}
                     >
                        {i + 1}
                     </button>
                  ))}
               </div>

               {/* Card întrebare */}
               <div className="practice__question">
                  <div className="practice__qtext" ref={qTextRef}>
                     {current.text}
                  </div>

                  <div className="practice__row">
                     <div className="practice__qimage-wrapper">
                        {current?.image && (
                           <img
                              key={`${exam.id}-${current.id}-${idx}`}
                              className="practice__qimage"
                              src={
                                 current.image +
                                 (current.image.includes("?") ? "&" : "?") +
                                 `v=${exam.id}-${current.id}-${idx}`
                              }
                              alt="Întrebare"
                              onError={(e) => (e.currentTarget.hidden = true)}
                           />
                        )}
                     </div>

                     {current?.image && (
                        <div className="practice__qimage-wrapper mobile">
                           <img
                              key={`${exam.id}-${current.id}-${idx}-m`}
                              className="practice__qimage"
                              src={
                                 current.image +
                                 (current.image.includes("?") ? "&" : "?") +
                                 `v=${exam.id}-${current.id}-${idx}-m`
                              }
                              alt="Întrebare"
                              onError={(e) => (e.currentTarget.hidden = true)}
                           />
                        </div>
                     )}

                     <div className="practice__answers">
                        {(current.answers || []).map((ans, i) => {
                           const saved = answersMap[current.id];
                           const already = !!saved && saved.selected != null;
                           const selectedIdx = already
                              ? Number(saved.selected)
                              : null;

                           const correctIdx =
                              already &&
                              Object.prototype.hasOwnProperty.call(
                                 correctMap,
                                 current.id
                              )
                                 ? Number(correctMap[current.id])
                                 : null;

                           const isCorrectOption =
                              already &&
                              Number.isInteger(correctIdx) &&
                              i === correctIdx;
                           const isWrongSelected =
                              already &&
                              selectedIdx === i &&
                              Number.isInteger(correctIdx) &&
                              selectedIdx !== correctIdx;

                           const isBusy = answerLoading === current.id;

                           const className =
                              "practice__answer" +
                              (isCorrectOption
                                 ? " practice__answer--correct"
                                 : "") +
                              (isWrongSelected
                                 ? " practice__answer--wrong-selected"
                                 : "") +
                              (already ? " practice__answer--locked" : "") +
                              (isBusy && !already
                                 ? " practice__answer--loading"
                                 : "");

                           return (
                              <button
                                 key={i}
                                 className={className}
                                 onClick={() => onChoose(i)}
                                 disabled={already || isBusy}
                                 title={
                                    already
                                       ? "Răspuns blocat"
                                       : "Alege răspunsul"
                                 }
                              >
                                 <span>{ans}</span>
                              </button>
                           );
                        })}
                     </div>
                  </div>

                  <div className="practice__actions">
                     <button
                        type="button"
                        className="practice__back bottom"
                        onClick={goPrev}
                        disabled={idx === 0}
                     >
                        Înapoi
                     </button>
                     <div className="practice__spacer" />
                     <button
                        type="button"
                        className="practice__secondary practice__secondary--primary"
                        onClick={goNext}
                        disabled={idx >= total - 1}
                     >
                        Următorul
                     </button>
                  </div>
               </div>
            </>
         )}

         {view === "result" && exam && (
            <div className="card top">
               <h2>
                  {verdict === "PASSED"
                     ? "Ai promovat ✅"
                     : "Nu ai promovat ❌"}
               </h2>
               <p>
                  {" "}
                  Întrebări: <b>{total}</b> • Greșeli:{" "}
                  <b>
                     {mistakesMade}/{maxLives}
                  </b>{" "}
                  • Timp rămas: <b>{prettyTime(remaining)}</b>
               </p>
               <button
                  onClick={() => {
                     setView("waiting");
                     setExam(null);
                     setQuestions([]);
                     setAnswersMap({});
                     setIdx(0);
                     setRemaining(0);
                     setError("");
                  }}
                  className="practice__back bottom"
               >
                  Înapoi la început
               </button>
            </div>
         )}
      </div>
   );
}
