// src/components/.../ExamPracticeUI.jsx
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
import { updateUser } from "../../api/usersService";
import { rewriteImageUrl } from "../Utils/rewriteImageUrl";
import { ReactSVG } from "react-svg";
import heartFullIcon from "../../assets/svg/mingcute--heart-fill.svg";
import heartCrackIcon from "../../assets/svg/mingcute--heart-crack-fill.svg";
import addIcon from "../../assets/svg/add-s.svg";
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

const onlyDigits13 = (v) =>
   String(v || "")
      .replace(/\D/g, "")
      .slice(0, 13);
const isIdnp13 = (v) => /^\d{13}$/.test(String(v || ""));

/** ✅ permisiune “activă” doar când avem fereastră validă & încadrări */
const computeIsAllowed = (perm) => {
   if (!perm) return false;
   if (perm.allowed === true) return true;
   const isActive = perm.isActive !== false;
   const hasValidUntil =
      typeof perm.validUntil === "string" &&
      !Number.isNaN(Date.parse(perm.validUntil));
   const stillValid = hasValidUntil && Date.parse(perm.validUntil) > Date.now();
   const hasMax =
      perm.maxAttempts != null && !Number.isNaN(Number(perm.maxAttempts));
   const used = Number(perm.usedAttempts ?? 0);
   const maxA = Number(perm.maxAttempts ?? 0);
   const attemptsOk = hasMax && used < maxA;
   return Boolean(isActive && stillValid && attemptsOk);
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
const PASS_SCORE_DEFAULT = 46; // ✅ prag de promovare
const WRONG_FILL_SENTINEL = 99;
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
               unblock();
               tx.retry();
            }
         }
      });
      return unblock;
   }, [when, nav, onConfirm]);
}

/** Traduceri status -> RO */
const roStatus = (s) => {
   const k = String(s || "").toLowerCase();
   if (k.includes("failed") || k === "fail") return "respins";
   if (k.includes("completed") || k === "finished" || k === "done")
      return "admis";
   if (
      k.includes("in_progress") ||
      k.includes("in-progress") ||
      k === "inprogress"
   )
      return "în desfășurare";
   return s || "—";
};

export default function ExamPracticeUI({ maxLives = 3, useHearts = true }) {
   const { user, setUser } = useContext(UserContext) || {};

   const [view, setView] = useState("waiting"); // waiting | test | result
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

   /* ---------- UI: tranziție spre rezultat ---------- */
   const FADE_MS = 380;
   const [resultTransitioning, setResultTransitioning] = useState(false);
   const [resultAnimOn, setResultAnimOn] = useState(false);

   /* ---------- IDNP gate state ---------- */
   const hasIdnp = useMemo(() => isIdnp13(user?.idnp), [user?.idnp]);
   const [idnp, setIdnp] = useState(hasIdnp ? String(user?.idnp) : "");
   const [idnpBusy, setIdnpBusy] = useState(false);
   const [idnpMsg, setIdnpMsg] = useState(null);
   const [manualIdnpEditor, setManualIdnpEditor] = useState(false); // ✅ buton "Modifică IDNP"

   const qTextRef = useRef(null);
   const timerRef = useRef(null);
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

   // ținem inputul sincron când user.idnp se schimbă
   useEffect(() => {
      if (hasIdnp) setIdnp(String(user?.idnp || ""));
   }, [hasIdnp, user?.idnp]);

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

   /* ---------- penalizări ---------- */
   const answerOneAsWrong99 = useCallback(async (q, reason = "penalty") => {
      if (!q || !examRef.current) return false;
      const already = (answersMapRef.current || {})[q.id];
      if (already && already.selected != null) return false;

      setAnswersMap((prev) => ({
         ...prev,
         [q.id]: {
            selected: WRONG_FILL_SENTINEL,
            correct: false,
            at: new Date().toISOString(),
            reason,
         },
      }));

      try {
         await submitExamAnswer(Number(examRef.current.id), {
            questionId: Number(q.id),
            selectedAnswer: WRONG_FILL_SENTINEL,
         });
      } catch (e) {
         console.warn("[penalty 99] submit failed", e);
      }
      return true;
   }, []);

   // helper: câte greșeli sunt permise ca să mai poți atinge passScore
   const getAllowedWrong = useCallback(() => {
      const totalQ = (questionsRef.current || []).length || 0;
      const pass = Number(examRef.current?.passScore ?? PASS_SCORE_DEFAULT);
      return Math.max(0, totalQ - pass);
   }, []);

   const penalizeOnceThenContinue = useCallback(
      async (reason = "visibility") => {
         if (
            viewRef.current !== "test" ||
            !examRef.current ||
            finishingRef.current
         )
            return;
         const now = Date.now();
         if (now - penaltyCooldownRef.current < 1200) return;
         penaltyCooldownRef.current = now;

         const curQ = (questionsRef.current || [])[idxRef.current];
         if (curQ) {
            const changed = await answerOneAsWrong99(curQ, reason);
            if (changed)
               setError(
                  "Ai părăsit fereastra. Întrebarea curentă a fost marcată greșit (penalizare). Poți continua examenul."
               );
         }

         setTimeout(() => {
            const amap = answersMapRef.current || {};
            const mistakes =
               Object.values(amap).filter(
                  (a) => a?.selected != null && a.correct === false
               ).length || 0;
            const allowedWrong = getAllowedWrong();
            if (mistakes > allowedWrong) endExamAsFailed();
            else autoNext(amap);
         }, 0);
      },
      [answerOneAsWrong99, getAllowedWrong]
   );

   /* ---------- permisiune: polling continuu la 3s ---------- */
   useEffect(() => {
      let cancelled = false;
      let t;
      const tick = async () => {
         try {
            const p = await getMyPermissionStatus();
            if (!cancelled) setPerm(p);
         } catch {
            // nu stricăm UI dacă e eroare la fetch
         } finally {
            if (!cancelled) t = setTimeout(tick, 3000);
         }
      };
      tick();
      return () => {
         cancelled = true;
         if (t) clearTimeout(t);
      };
   }, []);

   /* ---------- istoric ---------- */
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

   /* === gate logic: input IDNP doar când NU există încercări; dar se poate deschide manual === */
   const hasAnyAttempt = attempts.length > 0;
   const baseShowIdnpGate = useMemo(() => {
      if (attemptsLoading) return false; // așteptăm încărcarea
      if (attemptsError) return true; // conservator: cerem IDNP
      return !hasAnyAttempt; // fără încercări → arătăm inputul
   }, [attemptsLoading, attemptsError, hasAnyAttempt]);
   const showIdnpGate = baseShowIdnpGate || manualIdnpEditor; // ✅ poate fi forțat din buton

   /* ---------- cheie corectă ---------- */
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

   /* ---------- START exam (passScore = 46) ---------- */
   const handleStart = async () => {
      setError("");

      if (showIdnpGate && !isIdnp13(user?.idnp)) {
         setError(
            "Completează și salvează IDNP (13 cifre) înainte de a începe examenul."
         );
         return;
      }

      setCorrectMap({});
      setCorrectMapLoaded(false);
      try {
         // re-check permisiune chiar la start
         let p = await getMyPermissionStatus();
         const allowedNow = computeIsAllowed(p);
         if (!allowedNow) {
            if (!user?.id)
               throw new Error("Nu știu ID-ul utilizatorului curent.");
            await grantExamPermissionExact({
               userId: Number(user.id),
               validUntil: isoToSecondsUTC(isoFromNowPlusMinutes(90)),
               maxAttempts: 3,
            });
            // mică așteptare până devine activ
            const t0 = Date.now();
            do {
               await new Promise((r) => setTimeout(r, 400));
               p = await getMyPermissionStatus();
            } while (!computeIsAllowed(p) && Date.now() - t0 < 6000);
            if (!computeIsAllowed(p))
               throw new Error(
                  "Permisiunea nu a devenit activă încă. Reîncearcă în câteva secunde."
               );
         }
         setPerm(p);

         const started = await startExam({
            userId: Number(user.id),
            timeLimit: 60,
            passScore: PASS_SCORE_DEFAULT, // ✅ prag corect
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
   const passScore = Number(exam?.passScore ?? PASS_SCORE_DEFAULT);

   const mistakesMade = useMemo(
      () =>
         Object.values(answersMap).filter(
            (a) => a?.selected != null && a.correct === false
         ).length,
      [answersMap]
   );
   const livesLeft = Math.max(0, maxLives - mistakesMade);

   // ✅ scor corect: fiecare răspuns corect = +1
   const correctAnsweredRaw = useMemo(
      () =>
         Object.values(answersMap).filter(
            (a) => a?.selected != null && a.correct === true
         ).length,
      [answersMap]
   );
   // Dacă a atins pragul (>=46), restul se consideră corecte la AFIȘARE
   const correctAnsweredForDisplay =
      total > 0 && correctAnsweredRaw >= passScore ? total : correctAnsweredRaw;
   const resultPct =
      total > 0 ? Math.round((correctAnsweredForDisplay / total) * 100) : 0;

   const statusBoard = useMemo(() => {
      if (!questions.length) return [];
      return questions.map((q, i) => {
         const a = answersMap[q.id];
         let status = "none";
         if (a?.selected != null)
            status =
               a.correct === true ? "ok" : a.correct === false ? "bad" : "none";
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

   const goToResult = useCallback(() => {
      if (viewRef.current === "result") return;
      setResultTransitioning(true); // fade-out test
      setTimeout(() => {
         setView("result");
         setResultTransitioning(false);
         setResultAnimOn(false);
         // mic pop-in la rezultat
         setTimeout(() => setResultAnimOn(true), 30);
      }, FADE_MS);
   }, []);

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
      goToResult(); // 🔄 tranziție spre rezultat
   };

   const endExamAsFailed = useCallback(() => {
      if (finishingRef.current || !examRef.current) return;
      finishingRef.current = true;
      const id = Number(examRef.current.id);
      timerRef.current && clearInterval(timerRef.current);
      goToResult(); // 🔄 tranziție
      (async () => {
         try {
            try {
               await failExam(id);
            } catch (e) {
               console.warn("[failExam] call failed:", e);
            }
            try {
               const fresh = await getExam(id);
               setExam(fresh);
            } catch (e) {}
         } finally {
            finishingRef.current = false;
         }
      })();
   }, [goToResult]);

   const getEffectiveCorrectIdx = (qId) => {
      if (Object.prototype.hasOwnProperty.call(correctMap, qId))
         return Number(correctMap[qId]);
      const saved = answersMap[qId];
      if (saved?.serverCorrectIdx != null)
         return Number(saved.serverCorrectIdx);
      return null;
   };

   const onChoose = async (clientIdx0) => {
      if (!exam || !current) return;
      if (remaining <= 0) return;
      if (viewRef.current !== "test") return;

      const existing = answersMap[current.id];
      if (existing && existing.selected != null) return;
      if (answerLoading === current.id || finishingRef.current) return;
      setAnswerLoading(current.id);

      const payload = {
         questionId: Number(current.id),
         selectedAnswer: Number(clientIdx0),
      };
      const localVerdict = verifyAnswerLocal(current.id, Number(clientIdx0));

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
      // ❗️terminăm dacă nu mai putem atinge passScore
      if (badNow > Math.max(0, questions.length - passScore)) {
         setAnswerLoading(null);
         endExamAsFailed();
         return;
      }
      setTimeout(() => autoNext(next), 250);

      try {
         const resp = await submitExamAnswer(Number(exam.id), payload);
         const serverCorrect =
            typeof resp?.correct === "boolean" ? resp.correct : null;
         const serverCorrectIdx = normalizeCorrectIdx(
            resp?.correctAnswer,
            (current.answers || []).length
         );
         const explanation = (resp?.explanation ?? "").trim() || null;

         if (Number.isInteger(serverCorrectIdx))
            setCorrectMap((m) => ({ ...m, [current.id]: serverCorrectIdx }));
         const finalCorrect =
            serverCorrect !== null ? serverCorrect : localVerdict;

         if (
            finalCorrect !== next[current.id].correct ||
            explanation != null ||
            Number.isInteger(serverCorrectIdx)
         ) {
            next = {
               ...next,
               [current.id]: {
                  ...next[current.id],
                  correct: finalCorrect,
                  serverCorrectIdx: Number.isInteger(serverCorrectIdx)
                     ? serverCorrectIdx
                     : next[current.id]?.serverCorrectIdx ?? null,
                  explanation,
               },
            };
            setAnswersMap(next);
         }

         badNow =
            Object.values(next).filter(
               (a) => a?.selected != null && a.correct === false
            ).length || 0;
         if (badNow > Math.max(0, questions.length - passScore)) {
            setAnswerLoading(null);
            endExamAsFailed();
            return;
         }
      } catch (e) {
         setError(e?.message || "Nu am putut trimite răspunsul.");
      } finally {
         setAnswerLoading(null);
      }
   };

   /* ====== Protecții la părăsire ====== */
   useLeaveGuard(view === "test", penalizeOnceThenContinue);
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

   useEffect(() => {
      if (remaining === 0 && exam && view === "test") {
         timerRef.current && clearInterval(timerRef.current);
         goToResult(); // 🔄 tranziție când expiră timpul
      }
   }, [remaining, exam, view, goToResult]);

   const verdict = useMemo(() => {
      // ✅ dacă ai atins passScore, e PASS
      const passed = correctAnsweredRaw >= passScore;
      const failedByBackend =
         mistakesMade > Math.max(0, questions.length - passScore);
      const failedByTime = remaining === 0 && !passed;
      return passed
         ? "PASSED"
         : failedByBackend || failedByTime
         ? "FAILED"
         : "PASSED";
   }, [
      correctAnsweredRaw,
      mistakesMade,
      passScore,
      questions.length,
      remaining,
   ]);

   /* ===================== RENDER ===================== */
   // sus, lângă alte hooks:
   const fmtRO = React.useMemo(
      () =>
         new Intl.DateTimeFormat("ro-MD", {
            timeZone: "Europe/Chisinau",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false, // 24h
         }),
      []
   );

   const allowed = computeIsAllowed(perm);

   const startDisabled = attemptsLoading || (baseShowIdnpGate && !hasIdnp);
   const startTitle = attemptsLoading
      ? "Se verifică istoricul…"
      : baseShowIdnpGate && !hasIdnp
      ? "Salvează mai întâi IDNP-ul"
      : "Începe examenul";

   return (
      <div className="practice exam">
         {/* ===== WAITING ===== */}
         {view === "waiting" && (
            <>
               <div className="card top">
                  {allowed ? (
                     <>
                        <h2>Permisiune activă</h2>

                        {/* === IDNP Gate (NUMAI dacă NU ai încercări) sau deschis manual === */}
                        {showIdnpGate && (
                           <div
                              className="exam-idnp"
                              style={{ margin: "6px 0 6px" }}
                           >
                              <div
                                 style={{
                                    display: "flex",
                                    gap: 6,
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                 }}
                              >
                                 {manualIdnpEditor && (
                                    <button
                                       className="practice__back bottom"
                                       onClick={() =>
                                          setManualIdnpEditor(false)
                                       }
                                       title="Închide editor IDNP"
                                    >
                                       <ReactSVG
                                          src={addIcon}
                                          className="practice__icon react-icon rotate45"
                                       />
                                    </button>
                                 )}
                                 <input
                                    id="idnp"
                                    type="tel"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    placeholder="IDNP-2001234567890"
                                    className="practice__input"
                                    value={idnp}
                                    onChange={(e) =>
                                       setIdnp(onlyDigits13(e.target.value))
                                    }
                                    onWheel={(e) => e.currentTarget.blur()}
                                    disabled={idnpBusy}
                                 />
                                 <button
                                    className="practice__back bottom green"
                                    onClick={async () => {
                                       setIdnpMsg(null);
                                       const clean = onlyDigits13(idnp);
                                       try {
                                          setIdnpBusy(true);
                                          const updated = await updateUser(
                                             Number(user.id),
                                             { idnp: clean }
                                          );
                                          if (typeof setUser === "function") {
                                             setUser({
                                                ...user,
                                                ...updated,
                                                idnp: updated?.idnp ?? clean,
                                             });
                                          }
                                          setIdnpMsg({
                                             type: "success",
                                             text: "IDNP salvat.",
                                          });
                                          if (manualIdnpEditor)
                                             setManualIdnpEditor(false);
                                       } catch (e) {
                                          let t = "Eroare la salvare.";
                                          try {
                                             const parsed = JSON.parse(
                                                String(e?.message || "{}")
                                             );
                                             if (parsed?.message)
                                                t = Array.isArray(
                                                   parsed.message
                                                )
                                                   ? parsed.message.join(" ")
                                                   : parsed.message;
                                          } catch {}
                                          setIdnpMsg({
                                             type: "error",
                                             text: t,
                                          });
                                       } finally {
                                          setIdnpBusy(false);
                                       }
                                    }}
                                    disabled={idnpBusy || !isIdnp13(idnp)}
                                    title={
                                       !isIdnp13(idnp)
                                          ? "IDNP trebuie să fie 13 cifre"
                                          : "Salvează"
                                    }
                                 >
                                    {idnpBusy ? "Se salvează…" : "Salvează"}
                                 </button>
                              </div>
                           </div>
                        )}

                        {perm?.validUntil && (
                           <p>
                              Acces acordat. Când ești pregătit, apasă „Începe
                              examenul”.
                           </p>
                        )}

                        <div
                           style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              marginTop: 8,
                           }}
                        >
                           <button
                              className="practice__back bottom green"
                              onClick={handleStart}
                              disabled={startDisabled}
                              title={startTitle}
                           >
                              Începe examenul
                           </button>

                           {/* ✅ vizibil mereu, chiar dacă inputul este ascuns */}
                           {!showIdnpGate && (
                              <button
                                 className="practice__back bottom"
                                 onClick={() => {
                                    setManualIdnpEditor((v) => !v);
                                    setIdnpMsg(null);
                                 }}
                                 title="Modifică IDNP"
                              >
                                 Modifică IDNP
                              </button>
                           )}
                        </div>
                     </>
                  ) : (
                     <>
                        <h2>Nu ai permisiunea</h2>
                        <p>Nu ai permisiunea pentru test în acest moment.</p>
                        <button
                           onClick={async () => {
                              try {
                                 const p = await getMyPermissionStatus();
                                 setPerm(p);
                              } catch {}
                           }}
                           className="practice__back bottom"
                        >
                           Verifică din nou
                        </button>

                        {showIdnpGate && (
                           <div className="exam-idnp" style={{ marginTop: 8 }}>
                              <input
                                 id="idnp2"
                                 type="tel"
                                 inputMode="numeric"
                                 autoComplete="off"
                                 placeholder="IDNP-2001234567890"
                                 className="practice__input"
                                 value={idnp}
                                 onChange={(e) =>
                                    setIdnp(onlyDigits13(e.target.value))
                                 }
                                 onWheel={(e) => e.currentTarget.blur()}
                                 disabled={idnpBusy}
                                 style={{ minWidth: 260 }}
                              />
                              <button
                                 className="practice__back bottom green"
                                 onClick={async () => {
                                    setIdnpMsg(null);
                                    const clean = onlyDigits13(idnp);
                                    try {
                                       setIdnpBusy(true);
                                       const updated = await updateUser(
                                          Number(user.id),
                                          { idnp: clean }
                                       );
                                       if (typeof setUser === "function") {
                                          setUser({
                                             ...user,
                                             ...updated,
                                             idnp: updated?.idnp ?? clean,
                                          });
                                       }
                                       setIdnpMsg({
                                          type: "success",
                                          text: "IDNP salvat.",
                                       });
                                       if (manualIdnpEditor)
                                          setManualIdnpEditor(false);
                                    } catch (e) {
                                       let t = "Eroare la salvare.";
                                       try {
                                          const parsed = JSON.parse(
                                             String(e?.message || "{}")
                                          );
                                          if (parsed?.message)
                                             t = Array.isArray(parsed.message)
                                                ? parsed.message.join(" ")
                                                : parsed.message;
                                       } catch {}
                                       setIdnpMsg({ type: "error", text: t });
                                    } finally {
                                       setIdnpBusy(false);
                                    }
                                 }}
                                 disabled={idnpBusy || !isIdnp13(idnp)}
                                 title={
                                    !isIdnp13(idnp)
                                       ? "IDNP trebuie să fie 13 cifre"
                                       : "Salvează"
                                 }
                                 style={{ marginLeft: 6 }}
                              >
                                 {idnpBusy ? "Se salvează…" : "Salvează"}
                              </button>
                              {idnpMsg && (
                                 <div
                                    style={{
                                       marginTop: 6,
                                       fontSize: 14,
                                       color:
                                          idnpMsg.type === "error"
                                             ? "#c00"
                                             : "#0a0",
                                    }}
                                 >
                                    {idnpMsg.text}
                                 </div>
                              )}
                           </div>
                        )}
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
                              const statusKey = String(
                                 a.status || ""
                              ).toLowerCase();
                              const statusText = roStatus(statusKey);

                              const started = a.startedAt
                                 ? fmtRO.format(new Date(a.startedAt))
                                 : "–";
                              const finished = a.finishedAt
                                 ? fmtRO.format(new Date(a.finishedAt))
                                 : null;

                              const totalQ = Number(
                                 a.total ?? a.totalQuestions ?? 0
                              );
                              const correctQRaw = Number(
                                 a.correct ?? a.correctCount ?? 0
                              );

                              // dacă a atins pragul (46), la AFIȘARE considerăm restul corecte
                              const effectiveCorrect =
                                 totalQ > 0 && correctQRaw >= PASS_SCORE_DEFAULT
                                    ? totalQ
                                    : correctQRaw;

                              // procent: backend (0–1 sau 0–100) ori calcul local (corecte/total)
                              let pct = null;
                              if (
                                 a.scorePct != null &&
                                 !Number.isNaN(Number(a.scorePct))
                              ) {
                                 const p = Number(a.scorePct);
                                 pct = Math.round(p <= 1 ? p * 100 : p);
                              } else if (totalQ > 0) {
                                 pct = Math.round(
                                    (effectiveCorrect / totalQ) * 100
                                 );
                              }
                              if (pct != null)
                                 pct = Math.max(0, Math.min(100, pct));

                              const scoreText =
                                 totalQ > 0
                                    ? `${Math.round( (a.scorePct * 100) / totalQ )}%`
                                    : pct != null
                                    ? `Scor: ${pct}%`
                                    : "–";
                              return (
                                 <div
                                    key={a.id}
                                    className={`practice__history-item practice__history-item--${statusKey}`}
                                 >
                                    <div>
                                       <div>{statusText}</div>
                                       <div>
                                          {started} → <br /> {finished || "—"}
                                       </div>
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

         {/* ===== TEST (cu fade out spre rezultat) ===== */}
         {view === "test" && exam && current && (
            <div
               style={{
                  opacity: resultTransitioning ? 0 : 1,
                  transition: `opacity ${FADE_MS}ms ease`,
               }}
            >
               <div className="practice__toolbar">
                  <button
                     className="practice__back"
                     onClick={() => {
                        goToResult(); // 🔄 tranziție
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

                           const effectiveCorrectIdx = already
                              ? getEffectiveCorrectIdx(current.id)
                              : null;
                           const isCorrectOption =
                              already &&
                              Number.isInteger(effectiveCorrectIdx) &&
                              i === effectiveCorrectIdx;
                           const isWrongSelected =
                              already &&
                              selectedIdx === i &&
                              Number.isInteger(effectiveCorrectIdx) &&
                              selectedIdx !== effectiveCorrectIdx;

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
            </div>
         )}

         {/* ===== RESULT (cu inimi crăpate = greșeli + pop-in ușor) ===== */}
         {view === "result" && exam && (
            <div
               className="card top"
               style={{
                  transform: resultAnimOn ? "scale(1)" : "scale(0.96)",
                  opacity: resultAnimOn ? 1 : 0,
                  transition: "transform 360ms ease, opacity 360ms ease",
               }}
            >
               <h2>
                  {verdict === "PASSED" ? "Ai promovat" : "Nu ai promovat"}
               </h2>

               <div
                  className="result__hearts"
                  aria-label={`Greșeli: ${mistakesMade}/${maxLives}`}
                  style={{
                     display: "flex",
                     gap: 8,
                     alignItems: "center",
                     margin: "8px 0 4px",
                  }}
               >
                  {Array.from({ length: maxLives }).map((_, i) => {
                     const cracked = i < mistakesMade; // ✅ atâtea inimi crapate câte greșeli
                     return (
                        <ReactSVG
                           key={i}
                           src={cracked ? heartCrackIcon : heartFullIcon}
                           className={
                              "lives__icon rezult" +
                              (cracked
                                 ? " lives__icon--lost"
                                 : " lives__icon--full")
                           }
                           beforeInjection={(svg) => {
                              svg.setAttribute("aria-hidden", "true");
                              svg.setAttribute("focusable", "false");
                           }}
                        />
                     );
                  })}
               </div>

               <p style={{ marginTop: 6 }}>
                  Întrebări: <b>{total}</b> • Greșeli făcute:{" "}
                  <b>{mistakesMade}</b> • Timp rămas:{" "}
                  <b>{prettyTime(remaining)}</b>
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
                  style={{ marginTop: 8 }}
               >
                  Înapoi la început
               </button>
            </div>
         )}
      </div>
   );
}
