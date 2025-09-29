// src/components/SPanel/Exam.jsx
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { UserContext } from "../../UserContext";

import {
   getMyPermissionStatus,
   grantExamPermissionExact,
   startExam,
   getExam,
   submitExamAnswer, // trimitem direct la backend
   isoFromNowPlusMinutes,
   isoToSecondsUTC,
   getTicketQuestions, // <— nou: ca să aflăm răspunsurile corecte din ticket (dacă există)
} from "../../api/examService";
import { rewriteImageUrl } from "../Utils/rewriteImageUrl";

import { ReactSVG } from "react-svg";
import heartFullIcon from "../../assets/svg/mingcute--heart-fill.svg";
import heartCrackIcon from "../../assets/svg/mingcute--heart-crack-fill.svg";

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

/** ===== dev: arată răspunsurile corecte =====
 *  - setează la true pentru preview rapid
 *  - sau adaugă ?showCorrect=1 în URL
 */
const SHOW_CORRECT_HINTS_DEFAULT = true;

export default function ExamPracticeUI({ maxLives = 3, useHearts = true }) {
   const { user } = useContext(UserContext) || {};

   // URL toggle (opțional)
   const showCorrectFromUrl =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("showCorrect") === "1";
   const SHOW_CORRECT_HINTS = showCorrectFromUrl || SHOW_CORRECT_HINTS_DEFAULT;

   /* ---------- views ---------- */
   const [view, setView] = useState("waiting"); // waiting | test | result

   /* ---------- permission ---------- */
   const [checkingPerm, setCheckingPerm] = useState(true);
   const [perm, setPerm] = useState(null);
   const [error, setError] = useState("");

   /* ---------- exam ---------- */
   const [exam, setExam] = useState(null);
   const [questions, setQuestions] = useState([]);
   const [idx, setIdx] = useState(0);
   const [answersMap, setAnswersMap] = useState({}); // { [qId]: { selected, correct: boolean|null } }
   const [remaining, setRemaining] = useState(0);

   const [answerLoading, setAnswerLoading] = useState(null); // questionId în curs (anti dublu-click)

   // hărțuire corecte: { [qId]: correctIndex }
   const [correctMap, setCorrectMap] = useState({}); // <— nou
   const [correctMapLoaded, setCorrectMapLoaded] = useState(false);

   const qTextRef = useRef(null);
   const timerRef = useRef(null);
   const pollingRef = useRef(null);

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

   /* ---------- permission check ---------- */
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

   /* ---------- start exam ---------- */
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

         // timer
         const limitMin = Number(started?.timeLimit ?? 30);
         const secs = secsRemainingFromServer(started?.startedAt, limitMin);
         startTimer(secs);

         setIdx(0);
         setAnswersMap({});
         setView("test");

         // === încărcăm răspunsurile corecte pentru preview (dacă activ) ===
         if (SHOW_CORRECT_HINTS) {
            try {
               // încercăm să găsim ticketId în exam
               const tid =
                  Number(started?.ticketId) ||
                  Number(started?.ticket?.id) ||
                  Number(started?.ticketID) ||
                  null;

               if (tid) {
                  const qs = await getTicketQuestions(tid); // trebuie să aibă correctAnswer
                  const map = {};
                  (qs || []).forEach((q) => {
                     const qid = Number(q?.id);
                     const ci = Number(q?.correctAnswer);
                     if (Number.isInteger(qid) && Number.isInteger(ci))
                        map[qid] = ci;
                  });
                  // fallback pentru întrebări lipsă
                  normalized.forEach((q) => {
                     if (!(q.id in map)) map[q.id] = 0; // dacă nu știm, marcăm prima opțiune pentru PREVIEW
                  });
                  setCorrectMap(map);
               } else {
                  // fără ticketId: punem prima opțiune ca „corectă” doar pentru preview
                  const map = {};
                  normalized.forEach((q) => (map[q.id] = 0));
                  setCorrectMap(map);
               }
            } catch (e) {
               // dacă pică, tot punem ceva ca să vezi UI-ul
               const map = {};
               normalized.forEach((q) => (map[q.id] = 0));
               setCorrectMap(map);
               console.warn(
                  "[Exam UI] Nu am putut încărca răspunsurile corecte din ticket:",
                  e
               );
            } finally {
               setCorrectMapLoaded(true);
            }
         }

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

   /* ---------- derived ---------- */
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

   /* ---------- status board (vechi) ---------- */
   const STATUS_COLS = 12;
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

   /* ---------- nav ---------- */
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

   /* ---------- answer (trimite + verdict instant) ---------- */
   const onChoose = async (i) => {
      if (!exam || !current) return;
      if (remaining <= 0) return;

      const existing = answersMap[current.id];
      if (existing && existing.selected != null) return;
      if (answerLoading === current.id) return;
      setAnswerLoading(current.id);

      try {
         const resp = await submitExamAnswer(Number(exam.id), {
            questionId: current.id,
            selectedAnswer: i,
         });

         const next = {
            ...answersMap,
            [current.id]: {
               selected: Number(i),
               correct: typeof resp.correct === "boolean" ? resp.correct : null,
               at: new Date().toISOString(),
            },
         };
         setAnswersMap(next);

         const badNow =
            Object.values(next).filter(
               (a) => a?.selected != null && a.correct === false
            ).length || 0;

         if (badNow >= maxLives || badNow > allowedWrongBackend) {
            setView("result");
            if (timerRef.current) clearInterval(timerRef.current);
            return;
         }

         if (idx + 1 < questions.length) {
            setIdx(idx + 1);
            requestAnimationFrame(() => requestAnimationFrame(scrollToQText));
         } else {
            setView("result");
            if (timerRef.current) clearInterval(timerRef.current);
         }
      } catch (e) {
         setError(e?.message || "Nu am putut trimite răspunsul.");
      } finally {
         setAnswerLoading(null);
      }
   };

   /* ---------- timer out => result ---------- */
   useEffect(() => {
      if (remaining === 0 && exam && view === "test") {
         setView("result");
         timerRef.current && clearInterval(timerRef.current);
      }
   }, [remaining, exam, view]);

   /* ---------- verdict simplu ---------- */
   const verdict = useMemo(() => {
      const failedByLives = mistakesMade >= maxLives;
      const failedByBackend = mistakesMade > allowedWrongBackend;
      const failed = failedByLives || failedByBackend || remaining === 0;
      return failed ? "FAILED" : "PASSED";
   }, [mistakesMade, maxLives, allowedWrongBackend, remaining]);

   /* ---------- UI ---------- */
   return (
      <div className="practice">
         {/* Banner dev */}
         {SHOW_CORRECT_HINTS && view !== "waiting" && (
            <div className="practice__dev-hint">
               ⚠️ Mod test activ: răspunsurile corecte sunt evidențiate.
            </div>
         )}

         {error && <div className="practice__error">{error}</div>}

         {view === "waiting" && (
            <div className="card" style={{ marginBottom: 12 }}>
               {checkingPerm ? (
                  <div>Se verifică permisiunea…</div>
               ) : computeIsAllowed(perm) ? (
                  <div
                     style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        flexWrap: "wrap",
                     }}
                  >
                     <div style={{ fontWeight: 600 }}>Permisiune activă ✅</div>
                     {perm?.validUntil && (
                        <div>
                           Valabil până la:{" "}
                           {new Date(perm.validUntil).toLocaleString()}
                        </div>
                     )}
                     {!!(perm?.usedAttempts >= 0) &&
                        !!(perm?.maxAttempts >= 0) && (
                           <div>
                              Încercări: {perm.usedAttempts}/{perm.maxAttempts}
                           </div>
                        )}
                     <button
                        onClick={handleStart}
                        style={{ marginLeft: "auto" }}
                     >
                        Începe examenul
                     </button>
                  </div>
               ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                     <div>
                        Nu ai încă permisiune pentru examen. Apasă “Începe
                        examenul”.
                     </div>
                     <div style={{ fontSize: 12, opacity: 0.8 }}>
                        (Pagina verifică automat la fiecare 3 secunde.)
                     </div>
                     <button
                        onClick={async () => {
                           try {
                              const p = await getMyPermissionStatus();
                              setPerm(p);
                           } catch {}
                        }}
                     >
                        Re-verifică acum
                     </button>
                  </div>
               )}
            </div>
         )}

         {view === "test" && exam && current && (
            <>
               {/* Toolbar */}
               <div className="practice__toolbar">
                  <button
                     className="practice__back button"
                     onClick={() => setView("result")}
                  >
                     Încheie
                  </button>

                  <div className="practice__toolbar-center">
                     <div className="practice__question-index">
                        Întrebarea {Math.min(idx + 1, total)}/{total}
                     </div>

                     {/* Inimi în toolbar */}
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
               <div
                  className="practice__statusboard"
                  style={{ gridTemplateColumns: `repeat(${STATUS_COLS}, 1fr)` }}
               >
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
                              onError={(e) =>
                                 (e.currentTarget.style.display = "none")
                              }
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
                              onError={(e) =>
                                 (e.currentTarget.style.display = "none")
                              }
                           />
                        </div>
                     )}

                     <div className="practice__answers">
                        {(current.answers || []).map((ans, i) => {
                           const saved = answersMap[current.id];
                           const already = !!saved && saved.selected != null;
                           const showCorrectSelected =
                              already &&
                              saved.correct === true &&
                              saved.selected === i;
                           const showWrongSelected =
                              already &&
                              saved.correct === false &&
                              saved.selected === i;
                           const isBusy = answerLoading === current.id;

                           // —— DEV: evidențiere corectă (dacă avem harta)
                           const correctIdx =
                              correctMap &&
                              Object.prototype.hasOwnProperty.call(
                                 correctMap,
                                 current.id
                              )
                                 ? Number(correctMap[current.id])
                                 : null;
                           const isCorrectOption =
                              SHOW_CORRECT_HINTS &&
                              correctIdx != null &&
                              Number.isInteger(correctIdx) &&
                              i === correctIdx;

                           // Afișăm „corect” și pentru opțiunea corectă (chiar dacă nu a fost aleasă),
                           // ca să vezi vizual cum arată.
                           const className =
                              "practice__answer" +
                              (showCorrectSelected
                                 ? " practice__answer--correct"
                                 : "") +
                              (showWrongSelected
                                 ? " practice__answer--wrong-selected"
                                 : "") +
                              (already ? " practice__answer--locked" : "") +
                              (isBusy && !already
                                 ? " practice__answer--loading"
                                 : "") +
                              (isCorrectOption
                                 ? " practice__answer--correct"
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
                                 {isCorrectOption && (
                                    <span
                                       className="practice__answer-badge"
                                       aria-hidden="true"
                                       style={{ marginLeft: 8 }}
                                    >
                                       ✅ Corect
                                    </span>
                                 )}
                              </button>
                           );
                        })}
                     </div>
                  </div>

                  <div className="practice__actions">
                     <button
                        type="button"
                        className="practice__back"
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
            <div className="practice__done" style={{ marginTop: 16 }}>
               <h3>
                  {verdict === "PASSED"
                     ? "Ai promovat ✅"
                     : "Nu ai promovat ❌"}
               </h3>
               <p>
                  Întrebări: <b>{total}</b> • Greșeli:{" "}
                  <b>
                     {mistakesMade}/{maxLives}
                  </b>{" "}
                  • Timp rămas: <b>{prettyTime(remaining)}</b>
               </p>
               <div
                  style={{ display: "flex", gap: 8, justifyContent: "center" }}
               >
                  <button
                     onClick={async () => {
                        try {
                           const fresh = await getExam(exam.id);
                           setExam(fresh);
                        } catch {}
                     }}
                     className="practice__secondary"
                  >
                     Actualizează status server
                  </button>
                  <button
                     className="practice__secondary practice__secondary--primary"
                     onClick={() => {
                        setView("waiting");
                        setExam(null);
                        setQuestions([]);
                        setAnswersMap({});
                        setIdx(0);
                        setRemaining(0);
                        setError("");
                     }}
                  >
                     Înapoi la început
                  </button>
               </div>
            </div>
         )}
      </div>
   );
}
