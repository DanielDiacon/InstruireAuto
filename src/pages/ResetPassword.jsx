import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ReactSVG } from "react-svg";

import DarkModeToggle from "../components/Header/DarkModeToggle";
import M3Link from "../components/UI/M3Link";

import arrowIcon from "../assets/svg/arrow.svg";
import addIcon from "../assets/svg/add.svg"; // doar ca fallback
import eyeClosedIcon from "../assets/svg/eye-off.svg";
import eyeOpenIcon from "../assets/svg/eye-open.svg";
import waveSegmentIcon from "../assets/svg/waveSegment.svg";
import waveSegmentEndIcon from "../assets/svg/waveSegmentEnd.svg";

import { resetPassword } from "../api/authService";
import AlertPills from "../components/Utils/AlertPills";

export default function ResetPassword() {
   const [searchParams] = useSearchParams();
   const navigate = useNavigate();

   const rawToken = searchParams.get("token") || "";
   const token = rawToken.replace(/ /g, "+");

   const [showPasswords, setShowPasswords] = useState(false);
   const [form, setForm] = useState({ password: "", confirm: "" });
   const [loading, setLoading] = useState(false);

   // pill messages (unul singur)
   const [messages, setMessages] = useState([]);
   const addMessage = (text, type = "info") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setMessages([{ id, type, text }]);
   };
   const clearMessages = () => setMessages([]);

   useEffect(() => {
      document.title = "Instruire Auto | Resetare Parolă";
   }, []);

   const handleChange = (e) => {
      const { name, value } = e.target;
      setForm((p) => ({ ...p, [name]: value }));
   };

   const handleSubmit = async (e) => {
      e.preventDefault();

      if (!form.password || !form.confirm) {
         addMessage("Completează ambele câmpuri.", "warning");
         return;
      }
      if (form.password !== form.confirm) {
         addMessage("Parolele nu coincid.", "error");
         return;
      }
      if (!token) {
         addMessage("Link invalid sau lipsă token.", "error");
         return;
      }
      if (form.password.length < 6) {
         addMessage("Parola trebuie să aibă cel puțin 6 caractere.", "warning");
         return;
      }
      if (
         !/[A-Z]/.test(form.password) ||
         !/[a-z]/.test(form.password) ||
         !/\d/.test(form.password)
      ) {
         addMessage(
            "Parola trebuie să conțină litere mari, mici și cifre.",
            "warning"
         );
         return;
      }
      setLoading(true);
      addMessage("Se salvează parola nouă…", "info");
      try {
         await resetPassword({
            token,
            newPassword: form.password,
            //confirmPassword: form.confirm, // 👈 trimitem și confirmarea
         });

         addMessage(
            "Parola a fost resetată cu succes. Te poți autentifica.",
            "success"
         );
         setTimeout(() => navigate("/", { replace: true }), 1200);
      } catch (err) {
         const raw = err?.message || "";
         const nice = /expired|expirat/i.test(raw)
            ? "Link-ul a expirat. Cere o nouă resetare."
            : /invalid|token/i.test(raw)
            ? "Token invalid. Cere o nouă resetare."
            : "Nu am putut reseta parola. Încearcă din nou.";
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
                     link="/"
                  >
                     <span>Acasă</span>
                  </M3Link>
               </div>

               <DarkModeToggle />

               <div className="sign__right">
                  <div className="sign__switcher --active">
                     <div className="sign__form-wrapper sign__form--active">
                        <h1 className="sign__title">Resetează parola</h1>
                        <p className="sign__subtitle">
                           Pentru a reseta parola introdu noua parolă și
                           confirmă.
                        </p>

                        <form className="sign__form" onSubmit={handleSubmit}>
                           {/* Parola */}
                           <div className="sign__input-wrapper">
                              <input
                                 type={showPasswords ? "text" : "password"}
                                 placeholder="Parolă nouă"
                                 className="sign__input"
                                 name="password"
                                 value={form.password}
                                 onChange={handleChange}
                                 autoComplete="new-password"
                                 required
                              />
                              <button
                                 type="button"
                                 className="sign__eye-btn"
                                 aria-label={
                                    showPasswords
                                       ? "Ascunde parolele"
                                       : "Arată parolele"
                                 }
                                 title={
                                    showPasswords
                                       ? "Ascunde parolele"
                                       : "Arată parolele"
                                 }
                                 onClick={() => setShowPasswords((p) => !p)}
                              >
                                 <ReactSVG
                                    src={
                                       showPasswords
                                          ? eyeClosedIcon
                                          : eyeOpenIcon
                                    }
                                 />
                              </button>
                           </div>

                           {/* Confirmare */}
                           <div className="sign__input-wrapper">
                              <input
                                 type={showPasswords ? "text" : "password"}
                                 placeholder="Confirmă parola nouă"
                                 className="sign__input"
                                 name="confirm"
                                 value={form.confirm}
                                 onChange={handleChange}
                                 autoComplete="new-password"
                                 required
                              />
                              <button
                                 type="button"
                                 className="sign__eye-btn"
                                 aria-label={
                                    showPasswords
                                       ? "Ascunde parolele"
                                       : "Arată parolele"
                                 }
                                 title={
                                    showPasswords
                                       ? "Ascunde parolele"
                                       : "Arată parolele"
                                 }
                                 onClick={() => setShowPasswords((p) => !p)}
                              >
                                 <ReactSVG
                                    src={
                                       showPasswords
                                          ? eyeClosedIcon
                                          : eyeOpenIcon
                                    }
                                 />
                              </button>
                           </div>

                           <div className="sign__row-btns">
                              <button
                                 type="submit"
                                 className="sign__button"
                                 disabled={loading}
                              >
                                 <span>
                                    {loading
                                       ? "Se salvează…"
                                       : "Resetează parola"}
                                 </span>
                                 <ReactSVG
                                    className="sign__button-icon sign__icon"
                                    src={arrowIcon}
                                 />
                              </button>
                           </div>
                        </form>
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
                        <M3Link type="accent" icon={arrowIcon} link="/">
                           <span>Acasă</span>
                        </M3Link>
                        <M3Link type="succes" icon={addIcon} link="/">
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
