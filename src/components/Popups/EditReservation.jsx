// src/components/Popups/ReservationEditPopup.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchStudents } from "../../store/studentsSlice";
import { fetchInstructors } from "../../store/instructorsSlice";
import {
   updateReservation,
   removeReservation,
   fetchAllReservations,
} from "../../store/reservationsSlice";
import { closePopup as closePopupStore } from "../Utils/popupStore";

/* ===== Helpers ===== */
const toDateInput = (d) => {
   const dd = new Date(d);
   const y = dd.getFullYear();
   const m = String(dd.getMonth() + 1).padStart(2, "0");
   const day = String(dd.getDate()).padStart(2, "0");
   return `${y}-${m}-${day}`;
};
const toTimeInput = (d) => {
   const dd = new Date(d);
   const h = String(dd.getHours()).padStart(2, "0");
   const m = String(dd.getMinutes()).padStart(2, "0");
   return `${h}:${m}`;
};
const buildISO = (dateStr, timeStr) => {
   const [y, m, d] = dateStr.split("-").map(Number);
   const [hh, mm] = timeStr.split(":").map(Number);
   const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
   return new Date(dt).toISOString();
};
function highlightText(text, query) {
   if (!text) return "";
   if (!query) return text;
   const parts = text.toString().split(new RegExp(`(${query})`, "gi"));
   return parts.map((part, i) =>
      part.toLowerCase() === (query || "").toLowerCase() ? (
         <i key={i} className="highlight">
            {part}
         </i>
      ) : (
         part
      )
   );
}

/* ===== Component ===== */
export default function ReservationEditPopup({ reservationId }) {
   const dispatch = useDispatch();

   // Store data
   const reservations = useSelector((s) => s.reservations?.list || []);
   const students = useSelector((s) => s.students?.list || []);
   const instructors = useSelector((s) => s.instructors?.list || []);

   useEffect(() => {
      if (!reservations?.length) dispatch(fetchAllReservations());
      if (!students?.length) dispatch(fetchStudents());
      if (!instructors?.length) dispatch(fetchInstructors());
   }, [dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

   const existing = useMemo(
      () => reservations.find((r) => String(r.id) === String(reservationId)),
      [reservations, reservationId]
   );

   // === UI state (initialize; sync la sosirea existing) ===
   const start = existing?.startTime
      ? new Date(existing.startTime)
      : new Date();
   const [dateStr, setDateStr] = useState(toDateInput(start));
   const [timeStr, setTimeStr] = useState(toTimeInput(start));
   const [sector, setSector] = useState(existing?.sector || "Botanica");
   const [gearbox, setGearbox] = useState(
      (existing?.gearbox || "Manual").toLowerCase() === "automat"
         ? "Automat"
         : "Manual"
   );

   // elevul NU mai e editabil — îl păstrăm fix din rezervarea existentă
   const studentIdFixed = useMemo(
      () =>
         existing?.userId || existing?.studentId
            ? String(existing.userId || existing.studentId)
            : "",
      [existing]
   );

   // instructorul rămâne editabil
   const [instructorId, setInstructorId] = useState(
      existing?.instructorId ? String(existing.instructorId) : ""
   );

   // resync când vine existing din store
   useEffect(() => {
      if (!existing) return;
      const s = existing.startTime ? new Date(existing.startTime) : new Date();
      setDateStr(toDateInput(s));
      setTimeStr(toTimeInput(s));
      setSector(existing.sector || "Botanica");
      setGearbox(
         (existing.gearbox || "Manual").toLowerCase() === "automat"
            ? "Automat"
            : "Manual"
      );
      setInstructorId(
         existing?.instructorId ? String(existing.instructorId) : ""
      );
   }, [existing]);

   const selectedStudent = useMemo(
      () =>
         studentIdFixed
            ? (students || []).find(
                 (u) => String(u.id) === String(studentIdFixed)
              )
            : null,
      [students, studentIdFixed]
   );
   const selectedInstructor = useMemo(
      () =>
         instructorId
            ? (instructors || []).find(
                 (i) => String(i.id) === String(instructorId)
              )
            : null,
      [instructors, instructorId]
   );

   // doar pentru lista de instructori (căutare simplă)
   const [view, setView] = useState("form"); // "form" | "instructorSearch"
   const [instrQuery, setInstrQuery] = useState("");
   const filteredInstructors = useMemo(() => {
      const q = (instrQuery || "").trim().toLowerCase();
      if (!q) return instructors;
      return (instructors || []).filter((i) => {
         const full = `${i.firstName || ""} ${i.lastName || ""}`.toLowerCase();
         const phone = (i.phone || "").toLowerCase();
         return full.includes(q) || phone.includes(q);
      });
   }, [instructors, instrQuery]);

   // ---- Actions ----
   const onCancel = () => closePopupStore();

   const onDelete = async () => {
      if (!existing) return closePopupStore();
      const ok = window.confirm("Ștergi această rezervare?");
      if (!ok) return;
      await dispatch(removeReservation(existing.id));
      closePopupStore();
   };

   const onSave = async () => {
      // Blochează pauza 13:00–13:30
      const [H, M] = timeStr.split(":").map(Number);
      const isLunch = H === 13 && M < 30;
      if (isLunch) {
         alert("Intervalul 13:00–13:30 este pauză de masă. Alege altă oră.");
         return;
      }

      if (!instructorId) {
         alert("Selectează instructorul.");
         return;
      }

      // TRIMITEM întotdeauna elevul fix din rezervare (nu e editabil)
      const payload = {
         startTime: buildISO(dateStr, timeStr),
         sector,
         gearbox, // "Manual" | "Automat"
         instructorId: Number(instructorId),
         userId: studentIdFixed ? Number(studentIdFixed) : null, // păstrează elevul
         instructorsGroupId: null, // detașează din grup
      };

      await dispatch(updateReservation({ id: existing.id, data: payload }));
      closePopupStore();
   };

   // Early return după hook-uri
   if (!existing) {
      return (
         <div className="popup-panel__inner">
            <div className="popup-panel__header">
               <h3 className="popup-panel__title">Editează rezervarea</h3>
            </div>
            <div className="popup-panel__content">Se încarcă datele...</div>
         </div>
      );
   }

   const studentDisplay = selectedStudent
      ? `${selectedStudent.firstName || selectedStudent.prenume || ""} ${
           selectedStudent.lastName || selectedStudent.nume || ""
        }`.trim()
      : "(necunoscut)";
   const studentPhone =
      selectedStudent?.phone ||
      selectedStudent?.phoneNumber ||
      selectedStudent?.mobile ||
      selectedStudent?.telefon ||
      "";

   const instructorDisplay = selectedInstructor
      ? `${selectedInstructor.firstName || ""} ${
           selectedInstructor.lastName || ""
        }`.trim()
      : "(neales)";
   const instructorPhone = selectedInstructor?.phone || "";

   // ---- Render numai căutare instructor ----
   const renderInstructorSearch = () => (
      <>
         <div className="instructors-popup__search-wrapper ">
            <input
               type="text"
               className="instructors-popup__search"
               placeholder="Caută instructor după nume sau telefon..."
               value={instrQuery}
               onChange={(e) => setInstrQuery(e.target.value)}
            />
         </div>
         <div className="picker__list">
            <ul className="instructors-popup__list-items">
               {filteredInstructors.map((i) => {
                  const full = `${i.firstName || ""} ${
                     i.lastName || ""
                  }`.trim();
                  const phone = i.phone || "";
                  return (
                     <li
                        key={i.id}
                        className="instructors-popup__item"
                        onClick={() => {
                           setInstructorId(String(i.id));
                           setView("form");
                        }}
                     >
                        <div className="instructors-popup__item-left">
                           <h3>{highlightText(full, instrQuery)}</h3>
                           {phone && <p>{highlightText(phone, instrQuery)}</p>}
                        </div>
                     </li>
                  );
               })}
            </ul>
         </div>
         <div className="instructors-popup__btns">
            <div style={{ flex: 1 }} />
            <button
               className="instructors-popup__form-button instructors-popup__form-button--cancel"
               onClick={() => setView("form")}
            >
               Înapoi
            </button>
         </div>
      </>
   );

   return (
      <div className="popup-panel__inner">
         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Editează rezervarea</h3>
         </div>

         <div className="instructors-popup__content">
            {/* Notificare: a fost detașată din grup */}
            {existing?.instructorsGroupId && (
               <div className="info-banner" style={{ marginBottom: 10 }}>
                  Această rezervare a fost <b>detașată din grup</b> și va fi
                  alocată unui <b>instructor</b>.
               </div>
            )}

            {view === "form" && (
               <>
                  {/* Data & Ora */}
                  <div className="instructors-popup__form-row">
                     <label className="instructors-popup__field">
                        <span className="instructors-popup__label">Data</span>
                        <input
                           type="date"
                           className="instructors-popup__input"
                           value={dateStr}
                           onChange={(e) => setDateStr(e.target.value)}
                        />
                     </label>
                     <label className="instructors-popup__field">
                        <span className="instructors-popup__label">Ora</span>
                        <input
                           type="time"
                           step="1800"
                           className="instructors-popup__input"
                           value={timeStr}
                           onChange={(e) => setTimeStr(e.target.value)}
                        />
                     </label>
                  </div>

                  {/* Elev (READ-ONLY) */}
                  <div className="instructors-popup__form-row">
                     <label
                        className="instructors-popup__field"
                        style={{ flex: 1 }}
                     >
                        <span className="instructors-popup__label">Elev</span>
                        <input
                           className="instructors-popup__input"
                           type="text"
                           readOnly
                           value={
                              studentDisplay +
                              (studentPhone ? ` · ${studentPhone}` : "")
                           }
                           title="Elevul nu poate fi schimbat din acest ecran"
                        />
                     </label>

                     {/* Instructor (editabil) */}
                     <label
                        className="instructors-popup__field"
                        style={{ flex: 1 }}
                     >
                        <span className="instructors-popup__label">
                           Instructor
                        </span>
                        <div className="picker__row">
                           <input
                              className="instructors-popup__input"
                              type="text"
                              readOnly
                              value={
                                 instructorDisplay +
                                 (instructorPhone
                                    ? ` · ${instructorPhone}`
                                    : "")
                              }
                              placeholder="Alege instructor"
                           />
                           <button
                              type="button"
                              className="instructors-popup__form-button"
                              onClick={() => setView("instructorSearch")}
                           >
                              Caută instructor
                           </button>
                        </div>
                     </label>
                  </div>

                  {/* Sector + Cutie */}
                  <div className="instructors-popup__form-row">
                     <div
                        className={`instructors-popup__radio-wrapper addprog ${
                           sector === "Botanica"
                              ? "active-botanica"
                              : "active-ciocana"
                        }`}
                        style={{ flex: 1 }}
                     >
                        <label>
                           <input
                              type="radio"
                              name="sector"
                              value="Botanica"
                              checked={sector === "Botanica"}
                              onChange={(e) => setSector(e.target.value)}
                           />
                           Botanica
                        </label>
                        <label>
                           <input
                              type="radio"
                              name="sector"
                              value="Ciocana"
                              checked={sector === "Ciocana"}
                              onChange={(e) => setSector(e.target.value)}
                           />
                           Ciocana
                        </label>
                     </div>

                     <div
                        className={`instructors-popup__radio-wrapper addprog ${
                           gearbox === "Manual"
                              ? "active-botanica"
                              : "active-ciocana"
                        }`}
                        style={{ flex: 1 }}
                     >
                        <label>
                           <input
                              type="radio"
                              name="gearbox"
                              value="Manual"
                              checked={gearbox === "Manual"}
                              onChange={(e) => setGearbox(e.target.value)}
                           />
                           Manual
                        </label>
                        <label>
                           <input
                              type="radio"
                              name="gearbox"
                              value="Automat"
                              checked={gearbox === "Automat"}
                              onChange={(e) => setGearbox(e.target.value)}
                           />
                           Automat
                        </label>
                     </div>
                  </div>

                  {/* Actions */}
                  <div className="instructors-popup__btns">
                     <button
                        className="instructors-popup__form-button instructors-popup__form-button--delete"
                        onClick={onDelete}
                     >
                        Șterge
                     </button>
                     <div style={{ flex: 1 }} />
                     <button
                        className="instructors-popup__form-button instructors-popup__form-button--cancel"
                        onClick={onCancel}
                     >
                        Anulează
                     </button>
                     <button
                        className="instructors-popup__form-button instructors-popup__form-button--save"
                        onClick={onSave}
                     >
                        Salvează
                     </button>
                  </div>
               </>
            )}

            {view === "instructorSearch" && renderInstructorSearch()}
         </div>
      </div>
   );
}
