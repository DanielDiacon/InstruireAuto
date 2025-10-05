// src/components/SPanel/Practice.jsx
import React, { useMemo, useRef, useState, useEffect, useContext } from "react";
import AlertPills from "../Utils/AlertPills";
import { UserContext } from "../../UserContext";
import {
   startPracticeSession,
   getPracticeSession,
   submitPracticeAnswer,
   getTicketQuestions,
   getAllMyPracticeHistory, // status-urile biletelor
} from "../../api/examService";

/* ===== Config din .env ===== */
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
   readEnv("VITE_TICKETS_COUNT", "REACT_APP_TICKETS_COUNT") || 269 - 246 + 1
);
const TICKET_IDS = Array.from({ length: COUNT }, (_, i) => START_ID + i);

/* ===== Helpers ===== */
const prettyTime = (sec) => {
   const m = Math.floor(sec / 60);
   const s = sec % 60;
   return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const IMG_HOST = "https://instruireauto.site";
function rewriteImageUrl(raw) {
   if (!raw) return null;
   try {
      const u = new URL(String(raw).trim(), IMG_HOST);
      const segs = u.pathname.split("/").filter(Boolean);
      const norm = (s) => s.toLowerCase().replace(/[-_]+/g, "");
      const token = "exameninstruireauto";
      let idx = segs.findIndex((p) => norm(p) === token);
      if (idx !== -1) segs[idx] = "images";
      else if (segs.length && norm(segs[0]) !== "images")
         segs.unshift("images");
      u.pathname = "/" + segs.join("/").replace(/\/{2,}/g, "/");
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

/** Normalizează structura venită din GET /exams/practice/{id} în formatul UI */
function normalizeSessionToTicket(sess) {
   if (!sess) return null;

   const ticket = sess.ticket || {};
   const tidRaw = ticket?.id ?? sess.ticketId;
   const tid =
      Number.isInteger(Number(tidRaw)) && Number(tidRaw) > 0
         ? Number(tidRaw)
         : null;

   const name =
      ticket?.name || sess.ticketName || (tid ? `Bilet ${tid}` : "Bilet");
   const rawQs = ticket?.questions || sess.questions || [];

   const questions = (rawQs || []).map((q, i) => ({
      id: Number(q?.id ?? q?.questionId ?? i + 1),
      text: q?.text ?? q?.question ?? q?.title ?? "",
      answers: Array.isArray(q?.answers)
         ? q.answers
         : [q?.a1, q?.a2, q?.a3, q?.a4].filter((v) => v != null),
      correctAnswer:
         q?.correctAnswer ?? q?.correctIndex ?? q?.rightIndex ?? undefined,
      image: rewriteImageUrl(q?.image || q?.img || ""),
      order: Number.isFinite(q?.order) ? q.order : i,
   }));

   return { id: tid, name, questions };
}

/* prag „admis” (22/26 sau 85%) */
const requiredOk = (total) => (total >= 26 ? 22 : Math.ceil(total * 0.85));

/* extras numărul P din “Practice P2”, “P 12”, “PracticeP7” etc. */
function getTicketNrFromName(name) {
   const m = String(name || "").match(/P\s*([0-9]+)/i);
   const n = m ? Number(m[1]) : NaN;
   return Number.isInteger(n) && n > 0 ? n : null;
}

/* ====== Memorare ultimul practiceId pe bilet (localStorage) ====== */
const lastKeyForTicket = (tid) => `practice:last:${tid}`;
const rememberPractice = (tid, pid) => {
   try {
      localStorage.setItem(lastKeyForTicket(tid), String(pid));
   } catch {}
};
const recallPractice = (tid) => {
   try {
      const v = localStorage.getItem(lastKeyForTicket(tid));
      const n = v ? Number(v) : null;
      return Number.isInteger(n) && n > 0 ? n : null;
   } catch {
      return null;
   }
};
const forgetPractice = (tid) => {
   try {
      localStorage.removeItem(lastKeyForTicket(tid));
   } catch {}
};

/* ====== Salvare rezultat local pentru statistici ====== */
function saveLocalPracticeResult(ticketId, { ok, bad, total }) {
   try {
      const ts = Date.now();
      const key = `practice_attempt_result_${ticketId}_${ts}`;
      const obj = {
         ok: Number(ok || 0),
         bad: Number(bad || 0),
         skip: Math.max(
            0,
            Number(total || 0) - Number(ok || 0) - Number(bad || 0)
         ),
         finishedAt: new Date(ts).toISOString(),
      };
      localStorage.setItem(key, JSON.stringify(obj));
   } catch {}
}

/* Heuristic: sesiunea are deja răspunsuri? */
function sessionHasAnswers(sess) {
   const answered =
      Number(sess?.progress?.answered ?? sess?.answered ?? 0) || 0;
   if (answered > 0) return true;
   const qs = sess?.questions || sess?.ticket?.questions || [];
   return qs.some(
      (q) =>
         q?.selectedAnswer != null ||
         q?.userAnswer != null ||
         q?.answer != null ||
         q?.answered === true
   );
}

export default function Practice() {
   const { user } = useContext(UserContext) || {};
   const [view, setView] = useState("tickets"); // 'tickets' | 'test'
   const DISPLAY_BASE = START_ID - 1;

   const tickets = useMemo(
      () => TICKET_IDS.map((id) => ({ id, nr: id - DISPLAY_BASE })),
      [DISPLAY_BASE]
   );

   // status vizual pt. bilete: { [localTicketId]: 'ok'|'bad' }
   const [ticketStatusMap, setTicketStatusMap] = useState({});
   const [historyLoading, setHistoryLoading] = useState(false);

   // state sesiune practice
   const [practiceId, setPracticeId] = useState(null); // doar pt. mod 'server'
   const [localAttemptId, setLocalAttemptId] = useState(null); // pt. mod 'local'
   const [practiceMode, setPracticeMode] = useState("server"); // 'server' | 'local'

   const [ticketId, setTicketId] = useState(null);
   const [ticket, setTicket] = useState(null); // {id,name,questions:[]}
   const [idx, setIdx] = useState(0);
   const [answersMap, setAnswersMap] = useState({});
   const [loading, setLoading] = useState(false);
   const [pillMsgs, setPillMsgs] = useState([]);

   const qTextRef = useRef(null);
   const timerRef = useRef(null);
   const [remaining, setRemaining] = useState(20 * 60);

   const [correctMap, setCorrectMap] = useState({});
   const [correctLoaded, setCorrectLoaded] = useState(false);

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

   useEffect(() => {
      return () => timerRef.current && clearInterval(timerRef.current);
   }, []);
   useEffect(() => {
      setRemaining(20 * 60);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
         setRemaining((r) => (r <= 1 ? 0 : r - 1));
      }, 1000);
   }, [practiceId, localAttemptId, practiceMode]);

   // La expirarea timpului — finalizează sesiunea (și salvează local dacă e cazul)
   useEffect(() => {
      if (remaining === 0 && (practiceId || localAttemptId)) {
         (async () => {
            await finalizeAttempt("timeout");
         })();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [remaining, practiceId, localAttemptId]);

   const scrollToCurrent = () => {
      const el = qTextRef.current;
      if (!el) return;
      const top = window.scrollY + (el.getBoundingClientRect().top || 0);
      if (Math.abs(window.scrollY - top) > 1) {
         window.scrollTo({ top, behavior: "smooth" });
      }
   };

   useEffect(() => {
      if (!ticket) return;
      const raf = requestAnimationFrame(() =>
         requestAnimationFrame(scrollToCurrent)
      );
      return () => cancelAnimationFrame(raf);
   }, [ticket, idx]);

   /* ====== Culoarea biletelor din istoricul meu (după NUME: “Practice P#”) ====== */
   useEffect(() => {
      if (view !== "tickets") return;
      let alive = true;

      (async () => {
         setHistoryLoading(true);
         try {
            const all = await getAllMyPracticeHistory({
               pageSize: 100,
               maxPages: 10,
            });
            const items = Array.isArray(all)
               ? all
               : all?.data || all?.items || [];

            // Ținem doar ultima încercare per P# (după completedAt, altfel startedAt)
            const lastByPNr = new Map(); // key: pNr -> { ts, status, total, correct }

            for (const it of items) {
               const pNr = getTicketNrFromName(
                  it.ticketName || it.ticket?.name
               );
               if (!pNr) continue;

               const status = String(it.status || "").toUpperCase();
               const ts =
                  Date.parse(
                     it.completedAt ||
                        it.finishedAt ||
                        it.endedAt ||
                        it.startedAt ||
                        it.createdAt ||
                        0
                  ) || 0;

               const prev = lastByPNr.get(pNr);
               if (prev && ts <= prev.ts) continue;

               const total = Number(
                  it.totalQuestions ??
                     it.total ??
                     it.questionsTotal ??
                     Number(it.correct ?? 0) +
                        Number(it.wrong ?? 0) +
                        Number(it.unanswered ?? 0)
               );

               const correct = Number(
                  it.score ??
                     it.correct ??
                     it.correctCount ??
                     it.progress?.correct ??
                     0
               );

               lastByPNr.set(pNr, { ts, status, total, correct });
            }

            const mapObj = {};
            for (const [pNr, v] of lastByPNr.entries()) {
               // P1 -> 246, P2 -> 247, ...
               const localId = START_ID + (pNr - 1);

               // IN_PROGRESS nu colorează
               if (v.status.includes("IN_PROGRESS")) continue;

               let cls;
               if (v.status.includes("FAILED")) {
                  cls = "bad";
               } else if (v.status.includes("PASSED")) {
                  cls = "ok";
               } else if (v.total > 0 && Number.isFinite(v.correct)) {
                  const need = requiredOk(v.total);
                  cls = v.correct >= need ? "ok" : "bad";
               }

               if (cls) mapObj[localId] = cls;
            }

            if (alive) setTicketStatusMap(mapObj);
         } catch {
            if (alive) setTicketStatusMap({});
         } finally {
            if (alive) setHistoryLoading(false);
         }
      })();

      return () => {
         alive = false;
      };
   }, [view]);

   /* ========= START LOCAL FRESH (fără server) ========= */
   async function startLocalFresh(tid) {
      setPracticeMode("local");
      setPracticeId(null);
      setLocalAttemptId(
         `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      );
      setTicketId(tid);
      setAnswersMap({});
      setIdx(0);
      setCorrectMap({});
      setCorrectLoaded(false);

      const qs = await getTicketQuestions(tid);
      const t = {
         id: Number(tid),
         name: `Bilet ${Number(tid) - (START_ID - 1)}`,
         questions: (qs || [])
            .map((q, i) => ({
               id: Number(q?.id ?? i + 1),
               text: q?.text ?? q?.question ?? q?.title ?? "",
               answers: Array.isArray(q?.answers)
                  ? q.answers
                  : [q?.a1, q?.a2, q?.a3, q?.a4].filter((v) => v != null),
               image: rewriteImageUrl(q?.image || q?.img || ""),
               order: Number.isFinite(q?.order) ? q.order : i,
            }))
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      };
      setTicket(t);

      // corectele (0- sau 1-based)
      const m = {};
      (qs || []).forEach((q) => {
         const answersLen = Array.isArray(q?.answers) ? q.answers.length : 0;
         const n = Number(q?.correctAnswer);
         let ci = null;
         if (Number.isInteger(n) && answersLen > 0) {
            if (n >= 0 && n < answersLen) ci = n;
            else if (n >= 1 && n <= answersLen) ci = n - 1;
         }
         if (Number.isInteger(q?.id) && Number.isInteger(ci))
            m[Number(q.id)] = ci;
      });
      setCorrectMap(m);
      setCorrectLoaded(true);

      setView("test");
   }

   // pornește PRACTICA pe un bilet — încearcă server; dacă reia vechea sesiune, comută local
   const enterTicket = async (tid) => {
      setLoading(true);

      // Golire UI înainte de init
      setPracticeId(null);
      setLocalAttemptId(null);
      setPracticeMode("server");
      setTicket(null);
      setTicketId(null);
      setCorrectMap({});
      setCorrectLoaded(false);
      setAnswersMap({});
      setIdx(0);

      try {
         // server: start sau resume
         const started = await startPracticeSession(tid); // { id, ticketId, ... }
         const pid =
            Number(started?.id) ||
            Number(started?.practiceId) ||
            Number(started?.sessionId);
         if (!Number.isInteger(pid) || pid <= 0) {
            throw new Error("PracticeID invalid la start.");
         }
         const serverTid = Number(started?.ticketId);
         const effectiveTid =
            Number.isInteger(serverTid) && serverTid > 0
               ? serverTid
               : Number(tid);

         // obține detalii
         const sess = await getPracticeSession(pid);

         // dacă are deja răspunsuri -> RESTART LOCAL CURAT
         if (sessionHasAnswers(sess)) {
            await startLocalFresh(effectiveTid);
            // memorăm ultima sesiune de pe bilet doar ca referință (nu o folosim activ)
            rememberPractice(effectiveTid, pid);
            setLoading(false);
            return;
         }

         // altfel, e o sesiune curată pe server
         setPracticeMode("server");
         setPracticeId(pid);
         setTicketId(effectiveTid);
         rememberPractice(effectiveTid, pid);

         let t = normalizeSessionToTicket(sess);
         t = {
            ...t,
            questions: [...(t?.questions || [])].sort(
               (a, b) => (a.order ?? 0) - (b.order ?? 0)
            ),
         };
         setTicket(t);

         // Fallback pentru corecte (ca în varianta inițială)
         try {
            const fallbackTid =
               Number.isInteger(t?.id) && t.id > 0 ? t.id : effectiveTid;

            if (Number.isInteger(fallbackTid) && fallbackTid > 0) {
               const srvQs = await getTicketQuestions(fallbackTid);
               const m = {};
               (srvQs || []).forEach((q) => {
                  const qid = Number(q?.id);
                  const answersLen = Array.isArray(q?.answers)
                     ? q.answers.length
                     : 0;
                  const n = Number(q?.correctAnswer);
                  let ci = null;
                  if (Number.isInteger(n) && answersLen > 0) {
                     if (n >= 0 && n < answersLen) ci = n;
                     else if (n >= 1 && n <= answersLen) ci = n - 1;
                  }
                  if (Number.isInteger(qid) && Number.isInteger(ci))
                     m[qid] = ci;
               });
               setCorrectMap(m);
            } else {
               setCorrectMap({});
            }
         } catch {
            setCorrectMap({});
         } finally {
            setCorrectLoaded(true);
         }

         setView("test");
      } catch (e) {
         pushError(e?.message || "Nu am putut porni sesiunea de practică.");
      } finally {
         setLoading(false);
      }
   };

   const current = ticket?.questions?.[idx] || null;
   const total = ticket?.questions?.length || 0;

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

   const allAnswered = useMemo(() => {
      if (!ticket) return false;
      return ticket.questions.every((q) => {
         const a = answersMap[q.id];
         return a && a.selected != null;
      });
   }, [ticket, answersMap]);

   const jumpTo = (i) => {
      if (!ticket) return;
      const clamped = Math.max(0, Math.min(i, total - 1));
      setIdx(clamped);
   };
   const goNext = () => {
      if (!ticket) return;
      setIdx(Math.min(idx + 1, total - 1));
   };

   // finalizează încercarea (curăță local; salvează local dacă e mod 'local')
   const finalizeAttempt = async (reason = "manual-exit") => {
      // salvăm local doar în mod 'local'
      if (practiceMode === "local" && ticketId && ticket) {
         saveLocalPracticeResult(ticketId, {
            ok: counts.ok,
            bad: counts.bad,
            total,
         });
         // actualizează vizual biletul curent
         const need = requiredOk(total);
         setTicketStatusMap((m) => ({
            ...m,
            [ticketId]: counts.ok >= need ? "ok" : "bad",
         }));
      }
      // UI reset
      setView("tickets");
      setPracticeId(null);
      setLocalAttemptId(null);
      setPracticeMode("server");
      setTicket(null);
      setTicketId(null);
      setCorrectMap({});
      setCorrectLoaded(false);
      setAnswersMap({});
      setIdx(0);
   };

   // submit la fiecare răspuns — NU auto-next
   const onChoose = async (answerIdx) => {
      if (!current) return;

      const existing = answersMap[current.id];
      if (existing && existing.selected != null) return;

      // Înregistrăm selectarea
      let nextMap = {
         ...answersMap,
         [current.id]: {
            selected: Number(answerIdx),
            correct: null,
            at: new Date().toISOString(),
         },
      };
      setAnswersMap(nextMap);

      // Mod LOCAL: verificăm corectitudinea din correctMap (fără server)
      if (practiceMode === "local") {
         const effectiveCorrectIdx = Object.prototype.hasOwnProperty.call(
            correctMap,
            current.id
         )
            ? Number(correctMap[current.id])
            : null;

         const finalCorrect =
            Number.isInteger(effectiveCorrectIdx) &&
            Number(answerIdx) === Number(effectiveCorrectIdx);

         nextMap = {
            ...nextMap,
            [current.id]: {
               ...nextMap[current.id],
               correct: finalCorrect,
               correctIdx: Number.isInteger(effectiveCorrectIdx)
                  ? Number(effectiveCorrectIdx)
                  : null,
               explanation: null,
            },
         };
         setAnswersMap(nextMap);
         return;
      }

      // Mod SERVER: trimitem la backend
      if (!practiceId) return;

      try {
         const normalize = await submitPracticeAnswer(practiceId, {
            questionId: Number(current.id),
            selectedAnswer: Number(answerIdx),
         });

         const answersLen = (current.answers || []).length;
         const { correct, correctIdx, explanation } = normalize(answersLen);

         let finalCorrect = correct;
         const effectiveCorrectIdx = Number.isInteger(correctIdx)
            ? correctIdx
            : Object.prototype.hasOwnProperty.call(correctMap, current.id)
            ? Number(correctMap[current.id])
            : null;

         if (finalCorrect == null && Number.isInteger(effectiveCorrectIdx)) {
            finalCorrect = Number(answerIdx) === Number(effectiveCorrectIdx);
         }

         nextMap = {
            ...nextMap,
            [current.id]: {
               ...nextMap[current.id],
               correct: finalCorrect,
               correctIdx: Number.isInteger(effectiveCorrectIdx)
                  ? Number(effectiveCorrectIdx)
                  : null,
               explanation: explanation || null,
            },
         };
         setAnswersMap(nextMap);
      } catch (e) {
         const msg = String(e?.message || "");
         if (/Active practice session not found/i.test(msg)) {
            pushError(
               "Sesiunea server s-a închis/expirat. Trec pe mod local curat."
            );
            // trecem pe local fresh ca fallback
            await startLocalFresh(ticketId || START_ID);
         } else {
            pushError(msg || "Nu am putut trimite răspunsul.");
         }
      }
   };

   const statusBoard = useMemo(() => {
      if (!ticket) return [];
      return ticket.questions.map((q, i) => {
         const a = answersMap[q.id];
         let status = "none";
         if (a?.selected != null)
            status =
               a.correct === false ? "bad" : a.correct === true ? "ok" : "wait";
         return { i, status };
      });
   }, [ticket, answersMap]);

   const keySalt = practiceMode === "local" ? localAttemptId : practiceId;

   return (
      <div className="practice">
         <AlertPills messages={pillMsgs} onDismiss={dismissLastPill} />

         {view === "tickets" && (
            <>
               <div className="practice__header">
                  <h2>Practica</h2>
               </div>

               <div className="practice__grid">
                  {tickets.map((t) => {
                     const st = ticketStatusMap[t.id]; // 'ok' | 'bad' | undefined
                     const cls =
                        "practice__ticket" +
                        (st ? ` practice__ticket--${st}` : "");
                     return (
                        <button
                           key={t.id}
                           className={cls}
                           onClick={() => enterTicket(t.id)}
                           disabled={loading || historyLoading}
                           title={`Start bilet ${t.nr}`}
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
               <div className="practice__toolbar">
                  <button
                     className="practice__back"
                     onClick={() => finalizeAttempt("back-button")}
                  >
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

               <div
                  className="practice__statusboard"
                  style={{
                     display: "grid",
                     gridTemplateColumns: `repeat(12, 1fr)`,
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
                           (status === "wait" ? " practice__dot--none" : "")
                        }
                        title={`Întrebarea ${i + 1}`}
                        onClick={() => jumpTo(i)}
                     >
                        {i + 1}
                     </button>
                  ))}
               </div>

               {current && (
                  <div className="practice__question">
                     <div className="practice__qtext" ref={qTextRef}>
                        {current.text}
                     </div>

                     <div className="practice__row">
                        <div className="practice__qimage-wrapper">
                           {current?.image && (
                              <img
                                 key={`${keySalt}-${current.id}-${idx}`}
                                 className="practice__qimage"
                                 src={
                                    current.image +
                                    (current.image.includes("?") ? "&" : "?") +
                                    `v=${keySalt}-${current.id}-${idx}`
                                 }
                                 alt="Întrebare"
                                 onError={(e) =>
                                    (e.currentTarget.hidden = true)
                                 }
                              />
                           )}
                        </div>

                        {current?.image && (
                           <div className="practice__qimage-wrapper mobile">
                              <img
                                 key={`${keySalt}-${current.id}-${idx}-m`}
                                 className="practice__qimage"
                                 src={
                                    current.image +
                                    (current.image.includes("?") ? "&" : "?") +
                                    `v=${keySalt}-${current.id}-${idx}-m`
                                 }
                                 alt="Întrebare"
                                 onError={(e) =>
                                    (e.currentTarget.hidden = true)
                                 }
                              />
                           </div>
                        )}

                        <div className="practice__answers">
                           {(current.answers || []).map((ans, i) => {
                              const saved = answersMap[current.id];
                              const already = !!saved && saved.selected != null;
                              const effectiveCorrectIdx =
                                 already && Number.isInteger(saved?.correctIdx)
                                    ? Number(saved.correctIdx)
                                    : null;

                              const isCorrectOption =
                                 already &&
                                 Number.isInteger(effectiveCorrectIdx) &&
                                 i === effectiveCorrectIdx;

                              const isWrongSelected =
                                 already &&
                                 saved.selected === i &&
                                 Number.isInteger(effectiveCorrectIdx) &&
                                 saved.selected !== effectiveCorrectIdx;

                              const className =
                                 "practice__answer" +
                                 (isCorrectOption
                                    ? " practice__answer--correct"
                                    : "") +
                                 (isWrongSelected
                                    ? " practice__answer--wrong-selected"
                                    : "") +
                                 (already ? " practice__answer--locked" : "");

                              return (
                                 <button
                                    key={i}
                                    className={className}
                                    onClick={() => onChoose(i)}
                                    disabled={already}
                                    title={
                                       already
                                          ? "Răspuns blocat"
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
                        <div />
                        <div className="practice__spacer" />
                        {!allAnswered ? (
                           <button
                              type="button"
                              className="practice__secondary"
                              onClick={goNext}
                              disabled={idx >= total - 1}
                           >
                              Următorul
                           </button>
                        ) : (
                           <button
                              type="button"
                              className="practice__secondary practice__secondary--primary"
                              onClick={() => finalizeAttempt("user-finish")}
                           >
                              Finalizează
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
