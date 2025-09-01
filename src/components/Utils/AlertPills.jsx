// src/components/UI/AlertPills.jsx
import React, { useEffect, useRef, useState } from "react";

export default function AlertPills({ messages = [], onDismiss = () => {} }) {
   // Hooks trebuie chemate indiferent de mesaje
   const [leaving, setLeaving] = useState(false);
   const pillRef = useRef(null);

   const hasMessage = Array.isArray(messages) && messages.length > 0;
   const m = hasMessage ? messages[messages.length - 1] : null;

   // când se schimbă mesajul, resetăm starea de ieșire
   useEffect(() => {
      if (!hasMessage) return;
      setLeaving(false);
   }, [hasMessage, m?.id, m?.text, m?.type]);

   const handleDismiss = () => {
      if (hasMessage && !leaving) setLeaving(true);
   };

   const handleTransitionEnd = (e) => {
      if (!hasMessage) return;
      if (e.target === pillRef.current && leaving) {
         onDismiss(); // abia după animație îl scoatem din state
      }
   };

   // abia acum putem ieși dacă nu e mesaj
   if (!hasMessage) return null;

   return (
      <div className="pillstack" role="region" aria-label="Mesaje sistem">
         <div
            ref={pillRef}
            className={`pill pill--${m.type || "info"} ${
               leaving ? "pill--leaving" : ""
            }`}
            role={m.type === "error" ? "alert" : "status"}
            aria-live={m.type === "error" ? "assertive" : "polite"}
            onClick={handleDismiss}
            onTransitionEnd={handleTransitionEnd}
            tabIndex={0}
            title="Clic pentru a închide"
            onKeyDown={(e) => {
               if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleDismiss();
               }
            }}
         >
            <span className="pill__text">{m.text}</span>
         </div>
      </div>
   );
}
