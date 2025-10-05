// src/api/examService.js
import apiClientService from "./ApiClientService";

/* ============================================================================
   UTIL
============================================================================ */
export function isoFromNowPlusMinutes(minutes = 60) {
   const d = new Date(Date.now() + Number(minutes) * 60_000);
   return d.toISOString();
}
export function isoPlusMinutesUTC(minutes = 60) {
   return new Date(Date.now() + minutes * 60_000).toISOString();
}
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

/* ============================================================================
   AUTH
============================================================================ */
export async function getMe() {
   const res = await apiClientService.get("/auth/me");
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`getMe ${res.status}: ${text}`);
   }
   return await res.json();
}
export async function assertAdminOrManager() {
   const me = await getMe();
   const role = String(me?.role || "").toLowerCase();
   const ok = role === "admin" || role === "manager";
   if (!ok) throw new Error("AUTH_ROLE: required Admin/Manager");
   return true;
}

/* ============================================================================
   HELPERS pentru normalizarea răspunsurilor corect/greșit
============================================================================ */
function normalizeCorrectIdx(raw, answersLen) {
   const n = Number(raw);
   if (!Number.isInteger(n) || answersLen <= 0) return null;
   if (n >= 0 && n < answersLen) return n; // 0-based
   if (n >= 1 && n <= answersLen) return n - 1; // 1-based
   return null;
}
function normalizeCorrectFromServer(raw, answersLen) {
   if (!raw || typeof raw !== "object")
      return { correct: null, correctIdx: null, explanation: null, _raw: raw };

   let correct = null;
   if (typeof raw.correct === "boolean") correct = raw.correct;
   else if (typeof raw.isCorrect === "boolean") correct = raw.isCorrect;
   else if (typeof raw.right === "boolean") correct = raw.right;
   else {
      const r = String(raw.result || raw.status || "").toUpperCase();
      if (["CORRECT", "RIGHT", "OK", "TRUE"].includes(r)) correct = true;
      if (["WRONG", "INCORRECT", "FALSE"].includes(r)) correct = false;
   }

   const correctIdx = normalizeCorrectIdx(
      raw.correctAnswer ?? raw.correctIndex ?? raw.rightIndex,
      answersLen
   );
   const explanation =
      typeof raw.explanation === "string" ? raw.explanation.trim() : null;

   return { correct, correctIdx, explanation, _raw: raw };
}

/* ============================================================================
   PERMISSIONS (student & admin/manager)
============================================================================ */
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

export async function grantExamPermissionExact({
   userId,
   validUntil,
   maxAttempts = 1,
   grantedById, // dacă nu e valid INT, îl omitem
}) {
   const uid = Number.parseInt(String(userId), 10);
   if (!Number.isInteger(uid) || uid <= 0) {
      throw new Error("userId invalid (trebuie INT > 0).");
   }

   let attempts = Number.parseInt(String(maxAttempts), 10);
   if (!Number.isInteger(attempts) || attempts < 1) attempts = 1;
   if (!validUntil) throw new Error("validUntil lipsă (ISO).");

   // determină actorul/grantedById
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
      userId: uid,
      validUntil: String(validUntil),
      maxAttempts: attempts,
      ...(Number.isInteger(gby) && gby > 0 ? { grantedById: gby } : {}),
   };

   const res = await apiClientService.post(
      "/exams/permissions/student",
      JSON.stringify(payload),
      "application/json; charset=UTF-8"
   );
   const text = await res.text().catch(() => "");
   let data;
   try {
      data = text ? JSON.parse(text) : undefined;
   } catch {
      data = text;
   }

   if (!res.ok) {
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(
         `grantExamPermissionExact ${res.status}: ${
            typeof data === "string" ? data : JSON.stringify(data)
         }`
      );
   }
   return data;
}

export async function grantExamPermissionBulk({
   userIds = [],
   validUntil, // ISO (UTC) — dacă lipsește, +60 min
   maxAttempts = 1,
   grantedById,
   skipRoleCheck = false,
}) {
   if (!skipRoleCheck) await assertAdminOrManager();

   const ids = (userIds || [])
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0);
   if (!ids.length) throw new Error("Lista userIds este goală.");

   let actorId = Number(grantedById);
   if (!Number.isInteger(actorId) || actorId <= 0) {
      try {
         const me = await getMe();
         const maybe = Number(me?.id);
         if (Number.isInteger(maybe) && maybe > 0) actorId = maybe;
      } catch (_) {}
   }
   if (!Number.isInteger(actorId) || actorId <= 0) {
      throw new Error("Lipsește grantedById valid.");
   }

   const valid = isoToSecondsUTC(
      (validUntil
         ? new Date(validUntil)
         : new Date(Date.now() + 60 * 60 * 1000)
      ).toISOString()
   );

   const body = JSON.stringify({
      userIds: ids,
      grantedById: actorId,
      validUntil: valid,
      maxAttempts: Number(maxAttempts),
   });

   const res = await apiClientService.post(
      "/exams/permissions/students/bulk",
      body,
      "application/json; charset=UTF-8"
   );
   if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(`grantExamPermissionBulk ${res.status}: ${text}`);
   }
   return await res.json().catch(() => ({}));
}

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

/* ============================================================================
   EXAM
============================================================================ */
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

// POST /exams/:id/answers – întoarce { correct } (și passthrough alte câmpuri)
export async function submitExamAnswer(
   examId,
   { questionId, selectedAnswer, image }
) {
   const id = encodeURIComponent(String(examId));
   const body = JSON.stringify({
      questionId: Number(questionId),
      selectedAnswer: Number(selectedAnswer),
      ...(image ? { image } : {}),
   });

   const res = await apiClientService.post(
      `/exams/${id}/answers`,
      body,
      "application/json; charset=UTF-8"
   );
   const text = await res.text().catch(() => "");
   let data;
   try {
      data = text ? JSON.parse(text) : undefined;
   } catch {
      data = text;
   }

   if (!res.ok) {
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(`submitExamAnswer ${res.status}: ${text}`);
   }

   const norm = normalizeCorrectFromServer(
      data,
      Array.isArray(data?.answers) ? data.answers.length : 0
   );
   return { ...data, correct: norm.correct };
}

// fallback local dacă backend nu spune corect/greșit
const __ticketCorrectCache = new Map(); // ticketId -> Map(questionId -> correctIndex)
async function __getTicketCorrectMap(ticketId) {
   const tid = Number(ticketId);
   if (!Number.isInteger(tid) || tid <= 0) throw new Error("ticketId invalid.");
   if (__ticketCorrectCache.has(tid)) return __ticketCorrectCache.get(tid);
   const qs = await getTicketQuestions(tid);
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
export async function verifyAndSubmitExamAnswer(examId, ticketId, payload) {
   const serverResp = await submitExamAnswer(examId, payload);
   if (typeof serverResp?.correct === "boolean") {
      return { ...serverResp, correct: serverResp.correct };
   }
   try {
      const cmap = await __getTicketCorrectMap(ticketId);
      const expected = cmap.get(Number(payload.questionId));
      if (Number.isInteger(expected)) {
         const isCorrect = Number(payload.selectedAnswer) === Number(expected);
         return { ...serverResp, correct: isCorrect };
      }
   } catch (_) {}
   return { ...serverResp, correct: null };
}

export async function failExam(examId) {
   const id = encodeURIComponent(String(examId));
   const res = await apiClientService.post(
      `/exams/${id}/fail`,
      "{}",
      "application/json; charset=UTF-8"
   );
   const text = await res.text().catch(() => "");
   let data;
   try {
      data = text ? JSON.parse(text) : undefined;
   } catch {
      data = text;
   }
   if (!res.ok && res.status !== 201) {
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      if (res.status === 409) {
         console.warn("[failExam] Exam already finalized (409).");
         return { status: 409, data };
      }
      throw new Error(`failExam ${res.status}: ${text}`);
   }
   return { status: res.status || 201, data };
}

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

/* ============================================================================
   HISTORY (student/instructor)
============================================================================ */
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

// Istoricul pentru un elev anume (smart, încearcă mai multe rute)
export async function getExamHistoryForUser(
   userId,
   { page = 1, limit = 20 } = {}
) {
   const uid = Number(userId);
   if (!Number.isInteger(uid) || uid <= 0) throw new Error("userId invalid.");

   const buildQS = (extra = {}) => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", String(limit));
      Object.entries(extra).forEach(([k, v]) => p.set(k, String(v)));
      return `?${p.toString()}`;
   };

   async function tryGet(url) {
      const res = await apiClientService.get(url);
      const text = await res.text().catch(() => "");
      let data;
      try {
         data = text ? JSON.parse(text) : undefined;
      } catch {
         data = text;
      }
      return { ok: res.ok, status: res.status, data, text };
   }

   const attempts = [
      [
         "student?userId",
         `/exams/history/student${buildQS({ userId: uid })}`,
         true,
      ],
      [
         "instructor?studentId",
         `/exams/history/instructor${buildQS({ studentId: uid })}`,
         false,
      ],
      [
         "instructor?userId",
         `/exams/history/instructor${buildQS({ userId: uid })}`,
         false,
      ],
      [
         "instructor?student",
         `/exams/history/instructor${buildQS({ student: uid })}`,
         false,
      ],
      ["student(self)", `/exams/history/student${buildQS()}`, true],
   ];

   for (const [, url, mustFilter] of attempts) {
      try {
         const r = await tryGet(url);
         if (!r.ok) {
            if ([400, 404, 405].includes(r.status)) continue;
            if (r.status === 401) throw new Error("AUTH_401");
            if (r.status === 403) throw new Error("AUTH_403");
            continue;
         }
         const itemsRaw = Array.isArray(r.data)
            ? r.data
            : r.data?.data || r.data?.items || r.data?.results || [];
         const filtered = mustFilter
            ? (itemsRaw || []).filter((it) => {
                 const ids = [
                    it.userId,
                    it.studentId,
                    it.user?.id,
                    it.student?.id,
                    it.userID,
                    it.studentID,
                 ];
                 return ids.some((x) => Number(x) === uid);
              })
            : itemsRaw;
         if (filtered && filtered.length) {
            return {
               items: filtered,
               pagination: r.data?.pagination ||
                  r.data?.meta || { totalPages: 1 },
            };
         }
      } catch (_) {}
   }

   try {
      const r = await tryGet(`/exams/history/instructor${buildQS()}`);
      if (r.ok) {
         const itemsRaw = Array.isArray(r.data)
            ? r.data
            : r.data?.data || r.data?.items || r.data?.results || [];
         const filtered =
            (itemsRaw || []).filter((it) => {
               const ids = [
                  it.userId,
                  it.studentId,
                  it.user?.id,
                  it.student?.id,
                  it.userID,
                  it.studentID,
               ];
               return ids.some((x) => Number(x) === uid);
            }) || [];
         return {
            items: filtered,
            pagination: r.data?.pagination || r.data?.meta || { totalPages: 1 },
         };
      }
   } catch (_) {}

   return { items: [], pagination: { totalPages: 1 } };
}

/* ============================================================================
   TICKETS
============================================================================ */
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

/* ============================================================================
   PRACTICE
============================================================================ */
// POST /exams/practice { ticketId }
export async function startPracticeSession(ticketId) {
   const body = JSON.stringify({ ticketId: Number(ticketId) });
   const res = await apiClientService.post(
      "/exams/practice",
      body,
      "application/json; charset=UTF-8"
   );
   const text = await res.text().catch(() => "");
   let data;
   try {
      data = text ? JSON.parse(text) : undefined;
   } catch {
      data = text;
   }

   if (!res.ok && res.status !== 201) {
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(`startPracticeSession ${res.status}: ${text}`);
   }
   return data; // { id, ticketId, ... }
}

// GET /exams/practice/{id}
export async function getPracticeSession(sessionId) {
   const sid = encodeURIComponent(String(sessionId));
   const res = await apiClientService.get(`/exams/practice/${sid}`);
   const text = await res.text().catch(() => "");
   if (!res.ok) {
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(`getPracticeSession ${res.status}: ${text}`);
   }
   return text ? JSON.parse(text) : null;
}

// POST /exams/practice/{id}/answers { questionId, selectedAnswer }
export async function submitPracticeAnswer(
   sessionId,
   { questionId, selectedAnswer }
) {
   const sid = encodeURIComponent(String(sessionId));
   const body = JSON.stringify({
      questionId: Number(questionId),
      selectedAnswer: Number(selectedAnswer),
   });

   const res = await apiClientService.post(
      `/exams/practice/${sid}/answers`,
      body,
      "application/json; charset=UTF-8"
   );
   const text = await res.text().catch(() => ""); // poate fi gol (201)
   let data;
   try {
      data = text ? JSON.parse(text) : undefined;
   } catch {
      data = text;
   }

   if (!res.ok && res.status !== 201) {
      if (res.status === 401) throw new Error("AUTH_401");
      if (res.status === 403) throw new Error("AUTH_403");
      throw new Error(`submitPracticeAnswer ${res.status}: ${text}`);
   }

   // întoarcem o funcție de normalizare ce primește answersLen
   return (answersLen) => normalizeCorrectFromServer(data, answersLen);
}

// GET /exams/practice/history/my?page=&limit=
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

// fallback local (în caz de offline sau 401/403)
export function loadLocalPracticeResults() {
   try {
      if (typeof localStorage === "undefined") return [];
   } catch {
      return [];
   }
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

// agregare statistică pentru PracticeStatistics.jsx
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

/* ============================================================================
   MISC
============================================================================ */
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

// (opțional în alte locuri; nu o folosi pe post de validare de rol)
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
// === Istoric pentru un student specific (ADMIN/MANAGER) ===
export async function getExamHistoryForStudentId(studentId, { page = 1, limit = 20 } = {}) {
  const sid = encodeURIComponent(String(studentId));
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));

  const res = await apiClientService.get(`/exams/history/student/${sid}?${params.toString()}`);
  const text = await res.text().catch(() => "");
  let data;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }

  if (!res.ok) {
    if (res.status === 401) throw new Error("AUTH_401");
    if (res.status === 403) throw new Error("AUTH_403");
    if (res.status === 404) throw new Error("HISTORY_404");
    throw new Error(`getExamHistoryForStudentId ${res.status}: ${text}`);
  }

  const items = Array.isArray(data) ? data : (data?.data || data?.items || data?.results || []);
  const pagination = data?.pagination || data?.meta || { totalPages: 1 };
  return { items, pagination };
}

export async function getExamHistoryForStudentIdAll(studentId, { pageSize = 50, maxPages = 10 } = {}) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = await getExamHistoryForStudentId(studentId, { page, limit: pageSize });
    const items = batch?.items || [];
    if (!items.length) break;
    all.push(...items);

    const totalPages = batch?.pagination?.totalPages ?? null;
    if (totalPages ? page >= totalPages : items.length < pageSize) break;
  }
  return all;
}

// src/api/examService.js
// === PDF results (manager/admin) ===
export const getExamPdfUrl = (examId) =>
   `/exams/${encodeURIComponent(String(examId))}/download-pdf`;

/**
 * Descarcă PDF-ul pentru un examen:
 * - folosește apiClientService ca să trimită aceiași headers de auth
 * - dacă backend trimite JSON/HTML (eroare/login), citește și aruncă mesaj clar
 * - dacă e PDF, salvează cu nume din Content-Disposition sau fallback
 */
export async function downloadExamPdf(examId, filename) {
   if (!examId) throw new Error("Lipsește examId.");
   const url = getExamPdfUrl(examId);

   // IMPORTANT: folosim apiClientService.get ca în restul API-urilor (trimite Authorization)
   const res = await apiClientService.get(url);

   const ct = String(res.headers.get("content-type") || "");
   const cd = String(res.headers.get("content-disposition") || "");

   if (!res.ok) {
      // dacă serverul a răspuns cu JSON de eroare -> extragem mesajul
      if (ct.includes("application/json")) {
         const j = await res.json().catch(() => ({}));
         const msg =
            j.message ||
            j.error ||
            j.details ||
            JSON.stringify(j) ||
            "Eroare la descărcare.";
         throw new Error(`${msg} (HTTP ${res.status})`);
      }
      const txt = await res.text().catch(() => "");
      // mesaje mai prietenoase pentru cele frecvente
      if (res.status === 401)
         throw new Error(
            "Sesiune expirată sau neautorizat (401). Autentifică-te din nou."
         );
      if (res.status === 403) throw new Error("Acces refuzat (403).");
      throw new Error(txt || `Eroare la descărcare (HTTP ${res.status}).`);
   }

   const blob = await res.blob();

   // Dacă nu e PDF, probabil e HTML de login sau JSON
   if (!/pdf/i.test(ct)) {
      if (ct.includes("text/html") && blob.size < 200_000) {
         const html = await blob.text().catch(() => "");
         console.debug(
            "[downloadExamPdf] HTML received (snippet):",
            html.slice(0, 400)
         );
         throw new Error(
            "Serverul a trimis HTML (posibil login sau acces refuzat)."
         );
      }
      if (ct.includes("application/json")) {
         const j = await blob.text().catch(() => "");
         throw new Error(`Serverul a trimis JSON, nu PDF: ${j.slice(0, 400)}`);
      }
      throw new Error(`Tip neașteptat de răspuns: ${ct || "necunoscut"}.`);
   }

   // Numele fișierului din Content-Disposition (dacă există)
   const m =
      cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i) ||
      cd.match(/filename="?([^"]+)"?/i);
   const nameFromServer = m ? decodeURIComponent(m[1]) : null;
   const finalName = filename || nameFromServer || `exam-${examId}.pdf`;

   // Salvează
   const a = document.createElement("a");
   const href = URL.createObjectURL(blob);
   a.href = href;
   a.download = finalName;
   document.body.appendChild(a);
   a.click();
   URL.revokeObjectURL(href);
   a.remove();

   return true;
}
