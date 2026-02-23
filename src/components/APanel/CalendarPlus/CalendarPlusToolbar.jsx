import React from "react";
import { ReactSVG } from "react-svg";

import searchIcon from "../../../assets/svg/search.svg";
import CalendarPlusDropdown from "./CalendarPlusDropdown";

export default function CalendarPlusToolbar({
   dataReady,
   searchInputRef,
   searchInput,
   onSearchInputChange,
   onRunSearch,
   onClearSearch,
   onPrevHit,
   onNextHit,
   searchTotal,
   searchIndex,
   currentZoomValue,
   zoomOptions,
   onZoomChange,
   currentMonthValue,
   monthOptions,
   onMonthChange,
   sectorFilter,
   sectorOptions,
   onSectorChange,
}) {
   return (
      <div className="dayview__header">
         <CalendarPlusDropdown
            value={currentMonthValue}
            onChange={onMonthChange}
            options={monthOptions}
            placeholder="Alege luna"
            className="dv-dd--month"
            aria-label="Alege luna"
         />

         <CalendarPlusDropdown
            value={sectorFilter}
            onChange={onSectorChange}
            options={sectorOptions}
            placeholder="Sector"
            className="dv-dd--sector"
            aria-label="Filtrează după sector"
         />

         <div className="dv-search">
            <div className="dv-search__input-wrapper">
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
                  onKeyDown={(e) => {
                     if (e.key === "Enter") {
                        onRunSearch();
                     } else if (e.key === "ArrowLeft") {
                        if (searchTotal) {
                           e.preventDefault();
                           onPrevHit();
                        }
                     } else if (e.key === "ArrowRight") {
                        if (searchTotal) {
                           e.preventDefault();
                           onNextHit();
                        }
                     } else if (e.key === "Escape") {
                        if (searchInput) {
                           e.preventDefault();
                           onClearSearch();
                        }
                     }
                  }}
               />
               <button
                  type="button"
                  className="dv-search__btn-clear"
                  disabled={!searchInput}
                  onClick={onClearSearch}
                  title="Șterge căutarea"
               >
                  ✕
               </button>
            </div>

            <div className="dv-search__nav">
               <button
                  type="button"
                  className="dv-search__btn"
                  disabled={!dataReady}
                  onClick={onRunSearch}
                  title="Caută"
               >
                  <ReactSVG
                     className="rbc-btn-group__icon react-icon"
                     src={searchIcon}
                  />
               </button>
            </div>

            <div className="dv-search__count-wrapper">
               <span className="dv-search__count">
                  {searchTotal ? `${searchIndex + 1}/${searchTotal}` : "0/0"}
               </span>

               <button
                  type="button"
                  className="dv-search__btn-count"
                  disabled={!searchTotal}
                  onClick={onPrevHit}
                  title="Rezultatul anterior"
               >
                  ◀
               </button>

               <button
                  type="button"
                  className="dv-search__btn-count"
                  disabled={!searchTotal}
                  onClick={onNextHit}
                  title="Rezultatul următor"
               >
                  ▶
               </button>
            </div>
         </div>

         <CalendarPlusDropdown
            value={currentZoomValue}
            onChange={onZoomChange}
            options={zoomOptions}
            placeholder="Zoom"
            className="dv-dd--zoom"
            aria-label="Nivel zoom"
         />
      </div>
   );
}
