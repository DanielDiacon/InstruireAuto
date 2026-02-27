// src/pages/Practice.jsx
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
   startPracticeSessionByCategory,
   getPracticeSession,
   submitPracticeAnswer,
   getTicketQuestions,
   getAllMyPracticeHistory,
   getPracticeCategoryHistory, // ✅ NEW
} from "../../api/examService";

import {
   getQuestionCategories,
   getQuestionCategoriesWithCount,
} from "../../api/questionCategoriesService";
import { searchQuestions } from "../../api/questionsService";

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

      // ✅ home tabs
      tickets_tab: "Bilete",
      categories_tab: "Teme",
      refresh: "Refresh",
      categories_loading: "Se încarcă categoriile…",
      categories_empty: "Nu există categorii.",
      categories_load_failed: "Nu am putut încărca categoriile.",
      questions_count: "Întrebări",
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

      // ✅ home tabs
      tickets_tab: "Билеты",
      categories_tab: "Темы",
      refresh: "Обновить",
      categories_loading: "Загрузка категорий…",
      categories_empty: "Категории отсутствуют.",
      categories_load_failed: "Не удалось загрузить категории.",
      questions_count: "Вопросы",
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

/** Normalizează sesiunea -> ticket (ticket sau category) */
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

      const rawLocalId = q?.id ?? q?.questionId ?? i + 1;
      const parsedLocalId = Number(rawLocalId);
      const localId =
         Number.isInteger(parsedLocalId) && parsedLocalId > 0
            ? parsedLocalId
            : i + 1;

      const rawServerId = q?.questionId ?? q?.id ?? localId;
      const parsedServerId = Number(rawServerId);
      const serverQuestionId =
         Number.isInteger(parsedServerId) && parsedServerId > 0
            ? parsedServerId
            : localId;

      return {
         id: localId, // UI key
         serverQuestionId, // submit key
         text: pickLang(q?.text ?? q?.question ?? q?.title ?? "", lang),
         answers: answersRaw.map((a) => pickLang(a, lang)).filter(Boolean),
         image: rewriteImageUrl(pickLang(q?.image || q?.img || "", lang)),
         order: Number.isFinite(q?.order) ? Number(q.order) : i,
         correctAnswer: q?.correctAnswer,
      };
   });

   return { id: tid, name, questions };
}

/* prag „admis” */
const requiredOk = (total) => (total >= 26 ? 22 : Math.ceil(total * 0.85));

/* extras P# din denumire */
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
      const idA = Number(q?.id);
      const idB = Number(q?.questionId);
      const sel = q?.selectedAnswer ?? q?.userAnswer;
      if (Number.isInteger(sel)) {
         // păstrăm exact (nu forțăm -1 aici) pentru a evita ambiguitatea 0/1-based
         if (Number.isInteger(idA) && idA > 0) map[idA] = sel;
         if (Number.isInteger(idB) && idB > 0) map[idB] = sel;
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

function isSessionOpenForAnswers(sess) {
   if (!sess || typeof sess !== "object") return false;

   const st = String(sess?.status || "").toUpperCase();
   if (st) return isInProgressStatus(st);

   if (sess?.completedAt || sess?.finishedAt || sess?.endedAt) return false;
   return true;
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

function normalizeSelectedToZeroBased(raw, answersLen) {
   const n = Number(raw);
   if (!Number.isInteger(n) || answersLen <= 0) return null;
   if (n >= 0 && n < answersLen) return n; // 0-based
   if (n >= 1 && n <= answersLen) return n - 1; // 1-based
   return null;
}

function isInProgressStatus(status) {
   const up = String(status || "").toUpperCase();
   return (
      up.includes("IN_PROGRESS") ||
      up.includes("STARTED") ||
      up.includes("ACTIVE")
   );
}

function normalizeQuestionsSearchItems(raw) {
   if (Array.isArray(raw)) return raw;
   const items = raw?.data || raw?.items || raw?.results || raw?.rows || [];
   return Array.isArray(items) ? items : [];
}

function readTotalPages(raw) {
   const n = Number(
      raw?.pagination?.totalPages ??
         raw?.meta?.totalPages ??
         raw?.totalPages ??
         raw?.pages ??
         0
   );
   return Number.isInteger(n) && n > 0 ? n : null;
}

async function loadCategoryCorrectMapFromQuestionsApi(categoryId, sessQuestions) {
   const cid = Number(categoryId);
   if (!Number.isInteger(cid) || cid <= 0) return {};

   const wantedByServerId = new Map(); // serverQid -> [localId/serverId keys]
   for (const q of sessQuestions || []) {
      const localId = Number(q?.id);
      const serverQid = Number(q?.serverQuestionId ?? q?.questionId ?? q?.id);
      if (!Number.isInteger(serverQid) || serverQid <= 0) continue;

      const keys = wantedByServerId.get(serverQid) || [];
      if (Number.isInteger(localId) && localId > 0 && !keys.includes(localId)) {
         keys.push(localId);
      }
      if (!keys.includes(serverQid)) keys.push(serverQid);
      wantedByServerId.set(serverQid, keys);
   }
   if (!wantedByServerId.size) return {};

   const out = {};
   const LIMIT = 200;
   const MAX_PAGES = 40;
   let page = 1;
   let totalPages = null;

   while (page <= MAX_PAGES) {
      const raw = await searchQuestions({
         page,
         limit: LIMIT,
         categoryId: cid,
      });
      const items = normalizeQuestionsSearchItems(raw);
      if (!items.length) break;

      for (const qq of items) {
         const serverQid = Number(qq?.id ?? qq?.questionId);
         if (!Number.isInteger(serverQid) || !wantedByServerId.has(serverQid)) {
            continue;
         }

         const answersRaw = Array.isArray(qq?.answers)
            ? qq.answers
            : [qq?.a1, qq?.a2, qq?.a3, qq?.a4].filter((v) => v != null);
         const answersLen = Array.isArray(answersRaw) ? answersRaw.length : 0;
         const ci = normalizeCorrectIdx(
            qq?.correctAnswer ?? qq?.correctIndex ?? qq?.rightIndex,
            answersLen
         );
         if (!Number.isInteger(ci)) continue;

         const keys = wantedByServerId.get(serverQid) || [];
         for (const key of keys) out[key] = ci;
      }

      let done = true;
      for (const keys of wantedByServerId.values()) {
         let hasAny = false;
         for (const k of keys) {
            if (Number.isInteger(out[k])) {
               hasAny = true;
               break;
            }
         }
         if (!hasAny) {
            done = false;
            break;
         }
      }
      if (done) break;

      totalPages = totalPages || readTotalPages(raw);
      if (totalPages && page >= totalPages) break;
      page += 1;
   }

   return out;
}

/* ===== Categories helpers ===== */
const getCatCount = (c) =>
   c?._count?.questions ??
   c?.questionCount ??
   c?.questionsCount ??
   c?.count ??
   c?.totalQuestions ??
   0;

function normalizePagedResponse(raw) {
   if (Array.isArray(raw)) return raw;
   const items =
      raw?.data ||
      raw?.items ||
      raw?.results ||
      raw?.rows ||
      raw?.categories ||
      [];
   return Array.isArray(items) ? items : [];
}

function catTitleByLang(cat, lang) {
   const ro = String(cat?.nameRo ?? "").trim();
   const ru = String(cat?.nameRu ?? "").trim();
   if (lang === "ru") return ru || ro || `#${cat?.id}`;
   return ro || ru || `#${cat?.id}`;
}

/* =========================
   CATEGORY STATS (history)
========================= */
async function unwrapMaybeResponse(raw, fallback) {
   if (raw == null) return fallback;

   if (typeof raw === "object" && typeof raw.json === "function") {
      if (raw.ok === false) {
         let text = "";
         try {
            text = await raw.text();
         } catch {}
         throw new Error(text || `HTTP ${raw.status || "error"}`);
      }
      try {
         return await raw.json();
      } catch {
         return fallback;
      }
   }

   return raw;
}

function normalizeHistoryList(raw) {
   if (Array.isArray(raw)) return raw;
   const items =
      raw?.data ||
      raw?.items ||
      raw?.results ||
      raw?.rows ||
      raw?.history ||
      [];
   return Array.isArray(items) ? items : [];
}

function histTs(it) {
   return (
      Date.parse(
         it?.completedAt ||
            it?.finishedAt ||
            it?.endedAt ||
            it?.startedAt ||
            it?.createdAt ||
            0
      ) || 0
   );
}

function histTotal(it, fallbackTotal) {
   const total =
      Number(it?.totalQuestions) ||
      Number(it?.total) ||
      Number(it?.questionsTotal) ||
      Number(it?.progress?.total) ||
      Number(it?.progress?.questionsTotal);

   if (Number.isFinite(total) && total > 0) return total;

   const fb = Number(fallbackTotal);
   return Number.isFinite(fb) && fb > 0 ? fb : 0;
}

function histCorrect(it, total) {
   let c =
      it?.correct ??
      it?.score ??
      it?.correctCount ??
      it?.progress?.correct ??
      it?.progress?.correctCount ??
      0;

   c = Number(c);
   if (!Number.isFinite(c)) c = 0;

   if (c > 0 && c <= 1 && Number.isFinite(total) && total > 0) {
      return Math.round(c * total);
   }

   return Math.max(0, Math.floor(c));
}

/* Category badge: preferă ultima încercare finalizată; dacă nu există, folosește latest. */
function computeCategoryStat(items, fallbackTotal) {
   const list = Array.isArray(items) ? items.slice() : [];
   const fbTotal = Number(fallbackTotal) || 0;

   if (!list.length) {
      return { state: "none", correct: 0, total: fbTotal };
   }

   list.sort((a, b) => histTs(b) - histTs(a));

   const latestFinished = list.find((it) => !isInProgressStatus(it?.status));
   const target = latestFinished || list[0];
   const total = Math.max(0, Number(histTotal(target, fbTotal)) || 0);
   const correct = Math.min(
      total,
      Math.max(0, Number(histCorrect(target, total)) || 0)
   );

   const st = String(target?.status || "").toUpperCase();

   if (!latestFinished && (st.includes("IN_PROGRESS") || st.includes("STARTED"))) {
      return { state: "none", correct, total };
   }
   if (st.includes("FAILED")) return { state: "bad", correct, total };
   if (st.includes("PASSED")) return { state: "ok", correct, total };

   if (total > 0) {
      return {
         state: correct >= requiredOk(total) ? "ok" : "bad",
         correct,
         total,
      };
   }

   return { state: "none", correct, total };
}

export default function Practice() {
   const { user } = useContext(UserContext) || {};

   const [view, setView] = useState("tickets");
   const [homeTab, setHomeTab] = useState("tickets");

   const [sessionKind, setSessionKind] = useState("ticket"); // 'ticket' | 'category'

   const DISPLAY_BASE = START_ID - 1;
   const tickets = useMemo(
      () => TICKET_IDS.map((id) => ({ id, nr: id - DISPLAY_BASE })),
      [DISPLAY_BASE]
   );

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

   const [ticketStatusMap, setTicketStatusMap] = useState({});
   const [historyLoading, setHistoryLoading] = useState(false);

   const [practiceId, setPracticeId] = useState(null);
   const [localAttemptId, setLocalAttemptId] = useState(null);
   const [practiceMode, setPracticeMode] = useState("server"); // 'server' | 'local'

   const [ticketId, setTicketId] = useState(null);
   const [ticket, setTicket] = useState(null);

   const [answersMap, setAnswersMap] = useState({});
   const [baselineMap, setBaselineMap] = useState({});
   const [correctMap, setCorrectMap] = useState({});
   const [correctLoaded, setCorrectLoaded] = useState(false);

   const [idx, setIdx] = useState(0);
   const [loading, setLoading] = useState(false);

   const [pillMsgs, setPillMsgs] = useState([]);
   const qTextRef = useRef(null);
   const timerRef = useRef(null);
   const [remaining, setRemaining] = useState(60 * 60);

   // ✅ anti-race pentru category stats
   const catStatsReqRef = useRef(0);

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
            await finalizeAttempt("timeout");
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

   /* ====== Culoarea biletelor din istoric ====== */
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

               const prev = lastByPNr.get(pNr) || {
                  finished: null,
                  inProgress: null,
               };
               const record = { ts, status, total, correct };

               if (isInProgressStatus(status)) {
                  if (!prev.inProgress || ts > prev.inProgress.ts) {
                     prev.inProgress = record;
                  }
               } else if (!prev.finished || ts > prev.finished.ts) {
                  prev.finished = record;
               }

               lastByPNr.set(pNr, prev);
            }

            const mapObj = {};
            for (const [pNr, rec] of lastByPNr.entries()) {
               const v = rec?.finished || rec?.inProgress;
               if (!v) continue;

               const localId = START_ID + (pNr - 1);
               if (isInProgressStatus(v.status)) continue;

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

   /* =========================
      CATEGORIES (HOME TAB)
  ========================= */
   const [categories, setCategories] = useState([]);
   const [catLoading, setCatLoading] = useState(false);
   const [catError, setCatError] = useState("");

   const [catStatsMap, setCatStatsMap] = useState({});
   const [catStatsLoading, setCatStatsLoading] = useState(false);

   const hasAnyCatStats = useMemo(
      () => Object.keys(catStatsMap || {}).length > 0,
      [catStatsMap]
   );

   const loadCategoryStats = useCallback(
      async (cats) => {
         const list = Array.isArray(cats) ? cats : [];
         const reqId = ++catStatsReqRef.current;

         if (!list.length) {
            setCatStatsMap({});
            return;
         }

         setCatStatsLoading(true);
         setCatStatsMap({}); // ✅ nu lăsăm rezultate vechi

         try {
            const CHUNK = 8;

            for (let i = 0; i < list.length; i += CHUNK) {
               const slice = list.slice(i, i + CHUNK);

               const pairs = await Promise.all(
                  slice.map(async (c) => {
                     const cid = Number(c?.id);
                     const fallbackTotal = getCatCount(c);

                     if (!Number.isInteger(cid) || cid <= 0) {
                        return [
                           cid,
                           { state: "none", correct: 0, total: fallbackTotal },
                        ];
                     }

                     try {
                        const raw = await getPracticeCategoryHistory(cid, {
                           page: 1,
                           limit: 30,
                           lang,
                        });

                        const unwrapped = await unwrapMaybeResponse(raw, []);
                        const items = normalizeHistoryList(unwrapped);
                        const stat = computeCategoryStat(items, fallbackTotal);

                        return [cid, stat];
                     } catch {
                        return [
                           cid,
                           { state: "none", correct: 0, total: fallbackTotal },
                        ];
                     }
                  })
               );

               if (catStatsReqRef.current !== reqId) return; // ✅ abandon dacă s-a pornit alt load

               const partial = {};
               for (const [cid, stat] of pairs) {
                  if (Number.isInteger(cid) && cid > 0) partial[cid] = stat;
               }

               setCatStatsMap((prev) =>
                  catStatsReqRef.current === reqId
                     ? { ...prev, ...partial }
                     : prev
               );
            }
         } finally {
            if (catStatsReqRef.current === reqId) setCatStatsLoading(false);
         }
      },
      [lang]
   );

   const loadCategories = useCallback(async () => {
      setCatLoading(true);
      setCatError("");
      try {
         let data;
         try {
            data = await getQuestionCategoriesWithCount();
         } catch {
            const raw = await getQuestionCategories(1, 2000);
            data = normalizePagedResponse(raw);
         }
         const list = Array.isArray(data) ? data : normalizePagedResponse(data);
         const sortedList = [...list].sort((a, b) => {
            const aId = Number(a?.id);
            const bId = Number(b?.id);
            const aOk = Number.isFinite(aId);
            const bOk = Number.isFinite(bId);
            if (aOk && bOk) return aId - bId;
            if (aOk) return -1;
            if (bOk) return 1;
            return 0;
         });

         setCategories(sortedList);
         await loadCategoryStats(sortedList);
      } catch (e) {
         setCategories([]);
         setCatStatsMap({});
         setCatError(e?.message || t("categories_load_failed"));
      } finally {
         setCatLoading(false);
      }
   }, [t, loadCategoryStats]);

   useEffect(() => {
      if (view !== "tickets") return;
      if (homeTab !== "categories") return;
      if (categories.length) return;
      loadCategories();
   }, [view, homeTab, categories.length, loadCategories]);

   useEffect(() => {
      if (view !== "tickets") return;
      if (homeTab !== "categories") return;
      if (!categories.length) return;
      if (hasAnyCatStats) return;
      loadCategoryStats(categories);
   }, [view, homeTab, categories, hasAnyCatStats, loadCategoryStats]);

   const getServerQid = useCallback((q) => {
      return Number(q?.serverQuestionId ?? q?.questionId ?? q?.id);
   }, []);

   async function startLocalFresh(tid) {
      setSessionKind("ticket");

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
               serverQuestionId: Number(q?.id ?? i + 1),
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

   const enterTicket = async (tid) => {
      setSessionKind("ticket");

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
         const resumed = await tryResumeFromLocal(tid, lang);
         if (resumed?.sess && resumed?.pid) {
            const pid = Number(resumed.pid);
            const sess = resumed.sess;

            // Nu reluăm sesiuni închise/expirate din localStorage.
            if (!isSessionOpenForAnswers(sess)) {
               try {
                  localStorage.removeItem(lastKeyForTicket(tid));
               } catch {}
            } else {
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
         }

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

   const enterCategory = async (cat) => {
      setSessionKind("category");

      const cid = Number(cat?.id);
      if (!Number.isInteger(cid) || cid <= 0) return;

      const title = catTitleByLang(cat, lang);

      const count = Number(getCatCount(cat) || 0);
      const questionCount = Number.isInteger(count) && count > 0 ? count : 20;

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
         const started = await startPracticeSessionByCategory({
            categoryId: cid,
            questionCount,
            lang,
         });

         const pid =
            Number(started?.id) ||
            Number(started?.practiceId) ||
            Number(started?.sessionId);

         if (!Number.isInteger(pid) || pid <= 0) {
            throw new Error(
               "PracticeID invalid la startPracticeSessionByCategory."
            );
         }

         const sess = await getPracticeSession(pid, lang);

         setPracticeMode("server");
         setPracticeId(pid);

         let tkt = normalizeSessionToTicket(sess, lang);
         tkt = {
            ...tkt,
            name: title || tkt?.name || "Categorie",
            questions: [...(tkt?.questions || [])].sort(
               (a, b) => (a.order ?? 0) - (b.order ?? 0)
            ),
         };
         setTicket(tkt);

         const base = buildBaselineFromSession(sess);
         setBaselineMap(base);

         const cm = {};
         (tkt?.questions || []).forEach((q) => {
            const qid = Number(q?.id);
            const serverQid = Number(q?.serverQuestionId ?? q?.id);
            const answersLen = Array.isArray(q?.answers) ? q.answers.length : 0;
            const ci = normalizeCorrectIdx(q?.correctAnswer, answersLen);
            if (Number.isInteger(ci)) {
               if (Number.isInteger(qid) && qid > 0) cm[qid] = ci;
               if (Number.isInteger(serverQid) && serverQid > 0)
                  cm[serverQid] = ci;
            }
         });

         try {
            const byQuestionsApi = await loadCategoryCorrectMapFromQuestionsApi(
               cid,
               tkt?.questions || []
            );
            Object.assign(cm, byQuestionsApi);
         } catch {}

         setCorrectMap(cm);
         setCorrectLoaded(true);

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
   }, [correctLoaded, correctMap, ticket, sessionKind]);

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

   const onChooseTicket = (answerIdx) => {
      if (!current) return;

      const qKey = Number(current.id);
      if (!Number.isInteger(qKey) || qKey <= 0) return;

      if (answersMap[qKey]?.selected != null) return;

      const selected = Number(answerIdx);

      const ci = Number.isInteger(correctMap[qKey])
         ? Number(correctMap[qKey])
         : null;
      const corr =
         Number.isInteger(ci) && Number.isInteger(selected)
            ? Number(selected) === Number(ci)
            : null;

      setAnswersMap((prevMap) => ({
         ...prevMap,
         [qKey]: {
            selected,
            correct: corr,
            correctIdx: Number.isInteger(ci) ? ci : null,
            at: new Date().toISOString(),
            pending: false,
         },
      }));
   };

   // Category (separat): simulare locală, fără submit instant.
   const handleCategoryAnswerLocal = (answerIdx) => {
      if (!current) return;
      if (loading) return;

      const qKey = Number(current.id);
      if (!Number.isInteger(qKey) || qKey <= 0) return;

      const already = answersMap[qKey];
      if (already?.selected != null || already?.pending) return;

      const selected = Number(answerIdx);
      const ci = Number.isInteger(correctMap[qKey])
         ? Number(correctMap[qKey])
         : null;
      const hasLocalCorrect = Number.isInteger(ci);

      if (hasLocalCorrect) {
         const corr = Number(selected) === Number(ci);
         setAnswersMap((prev) => ({
            ...prev,
            [qKey]: {
               selected,
               correct: corr,
               correctIdx: ci,
               at: new Date().toISOString(),
               pending: false,
            },
         }));
         return;
      }

      setAnswersMap((prev) => ({
         ...prev,
         [qKey]: {
            selected,
            correct: null,
            correctIdx: null,
            at: new Date().toISOString(),
            pending: false,
            error: false,
         },
      }));
   };

   // Ticket flow (neschimbat): submit la final, 1-based.
   async function sendPendingTicketDiffs() {
      if (sessionKind !== "ticket") return;
      if (practiceMode !== "server" || !practiceId) return;
      if (!ticket?.questions?.length) return;

      try {
         const sess = await getPracticeSession(practiceId, lang);
         if (!isSessionOpenForAnswers(sess)) return;
      } catch {
         return;
      }

      const diffs = [];
      for (const q of ticket?.questions || []) {
         const qKey = Number(q.id);
         const answersLen = Array.isArray(q?.answers) ? q.answers.length : 0;
         const pendingSel =
            answersMap[qKey] && Number.isInteger(answersMap[qKey].selected)
               ? Number(answersMap[qKey].selected)
               : null;
         if (pendingSel == null) continue;

         const baselineSel = normalizeSelectedToZeroBased(
            baselineMap[qKey],
            answersLen
         );

         if (baselineSel === null || pendingSel !== baselineSel) {
            const serverQid = getServerQid(q);
            if (Number.isInteger(serverQid) && serverQid > 0) {
               diffs.push({
                  questionId: serverQid,
                  selectedAnswer: pendingSel + 1,
               });
            }
         }
      }

      for (const d of diffs) {
         try {
            await submitPracticeAnswer(practiceId, d);
         } catch {
            // ignore punctual
         }
      }
   }

   // Category flow (separat): submit la final, 0-based.
   async function sendPendingCategoryDiffs() {
      if (sessionKind !== "category") return;
      if (practiceMode !== "server" || !practiceId) return;
      if (!ticket?.questions?.length) return;

      try {
         const sess = await getPracticeSession(practiceId, lang);
         if (!isSessionOpenForAnswers(sess)) return;
      } catch {
         return;
      }

      const diffs = [];
      for (const q of ticket?.questions || []) {
         const qKey = Number(q.id);
         const answersLen = Array.isArray(q?.answers) ? q.answers.length : 0;
         const pendingSel =
            answersMap[qKey] && Number.isInteger(answersMap[qKey].selected)
               ? Number(answersMap[qKey].selected)
               : null;
         if (pendingSel == null) continue;

         const baselineSel = normalizeSelectedToZeroBased(
            baselineMap[qKey],
            answersLen
         );

         if (baselineSel === null || pendingSel !== baselineSel) {
            const serverQid = getServerQid(q);
            if (Number.isInteger(serverQid) && serverQid > 0) {
               diffs.push({
                  questionId: serverQid,
                  selectedAnswer: pendingSel,
               });
            }
         }
      }

      for (const d of diffs) {
         try {
            await submitPracticeAnswer(practiceId, d);
         } catch {
            // ignore punctual
         }
      }
   }

   const finalizeAttempt = async (reason = "user-finish") => {
      if (reason === "user-finish") {
         try {
            if (sessionKind === "ticket") {
               await sendPendingTicketDiffs();
            } else if (sessionKind === "category") {
               await sendPendingCategoryDiffs();
            }
         } catch {}
      }

      // mic "sync" pentru ca serverul să finalizeze statusul înainte de history
      if (practiceMode === "server" && practiceId) {
         try {
            await getPracticeSession(practiceId, lang);
         } catch {}
      }

      setView("tickets");
      setPracticeId(null);
      setLocalAttemptId(null);
      setPracticeMode("server");
      setSessionKind("ticket");
      setTicket(null);
      setTicketId(null);
      setAnswersMap({});
      setBaselineMap({});
      setCorrectMap({});
      setCorrectLoaded(false);
      setIdx(0);

      if (categories.length) {
         try {
            await loadCategoryStats(categories);
         } catch {}
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
               <div
                  className="practice__header tikets-header"
                  style={{
                     display: "flex",
                     alignItems: "center",
                     gap: 6,
                     justifyContent: "space-between",
                     flexWrap: "wrap",
                  }}
               >
                  <h2 style={{ margin: 0 }}>{t("practice_title")}</h2>

                  <div
                     style={{ display: "flex", gap: 6, alignItems: "center" }}
                  >
                     <div className="practice__selector practice__selector--row">
                        <div
                           className={`practice__radio-wrapper ${
                              homeTab === "tickets"
                                 ? "practice__radio-wrapper--left"
                                 : "practice__radio-wrapper--right"
                           }`}
                        >
                           <button
                              type="button"
                              className="practice__back practice__back--toggle"
                              onClick={() => setHomeTab("tickets")}
                           >
                              {t("tickets_tab")}
                           </button>

                           <button
                              type="button"
                              className="practice__back practice__back--toggle"
                              onClick={() => {
                                 setHomeTab("categories");
                                 if (!categories.length) loadCategories();
                                 else if (!hasAnyCatStats && !catStatsLoading)
                                    loadCategoryStats(categories);
                              }}
                           >
                              {t("categories_tab")}
                           </button>
                        </div>
                     </div>

                     <div className="practice__selector practice__selector--row">
                        <div
                           className={`practice__radio-wrapper ${
                              lang === "ro"
                                 ? "practice__radio-wrapper--left"
                                 : "practice__radio-wrapper--right"
                           }`}
                        >
                           <button
                              type="button"
                              className="practice__back practice__back--toggle"
                              onClick={() => setLang("ro")}
                              title={t("lang_ro")}
                           >
                              RO
                           </button>

                           <button
                              type="button"
                              className="practice__back practice__back--toggle"
                              onClick={() => setLang("ru")}
                              title={t("lang_ru")}
                           >
                              RU
                           </button>
                        </div>
                     </div>
                  </div>
               </div>

               {homeTab === "categories" && (
                  <div className="practice__cat-list">
                     {catError ? (
                        <div className="practice__cat-empty">{catError}</div>
                     ) : catLoading ? (
                        <div className="practice__cat-empty">
                           {t("categories_loading")}
                        </div>
                     ) : (categories || []).length === 0 ? (
                        <div className="practice__cat-empty">
                           {t("categories_empty")}
                        </div>
                     ) : (
                        (categories || []).map((c) => {
                           const title = catTitleByLang(c, lang);
                           const cnt = Number(getCatCount(c) || 0);

                           const stat = catStatsMap[c.id];
                           const state = stat?.state || "none";
                           const totalDisp = Number(stat?.total ?? cnt ?? 0);
                           const answeredDisp = Number(stat?.answered ?? 0);

                           const badgeText =
                              !stat && catStatsLoading
                                 ? `…/${totalDisp || cnt || 0}`
                                 : `${answeredDisp}/${totalDisp || cnt || 0}`;

                           return (
                              <button
                                 key={c.id}
                                 className={"practice__cat-item" +
                                       (state === "ok"
                                          ? " practice__cat-item--ok"
                                          : "") +
                                       (state === "bad"
                                          ? " practice__cat-item--bad"
                                          : "") +
                                       (state === "none"
                                          ? " practice__cat-item--none"
                                          : "")}

                                 
                                 onClick={() => enterCategory(c)}
                                 disabled={loading}
                                 title={title}
                              >
                                 <div className="practice__cat-left">
                                    <div className="practice__cat-title">
                                       {title}
                                    </div>
                                 </div>

                                 {/*<div
                                    className={
                                       "practice__cat-badge" +
                                       (state === "ok"
                                          ? " practice__cat-badge--ok"
                                          : "") +
                                       (state === "bad"
                                          ? " practice__cat-badge--bad"
                                          : "") +
                                       (state === "none"
                                          ? " practice__cat-badge--none"
                                          : "")
                                    }
                                    style={{
                                       opacity:
                                          !stat && catStatsLoading ? 0.75 : 1,
                                    }}
                                 >
                                    {badgeText}
                                 </div>*/}
                              </button>
                           );
                        })
                     )}
                  </div>
               )}

               {homeTab === "tickets" && (
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
               )}
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
                                 : sessionKind === "ticket" &&
                                   Number.isInteger(correctMap[current.id])
                                 ? correctMap[current.id]
                                 : null;

                              const isSelected = selected === i;
                              const hasCorrectIdx =
                                 Number.isInteger(correctIdx);

                              const isCorrectOption =
                                 selected != null &&
                                 (hasCorrectIdx
                                    ? i === Number(correctIdx)
                                    : saved?.correct === true && isSelected);

                              const isWrongSelected =
                                 selected != null &&
                                 (hasCorrectIdx
                                    ? isSelected && i !== Number(correctIdx)
                                    : saved?.correct === false && isSelected);

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

                              const isDisabled =
                                 !!saved?.pending ||
                                 saved?.selected != null ||
                                 loading;

                              return (
                                 <button
                                    key={i}
                                    className={className}
                                    onClick={() =>
                                       sessionKind === "category"
                                          ? handleCategoryAnswerLocal(i)
                                          : onChooseTicket(i)
                                    }
                                    title={t("choose_answer")}
                                    disabled={isDisabled}
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
