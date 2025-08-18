import React, { useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { UserContext } from "./UserContext";
import LoadingOverlay from "./LoadingOverlay";

const ProtectedRoute = ({ children, allowedRoles }) => {
   const { user, loading } = useContext(UserContext);
   const [showLoading, setShowLoading] = React.useState(true);

   // La mount, arătăm loading
   // când loading devine false, începem fadeout
   React.useEffect(() => {
      if (!loading) {
         // după 500ms de animație scoatem loading-ul din DOM
         const timer = setTimeout(() => setShowLoading(false), 500);
         return () => clearTimeout(timer);
      } else {
         // dacă iarăși loading === true (ex: refresh), arătăm loading
         setShowLoading(true);
      }
   }, [loading]);

   // Dacă userul nu e autentificat sau nu are rol, redirecționăm direct
   if (!user && !loading) return <Navigate to="/" replace />;
   if (user && !allowedRoles.includes(user.role))
      return <Navigate to="/" replace />;

   return (
      <>
         {showLoading && <LoadingOverlay isVisible={loading} />}
         {(!loading || !showLoading) && children}
      </>
   );
};

export default ProtectedRoute;
