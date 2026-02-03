import React from "react";
import { ReactSVG } from "react-svg";

const M3Link = ({
   text,
   icon,
   type = "accent", // accent | succes | error
   link = "#",
   className = "", // clasa suplimentară opțională
   children,
   ...rest
}) => {
   const classes = `M3Link ${type} ${className}`.trim();

   return (
      <a href={link} className={classes} {...rest}>
         {icon && <ReactSVG className="sign__icon" src={icon} />}
         {children ? children : <span>{text}</span>}
      </a>
   );
};

export default M3Link;
