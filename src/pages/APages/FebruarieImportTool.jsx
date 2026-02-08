// src/components/APanel/FebruarieImportTool.jsx
import React, {
   useCallback,
   useContext,
   useEffect,
   useMemo,
   useRef,
   useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";

import { UserContext } from "../../UserContext";
import apiClientService from "../../api/ApiClientService";
import { createReservationsForUser } from "../../api/reservationsService";

import { fetchStudents } from "../../store/studentsSlice";
import { fetchInstructors } from "../../store/instructorsSlice";

/* ===================== config ===================== */

const GROUP_TOKEN_FIXED = "ABCD1234";
const EMAIL_DOMAIN = "instrauto.com";
const MOLDOVA_TZ = "Europe/Chisinau";

/**
 * IMPORTANT:
 * - Fișierul tău nou are startTime cu "...Z", DAR ora din string e deja ora locală Moldova.
 * - Ca să NU se decaleze cu 2-3 ore, tratăm "Z" ca local (NU UTC).
 */
const ASSUME_Z_IS_LOCAL = true;

// persist map + progres (ca să poți continua)
const LS_USER_MAP = "__MIG_FEBRUARIE_USER_MAP_V1";
const LS_RES_INDEX = "__MIG_FEBRUARIE_RES_INDEX_V1";

/* ===================== small helpers ===================== */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const onlyDigits = (s = "") => String(s || "").replace(/\D/g, "");

const randId = (n = 16) =>
   Array.from({ length: n }, () => Math.random().toString(36).slice(2, 3)).join(
      "",
   );

const slugify = (s) =>
   (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 20) || "user";

/**
 * ✅ Email mult mai unic (nu doar last3) ca să NU lovești “Email already in use”
 * Folosim last6 din telefon + încercări cu sufix random.
 */
const makeEmail = (firstName, lastName, phoneDigits, extra = "") => {
   const fn = slugify(firstName);
   const ln = slugify(lastName);
   const last6 =
      (phoneDigits || "").slice(-6) || Math.random().toString().slice(2, 8);
   const suffix = extra ? `-${extra}` : "";
   return `${fn}.${ln}.ia${last6}${suffix}@${EMAIL_DOMAIN}`;
};

function normText(s) {
   return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

/**
 * ✅ backend nu permite empty first/last name.
 */
function normalizeNames(firstName, lastName) {
   const fn = String(firstName ?? "").trim();
   const ln = String(lastName ?? "").trim();

   const hasFn = fn.length > 0;
   const hasLn = ln.length > 0;

   if (hasFn && !hasLn) return { firstName: fn, lastName: fn };
   if (!hasFn && hasLn) return { firstName: ln, lastName: ln };
   if (!hasFn && !hasLn)
      return { firstName: "Prenume generat", lastName: "Nume generat" };

   return { firstName: fn, lastName: ln };
}

/* ===================== TZ helpers (Z-LOCAL MODE) ===================== */
/**
 * REGULA (pentru sistemul tău actual):
 * - Noi păstrăm "Z", dar îl considerăm LOCAL (Moldova).
 * - Deci "2026-02-01T07:00:00.000Z" înseamnă "07:00 Moldova",
 *   NU "07:00 UTC".
 *
 * => Ca să nu apară -2h, la import NU facem conversii UTC/offset.
 *    Doar normalizăm formatul la: YYYY-MM-DDTHH:mm:00.000Z
 */

function pad2(n) {
   return String(n).padStart(2, "0");
}

// Pentru cazuri în care poate primești un string cu offset și vrei să-l reduci la "ora Moldova"
function partsInTZ(dateLike, timeZone = MOLDOVA_TZ) {
   const d = new Date(dateLike);
   if (Number.isNaN(d.getTime())) return null;

   const p = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
   }).formatToParts(d);

   const get = (t) => +p.find((x) => x.type === t).value;
   return {
      y: get("year"),
      m: get("month"),
      d: get("day"),
      H: get("hour"),
      M: get("minute"),
      S: get("second"),
   };
}

// Parse "YYYY-MM-DDTHH:mm(:ss)?" fără TZ
function parseLocalNoTz(s) {
   const m = String(s || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
   if (!m) return null;
   return {
      Y: +m[1],
      Mo: +m[2],
      D: +m[3],
      hh: +m[4],
      mm: +m[5],
   };
}

function makeZLocalIso(Y, Mo, D, hh, mm) {
   return `${Y}-${pad2(Mo)}-${pad2(D)}T${pad2(hh)}:${pad2(mm)}:00.000Z`;
}

/**
 * Normalizează startTime pentru backend în modul "Z = local".
 *
 * Acceptă:
 * - "2026-02-01T07:00:00.000Z"  (formatul tău nou) => păstrează 07:00, normalizează sec/ms
 * - fără TZ "2026-02-01T07:00"  => îl tratează ca local Moldova și pune Z
 * - cu offset "+02:00/+03:00"   => îl convertește la ora Moldova și pune Z-local
 */
function normalizeStartTimeToSend(startTimeRaw) {
   const s0 = String(startTimeRaw || "").trim();
   if (!s0) return null;

   // 1) format cu offset explicit
   if (/[+-]\d{2}:\d{2}$/.test(s0)) {
      const p = partsInTZ(s0, MOLDOVA_TZ);
      if (!p) return null;
      return makeZLocalIso(p.y, p.m, p.d, p.H, p.M);
   }

   // 2) se termină cu Z
   if (s0.endsWith("Z")) {
      // dacă Z = local (cazul tău)
      if (ASSUME_Z_IS_LOCAL) {
         const noZ = s0.replace(/Z$/, "");
         const noMs = noZ.replace(/\.\d{3}$/, "");
         const p = parseLocalNoTz(noMs);
         if (!p) return null;
         return makeZLocalIso(p.Y, p.Mo, p.D, p.hh, p.mm);
      }

      // (dacă vreodată comuți pe UTC real)
      const p = partsInTZ(s0, MOLDOVA_TZ);
      if (!p) return null;
      return makeZLocalIso(p.y, p.m, p.d, p.H, p.M);
   }

   // 3) fără TZ -> local Moldova
   const p = parseLocalNoTz(s0);
   if (p) return makeZLocalIso(p.Y, p.Mo, p.D, p.hh, p.mm);

   // 4) fallback parse Date()
   const d = new Date(s0);
   if (!Number.isNaN(d.getTime())) {
      const pp = partsInTZ(d, MOLDOVA_TZ);
      if (!pp) return null;
      return makeZLocalIso(pp.y, pp.m, pp.d, pp.H, pp.M);
   }

   return null;
}

/* ===================== instructor resolving (păstrat) ===================== */

function extractInstructorCandidatesFromField(field) {
   let s = String(field || "").trim();
   if (!s) return [];

   s = s.replace(/([a-zăîâșț])([A-Z]{2,4})/g, "$1 $2");
   const parts = s
      .split("/")
      .map((x) => x.trim())
      .filter(Boolean);

   return parts
      .map((p) =>
         p
            .replace(/\b[A-Z]{2,4}\b/g, " ")
            .replace(/\b\d{2,6}\b/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
      )
      .filter(Boolean);
}

function resolveInstructorIdFromReservation(res, instructors) {
   const direct = Number(res?.instructorId);
   if (Number.isFinite(direct) && direct > 0) return direct;

   const cands = [];
   const instObj = res?.instructor || null;
   if (instObj?.firstName || instObj?.lastName) {
      cands.push(
         `${instObj.firstName || ""} ${instObj.lastName || ""}`.trim(),
         `${instObj.lastName || ""} ${instObj.firstName || ""}`.trim(),
      );
   }

   const field = res?.source?.instructorField;
   if (field) cands.push(...extractInstructorCandidatesFromField(field));

   for (const cand of cands) {
      const candN = normText(cand);
      if (!candN) continue;

      for (const i of instructors || []) {
         const a = normText(`${i?.firstName || ""} ${i?.lastName || ""}`);
         const b = normText(`${i?.lastName || ""} ${i?.firstName || ""}`);

         if (!a && !b) continue;

         if (
            (a && (candN.includes(a) || a.includes(candN))) ||
            (b && (candN.includes(b) || b.includes(candN)))
         ) {
            const idNum = Number(i?.id);
            if (Number.isFinite(idNum) && idNum > 0) return idNum;
         }
      }
   }

   return null;
}

/* ===================== component ===================== */

export default function FebruarieImportTool() {
   const { user } = useContext(UserContext);
   const dispatch = useDispatch();

   const studentsAll = useSelector((s) => s.students?.list || []);
   const instructors = useSelector((s) => s.instructors?.list || []);

   const studentsRef = useRef(studentsAll);
   useEffect(() => {
      studentsRef.current = studentsAll;
   }, [studentsAll]);

   const [fileName, setFileName] = useState("");
   const [data, setData] = useState(null); // {users:[], reservations:[]}

   const [userMap, setUserMap] = useState(() => {
      try {
         const raw = localStorage.getItem(LS_USER_MAP);
         return raw ? JSON.parse(raw) : {};
      } catch {
         return {};
      }
   });

   const [resIndex, setResIndex] = useState(() => {
      const raw = Number(localStorage.getItem(LS_RES_INDEX) || 0);
      return Number.isFinite(raw) && raw >= 0 ? raw : 0;
   });

   const [delayUsersMs, setDelayUsersMs] = useState(250);
   const [delayResMs, setDelayResMs] = useState(1000);

   const [runningUsers, setRunningUsers] = useState(false);
   const [runningRes, setRunningRes] = useState(false);
   const abortRef = useRef(false);

   const [log, setLog] = useState([]);
   const pushLog = useCallback((type, text) => {
      setLog((prev) =>
         [{ id: Date.now() + Math.random(), type, text }, ...prev].slice(
            0,
            140,
         ),
      );
   }, []);

   // load base lists
   useEffect(() => {
      if (!user || user.role !== "ADMIN") return;
      dispatch(fetchStudents());
      dispatch(fetchInstructors());
   }, [dispatch, user]);

   const stats = useMemo(() => {
      const users = data?.users || [];
      const reservationsList = data?.reservations || [];

      const missingUserPhone = users.filter(
         (u) => !onlyDigits(u?.phone),
      ).length;

      let missingInstrId = 0;
      for (const r of reservationsList) {
         if (!r?.instructorId) missingInstrId++;
      }

      return {
         usersCount: users.length,
         reservationsCount: reservationsList.length,
         missingUserPhone,
         missingInstrId,
      };
   }, [data]);

   const onPickFile = useCallback(
      (e) => {
         const f = e.target.files?.[0];
         if (!f) return;

         setFileName(f.name || "");
         const reader = new FileReader();
         reader.onload = () => {
            try {
               const parsed = JSON.parse(String(reader.result || ""));
               const users = Array.isArray(parsed?.users) ? parsed.users : [];
               const reservationsList = Array.isArray(parsed?.reservations)
                  ? parsed.reservations
                  : [];

               setData({ users, reservations: reservationsList });
               pushLog(
                  "info",
                  `Fișier încărcat: ${f.name} (users=${users.length}, reservations=${reservationsList.length})`,
               );
            } catch (err) {
               pushLog("error", `JSON invalid: ${err?.message || "Eroare"}`);
               setData(null);
            }
         };
         reader.readAsText(f);
      },
      [pushLog],
   );

   const persistUserMap = useCallback((next) => {
      setUserMap(next);
      try {
         localStorage.setItem(LS_USER_MAP, JSON.stringify(next));
      } catch {}
   }, []);

   const persistResIndex = useCallback((idx) => {
      setResIndex(idx);
      try {
         localStorage.setItem(LS_RES_INDEX, String(idx));
      } catch {}
   }, []);

   const stopAll = useCallback(() => {
      abortRef.current = true;
      setRunningUsers(false);
      setRunningRes(false);
      pushLog("warning", "STOP cerut (abort).");
   }, [pushLog]);

   // find existing student by phone
   const findStudentIdByPhone = useCallback((digits) => {
      const d = onlyDigits(digits);
      if (!d) return "";
      const found = (studentsRef.current || []).find(
         (s) => onlyDigits(s?.phone) === d,
      );
      return found?.id != null ? String(found.id) : "";
   }, []);

   const registerStudent = useCallback(
      async ({ firstName, lastName, phoneDigits }) => {
         const nm = normalizeNames(firstName, lastName);
         const fn = nm.firstName;
         const ln = nm.lastName;

         const pass = randId(16);

         for (let attempt = 0; attempt < 7; attempt++) {
            const email = makeEmail(
               fn,
               ln,
               phoneDigits,
               attempt ? randId(4) : "",
            );

            const payload = {
               firstName: fn,
               lastName: ln,
               phone: phoneDigits,
               email,
               password: pass,
               role: "USER",
               groupToken: GROUP_TOKEN_FIXED,
            };

            const res = await apiClientService.post(
               "/auth/register",
               JSON.stringify(payload),
            );

            if (res?.ok) return { ok: true };

            let errJson = null;
            try {
               errJson = await res.json();
            } catch {}

            const msg = String(errJson?.message || "").toLowerCase();

            const looksLikeDupEmail =
               msg.includes("email") &&
               (msg.includes("exist") ||
                  msg.includes("duplicate") ||
                  msg.includes("unique") ||
                  msg.includes("already"));

            const looksLikeDupPhone =
               msg.includes("phone") &&
               (msg.includes("exist") ||
                  msg.includes("duplicate") ||
                  msg.includes("unique") ||
                  msg.includes("already"));

            if (looksLikeDupPhone) return { ok: true, dupPhone: true };

            if (!looksLikeDupEmail) {
               return {
                  ok: false,
                  error: errJson?.message || "Register failed",
               };
            }
         }

         return { ok: false, error: "Email duplicate (too many attempts)" };
      },
      [],
   );

   /* ===================== STEP 1: create users ===================== */

   const runCreateUsers = useCallback(async () => {
      if (runningUsers || runningRes) return;
      if (!data?.users?.length)
         return pushLog("error", "Nu ai users în fișier.");

      abortRef.current = false;
      setRunningUsers(true);
      pushLog("info", "Start: creare / mapare users...");

      try {
         try {
            await dispatch(fetchStudents());
         } catch {}

         const nextMap = { ...(userMap || {}) };

         for (let i = 0; i < data.users.length; i++) {
            if (abortRef.current) break;

            const u = data.users[i] || {};
            const oldId = String(u?.id ?? "");
            const phoneDigits = onlyDigits(u?.phone);

            if (!oldId) {
               pushLog("warning", `User fără id la index ${i} (skip).`);
               continue;
            }
            if (!phoneDigits) {
               pushLog("error", `User oldId=${oldId} fără telefon (skip).`);
               continue;
            }

            if (nextMap[oldId]) continue;

            const existingId = findStudentIdByPhone(phoneDigits);
            if (existingId) {
               nextMap[oldId] = existingId;
               persistUserMap(nextMap);
               pushLog(
                  "success",
                  `Map existing: oldId=${oldId} -> id=${existingId}`,
               );
               continue;
            }

            const reg = await registerStudent({
               firstName: u?.firstName,
               lastName: u?.lastName,
               phoneDigits,
            });

            if (!reg?.ok) {
               pushLog(
                  "error",
                  `Nu am putut crea user oldId=${oldId} (tel=${phoneDigits}). ${reg?.error || ""}`,
               );
               continue;
            }

            let newId = "";
            for (let t = 0; t < 12; t++) {
               if (abortRef.current) break;
               try {
                  await dispatch(fetchStudents());
               } catch {}
               newId = findStudentIdByPhone(phoneDigits);
               if (newId) break;
               await sleep(250);
            }

            if (!newId) {
               pushLog(
                  "error",
                  `Creat (sau exista), dar nu găsesc ID după telefon (oldId=${oldId}, tel=${phoneDigits}).`,
               );
               continue;
            }

            nextMap[oldId] = newId;
            persistUserMap(nextMap);
            pushLog("success", `OK user: oldId=${oldId} -> id=${newId}`);

            if (delayUsersMs > 0) await sleep(delayUsersMs);
         }

         pushLog("info", "Gata: users (sau abort).");
      } catch (e) {
         pushLog("error", e?.message || "Eroare la creare users.");
      } finally {
         setRunningUsers(false);
      }
   }, [
      data,
      delayUsersMs,
      dispatch,
      findStudentIdByPhone,
      persistUserMap,
      pushLog,
      registerStudent,
      runningRes,
      runningUsers,
      userMap,
   ]);

   /* ===================== STEP 2: create reservations ===================== */

   const runCreateReservations = useCallback(async () => {
      if (runningUsers || runningRes) return;
      if (!data?.reservations?.length)
         return pushLog("error", "Nu ai reservations în fișier.");

      abortRef.current = false;
      setRunningRes(true);
      pushLog("info", "Start: creare reservations...");

      try {
         try {
            await dispatch(fetchInstructors());
         } catch {}

         const list = data.reservations || [];
         let idx = resIndex;

         for (; idx < list.length; idx++) {
            if (abortRef.current) break;

            const r = list[idx] || {};
            const oldUserId = String(r?.userId ?? "");
            const mappedUserId = oldUserId ? userMap?.[oldUserId] || "" : "";

            let finalUserId = mappedUserId;
            if (!finalUserId) {
               const phoneDigits = onlyDigits(r?.user?.phone);
               if (phoneDigits) finalUserId = findStudentIdByPhone(phoneDigits);
            }

            if (!finalUserId) {
               pushLog(
                  "error",
                  `RES[${idx}] nu am userId mapat (oldUserId=${oldUserId}). SKIP`,
               );
               persistResIndex(idx + 1);
               if (delayResMs > 0) await sleep(delayResMs);
               continue;
            }

            const instrId = resolveInstructorIdFromReservation(r, instructors);
            if (!instrId) {
               pushLog(
                  "error",
                  `RES[${idx}] nu pot rezolva instructorId. SKIP`,
               );
               persistResIndex(idx + 1);
               if (delayResMs > 0) await sleep(delayResMs);
               continue;
            }

            const instrObj = (instructors || []).find(
               (x) => Number(x?.id) === Number(instrId),
            );
            if (!instrObj) {
               pushLog(
                  "warning",
                  `RES[${idx}] instructorId=${instrId} NU există în /instructors curent. SKIP`,
               );
               persistResIndex(idx + 1);
               if (delayResMs > 0) await sleep(delayResMs);
               continue;
            }

            const startTimeRaw = r?.startTime;
            const startTimeToSend = normalizeStartTimeToSend(startTimeRaw);
            if (!startTimeToSend) {
               pushLog(
                  "error",
                  `RES[${idx}] startTime invalid: "${String(startTimeRaw || "")}". SKIP`,
               );
               persistResIndex(idx + 1);
               if (delayResMs > 0) await sleep(delayResMs);
               continue;
            }

            // ✅ sector din instructor (dacă e “Niciunul”, fallback)
            const sectorFromInstr = String(instrObj?.sector || "").trim();
            const sector =
               sectorFromInstr && sectorFromInstr !== "Niciunul"
                  ? sectorFromInstr
                  : String(r?.sector || "Botanica").trim() || "Botanica";

            const gearboxRaw = String(r?.gearbox || "")
               .toLowerCase()
               .trim();
            const gearbox = gearboxRaw === "automat" ? "Automat" : "Manual";

            const payload = {
               userId: Number(finalUserId),
               instructorId: Number(instrId),
               reservations: [
                  {
                     startTime: startTimeToSend, // ✅ Z-LOCAL (fără shift)
                     sector,
                     gearbox,
                     privateMessage: String(r?.privateMessage || ""),
                     color: String(r?.color || "--black-t"),
                     isFavorite: !!r?.isFavorite,
                     isImportant: !!r?.isImportant,
                     instructorId: Number(instrId),
                  },
               ],
            };

            try {
               await createReservationsForUser(payload);
               pushLog(
                  "success",
                  `OK RES[${idx}] userId=${finalUserId} instrId=${instrId} start=${startTimeRaw} -> ${startTimeToSend}`,
               );
            } catch (e) {
               const msg = String(e?.message || e || "");
               const low = msg.toLowerCase();

               if (
                  low.includes("already reserved") ||
                  (low.includes("already") && low.includes("reserved"))
               ) {
                  pushLog(
                     "warning",
                     `SKIP conflict RES[${idx}] instrId=${instrId} start=${startTimeToSend}`,
                  );
               } else {
                  pushLog("error", `FAIL RES[${idx}] ${msg || "eroare"}`);
               }
            }

            persistResIndex(idx + 1);
            if (delayResMs > 0) await sleep(delayResMs);
         }

         pushLog("info", "Gata: reservations (sau abort).");
      } catch (e) {
         pushLog("error", e?.message || "Eroare la creare reservations.");
      } finally {
         setRunningRes(false);
      }
   }, [
      data,
      delayResMs,
      dispatch,
      findStudentIdByPhone,
      instructors,
      persistResIndex,
      pushLog,
      resIndex,
      runningRes,
      runningUsers,
      userMap,
   ]);

   const canUse = user?.role === "ADMIN";
   if (!canUse) return null;

   return (
      <div
         className="migrUI"
         style={{
            padding: 14,
            borderRadius: 12,
            background: "#eee",
            border: "1px solid rgba(255,255,255,0.08)",
            marginTop: 12,
         }}
      >
         <div
            style={{
               display: "flex",
               alignItems: "center",
               justifyContent: "space-between",
               gap: 10,
            }}
         >
            <h3 style={{ margin: 0 }}>Migrare: Users → Reservations</h3>

            <button
               type="button"
               onClick={stopAll}
               disabled={!runningUsers && !runningRes}
               style={{ padding: "8px 10px", borderRadius: 10 }}
            >
               STOP
            </button>
         </div>

         <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <div
               style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
               }}
            >
               <input
                  type="file"
                  accept="application/json"
                  onChange={onPickFile}
               />
               {fileName && (
                  <span style={{ opacity: 0.8 }}>Fișier: {fileName}</span>
               )}
            </div>

            <div
               style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 10,
               }}
            >
               <Stat label="Users" value={stats.usersCount} />
               <Stat label="Reservations" value={stats.reservationsCount} />
               <Stat
                  label="Users fără telefon"
                  value={stats.missingUserPhone}
               />
               <Stat
                  label="Res fără instructorId"
                  value={stats.missingInstrId}
               />
            </div>

            <div
               style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 10,
               }}
            >
               <Stat
                  label="Map users (old→new)"
                  value={Object.keys(userMap || {}).length}
               />
               <Stat label="Next reservation index" value={resIndex} />
               <Stat label="Delay users (ms)" value={delayUsersMs} />
               <Stat label="Delay res (ms)" value={delayResMs} />
            </div>

            <div
               style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
               }}
            >
               <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ opacity: 0.8 }}>Delay users</span>
                  <input
                     type="number"
                     min={0}
                     step={50}
                     value={delayUsersMs}
                     onChange={(e) =>
                        setDelayUsersMs(
                           Math.max(0, Number(e.target.value) || 0),
                        )
                     }
                     style={{ width: 120 }}
                     disabled={runningUsers || runningRes}
                  />
               </label>

               <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ opacity: 0.8 }}>Delay reservations</span>
                  <input
                     type="number"
                     min={0}
                     step={50}
                     value={delayResMs}
                     onChange={(e) =>
                        setDelayResMs(Math.max(0, Number(e.target.value) || 0))
                     }
                     style={{ width: 120 }}
                     disabled={runningUsers || runningRes}
                  />
               </label>

               <button
                  type="button"
                  onClick={runCreateUsers}
                  disabled={!data?.users?.length || runningUsers || runningRes}
                  style={{ padding: "10px 12px", borderRadius: 10 }}
               >
                  {runningUsers
                     ? "Creare users..."
                     : "1) Creează / Map-ează Users"}
               </button>

               <button
                  type="button"
                  onClick={runCreateReservations}
                  disabled={
                     !data?.reservations?.length || runningUsers || runningRes
                  }
                  style={{ padding: "10px 12px", borderRadius: 10 }}
               >
                  {runningRes
                     ? "Creare reservations..."
                     : "2) Creează Reservations"}
               </button>

               <button
                  type="button"
                  disabled={runningUsers || runningRes}
                  onClick={() => {
                     try {
                        localStorage.removeItem(LS_USER_MAP);
                     } catch {}
                     try {
                        localStorage.removeItem(LS_RES_INDEX);
                     } catch {}
                     setUserMap({});
                     setResIndex(0);
                     pushLog("warning", "Reset localStorage map + index.");
                  }}
                  style={{ padding: "10px 12px", borderRadius: 10 }}
               >
                  Reset map/index
               </button>
            </div>

            <div style={{ marginTop: 6 }}>
               <h4 style={{ margin: "8px 0" }}>Log</h4>
               <div
                  style={{
                     maxHeight: 260,
                     overflow: "auto",
                     display: "grid",
                     gap: 6,
                  }}
               >
                  {log.map((l) => (
                     <div
                        key={l.id}
                        style={{
                           padding: "8px 10px",
                           borderRadius: 10,
                           border: "1px solid rgba(255,255,255,0.08)",
                           opacity: l.type === "info" ? 0.9 : 1,
                        }}
                     >
                        <b style={{ marginRight: 8 }}>{l.type.toUpperCase()}</b>
                        <span style={{ wordBreak: "break-word" }}>
                           {l.text}
                        </span>
                     </div>
                  ))}
               </div>
            </div>
         </div>
      </div>
   );
}

function Stat({ label, value }) {
   return (
      <div
         style={{
            padding: 10,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
         }}
      >
         <div style={{ fontSize: 12, opacity: 0.75 }}>{label}</div>
         <div style={{ fontSize: 18, fontWeight: 700 }}>
            {String(value ?? "")}
         </div>
      </div>
   );
}
