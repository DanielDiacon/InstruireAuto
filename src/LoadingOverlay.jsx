// LoadingOverlay.jsx
import React from "react";

const LoadingOverlay = ({ isVisible }) => (
   <div className={`loading-overlay ${isVisible ? "fade-in" : "fade-out"}`}>
      <div className="spinner"></div>
      <p>Se încarcă...</p>
   </div>
);

export default LoadingOverlay;
