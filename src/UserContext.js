// UserContext.jsx
import React, { createContext, useState, useEffect, useContext } from "react";
import { fetchUserInfo } from "./api/authService";

export const UserContext = createContext(null);

export function UserProvider({ children }) {
   // --- User state ---
   const [user, setUser] = useState(null);
   const [loading, setLoading] = useState(true);

   // --- Fetch user info ---
   useEffect(() => {
      async function loadUser() {
         try {
            const userInfo = await fetchUserInfo();
            setUser(userInfo);
         } catch {
            setUser(null);
         } finally {
            setLoading(false);
         }
      }
      loadUser();
   }, []);

   return (
      <UserContext.Provider
         value={{
            user,
            setUser,
            loading,
         }}
      >
         {children}
      </UserContext.Provider>
   );
}

// Hook rapid
export function useUserContext() {
   return useContext(UserContext);
}
