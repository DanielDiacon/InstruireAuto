import React, { useEffect, useRef } from "react";
import IconButton from "./IconButton";

const cx = (...a) => a.filter(Boolean).join(" ");

export default function SearchToggle({
  open,
  value,
  onValueChange,
  onToggle,
  placeholder = "Caută...",

  // păstrăm compatibilitate cu props-urile tale existente:
  wrapperClassName = "",
  inputClassName = "",
  buttonClassName = "",
  iconClassName = "",

  titleOpen = "Închide",
  titleClosed = "Caută",
  autoFocusOnOpen = true,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (open && autoFocusOnOpen) {
      // focus după animație mică (ca să nu sară)
      const t = setTimeout(() => ref.current?.focus?.(), 80);
      return () => clearTimeout(t);
    }
  }, [open, autoFocusOnOpen]);

  return (
    <div className={cx("uiSearchToggle", open && "is-open", wrapperClassName)}>
      <input
        ref={ref}
        className={cx("uiSearchToggle__input", inputClassName)}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
      />

      <IconButton
        variant="pill"
        className={cx("uiSearchToggle__btn", buttonClassName)}
        icon={open ? "add" : "search"}
        iconClassName={cx(
          "uiSearchToggle__icon",
          open && "is-rotated",
          iconClassName,
        )}
        onClick={onToggle}
        title={open ? titleOpen : titleClosed}
        aria-label={open ? titleOpen : titleClosed}
      />
    </div>
  );
}
