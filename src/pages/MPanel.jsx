import React, { useEffect } from "react";
import Header from "../components/Header/Header";

function MPanel() {
   useEffect(() => {
      document.title = "Instruire Auto | MPanel";
   }, []);
   return (
      <>
         <Header status="manager" />

         <main className="main"></main>
      </>
   );
}

export default MPanel;
