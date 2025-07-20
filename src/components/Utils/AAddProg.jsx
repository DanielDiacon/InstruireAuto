import React, { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ReactSVG } from "react-svg";
import addIcon from "../../assets/svg/add.svg";
import arrowIcon from "../../assets/svg/arrow.svg";

const oreDisponibile = [
   { eticheta: "08:00 - 10:00", oraStart: "08:00" },
   { eticheta: "11:00 - 13:00", oraStart: "11:00" },
   { eticheta: "14:00 - 16:00", oraStart: "14:00" },
   { eticheta: "17:00 - 19:00", oraStart: "17:00" },
];

const instructori = ["Ion Popescu", "Maria Dima", "Alex Ionescu"];
const studenti = ["Ana Ionescu", "Mihai Tudor", "Ioana Filip"];

function AAddProg() {
   const [data, setData] = useState(null);
   const [oraSelectata, setOraSelectata] = useState(null);
   const [instructor, setInstructor] = useState("");
   const [student, setStudent] = useState("");

   const closePanel = () => {
      document.body.classList.remove("popup-a-add-prog");
   };

   useEffect(() => {
      const checkBodyClass = () => {
         const active = document.body.classList.contains("popup-a-add-prog");
         document.body.style.overflow = active ? "hidden" : "";
         document.body.style.paddingRight = active ? "16px" : "0px";
      };

      checkBodyClass();

      const observer = new MutationObserver(checkBodyClass);
      observer.observe(document.body, {
         attributes: true,
         attributeFilter: ["class"],
      });

      return () => observer.disconnect();
   }, []);

   const trimiteProgramare = () => {
      if (!data || !oraSelectata || !instructor || !student) {
         alert("Completează toate câmpurile!");
         return;
      }

      const dataISO = data.toISOString().split("T")[0];
      const fullDateTime = `${dataISO}T${oraSelectata.oraStart}`;
      const start = new Date(fullDateTime);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const programare = {
         title: "Lecție practică",
         instructor,
         student,
         start,
         end,
      };

      console.log("Trimis:", programare);
      closePanel();
   };

   return (
      <>
         <div
            className="popup-panel__overlay popup-a-add-prog"
            onClick={closePanel}
         />

         <div className="popup-panel popup-a-add-prog">
            <div className="popup-panel__inner">
               <div className="popup-panel__header">
                  <h3 className="popup-panel__title">Adaugă o lecție</h3>
                  <button className="popup-panel__close" onClick={closePanel}>
                     &times;
                  </button>
               </div>

               <div className="saddprogramari">
                  <div className="saddprogramari__selector">
                     {/* SELECTOR DATA */}
                     <div className="saddprogramari__calendar">
                        <h3 className="saddprogramari__title">
                           Selectează data:
                        </h3>
                        <DatePicker
                           selected={data}
                           onChange={(date) => {
                              setData(date);
                              setOraSelectata(null);
                           }}
                           inline
                        />
                     </div>

                     {/* SELECTOR ORĂ */}
                     <div className="saddprogramari__times">
                        <h3 className="saddprogramari__title">
                           Selectează ora:
                        </h3>
                        <div className="saddprogramari__times-list">
                           {oreDisponibile.map((ora) => {
                              const isSelected =
                                 oraSelectata?.eticheta === ora.eticheta;
                              return (
                                 <button
                                    key={ora.eticheta}
                                    onClick={() => setOraSelectata(ora)}
                                    disabled={!data}
                                    className={`saddprogramari__time-btn ${
                                       isSelected
                                          ? "saddprogramari__time-btn--selected"
                                          : ""
                                    }`}
                                 >
                                    {ora.eticheta}
                                 </button>
                              );
                           })}
                        </div>
                     </div>

                     {/* SELECTOR INSTRUCTOR */}
                     <div className="saddprogramari__dropdown">
                        <h3 className="saddprogramari__title">Instructor:</h3>
                        <select
                           value={instructor}
                           onChange={(e) => setInstructor(e.target.value)}
                        >
                           <option value="">Selectează instructorul</option>
                           {instructori.map((nume) => (
                              <option key={nume} value={nume}>
                                 {nume}
                              </option>
                           ))}
                        </select>
                     </div>

                     {/* SELECTOR STUDENT */}
                     <div className="saddprogramari__dropdown">
                        <h3 className="saddprogramari__title">Student:</h3>
                        <select
                           value={student}
                           onChange={(e) => setStudent(e.target.value)}
                        >
                           <option value="">Selectează studentul</option>
                           {studenti.map((nume) => (
                              <option key={nume} value={nume}>
                                 {nume}
                              </option>
                           ))}
                        </select>
                     </div>

                     {/* TRIMITE */}
                     <button
                        onClick={trimiteProgramare}
                        className="saddprogramari__add-btn arrow"
                        disabled={
                           !data || !oraSelectata || !instructor || !student
                        }
                     >
                        <span>Trimite lecția</span>
                        <ReactSVG
                           src={arrowIcon}
                           className="saddprogramari__add-btn-icon"
                        />
                     </button>
                  </div>
               </div>
            </div>
         </div>
      </>
   );
}

export default AAddProg;
