import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ReactSVG } from "react-svg";

import DarkModeToggle from "../components/Header/DarkModeToggle";
import M3Link from "../components/Common/M3Link";
import AlertPills from "../components/Utils/AlertPills";

import { confirmReservationPresence } from "../api/notificationsService";

import arrowIcon from "../assets/svg/arrow.svg";
import addIcon from "../assets/svg/add.svg";
import waveSegmentIcon from "../assets/svg/waveSegment.svg";
import waveSegmentEndIcon from "../assets/svg/waveSegmentEnd.svg";

export default function ConfirmReservation() {
   const { token: rawToken } = useParams();
   const navigate = useNavigate();

   const token = useMemo(() => {
      try {
         // token este în path; totuși safe decode
         return decodeURIComponent(rawToken || "").replace(/ /g, "+");
      } catch {
         return (rawToken || "").replace(/ /g, "+");
      }
   }, [rawToken]);

   const [loading, setLoading] = useState(false);
   const [messages, setMessages] = useState([]);
   const addMessage = (text, type = "info") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setMessages([{ id, type, text }]); // păstrăm un singur pill
   };
   const clearMessages = () => setMessages([]);

   useEffect(() => {
      document.title = "Instruire Auto | Confirmare prezență";
   }, []);

   const handleConfirm = async () => {
      if (!token) {
         addMessage("Link invalid sau lipsă token.", "error");
         return;
      }
      setLoading(true);
      addMessage("Se confirmă prezența…", "info");
      try {
         const res = await confirmReservationPresence(token);

         // opțional: extrage detalii dacă backendul le întoarce
         const who =
            res?.studentName ||
            res?.student ||
            res?.user?.name ||
            res?.who ||
            null;
         const when = res?.startTime || res?.start || null;

         addMessage(
            `Prezența a fost confirmată${who ? ` pentru ${who}` : ""}${
               when ? ` (${new Date(when).toLocaleString("ro-RO")})` : ""
            }.`,
            "success"
         );
         // Mic redirect înapoi acasă
         setTimeout(() => navigate("/", { replace: true }), 1200);
      } catch (err) {
         const raw = err?.message || "";
         const nice = /expired|expirat/i.test(raw)
            ? "Link-ul de confirmare a expirat."
            : /invalid|token/i.test(raw)
            ? "Token invalid."
            : "Nu am putut confirma prezența. Încearcă din nou.";
         addMessage(nice, "error");
      } finally {
         setLoading(false);
      }
   };

   return (
      <main className="main-sign">
         <div className="container">
            <AlertPills messages={messages} onDismiss={clearMessages} />

            <div className="sign">
               <div className="sign__left">
                  <M3Link
                     className="sign__img-btn"
                     type="accent"
                     icon={arrowIcon}
                     link="https://instruire-auto.md/"
                  >
                     <span>Acasă</span>
                  </M3Link>
               </div>
               <ul className="header__settings settings ">
                  <DarkModeToggle />
               </ul>
               <div className="sign__right">
                  <div className="sign__switcher --active">
                     <div
                        className="sign__form-wrapper sign__form--active"
                        style={{
                           height: "80%",
                        }}
                     >
                        <h1 className="sign__title">Confirmă prezența</h1>
                        <p className="sign__subtitle">
                           Apasă butonul de mai jos pentru a confirma prezența
                           la rezervare.
                        </p>

                        <div
                           className="sign__form"
                           style={{
                              textAlign: "center",
                              height: "100%",
                              display: "flex",
                              alignContent: "center",
                              justifyContent: "center",
                           }}
                        >
                           <button
                              type="button"
                              className="sign__button"
                              onClick={handleConfirm}
                              disabled={loading}
                              aria-busy={loading}
                              style={{ marginInline: "auto" }}
                           >
                              <span>
                                 {loading
                                    ? "Se confirmă…"
                                    : "Confirmă prezența"}
                              </span>
                              <ReactSVG
                                 className="sign__button-icon sign__icon"
                                 src={arrowIcon}
                              />
                           </button>
                        </div>
                     </div>
                  </div>

                  {/* Footer identic */}
                  <div className="sign__footer">
                     <div className="sign__hr">
                        {[...Array(6)].map((_, i) => (
                           <ReactSVG
                              key={i}
                              className="sign__icon-wave"
                              src={waveSegmentIcon}
                           />
                        ))}
                        <ReactSVG
                           className="sign__icon-wave"
                           src={waveSegmentEndIcon}
                        />
                     </div>
                     <div className="sign__links">
                        <M3Link
                           type="accent"
                           icon={arrowIcon}
                           link="https://instruire-auto.md/"
                        >
                           <span>Acasă</span>
                        </M3Link>
                        <M3Link type="succes" icon={addIcon} link="/login">
                           <span>Autentificare</span>
                        </M3Link>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </main>
   );
}
