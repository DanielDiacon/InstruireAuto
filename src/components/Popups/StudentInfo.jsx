import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchUserReservations } from "../../store/reservationsSlice";
import phoneIcon from "../../assets/svg/phone.svg";
import successIcon from "../../assets/svg/success.svg";
import cancelIcon from "../../assets/svg/cancel.svg";
import clockIcon from "../../assets/svg/clock.svg";
import emailIcon from "../../assets/svg/email.svg";
import { ReactSVG } from "react-svg";

export default function StudentInfoPopup({ student, onClose }) {
   const dispatch = useDispatch();

   const {
      list: reservations = [],
      loading,
      error,
   } = useSelector((state) => state.reservations);

   useEffect(() => {
      if (student?.id) {
         dispatch(fetchUserReservations(student.id));
      }
   }, [student, dispatch]);

   if (!student) return null;

   return (
      <div className="popup-panel__inner students-info">
         {/* Header */}
         <div className="popup-panel__header ">
            <h3 className="popup-panel__title students-info__title">
               <span>Profil </span>
               {student.firstName} {student.lastName}
            </h3>
         </div>

         {/* Butoane acțiuni */}

         {/* Content */}
         <div className="popup-panel__content students-info__content">
            <div className="students-info__actions">
               <button className="students-info__btn students-info__btn--edit">
                  Edit
               </button>
               <button className="students-info__btn students-info__btn--delete">
                  Delete
               </button>
            </div>
            <p className="students-info__field">
               <ReactSVG src={emailIcon} className="students-info__icon" />
               {student.email}
            </p>
            <p className="students-info__field">
               <ReactSVG src={phoneIcon} className="students-info__icon" />{" "}
               {student.phone || "–"}
            </p>

            {/* Notiță privată */}
            {student.privateMessage && (
               <p className="students-info__note">„{student.privateMessage}”</p>
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
                                 {student?.firstName
                                    ? `${student.firstName} ${student.lastName}`
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
            )}
         </div>
      </div>
   );
}
