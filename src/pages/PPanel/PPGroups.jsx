// src/pages/PPGropus.jsx
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { ReactSVG } from "react-svg";
import { useNavigate } from "react-router-dom";

import Header from "../../components/Header/Header";
import Popup from "../../components/Utils/Popup";
import Footer from "../../components/Footer";

import { UserContext } from "../../UserContext";

import { fetchStudents } from "../../store/studentsSlice";
import { fetchGroups } from "../../store/groupsSlice";

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
import keyIcon from "../../assets/svg/key.svg";
import groupsIcon from "../../assets/svg/material-symbols--group-outline.svg";
import studentsIcon from "../../assets/svg//graduate.svg";

/* ================== ENV tickets (24 default) ================== */
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
const TICKET_TOTAL = Math.max(0, COUNT);

/* ================== STATUS helpers (ca în PPStudentStatistics) ================== */
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

/* ================== parse helpers (din practiceHistory) ================== */
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

      // ✅ vrem doar attempted (fără NOT_STARTED)
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

/* ================= Groups list (AFIȘĂM DOAR GRUPA MEA) ================= */
function CourseGroupsList({
   groups,
   students,
   myGroupId,
   myGroupName,
   myGroupStatus,
}) {
   const [searchOpen, setSearchOpen] = useState(false);
   const [query, setQuery] = useState("");

   const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      return (groups || []).filter((g) => {
         if (!q) return true;
         return `${g?.name || ""} ${g?.token || ""}`.toLowerCase().includes(q);
      });
   }, [groups, query]);

   const membersCountFor = (groupId) => {
      if (!Array.isArray(students)) return null;
      if (!students.length) return 0;

      const hasGroupId = students.some((s) => s?.groupId != null);
      if (!hasGroupId) return students.length;

      return students.filter((s) => String(s?.groupId) === String(groupId))
         .length;
   };

   const myGroupHint =
      myGroupStatus === "none"
         ? "Nu ești atribuit la nicio grupă încă."
         : myGroupStatus === "error"
         ? "Nu am putut verifica grupa ta acum. Reîncearcă mai târziu."
         : null;

   return (
      <div className="groups ipanel">
         <div className={`groups__header ${searchOpen ? "open" : ""}`}>
            <h2>Grupele mele</h2>
            <div className="groups__right">
               <div className="groups__search">
                  <input
                     type="text"
                     placeholder="Caută în grupa mea..."
                     className="groups__input"
                     value={query}
                     onChange={(e) => setQuery(e.target.value)}
                  />
                  <button
                     type="button"
                     onClick={() => setSearchOpen((v) => !v)}
                  >
                     <ReactSVG
                        className={`groups__icon ${
                           searchOpen ? "rotate45" : ""
                        }`}
                        src={searchOpen ? addIcon : searchIcon}
                     />
                  </button>
               </div>
            </div>
         </div>

         {myGroupHint && (
            <div style={{ padding: "10px 14px", opacity: 0.85 }}>
               {myGroupHint}
            </div>
         )}

         <div className="groups__grid-wrapper">
            <div className="groups__grid">
               {filtered.map((g) => {
                  const isMine =
                     myGroupId != null && String(g?.id) === String(myGroupId);
                  const members = membersCountFor(g?.id);

                  return (
                     <div key={g?.id} className="groups__item">
                        <div className="groups__item-left">
                           <div className="groups__item-left-top">
                              <h3>{g?.name || "—"}</h3>

                              {isMine &&
                              myGroupName &&
                              myGroupName !== g?.name ? (
                                 <div
                                    style={{
                                       fontSize: 12,
                                       opacity: 0.7,
                                       marginTop: 4,
                                    }}
                                 >
                                    (server: {myGroupName})
                                 </div>
                              ) : null}
                           </div>

                           {members != null && <p>{members} pers</p>}

                           {g?.token ? (
                              <span className="groups__item-key">
                                 <ReactSVG src={keyIcon} />
                                 {g.token}
                              </span>
                           ) : null}
                        </div>
                     </div>
                  );
               })}

               {filtered.length === 0 && (
                  <p className="groups__empty" style={{ gridColumn: "1 / -1" }}>
                     {myGroupStatus === "ok" ? "Nu s-a găsit grupa ta." : "—"}
                  </p>
               )}
            </div>
         </div>
      </div>
   );
}

/* ================= Students list (AFIȘĂM DOAR STUDENȚII MEI) ================= */
function CourseStudentsList({
   students,
   myGroupStudentIds,
   overviewById,
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

      let base = Array.isArray(students) ? students : [];
      if (myGroupStatus !== "ok") base = [];

      if (myGroupStudentIds?.size) {
         base = base.filter((s) => myGroupStudentIds.has(String(s?.id)));
      }

      if (!q) return base;

      return base.filter((s) =>
         `${s.firstName} ${s.lastName} ${s.email} ${s.phone || ""}`
            .toLowerCase()
            .includes(q)
      );
   }, [students, query, myGroupStudentIds, myGroupStatus]);

   const highlightText = (text, q) => {
      if (!q) return text;
      const parts = String(text || "").split(new RegExp(`(${q})`, "gi"));
      return parts.map((part, idx) =>
         part.toLowerCase() === q.toLowerCase() ? (
            <i key={idx} className="highlight">
               {part}
            </i>
         ) : (
            part
         )
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

      const ov = overviewById?.[studentId] || null;
      const total = Number(ov?.totalPractices ?? 0);
      const done = Number(ov?.completedPractices ?? 0);
      if (total > 0) {
         const ok = (done / total) * 100;
         return { ok, bad: 0, skip: 100 - ok };
      }

      return { ok: 0, bad: 0, skip: 100 };
   };

   const myGroupHint =
      myGroupStatus === "none"
         ? "Nu ai studenți afișați până nu ești asignat la o grupă."
         : null;

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
                        className={`groups__icon ${
                           searchOpen ? "rotate45" : ""
                        }`}
                        src={searchOpen ? addIcon : searchIcon}
                     />
                  </button>
               </div>
            </div>
         </div>

         {myGroupHint && (
            <div style={{ padding: "10px 14px", opacity: 0.85 }}>
               {myGroupHint}
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

                     return (
                        <div
                           key={student.id}
                           className="students__item"
                           onClick={() =>
                              navigate(
                                 `/professor/student/${student.id}/statistics`
                              )
                           }
                        >
                           <div className="students__info">
                              <h3>
                                 {highlightText(
                                    `${student.firstName} ${student.lastName}`,
                                    query
                                 )}
                              </h3>

                              <p>{highlightText(student.email, query)}</p>
                              <p>
                                 {highlightText(student.phone || "–", query)}
                              </p>

                              {/* ✅ NOU: doar UNIQUE attempted (nu sesiuni) */}
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

               {!loadingAll &&
                  !errorAll &&
                  myGroupStatus === "ok" &&
                  filtered.length === 0 && (
                     <p
                        className="groups__empty"
                        style={{ gridColumn: "1 / -1" }}
                     >
                        Nu ai studenți în grupă (sau nu se potrivesc filtrului).
                     </p>
                  )}
            </div>
         </div>
      </div>
   );
}

function PPGropus() {
   const { user } = useContext(UserContext);
   const dispatch = useDispatch();

   const studentsState = useSelector((state) => state.students || {});
   const groupsState = useSelector((state) => state.groups || {});
   const allUsers = Array.isArray(studentsState.list) ? studentsState.list : [];
   const allGroups = Array.isArray(groupsState.list) ? groupsState.list : [];

   const studentsLoading = !!studentsState.loading;
   const studentsError = studentsState.error || null;

   const usersRoleUSER = useMemo(() => {
      return allUsers.filter((u) => u?.role === "USER");
   }, [allUsers]);

   const [myGroupId, setMyGroupId] = useState(null);
   const [myGroupName, setMyGroupName] = useState("");
   const [myGroupStatus, setMyGroupStatus] = useState("idle"); // idle | loading | ok | none | error

   const [myGroupStudentIds, setMyGroupStudentIds] = useState(new Set());
   const [overviewById, setOverviewById] = useState({});
   const [progressById, setProgressById] = useState({});

   // ✅ NEW: attempted UNIQUE per student (bilete/categorii)
   const [attemptsById, setAttemptsById] = useState({}); // { [studentId]: {tickets, categories} }

   // ✅ NEW: total categorii (denominator)
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
      []
   );

   // 1) încărcăm listele (pentru UI / nume / token / useri)
   useEffect(() => {
      if (!user?.id) return;
      dispatch(fetchStudents());
      dispatch(fetchGroups());
   }, [dispatch, user]);

   // ✅ load categories total (o singură dată)
   useEffect(() => {
      let alive = true;

      (async () => {
         try {
            let cats = [];
            try {
               const res = await getQuestionCategoriesWithCount();
               cats = Array.isArray(res) ? res : normalizePagedResponse(res);
            } catch (_) {
               cats = [];
            }

            if (!cats.length) {
               const raw = await getQuestionCategories(1, 2000);
               cats = normalizePagedResponse(raw);
            }

            if (!alive) return;
            setCategoriesTotal(cats.length);
         } catch (_) {
            if (!alive) return;
            setCategoriesTotal(null);
         }
      })();

      return () => {
         alive = false;
      };
   }, []);

   // 2) verifică "grupa mea" (professor endpoints)
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

            const gid = overviewRes?.groupId ?? studentsRes?.groupId ?? null;
            const gname =
               overviewRes?.groupName ?? studentsRes?.groupName ?? "";

            setMyGroupId(gid);
            setMyGroupName(gname);

            const stList = Array.isArray(studentsRes?.students)
               ? studentsRes.students
               : [];
            setMyGroupStudentIds(new Set(stList.map((s) => String(s.id))));

            const ovList = Array.isArray(overviewRes?.overview)
               ? overviewRes.overview
               : [];
            const ovMap = {};
            for (const row of ovList) {
               const sid =
                  row?.student?.id ?? row?.studentId ?? row?.userId ?? null;
               if (sid == null) continue;
               ovMap[String(sid)] = {
                  totalPractices: row?.totalPractices ?? 0,
                  completedPractices: row?.completedPractices ?? 0,
                  averageScore: row?.averageScore ?? null,
               };
            }
            setOverviewById(ovMap);

            setMyGroupStatus(gid ? "ok" : "none");
         } catch (e) {
            if (cancelled) return;

            const msg = String(e?.message || e);
            const lower = msg.toLowerCase();

            if (lower.includes("not assigned")) {
               setMyGroupStatus("none");
            } else {
               setMyGroupStatus("error");
            }

            setMyGroupId(null);
            setMyGroupName("");
            setMyGroupStudentIds(new Set());
            setOverviewById({});
            setProgressById({});
            setAttemptsById({});
         }
      })();

      return () => {
         cancelled = true;
      };
   }, [user]);

   // 3) ia practice-progress + practiceHistory (pentru UNIQUE attempted)
   useEffect(() => {
      let cancelled = false;

      (async () => {
         if (myGroupStatus !== "ok") return;
         if (!myGroupStudentIds.size) return;

         const idsToFetch = Array.from(myGroupStudentIds)
            .map((x) => Number(x))
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
               // ✅ IMPORTANT: luăm history ca să numărăm UNIQUE, nu sesiuni
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

               if (stats) {
                  setProgressById((prev) => ({ ...prev, [key]: stats }));
               }

               const att = computeUniqueAttemptsFromHistory(hist);
               setAttemptsById((prev) => ({ ...prev, [key]: att }));
            } catch (_) {
               // silent
            } finally {
               inFlightRef.current.delete(key);
            }
         });
      })();

      return () => {
         cancelled = true;
      };
   }, [myGroupStatus, myGroupStudentIds]);

   const myGroupsOnly = useMemo(() => {
      if (myGroupStatus !== "ok") return [];
      if (myGroupId == null) return [];
      return allGroups.filter((g) => String(g?.id) === String(myGroupId));
   }, [allGroups, myGroupId, myGroupStatus]);

   const myStudentsOnly = useMemo(() => {
      if (myGroupStatus !== "ok") return [];
      if (!myGroupStudentIds?.size) return [];
      return usersRoleUSER.filter((u) => myGroupStudentIds.has(String(u?.id)));
   }, [usersRoleUSER, myGroupStudentIds, myGroupStatus]);

   const combinedStudentsError = studentsError ? String(studentsError) : null;

   return (
      <>
         <Header links={links}>
            <Popup />
         </Header>

         <main className="main">
            <section className="professor single">
               <CourseGroupsList
                  groups={myGroupsOnly}
                  students={myStudentsOnly}
                  myGroupId={myGroupId}
                  myGroupName={myGroupName}
                  myGroupStatus={myGroupStatus}
               />
            </section>

            <Footer />
         </main>
      </>
   );
}

export default PPGropus;
