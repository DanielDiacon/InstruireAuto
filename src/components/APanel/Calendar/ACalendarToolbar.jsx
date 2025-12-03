// src/components/APanel/Calendar/ACalendarToolbar.jsx
import React, { useState, useRef, useCallback, useEffect } from "react";

/* ===== Dropdown reutilizabil (compatibil cu .dv-dd din SCSS-ul tău) ===== */
function SimpleDropdown({
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
      [onChange]
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

/* ===== Toolbar principal pentru calendar ===== */
export default function ACalendarToolbar({
   // lună
   monthOptions,
   currentMonthValue,
   onMonthChange,

   // sector
   sectorOptions,
   sectorFilter,
   onSectorChange,

   // search
   dataReady,
   searchInput,
   onSearchInputChange,
   onSearchRun,
   onSearchClear,
   onSearchPrev,
   onSearchNext,
   searchTotal,
   searchIndex,
   searchInputRef,

   // zoom
   zoomOptions,
   currentZoomValue,
   onZoomChange,
}) {
   const handleSearchKeyDown = useCallback(
      (e) => {
         if (e.key === "Enter") {
            e.preventDefault();
            onSearchRun?.();
         } else if (e.key === "ArrowLeft") {
            if (searchTotal) {
               e.preventDefault();
               onSearchPrev?.();
            }
         } else if (e.key === "ArrowRight") {
            if (searchTotal) {
               e.preventDefault();
               onSearchNext?.();
            }
         } else if (e.key === "Escape") {
            if (searchInput) {
               e.preventDefault();
               onSearchClear?.();
            }
         }
      },
      [onSearchRun, onSearchPrev, onSearchNext, onSearchClear, searchTotal, searchInput]
   );

   return (
      <div className="dayview__header">
         <div className="dayview__header-left">
            <SimpleDropdown
               value={currentMonthValue}
               onChange={onMonthChange}
               options={monthOptions}
               placeholder="Alege luna"
               className="dv-dd--month"
               aria-label="Alege luna"
            />
            <SimpleDropdown
               value={sectorFilter}
               onChange={onSectorChange}
               options={sectorOptions}
               placeholder="Sector"
               className="dv-dd--sector"
               aria-label="Filtrează după sector"
            />
         </div>

         <div className="dayview__toolbar">
            <input
               ref={searchInputRef}
               className="dv-search__input"
               placeholder={
                  dataReady
                     ? "Caută după nume / telefon / notiță…"
                     : "Se încarcă programările…"
               }
               disabled={!dataReady}
               value={searchInput}
               onChange={onSearchInputChange}
               onKeyDown={handleSearchKeyDown}
            />

            <div className="dv-search__nav">
               <button
                  type="button"
                  className="dv-search__btn dv-search__btn--run"
                  disabled={!dataReady}
                  onClick={onSearchRun}
                  title="Caută"
               >
                  🔍
               </button>

               <button
                  type="button"
                  className="dv-search__btn dv-search__btn--clear"
                  disabled={!searchInput}
                  onClick={onSearchClear}
                  title="Șterge căutarea"
               >
                  ✕
               </button>

               <button
                  type="button"
                  className="dv-search__btn dv-search__btn--prev"
                  disabled={!searchTotal}
                  onClick={onSearchPrev}
                  title="Rezultatul anterior"
               >
                  ◀
               </button>

               <span className="dv-search__count">
                  {searchTotal ? `${searchIndex + 1}/${searchTotal}` : "0/0"}
               </span>

               <button
                  type="button"
                  className="dv-search__btn dv-search__btn--next"
                  disabled={!searchTotal}
                  onClick={onSearchNext}
                  title="Rezultatul următor"
               >
                  ▶
               </button>
            </div>

            <SimpleDropdown
               value={currentZoomValue}
               onChange={onZoomChange}
               options={zoomOptions}
               placeholder="Zoom"
               className="dv-dd--zoom"
               aria-label="Nivel zoom"
            />
         </div>
      </div>
   );
}
