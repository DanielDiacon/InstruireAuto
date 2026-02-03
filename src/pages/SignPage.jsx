import React, { useState, useEffect, useContext, useRef } from "react";
import { ReactSVG } from "react-svg";
import DarkModeToggle from "../components/Header/DarkModeToggle";
import M3Link from "../components/Common/M3Link";

import addIcon from "../assets/svg/add.svg";
import loginIcon from "../assets/svg/login.svg";
import arrowIcon from "../assets/svg/arrow.svg";
import resetIcon from "../assets/svg/reset.svg";
import eyeClosedIcon from "../assets/svg/eye-off.svg";
import eyeOpenIcon from "../assets/svg/eye-open.svg";
import waveSegmentIcon from "../assets/svg/waveSegment.svg";
import waveSegmentEndIcon from "../assets/svg/waveSegmentEnd.svg";
import AlertPills from "../components/Utils/AlertPills";

import { UserContext } from "../UserContext";
import {
   signin,
   fetchUserInfo,
   signup,
   requestPasswordReset,
} from "../api/authService";
import FooterSign from "../components/FooterSign";

/* ===== Config telefon local ===== */
const MAX_PHONE_DIGITS = 9; // ex: 067123421 (9 cifre)
const MIN_PHONE_DIGITS = 8; // minim 8 cifre pentru a fi considerat valid

// Formatăm ca 067-123-421 pe măsură ce userul tastează
function formatLocalPhone(raw) {
   const digits = (raw || "").replace(/\D/g, "");
   if (!digits) return "";

   if (digits.length <= 3) {
      return digits;
   }
   if (digits.length <= 6) {
      return `${digits.slice(0, 3)}-${digits.slice(3)}`;
   }
   return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function SignPage() {
   const { setUser } = useContext(UserContext);

   const [mode, setMode] = useState("sign-in");

   // One toggle that controls ALL password fields (login, register, reset)
   const [showPasswords, setShowPasswords] = useState(false);
   const [resetEmail, setResetEmail] = useState("");
   const [resetLoading, setResetLoading] = useState(false);

   const [registerForm, setRegisterForm] = useState({
      name: "",
      email: "",
      groupToken: "",
      phone: "",
      password: "",
      confirmPassword: "",
   });

   // ✅ bifa Termeni & Condiții
   const [registerAccepted, setRegisterAccepted] = useState(false);

   const [loginForm, setLoginForm] = useState({
      email: "",
      password: "",
   });

   // pills
   const [messages, setMessages] = useState([]);
   const addMessage = (text, type = "info") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setMessages([{ id, type, text }]);
   };
   const clearMessages = () => setMessages([]);

   const redirectByRole = (role) => {
      switch (role) {
         case "USER":
            window.location.href = "/student";
            break;
         case "ADMIN":
            window.location.href = "/admin";
            break;
         case "MANAGER":
            window.location.href = "/manager";
            break;
         case "INSTRUCTOR":
            window.location.href = "/instructor";
            break;
         case "PROFESSOR":
            window.location.href = "/professor";
            break;
         default:
            window.location.href = "/";
      }
   };

   useEffect(() => {
      if (mode === "sign-in") {
         document.title = "Instruire Auto | Autentificare";
      } else if (mode === "sign-up") {
         document.title = "Instruire Auto | Înregistrare";
      } else if (mode === "reset-password") {
         document.title = "Instruire Auto | Resetare Parolă";
      }
   }, [mode]);

   const handleRequestReset = async (e) => {
      e.preventDefault();
      const email = resetEmail.trim();
      if (!email) {
         addMessage("Te rugăm să introduci adresa de email.", "warning");
         return;
      }

      addMessage("Se trimite cererea de resetare…", "info");
      setResetLoading(true);
      try {
         await requestPasswordReset(email);
         addMessage(
            "Dacă adresa există în sistem, vei primi un email cu instrucțiuni.",
            "success",
         );
         setMode("sign-in");
         setResetEmail("");
      } catch (err) {
         addMessage(
            err?.message ||
               "Nu am putut trimite cererea de resetare. Încearcă din nou.",
            "error",
         );
      } finally {
         setResetLoading(false);
      }
   };

   const handleRegisterChange = (e) => {
      const { name, value } = e.target;
      setRegisterForm((prev) => ({ ...prev, [name]: value }));
   };

   // Handler nou pentru telefon (doar cifre, max 9, afișare format 067-123-421)
   const handlePhoneChange = (e) => {
      const v = e.target.value || "";
      const digits = v.replace(/\D/g, "").slice(0, MAX_PHONE_DIGITS);
      setRegisterForm((prev) => ({ ...prev, phone: digits }));
   };

   const handleRegisterSubmit = async (e) => {
      e.preventDefault();

      // ✅ blocare dacă nu e bifă
      if (!registerAccepted) {
         addMessage(
            "Trebuie să accepți Termenii și Condițiile pentru a te înregistra.",
            "warning",
         );
         return;
      }

      if (registerForm.password !== registerForm.confirmPassword) {
         addMessage("Parolele nu coincid.", "error");
         return;
      }

      const phoneDigits = (registerForm.phone || "").replace(/\D/g, "");
      if (phoneDigits.length < MIN_PHONE_DIGITS) {
         addMessage(
            "Introdu un număr de telefon valid (minim 8 cifre).",
            "warning",
         );
         return;
      }

      const payload = {
         email: registerForm.email,
         password: registerForm.password,
         firstName: registerForm.name.split(" ")[0],
         lastName: registerForm.name.split(" ")[1] || "",
         groupToken: registerForm.groupToken,
         phone: phoneDigits,
      };

      try {
         const response = await signup(payload);
         if (response.access_token) {
            document.cookie = `access_token=${
               response.access_token
            }; path=/; max-age=${60 * 60 * 24 * 7}`;

            const userInfo = await fetchUserInfo();
            setUser(userInfo);
            redirectByRole(userInfo.role);
            addMessage("Cont creat cu succes. Te conectăm...", "success");
         }
      } catch (err) {
         addMessage(
            err?.message || "Eroare la înregistrare. Încearcă din nou.",
            "error",
         );
      }
   };

   const handleLoginChange = (e) => {
      const { name, value } = e.target;
      setLoginForm((prev) => ({ ...prev, [name]: value }));
   };

   const handleLoginSubmit = async (e) => {
      e.preventDefault();

      try {
         const response = await signin({
            email: loginForm.email,
            password: loginForm.password,
         });

         if (response.access_token) {
            document.cookie = `access_token=${
               response.access_token
            }; path=/; max-age=${60 * 60 * 24 * 7}`;

            const userInfo = await fetchUserInfo();
            setUser(userInfo);

            redirectByRole(userInfo.role);
            addMessage(
               "Autentificare reușită. Se încarcă dashboard-ul...",
               "success",
            );
         }
      } catch (err) {
         addMessage(
            "Eroare la autentificare. Verifică datele și încearcă din nou.",
            "error",
         );
      }
   };

   return (
      <>
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
                     <div
                        className={`sign__switcher ${
                           mode === "sign-in" ? "" : "active"
                        } ${mode === "reset-password" ? "reset" : ""}`}
                     >
                        {/* AUTENTIFICARE */}
                        <div
                           className={`sign__form-wrapper ${
                              mode === "sign-in"
                                 ? "sign__form--active"
                                 : "sign__form--leave"
                           }`}
                        >
                           <h1 className="sign__title">Autentificare</h1>
                           <p className="sign__subtitle">
                              Intră în contul tău completând datele de logare.
                           </p>
                           <form
                              className="sign__form"
                              onSubmit={handleLoginSubmit}
                           >
                              <input
                                 type="email"
                                 name="email"
                                 placeholder="Adresa de E-mail"
                                 className="sign__input"
                                 value={loginForm.email}
                                 onChange={handleLoginChange}
                                 required
                              />
                              <div className="sign__input-wrapper">
                                 <input
                                    type={showPasswords ? "text" : "password"}
                                    name="password"
                                    placeholder="Parola"
                                    className="sign__input"
                                    value={loginForm.password}
                                    onChange={handleLoginChange}
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
                                    onClick={() =>
                                       setShowPasswords((prev) => !prev)
                                    }
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
                                    type="button"
                                    className="sign__link-button"
                                    onClick={() => setMode("reset-password")}
                                 >
                                    <ReactSVG
                                       src={resetIcon}
                                       className="sign__icon-inline"
                                    />
                                    <span>Resetează parola</span>
                                 </button>

                                 <button type="submit" className="sign__button">
                                    <span>Log in</span>
                                    <ReactSVG
                                       className="sign__button-icon sign__icon"
                                       src={arrowIcon}
                                    />
                                 </button>
                              </div>
                           </form>
                        </div>

                        {/* ÎNREGISTRARE */}
                        <div
                           className={`sign__form-wrapper ${
                              mode === "sign-up"
                                 ? "sign__form--active"
                                 : "sign__form--leave"
                           }`}
                        >
                           <h1 className="sign__title">Înregistrare</h1>
                           <p className="sign__subtitle">
                              Creează-ți un cont nou completând informațiile de
                              mai jos.
                           </p>
                           <form
                              className="sign__form"
                              onSubmit={handleRegisterSubmit}
                           >
                              <div className="sign__form-row">
                                 <input
                                    type="text"
                                    placeholder="Nume Prenume"
                                    className="sign__input"
                                    name="name"
                                    value={registerForm.name}
                                    onChange={handleRegisterChange}
                                    required
                                 />
                                 <input
                                    type="email"
                                    placeholder="Adresă E-mail"
                                    className="sign__input"
                                    name="email"
                                    value={registerForm.email}
                                    onChange={handleRegisterChange}
                                    required
                                 />
                              </div>

                              <div className="sign__form-row">
                                 <input
                                    type="text"
                                    placeholder="Cheie Unică"
                                    className="sign__input"
                                    name="groupToken"
                                    value={registerForm.groupToken}
                                    onChange={handleRegisterChange}
                                    required
                                 />

                                 <div className="sign__input-wrapper">
                                    <input
                                       type="tel"
                                       placeholder="067-123-421"
                                       className="sign__input sign__input--phone"
                                       name="phone"
                                       value={formatLocalPhone(
                                          registerForm.phone,
                                       )}
                                       onChange={handlePhoneChange}
                                       inputMode="numeric"
                                       maxLength={13} //
                                       aria-label="Număr de telefon (minim 8 cifre)"
                                       required
                                    />
                                 </div>
                              </div>

                              <div className="sign__form-row">
                                 <div className="sign__input-wrapper">
                                    <input
                                       type={
                                          showPasswords ? "text" : "password"
                                       }
                                       placeholder="Parolă"
                                       className="sign__input"
                                       name="password"
                                       value={registerForm.password}
                                       onChange={handleRegisterChange}
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
                                       onClick={() =>
                                          setShowPasswords((prev) => !prev)
                                       }
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

                                 <div className="sign__input-wrapper">
                                    <input
                                       type={
                                          showPasswords ? "text" : "password"
                                       }
                                       placeholder="Confirmă Parola"
                                       className="sign__input"
                                       name="confirmPassword"
                                       value={registerForm.confirmPassword}
                                       onChange={handleRegisterChange}
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
                                       onClick={() =>
                                          setShowPasswords((prev) => !prev)
                                       }
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
                              </div>

                              {/* ✅ Termeni și Condiții (obligatoriu) */}
                              <div className="sign__terms">
                                 <label className="sign__checkbox">
                                    <input
                                       type="checkbox"
                                       checked={registerAccepted}
                                       onChange={(e) =>
                                          setRegisterAccepted(e.target.checked)
                                       }
                                       required
                                       aria-required="true"
                                       aria-label="Accept termenii și condițiile"
                                    />
                                    <span style={{ lineHeight: 1.3 }}>
                                       Sunt de acord cu{" "}
                                       <a
                                          href="/termeni"
                                          target="_blank"
                                          rel="noopener noreferrer"
                                       >
                                          Termenii și Condițiile
                                       </a>{" "}
                                       și{" "}
                                       <a
                                          href="/confidentialitate"
                                          target="_blank"
                                          rel="noopener noreferrer"
                                       >
                                          Politica de confidențialitate
                                       </a>
                                       .
                                    </span>
                                 </label>
                              </div>

                              <button
                                 type="submit"
                                 className="sign__button"
                                 disabled={!registerAccepted}
                                 aria-disabled={!registerAccepted}
                                 title={
                                    !registerAccepted
                                       ? "Bifează Termenii și Condițiile pentru a continua"
                                       : "Înregistrează-te"
                                 }
                              >
                                 <span>Înregistrează-te</span>
                                 <ReactSVG
                                    className="sign__button-icon sign__icon"
                                    src={addIcon}
                                 />
                              </button>
                           </form>
                        </div>

                        {/* RESETARE PAROLĂ */}
                        <div
                           className={`sign__form-wrapper ${
                              mode === "reset-password"
                                 ? "sign__form--active"
                                 : "sign__form--leave"
                           }`}
                        >
                           <h1 className="sign__title">Resetare Parolă</h1>
                           <p className="sign__subtitle">
                              Introdu adresa ta de email și îți vom trimite
                              instrucțiunile de resetare.
                           </p>

                           <form
                              className="sign__form"
                              onSubmit={handleRequestReset}
                           >
                              <div
                                 className="sign__info-box"
                                 role="note"
                                 aria-live="polite"
                              >
                                 <p>
                                    1. Vei primi un email cu un link sau cod
                                    pentru resetare.
                                 </p>
                                 <p>
                                    2. Urmărește linkul pentru a seta o parolă
                                    nouă în pagina dedicată.
                                 </p>
                                 <p className="sign__info-hint">
                                    ** Verifică și folderul{" "}
                                    <strong>Spam/Promoții</strong> dacă nu
                                    găsești mesajul.
                                 </p>
                              </div>
                              <input
                                 type="email"
                                 placeholder="Adresa de E-mail"
                                 className="sign__input"
                                 value={resetEmail}
                                 onChange={(e) => setResetEmail(e.target.value)}
                                 required
                              />
                              <div className="sign__row-btns">
                                 <button
                                    type="button"
                                    className="sign__link-button arrow"
                                    onClick={() => setMode("sign-in")}
                                 >
                                    <ReactSVG
                                       src={arrowIcon}
                                       className="sign__icon-inline"
                                    />
                                    <span>Autentificare</span>
                                 </button>

                                 <button
                                    type="submit"
                                    className="sign__button"
                                    disabled={resetLoading}
                                 >
                                    <span>
                                       {resetLoading
                                          ? "Se trimite..."
                                          : "Trimite"}
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

                     {/* Footer */}
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
                           {mode === "sign-in" ? (
                              <M3Link
                                 type="succes"
                                 icon={addIcon}
                                 onClick={(e) => {
                                    e.preventDefault();
                                    setMode("sign-up");
                                 }}
                              >
                                 <span>Creare Cont</span>
                              </M3Link>
                           ) : (
                              <M3Link
                                 type="succes"
                                 icon={loginIcon}
                                 onClick={(e) => {
                                    e.preventDefault();
                                    setMode("sign-in");
                                 }}
                              >
                                 <span>Autentificare</span>
                              </M3Link>
                           )}
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         </main>
         <FooterSign />
      </>
   );
}

export default SignPage;
