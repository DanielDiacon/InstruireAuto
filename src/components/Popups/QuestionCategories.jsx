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

/* ===========================
   CONFIG
=========================== */
const QUESTIONS_PAGE_SIZE = 1000;

/* ===========================
   CATEGORY HELPERS
=========================== */
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

/* ===========================
   LOCAL SEARCH (RO + RU)
   - DOAR în textul întrebării (RO/RU)
   - fără ID, fără answers, fără content/questionText
   - token based:
      * 1 char  -> nu căutăm
      * 2 chars -> match doar la început de cuvânt
      * 3+      -> match pe segmente (substring)
=========================== */

function foldText(input) {
   const s = String(input ?? "");
   return s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // diacritice latine
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function safeJsonParseMaybe(s) {
   if (typeof s !== "string") return null;
   const t = s.trim();
   if (!t) return null;
   if (!(t.startsWith("{") || t.startsWith("["))) return null;
   try {
      return JSON.parse(t);
   } catch {
      return null;
   }
}

function pickLangAny(raw, lang) {
   if (raw == null) return "";

   if (typeof raw === "object") {
      return String(
         raw?.[lang] ??
            raw?.ro ??
            raw?.ru ??
            raw?.RO ??
            raw?.RU ??
            raw?.["ro-RO"] ??
            raw?.["ru-RU"] ??
            ""
      ).trim();
   }

   if (typeof raw === "string") {
      const t = raw.trim();
      if (!t) return "";
      const parsed = safeJsonParseMaybe(t);
      if (parsed && typeof parsed === "object")
         return pickLangAny(parsed, lang);
      return t;
   }

   return String(raw).trim();
}

function tokenizeQuery(query) {
   const q = foldText(query);
   if (!q) return [];
   return q.split(" ").filter(Boolean);
}

/** ===== Matching rules ===== */
const MIN_TOKEN_LEN = 2; // 2 litere -> permis
const SUBSTRING_TOKEN_LEN = 3; // 3+ -> substring match

function normalizeTokens(tokens) {
   return (tokens || [])
      .map((t) => String(t || "").trim())
      .filter(Boolean)
      .map((t) => t); // deja sunt "folded" din tokenizeQuery, dar păstrăm simplu
}

function hasUsableTokens(tokens) {
   const toks = normalizeTokens(tokens);
   return toks.some((t) => t.length >= MIN_TOKEN_LEN);
}

/**
 * token match:
 *  - len >= 3: substring în foldedText
 *  - len == 2: doar început de cuvânt (în wordedText: " ... pe...")
 */
function tokenMatch(foldedText, wordedText, tok) {
   const folded = String(foldedText || "");
   const worded = String(wordedText || "");

   if (!tok) return true;

   if (tok.length >= SUBSTRING_TOKEN_LEN) {
      return folded.includes(tok);
   }

   // len == 2: început de cuvânt
   // worded are forma " <text> " => include(" pe") acoperă și început de string
   return worded.includes(` ${tok}`);
}

function matchesAllTokensSmart(foldedText, wordedText, tokens) {
   const toks = normalizeTokens(tokens).filter(
      (t) => t.length >= MIN_TOKEN_LEN
   );
   if (!toks.length) return false;

   for (const tok of toks) {
      if (!tokenMatch(foldedText, wordedText, tok)) return false;
   }
   return true;
}

/**
 * Index DOAR pe textul întrebării (RO/RU).
 */
function buildQuestionSearchIndex(qItem) {
   const roText = pickLangAny(qItem?.text, "ro");
   const ruText = pickLangAny(qItem?.text, "ru");

   const roFold = foldText(roText);
   const ruFold = foldText(ruText);

   const combinedFold = foldText([roText, ruText].filter(Boolean).join(" "));

   // “worded” pentru match început de cuvânt (2 litere)
   const roW = ` ${roFold} `;
   const ruW = ` ${ruFold} `;
   const combinedW = ` ${combinedFold} `;

   return {
      roText,
      ruText,
      roFold,
      ruFold,
      combinedFold,
      roW,
      ruW,
      combinedW,
   };
}

/**
 * Match:
 *  - toate token-urile trebuie să existe în combined (RO+RU)
 *  - source = RO / RU / MIX
 */
function matchQuestionTextSmart(idx, queryTokens) {
   if (!hasUsableTokens(queryTokens)) return { matches: false, source: "" };
   if (!idx?.combinedFold) return { matches: false, source: "" };

   const inCombined = matchesAllTokensSmart(
      idx.combinedFold,
      idx.combinedW,
      queryTokens
   );
   if (!inCombined) return { matches: false, source: "" };

   const inRo = idx.roFold
      ? matchesAllTokensSmart(idx.roFold, idx.roW, queryTokens)
      : false;

   const inRu = idx.ruFold
      ? matchesAllTokensSmart(idx.ruFold, idx.ruW, queryTokens)
      : false;

   if (inRo && !inRu) return { matches: true, source: "RO" };
   if (inRu && !inRo) return { matches: true, source: "RU" };
   return { matches: true, source: "MIX" };
}

/* ===========================
   HIGHLIGHT (tokens)
   - 2 litere: highlight doar la început de cuvânt
   - 3+: highlight substring
=========================== */
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

function highlightTokens(original, tokens) {
   const text = String(original ?? "");
   const toks = normalizeTokens(tokens).filter(
      (t) => t.length >= MIN_TOKEN_LEN
   );
   if (!toks.length) return text;

   const { folded, map } = foldWithMap(text);
   if (!folded) return text;

   const hits = [];

   const pushHit = (startFoldIdx, len) => {
      const startOrig = map[startFoldIdx];
      const endOrig = map[Math.min(startFoldIdx + len - 1, map.length - 1)] + 1;
      if (startOrig == null || endOrig == null) return;
      hits.push({ start: startOrig, end: endOrig });
   };

   for (const tok of toks) {
      if (tok.length >= SUBSTRING_TOKEN_LEN) {
         let from = 0;
         while (true) {
            const idx = folded.indexOf(tok, from);
            if (idx === -1) break;
            pushHit(idx, tok.length);
            from = idx + tok.length;
            if (from >= folded.length) break;
         }
      } else {
         // tok len == 2: doar început de cuvânt
         // 1) dacă începe chiar de la început
         if (folded.startsWith(tok)) pushHit(0, tok.length);

         // 2) toate aparițiile după spațiu: " pe"
         let from = 0;
         while (true) {
            const p = folded.indexOf(` ${tok}`, from);
            if (p === -1) break;
            const startTok = p + 1;
            pushHit(startTok, tok.length);
            from = startTok + tok.length;
            if (from >= folded.length) break;
         }
      }
   }

   if (!hits.length) return text;

   // merge intervals
   hits.sort((a, b) => a.start - b.start);
   const merged = [];
   for (const h of hits) {
      const last = merged[merged.length - 1];
      if (!last || h.start > last.end) merged.push({ ...h });
      else last.end = Math.max(last.end, h.end);
   }

   const out = [];
   let cursor = 0;
   for (let i = 0; i < merged.length; i++) {
      const h = merged[i];
      if (h.start > cursor) out.push(text.slice(cursor, h.start));
      out.push(
         <span key={`hlt-${i}-${h.start}`} className="highlight">
            {text.slice(h.start, h.end)}
         </span>
      );
      cursor = h.end;
   }
   if (cursor < text.length) out.push(text.slice(cursor));
   return out;
}

/**
 * Debug snippet: arată unde apare PRIMUL token “potrivit” conform regulilor.
 */
function findTokenSnippetTokens(originalText, tokens) {
   const text = String(originalText ?? "");
   const toks = normalizeTokens(tokens).filter(
      (t) => t.length >= MIN_TOKEN_LEN
   );
   if (!text || !toks.length) return "";

   const { folded, map } = foldWithMap(text);
   if (!folded) return "";

   let bestFoldIdx = -1;
   let bestLen = 0;

   for (const tok of toks) {
      let idx = -1;

      if (tok.length >= SUBSTRING_TOKEN_LEN) {
         idx = folded.indexOf(tok);
      } else {
         // len == 2: început de cuvânt
         if (folded.startsWith(tok)) idx = 0;
         else {
            const p = folded.indexOf(` ${tok}`);
            if (p !== -1) idx = p + 1;
         }
      }

      if (idx !== -1 && (bestFoldIdx === -1 || idx < bestFoldIdx)) {
         bestFoldIdx = idx;
         bestLen = tok.length;
      }
   }

   if (bestFoldIdx === -1) return "";

   const startOrig = map[bestFoldIdx] ?? 0;
   const endOrig =
      map[Math.min(bestFoldIdx + bestLen - 1, map.length - 1)] ?? startOrig;

   const start = Math.max(0, startOrig - 25);
   const end = Math.min(text.length, endOrig + 1 + 25);
   return text.slice(start, end);
}

function qTitle(q) {
   const ro = pickLangAny(q?.text, "ro");
   const ru = pickLangAny(q?.text, "ru");
   return (
      ro ||
      ru ||
      String(q?.content ?? q?.questionText ?? "").trim() ||
      "(fără text)"
   );
}

/* ===========================
   COMPONENT
=========================== */
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

   // Inline Questions UI
   const [qTab, setQTab] = useState("search"); // search | added
   const [qSearch, setQSearch] = useState("");
   const [busyQuestionId, setBusyQuestionId] = useState(null);

   // Local cache
   const [allQuestions, setAllQuestions] = useState([]);
   const [allLoading, setAllLoading] = useState(false);
   const [allReady, setAllReady] = useState(false);
   const [allError, setAllError] = useState("");
   const [allScanned, setAllScanned] = useState(0);

   const [listLimit, setListLimit] = useState(QUESTIONS_PAGE_SIZE);

   const allLoadRef = useRef({ token: 0 });

   // ✅ cache index (DOAR text RO/RU) per questionId
   const indexCacheRef = useRef(new Map());

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

   const loadCategories = useCallback(async () => {
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
      loadCategories();
   }, [loadCategories]);

   const filteredCategories = useMemo(() => {
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
         await loadCategories();
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
         await loadCategories();
      } catch (e) {
         pushAlert("error", e?.message || "Eroare la ștergere.");
      } finally {
         setSaving(false);
      }
   };

   const thisCatId = useMemo(() => {
      const n = Number(editing?.id);
      return Number.isFinite(n) ? n : null;
   }, [editing?.id]);

   // ===========================
   // LOAD ALL QUESTIONS ONCE
   // ===========================
   const loadAllQuestionsOnce = useCallback(async () => {
      allLoadRef.current.token += 1;
      const myToken = allLoadRef.current.token;

      setAllLoading(true);
      setAllReady(false);
      setAllError("");
      setAllScanned(0);
      setAllQuestions([]);

      // reset index cache
      indexCacheRef.current = new Map();

      try {
         const map = new Map();
         let page = 1;
         let safety = 0;

         while (safety < 5000) {
            safety += 1;

            const raw = await searchQuestions({
               page,
               limit: QUESTIONS_PAGE_SIZE,
            });

            if (allLoadRef.current.token !== myToken) return;

            const rows = normalizeQuestionsPaged(raw);
            for (const r of rows || []) {
               const id = String(r?.id);
               if (!id) continue;
               map.set(id, r);
            }

            setAllScanned(map.size);

            if ((rows || []).length < QUESTIONS_PAGE_SIZE) break;
            page += 1;
         }

         if (allLoadRef.current.token !== myToken) return;

         setAllQuestions(Array.from(map.values()));
         setAllReady(true);
      } catch (e) {
         if (allLoadRef.current.token !== myToken) return;
         setAllQuestions([]);
         setAllReady(false);
         setAllError(
            e?.message || "Nu am putut încărca lista completă de întrebări."
         );
      } finally {
         if (allLoadRef.current.token === myToken) setAllLoading(false);
      }
   }, []);

   // init când intri în edit
   useEffect(() => {
      if (view !== "form") return;
      if (!editing?.id) return;

      setQTab("search");
      setQSearch("");
      setBusyQuestionId(null);
      setListLimit(QUESTIONS_PAGE_SIZE);

      loadAllQuestionsOnce();
   }, [view, editing?.id, loadAllQuestionsOnce]);

   useEffect(() => {
      setListLimit(QUESTIONS_PAGE_SIZE);
   }, [qTab, qSearch]);

   // ===========================
   // DERIVED LISTS
   // ===========================
   const addedQuestions = useMemo(() => {
      if (!allReady || thisCatId == null) return [];
      return (allQuestions || []).filter((qq) => {
         const cid = qq?.categoryId == null ? null : Number(qq.categoryId);
         return cid === thisCatId;
      });
   }, [allReady, allQuestions, thisCatId]);

   const candidateQuestions = useMemo(() => {
      if (!allReady || thisCatId == null) return [];
      return (allQuestions || []).filter((qq) => {
         const cid = qq?.categoryId == null ? null : Number(qq.categoryId);
         return cid !== thisCatId; // exclude deja adăugate
      });
   }, [allReady, allQuestions, thisCatId]);

   const searchTokens = useMemo(() => tokenizeQuery(qSearch), [qSearch]);
   const canSearch = useMemo(
      () => hasUsableTokens(searchTokens),
      [searchTokens]
   );

   // ✅ local search (DOAR text RO/RU) + match source
   const localSearchResultsWithMeta = useMemo(() => {
      if (!allReady) return [];
      if (!canSearch) return [];

      const cache = indexCacheRef.current;
      const out = [];

      for (const qq of candidateQuestions) {
         const idKey = String(qq?.id ?? "");
         if (!idKey) continue;

         let idx = cache.get(idKey);
         if (!idx) {
            idx = buildQuestionSearchIndex(qq);
            cache.set(idKey, idx);
         }

         const res = matchQuestionTextSmart(idx, searchTokens);
         if (res.matches) out.push({ q: qq, matchSource: res.source });
      }

      return out;
   }, [allReady, candidateQuestions, searchTokens, canSearch]);

   const currentCategoryFromList = useMemo(() => {
      if (!thisCatId) return editing;
      return (items || []).find((x) => Number(x?.id) === thisCatId) || editing;
   }, [items, editing, thisCatId]);

   const addedCount = useMemo(() => {
      return getCount(currentCategoryFromList) || (addedQuestions || []).length;
   }, [currentCategoryFromList, addedQuestions]);

   // ===========================
   // TOGGLE QUESTION CATEGORY
   // ===========================
   const toggleQuestionCategory = async (qItem) => {
      if (thisCatId == null || !qItem?.id) return;

      const currentCatId =
         qItem?.categoryId == null ? null : Number(qItem.categoryId);
      const isInThisCategory = currentCatId === thisCatId;
      const nextCategoryId = isInThisCategory ? null : thisCatId;

      const qid = Number(qItem.id);
      setBusyQuestionId(String(qid));

      try {
         const payload = buildQuestionUpdatePayload(qItem, nextCategoryId);
         await updateQuestion(qid, payload);

         setAllQuestions((prev) =>
            (prev || []).map((x) =>
               Number(x?.id) === qid ? { ...x, categoryId: nextCategoryId } : x
            )
         );

         // cache index invalidation pentru item-ul schimbat
         try {
            indexCacheRef.current.delete(String(qid));
         } catch {}

         pushAlert(
            "success",
            isInThisCategory
               ? "Întrebarea a fost scoasă."
               : "Întrebarea a fost adăugată."
         );

         await loadCategories();
      } catch (e) {
         pushAlert("error", e?.message || "Nu am putut salva modificarea.");
      } finally {
         setBusyQuestionId(null);
      }
   };

   /* ===========================
     RENDER: CATEGORIES LIST
  =========================== */
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
               ) : filteredCategories.length === 0 ? (
                  <div className="popupui__history-placeholder">
                     Nu există categorii.
                  </div>
               ) : (
                  filteredCategories.map((c) => {
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

   /* ===========================
     RENDER: INLINE QUESTIONS
  =========================== */
   const renderInlineQuestions = () => {
      if (thisCatId == null) return null;

      if (!allReady) {
         return (
            <>
               <div className="popupui__search-header">
                  <input
                     type="text"
                     className="popupui__search-input"
                     placeholder="Căutare locală (după indexare completă)"
                     value={qSearch}
                     onChange={(e) => setQSearch(e.target.value)}
                     disabled
                  />

                  <button className="popupui__btn popupui__btn--save" disabled>
                     Caută
                  </button>

                  <button
                     className="popupui__btn popupui__btn--normal"
                     disabled
                  >
                     Adăugate ({addedCount})
                  </button>

                  <button
                     className="popupui__btn popupui__btn--normal"
                     onClick={loadAllQuestionsOnce}
                     disabled={allLoading}
                     title="Reîncarcă lista completă"
                  >
                     {allLoading ? "Se încarcă…" : "Reîncarcă"}
                  </button>
               </div>

               <div className="popupui__history-line">
                  {allError ? (
                     <span style={{ color: "var(--danger, #ff4d4f)" }}>
                        {allError}
                     </span>
                  ) : (
                     <>
                        Se încarcă lista completă… scanate: <b>{allScanned}</b>
                        {allLoading ? " • încărcare în curs…" : ""}
                     </>
                  )}
               </div>

               <div className="popupui__search-list-wrapper">
                  <ul className="popupui__search-list">
                     <li className="popupui__column-item">
                        <div className="popupui__column-item-top">
                           <p>
                              {allError
                                 ? "Nu pot indexa întrebările. Apasă Reîncarcă."
                                 : `După indexare, poți căuta pe segmente (min ${MIN_TOKEN_LEN} caractere/token).`}
                           </p>
                        </div>
                     </li>
                  </ul>
               </div>
            </>
         );
      }

      const queryTrim = String(qSearch || "").trim();
      const isSearchTab = qTab === "search";
      const isAddedTab = qTab === "added";

      let activeFullList = [];
      let modeLabel = "";

      if (isAddedTab) {
         activeFullList = addedQuestions.map((x) => ({
            q: x,
            matchSource: "",
         }));
         modeLabel = `Adăugate: ${activeFullList.length}`;
      } else {
         if (queryTrim) {
            if (!canSearch) {
               activeFullList = [];
               modeLabel = `Scrie minim ${MIN_TOKEN_LEN} caractere pentru căutare.`;
            } else {
               activeFullList = localSearchResultsWithMeta;
               modeLabel = `Caut: "${queryTrim}" • găsite: ${activeFullList.length}`;
            }
         } else {
            activeFullList = candidateQuestions.map((x) => ({
               q: x,
               matchSource: "",
            }));
            modeLabel = `Candidați (neadăugați): ${activeFullList.length}`;
         }
      }

      const visible = activeFullList.slice(0, listLimit);
      const hasMore = activeFullList.length > visible.length;

      return (
         <>
            <div className="popupui__search-header">
               {isSearchTab ? (
                  <input
                     type="text"
                     className="popupui__search-input"
                     placeholder={`Caută întrebare (min ${MIN_TOKEN_LEN} litere/token; 2 litere=început de cuvânt, 3+=segment)`}
                     value={qSearch}
                     onChange={(e) => setQSearch(e.target.value)}
                  />
               ) : (
                  <div
                     className="popupui__search-input"
                     style={{ opacity: 0.8 }}
                  >
                     Întrebări adăugate în această categorie
                  </div>
               )}

               <button
                  className={
                     "popupui__btn " +
                     (qTab === "search"
                        ? "popupui__btn--save"
                        : "popupui__btn--normal")
                  }
                  onClick={() => setQTab("search")}
               >
                  Caută
               </button>

               <button
                  className={
                     "popupui__btn " +
                     (qTab === "added"
                        ? "popupui__btn--save"
                        : "popupui__btn--normal")
                  }
                  onClick={() => setQTab("added")}
               >
                  Adăugate
               </button>
            </div>

            <div className="popupui__history-line">{modeLabel}</div>

            <div className="popupui__search-list-wrapper">
               <ul className="popupui__search-list">
                  {visible.length === 0 ? (
                     <li className="popupui__column-item">
                        <div className="popupui__column-item-top">
                           <p>
                              {isAddedTab
                                 ? "Nu există întrebări adăugate."
                                 : queryTrim
                                 ? canSearch
                                    ? "Nu există rezultate."
                                    : `Scrie minim ${MIN_TOKEN_LEN} caractere.`
                                 : "Nu există candidați."}
                           </p>
                        </div>
                     </li>
                  ) : (
                     visible.map(({ q: qq, matchSource }) => {
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
                                    {isSearchTab && queryTrim
                                       ? highlightTokens(title, searchTokens)
                                       : title}
                                 </h3>

                                 {/*<div>
                                    <p>
                                       ID: {qid}
                                       {isAddedTab
                                          ? ` • în categoria #${thisCatId}`
                                          : qCatId == null
                                          ? " • fără categorie"
                                          : ` • în categoria #${qCatId}`}
                                    </p>

                                    {isSearchTab && queryTrim && canSearch ? (
                                       <div
                                          style={{
                                             opacity: 0.8,
                                             fontSize: 12,
                                             marginTop: 4,
                                          }}
                                       >
                                          Debug match:{" "}
                                          <b>{matchSource || "—"}</b>
                                          {matchSource === "RO" ? (
                                             <>
                                                {" "}
                                                • "
                                                {findTokenSnippetTokens(
                                                   pickLangAny(qq?.text, "ro"),
                                                   searchTokens
                                                )}
                                                "
                                             </>
                                          ) : matchSource === "RU" ? (
                                             <>
                                                {" "}
                                                • "
                                                {findTokenSnippetTokens(
                                                   pickLangAny(qq?.text, "ru"),
                                                   searchTokens
                                                )}
                                                "
                                             </>
                                          ) : matchSource === "MIX" ? (
                                             <>
                                                {" "}
                                                • (token-uri în RO+RU) • "
                                                {findTokenSnippetTokens(
                                                   `${pickLangAny(
                                                      qq?.text,
                                                      "ro"
                                                   )} ${pickLangAny(
                                                      qq?.text,
                                                      "ru"
                                                   )}`,
                                                   searchTokens
                                                )}
                                                "
                                             </>
                                          ) : null}
                                       </div>
                                    ) : null}
                                 </div>*/}
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

                  {hasMore && (
                     <li
                        className="popupui__column-item"
                        style={{
                           justifyContent: "center",
                           gridColumn: "1 / -1",
                        }}
                     >
                        <button
                           className="popupui__btn popupui__btn--normal"
                           onClick={() =>
                              setListLimit((p) => p + QUESTIONS_PAGE_SIZE)
                           }
                        >
                           Încarcă mai multe
                        </button>
                     </li>
                  )}
               </ul>
            </div>
         </>
      );
   };

   /* ===========================
     RENDER: FORM
  =========================== */
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
