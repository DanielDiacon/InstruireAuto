import React, { useContext, useMemo } from "react";
import { ReactSVG } from "react-svg";

import { UserContext } from "../../UserContext";
import { openPopup } from "../Common/popupUIStore";

import profileIcon from "../../assets/svg/acc.svg";
import listIcon from "../../assets/svg/mdi--calendar-text-outline.svg";

function resolveStudentName(user) {
   const first = String(user?.firstName || "").trim();
   const last = String(user?.lastName || "").trim();
   const fromParts = `${first} ${last}`.trim();
   if (fromParts) return fromParts;

   const fallback = String(user?.name || user?.fullName || "").trim();
   return fallback || "Profil student";
}

export default function StudentMobileTopBar() {
   const { user } = useContext(UserContext);
   const fullName = useMemo(() => resolveStudentName(user), [user]);

   const openProfile = () => openPopup("studentProfile");
   const openReservations = () => openPopup("studentReservations");

   return (
      <div className="studentMobileTopBar">
         <button
            type="button"
            className="studentMobileTopBar__btn"
            onClick={openProfile}
            aria-label="Deschide profilul"
         >
            <ReactSVG className="studentMobileTopBar__icon" src={profileIcon} />
         </button>
         <div className="studentMobileTopBar__name" title={fullName}>
            <p>{fullName}</p>
         </div>

         <button
            type="button"
            className="studentMobileTopBar__btn"
            onClick={openReservations}
            aria-label="Deschide rezervările"
         >
            <ReactSVG className="studentMobileTopBar__icon" src={listIcon} />
         </button>
      </div>
   );
}
