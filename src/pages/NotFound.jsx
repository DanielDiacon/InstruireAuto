function NotFound() {
   const smiles = [
      "(• ᴖ •)",
      "(ᗒᗣᗕ)",
      "(._.`)",
      "(꩜ᯅ꩜)",
      "4Ø4",
      "ʕ•ᴥ•ʔ",
      "(ಠ_ಠ)",
      "ᶻ 𝗓 𐰁",
      "4️⃣0️⃣4️⃣",
   ];
   const randNum = Math.floor(Math.random() * smiles.length);
   const smile = smiles[randNum];
   return (
      <section className="error">
         <div className="error__body">
            {/*<p className="error__title">{smile}</p>*/}
            <p className="error__text">
               Unfortunately, this page does not exist.
            </p>
         </div>
      </section>
   );
}
export default NotFound;
