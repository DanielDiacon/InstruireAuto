// src/App.js
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
import { ALLOW } from "./auth/access";

// pages (fără Header în ele)
import SPanel from "./pages/SPanel";
import SPTest from "./pages/SPages/SPTest";
import SPExam from "./pages/SPages/SPExam";
import SPCalendar from "./pages/SPages/SPCalendar";

import APanel from "./pages/APanel";
import APGroups from "./pages/APages/APGroups";
import APCalendar from "./pages/APages/APCalendar";
import APCalendarPlus from "./pages/APages/APCalendarPlus";
import APHistory from "./pages/APages/APHistory";
import APInstrGroups from "./pages/APages/APInstrGroups";

import MPanel from "./pages/MPanel";
import MPGroups from "./pages/MPages/MPGroups";
import MPCalendar from "./pages/MPages/MPCalendar";
import MPCalendarPlus from "./pages/MPages/MPCalendarPlus";
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
      <BrowserRouter
         basename="/"
         future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
         }}
      >
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
                        <ProtectedRoute allowedRoles={ALLOW.STUDENT}>
                           <SPanel />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/student/test"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.STUDENT}>
                           <SPTest />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/student/exam"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.STUDENT}>
                           <SPExam />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/student/calendar"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.STUDENT}>
                           <SPCalendar />
                        </ProtectedRoute>
                     }
                  />

                  {/* ADMIN */}
                  <Route
                     path="/admin"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.ADMIN}>
                           <APanel />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/admin/groups"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.ADMIN}>
                           <APGroups />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/admin/instr-groups"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.ADMIN}>
                           <APInstrGroups />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/admin/calendar"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.ADMIN}>
                           <APCalendar />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/calendarplus"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.ADMIN}>
                           <APCalendarPlus />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/admin/calendarplus"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.ADMIN}>
                           <APCalendarPlus />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/admin/history"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.ADMIN}>
                           <APHistory />
                        </ProtectedRoute>
                     }
                  />

                  {/* MANAGER */}
                  <Route
                     path="/manager"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.MANAGER}>
                           <MPanel />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/manager/groups"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.MANAGER}>
                           <MPGroups />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/manager/instr-groups"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.MANAGER}>
                           <MPInstrGroups />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/manager/calendar"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.MANAGER}>
                           <MPCalendar />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/manager/calendarplus"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.MANAGER}>
                           <MPCalendarPlus />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/manager/history"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.MANAGER}>
                           <MPHistory />
                        </ProtectedRoute>
                     }
                  />

                  {/* PROFESSOR */}
                  <Route
                     path="/professor"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.PROFESSOR}>
                           <PPanel />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/professor/students"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.PROFESSOR}>
                           <PPStudents />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/professor/groups"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.PROFESSOR}>
                           <PPGropus />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/professor/student/:studentId/statistics"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.PROFESSOR}>
                           <PPStudentStatistics />
                        </ProtectedRoute>
                     }
                  />

                  {/* INSTRUCTOR */}
                  <Route
                     path="/instructor"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.INSTRUCTOR}>
                           <IPanel />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/instructor/calendar"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.INSTRUCTOR}>
                           <IPCalendar />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/instructor/today"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.INSTRUCTOR}>
                           <IPToday />
                        </ProtectedRoute>
                     }
                  />
                  <Route
                     path="/instructor/groups"
                     element={
                        <ProtectedRoute allowedRoles={ALLOW.INSTRUCTOR}>
                           <IPInstrGroups />
                        </ProtectedRoute>
                     }
                  />
               </Route>

               <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
         </div>
      </BrowserRouter>
   );
};

export default App;
