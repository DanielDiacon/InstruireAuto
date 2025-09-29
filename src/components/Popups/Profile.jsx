// src/components/Popups/Profile.jsx
import React, { useEffect, useState, useMemo, useContext } from "react";
import { useDispatch, useSelector } from "react-redux";
import { UserContext } from "../../UserContext";
import { fetchUserReservations } from "../../store/reservationsSlice";
import { getInstructors } from "../../api/instructorsService";
import { getStudentExamHistory } from "../../api/examService";

import Cookies from "js-cookie";
import { useNavigate } from "react-router-dom";

import phoneIcon from "../../assets/svg/phone.svg";
import successIcon from "../../assets/svg/success.svg";
import cancelIcon from "../../assets/svg/cancel.svg";
import clockIcon from "../../assets/svg/clock.svg";
import emailIcon from "../../assets/svg/email.svg";
import crownIcon from "../../assets/svg/crown.svg";
import wrenchIcon from "../../assets/svg/wrench.svg";
import studentIcon from "../../assets/svg/graduate.svg";
import { ReactSVG } from "react-svg";

/* Helpers */
const roleLabel = (role) => {
   switch (String(role || "").toUpperCase()) {
      case "ADMIN":
         return "Administrator";
      case "MANAGER":
         return "Manager";
      case "INSTRUCTOR":
         return "Instructor";
      default:
         return "Student";
   }
};

const roleIcon = (role) => {
   const r = String(role || "").toUpperCase();
   if (r === "ADMIN") return crownIcon;
   if (r === "MANAGER" || r === "INSTRUCTOR") return wrenchIcon;
   return studentIcon;
};

// Afișăm +373 în UI
const formatMDPhone = (p) => {
   if (!p) return "–";
   const digits = String(p).replace(/\D/g, "");
   if (digits.length === 8) {
      return `+373 ${digits.replace(/(\d{2})(\d{3})(\d{3})/, "$1 $2 $3")}`;
   }
   if (digits.startsWith("373") && digits.length === 11) {
      return `+${digits.replace(
         /(\d{3})(\d{2})(\d{3})(\d{3})/,
         "$1 $2 $3 $4"
      )}`;
   }
   return p;
};

const isDateLike = (v) =>
   typeof v === "string" && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);

const renderValue = (v) => {
   if (v === null || v === undefined || v === "") return "–";
   if (Array.isArray(v)) return v.length ? v.join(", ") : "–";
   if (typeof v === "object") return JSON.stringify(v);
   if (isDateLike(v)) return new Date(v).toLocaleString();
   return String(v);
};

// câmpuri ascunse din secțiunea “Detalii”
const HIDE_KEYS_BASE = new Set([
   "id",
   "__v",
   "password",
   "hash",
   "salt",
   "token",
   "tokens",
   "accessToken",
   "refreshToken",
   "avatar",
   "avatarUrl",
   "reservations",
   "privateMessage",
]);

// ascundem tot ce ține de grup/instructor indiferent de rol
const HIDE_KEYS_GROUP_INSTR = new Set([
   "groupId",
   "group_id",
   "group",
   "instructorsGroupId",
   "instructors_group_id",
   "instructorId",
   "instructor_id",
   "instructor",
   "instructorUserId",
   "instructor_user_id",
   "userId",
   "user_id",
]);

// afișate separat
const PRIMARY_KEYS = new Set([
   "firstName",
   "lastName",
   "email",
   "phone",
   "role",
]);

export default function Profile() {
   const navigate = useNavigate();
   const { user } = useContext(UserContext);
   const entity = useMemo(() => user || {}, [user]);

   const dispatch = useDispatch();
   const {
      list: reservations = [],
      loading,
      error,
   } = useSelector((state) => state.reservations || {});

   const [liveEntity, setLiveEntity] = useState(entity || {});
   const entityRole =
      (entity?.role && String(entity.role).toUpperCase()) || "USER";

   // === Prefer numele din profilul de instructor pentru titlu (dacă e INSTRUCTOR) ===
   const [myInstructor, setMyInstructor] = useState(null);

   useEffect(() => {
      let cancelled = false;
      (async () => {
         if (!entity?.id || entityRole !== "INSTRUCTOR") {
            setMyInstructor(null);
            return;
         }
         try {
            const all = await getInstructors();
            const mine = all.find(
               (i) => String(i.userId) === String(entity.id)
            );
            if (!cancelled) setMyInstructor(mine || null);
         } catch (e) {
            console.error("[Profile] getInstructors failed:", e);
            if (!cancelled) setMyInstructor(null);
         }
      })();
      return () => {
         cancelled = true;
      };
   }, [entity?.id, entityRole]);

   const displayFirstName = useMemo(
      () =>
         entityRole === "INSTRUCTOR"
            ? myInstructor?.firstName || entity?.firstName || ""
            : entity?.firstName || "",
      [entity?.firstName, entityRole, myInstructor]
   );

   const displayLastName = useMemo(
      () =>
         entityRole === "INSTRUCTOR"
            ? myInstructor?.lastName || entity?.lastName || ""
            : entity?.lastName || "",
      [entity?.lastName, entityRole, myInstructor]
   );

   // programări doar pentru STUDENT (USER)
   const showReservations = entityRole === "USER" && !!entity?.id;

   useEffect(() => {
      if (showReservations) dispatch(fetchUserReservations(entity.id));
      setLiveEntity(entity || {});
   }, [dispatch, entity, entity?.id, showReservations]);

   // logout în loc de editare
   const handleLogout = () => {
      Cookies.remove("access_token");
      sessionStorage.clear();
      navigate("/");
   };

   // “Detalii” dinamice: toate câmpurile ne-primare + fără cele din blacklist-uri
   const dynamicDetails = Object.entries(entity).filter(([k]) => {
      if (PRIMARY_KEYS.has(k)) return false;
      if (HIDE_KEYS_BASE.has(k)) return false;
      if (HIDE_KEYS_GROUP_INSTR.has(k)) return false; // ✖️ ascundem group/instructor info
      return true;
   });

   /* ===================== EXAMS: încercări student ===================== */
   const [examAttempts, setExamAttempts] = useState([]);
   const [examAttemptsLoading, setExamAttemptsLoading] = useState(false);
   const [examAttemptsError, setExamAttemptsError] = useState("");
   const showExamAttempts = entityRole === "USER" && !!entity?.id;

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

   useEffect(() => {
      if (!showExamAttempts) return;
      let cancelled = false;

      (async () => {
         setExamAttemptsLoading(true);
         setExamAttemptsError("");
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

            if (!cancelled) {
               setExamAttempts(normalized);
               // log în consolă
               console.groupCollapsed(
                  "%c[EXAMS] Încercări student (" + normalized.length + ")",
                  "color:#06c;font-weight:700"
               );
               normalized.forEach((row, i) =>
                  console.log(`#${String(i + 1).padStart(3, "0")}`, row)
               );
               console.groupEnd();
            }
         } catch (e) {
            if (!cancelled)
               setExamAttemptsError(
                  e?.message || "Nu am putut încărca încercările."
               );
         } finally {
            if (!cancelled) setExamAttemptsLoading(false);
         }
      })();

      return () => {
         cancelled = true;
      };
   }, [showExamAttempts]);

   return (
      <div className="students-info">
         <div className="popup-panel__header">
            <h3 className="popup-panel__title students-info__title">
               <span>Profil</span>{" "}
               {`${displayFirstName} ${displayLastName}`.trim() || "—"}
            </h3>
         </div>

         <div className="students-info__actions">
            <button
               className="students-info__btn students-info__btn--normal"
               onClick={handleLogout}
            >
               Logout
            </button>
         </div>

         <div className="students-info__content">
            {/* ROL */}
            <div className="students-info__field">
               <ReactSVG
                  className="students-info__icon"
                  src={roleIcon(entityRole)}
               />
               {roleLabel(entityRole)}
            </div>

            {/* CONTACT */}
            <div className="students-info__field">
               <ReactSVG src={emailIcon} className="students-info__icon" />
               {liveEntity.email || "–"}
            </div>
            <div className="students-info__field">
               <ReactSVG src={phoneIcon} className="students-info__icon" />
               {formatMDPhone(liveEntity.phone)}
            </div>

            {/* DETALII DINAMICE (fără groupId/instructor etc.) */}
            {/* {dynamicDetails.length > 0 && (
          <>
            <h4 className="students-info__subtitle">Detalii:</h4>
            {dynamicDetails.map(([key, value]) => (
              <div key={key} className="students-info__field">
                <strong style={{ marginRight: 8 }}>
                  {key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}:
                </strong>
                <span>{renderValue(value)}</span>
              </div>
            ))}
          </>
        )} */}

            {/* ÎNCERCĂRI EXAMEN – doar pentru studenți */}
            {showExamAttempts && (
               <>
                  <h4 className="students-info__subtitle">Încercări examen:</h4>

                  {examAttemptsLoading && (
                     <p className="students-info__loading">
                        Se încarcă încercările...
                     </p>
                  )}
                  {examAttemptsError && (
                     <p className="students-info__error">{examAttemptsError}</p>
                  )}
                  {!examAttemptsLoading &&
                     examAttempts.length === 0 &&
                     !examAttemptsError && (
                        <p className="students-info__empty">
                           Nu există încercări.
                        </p>
                     )}

                  {!examAttemptsLoading && examAttempts.length > 0 && (
                     <div className="students-info__list-wrapper">
                        <div className="students-info__list">
                           {examAttempts.map((a) => {
                              console.log(a);

                              const status = a.status.toLowerCase();
                              const started = a.startedAt
                                 ? new Date(a.startedAt).toLocaleString()
                                 : "–";

                              return (
                                 <div
                                    key={a.id}
                                    className={`students-info__item students-info__item--${status}`}
                                 >
                                    <div className="students-info__item-left">
                                       <h3>Examen #{a.examId ?? "–"}</h3>
                                       <p>
                                          Scor:{" "}
                                          <b className="tnum">{status}</b>
                                       </p>
                                       <span>{started}</span>
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                     </div>
                  )}
               </>
            )}

            {/* PROGRAMĂRI – doar pentru studenți (USER) */}
            {showReservations && (
               <>
                  <h4 className="students-info__subtitle">Programări:</h4>

                  {loading && (
                     <p className="students-info__loading">
                        Se încarcă programările...
                     </p>
                  )}
                  {error && <p className="students-info__error">{error}</p>}
                  {!loading && reservations.length === 0 && (
                     <p className="students-info__empty">
                        Nu există programări.
                     </p>
                  )}

                  {!loading && reservations.length > 0 && (
                     <div className="students-info__list-wrapper">
                        <div className="students-info__list">
                           {reservations.map((res, index) => {
                              const status = res.status || "pending";
                              return (
                                 <div
                                    key={res.id + "-" + index}
                                    className={`students-info__item students-info__item--${status}`}
                                 >
                                    <div className="students-info__item-left">
                                       <h3>
                                          {liveEntity.firstName
                                             ? `${liveEntity.firstName} ${liveEntity.lastName}`
                                             : res.student || "–"}
                                       </h3>
                                       <p>
                                          {res.instructor?.firstName
                                             ? `cu ${res.instructor.firstName} ${res.instructor.lastName}`
                                             : "fără instructor"}
                                       </p>
                                       <span>
                                          {new Date(
                                             res.startTime
                                          ).toLocaleString()}
                                       </span>
                                    </div>
                                    <div className="students-info__item-right">
                                       {status === "completed" && (
                                          <ReactSVG
                                             className="students-info__item-icon completed"
                                             src={successIcon}
                                          />
                                       )}
                                       {status === "cancelled" && (
                                          <ReactSVG
                                             className="students-info__item-icon cancelled"
                                             src={cancelIcon}
                                          />
                                       )}
                                       {status === "pending" && (
                                          <ReactSVG
                                             className="students-info__item-icon pending"
                                             src={clockIcon}
                                          />
                                       )}
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                     </div>
                  )}
               </>
            )}
         </div>
      </div>
   );
}
