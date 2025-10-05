// src/components/Popups/StudentInfoPopup.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchUserReservations } from "../../store/reservationsSlice";
import { updateStudent, removeStudent } from "../../store/studentsSlice";
import { fetchUsers } from "../../store/usersSlice";
import { updateUser } from "../../api/usersService";
import {
   getExamHistoryForStudentIdAll,
   getExamHistoryForUser, 
   downloadExamPdf,
} from "../../api/examService";

import { ReactSVG } from "react-svg";
import phoneIcon from "../../assets/svg/phone.svg";
import successIcon from "../../assets/svg/success.svg";
import cancelIcon from "../../assets/svg/cancel.svg";
import clockIcon from "../../assets/svg/clock.svg";
import emailIcon from "../../assets/svg/email.svg";
import downloadIcon from "../../assets/svg/download.svg";

import {
   closePopup as closePopupStore,
   openSubPopup,
} from "../Utils/popupStore";

const normEmail = (s) =>
   String(s || "")
      .trim()
      .toLowerCase();

export default function StudentInfoPopup({ student, onClose }) {
   const dispatch = useDispatch();

   const {
      list: reservations = [],
      loading,
      error,
   } = useSelector((state) => state.reservations);

   const users = useSelector((s) => s.users?.list || []);

   const [isEditing, setIsEditing] = useState(false);
   const [isEditingNote, setIsEditingNote] = useState(false);

   const [formData, setFormData] = useState({
      firstName: student?.firstName || "",
      lastName: student?.lastName || "",
      email: student?.email || "",
      phone: student?.phone || "",
      privateMessage: student?.privateMessage || "",
   });

   const [noteValue, setNoteValue] = useState(student?.privateMessage || "");
   const [liveStudent, setLiveStudent] = useState(student || {});
   const [confirmDelete, setConfirmDelete] = useState(false);

   const [tab, setTab] = useState("reservations"); // 'reservations' | 'attempts'
   const [attempts, setAttempts] = useState([]);
   const [attemptsLoading, setAttemptsLoading] = useState(false);
   const [attemptsError, setAttemptsError] = useState("");

   const [downloadingId, setDownloadingId] = useState(null);
   const [downloadError, setDownloadError] = useState("");

   const safeClose = () => {
      if (typeof onClose === "function") onClose();
      else {
         try {
            closePopupStore();
         } catch {}
      }
   };

   const targetUser = useMemo(() => {
      if (!student) return null;
      if (student.userId) {
         const u = users.find((x) => String(x.id) === String(student.userId));
         if (u) return u;
      }
      const e = normEmail(student.email);
      if (e) {
         const u = users.find((x) => normEmail(x.email) === e);
         if (u) return u;
      }
      return null;
   }, [student, users]);

   const targetUserId = targetUser?.id || student?.userId || null;

   const fmtRO = useMemo(
      () =>
         new Intl.DateTimeFormat("ro-MD", {
            timeZone: "Europe/Chisinau",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
         }),
      []
   );

   useEffect(() => {
      dispatch(fetchUsers());

      setFormData({
         firstName: student?.firstName || "",
         lastName: student?.lastName || "",
         email: student?.email || "",
         phone: student?.phone || "",
         privateMessage: student?.privateMessage || "",
      });
      setNoteValue(student?.privateMessage || "");
      setLiveStudent(student || {});
      setConfirmDelete(false);
      setTab("reservations");
   }, [student, dispatch]);

   useEffect(() => {
      if (targetUserId) {
         dispatch(fetchUserReservations(String(targetUserId)));
      }
   }, [dispatch, targetUserId]);

   useEffect(() => {
      if (!isEditing && targetUser?.email) {
         setFormData((prev) => ({ ...prev, email: targetUser.email }));
      }
   }, [targetUser?.email, isEditing]);

   const handleEditToggle = () => setIsEditing(!isEditing);

   const handleChange = (e) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
   };

   const handleSave = async () => {
      try {
         const dataToSend = { ...formData };
         const updated = await dispatch(
            updateStudent({ id: student.id, data: dataToSend })
         ).unwrap();

         const newEmail = normEmail(dataToSend.email);
         const oldEmail = normEmail(targetUser?.email || "");
         if (targetUserId && newEmail && newEmail !== oldEmail) {
            try {
               await updateUser(targetUserId, { email: dataToSend.email });
               dispatch(fetchUsers());
            } catch (e) {
               console.warn("Update user email failed:", e);
            }
         }

         setLiveStudent(updated);
         setFormData(updated);
         setIsEditing(false);
      } catch (err) {
         console.error("Eroare la salvare:", err);
         alert("Actualizarea a eșuat!");
      }
   };

   const handleSaveNote = async () => {
      try {
         await dispatch(
            updateStudent({
               id: student.id,
               data: { privateMessage: noteValue },
            })
         ).unwrap();
      } catch {
         alert("Nu s-a putut salva notița!");
         return;
      }
      setLiveStudent((prev) => ({ ...prev, privateMessage: noteValue }));
      setIsEditingNote(false);
   };

   const handleDelete = async () => {
      try {
         await dispatch(removeStudent(student.id)).unwrap();
         setConfirmDelete(false);
         setIsEditing(false);
         setLiveStudent({});
         safeClose();
      } catch (err) {
         console.error("Eroare la ștergere:", err);
         alert(err?.message || "Ștergerea a eșuat!");
      }
   };

   const getReservationUserId = (r) => {
      const v =
         r?.userId ??
         r?.user_id ??
         r?.studentId ??
         r?.student?.id ??
         r?.user?.id ??
         r?.student?.userId ??
         null;
      return v != null ? String(v) : null;
   };

   const getAttemptUserId = (it) => {
      const v =
         it?.userId ??
         it?.user_id ??
         it?.user?.id ??
         it?.studentId ??
         it?.student?.id ??
         it?.student?.userId ??
         null;
      return v != null ? String(v) : null;
   };

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
         (typeof it.scorePct === "number" && it.scorePct) ||
         (typeof it.percentage === "number" && it.percentage) ||
         (typeof it.score === "number" && it.score) ||
         null,
      attemptUserId: getAttemptUserId(it),
   });

   const myReservations = useMemo(() => {
      if (!targetUserId) return [];
      const uid = String(targetUserId);
      return reservations.filter((r) => getReservationUserId(r) === uid);
   }, [reservations, targetUserId]);

   useEffect(() => {
      let cancelled = false;
      if (tab !== "attempts" || !targetUserId) return;

      (async () => {
         setAttemptsLoading(true);
         setAttemptsError("");
         try {
            // 1) încercăm endpointul nou: /exams/history/student/{studentId}
            const all = await getExamHistoryForStudentIdAll(
               String(targetUserId),
               {
                  pageSize: 50,
                  maxPages: 10,
               }
            );

            const uid = String(targetUserId);
            const normalized = all
               .map(normalizeAttempt)
               // Dacă serverul nu pune userId în fiecare item, nu mai filtrăm strict.
               .filter((a) => !a.attemptUserId || a.attemptUserId === uid)
               .sort((a, b) => {
                  const ta = a.startedAt ? Date.parse(a.startedAt) : 0;
                  const tb = b.startedAt ? Date.parse(b.startedAt) : 0;
                  return tb - ta;
               });

            if (!cancelled) setAttempts(normalized);
         } catch (e) {
            // 2) fallback: vechiul "smart" (în caz de 404/405 sau backend vechi)
            try {
               const pageSize = 50;
               let page = 1;
               const all = [];
               for (;;) {
                  const batch = await getExamHistoryForUser(
                     String(targetUserId),
                     { page, limit: pageSize }
                  );
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

               const uid = String(targetUserId);
               const normalized = all
                  .map(normalizeAttempt)
                  .filter((a) => a.attemptUserId === uid)
                  .sort((a, b) => {
                     const ta = a.startedAt ? Date.parse(a.startedAt) : 0;
                     const tb = b.startedAt ? Date.parse(b.startedAt) : 0;
                     return tb - ta;
                  });

               if (!cancelled) setAttempts(normalized);
            } catch (e2) {
               if (!cancelled) {
                  const msg = String(
                     e?.message ||
                        e2?.message ||
                        "Nu am putut încărca încercările."
                  );
                  const friendly =
                     msg === "AUTH_401"
                        ? "Nu ești autentificat (401)."
                        : msg === "AUTH_403"
                        ? "Doar Manager/Admin pot vedea încercările acestui student (403)."
                        : msg;
                  setAttemptsError(friendly);
               }
            }
         } finally {
            if (!cancelled) setAttemptsLoading(false);
         }
      })();

      return () => {
         cancelled = true;
      };
   }, [tab, targetUserId]);

   if (!student) return null;

   const displayEmail = targetUser?.email || liveStudent.email || "–";

   const handleDownloadPdf = async (examId) => {
      setDownloadError("");
      setDownloadingId(examId);
      try {
         await downloadExamPdf(examId /*, `rezultat-exam-${examId}.pdf` */);
      } catch (e) {
         console.error("Download PDF failed:", e);
         setDownloadError(e?.message || "Descărcarea a eșuat.");
      } finally {
         setDownloadingId(null);
      }
   };

   return (
      <div className="students-info">
         <div className="popup-panel__header">
            <h3 className="popup-panel__title students-info__title">
               <span>Profil</span>{" "}
               {!isEditing
                  ? `${liveStudent.firstName} ${liveStudent.lastName}`
                  : "Editare student"}
            </h3>
         </div>

         <div className="students-info__actions">
            {!isEditing && (
               <button
                  className="students-info__btn students-info__btn--edit"
                  onClick={handleEditToggle}
               >
                  Edit
               </button>
            )}
         </div>

         <div className="students-info__content">
            {isEditing ? (
               <div className="students-info__form">
                  <div className="students-info__inputs">
                     <input
                        type="text"
                        name="firstName"
                        value={formData.firstName}
                        onChange={handleChange}
                     />
                     <input
                        type="text"
                        name="lastName"
                        value={formData.lastName}
                        onChange={handleChange}
                     />
                     <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                     />
                     <input
                        type="text"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                     />
                     <input
                        name="privateMessage"
                        value={formData.privateMessage}
                        onChange={handleChange}
                     />
                  </div>

                  <div className="students-info__btns">
                     <button
                        className="students-info__btn students-info__btn--save"
                        onClick={handleSave}
                     >
                        Salvează
                     </button>
                     <button
                        className="students-info__btn students-info__btn--normal"
                        onClick={handleEditToggle}
                     >
                        Cancel
                     </button>

                     <div className="students__item-delete">
                        <button
                           onClick={() => setConfirmDelete(true)}
                           className={`delete-btn ${
                              confirmDelete ? "hidden" : ""
                           }`}
                        >
                           Șterge
                        </button>

                        <div
                           className={`delete-confirmation ${
                              confirmDelete ? "" : "hidden"
                           }`}
                        >
                           <button
                              onClick={handleDelete}
                              className="delete-confirm"
                           >
                              Da
                           </button>
                           <button
                              onClick={() => setConfirmDelete(false)}
                              className="cancel-confirm"
                           >
                              Nu
                           </button>
                        </div>
                     </div>
                  </div>
               </div>
            ) : (
               <>
                  <div className="students-info__field">
                     <ReactSVG
                        src={emailIcon}
                        className="students-info__icon"
                     />
                     {displayEmail}
                  </div>
                  <div className="students-info__field">
                     <ReactSVG
                        src={phoneIcon}
                        className="students-info__icon"
                     />
                     {liveStudent.phone || "–"}
                  </div>

                  <div className="students-info__note-section">
                     {isEditingNote ? (
                        <>
                           <input
                              value={noteValue}
                              onChange={(e) => setNoteValue(e.target.value)}
                           />
                           <button
                              className="students-info__btn students-info__btn--save"
                              onClick={handleSaveNote}
                           >
                              Salvează
                           </button>
                           <button
                              className="students-info__btn students-info__btn--normal"
                              onClick={() => setIsEditingNote(false)}
                           >
                              Anulează
                           </button>
                        </>
                     ) : (
                        <>
                           {liveStudent.privateMessage ? (
                              <>
                                 <span className="students-info__note">
                                    „{liveStudent.privateMessage}”
                                 </span>
                                 <button
                                    className="students-info__btn students-info__btn--edit"
                                    onClick={() => setIsEditingNote(true)}
                                 >
                                    Editează notița
                                 </button>
                              </>
                           ) : (
                              <button
                                 className="students-info__btn students-info__btn--normal"
                                 onClick={() => setIsEditingNote(true)}
                              >
                                 Adaugă notiță
                              </button>
                           )}
                        </>
                     )}
                  </div>
               </>
            )}

            <div className="students-info__tabs">
               <button
                  className={
                     "students-info__tab" +
                     (tab === "reservations" ? " is-active" : "")
                  }
                  onClick={() => setTab("reservations")}
               >
                  Programări
               </button>
               <button
                  className={
                     "students-info__tab" +
                     (tab === "attempts" ? " is-active" : "")
                  }
                  onClick={() => setTab("attempts")}
               >
                  Încercări examen
               </button>
            </div>

            {tab === "reservations" && (
               <>
                  {loading && (
                     <p className="students-info__loading">
                        Se încarcă programările...
                     </p>
                  )}
                  {error && <p className="students-info__error">{error}</p>}
                  {!loading && myReservations.length === 0 && (
                     <p className="students-info__empty">
                        Nu există programări.
                     </p>
                  )}

                  {!loading && myReservations.length > 0 && (
                     <div className="students-info__list-wrapper">
                        <div className="students-info__list">
                           {myReservations.map((res, index) => {
                              const status = res.status || "pending";
                              return (
                                 <div
                                    key={res.id + "-" + index}
                                    onClick={() =>
                                       openSubPopup("reservationEdit", {
                                          reservationId: res.id,
                                       })
                                    }
                                    className={`students-info__item students-info__item--${status}`}
                                 >
                                    <div className="students-info__item-left">
                                       <h3>
                                          {liveStudent.firstName
                                             ? `${liveStudent.firstName} ${liveStudent.lastName}`
                                             : res.student || "–"}
                                       </h3>
                                       <p>
                                          {res.instructor?.firstName
                                             ? `cu ${res.instructor.firstName} ${res.instructor.lastName}`
                                             : "fără instructor"}
                                       </p>
                                       <span>
                                          {res.startTime
                                             ? fmtRO.format(
                                                  new Date(res.startTime)
                                               )
                                             : "—"}
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

            {tab === "attempts" && (
               <div className="students-info__attempts">
                  {attemptsLoading && <p>Se încarcă încercările…</p>}
                  {attemptsError && (
                     <p className="students-info__error">{attemptsError}</p>
                  )}
                  {downloadError && (
                     <p className="students-info__error">
                        Descărcare: {downloadError}
                     </p>
                  )}

                  {!attemptsLoading &&
                     !attemptsError &&
                     attempts.length === 0 && (
                        <p className="students-info__empty">
                           Nu există încercări.
                        </p>
                     )}

                  {!attemptsLoading &&
                     !attemptsError &&
                     attempts.length > 0 && (
                        <div className="students-info__list students-info__list--attempts">
                           {attempts.slice(0, 50).map((a) => {
                              const status = (
                                 a.status || "UNKNOWN"
                              ).toLowerCase();

                              const started = a.startedAt
                                 ? fmtRO.format(new Date(a.startedAt))
                                 : "–";
                              const finished = a.finishedAt
                                 ? fmtRO.format(new Date(a.finishedAt))
                                 : null;

                              const lineLeft = finished
                                 ? `${started} → ${finished}`
                                 : started;

                              const scoreText =
                                 a.scorePct != null
                                    ? `${Math.round(a.scorePct)}%`
                                    : a.correct != null && a.total != null
                                    ? `${a.correct}/${a.total}`
                                    : a.correct != null && a.wrong != null
                                    ? `${a.correct} corecte / ${a.wrong} greșite`
                                    : "–";

                              const eid = a.examId ?? a.id;

                              return (
                                 <div
                                    key={a.id}
                                    className={`students-info__attempt students-info__attempt--${status}`}
                                    style={{
                                       position: "relative",
                                       paddingRight: 44,
                                    }}
                                 >
                                    <div>
                                       <div className="students-info__attempt-status">
                                          {status}
                                       </div>
                                       <div className="students-info__attempt-dates">
                                          {lineLeft}
                                       </div>
                                    </div>

                                    <div className="students-info__attempt-score">
                                       <div>{scoreText}</div>
                                       {a.total != null && (
                                          <div>{a.total} întrebări</div>
                                       )}
                                    </div>

                                    {eid && (
                                       <button
                                          type="button"
                                          onClick={(e) => {
                                             e.stopPropagation();
                                             handleDownloadPdf(eid);
                                          }}
                                          className="students-info__btn-icon students-info__attempt-download"
                                          title={
                                             downloadingId === eid
                                                ? "Se descarcă..."
                                                : "Descarcă rezultatul (PDF)"
                                          }
                                          disabled={downloadingId === eid}
                                          style={{
                                             position: "absolute",
                                             top: 6,
                                             right: 6,
                                             padding: 6,
                                             opacity: 0.9,
                                          }}
                                       >
                                          <ReactSVG
                                             src={downloadIcon}
                                             className={
                                                "students-info__item-icon download" +
                                                (downloadingId === eid
                                                   ? " is-loading"
                                                   : "")
                                             }
                                          />
                                       </button>
                                    )}
                                 </div>
                              );
                           })}
                        </div>
                     )}
               </div>
            )}
         </div>
      </div>
   );
}
