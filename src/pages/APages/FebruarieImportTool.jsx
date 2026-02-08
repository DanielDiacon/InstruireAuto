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

/* ===================== config ===================== */

const GROUP_TOKEN_FIXED = "ABCD1234";
const EMAIL_DOMAIN = "instrauto.com";
const MOLDOVA_TZ = "Europe/Chisinau";

// persist map + progres (ca să poți continua)
const LS_USER_MAP = "__MIG_FEBRUARIE_USER_MAP_V2";
const LS_RES_INDEX = "__MIG_FEBRUARIE_RES_INDEX_V2";

// ✅ persist “failed reservations”
const LS_FAILED_RES = "__MIG_FEBRUARIE_FAILED_RES_V1";

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

/* ===================== TZ helpers ===================== */

function pad2(n) {
   return String(n).padStart(2, "0");
}

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

function parseLocalNoTz(s) {
   const m = String(s || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
   if (!m) return null;
   return { Y: +m[1], Mo: +m[2], D: +m[3], hh: +m[4], mm: +m[5] };
}

function makeZLocalIso(Y, Mo, D, hh, mm) {
   return `${Y}-${pad2(Mo)}-${pad2(D)}T${pad2(hh)}:${pad2(mm)}:00.000Z`;
}

function hourFromIsoString(s) {
   const m = String(s || "").match(/T(\d{2}):(\d{2})/);
   return m ? Number(m[1]) : null;
}

/**
 * AUTO-DETECT pentru fișierele tale:
 * - unele au "Z" dar ora din string este LOCALĂ (ex: 07:00Z == 07:00 Moldova)
 * - unele au "Z" dar ora din string este UTC (ex: 05:00Z == 07:00 Moldova)
 *
 * Regula sigură pentru setul tău:
 * - dacă în fișier găsim ore <= 06 în startTime, tratăm "Z" ca UTC (necesită shift -> Moldova)
 * - altfel tratăm "Z" ca LOCAL (nu shift)
 */
function detectZIsLocal(reservations = []) {
   const sample = (reservations || [])
      .map((r) => String(r?.startTime || "").trim())
      .filter((s) => s.endsWith("Z"))
      .slice(0, 400);

   if (!sample.length) return true;

   let minHour = 99;
   for (const s of sample) {
      const h = hourFromIsoString(s);
      if (Number.isFinite(h)) minHour = Math.min(minHour, h);
   }

   return !(minHour <= 6);
}

/**
 * Normalizează startTime pentru backend în modul "Z = local" (la import).
 */
function normalizeStartTimeToSend(startTimeRaw, assumeZIsLocal) {
   const s0 = String(startTimeRaw || "").trim();
   if (!s0) return null;

   // 1) offset explicit
   if (/[+-]\d{2}:\d{2}$/.test(s0)) {
      const p = partsInTZ(s0, MOLDOVA_TZ);
      if (!p) return null;
      return makeZLocalIso(p.y, p.m, p.d, p.H, p.M);
   }

   // 2) Z
   if (s0.endsWith("Z")) {
      if (assumeZIsLocal) {
         const noZ = s0.replace(/Z$/, "");
         const noMs = noZ.replace(/\.\d{3}$/, "");
         const p = parseLocalNoTz(noMs);
         if (!p) return null;
         return makeZLocalIso(p.Y, p.Mo, p.D, p.hh, p.mm);
      }

      const p = partsInTZ(s0, MOLDOVA_TZ);
      if (!p) return null;
      return makeZLocalIso(p.y, p.m, p.d, p.H, p.M);
   }

   // 3) fără TZ -> local
   const p = parseLocalNoTz(s0);
   if (p) return makeZLocalIso(p.Y, p.Mo, p.D, p.hh, p.mm);

   // 4) fallback Date()
   const d = new Date(s0);
   if (!Number.isNaN(d.getTime())) {
      const pp = partsInTZ(d, MOLDOVA_TZ);
      if (!pp) return null;
      return makeZLocalIso(pp.y, pp.m, pp.d, pp.H, pp.M);
   }

   return null;
}

/* ===================== instructor resolving ===================== */

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

function resolveInstructorIdFromReservation(
   res,
   instructorsArr,
   instructorsById,
) {
   const direct = Number(res?.instructorId);
   if (Number.isFinite(direct) && direct > 0 && instructorsById?.[direct]) {
      return direct;
   }

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

      for (const i of instructorsArr || []) {
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

   if (Number.isFinite(direct) && direct > 0) return direct;
   return null;
}

/* ===================== download helper ===================== */

function downloadJson(filename, obj) {
   try {
      const blob = new Blob([JSON.stringify(obj, null, 2)], {
         type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
   } catch {
      // ignore
   }
}

/* ===================== failed reservations helpers ===================== */

function makeFailKey(r, idx) {
   // key stabil: userId/startTime/instructorId + index ca fallback
   return [
      String(r?.userId ?? ""),
      String(r?.startTime ?? ""),
      String(r?.instructorId ?? ""),
      String(idx ?? ""),
   ].join("|");
}

function looksLikeAlreadyReserved(msg) {
   const low = String(msg || "").toLowerCase();
   return (
      low.includes("already reserved") ||
      (low.includes("already") && low.includes("reserved"))
   );
}

/* ===================== component ===================== */

export default function FebruarieImportTool() {
   const { user } = useContext(UserContext);
   const dispatch = useDispatch();

   const studentsAll = useSelector((s) => s.students?.list || []);
   const studentsRef = useRef(studentsAll);

   useEffect(() => {
      studentsRef.current = studentsAll;
   }, [studentsAll]);

   const [fileName, setFileName] = useState("");
   const [data, setData] = useState(null); // {users:[], reservations:[]}
   const [assumeZIsLocal, setAssumeZIsLocal] = useState(true);

   const [remoteInstructors, setRemoteInstructors] = useState([]);

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

   // ✅ lista rezervărilor eșuate (persist)
   const [failedReservations, setFailedReservations] = useState(() => {
      try {
         const raw = localStorage.getItem(LS_FAILED_RES);
         const parsed = raw ? JSON.parse(raw) : [];
         return Array.isArray(parsed) ? parsed : [];
      } catch {
         return [];
      }
   });

   const setFailedWithPersist = useCallback((updater) => {
      setFailedReservations((prev) => {
         const next = typeof updater === "function" ? updater(prev) : updater;
         try {
            localStorage.setItem(LS_FAILED_RES, JSON.stringify(next));
         } catch {}
         return next;
      });
   }, []);

   const [delayUsersMs, setDelayUsersMs] = useState(250);
   const [delayResMs, setDelayResMs] = useState(900);

   const [runningUsers, setRunningUsers] = useState(false);
   const [runningRes, setRunningRes] = useState(false);
   const [runningFailedInstall, setRunningFailedInstall] = useState(false);
   const abortRef = useRef(false);

   const [log, setLog] = useState([]);
   const pushLog = useCallback((type, text) => {
      setLog((prev) =>
         [{ id: Date.now() + Math.random(), type, text }, ...prev].slice(
            0,
            220,
         ),
      );
   }, []);

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
      setRunningFailedInstall(false);
      pushLog("warning", "STOP cerut (abort).");
   }, [pushLog]);

   const findStudentIdByPhone = useCallback((digits) => {
      const d = onlyDigits(digits);
      if (!d) return "";
      const found = (studentsRef.current || []).find(
         (s) => onlyDigits(s?.phone) === d,
      );
      return found?.id != null ? String(found.id) : "";
   }, []);

   // ✅ upsert fail (nu duplicăm la infinit)
   const markReservationFailed = useCallback(
      ({
         idx,
         r,
         level = "error",
         reason,
         meta = {},
         derived = {},
         apiMessage = "",
      }) => {
         const key = makeFailKey(r, idx);
         const now = new Date().toISOString();

         // log în roșu/galben (nu afișăm “SKIP”, afișăm “FAILED”)
         const prefix = `FAILED RES[${idx}]`;
         pushLog(level, `${prefix}: ${reason}`);

         setFailedWithPersist((prev) => {
            const arr = Array.isArray(prev) ? prev : [];
            const pos = arr.findIndex((x) => x?.key === key);

            const base = {
               key,
               id: pos >= 0 ? arr[pos].id : Date.now() + Math.random(),
               createdAt: pos >= 0 ? arr[pos].createdAt : now,
               updatedAt: now,
               attempts: pos >= 0 ? Number(arr[pos].attempts || 1) + 1 : 1,
               level: String(level || "error"),
               reason: String(reason || ""),
               apiMessage: String(apiMessage || ""),
               index: idx,
               reservation: r || null, // raw din fișier (ca să poți re-resolva)
               meta: meta && typeof meta === "object" ? meta : {},
               derived: derived && typeof derived === "object" ? derived : {},
            };

            if (pos >= 0) {
               const next = arr.slice();
               next[pos] = { ...next[pos], ...base };
               // mutăm în față (cele mai recente sus)
               next.splice(pos, 1);
               return [base, ...next].slice(0, 8000);
            }

            return [base, ...arr].slice(0, 8000);
         });
      },
      [pushLog, setFailedWithPersist],
   );

   // ✅ dacă rezervarea e deja în sistem => o considerăm “rezolvată” și o scoatem din failed list
   const removeFailedByKey = useCallback(
      (key) => {
         if (!key) return;
         setFailedWithPersist((prev) =>
            (prev || []).filter((x) => x?.key !== key),
         );
      },
      [setFailedWithPersist],
   );

   useEffect(() => {
      if (!user || user.role !== "ADMIN") return;
      dispatch(fetchStudents());

      (async () => {
         try {
            const res = await apiClientService.get("/instructors");
            const arr = res?.ok ? await res.json() : [];
            setRemoteInstructors(Array.isArray(arr) ? arr : []);
         } catch {
            // silent
         }
      })();
   }, [dispatch, user]);

   const loadRemoteInstructors = useCallback(async () => {
      const res = await apiClientService.get("/instructors");
      if (!res?.ok) throw new Error("Nu pot încărca /instructors");
      const arr = await res.json();
      const list = Array.isArray(arr) ? arr : [];
      setRemoteInstructors(list);
      return list;
   }, []);

   const stats = useMemo(() => {
      const users = data?.users || [];
      const reservationsList = data?.reservations || [];

      const missingUserPhone = users.filter(
         (u) => !onlyDigits(u?.phone),
      ).length;

      let missingInstrId = 0;
      for (const r of reservationsList) {
         if (
            !r?.instructorId &&
            !(r?.instructor?.firstName || r?.instructor?.lastName)
         )
            missingInstrId++;
      }

      return {
         usersCount: users.length,
         reservationsCount: reservationsList.length,
         missingUserPhone,
         missingInstrId,
         remoteInstrCount: (remoteInstructors || []).length,
         zMode: assumeZIsLocal
            ? "Z-LOCAL (07 rămâne 07)"
            : "UTC-Z (05 -> 07 Moldova)",
         failedCount: (failedReservations || []).length,
      };
   }, [data, remoteInstructors, assumeZIsLocal, failedReservations]);

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

               const zLocal = detectZIsLocal(reservationsList);
               setAssumeZIsLocal(zLocal);

               setData({ users, reservations: reservationsList });
               pushLog(
                  "info",
                  `Fișier încărcat: ${f.name} (users=${users.length}, reservations=${reservationsList.length}, Zmode=${
                     zLocal ? "Z-LOCAL" : "UTC-Z"
                  })`,
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

   // ✅ load failed JSON (ca să “instalezi” lista înapoi)
   const onLoadFailedJson = useCallback(
      (e) => {
         const f = e.target.files?.[0];
         if (!f) return;

         const reader = new FileReader();
         reader.onload = () => {
            try {
               const parsed = JSON.parse(String(reader.result || ""));
               const arr = Array.isArray(parsed)
                  ? parsed
                  : Array.isArray(parsed?.failedReservations)
                    ? parsed.failedReservations
                    : [];

               if (!Array.isArray(arr))
                  throw new Error("Format invalid pentru failedReservations");

               // normalizare minimală + merge (dedupe by key)
               setFailedWithPersist((prev) => {
                  const cur = Array.isArray(prev) ? prev : [];
                  const map = new Map(cur.map((x) => [x?.key, x]));

                  for (const item of arr) {
                     const key = String(item?.key || "");
                     const reservation = item?.reservation || null;
                     const idx = Number.isFinite(Number(item?.index))
                        ? Number(item.index)
                        : null;

                     const fallbackKey =
                        key ||
                        (reservation
                           ? makeFailKey(reservation, idx)
                           : `${Date.now()}_${Math.random()}`);

                     const nextItem = {
                        ...item,
                        key: fallbackKey,
                        id: item?.id ?? Date.now() + Math.random(),
                        createdAt: item?.createdAt ?? new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        attempts: Number(item?.attempts || 1),
                     };

                     map.set(fallbackKey, nextItem);
                  }

                  const merged = Array.from(map.values())
                     .sort((a, b) =>
                        String(b?.updatedAt || "").localeCompare(
                           String(a?.updatedAt || ""),
                        ),
                     )
                     .slice(0, 8000);

                  return merged;
               });

               pushLog(
                  "success",
                  `Loaded FAILED list: ${arr.length} items din fișier.`,
               );
            } catch (err) {
               pushLog(
                  "error",
                  `Failed JSON invalid: ${err?.message || "Eroare"}`,
               );
            }
         };
         reader.readAsText(f);
      },
      [pushLog, setFailedWithPersist],
   );

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
      if (runningUsers || runningRes || runningFailedInstall) return;
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
               pushLog("error", `User fără id la index ${i}.`);
               continue;
            }

            if (!phoneDigits) {
               pushLog("error", `User oldId=${oldId} fără telefon.`);
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

            let reg;
            try {
               reg = await registerStudent({
                  firstName: u?.firstName,
                  lastName: u?.lastName,
                  phoneDigits,
               });
            } catch (e) {
               pushLog(
                  "error",
                  `Register crash oldId=${oldId} (tel=${phoneDigits}). ${String(e?.message || e || "")}`,
               );
               continue;
            }

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
      runningFailedInstall,
      userMap,
   ]);

   /* ===================== STEP 2: create reservations ===================== */

   const runCreateReservations = useCallback(async () => {
      if (runningUsers || runningRes || runningFailedInstall) return;
      if (!data?.reservations?.length)
         return pushLog("error", "Nu ai reservations în fișier.");

      abortRef.current = false;
      setRunningRes(true);
      pushLog("info", "Start: creare reservations...");

      try {
         try {
            await dispatch(fetchStudents());
         } catch {}

         // load instructors
         let instrList = remoteInstructors;
         try {
            instrList = await loadRemoteInstructors();
            pushLog("info", `Loaded /instructors: ${instrList.length}`);
         } catch (e) {
            pushLog(
               "error",
               `Nu pot încărca /instructors: ${e?.message || "error"}`,
            );
            return;
         }

         const byId = {};
         for (const i of instrList || []) {
            const id = Number(i?.id);
            if (Number.isFinite(id) && id > 0) byId[id] = i;
         }

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
               markReservationFailed({
                  idx,
                  r,
                  level: "error",
                  reason: `nu am userId mapat (oldUserId=${oldUserId}).`,
                  meta: { oldUserId, phone: r?.user?.phone || "" },
               });
               persistResIndex(idx + 1);
               continue;
            }

            let instrId = resolveInstructorIdFromReservation(
               r,
               instrList,
               byId,
            );

            // refresh dacă ID nu există în byId
            if (instrId && !byId?.[Number(instrId)]) {
               try {
                  instrList = await loadRemoteInstructors();
                  pushLog("info", `Refresh /instructors: ${instrList.length}`);
               } catch {}
               const byId2 = {};
               for (const i of instrList || []) {
                  const id = Number(i?.id);
                  if (Number.isFinite(id) && id > 0) byId2[id] = i;
               }
               instrId = resolveInstructorIdFromReservation(
                  r,
                  instrList,
                  byId2,
               );
               for (const k of Object.keys(byId)) delete byId[k];
               for (const k of Object.keys(byId2)) byId[k] = byId2[k];
            }

            if (!instrId) {
               markReservationFailed({
                  idx,
                  r,
                  level: "error",
                  reason: `nu pot rezolva instructorId (nici din id, nici din nume).`,
                  meta: {
                     oldUserId,
                     finalUserId,
                     instructorIdRaw: r?.instructorId ?? null,
                     instructorField: r?.source?.instructorField || "",
                  },
               });
               persistResIndex(idx + 1);
               continue;
            }

            const instrObj = byId?.[Number(instrId)] || null;
            if (!instrObj) {
               markReservationFailed({
                  idx,
                  r,
                  level: "error",
                  reason: `instructorId=${instrId} NU există în DB /instructors (sau ID vechi).`,
                  meta: { oldUserId, finalUserId, instrId },
               });
               persistResIndex(idx + 1);
               continue;
            }

            const startTimeRaw = r?.startTime;
            const startTimeToSend = normalizeStartTimeToSend(
               startTimeRaw,
               assumeZIsLocal,
            );
            if (!startTimeToSend) {
               markReservationFailed({
                  idx,
                  r,
                  level: "error",
                  reason: `startTime invalid: "${String(startTimeRaw || "")}".`,
                  meta: {
                     oldUserId,
                     finalUserId,
                     instrId,
                     startTimeRaw: String(startTimeRaw || ""),
                  },
               });
               persistResIndex(idx + 1);
               continue;
            }

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
                     startTime: startTimeToSend,
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
                  `OK RES[${idx}] userId=${finalUserId} instrId=${instrId} start=${String(
                     startTimeRaw,
                  )} -> ${startTimeToSend}`,
               );
            } catch (e) {
               const msg = String(e?.message || e || "");

               if (looksLikeAlreadyReserved(msg)) {
                  // e deja creată în sistem => nu e “failed”
                  pushLog(
                     "warning",
                     `Already reserved (consider OK) RES[${idx}] instrId=${instrId} start=${startTimeToSend}`,
                  );
               } else {
                  markReservationFailed({
                     idx,
                     r,
                     level: "error",
                     reason: `API FAIL: ${msg || "eroare"}`,
                     meta: {
                        oldUserId,
                        finalUserId,
                        instrId,
                        startTimeRaw: String(startTimeRaw || ""),
                     },
                     derived: { startTimeToSend, payload },
                     apiMessage: msg,
                  });
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
      assumeZIsLocal,
      data,
      delayResMs,
      dispatch,
      findStudentIdByPhone,
      loadRemoteInstructors,
      markReservationFailed,
      persistResIndex,
      pushLog,
      remoteInstructors,
      resIndex,
      runningRes,
      runningUsers,
      runningFailedInstall,
      userMap,
   ]);

   /* ===================== INSTALL FAILED LIST (retry) ===================== */

   const runInstallFailedReservations = useCallback(async () => {
      if (runningUsers || runningRes || runningFailedInstall) return;
      if (!failedReservations?.length)
         return pushLog("error", "Nu ai FAILED reservations.");

      abortRef.current = false;
      setRunningFailedInstall(true);
      pushLog(
         "info",
         `Start: INSTALL FAILED (${failedReservations.length})...`,
      );

      try {
         try {
            await dispatch(fetchStudents());
         } catch {}

         // load instructors
         let instrList = remoteInstructors;
         try {
            instrList = await loadRemoteInstructors();
            pushLog("info", `Loaded /instructors: ${instrList.length}`);
         } catch (e) {
            pushLog(
               "error",
               `Nu pot încărca /instructors: ${e?.message || "error"}`,
            );
            return;
         }

         const byId = {};
         for (const i of instrList || []) {
            const id = Number(i?.id);
            if (Number.isFinite(id) && id > 0) byId[id] = i;
         }

         // snapshot (ca să nu iterăm pe listă mutabilă)
         const snapshot = [...failedReservations];

         for (let i = 0; i < snapshot.length; i++) {
            if (abortRef.current) break;

            const item = snapshot[i];
            const key = String(item?.key || "");
            const idx = Number.isFinite(Number(item?.index))
               ? Number(item.index)
               : -1;
            const r = item?.reservation || null;

            if (!r) {
               pushLog(
                  "error",
                  `FAILED item fără reservation raw (key=${key}).`,
               );
               continue;
            }

            const oldUserId = String(r?.userId ?? "");
            const mappedUserId = oldUserId ? userMap?.[oldUserId] || "" : "";

            let finalUserId = mappedUserId;
            if (!finalUserId) {
               const phoneDigits = onlyDigits(r?.user?.phone);
               if (phoneDigits) finalUserId = findStudentIdByPhone(phoneDigits);
            }

            if (!finalUserId) {
               // rămâne în listă, doar actualizăm reason
               markReservationFailed({
                  idx,
                  r,
                  level: "error",
                  reason: `INSTALL: încă nu am userId mapat (oldUserId=${oldUserId}).`,
                  meta: { oldUserId, phone: r?.user?.phone || "" },
               });
               if (delayResMs > 0) await sleep(Math.min(600, delayResMs));
               continue;
            }

            let instrId = resolveInstructorIdFromReservation(
               r,
               instrList,
               byId,
            );

            if (instrId && !byId?.[Number(instrId)]) {
               try {
                  instrList = await loadRemoteInstructors();
                  pushLog("info", `Refresh /instructors: ${instrList.length}`);
               } catch {}
               const byId2 = {};
               for (const ins of instrList || []) {
                  const id = Number(ins?.id);
                  if (Number.isFinite(id) && id > 0) byId2[id] = ins;
               }
               instrId = resolveInstructorIdFromReservation(
                  r,
                  instrList,
                  byId2,
               );
               for (const k of Object.keys(byId)) delete byId[k];
               for (const k of Object.keys(byId2)) byId[k] = byId2[k];
            }

            if (!instrId || !byId?.[Number(instrId)]) {
               markReservationFailed({
                  idx,
                  r,
                  level: "error",
                  reason: `INSTALL: încă nu pot rezolva instructorId.`,
                  meta: { oldUserId, finalUserId, instrId },
               });
               if (delayResMs > 0) await sleep(Math.min(600, delayResMs));
               continue;
            }

            const startTimeRaw = r?.startTime;
            const startTimeToSend = normalizeStartTimeToSend(
               startTimeRaw,
               assumeZIsLocal,
            );
            if (!startTimeToSend) {
               markReservationFailed({
                  idx,
                  r,
                  level: "error",
                  reason: `INSTALL: startTime invalid: "${String(startTimeRaw || "")}".`,
                  meta: {
                     oldUserId,
                     finalUserId,
                     instrId,
                     startTimeRaw: String(startTimeRaw || ""),
                  },
               });
               if (delayResMs > 0) await sleep(Math.min(600, delayResMs));
               continue;
            }

            const instrObj = byId?.[Number(instrId)] || null;
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
                     startTime: startTimeToSend,
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
                  `INSTALLED key=${key} -> userId=${finalUserId} instrId=${instrId} ${startTimeToSend}`,
               );

               // ✅ scoatem din FAILED list
               removeFailedByKey(key);
            } catch (e) {
               const msg = String(e?.message || e || "");

               if (looksLikeAlreadyReserved(msg)) {
                  pushLog(
                     "warning",
                     `INSTALLED (already reserved) key=${key} -> removed from FAILED.`,
                  );
                  removeFailedByKey(key);
               } else {
                  markReservationFailed({
                     idx,
                     r,
                     level: "error",
                     reason: `INSTALL API FAIL: ${msg || "eroare"}`,
                     meta: {
                        oldUserId,
                        finalUserId,
                        instrId,
                        startTimeRaw: String(startTimeRaw || ""),
                     },
                     derived: { startTimeToSend, payload },
                     apiMessage: msg,
                  });
               }
            }

            if (delayResMs > 0) await sleep(delayResMs);
         }

         pushLog("info", "Gata: INSTALL FAILED (sau abort).");
      } catch (e) {
         pushLog("error", e?.message || "Eroare la INSTALL FAILED.");
      } finally {
         setRunningFailedInstall(false);
      }
   }, [
      assumeZIsLocal,
      delayResMs,
      dispatch,
      failedReservations,
      findStudentIdByPhone,
      loadRemoteInstructors,
      markReservationFailed,
      pushLog,
      remoteInstructors,
      removeFailedByKey,
      runningFailedInstall,
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
            <h3 style={{ margin: 0 }}>
               Migrare: Users → Reservations (Februarie)
            </h3>

            <button
               type="button"
               onClick={stopAll}
               disabled={!runningUsers && !runningRes && !runningFailedInstall}
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
               <Stat
                  label="Remote /instructors"
                  value={stats.remoteInstrCount}
               />
               <Stat label="Z mode detectat" value={stats.zMode} />
            </div>

            {/* FAILED panel */}
            <div
               style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 10,
               }}
            >
               <Stat
                  label="FAILED reservations"
                  value={stats.failedCount}
                  accent={stats.failedCount ? "error" : "info"}
               />

               <div
                  style={{
                     padding: 10,
                     borderRadius: 12,
                     border: "1px solid rgba(255,255,255,0.08)",
                     display: "flex",
                     gap: 8,
                     alignItems: "center",
                     justifyContent: "flex-start",
                     flexWrap: "wrap",
                  }}
               >
                  <button
                     type="button"
                     disabled={
                        !failedReservations?.length ||
                        runningUsers ||
                        runningRes ||
                        runningFailedInstall
                     }
                     onClick={runInstallFailedReservations}
                     style={{ padding: "8px 10px", borderRadius: 10 }}
                  >
                     {runningFailedInstall
                        ? "Installing FAILED..."
                        : "Install FAILED (retry)"}
                  </button>

                  <button
                     type="button"
                     disabled={!failedReservations?.length}
                     onClick={() => {
                        try {
                           navigator.clipboard.writeText(
                              JSON.stringify({ failedReservations }, null, 2),
                           );
                           pushLog("success", "FAILED: copiat în clipboard.");
                        } catch {
                           pushLog("error", "Nu pot copia în clipboard.");
                        }
                     }}
                     style={{ padding: "8px 10px", borderRadius: 10 }}
                  >
                     Copy FAILED JSON
                  </button>

                  <button
                     type="button"
                     disabled={!failedReservations?.length}
                     onClick={() => {
                        downloadJson(
                           "februarie-import-failed-reservations.json",
                           { failedReservations },
                        );
                        pushLog("success", "FAILED: download JSON.");
                     }}
                     style={{ padding: "8px 10px", borderRadius: 10 }}
                  >
                     Download FAILED JSON
                  </button>

                  <button
                     type="button"
                     disabled={
                        !failedReservations?.length ||
                        runningUsers ||
                        runningRes ||
                        runningFailedInstall
                     }
                     onClick={() => {
                        setFailedWithPersist([]);
                        pushLog("warning", "FAILED: șters.");
                     }}
                     style={{ padding: "8px 10px", borderRadius: 10 }}
                  >
                     Clear FAILED
                  </button>

                  <label
                     style={{
                        display: "inline-flex",
                        gap: 8,
                        alignItems: "center",
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: "1px dashed rgba(0,0,0,0.25)",
                        cursor: "pointer",
                        userSelect: "none",
                     }}
                  >
                     <span style={{ fontSize: 12, opacity: 0.85 }}>
                        Load FAILED JSON
                     </span>
                     <input
                        type="file"
                        accept="application/json"
                        onChange={onLoadFailedJson}
                        style={{ width: 180 }}
                        disabled={
                           runningUsers || runningRes || runningFailedInstall
                        }
                     />
                  </label>
               </div>
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
                     disabled={
                        runningUsers || runningRes || runningFailedInstall
                     }
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
                     disabled={
                        runningUsers || runningRes || runningFailedInstall
                     }
                  />
               </label>

               <button
                  type="button"
                  onClick={runCreateUsers}
                  disabled={
                     !data?.users?.length ||
                     runningUsers ||
                     runningRes ||
                     runningFailedInstall
                  }
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
                     !data?.reservations?.length ||
                     runningUsers ||
                     runningRes ||
                     runningFailedInstall
                  }
                  style={{ padding: "10px 12px", borderRadius: 10 }}
               >
                  {runningRes
                     ? "Creare reservations..."
                     : "2) Creează Reservations"}
               </button>

               <button
                  type="button"
                  disabled={runningUsers || runningRes || runningFailedInstall}
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
                     maxHeight: 280,
                     overflow: "auto",
                     display: "grid",
                     gap: 6,
                  }}
               >
                  {log.map((l) => {
                     const isErr = l.type === "error";
                     const isWarn = l.type === "warning";
                     const isOk = l.type === "success";

                     const bg = isErr
                        ? "rgba(255, 0, 0, 0.08)"
                        : isWarn
                          ? "rgba(255, 193, 7, 0.16)"
                          : isOk
                            ? "rgba(0, 200, 0, 0.10)"
                            : "rgba(0,0,0,0.03)";

                     const border = isErr
                        ? "1px solid rgba(255, 0, 0, 0.28)"
                        : isWarn
                          ? "1px solid rgba(255, 193, 7, 0.26)"
                          : isOk
                            ? "1px solid rgba(0, 200, 0, 0.22)"
                            : "1px solid rgba(255,255,255,0.08)";

                     const labelColor = isErr
                        ? "#b00020"
                        : isWarn
                          ? "#7a5a00"
                          : isOk
                            ? "#116b00"
                            : "#111";

                     const textColor = isErr ? "#b00020" : "#111";

                     return (
                        <div
                           key={l.id}
                           style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border,
                              background: bg,
                              opacity: l.type === "info" ? 0.9 : 1,
                           }}
                        >
                           <b style={{ marginRight: 8, color: labelColor }}>
                              {String(l.type || "").toUpperCase()}
                           </b>
                           <span
                              style={{
                                 wordBreak: "break-word",
                                 color: textColor,
                              }}
                           >
                              {l.text}
                           </span>
                        </div>
                     );
                  })}
               </div>
            </div>

            {/* preview FAILED */}
            {failedReservations?.length ? (
               <div style={{ marginTop: 6 }}>
                  <h4 style={{ margin: "8px 0", color: "#b00020" }}>
                     FAILED preview (ultimele 30)
                  </h4>
                  <div
                     style={{
                        maxHeight: 240,
                        overflow: "auto",
                        borderRadius: 12,
                        border: "1px solid rgba(255, 0, 0, 0.22)",
                        background: "rgba(255, 0, 0, 0.05)",
                        padding: 10,
                        display: "grid",
                        gap: 8,
                        fontFamily:
                           'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        fontSize: 12,
                     }}
                  >
                     {failedReservations.slice(0, 30).map((x) => (
                        <div key={x.key} style={{ color: "#b00020" }}>
                           [{x.updatedAt}] {String(x.level || "").toUpperCase()}{" "}
                           RES[
                           {Number.isFinite(x.index) ? x.index : "?"}] attempts=
                           {x.attempts}: {x.reason}
                        </div>
                     ))}
                  </div>
               </div>
            ) : null}
         </div>
      </div>
   );
}

function Stat({ label, value, accent }) {
   const isErr = accent === "error";
   return (
      <div
         style={{
            padding: 10,
            borderRadius: 12,
            border: isErr
               ? "1px solid rgba(255, 0, 0, 0.28)"
               : "1px solid rgba(255,255,255,0.08)",
            background: isErr ? "rgba(255,0,0,0.06)" : "transparent",
         }}
      >
         <div
            style={{
               fontSize: 12,
               opacity: 0.75,
               color: isErr ? "#b00020" : "#111",
            }}
         >
            {label}
         </div>
         <div
            style={{
               fontSize: 18,
               fontWeight: 700,
               color: isErr ? "#b00020" : "#111",
            }}
         >
            {String(value ?? "")}
         </div>
      </div>
   );
}
