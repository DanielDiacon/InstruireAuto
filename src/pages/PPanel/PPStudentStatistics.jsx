// src/pages/PPStudentStatistics.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";

import Header from "../../components/Header/Header";
import Popup from "../../components/Utils/Popup";
import Footer from "../../components/Footer";

import { UserContext } from "../../UserContext";

import {
   getMyGroupStudents,
   getMyGroupOverview,
   getStudentPracticeProgress,
} from "../../api/groupsService";

import {
   getQuestionCategoriesWithCount,
   getQuestionCategories,
} from "../../api/questionCategoriesService";

import { getTicketQuestions } from "../../api/examService"; // ✅ NEW
import { fetchStudents } from "../../store/studentsSlice";

// icoane
import accIcon from "../../assets/svg/acc.svg";
import homeIcon from "../../assets/svg/material-symbols--home-outline.svg";
import groupsIcon from "../../assets/svg/material-symbols--group-outline.svg";
import studentsIcon from "../../assets/svg//graduate.svg";

/* ================== ENV tickets (identic cu Practice.jsx) ================== */
const readEnv = (viteKey, craKey) =>
   (typeof import.meta !== "undefined" &&
      import.meta?.env &&
      import.meta.env[viteKey]) ||
   (typeof process !== "undefined" && process?.env && process.env[craKey]) ||
   "";

const START_ID = Number(
   readEnv("VITE_TICKETS_START", "REACT_APP_TICKETS_START") || 246,
);
const COUNT = Number(
   readEnv("VITE_TICKETS_COUNT", "REACT_APP_TICKETS_COUNT") || 269 - 246 + 1,
);
const TICKET_IDS = Array.from({ length: COUNT }, (_, i) => START_ID + i);

/* ================== STATUS helpers ================== */
const STATUS = {
   PASSED: "PASSED",
   COMPLETED: "COMPLETED",
   FAILED: "FAILED",
   IN_PROGRESS: "IN_PROGRESS",
   NOT_STARTED: "NOT_STARTED",
};

function normalizeStatus(s) {
   const v = String(s || "").toUpperCase();
   if (v.includes("PASS")) return STATUS.PASSED;
   if (v.includes("COMP")) return STATUS.COMPLETED;
   if (v.includes("FAIL")) return STATUS.FAILED;
   if (v.includes("PROGRESS") || v.includes("STARTED"))
      return STATUS.IN_PROGRESS;
   if (v.includes("NOT")) return STATUS.NOT_STARTED;
   return STATUS.NOT_STARTED;
}

function statusToState(st) {
   const s = normalizeStatus(st);
   if (s === STATUS.PASSED || s === STATUS.COMPLETED) return "ok";
   if (s === STATUS.FAILED) return "bad";
   return "none";
}

function statusLabelRo(st) {
   const s = normalizeStatus(st);
   if (s === STATUS.PASSED || s === STATUS.COMPLETED) return "Trecut";
   if (s === STATUS.FAILED) return "Picat";
   if (s === STATUS.IN_PROGRESS) return "În lucru";
   return "Neînceput";
}

/* ================== UI helpers (reuse practice-stats bar) ================== */
function SegmentedBar({ pctCorrect, pctWrong, pctUnanswered, basePx = 22 }) {
   const ok = Math.max(0, Math.min(1, (pctCorrect ?? 0) / 100));
   const bad = Math.max(0, Math.min(1, (pctWrong ?? 0) / 100));
   const skip = Math.max(0, Math.min(1, (pctUnanswered ?? 0) / 100));

   return (
      <div className="practice-stats__bar" role="img" style={{ width: "100%" }}>
         <div
            className="practice-stats__bar-inner"
            style={{
               width: "100%",
               "--base": `${basePx}px`,
               "--basesum": `calc(3 * ${basePx}px)`,
            }}
         >
            <div
               className="practice-stats__bar-seg practice-stats__bar-seg--ok"
               style={{
                  width: `calc(var(--base) + (100% - var(--basesum)) * ${ok})`,
               }}
            />
            <div
               className="practice-stats__bar-seg practice-stats__bar-seg--bad"
               style={{
                  width: `calc(var(--base) + (100% - var(--basesum)) * ${bad})`,
               }}
            />
            <div
               className="practice-stats__bar-seg practice-stats__bar-seg--skip"
               style={{
                  width: `calc(var(--base) + (100% - var(--basesum)) * ${skip})`,
               }}
            />
         </div>
      </div>
   );
}

/* ================== categories helpers (ca în Practice) ================== */
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

const getCatCount = (c) =>
   c?._count?.questions ??
   c?.questionCount ??
   c?.questionsCount ??
   c?.count ??
   c?.totalQuestions ??
   0;

function catTitleRo(cat) {
   const ro = String(cat?.nameRo ?? "").trim();
   const ru = String(cat?.nameRu ?? "").trim();
   const name = String(cat?.name ?? cat?.title ?? cat?.label ?? "").trim();
   return ro || name || ru || `#${cat?.id}`;
}

/* ================== progress from practiceHistory ================== */
function tsOf(it) {
   return (
      Date.parse(
         it?.completedAt ||
            it?.finishedAt ||
            it?.endedAt ||
            it?.startedAt ||
            it?.createdAt ||
            0,
      ) || 0
   );
}

function parseTicketNr(ticketName) {
   const s = String(ticketName || "");
   let m = s.match(/Practice\s*P\s*([0-9]+)/i);
   if (m) {
      const n = Number(m[1]);
      return Number.isInteger(n) && n > 0 ? n : null;
   }
   m = s.match(/(^|[^0-9])P\s*([0-9]{1,3})([^0-9]|$)/i);
   if (m) {
      const n = Number(m[2]);
      return Number.isInteger(n) && n > 0 ? n : null;
   }
   return null;
}

function parseCategoryId(ticketName) {
   const s = String(ticketName || "");
   let m = s.match(/Category[_\s-]*Practice[_\s-]*([0-9]+)/i);
   if (m) {
      const n = Number(m[1]);
      return Number.isInteger(n) && n > 0 ? n : null;
   }
   m = s.replace(/[\s_-]+/g, "").match(/CategoryPractice([0-9]+)/i);
   if (m) {
      const n = Number(m[1]);
      return Number.isInteger(n) && n > 0 ? n : null;
   }
   return null;
}

function safeInt(v) {
   const n = Number(v);
   return Number.isFinite(n) ? n : null;
}

function buildTicketAgg(practiceHistory) {
   const list = Array.isArray(practiceHistory) ? practiceHistory : [];
   const byNr = new Map();

   for (const it of list) {
      const nr = parseTicketNr(it?.ticketName);
      if (!nr) continue;

      const st = normalizeStatus(it?.status);
      const ts = tsOf(it);

      const prev = byNr.get(nr) || {
         latestAny: null,
         latestCompleted: null,
         latestInProgress: null,
      };

      if (!prev.latestAny || ts > prev.latestAny.ts)
         prev.latestAny = { ts, it };

      if (st === STATUS.IN_PROGRESS) {
         if (!prev.latestInProgress || ts > prev.latestInProgress.ts)
            prev.latestInProgress = { ts, it };
      } else {
         if (!prev.latestCompleted || ts > prev.latestCompleted.ts)
            prev.latestCompleted = { ts, it };
      }

      byNr.set(nr, prev);
   }

   const out = {};
   for (const [nr, rec] of byNr.entries()) {
      const base =
         rec.latestCompleted?.it ||
         rec.latestInProgress?.it ||
         rec.latestAny?.it ||
         null;

      const st = normalizeStatus(base?.status);
      const state = statusToState(st);

      const correct = safeInt(base?.score);
      const total = safeInt(base?.totalQuestions);

      const hasNewerInProgress =
         rec.latestInProgress &&
         (!rec.latestCompleted ||
            rec.latestInProgress.ts > rec.latestCompleted.ts);

      out[String(nr)] = {
         state,
         st,
         label: hasNewerInProgress ? "În lucru" : statusLabelRo(st),
         correct,
         total,
      };
   }
   return out;
}

function buildCategoryAgg(practiceHistory) {
   const list = Array.isArray(practiceHistory) ? practiceHistory : [];
   const byId = new Map();

   for (const it of list) {
      const cid = parseCategoryId(it?.ticketName);
      if (!cid) continue;

      const st = normalizeStatus(it?.status);
      const ts = tsOf(it);

      const prev = byId.get(cid) || {
         latestAny: null,
         latestCompleted: null,
         latestInProgress: null,
      };

      if (!prev.latestAny || ts > prev.latestAny.ts)
         prev.latestAny = { ts, it };

      if (st === STATUS.IN_PROGRESS) {
         if (!prev.latestInProgress || ts > prev.latestInProgress.ts)
            prev.latestInProgress = { ts, it };
      } else {
         if (!prev.latestCompleted || ts > prev.latestCompleted.ts)
            prev.latestCompleted = { ts, it };
      }

      byId.set(cid, prev);
   }

   const out = {};
   for (const [cid, rec] of byId.entries()) {
      const base =
         rec.latestCompleted?.it ||
         rec.latestInProgress?.it ||
         rec.latestAny?.it ||
         null;

      const st = normalizeStatus(base?.status);
      const state = statusToState(st);

      const correct = safeInt(base?.score);
      const total = safeInt(base?.totalQuestions);

      const hasNewerInProgress =
         rec.latestInProgress &&
         (!rec.latestCompleted ||
            rec.latestInProgress.ts > rec.latestCompleted.ts);

      out[String(cid)] = {
         state,
         st,
         label: hasNewerInProgress ? "În lucru" : statusLabelRo(st),
         correct,
         total,
      };
   }
   return out;
}

export default function PPStudentStatistics() {
   const { user } = useContext(UserContext);
   const { studentId } = useParams();
   const navigate = useNavigate();
   const dispatch = useDispatch();

   const studentsState = useSelector((state) => state.students || {});
   const allUsers = Array.isArray(studentsState.list) ? studentsState.list : [];

   const studentFromRedux = useMemo(() => {
      const sid = String(studentId);
      return allUsers.find((u) => String(u?.id) === sid) || null;
   }, [allUsers, studentId]);

   const [loading, setLoading] = useState(true);
   const [err, setErr] = useState("");

   const [allowed, setAllowed] = useState(false);

   const [studentFromGroup, setStudentFromGroup] = useState(null);
   const student = studentFromRedux || studentFromGroup || null;

   const [overview, setOverview] = useState(null);
   const [statistics, setStatistics] = useState(null);
   const [practiceHistory, setPracticeHistory] = useState([]);

   const [tab, setTab] = useState("tickets"); // tickets | categories
   const [q, setQ] = useState("");

   const [categories, setCategories] = useState([]);
   const [catLoading, setCatLoading] = useState(false);
   const [catErr, setCatErr] = useState("");

   // ✅ NEW: question count per ticket (ca să avem TOTAL corect, inclusiv neîncepute)
   const [ticketQuestionCount, setTicketQuestionCount] = useState({});

   const links = useMemo(
      () => [
         { link: "/professor", text: "Acasă", icon: homeIcon },
         { link: "/professor/students", text: "Studenți", icon: studentsIcon },
         { link: "/professor/groups", text: "Grupe", icon: groupsIcon },
         { popup: "profile", text: "Profil", icon: accIcon },
      ],
      [],
   );

   useEffect(() => {
      if (!user?.id) return;
      dispatch(fetchStudents());
   }, [dispatch, user]);

   // load all data
   useEffect(() => {
      let cancelled = false;

      (async () => {
         setLoading(true);
         setErr("");
         setAllowed(false);

         try {
            if (!user?.id) throw new Error("Nu ești autentificat.");
            if (user?.role !== "PROFESSOR") throw new Error("Acces interzis.");

            const sid = Number(studentId);
            if (!Number.isInteger(sid) || sid <= 0) {
               throw new Error("studentId invalid.");
            }

            const myStudentsRes = await getMyGroupStudents();
            const myList = Array.isArray(myStudentsRes?.students)
               ? myStudentsRes.students
               : [];
            const mySet = new Set(myList.map((s) => String(s?.id)));

            const ok = mySet.has(String(studentId));
            if (!ok) {
               setAllowed(false);
               throw new Error("Studentul nu este în grupa ta.");
            }

            const stFromGroup = myList.find(
               (s) => String(s?.id) === String(studentId),
            );

            const progRes = await getStudentPracticeProgress({
               studentId: sid,
               page: 1,
               limit: 200,
            });
            const stats = progRes?.statistics || null;
            const hist = Array.isArray(progRes?.practiceHistory)
               ? progRes.practiceHistory
               : [];

            let ov = {
               totalPractices: stats?.totalPractices ?? 0,
               completedPractices: stats?.completedPractices ?? 0,
               averageScore:
                  typeof stats?.averageScore === "number"
                     ? stats.averageScore
                     : null,
            };

            try {
               const ovRes = await getMyGroupOverview();
               const ovList = Array.isArray(ovRes?.overview)
                  ? ovRes.overview
                  : [];
               const row = ovList.find(
                  (r) => String(r?.student?.id) === String(studentId),
               );
               if (row) {
                  ov = {
                     totalPractices:
                        row?.totalPractices ?? ov.totalPractices ?? 0,
                     completedPractices:
                        row?.completedPractices ?? ov.completedPractices ?? 0,
                     averageScore: row?.averageScore ?? ov.averageScore ?? null,
                  };
               }
            } catch (_) {}

            setCatLoading(true);
            setCatErr("");
            let cats = [];
            try {
               const catsRes = await getQuestionCategoriesWithCount();
               cats = Array.isArray(catsRes)
                  ? catsRes
                  : normalizePagedResponse(catsRes);
            } catch (_) {
               try {
                  const raw = await getQuestionCategories(1, 2000);
                  cats = normalizePagedResponse(raw);
               } catch (e2) {
                  cats = [];
                  setCatErr("Nu am putut încărca categoriile.");
               }
            } finally {
               setCatLoading(false);
            }

            if (cancelled) return;

            setAllowed(true);
            setStudentFromGroup(stFromGroup || null);
            setOverview(ov);
            setStatistics(stats);
            setPracticeHistory(hist);
            setCategories(cats);
         } catch (e) {
            if (cancelled) return;
            setErr(String(e?.message || e));
         } finally {
            if (cancelled) return;
            setLoading(false);
         }
      })();

      return () => {
         cancelled = true;
      };
   }, [user, studentId]);

   // ✅ NEW: fetch question counts for ALL tickets (P1..Pn)
   useEffect(() => {
      if (!allowed) return;

      let alive = true;
      (async () => {
         try {
            const entries = await Promise.all(
               TICKET_IDS.map(async (tid) => {
                  try {
                     const q = await getTicketQuestions(tid);
                     const count = Array.isArray(q)
                        ? q.length
                        : Array.isArray(q?.questions)
                          ? q.questions.length
                          : 0;
                     return [tid, count];
                  } catch {
                     return [tid, 0];
                  }
               }),
            );
            if (!alive) return;

            const map = {};
            for (const [tid, cnt] of entries) map[tid] = cnt;
            setTicketQuestionCount(map);
         } catch {
            // silent (nu schimbăm UI)
         }
      })();

      return () => {
         alive = false;
      };
   }, [allowed, studentId]);

   // top bar pct (din statusBreakdown)
   const barPct = useMemo(() => {
      const sb = statistics?.statusBreakdown || null;
      if (!sb) return { ok: 0, bad: 0, skip: 100 };

      const okCount = Number(sb.PASSED || 0) + Number(sb.COMPLETED || 0);
      const badCount = Number(sb.FAILED || 0);
      const skipCount =
         Number(sb.IN_PROGRESS || 0) + Number(sb.NOT_STARTED || 0);
      const total = okCount + badCount + skipCount;

      if (total <= 0) return { ok: 0, bad: 0, skip: 100 };

      return {
         ok: (okCount / total) * 100,
         bad: (badCount / total) * 100,
         skip: (skipCount / total) * 100,
      };
   }, [statistics]);

   const ticketAgg = useMemo(
      () => buildTicketAgg(practiceHistory),
      [practiceHistory],
   );
   const categoryAgg = useMemo(
      () => buildCategoryAgg(practiceHistory),
      [practiceHistory],
   );

   const DISPLAY_BASE = START_ID - 1;

   const ticketVm = useMemo(() => {
      return TICKET_IDS.map((id) => {
         const nr = id - DISPLAY_BASE;
         const agg = ticketAgg[String(nr)] || null;

         const state = agg?.state || "none";
         const label = agg?.label || "Neînceput";

         const extra =
            agg &&
            Number.isFinite(Number(agg.correct)) &&
            Number.isFinite(Number(agg.total)) &&
            Number(agg.total) > 0
               ? ` • ${Math.min(
                    Number(agg.correct),
                    Number(agg.total),
                 )}/${Number(agg.total)}`
               : "";

         return {
            id,
            nr,
            state,
            label: label + extra,
         };
      });
   }, [ticketAgg, DISPLAY_BASE]);

   const allCategoryRows = useMemo(() => {
      return (categories || [])
         .map((c) => ({
            id: c?.id ?? c?.categoryId ?? null,
            name: catTitleRo(c),
            count: getCatCount(c),
            raw: c,
         }))
         .filter((c) => c.id != null);
   }, [categories]);

   const visibleTickets = useMemo(() => {
      const qq = q.trim().toLowerCase();
      if (!qq) return ticketVm;
      return ticketVm.filter(
         (t) => String(t.nr).includes(qq) || String(t.id).includes(qq),
      );
   }, [ticketVm, q]);

   const visibleCategories = useMemo(() => {
      const qq = q.trim().toLowerCase();
      if (!qq) return allCategoryRows;
      return allCategoryRows.filter((c) =>
         `${c.name} ${c.id}`.toLowerCase().includes(qq),
      );
   }, [allCategoryRows, q]);

   const ticketsPassed = useMemo(
      () => ticketVm.filter((t) => t.state === "ok").length,
      [ticketVm],
   );
   const ticketsFailed = useMemo(
      () => ticketVm.filter((t) => t.state === "bad").length,
      [ticketVm],
   );

   const catStatById = useMemo(() => {
      const out = {};
      for (const c of allCategoryRows) {
         const agg = categoryAgg[String(c.id)] || null;

         const state = agg?.state || "none";
         const st = agg?.st || STATUS.NOT_STARTED;

         const totalDisp =
            Number.isFinite(Number(agg?.total)) && Number(agg.total) >= 0
               ? Number(agg.total)
               : Number(c.count) || 0;

         const correctDisp =
            Number.isFinite(Number(agg?.correct)) && Number(agg.correct) >= 0
               ? Number(agg.correct)
               : null;

         out[String(c.id)] = {
            state,
            st,
            total: totalDisp,
            correct: correctDisp,
         };
      }
      return out;
   }, [allCategoryRows, categoryAgg]);

   const catsPassed = useMemo(() => {
      return allCategoryRows.filter(
         (c) => catStatById[String(c.id)]?.state === "ok",
      ).length;
   }, [allCategoryRows, catStatById]);

   const headerTitle = useMemo(() => {
      const name =
         student &&
         `${student.firstName || ""} ${student.lastName || ""}`.trim();
      return name || `Student #${studentId}`;
   }, [student, studentId]);

   const summaryLine = useMemo(() => {
      const totalTickets = ticketVm.length;
      const totalCats = allCategoryRows.length;

      return `Bilete: ${ticketsPassed}/${totalTickets} trecute • Categorii: ${catsPassed}/${totalCats} trecute${
         ticketsFailed ? ` • Picat bilete: ${ticketsFailed}` : ""
      }`;
   }, [
      ticketVm.length,
      allCategoryRows.length,
      ticketsPassed,
      catsPassed,
      ticketsFailed,
   ]);

   // ✅ NEW: exact ca PracticeStatistics (dar pentru STUDENT + toate biletele)
   const lastFinishedByNr = useMemo(() => {
      const map = new Map(); // nr -> item
      const list = Array.isArray(practiceHistory) ? practiceHistory : [];
      for (const it of list) {
         const nr = parseTicketNr(it?.ticketName);
         if (!nr) continue;

         const st = normalizeStatus(it?.status);
         if (st === STATUS.IN_PROGRESS) continue;

         const score = safeInt(it?.score);
         if (score == null) continue;

         const curTs = tsOf(it);
         const prev = map.get(nr);
         if (!prev || curTs > prev.__ts) {
            map.set(nr, { ...it, __ts: curTs });
         }
      }
      return map;
   }, [practiceHistory]);

   const studentTicketTotals = useMemo(() => {
      let totalQuestions = 0;
      let correct = 0;
      let wrong = 0;
      let unanswered = 0;

      for (const tid of TICKET_IDS) {
         const nr = tid - DISPLAY_BASE;

         const last = lastFinishedByNr.get(nr) || null;

         const totalQ =
            Number(ticketQuestionCount?.[tid] || 0) ||
            Number(last?.totalQuestions || 0) ||
            0;

         totalQuestions += totalQ;

         if (last && Number.isFinite(Number(last.score))) {
            const c = Math.max(0, Math.min(totalQ, Number(last.score)));
            correct += c;
            wrong += Math.max(0, totalQ - c);
         } else {
            unanswered += totalQ;
         }
      }

      return { totalQuestions, correct, wrong, unanswered };
   }, [ticketQuestionCount, lastFinishedByNr, DISPLAY_BASE]);

   return (
      <>
         <Header links={links}>
            <Popup />
         </Header>

         <main className="main">
            <section className="professor">
               <div className="practice">
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
                     <div style={{ display: "flex", gap: 10, zIndex: 100 }}>
                        <button
                           type="button"
                           className="practice__back bottom"
                           onClick={() => navigate(-1)}
                        >
                           Înapoi
                        </button>
                        <h2 style={{ margin: 0 }}>{headerTitle}</h2>
                     </div>
                  </div>

                  <div
                     style={{
                        display: "grid",
                        gridTemplateColumns: "1fr",
                        padding: 14,
                        borderRadius: 22,
                        background: "var(--black-p)",
                     }}
                  >
                     {/* păstrăm restul UI-ului exact cum era */}
                     <div className="practice-stats__col">
                        <div className="practice-stats__item">
                           <p>Total întrebări</p>
                           <span>{studentTicketTotals.totalQuestions}</span>
                        </div>
                        <div className="practice-stats__item">
                           <p>Răspunsuri corecte</p>
                           <span>{studentTicketTotals.correct}</span>
                        </div>
                        <div className="practice-stats__item">
                           <p>Răspunsuri greșite</p>
                           <span>{studentTicketTotals.wrong}</span>
                        </div>
                        <div className="practice-stats__item">
                           <p>Întrebări necompletate</p>
                           <span>{studentTicketTotals.unanswered}</span>
                        </div>
                     </div>
                     <div>
                        <div
                           style={{
                              padding: "0 8px",
                              color: "var(--white-t)",
                           }}
                        >
                           {summaryLine}
                           {overview &&
                              (Number.isFinite(overview?.averageScore) ? (
                                 <span style={{ opacity: 0.8 }}> </span>
                              ) : null)}
                        </div>
                        <div style={{ marginTop: 8 }}>
                           <SegmentedBar
                              pctCorrect={barPct.ok}
                              pctWrong={barPct.bad}
                              pctUnanswered={barPct.skip}
                              basePx={22}
                           />
                        </div>
                     </div>
                  </div>

                  {loading && (
                     <div style={{ padding: "10px 14px" }}>
                        Se încarcă statistica...
                     </div>
                  )}

                  {!loading && (err || catErr) && (
                     <div style={{ padding: "10px 14px", color: "red" }}>
                        {err || catErr}
                     </div>
                  )}

                  {!loading && !err && !allowed && (
                     <div style={{ padding: "10px 14px", color: "red" }}>
                        Acces interzis.
                     </div>
                  )}
               </div>

               <div className="practice practice-scroll">
                  <div
                     style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        zIndex: 100,
                        flexWrap: "wrap",
                     }}
                  >
                     <div
                        className="practice__tabs"
                        style={{ display: "flex", gap: 8 }}
                     >
                        <button
                           type="button"
                           className={
                              "practice__back bottom toggle" +
                              (tab === "tickets" ? " yellow" : "")
                           }
                           onClick={() => setTab("tickets")}
                        >
                           Bilete
                        </button>

                        <button
                           type="button"
                           className={
                              "practice__back bottom toggle" +
                              (tab === "categories" ? " yellow" : "")
                           }
                           onClick={() => setTab("categories")}
                        >
                           Categorii
                        </button>
                     </div>
                  </div>{" "}
                  {!loading && !err && allowed && (
                     <>
                        {tab === "tickets" ? (
                           <div className="students__grid-wrapper">
                              <div className="students__grid">
                                 {visibleTickets.map((t) => {
                                    const cls =
                                       "practice__ticket" +
                                       (t.state === "ok"
                                          ? " practice__ticket--ok"
                                          : t.state === "bad"
                                            ? " practice__ticket--bad"
                                            : "");

                                    return (
                                       <button
                                          key={t.id}
                                          type="button"
                                          className={cls}
                                          onClick={(e) => e.preventDefault()}
                                          style={{ cursor: "default" }}
                                          title={`ID: ${t.id} • ${t.label}`}
                                          aria-disabled="true"
                                       >
                                          <div className="practice__ticket-title">
                                             Bilet {t.nr}
                                          </div>
                                       </button>
                                    );
                                 })}
                              </div>
                           </div>
                        ) : (
                           <div className="students__grid-wrapper">
                              <div className="students__grid students__grid-category">
                                 {catLoading ? (
                                    <div className="practice__cat-empty">
                                       Se încarcă categoriile…
                                    </div>
                                 ) : visibleCategories.length === 0 ? (
                                    <div className="practice__cat-empty">
                                       Nu există categorii.
                                    </div>
                                 ) : (
                                    visibleCategories.map((c) => {
                                       const stat = catStatById[
                                          String(c.id)
                                       ] || {
                                          state: "none",
                                          total: Number(c.count) || 0,
                                          correct: null,
                                          st: STATUS.NOT_STARTED,
                                       };

                                       const badgeClass =
                                          "practice__cat-badge" +
                                          (stat.state === "ok"
                                             ? " practice__cat-badge--ok"
                                             : "") +
                                          (stat.state === "bad"
                                             ? " practice__cat-badge--bad"
                                             : "") +
                                          (stat.state === "none"
                                             ? " practice__cat-badge--none"
                                             : "");

                                       const totalDisp =
                                          Number(stat.total ?? c.count ?? 0) ||
                                          0;
                                       const correctDisp =
                                          Number.isFinite(
                                             Number(stat.correct),
                                          ) && Number(stat.correct) >= 0
                                             ? Number(stat.correct)
                                             : null;

                                       const badgeText =
                                          correctDisp != null && totalDisp > 0
                                             ? `${Math.min(
                                                  correctDisp,
                                                  totalDisp,
                                               )}/${totalDisp}`
                                             : statusLabelRo(stat.st);

                                       return (
                                          <button
                                             key={c.id}
                                             type="button"
                                             className="practice__cat-item"
                                             onClick={(e) => e.preventDefault()}
                                             style={{ cursor: "default" }}
                                             aria-disabled="true"
                                             title={`${c.name} • ID: ${c.id}`}
                                          >
                                             <div className="practice__cat-left">
                                                <div className="practice__cat-title">
                                                   {c.name}
                                                </div>
                                                <div className="practice__cat-sub">
                                                   ID: {c.id}
                                                </div>
                                             </div>

                                             <div className={badgeClass}>
                                                {badgeText}
                                             </div>
                                          </button>
                                       );
                                    })
                                 )}
                              </div>
                           </div>
                        )}
                     </>
                  )}
               </div>
            </section>

            <Footer />
         </main>
      </>
   );
}
