import React, { useState, useEffect, useContext } from "react";
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
import { UserContext } from "../UserContext";
import { signin, fetchUserInfo, signup } from "../api/authService";

function SignPage() {
   const { setUser } = useContext(UserContext);

   const [mode, setMode] = useState("sign-in");

   const [showLoginPassword, setShowLoginPassword] = useState(false);
   const [showRegisterPassword, setShowRegisterPassword] = useState(false);
   const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] =
      useState(false);

   const [registerForm, setRegisterForm] = useState({
      name: "",
      email: "",
      groupToken: "",
      phone: "",
      password: "",
      confirmPassword: "",
   });

   const [loginForm, setLoginForm] = useState({
      email: "",
      password: "",
   });
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

   const handleRegisterChange = (e) => {
      const { name, value } = e.target;
      setRegisterForm((prev) => ({ ...prev, [name]: value }));
   };

   const handleRegisterSubmit = async (e) => {
      e.preventDefault();

      if (registerForm.password !== registerForm.confirmPassword) {
         alert("Parolele nu coincid.");
         return;
      }
      const payload = {
         email: registerForm.email,
         password: registerForm.password,
         firstName: registerForm.name.split(" ")[0],
         lastName: registerForm.name.split(" ")[1] || "",
         groupToken: registerForm.groupToken,
         phone: registerForm.phone,
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
         }
      } catch (err) {
         alert("Eroare la înregistrare. Încearcă din nou.");
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
         }
      } catch (err) {
         alert("Eroare la autentificare. Verifică datele și încearcă din nou.");
      }
   };

   return (
      <main className="main-sign">
         <div className="container">
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
                  <div className="sign__switcher">
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
                                 type={showLoginPassword ? "text" : "password"}
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
                                 onClick={() =>
                                    setShowLoginPassword((prev) => !prev)
                                 }
                              >
                                 <ReactSVG
                                    src={
                                       showLoginPassword
                                          ? eyeClosedIcon
                                          : eyeOpenIcon
                                    }
                                 />
                              </button>
                           </div>

                           <div className="sign__row-btns">
                              {/* Buton pentru a comuta la resetare parola */}
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
                              <input
                                 type="text"
                                 placeholder="Nr. Telefon"
                                 className="sign__input"
                                 name="phone"
                                 value={registerForm.phone}
                                 onChange={handleRegisterChange}
                                 required
                              />
                           </div>
                           <div className="sign__form-row">
                              <div className="sign__input-wrapper">
                                 <input
                                    type={
                                       showRegisterPassword
                                          ? "text"
                                          : "password"
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
                                    onClick={() =>
                                       setShowRegisterPassword((prev) => !prev)
                                    }
                                 >
                                    <ReactSVG
                                       src={
                                          showRegisterPassword
                                             ? eyeClosedIcon
                                             : eyeOpenIcon
                                       }
                                    />
                                 </button>
                              </div>

                              <div className="sign__input-wrapper">
                                 <input
                                    type={
                                       showRegisterConfirmPassword
                                          ? "text"
                                          : "password"
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
                                    onClick={() =>
                                       setShowRegisterConfirmPassword(
                                          (prev) => !prev
                                       )
                                    }
                                 >
                                    <ReactSVG
                                       src={
                                          showRegisterConfirmPassword
                                             ? eyeClosedIcon
                                             : eyeOpenIcon
                                       }
                                    />
                                 </button>
                              </div>
                           </div>

                           <button type="submit" className="sign__button">
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
                           Introdu codul primit pe email și noua ta parolă.
                        </p>
                        <form className="sign__form">
                           <input
                              type="text"
                              placeholder="Codul de resetare"
                              className="sign__input"
                              required
                           />
                           <input
                              type="password"
                              placeholder="Parolă nouă"
                              className="sign__input"
                              required
                           />
                           <input
                              type="password"
                              placeholder="Confirmă parola nouă"
                              className="sign__input"
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
                              <button type="submit" className="sign__button">
                                 <span>Trimite</span>
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
                        <M3Link type="accent" icon={arrowIcon} link="/">
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
