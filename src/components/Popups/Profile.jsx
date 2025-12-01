// src/components/Popups/Profile.jsx
import React, { useEffect, useState, useMemo, useContext } from "react";
import { useDispatch, useSelector } from "react-redux";
import { UserContext } from "../../UserContext";
import { fetchReservations } from "../../store/reservationsSlice";
import { getInstructors } from "../../api/instructorsService";
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
      // 22 123 456 -> +373 22 123 456
      return `+373 ${digits.replace(/(\d{2})(\d{3})(\d{3})/, "$1 $2 $3")}`;
   }
   if (digits.startsWith("373") && digits.length === 11) {
      // 373 22 123 456 -> +373 22 123 456
      return `+${digits.replace(
         /(\d{3})(\d{2})(\d{3})(\d{3})/,
         "$1 $2 $3 $4"
      )}`;
   }
   return String(p);
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
   "privateMessage", // ✖️ nu afișăm această notiță
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
// === Format ISO -> "DD MM YYYY - HH:MM" fără schimbare de oră (fără timezone) ===
function fmtIsoDDMMYYYY_HHMM_Plain(val) {
   if (val == null) return "–";

   // Dacă e string: extragem direct, fără a crea Date (deci fără offset)
   if (typeof val === "string") {
      // Acceptă: "YYYY-MM-DDTHH:MM[:SS[.ms]][Z|±HH:MM]" sau cu spațiu în loc de "T"
      const m = val.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))/);
      if (m) {
         const [, Y, M, D, h, min] = m;
         return `${D} ${M} ${Y} - ${h}:${min}`;
      }
      return String(val);
   }

   // Dacă ajunge Date/număr, folosim UTC ca să nu aplicăm fus local
   const d = val instanceof Date ? val : new Date(val);
   if (isNaN(d)) return "–";
   const pad = (n) => String(n).padStart(2, "0");
   const Y = d.getUTCFullYear();
   const M = pad(d.getUTCMonth() + 1);
   const D = pad(d.getUTCDate());
   const h = pad(d.getUTCHours());
   const min = pad(d.getUTCMinutes());
   return `${D} ${M} ${Y} - ${h}:${min}`;
}

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
            const mine = Array.isArray(all)
               ? all.find((i) => String(i.userId) === String(entity.id))
               : null;
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

   const fullName =
      `${displayFirstName || ""} ${displayLastName || ""}`.trim() || "—";

   // programări doar pentru STUDENT (USER)
   const showReservations = entityRole === "USER" && !!entity?.id;

   useEffect(() => {
      if (showReservations) dispatch(fetchReservations(entity.id));
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

   return (
      <div className="students-info">
         <div className="popup-panel__header">
            <h3 className="popup-panel__title students-info__title">
               <span>Profil</span> {fullName}
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
            {/*
        {dynamicDetails.length > 0 && (
          <>
            <h4 className="students-info__subtitle">Detalii:</h4>
            {dynamicDetails.map(([key, value]) => (
              <div key={key} className="students-info__field">
                <strong style={{ marginRight: 8 }}>
                  {key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (c) => c.toUpperCase())}
                  :
                </strong>
                <span>{renderValue(value)}</span>
              </div>
            ))}
          </>
        )}
        */}

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
                              const studentName = liveEntity.firstName
                                 ? `${liveEntity.firstName} ${
                                      liveEntity.lastName || ""
                                   }`.trim()
                                 : res.student || "–";
                              const instructorName = res.instructor?.firstName
                                 ? `cu ${res.instructor.firstName} ${
                                      res.instructor.lastName || ""
                                   }`.trim()
                                 : "fără instructor";

                              return (
                                 <div
                                    key={`${res.id}-${index}`}
                                    className={`students-info__item students-info__item--${status}`}
                                 >
                                    <div className="students-info__item-left">
                                       <h3>{studentName}</h3>
                                       {/*<p>{instructorName}</p>*/}
                                      <span>{fmtIsoDDMMYYYY_HHMM_Plain(res.startTime)}</span>
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
