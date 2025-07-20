import React, { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import addIcon from "../../assets/svg/add.svg";
import arrowIcon from "../../assets/svg/arrow.svg";
import { ReactSVG } from "react-svg";

const oreDisponibile = [
   { eticheta: "08:00 - 10:00", oraStart: "08:00" },
   { eticheta: "11:00 - 13:00", oraStart: "11:00" },
   { eticheta: "14:00 - 16:00", oraStart: "14:00" },
   { eticheta: "17:00 - 19:00", oraStart: "17:00" },
];

function SAddProg() {
   const [data, setData] = useState(null);
   const [oraSelectata, setOraSelectata] = useState(null);
   const [selectedDates, setSelectedDates] = useState([]);

   const closePanel = () => {
      document.body.classList.remove("popup-s-add-prog");
   };

   useEffect(() => {
      const checkBodyClass = () => {
         const active = document.body.classList.contains("popup-s-add-prog");
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

   const adaugaProgramare = () => {
      if (data && oraSelectata && selectedDates.length < 15) {
         const dataISO = data.toISOString().split("T")[0];
         const fullDateTime = `${dataISO}T${oraSelectata.oraStart}`;

         if (selectedDates.includes(fullDateTime)) {
            alert("Această programare a fost deja adăugată!");
            return;
         }

         setSelectedDates([...selectedDates, fullDateTime]);
         setData(null);
         setOraSelectata(null);
      }
   };

   const trimiteProgramari = () => {
      const newEvents = selectedDates.map((datetimeStr) => {
         const start = new Date(datetimeStr);
         const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
         return {
            title: "Lecție practică",
            start,
            end,
         };
      });

      console.log("Trimis:", newEvents);
      setSelectedDates([]);
      closePanel();
   };

   return (
      <>
         <div
            className="popup-panel__overlay popup-s-add-prog"
            onClick={closePanel}
         />

         <div className="popup-panel popup-s-add-prog">
            <div className="popup-panel__inner">
               <div className="popup-panel__header">
                  <h3 className="popup-panel__title">Adaugă programare</h3>
                  <button className="popup-panel__close" onClick={closePanel}>
                     &times;
                  </button>
               </div>

               <div className="saddprogramari">
                  <div className="saddprogramari__selector">
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
                           className="saddprogramari__datepicker"
                        />
                     </div>

                     <div className="saddprogramari__times">
                        <h3 className="saddprogramari__title">
                           Selectează ora:
                        </h3>
                        <div className="saddprogramari__times-list">
                           {oreDisponibile.map((ora) => {
                              const dataISO = data?.toISOString().split("T")[0];
                              const esteDejaSelectata = selectedDates.includes(
                                 `${dataISO}T${ora.oraStart}`
                              );
                              const isSelected =
                                 oraSelectata?.eticheta === ora.eticheta;

                              return (
                                 <button
                                    key={ora.eticheta}
                                    onClick={() => setOraSelectata(ora)}
                                    disabled={!data || esteDejaSelectata}
                                    className={`saddprogramari__time-btn ${
                                       isSelected
                                          ? "saddprogramari__time-btn--selected"
                                          : ""
                                    } ${
                                       esteDejaSelectata
                                          ? "saddprogramari__time-btn--disabled"
                                          : ""
                                    }`}
                                    title={
                                       esteDejaSelectata
                                          ? "Această oră este deja programată"
                                          : ""
                                    }
                                 >
                                    {ora.eticheta}
                                 </button>
                              );
                           })}
                        </div>

                        <button
                           onClick={adaugaProgramare}
                           disabled={
                              !data ||
                              !oraSelectata ||
                              selectedDates.length >= 15
                           }
                           className="saddprogramari__add-btn"
                        >
                           <ReactSVG
                              src={addIcon}
                              className="saddprogramari__add-btn-icon"
                           />
                           <span>Programare</span>
                        </button>
                     </div>
                  </div>

                  <div className="saddprogramari__added">
                     <h3 className="saddprogramari__title">
                        Programări adăugate: {selectedDates.length}/15
                     </h3>
                     <ul className="saddprogramari__added-list">
                        {selectedDates.map((d, i) => (
                           <li key={i} className="saddprogramari__added-item">
                              {new Date(d).toLocaleString()}
                           </li>
                        ))}

                        <button
                           onClick={trimiteProgramari}
                           disabled={selectedDates.length === 0}
                           className="saddprogramari__add-btn arrow"
                        >
                           <span>
                              Trimite {selectedDates.length} programări
                           </span>
                           <ReactSVG
                              src={arrowIcon}
                              className="saddprogramari__add-btn-icon"
                           />
                        </button>
                     </ul>
                  </div>
               </div>
            </div>
         </div>
      </>
   );
}

export default SAddProg;
