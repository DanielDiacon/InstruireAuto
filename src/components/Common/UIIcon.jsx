// src/components/Common/UIIcon.jsx
import React from "react";
import { ReactSVG } from "react-svg";

// profile / popup icons
import phone from "../../assets/svg/phone.svg";
import email from "../../assets/svg/email.svg";
import student from "../../assets/svg/student.svg";
import download from "../../assets/svg/download.svg";
import success from "../../assets/svg/success.svg";
import cancel from "../../assets/svg/cancel.svg";
import clock from "../../assets/svg/clock.svg";

// ui/action icons
import edit from "../../assets/svg/edit.svg";
import trash from "../../assets/svg/trash.svg";
import search from "../../assets/svg/search.svg";
import add from "../../assets/svg/add-s.svg";
import eye from "../../assets/svg/eye.svg";
import key from "../../assets/svg/key.svg";
import arrow from "../../assets/svg/arrow-s.svg";

import check from "../../assets/svg/material-symbols--check-rounded.svg";
import close from "../../assets/svg/material-symbols--close-rounded.svg";

export const ICONS = {
   // profile
   phone,
   email,
   student,
   download,

   // status
   success,
   cancel,
   clock,

   // ui/actions
   edit,
   trash,
   search,
   add,
   eye,
   key,
   arrow,

   // toggles / common
   check,
   close,
};

export default function UIIcon({ name, className = "", title, ...rest }) {
   const src = ICONS[name];
   if (!src) return null;

   return (
      <ReactSVG
         src={src}
         className={`uiIcon ${className}`.trim()}
         title={title}
         {...rest}
      />
   );
}
