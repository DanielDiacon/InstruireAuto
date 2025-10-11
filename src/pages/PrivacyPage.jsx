// src/pages/PrivacyPage.jsx
import React, { useEffect } from "react";

const UpdatedAt = () => {
   const d = new Date();
   const pretty = d.toLocaleDateString("ro-RO", {
      day: "2-digit",
      month: "long",
      year: "numeric",
   });
   return <span style={{ opacity: 0.8 }}>Ultima actualizare: {pretty}</span>;
};

function Section({ title, children, id }) {
   return (
      <section id={id} className="sign__conditii" style={{ paddingBottom: 8 }}>
         <h1 className="sign__title" style={{ marginBottom: 8 }}>
            {title}
         </h1>
         <p className="sign__subtitle">
            <UpdatedAt />
         </p>
         <div className="sign__conditii-body" style={{ gap: 12 }}>
            {children}
         </div>
      </section>
   );
}

export default function PrivacyPage() {
   useEffect(() => {
      document.title = "Instruire Auto | Politica de Confidențialitate";
   }, []);

   return (
      <main className="main-sign">
         <div className="container">
            <div className="sign termeni-conditii">
               <div className="sign__switcher --active">
                  <Section
                     title="Politica de Confidențialitate"
                     id="confidentialitate"
                  >
                     <article>
                        <h3 className="sign__subtitle">1. Ce date colectăm</h3>
                        <p>
                           Putem colecta: date de identificare (nume, prenume),
                           date de contact (telefon, e-mail), date de programare
                           (date/ore, instructor ales, sector), informații de
                           plată (în măsura în care sunt necesare finalizării
                           tranzacției) și date tehnice (loguri, cookie-uri).
                        </p>
                     </article>

                     <article>
                        <h3 className="sign__subtitle">
                           2. Cum folosim datele
                        </h3>
                        <p>
                           Pentru crearea contului, gestionarea programărilor,
                           comunicări operaționale (notificări, confirmări),
                           îmbunătățirea serviciului, respectarea obligațiilor
                           legale și prevenirea fraudelor/abuzurilor.
                        </p>
                     </article>

                     <article>
                        <h3 className="sign__subtitle">3. Baza legală</h3>
                        <p>
                           Executarea contractului (prestarea
                           lecțiilor/programărilor), consimțământ (unde este
                           necesar), interes legitim (securitate, îmbunătățire)
                           și obligații legale (contabilitate, arhivare).
                        </p>
                     </article>

                     <article>
                        <h3 className="sign__subtitle">4. Stocare și Durată</h3>
                        <p>
                           Păstrăm datele doar cât timp este necesar pentru
                           scopurile declarate sau cât impune legea. La
                           expirarea termenelor, datele sunt șterse sau
                           anonimizate în mod sigur.
                        </p>
                     </article>

                     <article>
                        <h3 className="sign__subtitle">5. Partajare</h3>
                        <p>
                           Putem partaja date cu furnizori implicați în operarea
                           Platformei (ex. găzduire, plăți, comunicații) sub
                           acorduri care impun confidențialitate și securitate.
                           Nu vindem date personale.
                        </p>
                     </article>

                     <article>
                        <h3 className="sign__subtitle">6. Drepturile tale</h3>
                        <p>Acces, rectificare, ștergere, restricționare.</p>
                        <p>Portabilitate și opoziție, acolo unde se aplică.</p>
                        <p>
                           Retragerea consimțământului atunci când temeiul este
                           consimțământul.
                        </p>
                        <p>Plângere la autoritatea de protecție a datelor.</p>
                     </article>

                     <article>
                        <h3 className="sign__subtitle">7. Cookie-uri</h3>
                        <p>
                           Folosim cookie-uri pentru funcționalitate, analiză și
                           preferințe. Poți gestiona consimțământul în browser
                           sau prin bannerul de cookie-uri al Platformei.
                        </p>
                     </article>

                     <article>
                        <h3 className="sign__subtitle">8. Securitate</h3>
                        <p>
                           Implementăm măsuri tehnice și organizatorice
                           rezonabile (criptare în tranzit, control acces)
                           pentru protecția datelor. Nicio metodă nu este 100%
                           sigură; în caz de incident, vom acționa conform
                           legii.
                        </p>
                     </article>

                     <article>
                        <h3 className="sign__subtitle">9. Modificări</h3>
                        <p>
                           Putem actualiza prezenta politică. Versiunea curentă
                           este cea afișată pe această pagină.
                        </p>
                     </article>

                     <article>
                        <h3 className="sign__subtitle">10. Contact</h3>
                        <p>
                           Pentru solicitări privind datele tale, folosește
                           datele de contact din aplicație sau formularul
                           dedicat.
                        </p>
                     </article>
                  </Section>
               </div>
            </div>
         </div>
      </main>
   );
}
