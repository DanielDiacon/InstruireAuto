import React, { useMemo, useRef, useState, useEffect } from "react";
import { getTicket } from "../../api/examService";
import AlertPills from "../Utils/AlertPills";

/* ===== Config din .env ===== */
const readEnv = (viteKey, craKey) =>
   (typeof import.meta !== "undefined" &&
      import.meta?.env &&
      import.meta.env[viteKey]) ||
   (typeof process !== "undefined" && process?.env && process.env[craKey]) ||
   "";

const START_ID = Number(
   readEnv("VITE_TICKETS_START", "REACT_APP_TICKETS_START") || 172
);
const COUNT = Number(
   readEnv("VITE_TICKETS_COUNT", "REACT_APP_TICKETS_COUNT") || 195 - 172 + 1
);

/* Generează 130,131,132,... */
const TICKET_IDS = Array.from({ length: COUNT }, (_, i) => START_ID + i);

/* ===== Helpers ===== */
const prettyTime = (sec) => {
   const m = Math.floor(sec / 60);
   const s = sec % 60;
   return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
/* ===== Chei localStorage (cu tentative multiple) ===== */
const currAttemptKey = (tid) => `practice_attempt_current_${tid}`;
const lastAttemptKey = (tid) => `practice_attempt_last_${tid}`;
const answersKey = (tid, aid) => `practice_answers_${tid}_${aid}`;
const lastIndexKey = (tid, aid) => `practice_lastIndex_${tid}_${aid}`;
const attemptResultKey = (tid, aid) => `practice_attempt_result_${tid}_${aid}`;

const loadAnswers = (ticketId, attemptId) => {
   try {
      const raw = localStorage.getItem(answersKey(ticketId, attemptId));
      if (raw) return JSON.parse(raw);
      if (attemptId === 1) {
         const legacy = localStorage.getItem(`practice_answers_${ticketId}`);
         return legacy ? JSON.parse(legacy) : {};
      }
      return {};
   } catch {
      return {};
   }
};
const saveAnswers = (ticketId, attemptId, obj) => {
   try {
      localStorage.setItem(
         answersKey(ticketId, attemptId),
         JSON.stringify(obj)
      );
   } catch {}
};
const loadLastIndex = (ticketId, attemptId) => {
   try {
      const v = localStorage.getItem(lastIndexKey(ticketId, attemptId));
      const n = Number(v);
      return Number.isInteger(n) ? n : 0;
   } catch {
      return 0;
   }
};
const saveLastIndex = (ticketId, attemptId, idx) => {
   try {
      localStorage.setItem(lastIndexKey(ticketId, attemptId), String(idx));
   } catch {}
};
const saveAttemptResult = (ticketId, attemptId, result) => {
   try {
      localStorage.setItem(
         attemptResultKey(ticketId, attemptId),
         JSON.stringify(result)
      );
      localStorage.setItem(lastAttemptKey(ticketId), String(attemptId));
   } catch {}
};
function loadAttemptResult(ticketId, attemptId) {
   try {
      const raw = localStorage.getItem(attemptResultKey(ticketId, attemptId));
      return raw ? JSON.parse(raw) : null;
   } catch {
      return null;
   }
}
function getLastAttemptId(ticketId) {
   const v = localStorage.getItem(lastAttemptKey(ticketId));
   const n = Number(v);
   return Number.isInteger(n) ? n : null;
}
const startNewAttemptIds = (ticketId) => {
   const last = getLastAttemptId(ticketId);
   const next = (last || 0) + 1;
   localStorage.setItem(currAttemptKey(ticketId), String(next));
   return { currentAttemptId: next, lastAttemptId: last };
};

const IMG_HOST = "https://instruireauto.site";

/**
 * EXAMEN_INSTRUIERE_AUTO/...  -> https://instruireauto.site/images/...
 * Acceptă și EXAMEN-INSTRUIIERE-AUTO, lowercase, cu/ fără leading slash.
 */
function rewriteImageUrl(raw) {
   if (!raw) return null;
   try {
      const u = new URL(String(raw).trim(), IMG_HOST);

      const segs = u.pathname.split("/").filter(Boolean);
      const norm = (s) => s.toLowerCase().replace(/[-_]+/g, "");
      const token = "exameninstruireauto";

      let idx = segs.findIndex((p) => norm(p) === token);

      if (idx !== -1) {
         segs[idx] = "images";
      } else {
         if (segs.length && norm(segs[0]) !== "images") {
            segs.unshift("images");
         }
      }

      u.pathname = "/" + segs.join("/");
      u.pathname = u.pathname.replace(/\/{2,}/g, "/");

      return u.origin + u.pathname;
   } catch {
      const tail = String(raw)
         .trim()
         .replace(/^https?:\/\/[^/]+/i, "")
         .replace(/^\/+/, "");
      const m = tail.match(/EXAMEN[-_]?INSTRUIERE[-_]?AUTO\/(.+)/i);
      const tailClean = m ? m[1] : tail;
      return `${IMG_HOST.replace(/\/+$/, "")}/images/${tailClean}`.replace(
         /\/{2,}/g,
         "/"
      );
   }
}

export default function Practice() {
   const [view, setView] = useState("tickets"); // 'tickets' | 'test'
   const DISPLAY_BASE = START_ID - 1;

   const tickets = useMemo(
      () => TICKET_IDS.map((id) => ({ id, nr: id - DISPLAY_BASE })),
      []
   );

   // test state (local)
   const [ticket, setTicket] = useState(null); // {id,name,questions:[]}
   const [idx, setIdx] = useState(0);

   // tentative
   const [attemptId, setAttemptId] = useState(null);
   const [prevAttemptId, setPrevAttemptId] = useState(null);

   // curent (NUMAI răspunsurile alese)
   const [answersMap, setAnswersMap] = useState({});
   // ultima tentativă (doar pentru mesaj „Ultima dată: Corect/Greșit”)
   const [prevAnswersMap, setPrevAnswersMap] = useState({});

   const [loadingTicket, setLoadingTicket] = useState(false);

   // înainte:
   // const toolbarRef = useRef(null);
   // const qAnchorRef = useRef(null);

   // după:
   const toolbarRef = useRef(null);
   const qTextRef = useRef(null);

   // înlocuiește funcția existentă
   const scrollToCurrent = () => {
      const el = qTextRef.current;
      if (!el) return;

      // top absolut al .practice__qtext în pagină
      const rectTop = el.getBoundingClientRect().top;
      const targetTop = window.scrollY + rectTop; // FĂRĂ NICIUN OFFSET

      if (Math.abs(window.scrollY - targetTop) > 1) {
         window.scrollTo({ top: targetTop, behavior: "smooth" });
      }
   };

   const isAnswered = (qId) => {
      const a = answersMap[qId];
      return !!a && a.selected != null;
   };
   const findFirstUnansweredFrom = (startIdx = 0) => {
      if (!ticket) return -1;
      for (let i = startIdx; i < (ticket.questions?.length || 0); i++) {
         const q = ticket.questions[i];
         if (!isAnswered(q.id)) return i;
      }
      return -1;
   };
   const findFirstUnanswered = () => findFirstUnansweredFrom(0);

   // ALERT PILLS pentru erori
   const [pillMsgs, setPillMsgs] = useState([]); // [{id,type:'error',text}]
   const pushError = (text) =>
      setPillMsgs((arr) => [
         ...arr,
         { id: Date.now() + Math.random(), type: "error", text },
      ]);
   const dismissLastPill = () => setPillMsgs((arr) => arr.slice(0, -1));
   useEffect(() => {
      if (!pillMsgs.length) return;
      const t = setTimeout(dismissLastPill, 4000);
      return () => clearTimeout(t);
   }, [pillMsgs]);

   // timer (opțional: 20 min)
   const [remaining, setRemaining] = useState(0);
   const timerRef = useRef(null);
   useEffect(
      () => () => timerRef.current && clearInterval(timerRef.current),
      []
   );
   const startLocalTimer = (secs = 20 * 60) => {
      setRemaining(secs);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
         setRemaining((r) => {
            if (r <= 1) {
               clearInterval(timerRef.current);
               return 0;
            }
            return r - 1;
         });
      }, 1000);
   };

   // ==== Intrare într-un bilet ====
   const enterTicket = async (ticketId) => {
      setLoadingTicket(true);
      try {
         const t = await getTicket(ticketId);

         t.questions = [...(t.questions || [])]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((q, i) => {
               const raw = q.image || "";
               const finalUrl = rewriteImageUrl(raw);
               //if (process.env.NODE_ENV !== "production") {
               //   console.log(`[Practice] Q${i + 1} img:`, { raw, finalUrl });
               //}
               return { ...q, image: finalUrl };
            });

         setTicket(t);
         const { currentAttemptId, lastAttemptId } =
            startNewAttemptIds(ticketId);
         setAttemptId(currentAttemptId);
         setPrevAttemptId(lastAttemptId || null);

         const initial = {};
         setAnswersMap(initial);
         saveAnswers(ticketId, currentAttemptId, initial);

         if (lastAttemptId)
            setPrevAnswersMap(loadAnswers(ticketId, lastAttemptId) || {});
         else setPrevAnswersMap({});

         setIdx(0);
         startLocalTimer(20 * 60);
         setView("test");

         // scroll inițial după ce e randată întrebarea
         setTimeout(() => {
            requestAnimationFrame(() => requestAnimationFrame(scrollToCurrent));
         }, 0);
      } catch (e) {
         const msg =
            e?.message === "AUTH_401"
               ? "Trebuie să fii autentificat (401)."
               : e?.message === "AUTH_403"
               ? "Nu ai permisiune (403)."
               : e?.message === "TICKET_404"
               ? "Bilet inexistent (404)."
               : e?.message || "Nu am putut încărca biletul.";
         pushError(msg);
      } finally {
         setLoadingTicket(false);
      }
   };

   const current = ticket?.questions?.[idx] || null;
   const total = ticket?.questions?.length || 0;

   // counts curente (NUMAI răspunsuri alese)
   const counts = useMemo(() => {
      let ok = 0,
         bad = 0;
      Object.values(answersMap).forEach((a) => {
         if (a?.selected == null) return;
         if (a.correct === true) ok++;
         else if (a.correct === false) bad++;
      });
      return { ok, bad };
   }, [answersMap]);

   // Toate au verdict? (adică AU răspuns, fără „sărite”)
   const allDecided = useMemo(() => {
      if (!ticket) return false;
      return ticket.questions.every((q) => {
         const a = answersMap[q.id];
         return a && a.selected != null;
      });
   }, [ticket, answersMap]);

   // jumpTo: setează indexul și scrollează
   const jumpTo = (i) => {
      if (!ticket) return;
      const clamped = Math.max(0, Math.min(i, total - 1));
      setIdx(clamped);
      if (ticket && attemptId) saveLastIndex(ticket.id, attemptId, clamped);
      requestAnimationFrame(() => {
         requestAnimationFrame(scrollToCurrent);
      });
   };

   // NEXT "smart": dacă sunt întrebări sărite, du-te la prima fără răspuns
   const goNext = () => {
      if (!ticket) return;

      // Încearcă în față de la idx+1
      const unansweredAhead = findFirstUnansweredFrom(idx + 1);
      if (unansweredAhead !== -1) {
         jumpTo(unansweredAhead);
         return;
      }

      // Dacă ești la final dar există sărite în urmă
      const anyUnanswered = findFirstUnanswered();
      if (anyUnanswered !== -1) {
         jumpTo(anyUnanswered);
         return;
      }

      // Altfel, comportament normal (fără depășire)
      const next = Math.min(idx + 1, total - 1);
      jumpTo(next);
   };

   // auto-scroll când se schimbă întrebarea sau biletul
   useEffect(() => {
      if (!ticket) return;
      const id = requestAnimationFrame(() =>
         requestAnimationFrame(scrollToCurrent)
      );
      return () => cancelAnimationFrame(id);
   }, [ticket, idx]);

   // click pe răspuns → SALVEAZĂ și BLOCHEAZĂ
   const onChoose = (i) => {
      if (!ticket || !current || !attemptId) return;

      const existing = answersMap[current.id];
      if (existing && existing.selected != null) return;

      const isCorrect = Number(i) === Number(current.correctAnswer);
      const nextMap = {
         ...answersMap,
         [current.id]: {
            selected: Number(i),
            correct: isCorrect,
            at: new Date().toISOString(),
         },
      };
      setAnswersMap(nextMap);
      saveAnswers(ticket.id, attemptId, nextMap);
   };

   // finalizează tentativă
   const finalizeAttempt = () => {
      if (!ticket || !attemptId) return;
      const ok = counts.ok;
      const bad = counts.bad;
      const skip = Math.max(0, (ticket?.questions?.length || 0) - ok - bad);
      const result = {
         ok,
         bad,
         skip,
         total: total,
         finishedAt: new Date().toISOString(),
      };
      saveAttemptResult(ticket.id, attemptId, result);
      exitToTickets();
   };

   const exitToTickets = () => {
      setView("tickets");
      setTicket(null);
      setIdx(0);
      setAttemptId(null);
      setPrevAnswersMap({});
      if (timerRef.current) clearInterval(timerRef.current);
   };

   // —— Status board (2 × 12) pt. tentativă curentă —— (fără “skip”)
   const STATUS_COLS = 12;
   const statusBoard = useMemo(() => {
      if (!ticket) return [];
      return ticket.questions.map((q, i) => {
         const a = answersMap[q.id];
         let status = "none";
         if (a?.selected != null) status = a.correct ? "ok" : "bad";
         return { i, status };
      });
   }, [ticket, answersMap]);

   // pentru afișarea instant a rezultatului la întrebare curentă (curent attempt)
   const saved = current ? answersMap[current.id] : null;
   const reveal = !!saved && saved.selected != null;

   // „ultima dată” (prev attempt) – DOAR mesaj
   const prevSaved = current ? prevAnswersMap[current.id] : null;
   const showPrev = !!prevSaved && prevSaved.selected != null;

   // —— Status card pentru fiecare bilet în grid ——
   const getTicketBadge = (tid) => {
      const last = getLastAttemptId(tid);
      if (!last) return "none";
      const res = loadAttemptResult(tid, last);
      if (!res || !res.total) return "none";
      if (res.ok === res.total) return "ok";
      if (res.ok === 0 && res.bad > 0) return "bad";
      if (res.bad > 0) return "warn";
      return "none";
   };

   return (
      <div className="practice">
         {/* Alert pills — DOAR pentru erori din pagină */}
         <AlertPills messages={pillMsgs} onDismiss={dismissLastPill} />

         {view === "tickets" && (
            <>
               <div className="practice__header">
                  <h2>Practica</h2>
               </div>

               <div className="practice__grid">
                  {tickets.map((t) => {
                     const badge = getTicketBadge(t.id);
                     return (
                        <button
                           key={t.id}
                           className={
                              "practice__ticket" +
                              (badge === "ok" ? " practice__ticket--ok" : "") +
                              (badge === "warn"
                                 ? " practice__ticket--warn"
                                 : "") +
                              (badge === "bad" ? " practice__ticket--bad" : "")
                           }
                           onClick={() => enterTicket(t.id)}
                           title={`Start Bilet ${t.nr}`}
                           disabled={loadingTicket}
                        >
                           <div className="practice__ticket-title">
                              Bilet {t.nr}
                           </div>
                        </button>
                     );
                  })}
               </div>
            </>
         )}

         {view === "test" && ticket && (
            <>
               {/* 🔽 ref pe toolbar pentru măsurarea offset-ului */}
               <div className="practice__toolbar" ref={toolbarRef}>
                  <button className="practice__back" onClick={exitToTickets}>
                     Înapoi
                  </button>

                  <div className="practice__toolbar-center">
                     <div className="practice__question-index">
                        Întrebarea {Math.min(idx + 1, total)}/{total}
                     </div>
                     <span className="practice__summary-pill practice__summary-pill--ok">
                        Corecte: {counts.ok}
                     </span>
                     <span className="practice__summary-pill practice__summary-pill--bad">
                        Greșite: {counts.bad}
                     </span>
                  </div>
                  <div className="practice__timer">{prettyTime(remaining)}</div>
               </div>

               {/* Status board: 2 × 12 pills (fără “skip”) */}
               <div
                  className="practice__statusboard"
                  style={{
                     display: "grid",
                     gridTemplateColumns: `repeat(${STATUS_COLS}, 1fr)`,
                     gap: 6,
                     marginBottom: 12,
                  }}
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

               {loadingTicket && (
                  <div className="practice__loading">Se încarcă biletul…</div>
               )}

               {current && (
                  <div className="practice__question">
                     <div className="practice__qtext" ref={qTextRef}>
                        {current.text}
                     </div>
                     <div className="practice__row">
                        <div className="practice__qimage-wrapper ">
                           {current?.image && (
                              <img
                                 key={`${ticket.id}-${current.id}-${idx}`}
                                 className="practice__qimage"
                                 src={
                                    current.image +
                                    (current.image.includes("?") ? "&" : "?") +
                                    `v=${ticket.id}-${current.id}-${idx}`
                                 }
                                 alt="Întrebare"
                              />
                           )}
                        </div>

                        {current?.image && (
                           <div className="practice__qimage-wrapper mobile">
                              <img
                                 key={`${ticket.id}-${current.id}-${idx}`}
                                 className="practice__qimage"
                                 src={
                                    current.image +
                                    (current.image.includes("?") ? "&" : "?") +
                                    `v=${ticket.id}-${current.id}-${idx}`
                                 }
                                 alt="Întrebare"
                              />
                           </div>
                        )}

                        <div className="practice__answers">
                           {(current.answers || []).map((ans, i) => {
                              const isCorrect =
                                 i === Number(current.correctAnswer);

                              const cur = saved;
                              const alreadyAnswered =
                                 !!cur && cur.selected != null;

                              const showCorrect =
                                 !!cur && cur.selected != null && isCorrect;
                              const showWrongSelected =
                                 !!cur &&
                                 cur.selected === i &&
                                 cur.correct === false;

                              return (
                                 <button
                                    key={i}
                                    className={
                                       "practice__answer" +
                                       (showCorrect
                                          ? " practice__answer--correct"
                                          : "") +
                                       (showWrongSelected
                                          ? " practice__answer--wrong-selected"
                                          : "") +
                                       (alreadyAnswered
                                          ? " practice__answer--locked"
                                          : "")
                                    }
                                    onClick={() => onChoose(i)}
                                    disabled={alreadyAnswered}
                                    title={
                                       alreadyAnswered
                                          ? "Răspuns blocat în această tentativă"
                                          : "Alege răspunsul"
                                    }
                                 >
                                    {ans}
                                 </button>
                              );
                           })}
                        </div>
                     </div>
                     <div className="practice__actions">
                        {showPrev && (
                           <div
                              className={`practice__dot ${
                                 prevSaved && prevSaved.selected != null
                                    ? prevSaved.correct
                                       ? "practice__dot--ok"
                                       : "practice__dot--bad"
                                    : ""
                              }`}
                           >
                              Ultima dată:{" "}
                              {prevSaved.correct ? "Corect" : "Greșit"}
                           </div>
                        )}
                        <div className="practice__spacer" />
                        {!allDecided ? (
                           <button
                              type="button"
                              className="practice__secondary"
                              onClick={goNext}
                              title="Următoarea întrebare"
                           >
                              Următorul
                           </button>
                        ) : (
                           <button
                              type="button"
                              className="practice__secondary practice__secondary--primary"
                              onClick={finalizeAttempt}
                           >
                              Finalizează biletul
                           </button>
                        )}
                     </div>
                  </div>
               )}
            </>
         )}
      </div>
   );
}
