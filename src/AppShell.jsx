// src/layouts/AppShell.jsx
import React from "react";
import { Outlet } from "react-router-dom";

import Header from "./components/Header/Header";
import Popup from "./components/Utils/Popup";
import SubPopup from "./components/Utils/SubPopup";
import PopupUI from "./components/Common/PopupUI";

export default function AppShell() {
   return (
      <>
         <Header />
         <SubPopup />
         <Popup />
         <PopupUI />
         {/* aici intră paginile */}
         <Outlet />
      </>
   );
}
