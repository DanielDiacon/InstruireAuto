import React, { useState, useEffect, useContext, useRef } from "react";
import { ReactSVG } from "react-svg";
import DarkModeToggle from "../components/Header/DarkModeToggle";
import M3Link from "../components/UI/M3Link";

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

function SignPage() {
   const { setUser } = useContext(UserContext);

   const [mode, setMode] = useState("sign-in");

   // One toggle that controls ALL password fields (login, register, reset)
   const [showPasswords, setShowPasswords] = useState(false);
   const [resetEmail, setResetEmail] = useState("");
   const [resetLoading, setResetLoading] = useState(false);

   // Phone handling: lock "+373 " prefix and only allow 8 digits after
   const MD_PREFIX = "+373 ";
   const MAX_MD_DIGITS = 8; // Moldova numbers: 8 digits after +373

   const [registerForm, setRegisterForm] = useState({
      name: "",
      email: "",
      groupToken: "",
      phone: "", // store ONLY the local 8 digits here; UI renders with +373 prefix
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
            "success"
         );
         setMode("sign-in");
         setResetEmail("");
      } catch (err) {
         addMessage(
            err?.message ||
               "Nu am putut trimite cererea de resetare. Încearcă din nou.",
            "error"
         );
      } finally {
         setResetLoading(false);
      }
   };

   const handleRegisterChange = (e) => {
      const { name, value } = e.target;
      setRegisterForm((prev) => ({ ...prev, [name]: value }));
   };

   // Special handler for the phone field (keeps +373 locked and digits-only after)
   const handlePhoneChange = (e) => {
      let v = e.target.value || "";
      // Normalize any user attempts to change the prefix
      v = v.replace(/^\+?373\s?/, "");
      // Keep only digits and clamp to 8
      v = v.replace(/\D/g, "").slice(0, MAX_MD_DIGITS);
      setRegisterForm((prev) => ({ ...prev, phone: v }));
   };

   const handlePhoneKeyDown = (e) => {
      const el = e.target;
      const prefixLen = MD_PREFIX.length;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;

      // Prevent backspace/delete from touching the prefix
      if (
         (e.key === "Backspace" && start <= prefixLen && end <= prefixLen) ||
         (e.key === "Delete" && start < prefixLen)
      ) {
         e.preventDefault();
         // Keep caret right after prefix
         requestAnimationFrame(() => {
            try {
               el.setSelectionRange(prefixLen, prefixLen);
            } catch (_) {}
         });
      }
   };

   const handleRegisterSubmit = async (e) => {
      e.preventDefault();

      // ✅ blocare dacă nu e bifă
      if (!registerAccepted) {
         addMessage(
            "Trebuie să accepți Termenii și Condițiile pentru a te înregistra.",
            "warning"
         );
         return;
      }

      if (registerForm.password !== registerForm.confirmPassword) {
         addMessage("Parolele nu coincid.", "error");
         return;
      }

      if (registerForm.phone.length !== MAX_MD_DIGITS) {
         addMessage(
            "Introdu un număr de telefon moldovenesc valid (8 cifre după +373).",
            "warning"
         );
         return;
      }

      const payload = {
         email: registerForm.email,
         password: registerForm.password,
         firstName: registerForm.name.split(" ")[0],
         lastName: registerForm.name.split(" ")[1] || "",
         groupToken: registerForm.groupToken,
         phone: "+373" + registerForm.phone, // send with country code
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
            "error"
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
               "success"
            );
         }
      } catch (err) {
         addMessage(
            "Eroare la autentificare. Verifică datele și încearcă din nou.",
            "error"
         );
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

               <DarkModeToggle />
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
                           Creează-ți un cont nou completând informațiile de mai
                           jos.
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

                              {/* PHONE with locked +373 prefix */}
                              <div className="sign__input-wrapper">
                                 <input
                                    type="tel"
                                    placeholder="Nr. Telefon"
                                    className="sign__input sign__input--phone"
                                    name="phone"
                                    value={`${MD_PREFIX}${registerForm.phone}`}
                                    onChange={handlePhoneChange}
                                    onKeyDown={handlePhoneKeyDown}
                                    inputMode="numeric"
                                    maxLength={MD_PREFIX.length + MAX_MD_DIGITS}
                                    aria-label="Număr de telefon (+373 fix)"
                                    required
                                 />
                              </div>
                           </div>

                           <div className="sign__form-row">
                              <div className="sign__input-wrapper">
                                 <input
                                    type={showPasswords ? "text" : "password"}
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
                                    type={showPasswords ? "text" : "password"}
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
                           <div
                              className="sign__terms"
                           >
                              <label
                                 className="sign__checkbox"
                               
                              >
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
                                 1. Vei primi un email cu un link sau cod pentru
                                 resetare.
                              </p>
                              <p>
                                 2. Urmărește linkul pentru a seta o parolă nouă
                                 în pagina dedicată.
                              </p>
                              <p className="sign__info-hint">
                                 ** Verifică și folderul{" "}
                                 <strong>Spam/Promoții</strong> dacă nu găsești
                                 mesajul.
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
                                    {resetLoading ? "Se trimite..." : "Trimite"}
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
                        <M3Link type="accent" icon={arrowIcon} link="https://instruire-auto.md/">
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
   );
}

export default SignPage;
