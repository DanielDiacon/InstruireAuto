// src/components/Popups/QuestionCategories.jsx
import React, {
   useCallback,
   useEffect,
   useMemo,
   useRef,
   useState,
} from "react";
import AlertPills from "../Utils/AlertPills";

import {
   createQuestionCategory,
   getQuestionCategories,
   getQuestionCategoriesWithCount,
   updateQuestionCategory,
   deleteQuestionCategory,
} from "../../api/questionCategoriesService";

import { searchQuestions, updateQuestion } from "../../api/questionsService";

const getCount = (c) =>
   c?._count?.questions ??
   c?.questionCount ??
   c?.questionsCount ??
   c?.count ??
   c?.totalQuestions ??
   0;

function normalizePagedResponse(raw) {
   if (Array.isArray(raw)) return raw;
   const items =
      raw?.data ||
      raw?.items ||
      raw?.results ||
      raw?.rows ||
      raw?.categories ||
      [];
   return Array.isArray(items) ? items : [];
}

function normalizeQuestionsPaged(raw) {
   if (Array.isArray(raw)) return raw;
   const items =
      raw?.data || // ✅ API-ul tău: { data: [...] }
      raw?.items ||
      raw?.results ||
      raw?.rows ||
      raw?.questions ||
      [];
   return Array.isArray(items) ? items : [];
}

function pickLangText(raw, lang = "ro") {
   if (raw == null) return "";
   if (typeof raw === "string") {
      const s = raw.trim();
      if (!s) return "";
      if (s.startsWith("{") && (s.includes('"ro"') || s.includes('"ru"'))) {
         try {
            const obj = JSON.parse(s);
            return String(obj?.[lang] ?? obj?.ro ?? obj?.ru ?? s).trim();
         } catch {
            return s;
         }
      }
      return s;
   }
   if (typeof raw === "object") {
      return String(raw?.[lang] ?? raw?.ro ?? raw?.ru ?? "").trim();
   }
   return String(raw).trim();
}

const qTitle = (q) => {
   const ro = pickLangText(q?.text, "ro");
   const ru = pickLangText(q?.text, "ru");
   return (
      ro ||
      ru ||
      String(q?.content ?? q?.questionText ?? "").trim() ||
      "(fără text)"
   );
};

function toStringOrJson(x) {
   if (typeof x === "string") return x;
   if (x == null) return "";
   if (typeof x === "object") {
      try {
         return JSON.stringify(x);
      } catch {
         return String(x);
      }
   }
   return String(x);
}

function buildQuestionUpdatePayload(q, nextCategoryId) {
   const text = toStringOrJson(q?.text);

   const rawAnswers = Array.isArray(q?.answers) ? q.answers : [];
   const answers = rawAnswers.map(toStringOrJson);

   const correctAnswer = Number(q?.correctAnswer);
   if (!Number.isInteger(correctAnswer)) {
      throw new Error("Întrebarea nu are `correctAnswer` valid.");
   }

   const payload = {
      text,
      answers,
      correctAnswer,
      categoryId: nextCategoryId == null ? null : Number(nextCategoryId),
   };

   if (q?.image != null) payload.image = String(q.image);
   return payload;
}

function mergeUniqueById(prev, next) {
   const m = new Map((prev || []).map((x) => [String(x?.id), x]));
   (next || []).forEach((x) => m.set(String(x?.id), x));
   return Array.from(m.values());
}

/* ===========================
   LOCAL SEARCH (scan pages) + HIGHLIGHT
=========================== */

function foldText(input) {
   const s = String(input ?? "");
   return s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function foldWithMap(original) {
   const src = String(original ?? "");
   let folded = "";
   const map = [];

   for (let i = 0; i < src.length; i++) {
      const base = src[i].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      for (let k = 0; k < base.length; k++) {
         folded += base[k];
         map.push(i);
      }
   }

   return { folded: folded.toLowerCase(), map, original: src };
}

function highlightText(original, query) {
   const text = String(original ?? "");
   const qFold = foldText(query);
   if (!qFold) return text;

   const { folded, map } = foldWithMap(text);
   if (!folded) return text;

   const hits = [];
   let from = 0;

   while (true) {
      const idx = folded.indexOf(qFold, from);
      if (idx === -1) break;

      const startOrig = map[idx];
      const endFoldIdx = idx + qFold.length - 1;
      const endOrig = map[endFoldIdx] + 1;

      if (hits.length === 0 || startOrig >= hits[hits.length - 1].end) {
         hits.push({ start: startOrig, end: endOrig });
      }

      from = idx + qFold.length;
      if (from >= folded.length) break;
   }

   if (hits.length === 0) return text;

   const out = [];
   let cursor = 0;

   for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      if (h.start > cursor) out.push(text.slice(cursor, h.start));
      out.push(
         <span key={`hl-${i}-${h.start}`} className="highlight">
            {text.slice(h.start, h.end)}
         </span>
      );
      cursor = h.end;
   }

   if (cursor < text.length) out.push(text.slice(cursor));
   return out;
}

function levenshtein(a, b) {
   a = String(a ?? "");
   b = String(b ?? "");
   const m = a.length;
   const n = b.length;
   if (m === 0) return n;
   if (n === 0) return m;

   const dp = new Array(n + 1);
   for (let j = 0; j <= n; j++) dp[j] = j;

   for (let i = 1; i <= m; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
         const tmp = dp[j];
         const cost = a[i - 1] === b[j - 1] ? 0 : 1;
         dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
         prev = tmp;
      }
   }
   return dp[n];
}

function fuzzyIncludes(hay, needle) {
   const h = foldText(hay);
   const n = foldText(needle);

   if (!n) return true;
   if (!h) return false;

   if (h.includes(n)) return true;

   if (n.length >= 4 && h.includes(n.slice(0, -1))) return true;
   if (n.length >= 6 && h.includes(n.slice(0, -2))) return true;

   const words = h.split(" ").filter(Boolean);
   const qTokens = n.split(" ").filter(Boolean);

   const okAll = qTokens.every((t) => {
      return words.some((w) => {
         if (w.includes(t)) return true;
         if (Math.abs(w.length - t.length) > 2) return false;
         return levenshtein(w, t) <= 1;
      });
   });

   return okAll;
}

function questionMatchesLocal(qItem, query) {
   const q = String(query ?? "").trim();
   if (!q) return false;

   if (fuzzyIncludes(qItem?.id, q)) return true;

   const roText = pickLangText(qItem?.text, "ro");
   const ruText = pickLangText(qItem?.text, "ru");
   if (fuzzyIncludes(roText, q) || fuzzyIncludes(ruText, q)) return true;

   const answers = Array.isArray(qItem?.answers) ? qItem.answers : [];
   for (const a of answers) {
      if (a && typeof a === "object") {
         if (fuzzyIncludes(a?.ro, q) || fuzzyIncludes(a?.ru, q)) return true;
      } else {
         if (fuzzyIncludes(a, q)) return true;
      }
   }

   return false;
}

export default function QuestionCategoriesPopup({ onClose }) {
   const [alerts, setAlerts] = useState([]);
   const pushAlert = (type, text) =>
      setAlerts((p) => [...p, { id: Date.now() + Math.random(), type, text }]);
   const popAlert = () => setAlerts((p) => p.slice(0, -1));

   const [view, setView] = useState("list"); // list | form

   const [loading, setLoading] = useState(false);
   const [error, setError] = useState("");
   const [items, setItems] = useState([]);
   const [q, setQ] = useState("");

   const [editing, setEditing] = useState(null);
   const [nameRo, setNameRo] = useState("");
   const [nameRu, setNameRu] = useState("");
   const [saving, setSaving] = useState(false);

   // ===== Inline Questions UI =====
   const [qSearch, setQSearch] = useState("");

   const QUESTIONS_PAGE_SIZE = 60;

   // browse (prima intrare)
   const [browseRes, setBrowseRes] = useState([]);
   const [browsePage, setBrowsePage] = useState(1);
   const [browseHasMore, setBrowseHasMore] = useState(false);
   const [browseLoading, setBrowseLoading] = useState(false);
   const [browseError, setBrowseError] = useState("");

   // scan (când scrii în search)
   const [scanRes, setScanRes] = useState([]);
   const [scanHasMore, setScanHasMore] = useState(false);
   const [scanLoading, setScanLoading] = useState(false);
   const [scanError, setScanError] = useState("");
   const [scanScanned, setScanScanned] = useState(0);

   const [busyQuestionId, setBusyQuestionId] = useState(null);

   const scanRef = useRef({
      token: 0,
      query: "",
      nextPage: 1,
      hasMore: true,
      seenIds: new Set(),
      matches: [],
      targetCount: QUESTIONS_PAGE_SIZE,
   });

   const resetForm = useCallback(() => {
      setEditing(null);
      setNameRo("");
      setNameRu("");
   }, []);

   const openCreate = () => {
      resetForm();
      setView("form");
   };

   const openEdit = (cat) => {
      setEditing(cat);
      setNameRo(cat?.nameRo ?? "");
      setNameRu(cat?.nameRu ?? "");
      setView("form");
   };

   const load = useCallback(async () => {
      setLoading(true);
      setError("");
      try {
         try {
            const data = await getQuestionCategoriesWithCount();
            setItems(Array.isArray(data) ? data : []);
         } catch {
            const raw = await getQuestionCategories(1, 1000);
            setItems(normalizePagedResponse(raw));
         }
      } catch (e) {
         setItems([]);
         setError(e?.message || "Nu am putut încărca categoriile.");
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      load();
   }, [load]);

   const filtered = useMemo(() => {
      const query = (q || "").trim().toLowerCase();
      if (!query) return items;

      return (items || []).filter((c) => {
         const ro = String(c?.nameRo ?? "").toLowerCase();
         const ru = String(c?.nameRu ?? "").toLowerCase();
         const id = String(c?.id ?? "");
         return ro.includes(query) || ru.includes(query) || id.includes(query);
      });
   }, [items, q]);

   const onSave = async () => {
      const payload = {
         nameRo: String(nameRo || "").trim(),
         nameRu: String(nameRu || "").trim(),
      };

      if (!payload.nameRo && !payload.nameRu) {
         pushAlert("error", "Completează cel puțin un nume (RO sau RU).");
         return;
      }

      setSaving(true);
      try {
         if (editing?.id != null) {
            await updateQuestionCategory(editing.id, payload);
            pushAlert("success", "Categoria a fost actualizată.");
         } else {
            await createQuestionCategory(payload);
            pushAlert("success", "Categoria a fost creată.");
         }

         setView("list");
         resetForm();
         await load();
      } catch (e) {
         pushAlert("error", e?.message || "Eroare la salvare.");
      } finally {
         setSaving(false);
      }
   };

   const onDelete = async (cat) => {
      if (!cat?.id) return;
      const ok = window.confirm("Ștergi această categorie?");
      if (!ok) return;

      setSaving(true);
      try {
         await deleteQuestionCategory(cat.id);
         pushAlert("success", "Categoria a fost ștearsă.");
         if (editing?.id === cat.id) {
            setView("list");
            resetForm();
         }
         await load();
      } catch (e) {
         pushAlert("error", e?.message || "Eroare la ștergere.");
      } finally {
         setSaving(false);
      }
   };

   // ===========================
   // BROWSE MODE (prima intrare)
   // ===========================
   const loadBrowsePage = useCallback(
      async ({ page = 1, append = false } = {}) => {
         setBrowseLoading(true);
         setBrowseError("");
         try {
            const raw = await searchQuestions({
               page,
               limit: QUESTIONS_PAGE_SIZE,
            });
            const rows = normalizeQuestionsPaged(raw);

            setBrowseRes((prev) =>
               append ? mergeUniqueById(prev, rows) : rows
            );
            setBrowsePage(page);
            setBrowseHasMore((rows || []).length === QUESTIONS_PAGE_SIZE);
         } catch (e) {
            if (!append) setBrowseRes([]);
            setBrowseHasMore(false);
            setBrowseError(e?.message || "Nu am putut încărca întrebările.");
         } finally {
            setBrowseLoading(false);
         }
      },
      []
   );

   // ===========================
   // SCAN MODE (când scrii)
   // ===========================
   const startScan = useCallback(async ({ query, targetCount } = {}) => {
      const qRaw = String(query ?? "").trim();
      const qFold = foldText(qRaw);

      // dacă user a șters query -> revenim la browse UI
      if (!qFold) {
         scanRef.current.token += 1;
         setScanRes([]);
         setScanHasMore(false);
         setScanLoading(false);
         setScanError("");
         setScanScanned(0);
         return;
      }

      const st = scanRef.current;
      st.token += 1;
      const myToken = st.token;

      st.query = qRaw;
      st.nextPage = 1;
      st.hasMore = true;
      st.seenIds = new Set();
      st.matches = [];
      st.targetCount = Number(targetCount || QUESTIONS_PAGE_SIZE);

      setScanLoading(true);
      setScanError("");
      setScanRes([]);
      setScanHasMore(false);
      setScanScanned(0);

      try {
         let safety = 0;

         while (
            scanRef.current.token === myToken &&
            st.hasMore &&
            st.matches.length < st.targetCount &&
            safety < 600
         ) {
            safety += 1;

            const raw = await searchQuestions({
               page: st.nextPage,
               limit: QUESTIONS_PAGE_SIZE,
            });
            const rows = normalizeQuestionsPaged(raw);

            if ((rows || []).length < QUESTIONS_PAGE_SIZE) st.hasMore = false;
            st.nextPage += 1;

            setScanScanned((p) => p + (rows?.length || 0));

            for (const row of rows || []) {
               const id = String(row?.id);
               if (!id || st.seenIds.has(id)) continue;
               st.seenIds.add(id);

               if (questionMatchesLocal(row, st.query)) st.matches.push(row);
            }

            setScanRes([...st.matches]);
            setScanHasMore(st.hasMore);
         }

         if (st.matches.length === 0)
            setScanError("Nu există rezultate pentru căutarea ta.");
      } catch (e) {
         setScanError(e?.message || "Nu am putut căuta prin întrebări.");
      } finally {
         if (scanRef.current.token === myToken) setScanLoading(false);
      }
   }, []);

   const continueScan = useCallback(async () => {
      const st = scanRef.current;
      if (!foldText(st.query)) return;
      if (!st.hasMore) return;

      st.token += 1;
      const myToken = st.token;

      st.targetCount =
         Number(st.targetCount || QUESTIONS_PAGE_SIZE) + QUESTIONS_PAGE_SIZE;

      setScanLoading(true);
      setScanError("");

      try {
         let safety = 0;

         while (
            scanRef.current.token === myToken &&
            st.hasMore &&
            st.matches.length < st.targetCount &&
            safety < 600
         ) {
            safety += 1;

            const raw = await searchQuestions({
               page: st.nextPage,
               limit: QUESTIONS_PAGE_SIZE,
            });
            const rows = normalizeQuestionsPaged(raw);

            if ((rows || []).length < QUESTIONS_PAGE_SIZE) st.hasMore = false;
            st.nextPage += 1;

            setScanScanned((p) => p + (rows?.length || 0));

            for (const row of rows || []) {
               const id = String(row?.id);
               if (!id || st.seenIds.has(id)) continue;
               st.seenIds.add(id);

               if (questionMatchesLocal(row, st.query)) st.matches.push(row);
            }

            setScanRes([...st.matches]);
            setScanHasMore(st.hasMore);
         }
      } catch (e) {
         setScanError(e?.message || "Nu am putut continua căutarea.");
      } finally {
         if (scanRef.current.token === myToken) setScanLoading(false);
      }
   }, []);

   // ===========================
   // INIT pe intrare în EDIT (form)
   // ===========================
   useEffect(() => {
      if (view !== "form") return;
      if (!editing?.id) return;

      // reset
      setQSearch("");
      setBusyQuestionId(null);

      setScanRes([]);
      setScanHasMore(false);
      setScanLoading(false);
      setScanError("");
      setScanScanned(0);

      setBrowseRes([]);
      setBrowsePage(1);
      setBrowseHasMore(false);
      setBrowseLoading(false);
      setBrowseError("");

      // ✅ la prima intrare: arătăm lista normală + load more
      loadBrowsePage({ page: 1, append: false });
   }, [view, editing?.id, loadBrowsePage]);

   // debounce: dacă user scrie -> scan; dacă șterge -> browse rămâne
   useEffect(() => {
      if (view !== "form") return;
      if (!editing?.id) return;

      const t = setTimeout(() => {
         startScan({ query: qSearch, targetCount: QUESTIONS_PAGE_SIZE });
      }, 300);

      return () => clearTimeout(t);
   }, [view, editing?.id, qSearch, startScan]);

   const toggleQuestionCategory = async (qItem) => {
      if (!editing?.id || !qItem?.id) return;

      const currentCatId =
         qItem?.categoryId == null ? null : Number(qItem.categoryId);
      const targetCatId = Number(editing.id);

      const isInThisCategory = currentCatId === targetCatId;
      const nextCategoryId = isInThisCategory ? null : targetCatId;

      const qid = Number(qItem.id);
      setBusyQuestionId(String(qid));

      try {
         const payload = buildQuestionUpdatePayload(qItem, nextCategoryId);
         await updateQuestion(qid, payload);

         // ✅ update în ambele liste (browse + scan)
         setBrowseRes((prev) =>
            (prev || []).map((x) =>
               Number(x?.id) === qid ? { ...x, categoryId: nextCategoryId } : x
            )
         );
         setScanRes((prev) =>
            (prev || []).map((x) =>
               Number(x?.id) === qid ? { ...x, categoryId: nextCategoryId } : x
            )
         );

         pushAlert(
            "success",
            isInThisCategory
               ? "Întrebarea a fost scoasă."
               : "Întrebarea a fost adăugată."
         );
         await load();
      } catch (e) {
         pushAlert("error", e?.message || "Nu am putut salva modificarea.");
      } finally {
         setBusyQuestionId(null);
      }
   };

   const renderList = () => (
      <>
         <div className="popupui__search-header">
            <input
               type="text"
               className="popupui__search-input"
               placeholder="Caută categorie (RO / RU / ID)"
               value={q}
               onChange={(e) => setQ(e.target.value)}
            />

            <button
               className="popupui__btn popupui__btn--save"
               onClick={openCreate}
            >
               Adaugă
            </button>
         </div>

         <div className="popupui__history-grid-wrapper">
            <div className="popupui__history-grid">
               {error ? (
                  <div className="popupui__history-placeholder">{error}</div>
               ) : loading ? (
                  <div className="popupui__history-placeholder">
                     Se încarcă…
                  </div>
               ) : filtered.length === 0 ? (
                  <div className="popupui__history-placeholder">
                     Nu există categorii.
                  </div>
               ) : (
                  filtered.map((c) => {
                     const ro = c?.nameRo || "(fără RO)";
                     const ru = c?.nameRu || "(fără RU)";
                     const count = getCount(c);

                     return (
                        <div
                           key={c.id}
                           className="popupui__column-item"
                           onClick={() => openEdit(c)}
                           role="button"
                           tabIndex={0}
                        >
                           <div className="popupui__column-item-top">
                              <span className="popupui__history-time">
                                 ID: {c.id}
                              </span>
                              <div className="popupui__history-changes">
                                 <div className="popupui__history-line">
                                    <b>RO:</b>&nbsp;<i>{ro}</i>
                                 </div>
                                 <div className="popupui__history-line">
                                    <b>RU:</b>&nbsp;<i>{ru}</i>
                                 </div>
                                 <div className="popupui__history-line">
                                    <b>Întrebări:</b>&nbsp;<i>{count}</i>
                                 </div>
                              </div>
                           </div>

                           <div
                              className="popupui__column-item-bottom"
                              onClick={(e) => e.stopPropagation()}
                           >
                              <button
                                 className="popupui__btn popupui__btn--edit"
                                 onClick={() => openEdit(c)}
                                 disabled={saving}
                              >
                                 Editează
                              </button>

                              <button
                                 className="popupui__btn popupui__btn--delete"
                                 onClick={() => onDelete(c)}
                                 disabled={saving}
                              >
                                 Șterge
                              </button>
                           </div>
                        </div>
                     );
                  })
               )}
            </div>
         </div>
      </>
   );

   const renderInlineQuestions = () => {
      if (!editing?.id) return null;

      const queryTrim = String(qSearch || "").trim();
      const isSearchMode = !!queryTrim;

      const activeRes = isSearchMode ? scanRes : browseRes;
      const activeLoading = isSearchMode ? scanLoading : browseLoading;
      const activeError = isSearchMode ? scanError : browseError;
      const activeHasMore = isSearchMode ? scanHasMore : browseHasMore;

      const thisCatId = Number(editing.id);

      return (
         <>
            <div className="popupui__search-header">
               <input
                  type="text"
                  className="popupui__search-input"
                  placeholder="Caută întrebare (text / ID) — dacă scrii, caută prin toate"
                  value={qSearch}
                  onChange={(e) => setQSearch(e.target.value)}
               />

               <button
                  className="popupui__btn popupui__btn--normal"
                  onClick={() => {
                     if (isSearchMode) {
                        startScan({
                           query: qSearch,
                           targetCount: QUESTIONS_PAGE_SIZE,
                        });
                     } else {
                        loadBrowsePage({ page: 1, append: false });
                     }
                  }}
                  disabled={activeLoading}
                  title="Reîncarcă"
               >
                  Reîncarcă
               </button>
            </div>

            <div className="popupui__history-line">
               {isSearchMode ? (
                  <>
                     Caut: <b>{queryTrim}</b> • găsite:{" "}
                     <b>{(scanRes || []).length}</b> • scanate:{" "}
                     <b>{scanScanned}</b>
                     {scanLoading ? " • se caută…" : ""}
                  </>
               ) : (
                  <>
                     Afișate: <b>{(browseRes || []).length} </b>
                     {" • "}pagina:
                     <b>{browsePage}</b>
                     {browseLoading ? " • se încarcă…" : ""}
                  </>
               )}
            </div>

            <div className="popupui__search-list-wrapper">
               <ul className="popupui__search-list">
                  {activeError ? (
                     <li className="popupui__column-item">
                        <div className="popupui__column-item-top">
                           <p>{activeError}</p>
                        </div>
                     </li>
                  ) : activeLoading && (activeRes || []).length === 0 ? (
                     <li className="popupui__column-item">
                        <div className="popupui__column-item-top">
                           <p>Se încarcă…</p>
                        </div>
                     </li>
                  ) : (activeRes || []).length === 0 ? (
                     <li className="popupui__column-item">
                        <div className="popupui__column-item-top">
                           <p>Nu există rezultate.</p>
                        </div>
                     </li>
                  ) : (
                     (activeRes || []).map((qq) => {
                        const qid = Number(qq?.id);
                        const isBusy = String(busyQuestionId) === String(qid);

                        const qCatId =
                           qq?.categoryId == null
                              ? null
                              : Number(qq.categoryId);
                        const isInThisCategory = qCatId === thisCatId;

                        const title = qTitle(qq);

                        return (
                           <li
                              key={`q-${qid}`}
                              className="popupui__column-item"
                              onClick={() => {
                                 if (isBusy) return;
                                 toggleQuestionCategory(qq);
                              }}
                              role="button"
                              tabIndex={0}
                           >
                              <div className="popupui__column-item-top">
                                 <h3>
                                    {isSearchMode
                                       ? highlightText(title, qSearch)
                                       : title}
                                 </h3>
                                 <p>
                                    ID: {qid}
                                    {qCatId == null
                                       ? " • fără categorie"
                                       : isInThisCategory
                                       ? ` • în categoria #${thisCatId}`
                                       : ` • în categoria #${qCatId}`}
                                 </p>
                              </div>

                              <div
                                 className="popupui__column-item-bottom"
                                 onClick={(e) => e.stopPropagation()}
                              >
                                 <button
                                    className={
                                       "popupui__btn " +
                                       (isInThisCategory
                                          ? "popupui__btn--delete"
                                          : "popupui__btn--save")
                                    }
                                    disabled={isBusy}
                                    onClick={() => toggleQuestionCategory(qq)}
                                 >
                                    {isBusy
                                       ? "…"
                                       : isInThisCategory
                                       ? "Scoate"
                                       : "Adaugă"}
                                 </button>
                              </div>
                           </li>
                        );
                     })
                  )}

                  {/* ✅ buton la final: browse -> load next page; search -> continue scan */}
                  {activeHasMore && !activeError && (
                     <li
                        className="popupui__column-item"
                        style={{
                           justifyContent: "center",
                           gridColumn: "1 / -1",
                        }}
                     >
                        <button
                           className="popupui__btn popupui__btn--normal"
                           disabled={activeLoading}
                           onClick={() => {
                              if (isSearchMode) {
                                 continueScan();
                              } else {
                                 loadBrowsePage({
                                    page: browsePage + 1,
                                    append: true,
                                 });
                              }
                           }}
                        >
                           {activeLoading ? "Se încarcă…" : "Încarcă mai multe"}
                        </button>
                     </li>
                  )}
               </ul>
            </div>
         </>
      );
   };

   const renderForm = () => {
      const isEdit = editing?.id != null;

      return (
         <>
            <div className="popupui__history-header">
               <button
                  className="popupui__btn popupui__btn--normal"
                  onClick={() => {
                     setView("list");
                     resetForm();
                  }}
                  disabled={saving}
               >
                  Înapoi
               </button>

               <div className="popupui__btns-spacer" />

               {isEdit && (
                  <button
                     className="popupui__btn popupui__btn--delete"
                     onClick={() => onDelete(editing)}
                     disabled={saving}
                  >
                     Șterge
                  </button>
               )}

               <button
                  className="popupui__btn popupui__btn--save"
                  onClick={onSave}
                  disabled={saving}
               >
                  {saving ? "Se salvează…" : "Salvează"}
               </button>
            </div>

            <div className="popupui__history-line">
               {isEdit ? <></> : <b>Creează categorie</b>}
            </div>

            <div className="popupui__form-row popupui__form-row--gap">
               <div className="popupui__field">
                  <span className="popupui__field-label">Nume (RO)</span>
                  <input
                     className="popupui__input popupui__input--simple"
                     value={nameRo}
                     onChange={(e) => setNameRo(e.target.value)}
                     placeholder="Ex: Semne rutiere"
                  />
               </div>

               <div className="popupui__field">
                  <span className="popupui__field-label">Nume (RU)</span>
                  <input
                     className="popupui__input popupui__input--simple"
                     value={nameRu}
                     onChange={(e) => setNameRu(e.target.value)}
                     placeholder="Пример: Дорожные знаки"
                  />
               </div>
            </div>

            {isEdit ? renderInlineQuestions() : null}
         </>
      );
   };

   return (
      <>
         <div className="popup-panel__header">
            <h3 className="popup-panel__title">Categorii întrebări</h3>
         </div>

         <div className="popupui popupui__content">
            {view === "list" ? renderList() : renderForm()}
         </div>

         <AlertPills messages={alerts} onDismiss={popAlert} />
      </>
   );
}
