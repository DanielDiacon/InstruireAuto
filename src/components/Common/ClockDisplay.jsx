import React, { useEffect, useState } from "react";
import Clock from "react-clock";
import "react-clock/dist/Clock.css";
import { ReactSVG } from "react-svg";
import clockBG from "../../assets/svg/clock-bg.svg";

function ClockDisplay() {
   const [value, setValue] = useState(new Date());

   useEffect(() => {
      const interval = setInterval(() => setValue(new Date()), 1000);
      return () => clearInterval(interval);
   }, []);

   return (
      <div className="intro__clock">
         <Clock
            value={value}
            className="material-clock"
            renderMinuteMarks={false}
            renderHourMarks={true}
            renderNumbers={false}
            hourHandLength={40}
            hourHandOppositeLength={5}
            minuteHandLength={60}
            minuteHandOppositeLength={5}
            secondHandLength={70}
            hourHandWidth={4}
            minuteHandWidth={5}
            secondHandWidth={5}
         />
         <ReactSVG className="intro__clock-icon" src={clockBG} />
      </div>
   );
}

export default ClockDisplay;
