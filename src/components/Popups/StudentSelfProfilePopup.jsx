import React, { useContext, useEffect, useMemo, useState } from "react";
import { ReactSVG } from "react-svg";

import { UserContext } from "../../UserContext";
import { fetchUserInfo } from "../../api/authService";
import DarkModeToggle from "../Header/DarkModeToggle";

import studentIcon from "../../assets/svg/graduate.svg";

const asBool = (v) => {
   if (typeof v === "boolean") return v;
   if (typeof v === "number") return v === 1;
   const s = String(v || "")
      .trim()
      .toLowerCase();
   return s === "1" || s === "true" || s === "yes" || s === "da";
};

const asNumber = (v) => {
   const n = Number(v);
   return Number.isFinite(n) ? n : 0;
};

function readMedicalDocuments(src) {
   const values = [
      src?.medical_documents,
      src?.medicalDocuments,
      src?.extras?.medical_documents,
      src?.profile?.medical_documents,
   ];
   return values.some((v) => asBool(v));
}

function readIndividualWork(src) {
   const values = [
      src?.individual_work,
      src?.individualWork,
      src?.extras?.individual_work,
      src?.profile?.individual_work,
   ];
   return values.some((v) => asBool(v));
}

function readAbsences(src) {
   return asNumber(
      src?.number_of_absences ??
         src?.numberOfAbsences ??
         src?.extras?.number_of_absences ??
         src?.profile?.number_of_absences ??
         0,
   );
}

function readIdnp(src) {
   const raw =
      src?.idnp ?? src?.IDNP ?? src?.profile?.idnp ?? src?.extras?.idnp ?? "";
   return String(raw || "").trim();
}

export default function StudentSelfProfilePopup() {
   const { user } = useContext(UserContext);
   const [me, setMe] = useState(user || null);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState("");

   useEffect(() => {
      let alive = true;
      (async () => {
         setLoading(true);
         setError("");
         try {
            const fresh = await fetchUserInfo();
            if (!alive) return;
            setMe(fresh || user || null);
         } catch {
            if (!alive) return;
            setMe(user || null);
            setError("Nu am putut actualiza profilul din server.");
         } finally {
            if (alive) setLoading(false);
         }
      })();

      return () => {
         alive = false;
      };
   }, [user]);

   const fullName = useMemo(() => {
      const first = String(me?.firstName || "").trim();
      const last = String(me?.lastName || "").trim();
      const joined = `${first} ${last}`.trim();
      if (joined) return joined;
      const fallback = String(me?.name || me?.fullName || "").trim();
      return fallback || "Student";
   }, [me]);

   const idnp = useMemo(() => readIdnp(me), [me]);
   const medicalDocuments = useMemo(() => readMedicalDocuments(me), [me]);
   const individualWork = useMemo(() => readIndividualWork(me), [me]);
   const numberOfAbsences = useMemo(() => readAbsences(me), [me]);
   const presentedMedicalLabel = medicalDocuments ? "Prezentat" : "Neprezentat";
   const presentedIndividualLabel = individualWork
      ? "Prezentat"
      : "Neprezentat";

   return (
      <div className="studentSelfProfilePopup">
         <div className="studentSelfProfilePopup__hero">
            <div className="studentSelfProfilePopup__avatar">
               <ReactSVG
                  className="studentSelfProfilePopup__avatarIcon"
                  src={studentIcon}
               />
            </div>
            <p className="studentSelfProfilePopup__name">{fullName}</p>
            <p className="studentSelfProfilePopup__role">Student</p>
         </div>

         <div className="studentSelfProfilePopup__content">
            {loading ? (
               <p className="studentSelfProfilePopup__state">Se încarcă...</p>
            ) : (
               <div className="studentSelfProfilePopup__list">
                  <div className="studentSelfProfilePopup__row">
                     <span>Email</span>
                     <strong>{me?.email || "—"}</strong>
                  </div>
                  <div className="studentSelfProfilePopup__row">
                     <span>Telefon</span>
                     <strong>{me?.phone || "—"}</strong>
                  </div>
                  <div className="studentSelfProfilePopup__row">
                     <span>IDNP</span>
                     <strong>{idnp || "—"}</strong>
                  </div>
                  <div className="studentSelfProfilePopup__row">
                     <span>Documente medicale</span>
                     <strong>{presentedMedicalLabel}</strong>
                  </div>
                  <div className="studentSelfProfilePopup__row">
                     <span>Lucru individual</span>
                     <strong>{presentedIndividualLabel}</strong>
                  </div>
                  <div className="studentSelfProfilePopup__row">
                     <span>Absențe</span>
                     <strong>{numberOfAbsences}</strong>
                  </div>
               </div>
            )}

            {!!error && (
               <p className="studentSelfProfilePopup__error">{error}</p>
            )}
         </div>

         <div className="studentSelfProfilePopup__footer">
            <ul className=" studentSelfProfilePopup__settings settings">
               <DarkModeToggle />
            </ul>
         </div>
      </div>
   );
}
