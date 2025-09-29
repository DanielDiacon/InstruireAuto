import React from "react";

export default function EventInfoPopup({ event }) {
   if (!event) return null;

   const format = (date) =>
      new Date(date).toLocaleString("ro-RO", { dateStyle: "medium" });
   const fmt = (d) =>
      new Date(d).toLocaleTimeString("ro-RO", {
         hour: "2-digit",
         minute: "2-digit",
      });

   // ——— Helpers
   const fullName = (obj) => {
      const first =
         obj?.firstName ??
         obj?.first_name ??
         obj?.name?.split?.(" ")?.[0] ??
         "";
      const last =
         obj?.lastName ??
         obj?.last_name ??
         obj?.name?.split?.(" ")?.slice(1).join(" ") ??
         "";
      const name = `${first} ${last}`.trim();
      return name || obj?.email || "-";
   };

   // normalize studenți (poate veni student/user sau o listă: students/participants/users)
   const students =
      (Array.isArray(event.students) && event.students) ||
      (Array.isArray(event.participants) && event.participants) ||
      (Array.isArray(event.users) && event.users) ||
      (event.student || event.user ? [event.student || event.user] : []);

   const studentCount = Number.isFinite(event.studentsCount)
      ? event.studentsCount
      : students.length;

   // student „principal” (dacă e doar unul)
   const primaryStudent = students.length === 1 ? students[0] : null;

   const primaryStudentPhone =
      primaryStudent?.phone ||
      primaryStudent?.tel ||
      primaryStudent?.phoneNumber ||
      primaryStudent?.phone_number ||
      // fallback la telefonul din event/instructor dacă nu avem pe student
      event.phone ||
      event.instructor?.phone ||
      "-";

   // telefonul afișat – preferăm studentul; altfel agregăm tot ce găsim
   const phoneField =
      primaryStudentPhone !== "-"
         ? primaryStudentPhone
         : students
              .map(
                 (s) =>
                    s?.phone ||
                    s?.tel ||
                    s?.phoneNumber ||
                    s?.phone_number ||
                    null
              )
              .filter(Boolean)
              .join(", ") || "-";

   // transformă „069..., +373...” în link-uri tel:
   const phoneList =
      phoneField && phoneField !== "-"
         ? phoneField
              .split(/[;,]/)
              .map((s) => s.trim())
              .filter(Boolean)
         : [];

   // ——— Modifiers (ca la componenta instructor)
   const confirmedMod = event.isConfirmed ? "confirmed-yes" : "confirmed-no";
   const gbx = (event.gearbox || "–").toString().toLowerCase();
   const gearboxMod = gbx.includes("man")
      ? "gearbox-manual"
      : gbx.includes("auto")
      ? "gearbox-automatic"
      : "gearbox-na";

   return (
      <>
         <div className="popup-panel__header instr-event__header">
            <h3 className="popup-panel__title instr-event__title">
               Detalii Programare
            </h3>
         </div>

         <div className="popup-panel__content instr-event__content">
            <div className="row instr-event__row instr-event__row--day">
               <strong className="instr-event__label">Data și ora:</strong>
               <span className="instr-event__value instr-event__value--day">
                  {format(event.start)}
               </span>
               <span className="instr-event__value instr-event__value--time">
                  {fmt(event.start)} – {fmt(event.end)}
               </span>
            </div>

            {/* Stare / Confirmare */}
            <div
               className={`row instr-event__row instr-event__row--confirmed instr-event__row--${confirmedMod}`}
            >
               <strong className="instr-event__label">Starea:</strong>
               <span
                  className={`instr-event__value instr-event__value--confirmed instr-event__value--${confirmedMod}`}
               >
                  {event.isConfirmed ? "Confirmată" : "Neconfirmată"}
               </span>
            </div>

            {/* Cutie */}
            <div
               className={`row instr-event__row instr-event__row--gearbox instr-event__row--${gearboxMod}`}
            >
               <strong className="instr-event__label">Cutie:</strong>
               <span
                  className={`instr-event__value instr-event__value--gearbox instr-event__value--${gearboxMod}`}
               >
                  {event.gearbox || "–"}
               </span>
            </div>

            {/* Sector */}
            <div className="row instr-event__row instr-event__row--sector">
               <strong className="instr-event__label">Sector:</strong>
               <span className="instr-event__value instr-event__value--sector">
                  {event.sector || "-"}
               </span>
            </div>
         </div>
      </>
   );
}
