import React, { useMemo } from "react";
import { ReactSVG } from "react-svg";
import arrowIcon from "../../assets/svg/arrow-s.svg";

const escapeRegExp = (s = "") => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function highlight(text, q, highlightClassName) {
  const t = String(text ?? "");
  const qq = String(q ?? "").trim();
  if (!qq) return t;

  const safe = escapeRegExp(qq);
  const parts = t.split(new RegExp(`(${safe})`, "gi"));

  return parts.map((part, index) =>
    part.toLowerCase() === qq.toLowerCase() ? (
      <i key={index} className={highlightClassName}>
        {part}
      </i>
    ) : (
      part
    ),
  );
}

export default function StudentItem({
  student,
  color,
  initials,
  onOpen,
  highlightQuery = "",
  secondaryText, // ex: phone
  showChevron = true,
  className = "",
  highlightClassName = "studentItem__highlight",
}) {
  const fullName = useMemo(() => {
    const fn = String(student?.firstName || "").trim();
    const ln = String(student?.lastName || "").trim();
    return `${fn} ${ln}`.trim();
  }, [student]);

  const secondary = secondaryText ?? student?.phone ?? "–";

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen?.(student);
    }
  };

  return (
    <div
      className={`studentItem ${className}`}
      onClick={() => onOpen?.(student)}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div
        className="studentItem__avatar"
        aria-hidden="true"
        style={{
          background: color,
          color: "var(--black-p)",
        }}
      >
        <span>{initials}</span>
      </div>

      <div className="studentItem__info">
        <h3 className="studentItem__name">
          {highlight(fullName || "–", highlightQuery, highlightClassName)}
        </h3>
        <p className="studentItem__meta">
          {highlight(secondary, highlightQuery, highlightClassName)}
        </p>
      </div>

      {showChevron && (
        <div className="studentItem__chev" aria-hidden="true">
          <ReactSVG className="studentItem__chevIcon" src={arrowIcon} />
        </div>
      )}
    </div>
  );
}
