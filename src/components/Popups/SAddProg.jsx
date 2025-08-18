// components/Popups/SAddProg.jsx
import React, { useState, useContext } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import addIcon from "../../assets/svg/add.svg";
import arrowIcon from "../../assets/svg/arrow.svg";
import { ReactSVG } from "react-svg";
import { createReservations } from "../../api/reservationsService";
import { UserContext } from "../../UserContext";

const oreDisponibile = [
   { eticheta: "08:00 - 10:00", oraStart: "08:00" },
   { eticheta: "11:00 - 13:00", oraStart: "11:00" },
   { eticheta: "14:00 - 16:00", oraStart: "14:00" },
   { eticheta: "17:00 - 19:00", oraStart: "17:00" },
];

export default function SAddProg({ onClose }) {
   const [data, setData] = useState(null);
   const [oraSelectata, setOraSelectata] = useState(null);
   const [selectedDates, setSelectedDates] = useState([]);
   const [loading, setLoading] = useState(false);
   const { user } = useContext(UserContext);

   const adaugaProgramare = () => {
      if (!data || !oraSelectata || selectedDates.length >= 15) return;

      const d = new Date(data);
      const [h, m] = oraSelectata.oraStart.split(":").map(Number);
      d.setHours(h, m, 0, 0);

      const iso = d.toISOString();

      if (selectedDates.includes(iso)) {
         alert("Această programare a fost deja adăugată!");
         return;
      }

      setSelectedDates((prev) => [...prev, iso]);
      setData(null);
      setOraSelectata(null);
   };

   const trimiteProgramari = async () => {
      setLoading(true);

      try {
         if (selectedDates.length === 0) {
            alert("Nu ai adăugat nicio programare!");
            setLoading(false);
            return;
         }

         const payload = {
            reservations: selectedDates.map((isoDate) => ({
               startTime: isoDate,
            })),
         };

         await createReservations(payload);

         setSelectedDates([]);
         onClose?.();
      } catch (error) {
         console.error("Eroare la trimiterea programărilor:", error);
         alert("A apărut o eroare la trimitere.");
      } finally {
         setLoading(false);
      }
   };

   return (
      <div className="popup-panel__inner">
         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Adaugă programare</h3>
           
         </div>

         <div className="saddprogramari">
            <div className="saddprogramari__selector">
               <div className="saddprogramari__calendar">
                  <h3 className="saddprogramari__title">Selectează data:</h3>
                  <DatePicker
                     selected={data}
                     onChange={(date) => {
                        setData(date);
                        setOraSelectata(null);
                     }}
                     inline
                  />
               </div>

               <div className="saddprogramari__times">
                  <h3 className="saddprogramari__title">Selectează ora:</h3>
                  <div className="saddprogramari__times-list">
                     {oreDisponibile.map((ora) => {
                        const esteDejaSelectata = selectedDates.includes(
                           (() => {
                              if (!data) return null;
                              const d = new Date(data);
                              const [h, m] = ora.oraStart
                                 .split(":")
                                 .map(Number);
                              d.setHours(h, m, 0, 0);
                              return d.toISOString();
                           })()
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
                        !data || !oraSelectata || selectedDates.length >= 15
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
               </ul>

               <button
                  onClick={trimiteProgramari}
                  disabled={selectedDates.length === 0 || loading}
                  className="saddprogramari__add-btn arrow"
               >
                  <span>
                     {loading
                        ? "Se trimit..."
                        : `Trimite ${selectedDates.length} programări`}
                  </span>
                  <ReactSVG
                     src={arrowIcon}
                     className="saddprogramari__add-btn-icon"
                  />
               </button>
            </div>
         </div>
      </div>
   );
}
