// src/pages/TermsPage.jsx
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
      <h1 className="sign__title" style={{ marginBottom: 8 }}>{title}</h1>
      <p className="sign__subtitle"><UpdatedAt /></p>
      <div className="sign__conditii-body" style={{ gap: 12 }}>{children}</div>
    </section>
  );
}

export default function TermsPage() {
  useEffect(() => {
    document.title = "Instruire Auto | Termeni și Condiții";
  }, []);

  return (
    <main className="main-sign">
      <div className="container">
        <div className="sign termeni-conditii">
          <div className="sign__switcher --active">
            <Section title="Termeni și Condiții" id="termeni">
              <article>
                <h3 className="sign__subtitle">1. Scop și Acceptare</h3>
                <p>
                  Prezentele Termeni și Condiții reglementează utilizarea platformei de programări
                  pentru instruire auto (“instruireauto.site”) și serviciile oferite. Prin crearea unui cont,
                  efectuarea unei programări sau utilizarea Platformei, confirmați că ați citit și
                  acceptat acești termeni.
                </p>
              </article>

              <article>
                <h3 className="sign__subtitle">2. Programări și Disponibilitate</h3>
                <p>
                  Intervalele de lecție sunt stabilite în grila vizibilă în aplicație. Confirmarea
                  programării depinde de disponibilitatea instructorului și a elevului. Platforma
                  poate marca anumite intervale ca “Grafic închis” sau “Indisponibil”, caz în care
                  nu se acceptă programări.
                </p>
              </article>

              <article>
                <h3 className="sign__subtitle">3. Plăți și Facturare</h3>
                <p>
                  Tarifele pot fi afișate în aplicație sau comunicate de unitatea de instruire.
                  Plata poate fi efectuată numerar, prin card (în oficiu) sau alte metode comunicate.
                  Orice comisioane externe (bancă, procesatori de plăți) nu sunt în sarcina Platformei.
                  Facturarea se face conform datelor furnizate de utilizator.
                </p>
              </article>

              <article>
                <h3 className="sign__subtitle">4. Anulări și Reprogramări</h3>
                <p>
                  Anularea/reprogramarea unei lecții se poate face din contul de utilizator, cu respectarea
                  termenelor minime comunicate. Lecțiile anulate tardiv sau neprezentările pot fi considerate
                  consumate conform politicilor școlii/instructorului.
                </p>
              </article>

              <article>
                <h3 className="sign__subtitle">5. Obligațiile Utilizatorului</h3>
                <p>Furnizarea de informații corecte (nume, contact, disponibilitate).</p>
                <p>Respectarea programărilor și a instrucțiunilor de siguranță.</p>
                <p>Utilizarea Platformei în scop personal, fără abuz sau încercări de compromitere.</p>
              </article>

              <article>
                <h3 className="sign__subtitle">6. Obligațiile Instructorului/Școlii</h3>
                <p>
                  Asigurarea calității lecțiilor, punctualitate, comunicare clară privind locația,
                  autovehiculul și condițiile lecției. Orice modificări ale programului vor fi anunțate
                  în timp util.
                </p>
              </article>

              <article>
                <h3 className="sign__subtitle">7. Limitarea Răspunderii</h3>
                <p>
                  Platforma este oferită “ca atare”. Nu garantăm funcționarea neîntreruptă sau lipsa erorilor.
                  Nu suntem responsabili pentru întârzieri, anulări, accidente sau daune rezultate din lecțiile
                  desfășurate, acestea intrând în responsabilitatea directă a părților implicate
                  (elev–instructor/școală).
                </p>
              </article>

              <article>
                <h3 className="sign__subtitle">8. Proprietate Intelectuală</h3>
                <p>
                  Conținutul Platformei (marcă, logo, elemente UI, texte) aparține deținătorilor de drept și este
                  protejat de legislația aplicabilă. Orice reutilizare fără permisiune este interzisă.
                </p>
              </article>

              <article>
                <h3 className="sign__subtitle">9. Modificări</h3>
                <p>
                  Putem actualiza periodic acești termeni. Versiunea în vigoare este cea publicată pe această pagină la
                  momentul utilizării Platformei.
                </p>
              </article>

              <article>
                <h3 className="sign__subtitle">10. Contact</h3>
                <p>
                  Pentru întrebări legate de termeni, programări sau plăți, utilizați datele de contact afișate în
                  aplicație sau formularul de asistență.
                </p>
              </article>
            </Section>
          </div>
        </div>
      </div>
    </main>
  );
}
