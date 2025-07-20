import React, { useState, useEffect } from "react";
import { ReactSVG } from "react-svg";
import DarkModeToggle from "../components/Header/DarkModeToggle";
import M3Link from "../components/UI/M3Link";

import addIcon from "../assets/svg/add.svg";
import loginIcon from "../assets/svg/login.svg";
import arrowIcon from "../assets/svg/arrow.svg";
import resetIcon from "../assets/svg/reset.svg";
import waveSegmentIcon from "../assets/svg/waveSegment.svg";
import waveSegmentEndIcon from "../assets/svg/waveSegmentEnd.svg";

function SignPage() {
   // mod poate fi: "sign-in", "sign-up" sau "reset-password"
   const [mode, setMode] = useState("sign-in");

   useEffect(() => {
      if (mode === "sign-in") {
         document.title = "Instruire Auto | Autentificare";
      } else if (mode === "sign-up") {
         document.title = "Instruire Auto | Înregistrare";
      } else if (mode === "reset-password") {
         document.title = "Instruire Auto | Resetare Parolă";
      }
   }, [mode]);

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
                        <form className="sign__form">
                           <input
                              type="email"
                              placeholder="Adresa de E-mail"
                              className="sign__input"
                           />
                           <input
                              type="password"
                              placeholder="Parola"
                              className="sign__input"
                           />
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
                        <form className="sign__form">
                           <div className="sign__form-row">
                              <input
                                 type="text"
                                 placeholder="Nume Prenume"
                                 className="sign__input"
                              />
                              <input
                                 type="email"
                                 placeholder="Adresă E-mail"
                                 className="sign__input"
                                 required
                              />
                           </div>
                           <input
                              type="text"
                              placeholder="Cheie Unică"
                              className="sign__input"
                              required
                           />
                           <div className="sign__form-row">
                              <input
                                 type="password"
                                 placeholder="Parolă"
                                 className="sign__input"
                                 required
                              />
                              <input
                                 type="password"
                                 placeholder="Confirmă Parola"
                                 className="sign__input"
                                 required
                              />
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
