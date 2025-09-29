// src/components/Popups/StudentInfoPopup.jsx
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchUserReservations } from "../../store/reservationsSlice";
import { updateStudent, removeStudent } from "../../store/studentsSlice";
import phoneIcon from "../../assets/svg/phone.svg";
import successIcon from "../../assets/svg/success.svg";
import cancelIcon from "../../assets/svg/cancel.svg";
import clockIcon from "../../assets/svg/clock.svg";
import emailIcon from "../../assets/svg/email.svg";
import { ReactSVG } from "react-svg";
import {
   closePopup as closePopupStore,
   openSubPopup,
   // closeSubPopup,
} from "../Utils/popupStore";
import { getExamHistoryForUser } from "../../api/examService";

export default function StudentInfoPopup({ student, onClose }) {
   const dispatch = useDispatch();

   const {
      list: reservations = [],
      loading,
      error,
   } = useSelector((state) => state.reservations);

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

   // confirmare pentru ștergere
   const [confirmDelete, setConfirmDelete] = useState(false);

   // tab-uri: programări / încercări examen
   const [tab, setTab] = useState("reservations"); // 'reservations' | 'attempts'

   // încercări examen
   const [attempts, setAttempts] = useState([]);
   const [attemptsLoading, setAttemptsLoading] = useState(false);
   const [attemptsError, setAttemptsError] = useState("");

   const safeClose = () => {
      if (typeof onClose === "function") {
         onClose();
      } else {
         try {
            closePopupStore();
         } catch (_) {}
      }
   };

   useEffect(() => {
      if (student?.id) {
         dispatch(fetchUserReservations(student.id));
      }
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
      setTab("reservations"); // la schimbarea studentului, revino pe Programări
   }, [student, dispatch]);

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
         setLiveStudent((prev) => ({ ...prev, privateMessage: noteValue }));
         setIsEditingNote(false);
      } catch (err) {
         alert("Nu s-a putut salva notița!");
      }
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

   // normalizator pentru încercări
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
   });

   // fetch încercări când intri pe tab
   useEffect(() => {
      let cancelled = false;
      if (tab !== "attempts" || !student?.id) return;

      (async () => {
         setAttemptsLoading(true);
         setAttemptsError("");
         try {
            const pageSize = 50;
            let page = 1;
            const all = [];
            for (;;) {
               const batch = await getExamHistoryForUser(student.id, {
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

            if (!cancelled) setAttempts(normalized);
         } catch (e) {
            if (!cancelled)
               setAttemptsError(
                  e?.message || "Nu am putut încărca încercările."
               );
         } finally {
            if (!cancelled) setAttemptsLoading(false);
         }
      })();

      return () => {
         cancelled = true;
      };
   }, [tab, student?.id]);

   if (!student) return null;

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
                     {liveStudent.email}
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

            {/* TABS */}
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

            {/* TAB: PROGRAMĂRI */}
            {tab === "reservations" && (
               <>
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

            {/* TAB: ÎNCERCĂRI EXAMEN */}
            {tab === "attempts" && (
               <div className="students-info__attempts">
                  {attemptsLoading && <p>Se încarcă încercările…</p>}
                  {attemptsError && (
                     <p className="students-info__error">{attemptsError}</p>
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
                                 ? new Date(a.startedAt).toLocaleString()
                                 : "–";
                              const finished = a.finishedAt
                                 ? new Date(a.finishedAt).toLocaleString()
                                 : null;
                              const lineLeft = finished
                                 ? `${started} → ${finished}`
                                 : `${started}`;
                              const scoreText =
                                 a.scorePct != null
                                    ? `${Math.round(a.scorePct)}%`
                                    : a.correct != null && a.total != null
                                    ? `${a.correct}/${a.total}`
                                    : a.correct != null && a.wrong != null
                                    ? `${a.correct} corecte / ${a.wrong} greșite`
                                    : "–";

                              return (
                                 <div
                                    key={a.id}
                                    className={`students-info__attempt students-info__attempt--${status}`}
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
