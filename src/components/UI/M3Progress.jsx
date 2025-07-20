import React from "react";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

const M3Progress = ({ percentage = 75, label = "Progres" }) => {
   return (
      <div style={{ width: 120, height: 120 }}>
         <CircularProgressbar
            value={percentage}
            text={`${percentage}%`}
            styles={buildStyles({
               textColor: "#333",
               pathColor: "#3b82f6", // Albastru modern
               trailColor: "#d1d5db", // Gri pal
               textSize: "16px",
               strokeLinecap: "round",
            })}
         />
         <CircularProgressbar
            className="_out"
            value={100 - percentage - 7.78}
            styles={buildStyles({
               textColor: "#333",
               pathColor: "#3b82f6", // Albastru modern
               trailColor: "#d1d5db", // Gri pal
               textSize: "16px",
               strokeLinecap: "round",
            })}
         />
      </div>
   );
};

export default M3Progress;
