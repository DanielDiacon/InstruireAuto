// src/components/Exams/ExamPermissionPanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
   grantExamPermissionExact,
   isoFromNowPlusMinutes,
   isoToSecondsUTC,
   ensureUserExists,
   getMe, // id-ul celui logat (pentru grantedById)
} from "../../api/examService";

export default function ExamPermissionPanel() {
   const [err, setErr] = useState("");
   const [ok, setOk] = useState("");

   const [singleUserId, setSingleUserId] = useState("");

   const [mode, setMode] = useState("minutes"); // "minutes" | "datetime"
   const [validMinutes, setValidMinutes] = useState(60);
   const [validLocal, setValidLocal] = useState(""); // "YYYY-MM-DDTHH:mm"
   const [maxAttempts, setMaxAttempts] = useState(3);
   const [compat, setCompat] = useState(false);

   // id-ul operatorului (grantedById) din /auth/me
   const [meId, setMeId] = useState(undefined);

   useEffect(() => {
      let alive = true;
      (async () => {
         try {
            const me = await getMe();
            const id = Number(me?.id);
            if (alive && Number.isInteger(id) && id > 0) setMeId(id);
         } catch (e) {
            // nu blocăm UI-ul dacă /auth/me nu răspunde
            console.warn("getMe failed:", e?.message || e);
         }
      })();
      return () => {
         alive = false;
      };
   }, []);

   const computedValidUntil = useMemo(() => {
      let iso;
      if (mode === "minutes") {
         iso = isoFromNowPlusMinutes(Number(validMinutes || 0));
      } else {
         if (!validLocal) return null;
         const dt = new Date(validLocal);
         // fixăm secunda la :59
         iso = new Date(
            dt.getFullYear(),
            dt.getMonth(),
            dt.getDate(),
            dt.getHours(),
            dt.getMinutes(),
            59,
            0
         ).toISOString();
      }
      return isoToSecondsUTC(iso);
   }, [mode, validMinutes, validLocal]);

   // helper: construiește payload-ul EFECTIV (același pentru preview și POST).
   const buildPayload = useMemo(() => {
      return (opts = { forPreview: false }) => {
         const uidNum = Number(singleUserId);
         const attemptsNum = Math.max(1, Number(maxAttempts || 1));
         const hasMe = Number.isInteger(meId) && meId > 0;

         // bază numerică (nu pun chei invalide)
         const base = {
            userId: Number.isInteger(uidNum) && uidNum > 0 ? uidNum : undefined,
            validUntil: computedValidUntil || undefined,
            maxAttempts: Number.isFinite(attemptsNum) ? attemptsNum : 1,
            ...(hasMe ? { grantedById: meId } : {}), // DOAR dacă e valid
         };

         // compat -> numericile devin string (doar în payloadul efectiv)
         const asCompat = compat
            ? Object.fromEntries(
                 Object.entries(base).map(([k, v]) => [
                    k,
                    typeof v === "number" ? String(v) : v,
                 ])
              )
            : base;

         // curăță undefined/null din payload
         const finalPayload = Object.fromEntries(
            Object.entries(asCompat).filter(
               ([, v]) => v !== undefined && v !== null
            )
         );

         if (!opts.forPreview) return finalPayload;

         // pentru preview afișăm „(invalid)/(missing)” unde e cazul,
         // dar păstrăm și indicatorul de compat
         return JSON.stringify(
            {
               userId:
                  Number.isInteger(uidNum) && uidNum > 0 ? uidNum : "(invalid)",
               grantedById: hasMe ? meId : "(missing)",
               validUntil: computedValidUntil || "(missing)",
               maxAttempts: Number.isFinite(attemptsNum) ? attemptsNum : 1,
               ...(compat ? { __compat__: "stringify numbers" } : {}),
            },
            null,
            2
         );
      };
   }, [singleUserId, computedValidUntil, maxAttempts, compat, meId]);

   // preview sincron cu ce pleacă efectiv
   const payloadPreview = useMemo(
      () => buildPayload({ forPreview: true }),
      [buildPayload]
   );

   async function handlePreflight() {
      setErr("");
      setOk("");

      const uid = Number(singleUserId);
      if (!Number.isInteger(uid) || uid <= 0) {
         setErr("userId invalid.");
         return;
      }
      try {
         await ensureUserExists(uid);

         if (!computedValidUntil) throw new Error("validUntil lipsă.");
         const now = Date.now();
         const t = Date.parse(computedValidUntil);
         if (!Number.isFinite(t)) throw new Error("validUntil invalid.");
         if (t <= now + 30_000)
            throw new Error(
               "validUntil trebuie să fie în viitor (minim +30s)."
            );

         setOk("Pre-flight OK: user existent, validUntil valid.");
      } catch (e) {
         setErr(`Pre-flight a eșuat: ${e?.message || e}`);
      }
   }

   async function handleGrantSingle() {
      setErr("");
      setOk("");

      const finalPayload = buildPayload();

      // validări minime locale:
      if (!finalPayload.userId) {
         setErr("Introdu un userId valid (număr întreg > 0).");
         return;
      }
      if (!finalPayload.validUntil) {
         setErr("Setează o dată/ora de expirare validă.");
         return;
      }

      try {
         await grantExamPermissionExact(finalPayload);

         // IMPORTANT: arăt DOAR payload-ul TRIMIS (fără răspuns server)
         setOk(
            `Trimis la backend (payload):\n${JSON.stringify(
               finalPayload,
               null,
               2
            )}`
         );
      } catch (e) {
         const msg = String(e?.message || "");
         setErr(msg || "Nu am putut acorda permisiunea.");
      }
   }

   return (
      <div className="exam-permission-panel">
         <h3>Activare permisiune examen</h3>

         {err && <div style={{ color: "red", marginBottom: 8 }}>{err}</div>}
         {ok && (
            <pre
               style={{
                  color: "green",
                  marginBottom: 8,
                  whiteSpace: "pre-wrap",
                  fontFamily: "monospace",
               }}
            >
               {ok}
            </pre>
         )}

         <div
            className="card"
            style={{ display: "grid", gap: 12, maxWidth: 720 }}
         >
            {/* Valabilitate */}
            <div style={{ display: "grid", gap: 8 }}>
               <div style={{ fontWeight: 600 }}>Valabilitate</div>
               <div
                  style={{
                     display: "flex",
                     gap: 12,
                     alignItems: "center",
                     flexWrap: "wrap",
                  }}
               >
                  <label
                     style={{ display: "flex", gap: 6, alignItems: "center" }}
                  >
                     <input
                        type="radio"
                        checked={mode === "minutes"}
                        onChange={() => setMode("minutes")}
                     />
                     <span>+ minute de acum</span>
                  </label>
                  <input
                     type="number"
                     min={1}
                     value={validMinutes}
                     onChange={(e) => setValidMinutes(e.target.value)}
                     style={{ width: 120 }}
                  />

                  <label
                     style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                        marginLeft: 16,
                     }}
                  >
                     <input
                        type="radio"
                        checked={mode === "datetime"}
                        onChange={() => setMode("datetime")}
                     />
                     <span>dată/ora exactă</span>
                  </label>
                  <input
                     type="datetime-local"
                     value={validLocal}
                     onChange={(e) => setValidLocal(e.target.value)}
                  />
               </div>

               <div style={{ fontSize: 12, opacity: 0.8 }}>
                  ValidUntil calculat: <code>{computedValidUntil || "-"}</code>
               </div>
            </div>

            {/* Încercări */}
            <div
               style={{
                  display: "flex",
                  gap: 16,
                  alignItems: "center",
                  flexWrap: "wrap",
               }}
            >
               <label>
                  Încercări maxime
                  <input
                     type="number"
                     min={1}
                     value={maxAttempts}
                     onChange={(e) =>
                        setMaxAttempts(Math.max(1, Number(e.target.value || 1)))
                     }
                     style={{ marginLeft: 8, width: 100 }}
                  />
               </label>
               <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                     type="checkbox"
                     checked={compat}
                     onChange={(e) => setCompat(e.target.checked)}
                  />
                  <span>Compat (trimite câmpuri ca string)</span>
               </label>
            </div>

            <hr />

            {/* Single user */}
            <div style={{ display: "grid", gap: 8 }}>
               <div style={{ fontWeight: 600 }}>
                  Acordă pentru un singur utilizator
               </div>
               <div
                  style={{
                     display: "flex",
                     gap: 8,
                     alignItems: "center",
                     flexWrap: "wrap",
                  }}
               >
                  <input
                     type="number"
                     placeholder="userId"
                     value={singleUserId}
                     onChange={(e) => setSingleUserId(e.target.value)}
                     style={{ width: 160 }}
                  />
                  <button onClick={handleGrantSingle}>
                     Acordă permisiunea
                  </button>
                  <button onClick={handlePreflight}>
                     Rulează pre-flight checks
                  </button>
               </div>
            </div>

            {/* Preview JSON – EXACT ce PLEACĂ la server (cu marcaje pt lipsuri) */}
            <div style={{ display: "grid", gap: 6 }}>
               <div style={{ fontWeight: 600 }}>Payload (preview)</div>
               <textarea
                  readOnly
                  rows={6}
                  value={payloadPreview}
                  style={{
                     fontFamily: "monospace",
                     whiteSpace: "pre",
                     width: "100%",
                  }}
               />
               <div style={{ fontSize: 12, opacity: 0.75 }}>
                  Endpoint: <code>POST /exams/permissions/student</code>&nbsp;|
                  Content-Type:<code> application/json</code>
               </div>
            </div>
         </div>
      </div>
   );
}
