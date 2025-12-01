import React, {
   useMemo,
   useRef,
   useState,
   useEffect,
   useContext,
   useCallback,
} from "react";
import AlertPills from "../Utils/AlertPills";
import { UserContext } from "../../UserContext";
import {
   startPracticeSession,
   getPracticeSession,
   submitPracticeAnswer,
   getTicketQuestions,
   getAllMyPracticeHistory,
} from "../../api/examService";

/* ================= i18n ================= */
const I18N = {
   ro: {
      practice_title: "Practica",
      lang_ro: "Română",
      lang_ru: "Русский",
      ticket_n: "Bilet {n}",
      start_ticket_title: "Start bilet {n}",
      back: "Înapoi",
      question_index: "Întrebarea {i}/{total}",
      question_n: "Întrebarea {n}",
      question_alt: "Întrebare",
      answered_count: "Răspunse: {n}",
      left_count: "Nerăspunse: {n}",
      correct_count: "Corecte: {n}",
      wrong_count: "Greșite: {n}",
      next: "Următorul",
      finish: "Finalizează",
      choose_answer: "Alege răspunsul",
      cannot_start_practice: "Nu am putut porni/relua sesiunea de practică.",
      cannot_submit: "Nu am putut trimite răspunsul.",
      session_closed_switch_local:
         "Sesiunea server s-a închis/expirat. Trec pe mod local curat.",
   },
   ru: {
      practice_title: "Практика",
      lang_ro: "Română",
      lang_ru: "Русский",
      ticket_n: "Билет {n}",
      start_ticket_title: "Открыть билет {n}",
      back: "Назад",
      question_index: "Вопрос {i}/{total}",
      question_n: "Вопрос {n}",
      question_alt: "Вопрос",
      answered_count: "Отвечено: {n}",
      left_count: "Осталось: {n}",
      correct_count: "Верно: {n}",
      wrong_count: "Ошибки: {n}",
      next: "Далее",
      finish: "Завершить",
      choose_answer: "Выберите ответ",
      cannot_start_practice:
         "Не удалось запустить/возобновить сессию практики.",
      cannot_submit: "Не удалось отправить ответ.",
      session_closed_switch_local:
         "Серверная сессия закрыта/истекла. Перехожу в локальный режим.",
   },
};

function formatI18n(str, vars) {
   if (!vars) return str;
   return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

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

/* pick text ro/ru (acceptă și string JSON {"ro":"","ru":""}) */
const pickLang = (v, lang) => {
   if (v == null) return "";
   if (typeof v === "string") {
      const s = v.trim();
      if (s.startsWith("{") && (s.includes('"ro"') || s.includes('"ru"'))) {
         try {
            const obj = JSON.parse(s);
            if (obj && typeof obj === "object") {
               return String(obj[lang] ?? obj.ro ?? obj.ru ?? "");
            }
         } catch {}
      }
      return s;
   }
   if (typeof v === "object") {
      if (v[lang] != null) return String(v[lang]);
      if (v.ro != null || v.ru != null) return String(v.ro ?? v.ru ?? "");
   }
   try {
      return String(v);
   } catch {
      return "";
   }
};

/** Normalizează sesiunea -> ticket (extrage și textele pe limba curentă) */
function normalizeSessionToTicket(sess, lang) {
   if (!sess) return null;

   const ticket = sess.ticket || {};
   const tidRaw = ticket?.id ?? sess.ticketId;
   const tid =
      Number.isInteger(Number(tidRaw)) && Number(tidRaw) > 0
         ? Number(tidRaw)
         : null;

   const name = pickLang(
      ticket?.name || sess.ticketName || (tid ? `Bilet ${tid}` : "Bilet"),
      lang
   );
   const rawQs = ticket?.questions || sess.questions || [];

   const questions = (rawQs || []).map((q, i) => {
      const answersRaw = Array.isArray(q?.answers)
         ? q.answers
         : [q?.a1, q?.a2, q?.a3, q?.a4].filter((v) => v != null);

      return {
         id: Number(q?.id ?? q?.questionId ?? i + 1),
         text: pickLang(q?.text ?? q?.question ?? q?.title ?? "", lang),
         answers: answersRaw.map((a) => pickLang(a, lang)).filter(Boolean),
         image: rewriteImageUrl(pickLang(q?.image || q?.img || "", lang)),
         order: Number.isFinite(q?.order) ? Number(q.order) : i,
      };
   });

   return { id: tid, name, questions };
}

/* prag „admis” (22/26 sau 85%) — folosit doar la statistica locală */
const requiredOk = (total) => (total >= 26 ? 22 : Math.ceil(total * 0.85));

/* extras P# din denumire “Practice P2” etc. */
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

/* ===== Helpers resume/hidratare ===== */
function buildBaselineFromSession(sess) {
   const qs = sess?.ticket?.questions || sess?.questions || [];
   const map = {};
   qs.forEach((q) => {
      const qid = Number(q?.id ?? q?.questionId);
      const sel = q?.selectedAnswer ?? q?.userAnswer; // server: 1-based
      if (Number.isInteger(qid) && Number.isInteger(sel)) {
         const zeroBased = sel >= 1 ? sel - 1 : sel; // -> 0-based pt. UI/diff
         map[qid] = zeroBased;
      }
   });
   return map;
}

function firstUnansweredIndex(ticket, pendingMap) {
   const i = (ticket?.questions || []).findIndex(
      (q) => !(pendingMap[q.id] && pendingMap[q.id].selected != null)
   );
   return i >= 0 ? i : 0;
}
async function tryResumeFromLocal(tid, lang) {
   try {
      const last = localStorage.getItem(lastKeyForTicket(tid));
      if (!last) return null;
      const sess = await getPracticeSession(last, lang);
      return { pid: Number(last), sess };
   } catch {
      return null;
   }
}

/* === normalize correct index (0-based) din getTicketQuestions === */
function normalizeCorrectIdx(raw, answersLen) {
   const n = Number(raw);
   if (!Number.isInteger(n) || answersLen <= 0) return null;
   if (n >= 0 && n < answersLen) return n; // 0-based
   if (n >= 1 && n <= answersLen) return n - 1; // 1-based
   return null;
}

export default function Practice() {
   const { user } = useContext(UserContext) || {};
   const [view, setView] = useState("tickets");
   const DISPLAY_BASE = START_ID - 1;

   const tickets = useMemo(
      () => TICKET_IDS.map((id) => ({ id, nr: id - DISPLAY_BASE })),
      [DISPLAY_BASE]
   );

   // === i18n state
   const [lang, setLang] = useState(() => {
      const saved =
         (typeof localStorage !== "undefined" &&
            localStorage.getItem("exam.lang")) ||
         "ro";
      return saved === "ru" ? "ru" : "ro";
   });
   useEffect(() => {
      try {
         localStorage.setItem("exam.lang", lang);
      } catch {}
      window.dispatchEvent(new CustomEvent("exam:lang", { detail: lang }));
   }, [lang]);

   const t = useCallback(
      (key, vars) => {
         const base = (I18N[lang] && I18N[lang][key]) || I18N.ro[key] || key;
         return formatI18n(base, vars);
      },
      [lang]
   );

   // status vizual pt. bilete
   const [ticketStatusMap, setTicketStatusMap] = useState({});
   const [historyLoading, setHistoryLoading] = useState(false);

   // state sesiune practice
   const [practiceId, setPracticeId] = useState(null); // server
   const [localAttemptId, setLocalAttemptId] = useState(null); // local
   const [practiceMode, setPracticeMode] = useState("server"); // 'server' | 'local'

   const [ticketId, setTicketId] = useState(null);
   const [ticket, setTicket] = useState(null);

   // PENDING răspunsuri din această încercare (vizibile în UI)
   const [answersMap, setAnswersMap] = useState({});
   // BASELINE din server (ascuns în UI). qid -> selectedIndex (number)
   const [baselineMap, setBaselineMap] = useState({});

   // HARTA cu răspunsul corect (0-based) pt fiecare întrebare (local, fără server)
   const [correctMap, setCorrectMap] = useState({});
   const [correctLoaded, setCorrectLoaded] = useState(false);

   const [idx, setIdx] = useState(0);
   const [loading, setLoading] = useState(false);
   const [pillMsgs, setPillMsgs] = useState([]);

   const qTextRef = useRef(null);
   const timerRef = useRef(null);
   const [remaining, setRemaining] = useState(20 * 60);

   const pushError = (text) =>
      setPillMsgs((arr) => [
         ...arr,
         { id: Date.now() + Math.random(), type: "error", text },
      ]);
   const dismissLastPill = () => setPillMsgs((arr) => arr.slice(0, -1));
   useEffect(() => {
      if (!pillMsgs.length) return;
      const tmo = setTimeout(dismissLastPill, 4000);
      return () => clearTimeout(tmo);
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
   useEffect(() => {
      if (remaining === 0 && (practiceId || localAttemptId)) {
         (async () => {
            await finalizeAttempt("timeout"); // nu trimitem dif-urile
         })();
      }
   }, [remaining, practiceId, localAttemptId]); // eslint-disable-line

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

   /* ====== Culoarea biletelor din istoric (fallback pe P#) ====== */
   useEffect(() => {
      if (view !== "tickets") return;
      let alive = true;

      (async () => {
         setHistoryLoading(true);
         try {
            const all = await getAllMyPracticeHistory({
               pageSize: 300,
               maxPages: 10,
            });
            const items = Array.isArray(all)
               ? all
               : all?.data || all?.items || [];

            const lastByPNr = new Map();
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
               const localId = START_ID + (pNr - 1);
               if (String(v.status).toUpperCase().includes("IN_PROGRESS"))
                  continue;

               let cls;
               const up = String(v.status || "").toUpperCase();
               if (up.includes("FAILED")) cls = "bad";
               else if (up.includes("PASSED")) cls = "ok";
               else if (v.total > 0 && Number.isFinite(v.correct)) {
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

   /* ========= START LOCAL FRESH (fallback fără server) ========= */
   async function startLocalFresh(tid) {
      setPracticeMode("local");
      setPracticeId(null);
      setLocalAttemptId(
         `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      );
      setTicketId(tid);
      setAnswersMap({});
      setBaselineMap({});
      setCorrectMap({});
      setCorrectLoaded(false);
      setIdx(0);

      const qs = await getTicketQuestions(tid);
      const tkt = {
         id: Number(tid),
         name: `Bilet ${Number(tid) - (START_ID - 1)}`,
         questions: (qs || [])
            .map((q, i) => ({
               id: Number(q?.id ?? i + 1),
               text: pickLang(q?.text ?? q?.question ?? q?.title ?? "", lang),
               answers: (Array.isArray(q?.answers)
                  ? q.answers
                  : [q?.a1, q?.a2, q?.a3, q?.a4].filter((v) => v != null)
               )
                  .map((a) => pickLang(a, lang))
                  .filter(Boolean),
               image: rewriteImageUrl(pickLang(q?.image || q?.img || "", lang)),
               order: Number.isFinite(q?.order) ? Number(q.order) : i,
            }))
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      };
      setTicket(tkt);

      // corecte locale
      const cm = {};
      (qs || []).forEach((q, i) => {
         const qid = Number(q?.id ?? i + 1);
         const answersLen = Array.isArray(q?.answers) ? q.answers.length : 0;
         const ci = normalizeCorrectIdx(q?.correctAnswer, answersLen);
         if (Number.isInteger(qid) && Number.isInteger(ci)) cm[qid] = ci;
      });
      setCorrectMap(cm);
      setCorrectLoaded(true);

      setView("test");
   }

   // pornește PRACTICA: resume dacă există, altfel creează; NU arătăm răsp. vechi
   const enterTicket = async (tid) => {
      setLoading(true);

      setPracticeId(null);
      setLocalAttemptId(null);
      setPracticeMode("server");
      setTicket(null);
      setTicketId(null);
      setAnswersMap({});
      setBaselineMap({});
      setCorrectMap({});
      setCorrectLoaded(false);
      setIdx(0);

      try {
         // 1) Resume prin practiceId memorat local (dacă există)
         const resumed = await tryResumeFromLocal(tid, lang);
         if (resumed?.sess && resumed?.pid) {
            const pid = Number(resumed.pid);
            const sess = resumed.sess;

            setPracticeMode("server");
            setPracticeId(pid);
            setTicketId(Number(tid));
            rememberPractice(Number(tid), pid);

            let tkt = normalizeSessionToTicket(sess, lang);
            tkt = {
               ...tkt,
               questions: [...(tkt?.questions || [])].sort(
                  (a, b) => (a.order ?? 0) - (b.order ?? 0)
               ),
            };
            setTicket(tkt);

            const base = buildBaselineFromSession(sess);
            setBaselineMap(base);

            // corecte (din setul complet de întrebări)
            try {
               const srvQs = await getTicketQuestions(tid);
               const cm = {};
               (srvQs || []).forEach((q) => {
                  const answersLen = Array.isArray(q?.answers)
                     ? q.answers.length
                     : 0;
                  const ci = normalizeCorrectIdx(q?.correctAnswer, answersLen);
                  if (Number.isInteger(q?.id) && Number.isInteger(ci))
                     cm[q.id] = ci;
               });
               setCorrectMap(cm);
            } catch {
               setCorrectMap({});
            } finally {
               setCorrectLoaded(true);
            }

            setAnswersMap({});
            setIdx(firstUnansweredIndex(tkt, {}));
            setView("test");
            setLoading(false);
            return;
         }

         // 2) altfel start (endpoint face Start sau Resume pe server)
         const started = await startPracticeSession(tid, lang);
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

         const sess = await getPracticeSession(pid, lang);

         setPracticeMode("server");
         setPracticeId(pid);
         setTicketId(effectiveTid);
         rememberPractice(effectiveTid, pid);

         let tkt = normalizeSessionToTicket(sess, lang);
         tkt = {
            ...tkt,
            questions: [...(tkt?.questions || [])].sort(
               (a, b) => (a.order ?? 0) - (b.order ?? 0)
            ),
         };
         setTicket(tkt);

         const base = buildBaselineFromSession(sess);
         setBaselineMap(base);

         // corecte (din setul complet de întrebări)
         try {
            const srvQs = await getTicketQuestions(effectiveTid);
            const cm = {};
            (srvQs || []).forEach((q) => {
               const answersLen = Array.isArray(q?.answers)
                  ? q.answers.length
                  : 0;
               const ci = normalizeCorrectIdx(q?.correctAnswer, answersLen);
               if (Number.isInteger(q?.id) && Number.isInteger(ci))
                  cm[q.id] = ci;
            });
            setCorrectMap(cm);
         } catch {
            setCorrectMap({});
         } finally {
            setCorrectLoaded(true);
         }

         setAnswersMap({});
         setIdx(firstUnansweredIndex(tkt, {}));
         setView("test");
      } catch (e) {
         setCorrectLoaded(true);
         setCorrectMap({});
         pushError(t("cannot_start_practice"));
      } finally {
         setLoading(false);
      }
   };

   const current = ticket?.questions?.[idx] || null;
   const total = ticket?.questions?.length || 0;

   // Recalculează corectitudinea pentru selecțiile deja făcute odată ce avem correctMap
   useEffect(() => {
      if (!correctLoaded || !ticket) return;
      setAnswersMap((prev) => {
         let changed = false;
         const next = { ...prev };
         for (const q of ticket.questions || []) {
            const qid = q.id;
            const sel = next[qid]?.selected;
            if (sel != null) {
               const ci = Number.isInteger(correctMap[qid])
                  ? correctMap[qid]
                  : null;
               const corr =
                  Number.isInteger(ci) && Number.isInteger(sel)
                     ? Number(sel) === Number(ci)
                     : null;
               if (
                  next[qid]?.correct !== corr ||
                  next[qid]?.correctIdx !== ci
               ) {
                  next[qid] = {
                     ...next[qid],
                     correct: corr,
                     correctIdx: Number.isInteger(ci) ? ci : null,
                  };
                  changed = true;
               }
            }
         }
         return changed ? next : prev;
      });
   }, [correctLoaded, correctMap, ticket]);

   // metrice pentru UI (din pending)
   const metrics = useMemo(() => {
      let ok = 0,
         bad = 0,
         answered = 0;
      Object.values(answersMap).forEach((a) => {
         if (a?.selected != null) answered++;
         if (a?.correct === true) ok++;
         else if (a?.correct === false) bad++;
      });
      return { ok, bad, answered, left: Math.max(0, total - answered) };
   }, [answersMap, total]);

   // Finalizează apare DOAR dacă ai răspuns la toate întrebările în această încercare
   const allAnsweredNow = useMemo(() => {
      if (!ticket?.questions?.length) return false;
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

   // Trimite DOAR dif-urile (ce ai modificat față de baseline) — doar la Finish
   async function sendPendingDiffs() {
      if (practiceMode !== "server" || !practiceId) return;

      const diffs = [];
      for (const q of ticket?.questions || []) {
         const qid = Number(q.id);
         const pendingSel =
            answersMap[qid] && Number.isInteger(answersMap[qid].selected)
               ? Number(answersMap[qid].selected)
               : null;
         if (pendingSel == null) continue;

         const baselineSel = Number.isInteger(baselineMap[qid])
            ? Number(baselineMap[qid])
            : null;

         if (baselineSel === null || pendingSel !== baselineSel) {
            diffs.push({ questionId: qid, selectedAnswer: pendingSel + 1 });
         }
      }

      for (const d of diffs) {
         try {
            await submitPracticeAnswer(practiceId, d);
         } catch (e) {
            // ignorăm punctual, nu blocăm restul
         }
      }
   }

   const finalizeAttempt = async (reason = "user-finish") => {
      if (reason === "user-finish") {
         try {
            await sendPendingDiffs();
         } catch {}
      }

      // curățare state și revenire la listă
      setView("tickets");
      setPracticeId(null);
      setLocalAttemptId(null);
      setPracticeMode("server");
      setTicket(null);
      setTicketId(null);
      setAnswersMap({});
      setBaselineMap({});
      setCorrectMap({});
      setCorrectLoaded(false);
      setIdx(0);
   };

   // onChoose: setăm pending în UI + marcăm corect/greșit local (fără server)
   const onChoose = (answerIdx) => {
      if (!current) return;
      if (answersMap[current.id]?.selected != null) return;

      const selected = Number(answerIdx);

      const ci = Number.isInteger(correctMap[current.id])
         ? Number(correctMap[current.id])
         : null;
      const corr =
         Number.isInteger(ci) && Number.isInteger(selected)
            ? Number(selected) === Number(ci)
            : null;

      setAnswersMap((prevMap) => ({
         ...prevMap,
         [current.id]: {
            selected,
            correct: corr,
            correctIdx: Number.isInteger(ci) ? ci : null,
            at: new Date().toISOString(),
         },
      }));
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
               <div
                  className="practice__header tikets-header"
                  style={{
                     display: "flex",
                     alignItems: "center",
                     gap: 10,
                     justifyContent: "space-between",
                     flexWrap: "wrap",
                  }}
               >
                  <h2 style={{ margin: 0 }}>{t("practice_title")}</h2>

                  <div
                     className="exam-lang"
                     style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                     <button
                        type="button"
                        className={
                           "practice__back bottom toggle" +
                           (lang === "ro" ? " yellow" : "")
                        }
                        onClick={() => setLang("ro")}
                        title={t("lang_ro")}
                     >
                        RO
                     </button>
                     <button
                        type="button"
                        className={
                           "practice__back bottom toggle" +
                           (lang === "ru" ? " yellow" : "")
                        }
                        onClick={() => setLang("ru")}
                        title={t("lang_ru")}
                     >
                        RU
                     </button>
                  </div>
               </div>

               <div className="practice__grid">
                  {tickets.map((tkt) => {
                     const st = ticketStatusMap[tkt.id];
                     const cls =
                        "practice__ticket" +
                        (st ? ` practice__ticket--${st}` : "");
                     return (
                        <button
                           key={tkt.id}
                           className={cls}
                           onClick={() => enterTicket(tkt.id)}
                           disabled={loading || historyLoading}
                           title={t("start_ticket_title", { n: tkt.nr })}
                        >
                           <div className="practice__ticket-title">
                              {t("ticket_n", { n: tkt.nr })}
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
                     {t("back")}
                  </button>

                  <div className="practice__toolbar-center">
                     <div className="practice__question-index">
                        {t("question_index", {
                           i: Math.min(idx + 1, total),
                           total,
                        })}
                     </div>
                     <span className="practice__summary-pill practice__summary-pill--ok">
                        {t("correct_count", { n: metrics.ok })}
                     </span>
                     <span className="practice__summary-pill practice__summary-pill--bad">
                        {t("wrong_count", { n: metrics.bad })}
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
                        title={t("question_n", { n: i + 1 })}
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
                                 alt={t("question_alt")}
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
                                 alt={t("question_alt")}
                                 onError={(e) =>
                                    (e.currentTarget.hidden = true)
                                 }
                              />
                           </div>
                        )}

                        <div className="practice__answers">
                           {(current.answers || []).map((ans, i) => {
                              const saved = answersMap[current.id];
                              const selected = saved?.selected;
                              const correctIdx = Number.isInteger(
                                 saved?.correctIdx
                              )
                                 ? saved.correctIdx
                                 : Number.isInteger(correctMap[current.id])
                                 ? correctMap[current.id]
                                 : null;

                              const isCorrectOption =
                                 selected != null &&
                                 Number.isInteger(correctIdx) &&
                                 i === Number(correctIdx);

                              const isWrongSelected =
                                 selected != null &&
                                 Number.isInteger(correctIdx) &&
                                 selected === i &&
                                 i !== Number(correctIdx);

                              const isSelected = selected === i;

                              const className =
                                 "practice__answer" +
                                 (isCorrectOption
                                    ? " practice__answer--correct"
                                    : "") +
                                 (isWrongSelected
                                    ? " practice__answer--wrong-selected"
                                    : "") +
                                 (isSelected
                                    ? " practice__answer--selected"
                                    : "");

                              return (
                                 <button
                                    key={i}
                                    className={className}
                                    onClick={() => onChoose(i)}
                                    title={t("choose_answer")}
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
                        <button
                           type="button"
                           className="practice__secondary"
                           onClick={goNext}
                           disabled={idx >= total - 1}
                        >
                           {t("next")}
                        </button>

                        {allAnsweredNow && (
                           <button
                              type="button"
                              className="practice__secondary practice__secondary--primary"
                              onClick={() => finalizeAttempt("user-finish")}
                              style={{ marginLeft: 8 }}
                           >
                              {t("finish")}
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
