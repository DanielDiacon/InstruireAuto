// src/layouts/AppShell.jsx
import React, { useContext, useEffect, useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import Header from "./components/Header/Header";
import StudentMobileTopBar from "./components/Header/StudentMobileTopBar";
import Popup from "./components/Utils/Popup";
import SubPopup from "./components/Utils/SubPopup";
import PopupUI from "./components/Common/PopupUI";
import { UserContext } from "./UserContext";

export default function AppShell() {
   const { pathname } = useLocation();
   const { user } = useContext(UserContext);

   const isStudentRoute = useMemo(
      () => pathname === "/student" || pathname.startsWith("/student/"),
      [pathname],
   );
   const showStudentMobileTopBar =
      isStudentRoute && String(user?.role || "").toUpperCase() === "USER";

   useEffect(() => {
      document.body.classList.toggle(
         "student-mobile-topbar-enabled",
         showStudentMobileTopBar,
      );
      return () => document.body.classList.remove("student-mobile-topbar-enabled");
   }, [showStudentMobileTopBar]);

   return (
      <>
         <Header />
         {showStudentMobileTopBar && <StudentMobileTopBar />}
         <SubPopup />
         <Popup />
         <PopupUI />
         {/* aici intră paginile */}
         <Outlet />
      </>
   );
}
