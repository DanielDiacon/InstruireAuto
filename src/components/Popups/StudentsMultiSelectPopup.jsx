// src/components/Popups/ExamPermissionGrantPopup.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchStudents } from "../../store/studentsSlice";
import { grantExamPermissionBulk, getMe } from "../../api/examService";
import AlertPills from "../Utils/AlertPills";

/* ===== Helpers timp Moldova ===== */
const TZ_MD = "Europe/Chisinau";
function fmtMd(iso) {
   if (!iso) return "-";
   return new Date(iso).toLocaleString("ro-RO", {
      timeZone: TZ_MD,
      dateStyle: "medium",
      timeStyle: "short",
   });
}
function _partsForTZ(date, timeZone) {
   const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
   });
   const parts = fmt.formatToParts(date);
   const get = (t) => Number(parts.find((p) => p.type === t)?.value);
   return {
      y: get("year"),
      m: get("month"),
      d: get("day"),
      hh: get("hour"),
      mm: get("minute"),
      ss: get("second"),
   };
}
/** “Acum” în Chișinău ca Date (echivalent UTC pentru ora locală MD) */
function nowInChisinauAsDate() {
   const { y, m, d, hh, mm, ss } = _partsForTZ(new Date(), TZ_MD);
   return new Date(Date.UTC(y, m - 1, d, hh, mm, ss, 0));
}
/** ISO UTC pentru (acum în Moldova + X minute) */
function isoFromChisinauNowPlusMinutes(minutes = 60) {
   const base = nowInChisinauAsDate();
   return new Date(base.getTime() + Number(minutes || 0) * 60000).toISOString();
}

/**
 * Popup: acordă permisiune examen (MULTI-select).
 * - maxAttempts = 1 (fix)
 * - validUntil = acum(Moldova) + 60 min (calcul corect)
 * - trimite instructorId (din /auth/me) în payload
 * - arată toate erorile și confirmările în AlertPills
 */
export default function ExamPermissionGrantPopup({ onClose }) {
   const dispatch = useDispatch();
   const studentsAll = useSelector((s) => s.students?.list || []);
   const [meId, setMeId] = useState(null); // folosit ca instructorId

   useEffect(() => {
      if (!studentsAll?.length) dispatch(fetchStudents());
   }, [dispatch]); // eslint-disable-line

   useEffect(() => {
      let alive = true;
      (async () => {
         try {
            const me = await getMe();
            const id = Number(me?.id);
            if (alive && Number.isInteger(id) && id > 0) setMeId(id);
         } catch (_) {
            // lăsăm null -> serviciul va da eroare “Lipsește instructorId valid.”
         }
      })();
      return () => {
         alive = false;
      };
   }, []);

   // doar useri cu rol USER
   const hasUserRole = (u) => {
      const role = String(
         u?.role ?? u?.Role ?? u?.userRole ?? ""
      ).toUpperCase();
      if (role === "USER") return true;
      const roles = Array.isArray(u?.roles)
         ? u.roles.map((r) => String(r).toUpperCase())
         : [];
      return roles.includes("USER");
   };
   const students = useMemo(
      () => (studentsAll || []).filter(hasUserRole),
      [studentsAll]
   );

   /* ====== căutare & listă ====== */
   const [q, setQ] = useState("");
   const filtered = useMemo(() => {
      const query = (q || "").trim().toLowerCase();
      if (!query) return students;
      return students.filter((s) => {
         const full = `${s.firstName || ""} ${s.lastName || ""}`.toLowerCase();
         const phone = (s.phone || "").toLowerCase();
         const email = (s.email || "").toLowerCase();
         return (
            full.includes(query) ||
            phone.includes(query) ||
            email.includes(query)
         );
      });
   }, [q, students]);

   /* ====== selecție MULTI ====== */
   const [selected, setSelected] = useState(() => new Set());
   const toggleOne = useCallback((id) => {
      setSelected((prev) => {
         const next = new Set(prev);
         if (next.has(id)) next.delete(id);
         else next.add(id);
         return next;
      });
   }, []);
   const selectAllFiltered = () => {
      setSelected((prev) => {
         const next = new Set(prev);
         for (const s of filtered) next.add(Number(s.id));
         return next;
      });
   };
   const clearAll = () => setSelected(new Set());
   const selectedCount = selected.size;

   const namesById = useMemo(() => {
      const map = new Map();
      for (const s of studentsAll || []) {
         map.set(
            Number(s.id),
            `${s.firstName || ""} ${s.lastName || ""}`.trim() || `#${s.id}`
         );
      }
      return map;
   }, [studentsAll]);

   /* ====== Alerts (AlertPills) ====== */
   const [alerts, setAlerts] = useState([]);
   const pushAlert = (type, text) =>
      setAlerts((prev) => [
         ...prev,
         { id: Date.now() + Math.random(), type, text },
      ]);
   const popAlert = () => setAlerts((prev) => prev.slice(0, -1));

   /* ====== acțiune acordare ====== */
   const [busy, setBusy] = useState(false);
   const MAX_ATTEMPTS = 1;

   async function handleGrant() {
      if (selected.size === 0) {
         pushAlert("error", "Selectează cel puțin un elev.");
         return;
      }
      if (!Number.isInteger(meId) || meId <= 0) {
         pushAlert(
            "error",
            "Nu am putut determina instructorId pentru utilizatorul curent."
         );
         return;
      }

      try {
         setBusy(true);

         // calculează “acum (MD) + 60 minute”
         const validUntilIsoRaw = isoFromChisinauNowPlusMinutes(60); // „acum (MD) + 60m” → UTC
         const grantedAtIso = nowInChisinauAsDate().toISOString();

         const res = await grantExamPermissionBulk({
            userIds: Array.from(selected).map(Number),
            validUntil: validUntilIsoRaw, // în service o normalizăm la secunde
            maxAttempts: 1,
            grantedById: meId, // ← doar asta
         });

         const successIds = Array.isArray(res?.successIds)
            ? res.successIds.map(Number)
            : [];
         const failedArr = Array.isArray(res?.failed) ? res.failed : [];

         // ==== succes: afișăm un pill + golim selecția
         if (successIds.length > 0) {
            const names = successIds.map((id) => namesById.get(id) || `#${id}`);
            const shown = names.slice(0, 5).join(", ");
            const extra = names.length > 5 ? ` +${names.length - 5} alți` : "";

            pushAlert(
               "info",
               `Permisiune ACORDATĂ pentru ${
                  names.length
               } elevi: ${shown}${extra}.
Încercări: ${MAX_ATTEMPTS}. Valabil până la: ${fmtMd(validUntilIsoRaw)}.
Acordat la: ${fmtMd(grantedAtIso)}.`
            );

            // GOLIRE selecție: dacă totul a mers – golește tot; dacă parțial – scoate doar reușiții
            setSelected((prev) => {
               if (!failedArr.length) return new Set(); // toate acordate → selecție goală
               const next = new Set(prev);
               successIds.forEach((id) => next.delete(Number(id))); // parțial → păstrează doar pe cei cu eroare
               return next;
            });
         }

         // ==== erori: un pill per fiecare eroare întoarsă de backend
         if (failedArr.length > 0) {
            for (const f of failedArr) {
               const fid = Number(f?.userId);
               const fname = namesById.get(fid) || `#${fid}`;
               const msg = f?.error || "Eroare necunoscută.";
               pushAlert(
                  "error",
                  `Nu s-a putut acorda permisiunea pentru ${fname} (${fid}): ${msg}`
               );
            }
         }

       
      } catch (e) {
         pushAlert("error", e?.message || "Eroare la acordarea permisiunii.");
      } finally {
         setBusy(false);
      }
   }

   const highlight = (text, query) => {
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
   };

   return (
      <>
         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Acordă permisiune examen</h3>
         </div>

         <div className="aAddProg instructors-popup__content">
            <div
               className="instructors-popup__search-wrapper permision__search-wrapper"
               style={{ gap: 8 }}
            >
               <input
                  type="text"
                  className="instructors-popup__search"
                  placeholder="Caută după nume, telefon sau e-mail…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
               />
               <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                  <button
                     className="instructors-popup__form-button instructors-popup__form-button--cancel"
                     onClick={clearAll}
                     title="Golește selecția"
                  >
                     Golește
                  </button>
               </div>
            </div>

            {/* Listă studenți (checkbox → multiselect) */}
            <div className="instructors-popup__list-wrapper permision__list-wrapper">
               <ul className="instructors-popup__list-items">
                  {filtered.map((s) => {
                     const id = Number(s.id);
                     const active = selected.has(id);
                     const full = `${s.firstName || ""} ${
                        s.lastName || ""
                     }`.trim();
                     const phone = s.phone || "";
                     const email = s.email || "";

                     return (
                        <li
                           key={id}
                           className={
                              "instructors-popup__item" +
                              (active ? " instructors-popup__item--active" : "")
                           }
                           onClick={() => toggleOne(id)}
                        >
                           <div className="instructors-popup__item-left">
                              <h3>{highlight(full, q)}</h3>
                              {phone ? <p>{highlight(phone, q)}</p> : null}
                              {email ? <p>{highlight(email, q)}</p> : null}
                           </div>
                           <div className="instructors-popup__item-right">
                              <input
                                 type="checkbox" // ← checkbox (multiselect)
                                 checked={active}
                                 onChange={() => toggleOne(id)}
                                 onClick={(e) => e.stopPropagation()}
                                 className="perm__toggle perm__toggle--radio" // ← doar pentru stil
                                 aria-label={full || `User #${id}`}
                              />
                           </div>
                        </li>
                     );
                  })}
               </ul>
            </div>

            {/* Footer */}
            <div className="instructors-popup__btns permision__btns">
               <div style={{ flex: 1 }} />

               <button
                  className="instructors-popup__form-button instructors-popup__form-button--save"
                  onClick={handleGrant}
                  disabled={selectedCount === 0 || busy}
                  title={
                     selectedCount === 0
                        ? "Selectează cel puțin un elev"
                        : undefined
                  }
               >
                  {busy ? "Se acordă…" : "Acordă permisiunea"}
               </button>
            </div>
         </div>

         <AlertPills messages={alerts} onDismiss={popAlert} />
      </>
   );
}
