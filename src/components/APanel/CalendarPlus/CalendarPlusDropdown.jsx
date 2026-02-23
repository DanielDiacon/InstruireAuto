import React, { useCallback, useEffect, useRef, useState } from "react";

export default function CalendarPlusDropdown({
   value,
   onChange,
   options,
   placeholder = "",
   className = "",
   "aria-label": ariaLabel,
}) {
   const [open, setOpen] = useState(false);
   const ref = useRef(null);

   const handleToggle = useCallback(() => {
      setOpen((v) => !v);
   }, []);

   const handleSelect = useCallback(
      (val) => {
         onChange?.(val);
         setOpen(false);
      },
      [onChange],
   );

   useEffect(() => {
      if (!open) return;
      const onClickOutside = (e) => {
         if (!ref.current) return;
         if (!ref.current.contains(e.target)) setOpen(false);
      };
      document.addEventListener("click", onClickOutside, true);
      return () => document.removeEventListener("click", onClickOutside, true);
   }, [open]);

   const current = options.find((o) => String(o.value) === String(value));
   const label = current?.label ?? placeholder ?? "";

   return (
      <div
         ref={ref}
         className={`dv-dd dv-select ${className || ""}`}
         aria-label={ariaLabel}
      >
         <button
            type="button"
            className="dv-dd__btn dv-dd__trigger"
            onClick={handleToggle}
            aria-haspopup="listbox"
            aria-expanded={open ? "true" : "false"}
         >
            <span className="dv-dd__label">{label}</span>
            <span className="dv-dd__chevron">▾</span>
         </button>
         {open && (
            <div className="dv-dd__menu dv-dd__list" role="listbox">
               {options.map((opt) => {
                  const isActive = String(opt.value) === String(value);
                  return (
                     <button
                        key={opt.value}
                        type="button"
                        className={
                           "dv-dd__option dv-dd__item" +
                           (isActive ? " dv-dd__option--active" : "")
                        }
                        onClick={() => handleSelect(opt.value)}
                        role="option"
                        aria-selected={isActive ? "true" : "false"}
                     >
                        {opt.label}
                     </button>
                  );
               })}
            </div>
         )}
      </div>
   );
}
