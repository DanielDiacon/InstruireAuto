import React, { useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { UserContext } from "./UserContext";
import LoadingOverlay from "./LoadingOverlay";
import { getHomePathForUser, hasAnyRole } from "./auth/access";

const ProtectedRoute = ({ children, allowedRoles }) => {
   const { user, loading } = useContext(UserContext);
   const [showLoading, setShowLoading] = useState(true);

   useEffect(() => {
      if (!loading) {
         const timer = setTimeout(() => setShowLoading(false), 500);
         return () => clearTimeout(timer);
      } else {
         setShowLoading(true);
      }
   }, [loading]);

   // Dacă userul nu e autentificat, du-l pe pagina de login
   if (!user && !loading) return <Navigate to="/" replace />;

   // Dacă userul are rol, dar nu e permis pe ruta asta
   if (user && !hasAnyRole(user, allowedRoles))
      return <Navigate to={getHomePathForUser(user)} replace />;

   return (
      <>
         {showLoading && <LoadingOverlay isVisible={loading} />}
         {(!loading || !showLoading) && children}
      </>
   );
};

export default ProtectedRoute;
