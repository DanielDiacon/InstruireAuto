import { useState, useEffect } from "react";

function useVisibleColumnRange({
   scrollContainerRef,
   dayIndex,
   dayWidth,
   colWidth,
   colGap,
   totalCols,
   bufferCols = 2, // câte coloane în plus să preîncarci stânga/dreapta
}) {
   const [range, setRange] = useState(() => ({
      start: 0,
      end: Math.max(0, Math.min(totalCols - 1, 8)), // ceva mic la început
   }));

   useEffect(() => {
      const scroller = scrollContainerRef?.current;
      if (!scroller || totalCols <= 0) return;

      const colFull = colWidth + colGap;

      const update = () => {
         const scrollLeft = scroller.scrollLeft;
         const viewportWidth = scroller.clientWidth;

         // offset-ul zilei în “linie” (ziua 0 începe de la 0, ziua 1 după dayWidth, etc.)
         const dayOffsetLeft = dayIndex * dayWidth;
         const dayOffsetRight = dayOffsetLeft + dayWidth;

         const viewportLeft = scrollLeft;
         const viewportRight = scrollLeft + viewportWidth;

         // zona efectiv vizibilă din zi (intersecția dintre viewport și zi)
         const visibleLeft = Math.max(viewportLeft, dayOffsetLeft);
         const visibleRight = Math.min(viewportRight, dayOffsetRight);

         if (visibleRight <= visibleLeft) {
            // ziua e complet în afara ecranului – poți să pui range gol sau mic
            setRange({
               start: 0,
               end: -1,
            });
            return;
         }

         // coordonate relative în interiorul zilei
         const relativeLeft = visibleLeft - dayOffsetLeft;
         const relativeRight = visibleRight - dayOffsetLeft;

         let startIdx = Math.floor(relativeLeft / colFull) - bufferCols;
         let endIdx = Math.ceil(relativeRight / colFull) + bufferCols;

         startIdx = Math.max(0, startIdx);
         endIdx = Math.min(totalCols - 1, endIdx);

         setRange({ start: startIdx, end: endIdx });
      };

      update();
      scroller.addEventListener("scroll", update);
      window.addEventListener("resize", update);
      return () => {
         scroller.removeEventListener("scroll", update);
         window.removeEventListener("resize", update);
      };
   }, [
      scrollContainerRef,
      dayIndex,
      dayWidth,
      colWidth,
      colGap,
      totalCols,
      bufferCols,
   ]);

   return range;
}

export default useVisibleColumnRange;
