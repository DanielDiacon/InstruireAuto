function AddInstrBtn({ children }) {
   const handleToggle = () => {
      document.body.classList.toggle("popup-instr-add");
   };

   return (
      <button className="popup-toggle-button" onClick={handleToggle}>
         {children}
      </button>
   );
}

export default AddInstrBtn;
