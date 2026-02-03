// src/App.js
import { BrowserRouter, Route, Routes } from "react-router-dom";
import React from "react";
import "./App.scss";

import SignPage from "./pages/SignPage";
import ResetPassword from "./pages/ResetPassword";
import ConfirmReservation from "./pages/ConfirmReservation";
import LegalPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import EnrollFrom from "./pages/EnrollForm";

import ProtectedRoute from "./ProtectedRoute";
import AppShell from "./AppShell";

// pages (fără Header în ele)
import SPanel from "./pages/SPanel";
import SPTest from "./pages/SPages/SPTest";
import SPExam from "./pages/SPages/SPExam";
import SPCalendar from "./pages/SPages/SPCalendar";

import APanel from "./pages/APanel";
import APGroups from "./pages/APages/APGroups";
import APCalendar from "./pages/APages/APCalendar";
import APHistory from "./pages/APages/APHistory";
import APInstrGroups from "./pages/APages/APInstrGroups";

import MPanel from "./pages/MPanel";
import MPGroups from "./pages/MPages/MPGroups";
import MPCalendar from "./pages/MPages/MPCalendar";
import MPHistory from "./pages/MPages/MPHistory";
import MPInstrGroups from "./pages/MPages/MPInstrGroups";

import PPanel from "./pages/PPanel";
import PPStudents from "./pages/PPanel/PPStudents";
import PPGropus from "./pages/PPanel/PPGroups";
import PPStudentStatistics from "./pages/PPanel/PPStudentStatistics";

import IPanel from "./pages/IPanel";
import IPToday from "./pages/IPages/IPToday";
import IPInstrGroups from "./pages/IPages/IPInstrGroups";
import IPCalendar from "./pages/IPages/IPCalendar";

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
               {/* PUBLIC */}
               <Route path="/" element={<SignPage />} />
               <Route path="/enroll" element={<EnrollFrom />} />
               <Route path="/reset-password" element={<ResetPassword />} />
               <Route
                  path="/confirm-reservation/:token"
                  element={<ConfirmReservation />}
               />
               <Route path="/confidentialitate" element={<LegalPage />} />
               <Route path="/termeni" element={<TermsPage />} />

               {/* PROTECTED: Header există O SINGURĂ DATĂ aici */}
               <Route element={<AppShell />}>
                  {/* STUDENT */}
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

                  {/* ADMIN */}
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
                  />
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

                  {/* MANAGER */}
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
                  />
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

                  {/* PROFESSOR */}
                  <Route
                     path="/professor"
                     element={
                        <ProtectedRoute allowedRoles={["PROFESSOR"]}>
                           <PPanel />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/professor/students"
                     element={
                        <ProtectedRoute allowedRoles={["PROFESSOR"]}>
                           <PPStudents />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/professor/groups"
                     element={
                        <ProtectedRoute allowedRoles={["PROFESSOR"]}>
                           <PPGropus />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/professor/student/:studentId/statistics"
                     element={
                        <ProtectedRoute allowedRoles={["PROFESSOR"]}>
                           <PPStudentStatistics />
                        </ProtectedRoute>
                     }
                  />

                  {/* INSTRUCTOR */}
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
               </Route>
            </Routes>
         </div>
      </BrowserRouter>
   );
};

export default App;
