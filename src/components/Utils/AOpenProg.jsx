function SOpenProgr({ children }) {
   const handleToggle = () => {
      document.body.classList.toggle("popup-a-add-prog");
   };

   return (
      <button className="popup-toggle-button" onClick={handleToggle}>
         {children}
      </button>
   );
}

export default SOpenProgr;
