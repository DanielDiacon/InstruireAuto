import React from "react";

export default function NextLesson({ nextLesson, nextLessonIndex }) {
  return (
    <div className="intro__date">
      <h3>
        {nextLesson ? new Date(nextLesson.start).getDate() : "--"}
        <span>
          {nextLesson
            ? new Date(nextLesson.start).toLocaleDateString("ro-RO", { month: "short" })
            : ""}
        </span>
      </h3>
      <p>Lecția următoare</p>
      <span>{nextLessonIndex ? `${nextLessonIndex}-a` : "Nicio lecție"}</span>
    </div>
  );
}
