// src/api/examService.js
import apiClientService from "./ApiClientService";

/** ==================== UTIL ==================== **/
export function isoFromNowPlusMinutes(minutes = 60) {
   const d = new Date(Date.now() + Number(minutes) * 60_000);
   return d.toISOString();
}
export function isoPlusMinutesUTC(minutes = 60) {
   return new Date(Date.now() + minutes * 60_000).toISOString();
}

/** ==================== AUTH / ROLE HELPERS ==================== **/
export async function getMe() {
   const res = await apiClientService.get("/auth/me");
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`getMe ${res.status}: ${text}`);
   }
   return await res.json(); // ex: { id, role, ... }
}

export async function assertAdminOrManager() {
   const me = await getMe();
   const role = String(me?.role || "").toLowerCase();
   const ok = role === "admin" || role === "manager";
   if (!ok) throw new Error("AUTH_ROLE: required Admin/Manager");
   return true;
}

/** ==================== PERMISSIONS (student – status) ==================== **/
// GET /exams/permissions/my-status
export async function getMyPermissionStatus() {
   const res = await apiClientService.get("/exams/permissions/my-status");
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(`getMyPermissionStatus ${res.status}: ${text}`);
   }
   return await res.json();
}

/** ==================== EXAMS (student) ==================== **/
// helper intern pentru a încerca mai multe variante de start
async function __tryStart(label, url, bodyObj) {
   const bodyStr = bodyObj ? JSON.stringify(bodyObj) : "{}";
   console.log("%c[API →] startExam try", "color:#0a0;font-weight:bold", {
      label,
      url,
      body: bodyObj,
   });
   const res = await apiClientService.post(
      url,
      bodyStr,
      "application/json; charset=UTF-8"
   );
   const text = await res.text().catch(() => "");
   let data;
   try {
      data = text ? JSON.parse(text) : undefined;
   } catch {
      data = text;
   }
   console.log("%c[API ←] startExam try", "color:#06c;font-weight:bold", {
      label,
      status: res.status,
      data,
   });
   return { ok: res.ok, status: res.status, data, text };
}

/**
 * Încearcă rute + payload-uri alternative:
 *  1) POST /exams         { userId, ticketId, timeLimit?, passScore? }
 *  2) POST /exams         { userId, ticketIds:[ticketId], timeLimit?, passScore? }
 *  3) POST /exams         { ticketId }
 *  4) POST /exams         { ticketIds:[ticketId] }
 *  5) POST /exams         { userId }
 *  6) POST /exams         {}
 *  7–12) la /exams/start cu aceleași variante (fallback)
 */
export async function startExamSmart({
   userId,
   ticketId,
   timeLimit,
   passScore,
} = {}) {
   const uid = Number.parseInt(String(userId), 10);
   const validUid = Number.isInteger(uid) && uid > 0;
   const tid = Number.parseInt(String(ticketId), 10);
   const validTid = Number.isInteger(tid) && tid > 0;

   const withCommon = (obj = {}) => {
      const out = { ...obj };
      const tl = Number.parseInt(String(timeLimit), 10);
      const ps = Number.parseInt(String(passScore), 10);
      if (Number.isInteger(tl) && tl > 0) out.timeLimit = tl;
      if (Number.isInteger(ps) && ps > 0) out.passScore = ps;
      return out;
   };

   const attempts = [];

   // ---- /exams
   if (validUid && validTid)
      attempts.push([
         "1:/exams +userId +ticketId",
         "/exams",
         withCommon({ userId: uid, ticketId: tid }),
      ]);
   if (validUid && validTid)
      attempts.push([
         "2:/exams +userId +ticketIds[]",
         "/exams",
         withCommon({ userId: uid, ticketIds: [tid] }),
      ]);
   if (validTid)
      attempts.push([
         "3:/exams +ticketId",
         "/exams",
         withCommon({ ticketId: tid }),
      ]);
   if (validTid)
      attempts.push([
         "4:/exams +ticketIds[]",
         "/exams",
         withCommon({ ticketIds: [tid] }),
      ]);
   if (validUid)
      attempts.push([
         "5:/exams +userId",
         "/exams",
         withCommon({ userId: uid }),
      ]);
   attempts.push(["6:/exams {}", "/exams", {}]);

   // ---- /exams/start
   if (validUid && validTid)
      attempts.push([
         "7:/exams/start +userId +ticketId",
         "/exams/start",
         withCommon({ userId: uid, ticketId: tid }),
      ]);
   if (validUid && validTid)
      attempts.push([
         "8:/exams/start +userId +ticketIds[]",
         "/exams/start",
         withCommon({ userId: uid, ticketIds: [tid] }),
      ]);
   if (validTid)
      attempts.push([
         "9:/exams/start +ticketId",
         "/exams/start",
         withCommon({ ticketId: tid }),
      ]);
   if (validTid)
      attempts.push([
         "10:/exams/start +ticketIds[]",
         "/exams/start",
         withCommon({ ticketIds: [tid] }),
      ]);
   if (validUid)
      attempts.push([
         "11:/exams/start +userId",
         "/exams/start",
         withCommon({ userId: uid }),
      ]);
   attempts.push(["12:/exams/start {}", "/exams/start", {}]);

   let last;
   for (const [label, url, body] of attempts) {
      last = await __tryStart(label, url, body);
      if (last.ok) return last.data;
      if (![400, 404, 405].includes(last.status)) {
         throw new Error(`startExam ${last.status}: ${last.text}`);
      }
   }

   throw new Error(
      `startExam: toate încercările au eșuat. Ultimul răspuns ${last?.status}: ${last?.text}`
   );
}

// POST /exams
export async function startExam({ userId, timeLimit, passScore } = {}) {
   const uid = Number.parseInt(String(userId), 10);
   if (!Number.isInteger(uid) || uid <= 0) {
      throw new Error("startExam: userId invalid (trebuie INT > 0).");
   }

   const body = { userId: uid };
   const tl = Number.parseInt(String(timeLimit), 10);
   const ps = Number.parseInt(String(passScore), 10);
   if (Number.isInteger(tl) && tl > 0) body.timeLimit = tl;
   if (Number.isInteger(ps) && ps > 0) body.passScore = ps;

   console.log("%c[API →] POST /exams", "color:#0a0;font-weight:bold", body);

   const res = await apiClientService.post(
      "/exams",
      JSON.stringify(body),
      "application/json; charset=UTF-8"
   );

   const text = await res.text().catch(() => "");
   let data;
   try {
      data = text ? JSON.parse(text) : undefined;
   } catch {
      data = text;
   }

   console.log("%c[API ←] /exams", "color:#06c;font-weight:bold", {
      status: res.status,
      data,
   });

   if (!res.ok) {
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(`startExam ${res.status}: ${text}`);
   }

   return data;
}

export async function getExam(examId) {
   const id = encodeURIComponent(String(examId));
   const res = await apiClientService.get(`/exams/${id}`);
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(`getExam ${res.status}: ${text}`);
   }
   return await res.json();
}

// POST /exams/:id/answers

// ====== Answer verification helper (cache local pe ticket) ======
const __ticketCorrectCache = new Map(); // ticketId -> Map(questionId -> correctIndex)

async function __getTicketCorrectMap(ticketId) {
  const tid = Number(ticketId);
  if (!Number.isInteger(tid) || tid <= 0) throw new Error("ticketId invalid.");
  if (__ticketCorrectCache.has(tid)) return __ticketCorrectCache.get(tid);

  const qs = await getTicketQuestions(tid); // are correctAnswer
  const map = new Map();
  (qs || []).forEach((q) => {
    const qid = Number(q?.id);
    const ci = Number(q?.correctAnswer);
    if (Number.isInteger(qid) && q?.correctAnswer != null) {
      map.set(qid, ci);
    }
  });
  __ticketCorrectCache.set(tid, map);
  return map;
}

/**
 * Trimite răspunsul la backend și întoarce întotdeauna { correct: boolean|null }.
 * Dacă backend-ul nu întoarce `correct`, verifică local folosind răspunsurile corecte ale biletului.
 *
 * @param {number} examId
 * @param {number} ticketId - NECESAR pentru fallback local
 * @param {{questionId:number, selectedAnswer:number, image?:string}} payload
 * @returns {Promise<{correct: boolean|null} & any>}
 */
export async function verifyAndSubmitExamAnswer(examId, ticketId, payload) {
  // 1) POST la backend (surse-of-truth)
  const serverResp = await submitExamAnswer(examId, payload);

  // 2) Dacă serverul spune explicit corect/greșit, ne oprim aici
  if (typeof serverResp?.correct === "boolean") {
    return { ...serverResp, correct: serverResp.correct };
  }

  // 3) Altfel, fallback local: comparăm cu răspunsurile corecte din ticket
  try {
    const cmap = await __getTicketCorrectMap(ticketId);
    const expected = cmap.get(Number(payload.questionId));
    if (Number.isInteger(expected)) {
      const isCorrect = Number(payload.selectedAnswer) === Number(expected);
      return { ...serverResp, correct: isCorrect };
    }
  } catch (_) {
    // ignorăm: în cel mai rău caz corect rămâne null
  }

  return { ...serverResp, correct: null };
}

/** ==================== EXAMS (history) ==================== **/
// GET /exams/history/student?page=&limit=
export async function getStudentExamHistory({ page = 1, limit = 10 } = {}) {
   const params = new URLSearchParams();
   params.set("page", String(page));
   params.set("limit", String(limit));
   const res = await apiClientService.get(
      `/exams/history/student?${params.toString()}`
   );
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(`getStudentExamHistory ${res.status}: ${text}`);
   }
   return await res.json();
}

// GET /exams/history/instructor?page=&limit=
// (util în alte ecrane, dar NU pentru acordarea permisiunilor)
export async function getInstructorExamHistory({ page = 1, limit = 10 } = {}) {
   const params = new URLSearchParams();
   params.set("page", String(page));
   params.set("limit", String(limit));
   const res = await apiClientService.get(
      `/exams/history/instructor?${params.toString()}`
   );
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(`getInstructorExamHistory ${res.status}: ${text}`);
   }
   return await res.json();
}

// POST /exams/reactivate
export async function reactivateExam() {
   const res = await apiClientService.post("/exams/reactivate", "{}");
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(`reactivateExam ${res.status}: ${text}`);
   }
   return await res.json();
}
// src/api/examService.js

/* ... restul codului tău rămâne neschimbat ... */

/** ==================== EXAMS ==================== **/

// Normalizează diverse forme în { correct: boolean|null }
function normalizeCorrectFromServer(raw) {
  if (!raw || typeof raw !== "object") return { correct: null, _raw: raw };

  // cele mai comune
  if (typeof raw.correct === "boolean") return { correct: raw.correct, _raw: raw };
  if (typeof raw.isCorrect === "boolean") return { correct: raw.isCorrect, _raw: raw };
  if (typeof raw.right === "boolean") return { correct: raw.right, _raw: raw };

  // stringy
  const r = String(raw.result || raw.status || "").toUpperCase();
  if (r === "CORRECT" || r === "RIGHT" || r === "OK" || r === "TRUE") {
    return { correct: true, _raw: raw };
  }
  if (r === "WRONG" || r === "INCORRECT" || r === "FALSE") {
    return { correct: false, _raw: raw };
  }

  return { correct: null, _raw: raw };
}

// POST /exams/:id/answers – TRIMITE la backend la fiecare întrebare și întoarce {correct}
export async function submitExamAnswer(examId, { questionId, selectedAnswer, image }) {
  const id = encodeURIComponent(String(examId));
  const body = JSON.stringify({
    questionId: Number(questionId),
    selectedAnswer: Number(selectedAnswer),
    ...(image ? { image } : {}),
  });

  const res = await apiClientService.post(`/exams/${id}/answers`, body, "application/json; charset=UTF-8");
  const text = await res.text().catch(() => "");
  let data; try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }

  if (!res.ok) {
    if (res.status === 401) throw new Error("AUTH_401");
    if (res.status === 403) throw new Error("AUTH_403");
    throw new Error(`submitExamAnswer ${res.status}: ${text}`);
  }

  const norm = normalizeCorrectFromServer(data);
  return { ...data, correct: norm.correct };
}

/* ... restul fișierului tău rămâne la fel ... */

/** ==================== TICKETS (opțional) ==================== **/
export async function getTicket(id) {
   const tid = encodeURIComponent(String(id));
   const res = await apiClientService.get(`/exams/tickets/${tid}`);
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      if (res.status === 404) throw new Error("TICKET_404");
      throw new Error(`getTicket ${res.status}: ${text}`);
   }
   return await res.json();
}
export async function getTicketQuestions(ticketId) {
   const tid = encodeURIComponent(String(ticketId));
   const res = await apiClientService.get(`/exams/tickets/${tid}/questions`);
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      if (res.status === 404) throw new Error("TICKET_404");
      throw new Error(`getTicketQuestions ${res.status}: ${text}`);
   }
   return await res.json();
}

/** ==================== PERMISSIONS (Admin/Manager) ==================== **/
export function isoToSecondsUTC(dateIso) {
   const d = new Date(dateIso);
   const pad = (n) => String(n).padStart(2, "0");
   return (
      d.getUTCFullYear() +
      "-" +
      pad(d.getUTCMonth() + 1) +
      "-" +
      pad(d.getUTCDate()) +
      "T" +
      pad(d.getUTCHours()) +
      ":" +
      pad(d.getUTCMinutes()) +
      ":" +
      pad(d.getUTCSeconds()) +
      "Z"
   );
}

// înlocuiește întreaga funcție exportată grantExamPermissionExact cu aceasta

// înlocuiește întreaga funcție exportată cu cea de mai jos
export async function grantExamPermissionExact({
  userId,
  validUntil,
  maxAttempts = 1,
  grantedById,      // opțional; dacă nu e INT valid, NU îl trimitem deloc
  // compat ignorat intenționat; serverul cere numbers
}) {
  // — coerce strict la INT —
  const uid = Number.parseInt(String(userId), 10);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new Error("userId invalid (trebuie INT > 0).");
  }

  let attempts = Number.parseInt(String(maxAttempts), 10);
  if (!Number.isInteger(attempts) || attempts < 1) attempts = 1;

  if (!validUntil) throw new Error("validUntil lipsă (ISO).");

  // grantedById: trimite DOAR dacă e INT; altfel omite câmpul
  let gby = Number.parseInt(String(grantedById), 10);
  if (!Number.isInteger(gby) || gby <= 0) {
    try {
      const me = await getMe();
      const id = Number.parseInt(String(me?.id), 10);
      if (Number.isInteger(id) && id > 0) gby = id;
      else gby = undefined;
    } catch {
      gby = undefined;
    }
  }

  const payload = {
    userId: uid,                        // number
    validUntil: String(validUntil),     // ISO string e OK
    maxAttempts: attempts,              // number
    ...(Number.isInteger(gby) && gby > 0 ? { grantedById: gby } : {}),
  };

  // trimite NUMAI numere pentru câmpurile numerice
  const res = await apiClientService.post(
    "/exams/permissions/student",
    JSON.stringify(payload),
    "application/json; charset=UTF-8"
  );
  const text = await res.text().catch(() => "");
  let data; try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }

  if (!res.ok) {
    if (res.status === 401) throw new Error("AUTH_401");
    if (res.status === 403) throw new Error("AUTH_403");
    // vezi exact ce-a răspuns serverul
    throw new Error(`grantExamPermissionExact ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

// POST /exams/permissions/students/bulk
export async function grantExamPermissionBulk({
   userIds = [],
   validUntil,
   maxAttempts = 1,
   skipRoleCheck = false,
}) {
   if (!skipRoleCheck) await assertAdminOrManager();

   const ids = (userIds || [])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
   if (!ids.length) throw new Error("Lista userIds este goală.");

   const body = JSON.stringify({
      userIds: ids,
      validUntil: validUntil || isoFromNowPlusMinutes(60),
      maxAttempts: Number(maxAttempts),
   });
   const res = await apiClientService.post(
      "/exams/permissions/students/bulk",
      body
   );
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(`grantExamPermissionBulk ${res.status}: ${text}`);
   }
   return await res.json();
}

/** ==================== PRACTICE (compat pentru PracticeStatistics) ==================== **/
export async function getMyPracticeHistory({ page = 1, limit = 10 } = {}) {
   const params = new URLSearchParams();
   params.set("page", String(page));
   params.set("limit", String(limit));
   const res = await apiClientService.get(
      `/exams/practice/history/my?${params.toString()}`
   );
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(`getMyPracticeHistory ${res.status}: ${text}`);
   }
   return await res.json();
}

export async function getAllMyPracticeHistory({
   pageSize = 50,
   maxPages = 10,
} = {}) {
   const all = [];
   for (let page = 1; page <= maxPages; page++) {
      const batch = await getMyPracticeHistory({ page, limit: pageSize });
      const items = Array.isArray(batch)
         ? batch
         : batch?.data || batch?.items || batch?.results || [];
      if (!items || items.length === 0) break;
      all.push(...items);

      const totalPages =
         batch?.pagination?.totalPages ??
         batch?.meta?.totalPages ??
         batch?.totalPages ??
         null;

      if (totalPages && page >= totalPages) break;
      if (!totalPages) break;
   }
   return all;
}

export function normalizePracticeHistoryItem(item) {
   const ticketId = item.ticketId ?? item.ticket?.id ?? item.ticketID ?? null;
   const ticketName =
      item.ticketName ?? item.ticket?.name ?? item.ticketTitle ?? null;

   const total =
      item.total ??
      item.totalQuestions ??
      item.questionsTotal ??
      item.total_items ??
      0;

   const correct =
      item.correct ??
      item.correctCount ??
      item.progress?.correct ??
      item.right ??
      0;

   const wrong =
      item.wrong ??
      item.wrongCount ??
      item.progress?.wrong ??
      item.incorrect ??
      0;

   const unanswered =
      item.unanswered ??
      item.progress?.unanswered ??
      Math.max(0, Number(total) - Number(correct) - Number(wrong));

   const finishedAt =
      item.completedAt ?? item.finishedAt ?? item.endedAt ?? null;
   const startedAt = item.startedAt ?? item.createdAt ?? item.started ?? null;
   const status = item.status ?? (finishedAt ? "FINISHED" : "IN_PROGRESS");

   let scorePct = null;
   const rawScore = item.score ?? item.scorePct ?? item.percentage ?? null;
   if (typeof rawScore === "number" && isFinite(rawScore)) {
      scorePct =
         rawScore <= 1
            ? Math.round(rawScore * 10000) / 100
            : Math.round(rawScore * 100) / 100;
   } else if (typeof rawScore === "string") {
      const n = Number(rawScore);
      if (!Number.isNaN(n)) {
         scorePct =
            n <= 1 ? Math.round(n * 10000) / 100 : Math.round(n * 100) / 100;
      }
   }

   return {
      id:
         item.id ??
         `${ticketId ?? ticketName ?? "unknown"}-${
            finishedAt || startedAt || Date.now()
         }`,
      ticketId: ticketId ?? null,
      ticketName: ticketName ?? null,
      total: Number(total || 0),
      correct: Number(correct || 0),
      wrong: Number(wrong || 0),
      unanswered: Number(unanswered || 0),
      finishedAt: finishedAt || null,
      startedAt: startedAt || null,
      status,
      scorePct,
      source: item.source || "server",
      raw: item,
   };
}

export function loadLocalPracticeResults() {
   const out = [];
   for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const m = k && k.match(/^practice_attempt_result_(\d+)_(\d+)$/);
      if (!m) continue;
      const ticketId = Number(m[1]);
      try {
         const obj = JSON.parse(localStorage.getItem(k) || "{}");
         out.push({
            id: `local-${ticketId}-${m[2]}`,
            ticketId,
            ticketName: null,
            total:
               obj.total ??
               (typeof obj.ok === "number" &&
               typeof obj.bad === "number" &&
               typeof obj.skip === "number"
                  ? obj.ok + obj.bad + obj.skip
                  : 0),
            correct: Number(obj.ok ?? 0),
            wrong: Number(obj.bad ?? 0),
            unanswered: Number(obj.skip ?? 0),
            finishedAt: obj.finishedAt || null,
            startedAt: null,
            status: "FINISHED",
            scorePct: null,
            source: "local",
         });
      } catch {}
   }
   return out.sort((a, b) => {
      const ta = a.finishedAt ? Date.parse(a.finishedAt) : 0;
      const tb = b.finishedAt ? Date.parse(b.finishedAt) : 0;
      return tb - ta;
   });
}

export async function getPracticeStats({ pageSize = 50, maxPages = 10 } = {}) {
   try {
      const srv = await getAllMyPracticeHistory({ pageSize, maxPages });
      const items = (srv || []).map((x) =>
         normalizePracticeHistoryItem({ ...x, source: "server" })
      );
      return { items, source: "server-practice" };
   } catch (e) {
      const msg = String(e?.message || "");
      if (/getMyPracticeHistory 404:/i.test(msg)) {
         try {
            const page1 = await getStudentExamHistory({
               page: 1,
               limit: pageSize,
            });
            const arr = Array.isArray(page1)
               ? page1
               : page1?.data || page1?.items || page1?.results || [];
            const items = (arr || []).map((x) =>
               normalizePracticeHistoryItem({ ...x, source: "server-exams" })
            );
            return { items, source: "server-exams" };
         } catch (e2) {
            const msg2 = String(e2?.message || "");
            if (
               msg2 === "AUTH_401" ||
               msg2 === "AUTH_403" ||
               /Network|Failed to fetch|TypeError: fetch/i.test(msg2)
            ) {
               const items = loadLocalPracticeResults();
               return { items, source: "local" };
            }
            throw e2;
         }
      }

      if (
         msg === "AUTH_401" ||
         msg === "AUTH_403" ||
         /Network|Failed to fetch|TypeError: fetch/i.test(msg)
      ) {
         const items = loadLocalPracticeResults();
         return { items, source: "local" };
      }

      throw e;
   }
}

/** ==================== DEV AUTO-TEST (dezactivat în prod) ==================== **/
const __AUTO_TEST_FLAG__ = false;
const __AUTO_TEST_KEY__ = "AUTO_TEST_GRANT_RAN";

(async () => {
   try {
      const isDev =
         typeof process !== "undefined" &&
         process?.env?.NODE_ENV !== "production";
      const runFromWindow =
         typeof window !== "undefined" && window.__RUN_EXAM_TEST__ === true;
      const alreadyRan =
         typeof window !== "undefined" &&
         window.localStorage?.getItem(__AUTO_TEST_KEY__);

      if (!alreadyRan && (isDev || __AUTO_TEST_FLAG__ || runFromWindow)) {
         try {
            window.localStorage?.setItem(__AUTO_TEST_KEY__, "1");
         } catch {}

         // rulează doar dacă e Admin/Manager
         try {
            await assertAdminOrManager();
         } catch {
            console.warn("[AUTO TEST] Sărit: nu e Admin/Manager.");
            return;
         }

         const testUserId = 11;
         const validUntil = isoToSecondsUTC(isoFromNowPlusMinutes(90));
         const attempts = 3;
         const compat = false;

         console.log("[AUTO TEST] Trimit permisiune examen de test...", {
            userId: testUserId,
            validUntil,
            maxAttempts: attempts,
            compat,
         });

         const resp = await grantExamPermissionExact({
            userId: testUserId,
            validUntil,
            maxAttempts: attempts,
            compat,
            skipRoleCheck: true, // deja am verificat mai sus
         });

         console.log("[AUTO TEST] OK:", resp);
      }
   } catch (e) {
      console.error("[AUTO TEST] Eroare:", e?.message || e);
      try {
         window.localStorage?.removeItem(__AUTO_TEST_KEY__);
      } catch {}
   }
})();

/** ==================== TICKETS LISTING ==================== **/
export async function getTickets({ type = "EXAM", page = 1, limit = 50 } = {}) {
   const params = new URLSearchParams();
   params.set("page", String(page));
   params.set("limit", String(limit));
   if (type) params.set("type", String(type));
   const res = await apiClientService.get(
      `/exams/tickets?${params.toString()}`
   );
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(`getTickets ${res.status}: ${text}`);
   }
   return await res.json();
}

export async function getAllExamTickets({ pageSize = 50, maxPages = 20 } = {}) {
   const out = [];
   for (let page = 1; page <= maxPages; page++) {
      const batch = await getTickets({ type: "EXAM", page, limit: pageSize });
      const items = Array.isArray(batch)
         ? batch
         : batch?.data || batch?.items || batch?.results || [];
      if (!items?.length) break;

      out.push(...items);

      const totalPages =
         batch?.pagination?.totalPages ??
         batch?.meta?.totalPages ??
         batch?.totalPages ??
         null;

      if (totalPages && page >= totalPages) break;
      if (!totalPages && items.length < pageSize) break;
   }
   return out;
}

/** ==================== PERMISSIONS (self-student) ==================== **/
// grant pentru userul autentificat (NU folosi pentru instructor/admin)
export async function grantMyExamPermission() {
   const res = await apiClientService.post(
      "/exams/permissions/student",
      "{}",
      "application/json; charset=UTF-8"
   );
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(`grantMyExamPermission ${res.status}: ${text}`);
   }
   return await res.json();
}

/** ==================== (LEGACY) – NU FOLOSI PT. PERMISIUNI ==================== **/
// Lăsată pentru alte ecrane/diagrame, dar NU folosi această funcție
// ca “validare de rol” pentru acordare permisiuni.
export async function pingInstructorRole() {
   const res = await apiClientService.get(
      "/exams/history/instructor?page=1&limit=1"
   );
   if (!res.ok) {
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(
         `pingInstructorRole ${res.status}: ${await res.text().catch(() => "")}`
      );
   }
   return true;
}

export async function ensureUserExists(userId) {
   const res = await apiClientService.get(
      `/users/${encodeURIComponent(String(userId))}`
   );
   if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`USER_${res.status}: ${txt || "Userul nu există"}`);
   }
   return true;
}
