import React from "react";

const ITEM_H = 44;     // înălțime rând
const VISIBLE = 7;     // impar, pt. centru clar
const CYCLES = 9;      // repetări pt. efect „infinit”

const mod = (n, m) => ((n % m) + m) % m;

export default function TimeCarousel({
  times,            // [{ eticheta, oraStart }]
  selectedHHMM,     // "HH:mm" sau null
  onChangeHHMM,     // (hhmm) => void
  isAvailableFn,    // (hhmm) => boolean
  itemHeight = ITEM_H,
  visibleCount = VISIBLE,
}) {
  const base = times.length;
  const total = base * CYCLES;
  const midCycle = Math.floor(CYCLES / 2);
  const midStart = midCycle * base;

  const containerRef = React.useRef(null);
  const snapTimerRef = React.useRef(null);

  // index pornire (centrăm pe selecția curentă)
  const initialIdx = React.useMemo(() => {
    const sel = times.findIndex((t) => t.oraStart === selectedHHMM);
    return midStart + (sel >= 0 ? sel : 0);
  }, [selectedHHMM, times, midStart]);

  // poziționare inițială / la schimbare selecție
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = initialIdx * itemHeight;
  }, [initialIdx, itemHeight]);

  // recentrare la mijloc când ne apropiem de margini (instant – fără animație)
  const recenterIfNeeded = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / itemHeight);
    if (idx < base * 2 || idx > total - base * 2) {
      const normalized = mod(idx, base);
      const newIdx = midStart + normalized;
      el.scrollTop = newIdx * itemHeight;
    }
  }, [base, total, midStart, itemHeight]);

  // alegem cel mai apropiat item disponibil și îl centram (smooth)
  const snapToNearest = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    let idx = Math.round(el.scrollTop / itemHeight);
    let best = idx;

    // dacă item-ul din centru e indisponibil, căutăm în jur max o rotație
    for (let off = 0; off <= base; off++) {
      const up = idx - off;
      const down = idx + off;
      const upOk = isAvailableFn(times[mod(up, base)].oraStart);
      const downOk = isAvailableFn(times[mod(down, base)].oraStart);
      if (upOk) { best = up; break; }
      if (downOk) { best = down; break; }
    }

    const normalized = mod(best, base);
    const targetIdx = midStart + normalized;
    el.scrollTo({ top: targetIdx * itemHeight, behavior: "smooth" });

    const hhmm = times[normalized].oraStart;
    if (hhmm !== selectedHHMM) onChangeHHMM(hhmm);
  }, [base, midStart, itemHeight, isAvailableFn, times, selectedHHMM, onChangeHHMM]);

  // scroll handler (debounced pentru snap)
  const onScroll = () => {
    recenterIfNeeded();
    window.clearTimeout(snapTimerRef.current);
    snapTimerRef.current = window.setTimeout(snapToNearest, 110);
  };

  // încetinim wheel-ul (2x mai lent)
  const onWheel = (e) => {
    const el = containerRef.current;
    if (!el) return;
    e.preventDefault();
    el.scrollTop += e.deltaY * 0.5;
    onScroll();
  };

  // click pe item → animăm până în centru (dacă e disponibil schimbăm selecția)
  const onItemClick = (k) => {
    const el = containerRef.current;
    if (!el) return;
    const normalized = mod(k, base);
    const centerIdx = midStart + normalized;
    const hhmm = times[normalized].oraStart;
    el.scrollTo({ top: centerIdx * itemHeight, behavior: "smooth" });
    if (isAvailableFn(hhmm) && hhmm !== selectedHHMM) onChangeHHMM(hhmm);
  };

  const pad = Math.floor(visibleCount / 4) * itemHeight;

  return (
    <div className="tw" onWheel={onWheel}>
      <div
        className="tw__viewport"
        ref={containerRef}
        onScroll={onScroll}
        style={{ height: itemHeight * visibleCount, paddingTop: pad, paddingBottom: pad }}
      >
        <ul className="tw__list">
          {Array.from({ length: total }).map((_, k) => {
            const t = times[k % base];
            const disabled = !isAvailableFn(t.oraStart);
            const selected = t.oraStart === selectedHHMM;
            return (
              <li
                key={k}
                className={
                  "tw__item" +
                  (disabled ? " is-disabled" : "") +
                  (selected ? " is-selected" : "")
                }
                aria-disabled={disabled}
                onClick={() => onItemClick(k)}
              >
                {t.eticheta}
              </li>
            );
          })}
        </ul>
        <div className="tw__window" aria-hidden />
      </div>
    </div>
  );
}
