function SOpenProgr({ children }) {
   const handleToggle = () => {
      document.body.classList.toggle("popup-s-add-prog");
   };

   return (
      <button className="popup-toggle-button" onClick={handleToggle}>
         {children}
      </button>
   );
}

export default SOpenProgr;
