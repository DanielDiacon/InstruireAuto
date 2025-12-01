// src/pages/EnrollForm.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ReactSVG } from "react-svg";
import DarkModeToggle from "../components/Header/DarkModeToggle";
import M3Link from "../components/UI/M3Link";
import AlertPills from "../components/Utils/AlertPills";
import { enrollStudent } from "../api/authService";

import addIcon from "../assets/svg/add.svg";
import arrowIcon from "../assets/svg/arrow.svg";
import resetIcon from "../assets/svg/reset.svg";
import waveSegmentIcon from "../assets/svg/waveSegment.svg";
import waveSegmentEndIcon from "../assets/svg/waveSegmentEnd.svg";

const LS_KEY = "enroll_course_draft_v1";
const digits = (s = "") => String(s).replace(/\D+/g, "");
const clampLen = (s, n) => String(s || "").slice(0, n);

// "YYYY-MM-DD" -> "DD.MM.YYYY"
const toMDDate = (iso) => {
   if (!iso) return "";
   const [y, m, d] = String(iso).split("-");
   if (!y || !m || !d) return "";
   return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
};

// 8 cifre -> "0XXXXXXXX"; 9 cifre (deja local cu 0) -> cum e
const toLocalPhone = (raw) => {
   const d = digits(raw);
   if (!d) return "";
   if (d.length === 8) return `0${d}`;
   return d.length === 9 ? d : raw.trim();
};

const initialForm = {
   // Identitate
   firstName: "",
   lastName: "",
   citizenship: "Moldova",
   birthDate: "",
   sex: "M",
   idnp: "",
   // Contact
   email: "",
   phone: "",
   contactPerson: "",
   // Domiciliu
   domicile: { sector: "", locality: "", street: "", nr: "", ap: "" },
   // Act identitate
   idDoc: { serie: "", number: "", issuedBy: "", issueDate: "" },
   // Preferințe curs
   gearbox: "MECANICĂ",
   source: "",
   // Consimțăminte
   agreeTerms: false,
   agreeGDPR: false,
};

export default function EnrollForm() {
   const [form, setForm] = useState(initialForm);
   const [messages, setMessages] = useState([]);
   const [step, setStep] = useState(1); // 1..3
   const [loading, setLoading] = useState(false);

   const addMessage = (text, type = "info") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setMessages([{ id, type, text }]);
   };
   const clearMessages = () => setMessages([]);

   // load draft
   const saveTimer = useRef(null);
   useEffect(() => {
      try {
         const raw = localStorage.getItem(LS_KEY);
         if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object")
               setForm({ ...initialForm, ...parsed });
         }
      } catch {}
   }, []);

   // autosave
   useEffect(() => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
         try {
            localStorage.setItem(LS_KEY, JSON.stringify(form));
         } catch {}
      }, 300);
      return () => clearTimeout(saveTimer.current);
   }, [form]);

   // setters
   const setField = (name, val) => setForm((p) => ({ ...p, [name]: val }));
   const setDomicile = (name, val) =>
      setForm((p) => ({ ...p, domicile: { ...p.domicile, [name]: val } }));
   const setIdDoc = (name, val) =>
      setForm((p) => ({ ...p, idDoc: { ...p.idDoc, [name]: val } }));

   // ===== numeric-only helpers (max 9) =====
   const clampDigits = (s, max = 9) => clampLen(digits(s), max);

   const numericInputProps = (field, max = 9) => ({
      value: form[field],
      onChange: (e) => setField(field, clampDigits(e.target.value, max)),
      onBeforeInput: (e) => {
         if (e.data && /\D/.test(e.data)) e.preventDefault();
         const v = e.currentTarget.value ?? "";
         if (digits(v).length >= max && e.inputType?.startsWith("insert")) {
            e.preventDefault();
         }
      },
      onPaste: (e) => {
         e.preventDefault();
         const txt =
            (e.clipboardData || window.clipboardData)?.getData("text") || "";
         setField(field, clampDigits(txt, max));
      },
      inputMode: "numeric",
      pattern: "\\d*",
      maxLength: max,
   });

   // idnp 13
   const handleIdnpChange = (e) =>
      setField("idnp", clampLen(digits(e.target.value), 13));

   // deschide calendarul la click/focus pe întreg inputul
   // înlocuiește openDatePicker cu:
   const tryOpenPicker = (el) => {
      if (!el) return;
      // dă focus întâi, apoi încearcă pickerul (cel mai stabil pe iOS)
      el.focus();
      // rulează în următorul frame ca să nu oprească focusul
      requestAnimationFrame(() => {
         if (typeof el.showPicker === "function") {
            try {
               el.showPicker();
            } catch {}
         }
      });
   };

   // domiciliu (text pt docx – dacă ai nevoie)
   const formatDomiciliu = useMemo(() => {
      const d = form.domicile;
      const parts = [];
      if (d.sector) parts.push(d.sector);
      if (d.locality) parts.push(d.locality);
      if (d.street) parts.push(`str. ${d.street}`);
      if (d.nr) parts.push(`nr. ${d.nr}`);
      if (d.ap) parts.push(`ap. ${d.ap}`);
      return parts.join(", ");
   }, [form.domicile]);

   // validare pe pași
   const validateStep = (s) => {
      if (s === 1) {
         if (!form.lastName || !form.firstName)
            return "Completează Nume și Prenume.";
         if (!form.citizenship) return "Completează Cetățenia.";
         if (!form.birthDate) return "Completează Data nașterii.";
         if (form.idnp.length !== 13)
            return "IDNP trebuie să conțină 13 cifre.";
         if (!form.email) return "Completează Email.";
         const len = digits(form.phone).length;
         if (len < 8)
            return "Introduceți un număr de telefon valid (minim 8 cifre).";
      }
      if (s === 2) {
         if (
            !form.domicile.sector ||
            !form.domicile.locality ||
            !form.domicile.street
         )
            return "Completează Raion/Sector, Localitate și Stradă.";
      }
      if (s === 3) {
         if (!form.agreeTerms || !form.agreeGDPR)
            return "Trebuie să accepți Termenii & GDPR.";
      }
      return null;
   };

   const goNext = () => {
      const err = validateStep(step);
      if (err) return addMessage(err, "warning");
      setStep((s) => Math.min(3, s + 1));
   };
   const goPrev = () => setStep((s) => Math.max(1, s - 1));

   const jumpTo = (target) => {
      if (target < 1 || target > 3) return;
      if (target <= step) return setStep(target);
      for (let s = step; s < target; s++) {
         const err = validateStep(s);
         if (err) return addMessage(err, "warning");
      }
      setStep(target);
   };

   // mapare form -> payload backend
   const buildEnrollPayload = (f) => ({
      nume: f.lastName?.trim() || "",
      prenume: f.firstName?.trim() || "",
      cetatenia: f.citizenship?.trim() || "Republica Moldova",
      email: f.email?.trim() || "",
      raion: f.domicile.sector?.trim() || "",
      localitate: f.domicile.locality?.trim() || "",
      strada: f.domicile.street?.trim() || "",
      numar: f.domicile.nr?.trim() || "",
      apartament: f.domicile.ap?.trim() || "",
      serieActIdentitate: f.idDoc.serie?.trim() || "",
      numarActIdentitate: f.idDoc.number?.trim() || "",
      eliberatDe: f.idDoc.issuedBy?.trim() || "",
      dataEliberare: toMDDate(f.idDoc.issueDate),
      dataNasterii: toMDDate(f.birthDate),
      sex: f.sex === "F" ? "F" : "M",
      idnp: f.idnp?.trim() || "",
      telefon: toLocalPhone(f.phone),
      telefonContact: toLocalPhone(f.contactPerson),
      cutie: f.gearbox === "AUTOMATĂ" ? "AUTOMATĂ" : "MECANICĂ",
      deUndeAflat: f.source?.trim() || "",
   });

   // submit
   const handleSubmit = async (e) => {
      e.preventDefault();
      const err = validateStep(3);
      if (err) return addMessage(err, "warning");

      try {
         setLoading(true);
         addMessage(
            "Se trimit datele pentru generarea contractelor...",
            "info"
         );
         const payload = buildEnrollPayload(form);
         await enrollStudent(payload);

         addMessage(
            "Gata! Cererea de înscriere și contractul au fost generate și expediate pe email.",
            "success"
         );

         try {
            localStorage.removeItem(LS_KEY);
         } catch {}
         setForm(initialForm);
         setStep(1);
      } catch (e) {
         addMessage(
            `Nu am putut genera contractele: ${
               e?.message || "eroare necunoscută"
            }`,
            "error"
         );
      } finally {
         setLoading(false);
      }
   };

   useEffect(() => {
      document.title = `Instruire Auto | Înscriere — Etapa ${step}/3`;
   }, [step]);

   const subtitleByStep =
      step === 1
         ? "Categoria B — Date personale"
         : step === 2
         ? "Categoria B — Domiciliu & Preferințe"
         : "Categoria B — Acorduri";
   // după useEffect(...), înainte de const subtitleByStep =
   const canSubmit = form.agreeTerms && form.agreeGDPR && !loading;

   return (
      <main className="main-sign">
         <div className="container">
            <AlertPills messages={messages} onDismiss={clearMessages} />
            <div className="sign">
               {/* stânga */}
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

               {/* dreapta */}
               <div className="sign__right">
                  <h1 className="sign__title">Înscriere la curs</h1>
                  <p className="sign__subtitle">{subtitleByStep}</p>

                  {/* === STEPPER SUS === */}
                  <div
                     className="sign__steps-wrapper"
                     role="toolbar"
                     aria-label="Etape înscriere"
                  >
                     <div className="sign__step-buttons">
                        {[1, 2, 3].map((n) => {
                           const btnClass =
                              "sign__step-button " +
                              (step > n
                                 ? "is-done"
                                 : step === n
                                 ? "is-current"
                                 : "");
                           const connClass =
                              "sign__step-connector" +
                              (step === n ? " is-active" : "");
                           return (
                              <React.Fragment key={n}>
                                 <button
                                    type="button"
                                    className={btnClass}
                                    onClick={() => jumpTo(n)}
                                    aria-current={
                                       step === n ? "step" : undefined
                                    }
                                    aria-label={`Etapa ${n}`}
                                    title={`Etapa ${n}`}
                                 >
                                    {n}
                                 </button>
                                 {n < 3 && (
                                    <span className={connClass} aria-hidden />
                                 )}
                              </React.Fragment>
                           );
                        })}
                     </div>
                  </div>

                  {/* === SWITCHER === */}
                  <div className={`sign__switcher etapa${step}`}>
                     {/* === ETAPA 1 === */}
                     <div
                        className={`sign__form-wrapper ${
                           step === 1
                              ? "sign__form--active"
                              : "sign__form--leave"
                        }`}
                     >
                        <form
                           className="sign__form"
                           onSubmit={(e) => {
                              e.preventDefault();
                              goNext();
                           }}
                        >
                           {/* Nume / Prenume */}
                           <div className="sign__form-row">
                              <div className="sign__field">
                                 <label
                                    htmlFor="lastName"
                                    className="sign__label"
                                 >
                                    Nume
                                 </label>
                                 <input
                                    id="lastName"
                                    type="text"
                                    className="sign__input enroll"
                                    placeholder="Popescu"
                                    value={form.lastName}
                                    onChange={(e) =>
                                       setField("lastName", e.target.value)
                                    }
                                    required
                                 />
                              </div>
                              <div className="sign__field">
                                 <label
                                    htmlFor="firstName"
                                    className="sign__label"
                                 >
                                    Prenume
                                 </label>
                                 <input
                                    id="firstName"
                                    type="text"
                                    className="sign__input enroll"
                                    placeholder="Ion"
                                    value={form.firstName}
                                    onChange={(e) =>
                                       setField("firstName", e.target.value)
                                    }
                                    required
                                 />
                              </div>
                           </div>

                           {/* Cetățenia / Data nașterii */}
                           <div className="sign__form-row">
                              <div className="sign__field">
                                 <label
                                    htmlFor="citizenship"
                                    className="sign__label"
                                 >
                                    Cetățenia
                                 </label>
                                 <input
                                    id="citizenship"
                                    type="text"
                                    className="sign__input enroll"
                                    placeholder="Republica Moldova"
                                    value={form.citizenship}
                                    onChange={(e) =>
                                       setField("citizenship", e.target.value)
                                    }
                                    required
                                 />
                              </div>
                              <div className="sign__field">
                                 <label
                                    htmlFor="birthDate"
                                    className="sign__label"
                                 >
                                    Data nașterii
                                 </label>
                                 <input
                                    id="birthDate"
                                    type="date"
                                    className="sign__input enroll"
                                    placeholder="1995-05-10"
                                    value={form.birthDate}
                                    onChange={(e) =>
                                       setField("birthDate", e.target.value)
                                    }
                                    onFocus={(e) =>
                                       tryOpenPicker(e.currentTarget)
                                    }
                                    onClick={(e) =>
                                       tryOpenPicker(e.currentTarget)
                                    }
                                    required
                                 />
                              </div>
                           </div>

                           {/* Sex / IDNP */}
                           <div className="sign__form-row">
                              <div className="sign__field">
                                 <label htmlFor="sex" className="sign__label">
                                    Sex
                                 </label>
                                 <select
                                    id="sex"
                                    className="sign__input enroll"
                                    value={form.sex}
                                    onChange={(e) =>
                                       setField("sex", e.target.value)
                                    }
                                    required
                                 >
                                    <option value="M">Masculin</option>
                                    <option value="F">Feminin</option>
                                 </select>
                              </div>
                              <div className="sign__field">
                                 <label htmlFor="idnp" className="sign__label">
                                    IDNP
                                 </label>
                                 <input
                                    id="idnp"
                                    type="text"
                                    className="sign__input enroll"
                                    placeholder="1234567890123"
                                    value={form.idnp}
                                    onChange={handleIdnpChange}
                                    inputMode="numeric"
                                    maxLength={13}
                                    required
                                 />
                              </div>
                           </div>

                           {/* Email / Telefon */}
                           <div className="sign__form-row">
                              <div className="sign__field">
                                 <label htmlFor="email" className="sign__label">
                                    Email
                                 </label>
                                 <input
                                    id="email"
                                    type="email"
                                    className="sign__input enroll"
                                    placeholder="ion.popescu@example.com"
                                    value={form.email}
                                    onChange={(e) =>
                                       setField("email", e.target.value)
                                    }
                                    required
                                 />
                              </div>
                              <div className="sign__field sign__input-wrapper">
                                 <label htmlFor="phone" className="sign__label">
                                    Telefon
                                 </label>
                                 <input
                                    id="phone"
                                    type="tel"
                                    className="sign__input enroll sign__input--phone"
                                    placeholder="069123456"
                                    {...numericInputProps("phone", 9)}
                                    aria-label="Număr de telefon"
                                    required
                                 />
                              </div>
                           </div>

                           {/* acțiuni */}
                           <div className="sign__row-btns">
                              <button
                                 type="button"
                                 className="sign__link-button"
                                 onClick={() => {
                                    try {
                                       localStorage.removeItem(LS_KEY);
                                    } catch {}
                                    setForm(initialForm);
                                    addMessage(
                                       "Draftul a fost curățat.",
                                       "info"
                                    );
                                 }}
                                 disabled={loading}
                              >
                                 <ReactSVG
                                    src={resetIcon}
                                    className="sign__icon-inline"
                                 />
                                 <span>Curăță draft</span>
                              </button>
                              <button
                                 type="submit"
                                 className="sign__button"
                                 disabled={loading}
                              >
                                 <span>{loading ? "..." : "Înainte"}</span>
                                 <ReactSVG
                                    className="sign__button-icon sign__icon"
                                    src={arrowIcon}
                                 />
                              </button>
                           </div>
                        </form>
                     </div>

                     {/* === ETAPA 2 === */}
                     <div
                        className={`sign__form-wrapper ${
                           step === 2
                              ? "sign__form--active"
                              : "sign__form--leave"
                        }`}
                     >
                        <form
                           className="sign__form"
                           onSubmit={(e) => {
                              e.preventDefault();
                              goNext();
                           }}
                        >
                           {/* Cutie / Telefon persoană de contact */}
                           <div className="sign__form-row">
                              <div className="sign__field">
                                 <label
                                    htmlFor="gearbox"
                                    className="sign__label"
                                 >
                                    Tip cutie
                                 </label>
                                 <select
                                    id="gearbox"
                                    className="sign__input enroll"
                                    value={form.gearbox}
                                    onChange={(e) =>
                                       setField("gearbox", e.target.value)
                                    }
                                 >
                                    <option value="MECANICĂ">
                                       Cutie mecanică
                                    </option>
                                    <option value="AUTOMATĂ">
                                       Cutie automată
                                    </option>
                                 </select>
                              </div>
                              <div className="sign__field">
                                 <label
                                    htmlFor="contactPerson"
                                    className="sign__label"
                                 >
                                    Telefon persoană de contact
                                 </label>
                                 <input
                                    id="contactPerson"
                                    type="tel"
                                    className="sign__input enroll"
                                    placeholder="069654321"
                                    {...numericInputProps("contactPerson", 9)}
                                 />
                              </div>
                           </div>

                           {/* Domiciliu 1 */}
                           <div className="sign__form-row">
                              <div className="sign__field">
                                 <label
                                    htmlFor="sector"
                                    className="sign__label"
                                 >
                                    Raion/Sector
                                 </label>
                                 <input
                                    id="sector"
                                    type="text"
                                    className="sign__input enroll"
                                    placeholder="Centru"
                                    value={form.domicile.sector}
                                    onChange={(e) =>
                                       setDomicile("sector", e.target.value)
                                    }
                                    required
                                 />
                              </div>
                              <div className="sign__field">
                                 <label
                                    htmlFor="locality"
                                    className="sign__label"
                                 >
                                    Localitate
                                 </label>
                                 <input
                                    id="locality"
                                    type="text"
                                    className="sign__input enroll"
                                    placeholder="Chișinău"
                                    value={form.domicile.locality}
                                    onChange={(e) =>
                                       setDomicile("locality", e.target.value)
                                    }
                                    required
                                 />
                              </div>
                           </div>

                           {/* Domiciliu 2 */}
                           <div className="sign__form-row">
                              <div className="sign__field">
                                 <label
                                    htmlFor="street"
                                    className="sign__label"
                                 >
                                    Stradă
                                 </label>
                                 <input
                                    id="street"
                                    type="text"
                                    className="sign__input enroll"
                                    placeholder="Ștefan cel Mare"
                                    value={form.domicile.street}
                                    onChange={(e) =>
                                       setDomicile("street", e.target.value)
                                    }
                                    required
                                 />
                              </div>
                              <div className="sign__field">
                                 <label htmlFor="nr" className="sign__label">
                                    Nr.
                                 </label>
                                 <input
                                    id="nr"
                                    type="text"
                                    className="sign__input enroll"
                                    placeholder="123"
                                    value={form.domicile.nr}
                                    onChange={(e) =>
                                       setDomicile("nr", e.target.value)
                                    }
                                 />
                              </div>
                           </div>

                           {/* Domiciliu 3 */}
                           <div className="sign__form-row">
                              <div className="sign__field">
                                 <label htmlFor="ap" className="sign__label">
                                    Ap.
                                 </label>
                                 <input
                                    id="ap"
                                    type="text"
                                    className="sign__input enroll"
                                    placeholder="45"
                                    value={form.domicile.ap}
                                    onChange={(e) =>
                                       setDomicile("ap", e.target.value)
                                    }
                                 />
                              </div>
                              <div className="sign__field">
                                 <label
                                    htmlFor="source"
                                    className="sign__label"
                                 >
                                    De unde ați aflat?
                                 </label>
                                 <input
                                    id="source"
                                    type="text"
                                    className="sign__input enroll"
                                    placeholder="Google / Instagram / recomandare"
                                    value={form.source}
                                    onChange={(e) =>
                                       setField("source", e.target.value)
                                    }
                                 />
                              </div>
                           </div>

                           {/* acțiuni */}
                           <div className="sign__row-btns">
                              <button
                                 type="button"
                                 className="sign__link-button arrow"
                                 onClick={goPrev}
                                 disabled={loading}
                              >
                                 <ReactSVG
                                    src={arrowIcon}
                                    className="sign__icon-inline"
                                 />
                                 <span>Înapoi</span>
                              </button>
                              <button
                                 type="submit"
                                 className="sign__button"
                                 disabled={loading}
                              >
                                 <span>{loading ? "..." : "Înainte"}</span>
                                 <ReactSVG
                                    className="sign__button-icon sign__icon"
                                    src={arrowIcon}
                                 />
                              </button>
                           </div>
                        </form>
                     </div>

                     {/* === ETAPA 3 === */}
                     <div
                        className={`sign__form-wrapper ${
                           step === 3
                              ? "sign__form--active"
                              : "sign__form--leave"
                        }`}
                     >
                        <form className="sign__form" onSubmit={handleSubmit}>
                           {/* Act (opțional) */}
                           <div className="sign__form-row">
                              <div className="sign__field">
                                 <label htmlFor="serie" className="sign__label">
                                    Seria act
                                 </label>
                                 <input
                                    id="serie"
                                    type="text"
                                    className="sign__input enroll"
                                    placeholder="A"
                                    value={form.idDoc.serie}
                                    onChange={(e) =>
                                       setIdDoc("serie", e.target.value)
                                    }
                                 />
                              </div>
                              <div className="sign__field">
                                 <label
                                    htmlFor="number"
                                    className="sign__label"
                                 >
                                    Număr act
                                 </label>
                                 <input
                                    id="number"
                                    type="text"
                                    className="sign__input enroll"
                                    placeholder="1234567"
                                    value={form.idDoc.number}
                                    onChange={(e) =>
                                       setIdDoc("number", e.target.value)
                                    }
                                 />
                              </div>
                           </div>
                           <div className="sign__form-row">
                              <div className="sign__field">
                                 <label
                                    htmlFor="issuedBy"
                                    className="sign__label"
                                 >
                                    Eliberat de
                                 </label>
                                 <input
                                    id="issuedBy"
                                    type="text"
                                    className="sign__input enroll"
                                    placeholder="ASP"
                                    value={form.idDoc.issuedBy}
                                    onChange={(e) =>
                                       setIdDoc("issuedBy", e.target.value)
                                    }
                                 />
                              </div>
                              <div className="sign__field">
                                 <label
                                    htmlFor="issueDate"
                                    className="sign__label"
                                 >
                                    Data eliberării
                                 </label>
                                 <input
                                    id="issueDate"
                                    type="date"
                                    className="sign__input enroll"
                                    placeholder="2020-01-15"
                                    value={form.idDoc.issueDate}
                                    onChange={(e) =>
                                       setIdDoc("issueDate", e.target.value)
                                    }
                                    onFocus={(e) =>
                                       tryOpenPicker(e.currentTarget)
                                    }
                                    onClick={(e) =>
                                       tryOpenPicker(e.currentTarget)
                                    }
                                 />
                              </div>
                           </div>

                           {/* Consimțăminte */}
                           <div className="sign__terms">
                              <label className="sign__checkbox">
                                 <input
                                    type="checkbox"
                                    checked={form.agreeTerms}
                                    onChange={(e) =>
                                       setField("agreeTerms", e.target.checked)
                                    }
                                    required
                                    aria-required="true"
                                    aria-label="Accept Termenii și Condițiile"
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
                              <label className="sign__checkbox">
                                 <input
                                    type="checkbox"
                                    checked={form.agreeGDPR}
                                    onChange={(e) =>
                                       setField("agreeGDPR", e.target.checked)
                                    }
                                    required
                                    aria-required="true"
                                    aria-label="Acord pentru prelucrarea datelor (GDPR)"
                                 />
                                 <span>
                                    Îmi dau acordul pentru prelucrarea datelor
                                    personale (GDPR).
                                 </span>
                              </label>
                           </div>

                           {/* acțiuni */}
                           <div className="sign__row-btns">
                              <button
                                 type="button"
                                 className="sign__link-button arrow"
                                 onClick={goPrev}
                                 disabled={loading}
                              >
                                 <ReactSVG
                                    src={arrowIcon}
                                    className="sign__icon-inline"
                                 />
                                 <span>Înapoi</span>
                              </button>
                              <button
                                 type="submit"
                                 className="sign__button"
                                 disabled={!canSubmit}
                                 aria-disabled={!canSubmit}
                                 title={
                                    !canSubmit
                                       ? "Bifează ambele acorduri"
                                       : "Trimite"
                                 }
                              >
                                 <span>
                                    {loading
                                       ? "Se trimite..."
                                       : !canSubmit
                                       ? "Bifează acordurile"
                                       : "Trimite"}
                                 </span>
                                 <ReactSVG
                                    className="sign__button-icon sign__icon"
                                    src={addIcon}
                                 />
                              </button>
                           </div>
                        </form>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </main>
   );
}
