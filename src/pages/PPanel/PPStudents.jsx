// src/pages/PPStudents.jsx
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { ReactSVG } from "react-svg";
import { useNavigate } from "react-router-dom";

import Header from "../../components/Header/Header";
import Popup from "../../components/Utils/Popup";
import Footer from "../../components/Footer";

import { UserContext } from "../../UserContext";
import { fetchStudents } from "../../store/studentsSlice";

import {
   getMyGroupStudents,
   getMyGroupOverview,
   getStudentPracticeProgress,
} from "../../api/groupsService";

import {
   getQuestionCategoriesWithCount,
   getQuestionCategories,
} from "../../api/questionCategoriesService";

import accIcon from "../../assets/svg/acc.svg";
import homeIcon from "../../assets/svg/material-symbols--home-outline.svg";
import addIcon from "../../assets/svg/add-s.svg";
import searchIcon from "../../assets/svg/search.svg";
import groupsIcon from "../../assets/svg/material-symbols--group-outline.svg";
import studentsIcon from "../../assets/svg/graduate.svg";

/* ================== ENV tickets ================== */
const readEnv = (viteKey, craKey) =>
   (typeof import.meta !== "undefined" &&
      import.meta?.env &&
      import.meta.env[viteKey]) ||
   (typeof process !== "undefined" && process?.env && process.env[craKey]) ||
   "";

const COUNT = Number(
   readEnv("VITE_TICKETS_COUNT", "REACT_APP_TICKETS_COUNT") || 269 - 246 + 1,
);
const TICKET_TOTAL = Math.max(0, COUNT);

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

/* ================== parse helpers ================== */
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

function computeUniqueAttemptsFromHistory(practiceHistory) {
   const list = Array.isArray(practiceHistory) ? practiceHistory : [];
   const tickets = new Set();
   const cats = new Set();

   for (const it of list) {
      const st = normalizeStatus(it?.status);

      // attempted = PASSED/COMPLETED/FAILED/IN_PROGRESS
      if (
         st !== STATUS.PASSED &&
         st !== STATUS.COMPLETED &&
         st !== STATUS.FAILED &&
         st !== STATUS.IN_PROGRESS
      ) {
         continue;
      }

      const nr = parseTicketNr(it?.ticketName);
      if (nr) tickets.add(String(nr));

      const cid = parseCategoryId(it?.ticketName);
      if (cid) cats.add(String(cid));
   }

   return { tickets: tickets.size, categories: cats.size };
}

/* ============ Bară (OK / BAD / SKIP) ============ */
function SegmentedBar({ pctCorrect, pctWrong, pctUnanswered, basePx = 22, t }) {
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
      <div
         className="practice-stats__bar"
         role="img"
         aria-label={`${ariaOk}. ${ariaBad}. ${ariaSkip}.`}
      >
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

/* ================= helpers ================= */
async function runWithConcurrency(items, concurrency, worker) {
   const queue = [...items];
   const runners = new Array(Math.max(1, concurrency)).fill(0).map(async () => {
      while (queue.length) {
         const item = queue.shift();
         // eslint-disable-next-line no-await-in-loop
         await worker(item);
      }
   });
   await Promise.all(runners);
}

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

function extractMyGroups(res) {
   const groups =
      (Array.isArray(res?.groups) && res.groups) ||
      (Array.isArray(res?.data?.groups) && res.data.groups) ||
      (Array.isArray(res) && res) ||
      [];
   return groups.filter((g) => g && g.id != null);
}

function normalizeMyGroupsStudents(res) {
   // { totalGroups, totalStudents, students:[...] }
   const list = (Array.isArray(res?.students) && res.students) || [];
   return list.filter((s) => s && s.id != null);
}

function escapeRegExp(str) {
   return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ================= Groups summary ================= */
function MyGroupsSummary({ groups, status }) {
   if (status === "loading") return null;

   if (!groups?.length) {
      return (
         <div style={{ padding: "10px 14px", opacity: 0.85 }}>
            Nu ai grupe (sau backend-ul nu a întors grupe).
         </div>
      );
   }

   return (
      <div style={{ padding: "10px 14px" }}>
         <div style={{ marginBottom: 8, opacity: 0.9 }}>
            <strong>Grupele primite ({groups.length}):</strong>
         </div>

         <div style={{ display: "grid", gap: 8 }}>
            {groups.map((g) => (
               <div
                  key={g.id}
                  style={{
                     padding: "10px 12px",
                     borderRadius: 12,
                     border: "1px solid rgba(255,255,255,0.08)",
                     background: "rgba(255,255,255,0.03)",
                  }}
               >
                  <div style={{ fontWeight: 700 }}>
                     {g?.name || `Grupa #${g.id}`}
                  </div>
                  <div style={{ marginTop: 4, opacity: 0.9 }}>
                     Token: <strong>{String(g?.token || "—").trim()}</strong> •
                     Studenți: <strong>{Number(g?.studentCount ?? 0)}</strong>
                  </div>
               </div>
            ))}
         </div>
      </div>
   );
}

/* ================= Students list ================= */
function CourseStudentsList({
   students,
   groupNameById,
   progressById,
   attemptsById,
   loadingAll,
   errorAll,
   myGroupStatus,
   categoriesTotal,
}) {
   const [searchOpen, setSearchOpen] = useState(false);
   const [query, setQuery] = useState("");
   const navigate = useNavigate();

   const t = (key, vars = {}) => {
      if (key === "aria_correct") return `OK: ${vars.pct}%`;
      if (key === "aria_wrong") return `Eșuate: ${vars.pct}%`;
      if (key === "aria_unanswered") return `Neîncepute/în lucru: ${vars.pct}%`;
      return key;
   };

   const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      const base = Array.isArray(students) ? students : [];

      if (!q) return base;

      return base.filter((s) => {
         const gName = groupNameById?.[String(s?.groupId)] || "";
         return `${s.firstName || ""} ${s.lastName || ""} ${s.email || ""} ${s.phone || ""} ${gName}`
            .toLowerCase()
            .includes(q);
      });
   }, [students, query, groupNameById]);

   const highlightText = (text, q) => {
      const qq = q.trim();
      if (!qq) return text;
      const rx = new RegExp(`(${escapeRegExp(qq)})`, "gi");
      const parts = String(text || "").split(rx);
      return parts.map((part, idx) =>
         part.toLowerCase() === qq.toLowerCase() ? (
            <i key={idx} className="highlight">
               {part}
            </i>
         ) : (
            part
         ),
      );
   };

   const getBarPct = (studentId) => {
      const stat = progressById?.[studentId] || null;
      const sb = stat?.statusBreakdown || null;

      if (sb) {
         const okCount = Number(sb.PASSED || 0) + Number(sb.COMPLETED || 0);
         const badCount = Number(sb.FAILED || 0);
         const skipCount =
            Number(sb.IN_PROGRESS || 0) + Number(sb.NOT_STARTED || 0);
         const total = okCount + badCount + skipCount;

         if (total > 0) {
            return {
               ok: (okCount / total) * 100,
               bad: (badCount / total) * 100,
               skip: (skipCount / total) * 100,
            };
         }
      }

      return { ok: 0, bad: 0, skip: 100 };
   };

   const showNoneHint =
      myGroupStatus === "none" &&
      !loadingAll &&
      !errorAll &&
      (students?.length ?? 0) === 0;

   return (
      <div className="students">
         <div className={`groups__header ${searchOpen ? "open" : ""}`}>
            <h2>Studenții mei</h2>

            <div className="groups__right">
               <div className="groups__search">
                  <input
                     type="text"
                     placeholder="Caută student..."
                     className="groups__input"
                     value={query}
                     onChange={(e) => setQuery(e.target.value)}
                  />
                  <button
                     type="button"
                     onClick={() => setSearchOpen((v) => !v)}
                  >
                     <ReactSVG
                        className={`groups__icon ${searchOpen ? "rotate45" : ""}`}
                        src={searchOpen ? addIcon : searchIcon}
                     />
                  </button>
               </div>
            </div>
         </div>

         {showNoneHint && (
            <div style={{ padding: "10px 14px", opacity: 0.85 }}>
               Nu ești asignat la nicio grupă sau nu ai studenți în grupe.
            </div>
         )}

         <div className="students__grid-wrapper">
            <div className="students__grid">
               {loadingAll && (
                  <p style={{ gridColumn: "1 / -1" }}>
                     Se încarcă studenții...
                  </p>
               )}

               {!loadingAll && errorAll && (
                  <p style={{ gridColumn: "1 / -1", color: "red" }}>
                     {String(errorAll)}
                  </p>
               )}

               {!loadingAll &&
                  !errorAll &&
                  filtered.map((student) => {
                     const sid = String(student.id);
                     const pct = getBarPct(sid);

                     const att = attemptsById?.[sid] || null;
                     const ticketsTried = Number(att?.tickets || 0);
                     const catsTried = Number(att?.categories || 0);

                     const gName =
                        groupNameById?.[String(student?.groupId)] ||
                        `#${student?.groupId ?? "—"}`;

                     return (
                        <div
                           key={student.id}
                           className="students__item"
                           onClick={() =>
                              navigate(
                                 `/professor/student/${student.id}/statistics`,
                              )
                           }
                        >
                           <div className="students__info">
                              <h3>
                                 {highlightText(
                                    `${student.firstName || ""} ${student.lastName || ""}`.trim() ||
                                       `#${student.id}`,
                                    query,
                                 )}
                              </h3>

                              <p>
                                 {highlightText(student.email || "–", query)}
                              </p>
                              <p>
                                 {highlightText(student.phone || "–", query)}
                              </p>

                              <p style={{ marginTop: 6, opacity: 0.85 }}>
                                 Grupa:{" "}
                                 <strong>{highlightText(gName, query)}</strong>
                              </p>

                              <p style={{ marginTop: 8, opacity: 0.9 }}>
                                 Bilete: <strong>{ticketsTried}</strong>/
                                 <strong>{TICKET_TOTAL}</strong> • Categorii:{" "}
                                 <strong>{catsTried}</strong>/
                                 <strong>{categoriesTotal ?? "—"}</strong>
                              </p>

                              <SegmentedBar
                                 pctCorrect={pct.ok}
                                 pctWrong={pct.bad}
                                 pctUnanswered={pct.skip}
                                 basePx={22}
                                 t={t}
                              />
                           </div>
                        </div>
                     );
                  })}

               {!loadingAll && !errorAll && filtered.length === 0 && (
                  <p className="groups__empty" style={{ gridColumn: "1 / -1" }}>
                     Nu există studenți (sau nu se potrivesc filtrului).
                  </p>
               )}
            </div>
         </div>
      </div>
   );
}

function PPStudents() {
   const { user } = useContext(UserContext);
   const dispatch = useDispatch();

   const studentsState = useSelector((state) => state.students || {});
   const allUsers = Array.isArray(studentsState.list) ? studentsState.list : [];
   const studentsLoading = !!studentsState.loading;
   const studentsError = studentsState.error || null;

   const usersById = useMemo(() => {
      const m = new Map();
      for (const u of allUsers) m.set(String(u?.id), u);
      return m;
   }, [allUsers]);

   const [myGroupStatus, setMyGroupStatus] = useState("idle"); // idle | loading | ok | none | error
   const [myGroups, setMyGroups] = useState([]);
   const [apiStudents, setApiStudents] = useState([]);

   const [progressById, setProgressById] = useState({});
   const [attemptsById, setAttemptsById] = useState({});
   const [categoriesTotal, setCategoriesTotal] = useState(null);

   const progressRef = useRef(progressById);
   useEffect(() => {
      progressRef.current = progressById;
   }, [progressById]);

   const inFlightRef = useRef(new Set());

   const links = useMemo(
      () => [
         { link: "/professor", text: "Acasă", icon: homeIcon },
         { link: "/professor/students", text: "Studenți", icon: studentsIcon },
         { link: "/professor/groups", text: "Grupe", icon: groupsIcon },
         { popup: "profile", text: "Profil", icon: accIcon },
      ],
      [],
   );

   // 1) redux (opțional - îmbogățire doar)
   useEffect(() => {
      if (!user?.id) return;
      dispatch(fetchStudents());
   }, [dispatch, user?.id]);

   // 2) total categorii
   useEffect(() => {
      let alive = true;

      (async () => {
         try {
            let cats = [];
            try {
               const res = await getQuestionCategoriesWithCount();
               cats = Array.isArray(res) ? res : normalizePagedResponse(res);
            } catch {
               cats = [];
            }

            if (!cats.length) {
               const raw = await getQuestionCategories(1, 2000);
               cats = normalizePagedResponse(raw);
            }

            if (!alive) return;
            setCategoriesTotal(cats.length);
         } catch {
            if (!alive) return;
            setCategoriesTotal(null);
         }
      })();

      return () => {
         alive = false;
      };
   }, []);

   // 3) load overview + students (API)
   useEffect(() => {
      let cancelled = false;

      (async () => {
         if (!user?.id) return;

         if (user?.role !== "PROFESSOR") {
            setMyGroupStatus("error");
            return;
         }

         setMyGroupStatus("loading");

         try {
            const [studentsRes, overviewRes] = await Promise.all([
               getMyGroupStudents(),
               getMyGroupOverview(),
            ]);

            if (cancelled) return;

            const groups = extractMyGroups(overviewRes);
            const stList = normalizeMyGroupsStudents(studentsRes);

            setMyGroups(groups);
            setApiStudents(stList);

            // ✅ IMPORTANT: OK dacă ai ORI grupe ORI studenți
            if (groups.length === 0 && stList.length === 0)
               setMyGroupStatus("none");
            else setMyGroupStatus("ok");
         } catch {
            if (cancelled) return;

            setMyGroupStatus("error");
            setMyGroups([]);
            setApiStudents([]);
            setProgressById({});
            setAttemptsById({});
         }
      })();

      return () => {
         cancelled = true;
      };
   }, [user?.id, user?.role]);

   // 4) fetch practice-progress per student (din apiStudents)
   useEffect(() => {
      let cancelled = false;

      (async () => {
         if (myGroupStatus !== "ok") return;
         if (!apiStudents.length) return;

         const idsToFetch = apiStudents
            .map((s) => Number(s?.id))
            .filter((id) => Number.isInteger(id) && id > 0)
            .filter((id) => {
               const key = String(id);
               const already = !!progressRef.current?.[key];
               const inflight = inFlightRef.current.has(key);
               return !already && !inflight;
            });

         if (!idsToFetch.length) return;

         await runWithConcurrency(idsToFetch, 4, async (studentId) => {
            if (cancelled) return;

            const key = String(studentId);
            inFlightRef.current.add(key);

            try {
               const res = await getStudentPracticeProgress({
                  studentId,
                  page: 1,
                  limit: 200,
               });
               if (cancelled) return;

               const stats = res?.statistics || null;
               const hist = Array.isArray(res?.practiceHistory)
                  ? res.practiceHistory
                  : [];

               if (stats)
                  setProgressById((prev) => ({ ...prev, [key]: stats }));

               const att = computeUniqueAttemptsFromHistory(hist);
               setAttemptsById((prev) => ({ ...prev, [key]: att }));
            } catch {
               // silent
            } finally {
               inFlightRef.current.delete(key);
            }
         });
      })();

      return () => {
         cancelled = true;
      };
   }, [myGroupStatus, apiStudents]);

   // groupId -> name
   const groupNameById = useMemo(() => {
      const m = {};
      for (const g of myGroups) m[String(g.id)] = g?.name || `#${g.id}`;
      return m;
   }, [myGroups]);

   // ✅ lista afișată: API students (sigur), îmbogățit cu redux dacă există
   const mergedStudents = useMemo(() => {
      if (myGroupStatus !== "ok" && myGroupStatus !== "none") return [];

      return apiStudents
         .map((s) => {
            const u = usersById.get(String(s?.id));
            return {
               ...s,
               ...(u || {}),
               // păstrează groupId din API (important!)
               groupId: s?.groupId ?? u?.groupId,
            };
         })
         .filter((x) => x && x.id != null);
   }, [apiStudents, usersById, myGroupStatus]);

   const combinedError =
      myGroupStatus === "error"
         ? "Nu am putut încărca studenții/grupele profesorului."
         : studentsError
           ? String(studentsError)
           : null;

   return (
      <>
         <Header links={links}>
            <Popup />
         </Header>

         <main className="main">
            <section className="professor single">
               {/* ✅ arată toate grupele primite */}
               {/*<MyGroupsSummary groups={myGroups} status={myGroupStatus} />*/}

               {/* ✅ arată toți studenții primiti */}
               <CourseStudentsList
                  students={mergedStudents}
                  groupNameById={groupNameById}
                  progressById={progressById}
                  attemptsById={attemptsById}
                  loadingAll={studentsLoading || myGroupStatus === "loading"}
                  errorAll={combinedError}
                  myGroupStatus={myGroupStatus}
                  categoriesTotal={categoriesTotal}
               />
            </section>

            <Footer />
         </main>
      </>
   );
}

export default PPStudents;
