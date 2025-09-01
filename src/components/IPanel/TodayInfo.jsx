import { useContext, useEffect, useMemo, useState } from "react";
import { UserContext } from "../../UserContext";

import { openPopup } from "../../components/Utils/popupStore";
import {
   getReservations,
   getAllReservations,
   getInstructorReservations,
} from "../../api/reservationsService";
import { getInstructors } from "../../api/instructorsService";

function TodayInfo() {
   const { user } = useContext(UserContext);

   // prefer numele de pe instructor pentru rolul INSTRUCTOR
   const [myInstructor, setMyInstructor] = useState(null);

   const [events, setEvents] = useState([]);

   // refresh “acum” la ~30s ca să comute clasa --active
   const [now, setNow] = useState(new Date());
   useEffect(() => {
      const id = setInterval(() => setNow(new Date()), 30 * 1000);
      return () => clearInterval(id);
   }, []);

   // 1) găsește instructorul curent după userId
   useEffect(() => {
      let cancelled = false;
      (async () => {
         if (!user || user.role !== "INSTRUCTOR") {
            setMyInstructor(null);
            return;
         }
         try {
            const all = await getInstructors();
            const mine = all.find((i) => String(i.userId) === String(user.id));
            if (!cancelled) setMyInstructor(mine || null);
         } catch (e) {
            console.error("[TodayInfo] getInstructors failed:", e);
            if (!cancelled) setMyInstructor(null);
         }
      })();
      return () => {
         cancelled = true;
      };
   }, [user]);

   // helpers: normalizează studentul din payload
   const normStudent = (item) => {
      if (Array.isArray(item.students) && item.students.length)
         return {
            list: item.students,
            one: item.students.length === 1 ? item.students[0] : null,
         };
      if (Array.isArray(item.participants) && item.participants.length)
         return {
            list: item.participants,
            one: item.participants.length === 1 ? item.participants[0] : null,
         };
      if (Array.isArray(item.users) && item.users.length)
         return {
            list: item.users,
            one: item.users.length === 1 ? item.users[0] : null,
         };
      const one = item.student || item.user || null;
      return { list: one ? [one] : [], one };
   };

   const toEvent = (item) => {
      const start = new Date(item.startTime);
      const end = new Date(start.getTime() + 90 * 60 * 1000); // 90 min
      const { list: studentsArr, one: studentObj } = normStudent(item);

      const studentPhone =
         studentObj?.phone ||
         studentObj?.tel ||
         studentObj?.phoneNumber ||
         studentObj?.phone_number ||
         null;

      return {
         id: item.id,
         start,
         end,
         gearbox: item.gearbox,
         sector: item.sector,
         isConfirmed: !!item.isConfirmed,

         student: studentObj || null,
         students: studentsArr,
         studentsCount:
            item.studentsCount ?? item.totalStudents ?? studentsArr.length,

         instructor: item.instructor,
         phone: studentPhone,
      };
   };

   // 2) ia rezervările potrivite rolului
   useEffect(() => {
      let cancelled = false;
      (async () => {
         try {
            let raw = [];
            if (user?.role === "INSTRUCTOR") {
               if (!myInstructor?.id) return;
               try {
                  raw = await getInstructorReservations(
                     myInstructor.id,
                     user.id
                  );
               } catch (e) {
                  console.warn(
                     "[TodayInfo] /reservations/instructor/:id fail, /all",
                     e
                  );
                  const all = await getAllReservations();
                  raw = all.filter(
                     (r) =>
                        String(r.instructorId || r?.instructor?.id) ===
                           String(myInstructor.id) ||
                        String(r?.instructor?.userId) === String(user.id)
                  );
               }
            } else {
               raw = await getReservations();
            }

            const mapped = raw.map(toEvent);
            if (cancelled) return;

            setEvents(mapped);
         } catch (e) {
            console.error("[TodayInfo] Eroare la rezervări:", e);
         }
      })();
      return () => {
         cancelled = true;
      };
   }, [user, myInstructor]);

   // === TODAY VIEW (grupare pe azi) ===
   const isSameDay = (a, b) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

   const today = now;
   const todaysEvents = useMemo(
      () =>
         events
            .filter((e) => isSameDay(e.start, today))
            .sort((a, b) => a.start - b.start),
      [events, today]
   );

   const current = todaysEvents.filter((e) => e.start <= now && now < e.end);
   const upcoming = todaysEvents.filter((e) => e.start > now);
   const past = todaysEvents.filter((e) => e.end <= now);

   const fmtHour = (d) =>
      new Date(d).toLocaleTimeString("ro-RO", {
         hour: "2-digit",
         minute: "2-digit",
      });

   const fmtDateTitle = (d) =>
      `Azi – ${d
         .toLocaleDateString("ro-RO", { day: "numeric", month: "short" })
         .replaceAll(".", "")}`;

   return (
      <>
         {/* ======= REZUMATUL ZILEI — TOTUL ÎNTR-UN SINGUR RETURN ======= */}
         <section className="today">
            {/* Titlu (Azi – 3 sept) */}
            <div className="today__header">
               <h2 className="today__title">{fmtDateTitle(today)}</h2>
            </div>
            <div className="today__grid-wrapper">
               <div className="today__grid">
                  {/* SECȚIUNEA: Acum */}
                  {current.length > 0 && (
                     <section className="today__section today__section--current">
                        <h3 className="today__section-title">Acum</h3>
                        <div className="today__groups">
                           {/* Fără rail cu oră – ora e DOAR în interiorul cardului */}
                           <div className="today__items">
                              {current.map((ev) => {
                                 const isActive =
                                    now >= ev.start && now < ev.end;
                                 return (
                                    <div
                                       key={ev.id}
                                       className={[
                                          "today__item",
                                          isActive ? "today__item--active" : "",
                                       ]
                                          .filter(Boolean)
                                          .join(" ")}
                                       onClick={() =>
                                          openPopup("instrEventInfo", {
                                             event: ev,
                                          })
                                       }
                                       title="Deschide detalii"
                                    >
                                       {/* Stânga: student / studenți */}

                                       <div className="today__student">
                                          <span className="today__student-name">
                                             {ev.student
                                                ? `${
                                                     ev.student.firstName || ""
                                                  } ${
                                                     ev.student.lastName || ""
                                                  }`.trim()
                                                : "—"}
                                          </span>
                                          {ev.phone && (
                                             <span className="today__student-phone">
                                                {ev.phone}
                                             </span>
                                          )}
                                          <p className="today__student-time-range">
                                             {fmtHour(ev.start)} –{" "}
                                             {fmtHour(ev.end)}
                                          </p>
                                       </div>

                                       {/* Dreapta: meta + intervalul ORA (în interior) */}
                                       <div className="today__item-right">
                                          <div className="today__meta">
                                             <span
                                                className={[
                                                   "today__meta-badge",
                                                   ev.isConfirmed
                                                      ? "today__meta-badge--yes"
                                                      : "today__meta-badge--no",
                                                ].join(" ")}
                                             >
                                                {ev.isConfirmed
                                                   ? "Confirmat"
                                                   : "Neconfirmat"}
                                             </span>
                                          </div>
                                       </div>
                                    </div>
                                 );
                              })}
                           </div>
                        </div>
                     </section>
                  )}

                  {/* SECȚIUNEA: Urmează */}
                  {upcoming.length > 0 && (
                     <section className="today__section today__section--upcoming">
                        <h3 className="today__section-title">Urmează</h3>
                        <div className="today__groups">
                           <div className="today__items">
                              {upcoming.map((ev) => (
                                 <div
                                    key={ev.id}
                                    className="today__item"
                                    onClick={() =>
                                       openPopup("instrEventInfo", {
                                          event: ev,
                                       })
                                    }
                                    title="Deschide detalii"
                                 >
                                    <div className="today__student">
                                       <span className="today__student-name">
                                          {ev.student
                                             ? `${ev.student.firstName || ""} ${
                                                  ev.student.lastName || ""
                                               }`.trim()
                                             : "—"}
                                       </span>
                                       {ev.phone && (
                                          <span className="today__student-phone">
                                             {ev.phone}
                                          </span>
                                       )}{" "}
                                       <p className="today__student-time-range">
                                          {fmtHour(ev.start)} –{" "}
                                          {fmtHour(ev.end)}
                                       </p>
                                    </div>

                                    <div className="today__item-right">
                                       <div className="today__meta">
                                          <span
                                             className={[
                                                "today__meta-badge",
                                                ev.isConfirmed
                                                   ? "today__meta-badge--yes"
                                                   : "today__meta-badge--no",
                                             ].join(" ")}
                                          >
                                             {ev.isConfirmed
                                                ? "Confirmat"
                                                : "Neconfirmat"}
                                          </span>
                                       </div>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </div>
                     </section>
                  )}

                  {/* SECȚIUNEA: Trecute (astăzi) */}
                  {past.length > 0 && (
                     <section className="today__section today__section--past">
                        <h3 className="today__section-title">
                           Trecute (astăzi)
                        </h3>
                        <div className="today__groups">
                           <div className="today__items">
                              {past.map((ev) => (
                                 <div
                                    key={ev.id}
                                    className="today__item today__item--past"
                                    onClick={() =>
                                       openPopup("instrEventInfo", {
                                          event: ev,
                                       })
                                    }
                                    title="Deschide detalii"
                                 >
                                    <div className="today__student">
                                       <span className="today__student-name">
                                          {ev.student
                                             ? `${ev.student.firstName || ""} ${
                                                  ev.student.lastName || ""
                                               }`.trim()
                                             : "—"}
                                       </span>
                                       {ev.phone && (
                                          <span className="today__student-phone">
                                             {ev.phone}
                                          </span>
                                       )}
                                       <p className="today__student-time-range">
                                          {fmtHour(ev.start)} –{" "}
                                          {fmtHour(ev.end)}
                                       </p>
                                    </div>

                                    <div className="today__item-right">
                                       <div className="today__meta">
                                          <span
                                             className={[
                                                "today__meta-badge",
                                                ev.isConfirmed
                                                   ? "today__meta-badge--yes"
                                                   : "today__meta-badge--no",
                                             ].join(" ")}
                                          >
                                             {ev.isConfirmed
                                                ? "Confirmat"
                                                : "Neconfirmat"}
                                          </span>
                                       </div>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </div>
                     </section>
                  )}

                  {/* Empty state */}
                  {todaysEvents.length === 0 && (
                     <p className="today__empty">Nu ai programări astăzi.</p>
                  )}
               </div>
            </div>
         </section>
      </>
   );
}

export default TodayInfo;
