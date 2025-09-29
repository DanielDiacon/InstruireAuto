import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchUserReservations } from "../../store/reservationsSlice";
import { updateStudent, removeStudent } from "../../store/studentsSlice";
import phoneIcon from "../../assets/svg/phone.svg";
import successIcon from "../../assets/svg/success.svg";
import cancelIcon from "../../assets/svg/cancel.svg";
import clockIcon from "../../assets/svg/clock.svg";
import emailIcon from "../../assets/svg/email.svg";
import { ReactSVG } from "react-svg"; // sus, lângă celelalte importuri
import {
   closePopup as closePopupStore,
   openSubPopup,
   closeSubPopup,
} from "../Utils/popupStore";

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

   // ✅ nou: confirmare pentru ștergere
   const [confirmDelete, setConfirmDelete] = useState(false);
   // sub useState-uri
   const safeClose = () => {
      if (typeof onClose === "function") {
         onClose(); // dacă ți-l dă wrapperul Popup
      } else {
         try {
            closePopupStore();
         } catch (_) {} // fallback prin popupStore
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
      setConfirmDelete(false); // reset la schimbarea studentului
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
         // opțional: curățăm state-ul local, ca să nu mai „clipească” datele vechi
         setConfirmDelete(false);
         setIsEditing(false);
         setLiveStudent({});
         safeClose(); // ⬅️ închide popup-ul ACUM
      } catch (err) {
         console.error("Eroare la ștergere:", err);
         alert(err?.message || "Ștergerea a eșuat!");
      }
   };

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

            <h4 className="students-info__subtitle">Programări:</h4>

            {loading && (
               <p className="students-info__loading">
                  Se încarcă programările...
               </p>
            )}
            {error && <p className="students-info__error">{error}</p>}
            {!loading && reservations.length === 0 && (
               <p className="students-info__empty">Nu există programări.</p>
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
                                    //onClose: () => closeSubPopup(), 
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
                                    {new Date(res.startTime).toLocaleString()}
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
         </div>
      </div>
   );
}
