import React from "react";

export default function InstrEventInfoPopup({ event }) {
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

   // studentul „principal” (dacă e doar unul)
   const primaryStudent = students.length === 1 ? students[0] : null;
   const primaryStudentPhone =
      primaryStudent?.phone ||
      primaryStudent?.tel ||
      primaryStudent?.phoneNumber ||
      primaryStudent?.phone_number ||
      "-";

   // telefonul afișat în câmpul „Telefon” – preferăm studentul
   const phoneField =
      primaryStudentPhone !== "-"
         ? primaryStudentPhone
         : // fallback: dacă sunt mai mulți, poți lista toate
           students
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

   return (
      <div className="event-info">
         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Detalii Programare</h3>
         </div>

         <div className="popup-panel__content">
            <div className="row">
               <strong>Zi:</strong> <span>{format(event.start)}</span>
            </div>
            <div className="row">
               <strong>Interval:</strong>{" "}
               <span>
                  {fmt(event.start)} – {fmt(event.end)}
               </span>
            </div>

            {/* 👇 Student în prim-plan */}
            <div className="row">
               <strong>Student:</strong>{" "}
               <span>
                  {primaryStudent
                     ? fullName(primaryStudent)
                     : studentCount > 0
                     ? `${studentCount} studenți`
                     : "-"}
               </span>
            </div>
            <div className="row">
               <strong>Telefon:</strong> <span>{phoneField}</span>
            </div>

            {/* info instructor rămâne vizibil mai jos */}
            <div className="row">
               <strong>Instructor:</strong>{" "}
               <span>
                  {event.instructor?.firstName} {event.instructor?.lastName}
               </span>
            </div>

            <div className="row">
               <strong>Confirmat:</strong>{" "}
               <span>{event.isConfirmed ? "Da" : "Nu"}</span>
            </div>
            <div className="row">
               <strong>Cutie:</strong> <span>{event.gearbox || "–"}</span>
            </div>
            <div className="row">
               <strong>Sector:</strong> <span>{event.sector || "-"}</span>
            </div>
         </div>
      </div>
   );
}
