// src/pages/PPStudentStatistics.jsx
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";

import Header from "../../components/Header/Header";
import Popup from "../../components/Utils/Popup";
import Footer from "../../components/Footer";

import { ReactSVG } from "react-svg";
import closeIcon from "../../assets/svg/material-symbols--close-rounded.svg";
import checkIcon from "../../assets/svg/material-symbols--check-rounded.svg";

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

import { getTicketQuestions } from "../../api/examService";
import { fetchStudents, updateStudent } from "../../store/studentsSlice";

// icoane
import accIcon from "../../assets/svg/acc.svg";
import homeIcon from "../../assets/svg/material-symbols--home-outline.svg";
import groupsIcon from "../../assets/svg/material-symbols--group-outline.svg";
import studentsIcon from "../../assets/svg//graduate.svg";

/* ================== small helpers (absences) ================== */

const clampInt = (n, min = 0) => {
   const x = Number(n);
   if (!Number.isFinite(x)) return min;
   return Math.max(min, Math.trunc(x));
};

const parseAbsences = (v) => {
   const s = String(v ?? "").trim();
   if (!s) return 0;
   const only = s.replace(/[^\d]/g, "");
   return clampInt(only === "" ? 0 : parseInt(only, 10), 0);
};

// ✅ extras helpers
const normExtras = (src) => ({
   medical_documents: Boolean(src?.medical_documents),
   individual_work: Boolean(src?.individual_work),
   number_of_absences: clampInt(src?.number_of_absences ?? 0, 0),
});

const extrasEqual = (a, b) =>
   Boolean(a?.medical_documents) === Boolean(b?.medical_documents) &&
   Boolean(a?.individual_work) === Boolean(b?.individual_work) &&
   clampInt(a?.number_of_absences ?? 0, 0) ===
      clampInt(b?.number_of_absences ?? 0, 0);

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

/* ================== UI helpers ================== */
function SegmentedBar({ pctCorrect, pctWrong, pctUnanswered, basePx = 22 }) {
   const ok = Math.max(0, Math.min(1, (pctCorrect ?? 0) / 100));
   const bad = Math.max(0, Math.min(1, (pctWrong ?? 0) / 100));
   const skip = Math.max(0, Math.min(1, (pctUnanswered ?? 0) / 100));

   return (
      <div className="practice-stats__bar pp-stats__segbar" role="img">
         <div
            className="practice-stats__bar-inner pp-stats__segbar-inner"
            style={{
               "--base": `${basePx}px`,
               "--basesum": `calc(3 * ${basePx}px)`,
               "--ok": ok,
               "--bad": bad,
               "--skip": skip,
            }}
         >
            <div className="practice-stats__bar-seg practice-stats__bar-seg--ok" />
            <div className="practice-stats__bar-seg practice-stats__bar-seg--bad" />
            <div className="practice-stats__bar-seg practice-stats__bar-seg--skip" />
         </div>
      </div>
   );
}

/* ================== categories helpers ================== */
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

   const [ticketQuestionCount, setTicketQuestionCount] = useState({});

   // extras
   const [extrasSaving, setExtrasSaving] = useState(false);
   const [extrasError, setExtrasError] = useState("");
   const [extrasBase, setExtrasBase] = useState(() => normExtras(null));
   const [extrasForm, setExtrasForm] = useState(() => normExtras(null));

   const extrasDirty = useMemo(
      () => !extrasEqual(extrasForm, extrasBase),
      [extrasForm, extrasBase],
   );
   // ---- absences input (string UI) ----
   const [absText, setAbsText] = useState("0");
   const absFocusedRef = useRef(false);

   // ținem textul sincronizat când se schimbă studentul / vine serverul
   useEffect(() => {
      if (absFocusedRef.current) return;
      const n = clampInt(extrasForm.number_of_absences ?? 0, 0);
      setAbsText(String(n)); // aici poți pune n===0 ? "" : String(n) dacă vrei gol și când nu e focus
   }, [student?.id, extrasForm.number_of_absences]);

   const onAbsFocus = (e) => {
      absFocusedRef.current = true;

      const el = e.currentTarget; // ✅ capture BEFORE async
      const n = clampInt(extrasForm.number_of_absences ?? 0, 0);

      setAbsText(n === 0 ? "" : String(n)); // dacă e 0, golește

      requestAnimationFrame(() => {
         if (!el) return;
         if (typeof el.select === "function") el.select();
      });
   };

   const onAbsChange = (e) => {
      // doar cifre + fără leading zero
      const digits = String(e.target.value ?? "").replace(/[^\d]/g, "");
      const cleaned = digits.replace(/^0+(?=\d)/, ""); // "019" -> "19"
      setAbsText(cleaned);

      const n = cleaned === "" ? 0 : clampInt(parseInt(cleaned, 10), 0);
      setExtrasForm((p) => ({ ...p, number_of_absences: n }));
   };

   const commitAbsences = (n) => {
      const next = { ...extrasForm, number_of_absences: clampInt(n ?? 0, 0) };
      if (extrasEqual(next, extrasBase)) return; // nu trimite dacă nu e dirty
      requestSaveExtras(next); // ✅ PATCH
   };

   const onAbsBlur = () => {
      absFocusedRef.current = false;

      const digits = String(absText ?? "").replace(/[^\d]/g, "");
      const cleaned = digits.replace(/^0+(?=\d)/, "");
      const n = cleaned === "" ? 0 : clampInt(parseInt(cleaned, 10), 0);

      setAbsText(String(n));
      setExtrasForm((p) => ({ ...p, number_of_absences: n }));
      commitAbsences(n);
   };

   const onAbsKeyDown = (e) => {
      if (e.key === "Enter") {
         e.preventDefault();
         e.currentTarget.blur(); // -> onBlur -> PATCH
      }
   };

   // ✅ autosave queue (evităm concurență și spam)
   const saveSeqRef = useRef(Promise.resolve());
   const desiredRef = useRef(normExtras(null));
   const lastSentRef = useRef(""); // JSON last sent successfully

   useEffect(() => {
      // reset queue când schimbăm studentul
      saveSeqRef.current = Promise.resolve();
      desiredRef.current = normExtras(student);
      lastSentRef.current = "";
   }, [student?.id]);

   const requestSaveExtras = (nextForm) => {
      if (!student?.id) return;

      const desired = normExtras(nextForm);
      desiredRef.current = desired;

      setExtrasSaving(true);
      setExtrasError("");

      saveSeqRef.current = saveSeqRef.current
         .then(async () => {
            const cur = desiredRef.current;
            const curJson = JSON.stringify(cur);

            // dacă deja am trimis exact asta, nu mai trimitem
            if (curJson === lastSentRef.current) return;

            const updated = await dispatch(
               updateStudent({ id: student.id, data: cur }),
            ).unwrap();

            // considerăm "success" doar după răspuns
            lastSentRef.current = curJson;

            // mismatch detection (dacă backend ignoră)
            const mismatches = [];
            if (
               typeof updated?.medical_documents === "boolean" &&
               updated.medical_documents !== cur.medical_documents
            ) {
               mismatches.push("medical_documents");
            }
            if (
               typeof updated?.individual_work === "boolean" &&
               updated.individual_work !== cur.individual_work
            ) {
               mismatches.push("individual_work");
            }
            if (
               updated?.number_of_absences != null &&
               Number(updated.number_of_absences) !== cur.number_of_absences
            ) {
               mismatches.push("number_of_absences");
            }

            const serverState = normExtras(updated ?? cur);

            if (mismatches.length) {
               setExtrasError(
                  `Backend a ignorat: ${mismatches.join(
                     ", ",
                  )}. Payload-ul e corect, dar serverul nu aplică aceste câmpuri.`,
               );
               // aliniem UI la ce a salvat serverul (ca să nu pară că “s-a salvat” dar nu e)
               setExtrasBase(serverState);
               setExtrasForm(serverState);
            } else {
               // update base
               setExtrasBase(serverState);

               // nu suprascriem dacă user a schimbat iar între timp
               const desiredNowJson = JSON.stringify(desiredRef.current);
               if (desiredNowJson === curJson) {
                  setExtrasForm(serverState);
               }
            }

            // update local (pt. cazul când student e din group)
            setStudentFromGroup((prev) => {
               if (!prev) return prev;
               if (String(prev?.id) !== String(student?.id)) return prev;
               return { ...prev, ...(updated || cur) };
            });
         })
         .catch((e) => {
            console.error("Autosave extras failed:", e);
            setExtrasError("Salvarea a eșuat. Vezi consola / Network.");
         })
         .finally(() => {
            const desiredNowJson = JSON.stringify(desiredRef.current);
            if (desiredNowJson === lastSentRef.current) setExtrasSaving(false);
         });
   };

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

   useEffect(() => {
      const base = normExtras(student);
      setExtrasBase(base);
      setExtrasForm(base);
      setExtrasSaving(false);
      setExtrasError("");
   }, [
      student?.id,
      student?.medical_documents,
      student?.individual_work,
      student?.number_of_absences,
   ]);

   const handleExtrasChange = (e) => {
      const { name, type, value, checked } = e.target;
      setExtrasError("");

      if (type === "checkbox") {
         // checkbox-ul (dacă îl mai folosești vreodată) -> autosave imediat
         setExtrasForm((p) => {
            const next = { ...p, [name]: checked };
            requestSaveExtras(next);
            return next;
         });
         return;
      }

      if (name === "number_of_absences") {
         // la tastare NU salvăm; salvăm la blur/Enter
         setExtrasForm((p) => ({
            ...p,
            number_of_absences: parseAbsences(value),
         }));
         return;
      }

      setExtrasForm((p) => ({ ...p, [name]: value }));
   };

   // ✅ toggle = PATCH la fiecare click
   const toggleField = (key) => {
      setExtrasError("");
      setExtrasForm((p) => {
         const next = { ...p, [key]: !Boolean(p[key]) };
         requestSaveExtras(next);
         return next;
      });
   };

   // ✅ stepper buttons = PATCH la fiecare click
   const decAbs = () => {
      setExtrasError("");
      setExtrasForm((p) => {
         const next = {
            ...p,
            number_of_absences: clampInt((p.number_of_absences ?? 0) - 1, 0),
         };
         requestSaveExtras(next);
         return next;
      });
   };

   const incAbs = () => {
      setExtrasError("");
      setExtrasForm((p) => {
         const next = {
            ...p,
            number_of_absences: clampInt((p.number_of_absences ?? 0) + 1, 0),
         };
         requestSaveExtras(next);
         return next;
      });
   };

   // ✅ input blur = PATCH
   const commitAbsencesIfDirty = () => {
      if (!student?.id) return;
      if (!extrasDirty) return;
      requestSaveExtras(extrasForm);
   };

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
            if (!Number.isInteger(sid) || sid <= 0)
               throw new Error("studentId invalid.");

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
               } catch {
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

   // ticket question counts
   useEffect(() => {
      if (!allowed) return;

      let alive = true;
      (async () => {
         try {
            const entries = await Promise.all(
               TICKET_IDS.map(async (tid) => {
                  try {
                     const qRes = await getTicketQuestions(tid);
                     const count = Array.isArray(qRes)
                        ? qRes.length
                        : Array.isArray(qRes?.questions)
                          ? qRes.questions.length
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
            // silent
         }
      })();

      return () => {
         alive = false;
      };
   }, [allowed, studentId]);

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
               ? ` • ${Math.min(Number(agg.correct), Number(agg.total))}/${Number(
                    agg.total,
                 )}`
               : "";

         return { id, nr, state, label: label + extra };
      });
   }, [ticketAgg, DISPLAY_BASE]);

   const allCategoryRows = useMemo(() => {
      return (categories || [])
         .map((c) => ({
            id: c?.id ?? c?.categoryId ?? null,
            name: catTitleRo(c),
            count: getCatCount(c),
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

   const lastFinishedByNr = useMemo(() => {
      const map = new Map();
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
         if (!prev || curTs > prev.__ts) map.set(nr, { ...it, __ts: curTs });
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

   const mdBtnClass =
      "pp-stats__toggle" +
      (extrasForm.medical_documents ? " is-on" : " is-off") +
      (extrasSaving ? " is-disabled" : "");

   const iwBtnClass =
      "pp-stats__toggle" +
      (extrasForm.individual_work ? " is-on" : " is-off") +
      (extrasSaving ? " is-disabled" : "");

   return (
      <>
        
         <main className="main">
            <section className="professor">
               <div className="practice">
                  <div className="practice__header tikets-header pp-stats__topbar">
                     <div className="pp-stats__topbar-left">
                        <button
                           type="button"
                           className="practice__back bottom"
                           onClick={() => navigate(-1)}
                        >
                           Înapoi
                        </button>
                        <h2 className="pp-stats__title">{headerTitle}</h2>
                     </div>
                  </div>

                  <div className="pp-stats__summary-card">
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

                     <div className="pp-stats__summary-right">
                        <div className="pp-stats__summary-line">
                           {summaryLine}
                        </div>
                        <div className="pp-stats__bar-wrap">
                           <SegmentedBar
                              pctCorrect={barPct.ok}
                              pctWrong={barPct.bad}
                              pctUnanswered={barPct.skip}
                              basePx={22}
                           />
                        </div>
                     </div>
                  </div>

                  {!loading && !err && allowed && student?.id && (
                     <div className="pp-stats__admin-card">
                        <div className="pp-stats__admin-head">
                           <div className="pp-stats__admin-head-left">
                              <div className="pp-stats__admin-title">
                                 Date administrative
                              </div>
                           </div>

                           <div className="pp-stats__admin-actions">
                              {extrasSaving && (
                                 <span className="pp-stats__saving">
                                    Salvez...
                                 </span>
                              )}

                              {/* (opțional) indicator vizual când e “curat” */}
                              {!extrasSaving && !extrasDirty && (
                                 <span className="pp-stats__saved">Salvat</span>
                              )}
                              {extrasDirty && !extrasSaving && (
                                 <span className="pp-stats__dirty">
                                    Modificări nesalvate
                                 </span>
                              )}
                           </div>
                        </div>

                        <div className="pp-stats__admin-controls">
                           <button
                              type="button"
                              onClick={() => toggleField("medical_documents")}
                              disabled={extrasSaving}
                              aria-pressed={Boolean(
                                 extrasForm.medical_documents,
                              )}
                              className={mdBtnClass}
                           >
                              <ReactSVG
                                 src={
                                    extrasForm.medical_documents
                                       ? checkIcon
                                       : closeIcon
                                 }
                                 className="pp-stats__toggle-icon"
                              />
                              <span className="pp-stats__toggle-text">
                                 Doc. medicale
                              </span>
                           </button>

                           <button
                              type="button"
                              onClick={() => toggleField("individual_work")}
                              disabled={extrasSaving}
                              aria-pressed={Boolean(extrasForm.individual_work)}
                              className={iwBtnClass}
                           >
                              <ReactSVG
                                 src={
                                    extrasForm.individual_work
                                       ? checkIcon
                                       : closeIcon
                                 }
                                 className="pp-stats__toggle-icon"
                              />
                              <span className="pp-stats__toggle-text">
                                 Individual
                              </span>
                           </button>

                           <div
                              className={
                                 "pp-stats__stepper" +
                                 (extrasSaving ? " is-disabled" : "")
                              }
                           >
                              <span className="pp-stats__stepper-label">
                                 Absențe
                              </span>

                              <input
                                 type="text"
                                 name="number_of_absences"
                                 inputMode="numeric"
                                 pattern="[0-9]*"
                                 value={absText}
                                 disabled={extrasSaving}
                                 onFocus={onAbsFocus}
                                 onChange={onAbsChange}
                                 onBlur={onAbsBlur}
                                 onKeyDown={onAbsKeyDown}
                                 className="pp-stats__stepper-input"
                              />
                           </div>
                        </div>

                        {extrasError && (
                           <div className="pp-stats__error">{extrasError}</div>
                        )}
                     </div>
                  )}

                  {loading && (
                     <div className="pp-stats__info">
                        Se încarcă statistica...
                     </div>
                  )}

                  {!loading && (err || catErr) && (
                     <div className="pp-stats__error">{err || catErr}</div>
                  )}

                  {!loading && !err && !allowed && (
                     <div className="pp-stats__error">Acces interzis.</div>
                  )}
               </div>

               <div className="practice practice-scroll">
                  <div className="pp-stats__tabs-row">
                     <div className="practice__tabs pp-stats__tabs">
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
                  </div>

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
                                             ? `${Math.min(correctDisp, totalDisp)}/${totalDisp}`
                                             : statusLabelRo(stat.st);

                                       return (
                                          <button
                                             key={c.id}
                                             type="button"
                                             className="practice__cat-item"
                                             onClick={(e) => e.preventDefault()}
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
