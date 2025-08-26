import { BrowserRouter, Route, Routes } from "react-router-dom";
import React from "react";
import "./App.scss";

import Register from "./pages/Register";
import SignPage from "./pages/SignPage";
import SPanel from "./pages/SPanel";
import MPanel from "./pages/MPanel";
import APanel from "./pages/APanel";
import ProtectedRoute from "./ProtectedRoute";

const App = () => {
   const darkMode = localStorage.getItem("darkMode") === "enabled";

   if (darkMode) {
      document.body.classList.add("darkmode");
      document
         .querySelector('meta[name="theme-color"]')
         ?.setAttribute("content", "hsl(0, 3%, 93%)");
      document
         .querySelector('meta[name="theme-color"]#nav-color-meta')
         ?.setAttribute("content", "hsl(0, 3%, 93%)");
   } else {
      document.body.classList.remove("darkmode");
      document
         .querySelector('meta[name="theme-color"]')
         ?.setAttribute("content", "hsl(240, 0%, 8%)");
      document
         .querySelector('meta[name="theme-color"]#nav-color-meta')
         ?.setAttribute("content", "hsl(240, 0%, 8%)");
   }

   return (
      <BrowserRouter basename="/">
         <div className="App">
            <Routes>
               {/* Paginile protejate */}
               <Route
                  path="/student"
                  element={
                     <ProtectedRoute allowedRoles={["USER"]}>
                        <SPanel />
                     </ProtectedRoute>
                  }
               />

               <Route
                  path="/admin"
                  element={
                     <ProtectedRoute allowedRoles={["ADMIN"]}>
                        <APanel />
                     </ProtectedRoute>
                  }
               />

               <Route
                  path="/manager"
                  element={
                     <ProtectedRoute allowedRoles={["MANAGER"]}>
                        <MPanel />
                     </ProtectedRoute>
                  }
               />
               <Route
                  path="/instructor"
                  element={
                     <ProtectedRoute allowedRoles={["INSTRUCTOR"]}>
                        <SPanel />
                     </ProtectedRoute>
                  }
               />

               {/* Public */}
               <Route path="/register" element={<Register />} />
               <Route path="/" element={<SignPage />} />
            </Routes>
         </div>
      </BrowserRouter>
   );
};

export default App;
