import React, { useState, useContext } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ReactSVG } from "react-svg";
import addIcon from "../../assets/svg/add.svg";
import arrowIcon from "../../assets/svg/arrow.svg";
import { UserContext } from "../../UserContext";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
   addReservation,
   fetchReservations,
} from "../../store/reservationsSlice";

const oreDisponibile = [
   { eticheta: "08:00 - 10:00", oraStart: "08:00" },
   { eticheta: "11:00 - 13:00", oraStart: "11:00" },
   { eticheta: "14:00 - 16:00", oraStart: "14:00" },
   { eticheta: "17:00 - 19:00", oraStart: "17:00" },
];

const instructori = ["Ion Popescu", "Maria Dima", "Alex Ionescu"];
const studenti = ["Ana Ionescu", "Mihai Tudor", "Ioana Filip"];

function AAddProg() {
   const { setPopupName } = useContext(UserContext);
   const dispatch = useDispatch();
   const [data, setData] = useState(null);
   const [oraSelectata, setOraSelectata] = useState(null);
   const [instructor, setInstructor] = useState("");
   const [student, setStudent] = useState("");
   const [selectedDates, setSelectedDates] = useState([]);

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
      if (!instructor || !student || selectedDates.length === 0) {
         alert("Completează toate câmpurile!");
         return;
      }

      try {
         for (let d of selectedDates) {
            await dispatch(
               addReservation({
                  startTime: d,
                  instructor,
                  student,
               })
            ).unwrap();
         }
         // opțional: reîncarcă rezervările
         dispatch(fetchReservations());
         alert("Programări adăugate cu succes!");
         setSelectedDates([]);
         setPopupName(null);
      } catch (err) {
         console.error(err);
         alert("A apărut o eroare la adăugarea programărilor.");
      }
   };

   return (
      <>
         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Programare</h3>
           
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
                     className="saddprogramari__datepicker"
                  />
               </div>

               <div className="saddprogramari__times">
                  <h3 className="saddprogramari__title">Selectează ora:</h3>
                  <div className="saddprogramari__times-list">
                     {oreDisponibile.map((ora) => {
                        const esteDejaSelectata = selectedDates.includes(
                           data
                              ? (() => {
                                   const d = new Date(data);
                                   const [h, m] = ora.oraStart
                                      .split(":")
                                      .map(Number);
                                   d.setHours(h, m, 0, 0);
                                   return d.toISOString();
                                })()
                              : null
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
                     <span>Adaugă programare</span>
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
                  disabled={
                     selectedDates.length === 0 || !instructor || !student
                  }
                  className="saddprogramari__add-btn arrow"
               >
                  <span>{`Trimite ${selectedDates.length} programări`}</span>
                  <ReactSVG
                     src={arrowIcon}
                     className="saddprogramari__add-btn-icon"
                  />
               </button>
            </div>

            {/* SELECTOR INSTRUCTOR */}
            <select
               value={instructor}
               onChange={(e) => setInstructor(e.target.value)}
               className="saddprogramari__select"
            >
               <option value="">Selectează instructorul</option>
               {instructori.map((nume) => (
                  <option key={nume} value={nume}>
                     {nume}
                  </option>
               ))}
            </select>

            {/* SELECTOR STUDENT */}
            <select
               value={student}
               onChange={(e) => setStudent(e.target.value)}
               className="saddprogramari__select"
            >
               <option value="">Selectează studentul</option>
               {studenti.map((nume) => (
                  <option key={nume} value={nume}>
                     {nume}
                  </option>
               ))}
            </select>
         </div>
      </>
   );
}

export default AAddProg;
