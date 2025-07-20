import React, { useState, useEffect } from 'react';
import { ReactSVG } from 'react-svg';
import moon from '../../assets/svg/moon.svg';
import sun from '../../assets/svg/sun.svg';

function DarkModeToggle() {
   // Initialize the darkMode state with the value from localStorage or default to 'false'
   const [darkMode, setDarkMode] = useState(
      localStorage.getItem('darkMode') === 'enabled'
   );

   // Update the darkMode state and localStorage when darkMode changes
   useEffect(() => {
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      const metaNavColor = document.querySelector(
         'meta[name="theme-color"]#nav-color-meta'
      );
      if (darkMode) {
         document.body.classList.add('darkmode');
         localStorage.setItem('darkMode', 'enabled');
         metaThemeColor.setAttribute('content', 'hsl(0, 3%, 93%)');
         metaNavColor.setAttribute('content', 'hsl(0, 3%, 93%)');
      } else {
         document.body.classList.remove('darkmode');
         localStorage.setItem('darkMode', 'disabled');
         metaThemeColor.setAttribute('content', 'hsl(240, 0%, 8%)');
         metaNavColor.setAttribute('content', 'hsl(240, 0%, 8%)');
      }
   }, [darkMode]);

   // Function to toggle dark mode when clicking the moon (light mode) icon
   const toggleDarkMode = () => {
      setDarkMode(!darkMode);
   };

   return (
      <ul className="header__settings settings">
         <li className="settings__item">
            <button
               className="settings__mode-btn"
               id="light-mode-toggle"
               onClick={toggleDarkMode} // Toggle to dark mode
            >
               <div className="settings__icons">
                  <ReactSVG
                     className="settings__icon settings__light"
                     src={sun}
                  />
                  <ReactSVG
                     className="settings__icon settings__dark"
                     src={moon}
                  />
               </div>
               <p>Switch</p>
            </button>
         </li>
      </ul>
   );
}

export default DarkModeToggle;
