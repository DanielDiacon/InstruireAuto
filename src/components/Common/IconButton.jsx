import React from "react";
import UIIcon from "./UIIcon";

const cx = (...a) => a.filter(Boolean).join(" ");

export default function IconButton({
  icon,
  onClick,
  title,
  "aria-label": ariaLabel,
  className = "",
  iconClassName = "",
  disabled = false,
  type = "button",

  // pill = ca în header (padding mare), square = ca în item actions (padding 12)
  variant = "pill", // "pill" | "square"
}) {
  return (
    <button
      type={type}
      className={cx("uiIconButton", `uiIconButton--${variant}`, className)}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel || title}
      disabled={disabled}
    >
      <UIIcon name={icon} className={cx("uiIconButton__icon", iconClassName)} />
    </button>
  );
}
