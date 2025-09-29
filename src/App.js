import { BrowserRouter, Route, Routes } from "react-router-dom";
import React from "react";
import "./App.scss";

import Register from "./pages/Register";
import SignPage from "./pages/SignPage";
import ResetPassword from "./pages/ResetPassword";
import SPanel from "./pages/SPanel";
import MPanel from "./pages/MPanel";
import APanel from "./pages/APanel";
import ProtectedRoute from "./ProtectedRoute";
import SPCalendar from "./pages/SPages/SPCalendar";
import IPanel from "./pages/IPanel";
import IPToday from "./pages/IPages/IPToday";
import IPInstrGroups from "./pages/IPages/IPInstrGroups";
import IPCalendar from "./pages/IPages/IPCalendar";
import APGroups from "./pages/APages/APGroups";
import APCalendar from "./pages/APages/APCalendar";
import APHistory from "./pages/APages/APHistory";
import APInstrGroups from "./pages/APages/APInstrGroups";
import MPGroups from "./pages/MPages/MPGroups";
import MPHistory from "./pages/MPages/MPHistory";
import MPCalendar from "./pages/MPages/MPCalendar";
import MPInstrGroups from "./pages/MPages/MPInstrGroups";
import Practice from "./components/SPanel/Practice";
import SPTest from "./pages/SPages/SPTest";
import SPExam from "./pages/SPages/SPExam";
import ConfirmReservation from "./pages/ConfirmReservation";

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
                  path="/student/test"
                  element={
                     <ProtectedRoute allowedRoles={["USER"]}>
                        <SPTest />
                     </ProtectedRoute>
                  }
               />
               <Route
                  path="/student/exam"
                  element={
                     <ProtectedRoute allowedRoles={["USER"]}>
                        <SPExam />
                     </ProtectedRoute>
                  }
               />
               <Route
                  path="/student/calendar"
                  element={
                     <ProtectedRoute allowedRoles={["USER"]}>
                        <SPCalendar />
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
                  path="/admin/groups"
                  element={
                     <ProtectedRoute allowedRoles={["ADMIN"]}>
                        <APGroups />
                     </ProtectedRoute>
                  }
               />
               <Route
                  path="/admin/instr-groups"
                  element={
                     <ProtectedRoute allowedRoles={["ADMIN"]}>
                        <APInstrGroups />
                     </ProtectedRoute>
                  }
               />{" "}
               <Route
                  path="/admin/calendar"
                  element={
                     <ProtectedRoute allowedRoles={["ADMIN"]}>
                        <APCalendar />
                     </ProtectedRoute>
                  }
               />
               <Route
                  path="/admin/history"
                  element={
                     <ProtectedRoute allowedRoles={["ADMIN"]}>
                        <APHistory />
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
                  path="/manager/groups"
                  element={
                     <ProtectedRoute allowedRoles={["MANAGER"]}>
                        <MPGroups />
                     </ProtectedRoute>
                  }
               />
               <Route
                  path="/manager/instr-groups"
                  element={
                     <ProtectedRoute allowedRoles={["MANAGER"]}>
                        <MPInstrGroups />
                     </ProtectedRoute>
                  }
               />{" "}
               <Route
                  path="/manager/calendar"
                  element={
                     <ProtectedRoute allowedRoles={["MANAGER"]}>
                        <MPCalendar />
                     </ProtectedRoute>
                  }
               />
               <Route
                  path="/manager/history"
                  element={
                     <ProtectedRoute allowedRoles={["MANAGER"]}>
                        <MPHistory />
                     </ProtectedRoute>
                  }
               />
               <Route
                  path="/instructor"
                  element={
                     <ProtectedRoute allowedRoles={["INSTRUCTOR"]}>
                        <IPanel />
                     </ProtectedRoute>
                  }
               />
               <Route
                  path="/instructor/calendar"
                  element={
                     <ProtectedRoute allowedRoles={["INSTRUCTOR"]}>
                        <IPCalendar />
                     </ProtectedRoute>
                  }
               />
               <Route
                  path="/instructor/today"
                  element={
                     <ProtectedRoute allowedRoles={["INSTRUCTOR"]}>
                        <IPToday />
                     </ProtectedRoute>
                  }
               />
               <Route
                  path="/instructor/groups"
                  element={
                     <ProtectedRoute allowedRoles={["INSTRUCTOR"]}>
                        <IPInstrGroups />
                     </ProtectedRoute>
                  }
               />
               {/* Public */}
               <Route path="/register" element={<Register />} />
               <Route path="/reset-password" element={<ResetPassword />} />
               <Route
                  path="/confirm-reservation/:token"
                  element={<ConfirmReservation />}
               />
               <Route path="/" element={<SignPage />} />
            </Routes>
         </div>
      </BrowserRouter>
   );
};

export default App;
