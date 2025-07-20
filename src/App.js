import { BrowserRouter, Route, Routes } from "react-router-dom";
import React from "react";
import "./App.scss";
import NotFound from "./pages/NotFound";
import Register from "./pages/Register";
import SignPage from "./pages/SignPage";
import SPanel from "./pages/SPanel";
import MPanel from "./pages/MPanel";
import APanel from "./pages/APanel";

const App = () => {
   //document.addEventListener(
   //   "wheel",
   //   function (e) {
   //      if (e.ctrlKey) {
   //         e.preventDefault();
   //      }
   //   },
   //   { passive: false }
   //);
   return (
      <BrowserRouter basename="/">
         <ul style={{ display: "flex", zIndex: 100, right: "0", position: "fixed" }}>
            <li>
               <a style={{ padding: "10px" }} href="/student">
                  student
               </a>
            </li>
            <li>
               <a style={{ padding: "10px" }} href="/manager">
                  manager
               </a>
            </li>
            <li>
               <a style={{ padding: "10px" }} href="/admin">
                  admin
               </a>
            </li>
         </ul>
         <div className="App">
            <Routes>
               <Route path="/student" element={<SPanel />} />
               <Route path="/manager" element={<MPanel />} />
               <Route path="/admin" element={<APanel />} />
               <Route path="register" element={<Register />} />
               <Route path="/" element={<SignPage />} />
               <Route path="*" element={<NotFound />} />
            </Routes>
         </div>
      </BrowserRouter>
   );
};

export default App;
