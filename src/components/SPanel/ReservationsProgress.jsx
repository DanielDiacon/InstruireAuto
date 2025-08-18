import React from "react";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";

export default function ReservationsProgress({ lectiiFinalizate, totalLectii }) {
  const percentage = Math.round((lectiiFinalizate / totalLectii) * 100);

  return (
    <div className="intro__progress">
      <h2>Progresul Tău</h2>
      <div style={{ width: 120, height: 120 }}>
        <CircularProgressbar
          value={percentage === 0 ? 0.1 : percentage}
          text={`${percentage}%`}
          styles={buildStyles({
            textColor: "#333",
            pathColor: "#3b82f6",
            trailColor: "#d1d5db",
            strokeLinecap: "round",
          })}
        />
        <CircularProgressbar
          className="_out"
          value={percentage === 0 ? 100 - 0.1 - 7.78 : 100 - percentage - 7.78}
          styles={buildStyles({
            textColor: "#333",
            pathColor: "#3b82f6",
            trailColor: "#d1d5db",
            strokeLinecap: "round",
          })}
        />
      </div>
      <span>{lectiiFinalizate}/{totalLectii}</span>
    </div>
  );
}
