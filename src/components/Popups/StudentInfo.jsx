// src/components/Popups/StudentInfoPopup.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { fetchUserReservations } from "../../store/reservationsSlice";
import { updateStudent, removeStudent } from "../../store/studentsSlice";

import { getInstructors } from "../../api/instructorsService";

import {
   getExamHistoryForStudentIdAll,
   downloadExamPdf,
} from "../../api/examService";

import { ReactSVG } from "react-svg";
import successIcon from "../../assets/svg/success.svg";
import cancelIcon from "../../assets/svg/cancel.svg";
import clockIcon from "../../assets/svg/clock.svg";
import downloadIcon from "../../assets/svg/download.svg";

// ✅ same UI icons as PPStudentStatistics
import closeIcon from "../../assets/svg/material-symbols--close-rounded.svg";
import checkIcon from "../../assets/svg/material-symbols--check-rounded.svg";

import UIIcon from "../Common/UIIcon";
import IconButton from "../Common/IconButton";
import ConfirmDeleteButton from "../Common/ConfirmDeleteButton";

import {
   closePopup as closePopupStore,
   openSubPopup,
} from "../Utils/popupStore";

/* ===================== small helpers ===================== */

const clampInt = (n, min = 0) => {
   const x = Number(n);
   if (!Number.isFinite(x)) return min;
   return Math.max(min, Math.trunc(x));
};

// ISO -> "DD MM YYYY - HH:MM" (fără timezone shift)
function fmtIsoDDMMYYYY_HHMM(val) {
   if (val == null) return "—";
   if (typeof val === "string") {
      const m = val.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
      if (m) {
         const [, Y, M, D, h, min] = m;
         return `${D} ${M} ${Y} - ${h}:${min}`;
      }
      return String(val);
   }
   const d = val instanceof Date ? val : new Date(val);
   if (isNaN(d)) return "—";
   const pad = (n) => String(n).padStart(2, "0");
   return `${pad(d.getUTCDate())} ${pad(d.getUTCMonth() + 1)} ${d.getUTCFullYear()} - ${pad(
      d.getUTCHours(),
   )}:${pad(d.getUTCMinutes())}`;
}

function getReservationStartMs(r) {
   const v =
      r?.startTime ??
      r?.start ??
      r?.startAt ??
      r?.startISO ??
      r?.startDate ??
      null;
   if (v == null) return 0;
   if (typeof v === "string") {
      const p = Date.parse(v);
      return Number.isNaN(p) ? 0 : p;
   }
   const d = v instanceof Date ? v : new Date(v);
   const ms = d.getTime();
   return Number.isNaN(ms) ? 0 : ms;
}

function isReservationCancelled(r) {
   const flag =
      r?.isCancelled ??
      r?.is_cancelled ??
      r?.isCanceled ??
      r?.is_canceled ??
      null;
   if (flag !== null) return Boolean(flag);
   const st = String(r?.status || "").toLowerCase();
   return st === "cancelled" || st === "canceled";
}

function getReservationStudentId(r) {
   return r?.studentId ?? r?.student_id ?? r?.student?.id ?? r?.userId ?? null;
}

// ✅ extras helpers (copiate logic din PP)
const normExtras = (src) => ({
   medical_documents: Boolean(src?.medical_documents),
   individual_work: Boolean(src?.individual_work),
   number_of_absences: clampInt(src?.number_of_absences ?? 0, 0),
});

/* ===== Student avatar helpers (same logic ca în StudentItem / StudentProfileUI) ===== */

const firstLetter = (v) =>
   String(v || "")
      .trim()
      .charAt(0) || "";

function getInitials(student) {
   const fn = String(student?.firstName || "").trim();
   const ln = String(student?.lastName || "").trim();

   const a = firstLetter(fn);
   const b = firstLetter(ln);
   if (a && b) return (a + b).toUpperCase();

   const two = fn.slice(0, 2);
   if (two) return two.toUpperCase();

   return "–";
}

function hashStringToUInt(str) {
   let h = 0;
   for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
   return h >>> 0;
}

const AVATAR_HUES = [
   { h: 70, s: 75 },
   { h: 0, s: 100 },
   { h: 30, s: 100 },
   { h: 54, s: 95 },
   { h: 130, s: 65 },
   { h: 210, s: 90 },
   { h: 255, s: 98 },
   { h: 285, s: 100 },
   { h: 330, s: 96 },
];

const AVATAR_LIGHTNESSES = [94, 92, 90, 88, 86, 84, 82, 80, 78, 76, 74];

const AVATAR_COLORS = AVATAR_HUES.flatMap(({ h, s }) =>
   AVATAR_LIGHTNESSES.map((l) => `hsl(${h} ${s}% ${l}%)`),
);

function getAvatarColorFromKey(key) {
   const k = String(key ?? "").trim();
   if (!k) return null;
   const idx = hashStringToUInt(k) % AVATAR_COLORS.length;
   return AVATAR_COLORS[idx];
}

function getAvatarColorFromName(student) {
   const fullName =
      `${student?.firstName || ""} ${student?.lastName || ""}`.trim();
   const hasLetter = /[A-Za-z\u00C0-\u024F\u0400-\u04FF]/.test(fullName);
   if (!hasLetter) return null;

   let normalized = fullName;
   try {
      normalized = fullName.normalize("NFKD");
   } catch {}
   const idx = hashStringToUInt(normalized) % AVATAR_COLORS.length;
   return AVATAR_COLORS[idx];
}

function isLikelyCssColor(v) {
   const s = String(v ?? "").trim();
   if (!s) return false;
   if (s.startsWith("var(")) return true;
   if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return true;
   if (/^(rgb|rgba|hsl|hsla)\(/i.test(s)) return true;
   return false;
}

/* ===================== inline “StudentItem” ===================== */
/* Cerințe:
   - lângă nume să nu arate nimic
   - dedesubt: Telefon · IDNP
*/
function StudentItemInline({
   student,
   color,
   initials,
   secondaryText,
   className = "",
}) {
   const fullName = useMemo(() => {
      const fn = String(student?.firstName || "").trim();
      const ln = String(student?.lastName || "").trim();
      return `${fn} ${ln}`.trim();
   }, [student]);

   const phoneText =
      String(secondaryText ?? student?.phone ?? "—").trim() || "—";
   const idnp = String(student?.idnp ?? "").trim();
   const meta = idnp ? `${phoneText} · IDNP ${idnp}` : phoneText;

   return (
      <div className={`studentItem ${className}`}>
         <div
            className="studentItem__avatar"
            aria-hidden="true"
            style={{
               background: color,
               color: "var(--black-p)",
            }}
         >
            <span>{initials}</span>
         </div>

         <div className="studentItem__info">
            <h3 className="studentItem__name">{fullName || "–"}</h3>
            <p className="studentItem__meta">{meta || "—"}</p>
         </div>
      </div>
   );
}

export default function StudentInfoPopup({ student, onClose }) {
   const dispatch = useDispatch();
   const storeStudent = useSelector((s) => {
      const sid = student?.id;
      if (!sid) return null;
      const list = s.students?.list || [];
      return list.find((u) => String(u.id) === String(sid)) || null;
   });

   const {
      list: reservations = [],
      loading,
      error,
   } = useSelector((s) => s.reservations);

   const [isEditing, setIsEditing] = useState(false);

   // edit form: DOAR date profil
   const [formData, setFormData] = useState({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
   });

   // local snapshot
   const [liveStudent, setLiveStudent] = useState(student || {});

   // save profile
   const [saving, setSaving] = useState(false);
   const [saveError, setSaveError] = useState("");

   // tabs
   const [tab, setTab] = useState("reservations"); // 'reservations' | 'cancelled' | 'attempts'
   const [attempts, setAttempts] = useState([]);
   const [attemptsLoading, setAttemptsLoading] = useState(false);
   const [attemptsError, setAttemptsError] = useState("");

   // pdf download
   const [downloadingId, setDownloadingId] = useState(null);
   const [downloadError, setDownloadError] = useState("");

   /* ===================== note (autosave on blur) ===================== */

   const [noteValue, setNoteValue] = useState("");
   const [noteSaving, setNoteSaving] = useState(false);
   const [noteError, setNoteError] = useState("");

   const noteSaveSeqRef = useRef(Promise.resolve());
   const noteDesiredRef = useRef("");
   const noteLastSavedRef = useRef("");

   const requestSaveNote = (nextText) => {
      if (!student?.id) return;

      const desired = String(nextText ?? "");
      noteDesiredRef.current = desired;

      setNoteSaving(true);
      setNoteError("");

      noteSaveSeqRef.current = noteSaveSeqRef.current
         .then(async () => {
            const cur = noteDesiredRef.current;
            if (cur === noteLastSavedRef.current) return;

            const updated = await dispatch(
               updateStudent({
                  id: student.id,
                  data: { privateMessage: cur },
               }),
            ).unwrap();

            const serverMsg = String(updated?.privateMessage ?? cur);
            noteLastSavedRef.current = serverMsg;

            setNoteValue(serverMsg);
            setLiveStudent((p) => ({ ...p, privateMessage: serverMsg }));
         })
         .catch((e) => {
            console.error("Autosave note failed:", e);
            setNoteError("Nu s-a putut salva notița. Vezi consola / Network.");
         })
         .finally(() => {
            if (noteDesiredRef.current === noteLastSavedRef.current)
               setNoteSaving(false);
         });
   };

   const onNoteChange = (e) => {
      setNoteError("");
      setNoteValue(e.target.value);
   };

   const onNoteBlur = () => requestSaveNote(noteValue);

   // Enter = save (Shift+Enter = newline)
   const onNoteKeyDown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
         e.preventDefault();
         e.currentTarget.blur();
      }
   };

   /* ===================== extras (Doc / Individual / Absente) ===================== */

   const [extrasSaving, setExtrasSaving] = useState(false);
   const [extrasError, setExtrasError] = useState("");
   const [extrasBase, setExtrasBase] = useState(() => normExtras(student));
   const [extrasForm, setExtrasForm] = useState(() => normExtras(student));

   // absences text input (UI)
   const [absText, setAbsText] = useState("0");
   const absFocusedRef = useRef(false);

   // autosave queue (ca în PP)
   const saveSeqRef = useRef(Promise.resolve());
   const desiredRef = useRef(normExtras(student));
   const lastSentRef = useRef("");

   const requestSaveExtras = (nextForm) => {
      if (!student?.id) return;

      const desired = normExtras(nextForm);
      desiredRef.current = desired;

      setExtrasSaving(true);
      setExtrasError("");

      saveSeqRef.current = saveSeqRef.current
         .then(async () => {
            const cur = desiredRef.current;
            const curJson = JSON.stringify(cur);

            if (curJson === lastSentRef.current) return;

            const updated = await dispatch(
               updateStudent({ id: student.id, data: cur }),
            ).unwrap();
            lastSentRef.current = curJson;

            // mismatch detection (dacă backend ignoră)
            const mismatches = [];
            if (
               typeof updated?.medical_documents === "boolean" &&
               updated.medical_documents !== cur.medical_documents
            )
               mismatches.push("medical_documents");
            if (
               typeof updated?.individual_work === "boolean" &&
               updated.individual_work !== cur.individual_work
            )
               mismatches.push("individual_work");
            if (
               updated?.number_of_absences != null &&
               Number(updated.number_of_absences) !== cur.number_of_absences
            )
               mismatches.push("number_of_absences");

            const serverState = normExtras(updated ?? cur);

            if (mismatches.length) {
               setExtrasError(
                  `Backend a ignorat: ${mismatches.join(", ")}. Payload-ul e corect, dar serverul nu aplică aceste câmpuri.`,
               );
            }

            setExtrasBase(serverState);

            // nu suprascriem dacă user a schimbat iar între timp
            const desiredNowJson = JSON.stringify(desiredRef.current);
            if (desiredNowJson === curJson) setExtrasForm(serverState);

            // sync liveStudent
            setLiveStudent((p) => ({
               ...p,
               ...(updated || cur),
               ...serverState,
            }));
         })
         .catch((e) => {
            console.error("Autosave extras failed:", e);
            setExtrasError("Salvarea a eșuat. Vezi consola / Network.");
         })
         .finally(() => {
            const desiredNowJson = JSON.stringify(desiredRef.current);
            if (desiredNowJson === lastSentRef.current) setExtrasSaving(false);
         });
   };

   const toggleField = (key) => {
      setExtrasError("");
      setExtrasForm((p) => {
         const next = { ...p, [key]: !Boolean(p[key]) };
         requestSaveExtras(next);
         return next;
      });
   };

   const onAbsFocus = (e) => {
      absFocusedRef.current = true;
      const el = e.currentTarget;
      const n = clampInt(extrasForm.number_of_absences ?? 0, 0);

      setAbsText(n === 0 ? "" : String(n));

      requestAnimationFrame(() => {
         if (el && typeof el.select === "function") el.select();
      });
   };

   const onAbsChange = (e) => {
      const digits = String(e.target.value ?? "").replace(/[^\d]/g, "");
      const cleaned = digits.replace(/^0+(?=\d)/, "");
      setAbsText(cleaned);

      const n = cleaned === "" ? 0 : clampInt(parseInt(cleaned, 10), 0);
      setExtrasForm((p) => ({ ...p, number_of_absences: n }));
   };

   const onAbsBlur = () => {
      absFocusedRef.current = false;

      const digits = String(absText ?? "").replace(/[^\d]/g, "");
      const cleaned = digits.replace(/^0+(?=\d)/, "");
      const n = cleaned === "" ? 0 : clampInt(parseInt(cleaned, 10), 0);

      setAbsText(String(n));

      setExtrasForm((p) => {
         const next = { ...p, number_of_absences: n };
         requestSaveExtras(next);
         return next;
      });
   };

   const onAbsKeyDown = (e) => {
      if (e.key === "Enter") {
         e.preventDefault();
         e.currentTarget.blur();
      }
   };

   // keep absText synced when extrasForm changes (dacă nu e focus)
   useEffect(() => {
      if (absFocusedRef.current) return;
      setAbsText(String(clampInt(extrasForm.number_of_absences ?? 0, 0)));
   }, [extrasForm.number_of_absences]);

   /* ===================== close ===================== */

   const safeClose = () => {
      if (typeof onClose === "function") onClose();
      else {
         try {
            closePopupStore();
         } catch {}
      }
   };

   /* ===================== init/reset when student changes ===================== */

   useEffect(() => {
      setLiveStudent(student || {});
      setTab("reservations");
      setIsEditing(false);
      setSaveError("");
      setSaving(false);

      setFormData({
         firstName: student?.firstName || "",
         lastName: student?.lastName || "",
         email: student?.email || "",
         phone: student?.phone || "",
      });

      // note init + reset queue
      const baseNote = String(student?.privateMessage || "");
      setNoteValue(baseNote);

      noteSaveSeqRef.current = Promise.resolve();
      noteDesiredRef.current = baseNote;
      noteLastSavedRef.current = baseNote;
      setNoteSaving(false);
      setNoteError("");

      // extras init + reset queue
      const base = normExtras(student);
      setExtrasBase(base);
      setExtrasForm(base);
      setAbsText(String(base.number_of_absences ?? 0));
      absFocusedRef.current = false;

      saveSeqRef.current = Promise.resolve();
      desiredRef.current = base;
      lastSentRef.current = "";
      setExtrasSaving(false);
      setExtrasError("");
   }, [student]);

   // keep in sync with store updates (ex: privateMessage saved elsewhere)
   useEffect(() => {
      if (!storeStudent?.id) return;

      setLiveStudent((p) => ({ ...p, ...storeStudent }));

      if (!isEditing) {
         setFormData({
            firstName: storeStudent?.firstName || "",
            lastName: storeStudent?.lastName || "",
            email: storeStudent?.email || "",
            phone: storeStudent?.phone || "",
         });

         const baseNote = String(storeStudent?.privateMessage || "");
         setNoteValue(baseNote);
         noteDesiredRef.current = baseNote;
         noteLastSavedRef.current = baseNote;
         setNoteSaving(false);
         setNoteError("");

         const baseExtras = normExtras(storeStudent);
         setExtrasBase(baseExtras);
         setExtrasForm(baseExtras);
         setAbsText(String(baseExtras.number_of_absences ?? 0));
         absFocusedRef.current = false;
         setExtrasSaving(false);
         setExtrasError("");
      }
   }, [storeStudent, isEditing]);

   /* ===================== reservations load ===================== */

   useEffect(() => {
      if (student?.id) dispatch(fetchUserReservations(String(student.id)));
   }, [dispatch, student?.id]);

   /* ===================== profile edit handlers ===================== */

   const startEdit = () => {
      setIsEditing(true);
      setSaveError("");
   };

   const cancelEdit = () => {
      setIsEditing(false);
      setSaveError("");

      setFormData({
         firstName: liveStudent?.firstName ?? student?.firstName ?? "",
         lastName: liveStudent?.lastName ?? student?.lastName ?? "",
         email: liveStudent?.email ?? student?.email ?? "",
         phone: liveStudent?.phone ?? student?.phone ?? "",
      });
   };

   const handleChange = (e) => {
      const { name, value } = e.target;
      setFormData((p) => ({ ...p, [name]: value }));
   };

   const handleSave = async () => {
      if (!student?.id) return;

      setSaving(true);
      setSaveError("");

      try {
         // ✅ save ONLY profile fields (nu extras, nu note)
         const payload = {
            firstName: String(formData.firstName || "").trim(),
            lastName: String(formData.lastName || "").trim(),
            email: String(formData.email || "").trim(),
            phone: String(formData.phone || "").trim(),
         };

         const updated = await dispatch(
            updateStudent({ id: student.id, data: payload }),
         ).unwrap();

         const next = { ...liveStudent, ...payload, ...(updated || {}) };
         setLiveStudent(next);

         setIsEditing(false);
      } catch (err) {
         console.error("Save failed:", err);
         setSaveError("Actualizarea a eșuat. Vezi consola / Network.");
      } finally {
         setSaving(false);
      }
   };

   /* ===================== delete ===================== */

   const handleDelete = async () => {
      try {
         await dispatch(removeStudent(student.id)).unwrap();
         setIsEditing(false);
         setLiveStudent({});
         safeClose();
      } catch (err) {
         console.error("Eroare la ștergere:", err);
         alert(err?.message || "Ștergerea a eșuat!");
      }
   };

   /* ===================== reservations derived ===================== */

   const myReservations = useMemo(() => {
      if (!student?.id) return [];
      const sid = String(student.id);
      return reservations.filter(
         (r) => String(getReservationStudentId(r) ?? "") === sid,
      );
   }, [reservations, student?.id]);

   const { activeReservations, cancelledReservations } = useMemo(() => {
      const active = [];
      const cancelled = [];
      for (const r of myReservations)
         (isReservationCancelled(r) ? cancelled : active).push(r);
      return { activeReservations: active, cancelledReservations: cancelled };
   }, [myReservations]);

   const myReservationsAsc = useMemo(() => {
      const arr = [...activeReservations];
      arr.sort((a, b) => getReservationStartMs(a) - getReservationStartMs(b));
      return arr;
   }, [activeReservations]);

   const myCancelledAsc = useMemo(() => {
      const arr = [...cancelledReservations];
      arr.sort((a, b) => getReservationStartMs(a) - getReservationStartMs(b));
      return arr;
   }, [cancelledReservations]);

   /* ===================== exam attempts ===================== */

   useEffect(() => {
      let stop = false;
      if (tab !== "attempts" || !student?.id) return;

      (async () => {
         setAttemptsLoading(true);
         setAttemptsError("");
         try {
            const all = await getExamHistoryForStudentIdAll(
               String(student.id),
               {
                  pageSize: 50,
                  maxPages: 10,
               },
            );
            if (!stop) setAttempts(Array.isArray(all) ? all : []);
         } catch (e) {
            if (!stop)
               setAttemptsError(
                  e?.message || "Nu am putut încărca încercările.",
               );
         } finally {
            if (!stop) setAttemptsLoading(false);
         }
      })();

      return () => {
         stop = true;
      };
   }, [tab, student?.id]);

   /* ===================== derived “TOP UI” ===================== */

   const fn = String(liveStudent?.firstName ?? student?.firstName ?? "");
   const ln = String(liveStudent?.lastName ?? student?.lastName ?? "");
   const email = String(liveStudent?.email ?? student?.email ?? "");
   const phone = String(liveStudent?.phone ?? student?.phone ?? "");
   const idnp = String(liveStudent?.idnp ?? student?.idnp ?? "").trim();

   const rawExplicitColor = String(
      liveStudent?.color ?? student?.color ?? "",
   ).trim();
   const explicitColor = isLikelyCssColor(rawExplicitColor)
      ? rawExplicitColor
      : "";

   const fullName = `${fn} ${ln}`.trim() || "—";

   const desiredInstructorId =
      liveStudent?.desiredInstructorId ??
      liveStudent?.desiredInstructor?.id ??
      student?.desiredInstructorId ??
      student?.desiredInstructor?.id ??
      null;

   // ===== instructor name resolve (ID -> nume prenume) =====
   const [instructorsById, setInstructorsById] = useState(() => new Map());
   const [instLoading, setInstLoading] = useState(false);
   const [instError, setInstError] = useState("");

   const instFetchSeqRef = useRef(Promise.resolve());
   const instLoadedRef = useRef(false);

   useEffect(() => {
      let stop = false;

      if (!desiredInstructorId) return;

      const obj =
         liveStudent?.desiredInstructor ?? student?.desiredInstructor ?? null;
      const objName = obj
         ? `${obj?.firstName || ""} ${obj?.lastName || ""}`.trim()
         : "";
      if (objName) return;

      if (instLoadedRef.current && instructorsById.size) return;

      setInstLoading(true);
      setInstError("");

      instFetchSeqRef.current = instFetchSeqRef.current
         .then(async () => {
            const list = await getInstructors();
            if (stop) return;

            const map = new Map();
            for (const it of Array.isArray(list) ? list : []) {
               const id = it?.id ?? it?._id;
               if (id != null) map.set(String(id), it);
            }

            instLoadedRef.current = true;
            setInstructorsById(map);
         })
         .catch((e) => {
            console.error("getInstructors failed:", e);
            if (!stop)
               setInstError("Nu am putut încărca lista de instructori.");
         })
         .finally(() => {
            if (!stop) setInstLoading(false);
         });

      return () => {
         stop = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [desiredInstructorId]);

   const desiredInstructorName = useMemo(() => {
      if (!desiredInstructorId) return "";

      const obj =
         liveStudent?.desiredInstructor ?? student?.desiredInstructor ?? null;
      const objName = obj
         ? `${obj?.firstName || ""} ${obj?.lastName || ""}`.trim()
         : "";
      if (objName) return objName;

      const hit = instructorsById.get(String(desiredInstructorId));
      const hitName = hit
         ? `${hit?.firstName || ""} ${hit?.lastName || ""}`.trim()
         : "";
      if (hitName) return hitName;

      return instLoading ? "Se încarcă..." : "—";
   }, [
      desiredInstructorId,
      liveStudent,
      student,
      instructorsById,
      instLoading,
   ]);

   const avatarKey =
      student?.id ?? liveStudent?.id ?? phone ?? email ?? "__student__";
   const avatarSeed = useMemo(() => {
      const k = String(avatarKey ?? "").trim();
      if (k) return k;

      const n = `${fn} ${ln}`.trim();
      if (n) return n;

      const p = String(phone ?? "").trim();
      if (p) return p;

      const e = String(email ?? "").trim();
      if (e) return e;

      return "__student__";
   }, [avatarKey, fn, ln, phone, email]);

   const avatarInitials = useMemo(
      () => getInitials({ firstName: fn, lastName: ln }),
      [fn, ln],
   );

   const avatarBg = useMemo(() => {
      if (explicitColor) return explicitColor;

      const byName = getAvatarColorFromName({ firstName: fn, lastName: ln });
      if (byName) return byName;

      const byKey = getAvatarColorFromKey(avatarSeed);
      return byKey || "var(--black-s)";
   }, [explicitColor, fn, ln, avatarSeed]);

   const chipData = useMemo(() => {
      const v = (x) =>
         x === null || x === undefined || x === "" ? "—" : String(x);
      const out = [];

      if (desiredInstructorId) {
         out.push({
            key: "desiredInstructorId",
            label: "Doar:",
            value: desiredInstructorName || "—",
         });
      }

      out.push({
         key: "email",
         label: "",
         value: v(email),
      });

      out.push({
         key: "medical_documents",
         label: "Doc. medicale",
         value: "",
         icon: extrasForm.medical_documents ? "check" : "close",
      });

      out.push({
         key: "individual_work",
         label: "L. individual",
         value: "",
         icon: extrasForm.individual_work ? "check" : "close",
      });

      out.push({
         key: "number_of_absences",
         label: "Absențe:",
         value: v(extrasForm.number_of_absences),
      });

      return out;
   }, [
      desiredInstructorId,
      desiredInstructorName,
      email,
      extrasForm.medical_documents,
      extrasForm.individual_work,
      extrasForm.number_of_absences,
   ]);

   /* ✅ safe return */
   if (!student) return null;

   const handleDownloadPdf = async (examId) => {
      setDownloadError("");
      setDownloadingId(examId);
      try {
         await downloadExamPdf(examId);
      } catch (e) {
         console.error("Download PDF failed:", e);
         setDownloadError(e?.message || "Descărcarea a eșuat.");
      } finally {
         setDownloadingId(null);
      }
   };

   // classes like in PP (păstrate)
   const mdBtnClass =
      "pp-stats__toggle" +
      (extrasForm.medical_documents ? " is-on" : " is-off") +
      (extrasSaving ? " is-disabled" : "");

   const iwBtnClass =
      "pp-stats__toggle" +
      (extrasForm.individual_work ? " is-on" : " is-off") +
      (extrasSaving ? " is-disabled" : "");

   return (
      <div className="studentsProfileUI studentsProfileUI--popup students-info">
         {/* Header */}
         <div className="studentsProfileUI__header popup-panel__header">
            <h3 className="popup-panel__title">
               {!isEditing ? "Profil elev" : "Editare elev"}
            </h3>

            <div className="studentsProfileUI__headerActions">
               {!isEditing && (
                  <IconButton
                     className="studentsProfileUI__iconBtn"
                     icon="edit"
                     variant="square"
                     onClick={startEdit}
                     title="Editează"
                     aria-label="Editează"
                  />
               )}
            </div>
         </div>

         <div
            style={{ padding: 0 }}
            className="studentsProfileUI__content students-info__content students-info-popup"
         >
            {/* ✅ VIEW */}
            {!isEditing ? (
               <>
                  <StudentItemInline
                     student={{
                        ...student,
                        ...liveStudent,
                        firstName: fn,
                        lastName: ln,
                        email,
                        phone,
                        idnp,
                     }}
                     color={avatarBg}
                     initials={avatarInitials}
                     secondaryText={phone || "—"}
                     className="studentsProfileUI__studentItemTop"
                  />

                  <div className="studentsProfileUI__heroMeta">
                     {chipData.map((c) => {
                        const titleText =
                           `${String(c.label || "").trim()} ${String(c.value || "").trim()}`.trim();
                        return (
                           <div
                              key={c.key}
                              className="studentsProfileUI__chip"
                              title={titleText || undefined}
                           >
                              {c.icon && (
                                 <UIIcon
                                    name={c.icon}
                                    className="studentsProfileUI__chipIcon"
                                 />
                              )}
                              <span>
                                 {c.label ? `${c.label} ` : ""}
                                 {c.value}
                              </span>
                           </div>
                        );
                     })}
                  </div>
                  <div className="students-info__admin">
                     {/* NOTIȚĂ - input separat în edit */}
                     <div
                        className={
                           "students-info__admin-note" +
                           (noteSaving ? " is-saving" : "")
                        }
                     >
                        <span className="students-info__admin-note-label">
                           Notiță
                        </span>
                        <input
                           className="students-info__admin-note-input"
                           value={noteValue}
                           onChange={onNoteChange}
                           onBlur={onNoteBlur}
                           onKeyDown={onNoteKeyDown}
                           placeholder="Notiță rapidă…"
                           type="text"
                           autoComplete="off"
                        />
                     </div>
                  </div>
               </>
            ) : (
               <>
                  {/* ✅ EDIT: notiță (input 2) + 3 controale doar aici */}
                  <div className="studentsProfileUI__form">
                     {/* INPUTS profil */}
                     <div className="studentsProfileUI__inputs">
                        <input
                           type="text"
                           name="firstName"
                           value={formData.firstName}
                           onChange={handleChange}
                           placeholder="Prenume"
                        />
                        <input
                           type="text"
                           name="lastName"
                           value={formData.lastName}
                           onChange={handleChange}
                           placeholder="Nume"
                        />
                        <input
                           type="email"
                           name="email"
                           value={formData.email}
                           onChange={handleChange}
                           placeholder="Email"
                        />
                        <input
                           type="text"
                           name="phone"
                           value={formData.phone}
                           onChange={handleChange}
                           placeholder="Telefon"
                        />
                     </div>
                     <div className="students-info__admin">
                        {/* NOTIȚĂ - input separat în edit */}
                        <div
                           className={
                              "students-info__admin-note" +
                              (noteSaving ? " is-saving" : "")
                           }
                        >
                           <span className="students-info__admin-note-label">
                              Notiță
                           </span>

                           <input
                              className="students-info__admin-note-input"
                              value={noteValue}
                              onChange={onNoteChange}
                              onBlur={onNoteBlur}
                              onKeyDown={onNoteKeyDown}
                              placeholder="Scrie o notiță…"
                              type="text"
                              autoComplete="off"
                           />

                           {noteError && (
                              <div className="students-info__error">
                                 {noteError}
                              </div>
                           )}
                        </div>

                        {/* 3 controale - un singur rând flex */}
                        <div
                           className={
                              "students-info__admin-row" +
                              (extrasSaving ? " is-disabled" : "")
                           }
                        >
                           {/* DOC MEDICALE */}
                           <button
                              type="button"
                              onClick={() => toggleField("medical_documents")}
                              disabled={extrasSaving}
                              aria-pressed={Boolean(
                                 extrasForm.medical_documents,
                              )}
                              className={mdBtnClass}
                           >
                              <ReactSVG
                                 src={
                                    extrasForm.medical_documents
                                       ? checkIcon
                                       : closeIcon
                                 }
                                 className="pp-stats__toggle-icon"
                              />
                              <span className="pp-stats__toggle-text">
                                 Doc. medicale
                              </span>
                           </button>

                           {/* INDIVIDUAL */}
                           <button
                              type="button"
                              onClick={() => toggleField("individual_work")}
                              disabled={extrasSaving}
                              aria-pressed={Boolean(extrasForm.individual_work)}
                              className={iwBtnClass}
                              //style={{ flex: "1 1 auto" }}
                           >
                              <ReactSVG
                                 src={
                                    extrasForm.individual_work
                                       ? checkIcon
                                       : closeIcon
                                 }
                                 className="pp-stats__toggle-icon"
                              />
                              <span className="pp-stats__toggle-text">
                                 Individual
                              </span>
                           </button>

                           {/* ABSENȚE */}
                           <div
                              className={
                                 "pp-stats__stepper " +
                                 (extrasSaving ? " is-disabled" : "")
                              }
                           >
                              <span className="pp-stats__stepper-label">
                                 Absențe
                              </span>

                              <input
                                 type="text"
                                 name="number_of_absences"
                                 inputMode="numeric"
                                 pattern="[0-9]*"
                                 value={absText}
                                 disabled={extrasSaving}
                                 onFocus={onAbsFocus}
                                 onChange={onAbsChange}
                                 onBlur={onAbsBlur}
                                 onKeyDown={onAbsKeyDown}
                                 className="pp-stats__stepper-input"
                              />
                           </div>
                        </div>
                     </div>

                     <div className="studentsProfileUI__btns">
                        <ConfirmDeleteButton
                           disabled={saving}
                           onConfirm={handleDelete}
                           title="Șterge elevul"
                           fullWidth={false}
                        >
                           Șterge
                        </ConfirmDeleteButton>

                        <button
                           className="studentsProfileUI__btn studentsProfileUI__btn--save"
                           onClick={handleSave}
                           disabled={saving}
                        >
                           {saving ? "Salvez..." : "Salvează"}
                        </button>

                        <button
                           className="studentsProfileUI__btn studentsProfileUI__btn--normal"
                           onClick={cancelEdit}
                           disabled={saving}
                        >
                           Cancel
                        </button>
                     </div>
                  </div>
               </>
            )}

            {/* TABS (nemodificat) */}
            <div className="students-info__tabs">
               <button
                  className={
                     "students-info__tab" +
                     (tab === "reservations" ? " is-active" : "")
                  }
                  onClick={() => setTab("reservations")}
               >
                  Programări
               </button>
               <button
                  className={
                     "students-info__tab" +
                     (tab === "cancelled" ? " is-active" : "")
                  }
                  onClick={() => setTab("cancelled")}
               >
                  Anulări
               </button>
               <button
                  className={
                     "students-info__tab" +
                     (tab === "attempts" ? " is-active" : "")
                  }
                  onClick={() => setTab("attempts")}
               >
                  Examen
               </button>
            </div>

            {(tab === "reservations" || tab === "cancelled") && (
               <>
                  {loading && (
                     <p className="students-info__loading">
                        Se încarcă programările...
                     </p>
                  )}
                  {error && <p className="students-info__error">{error}</p>}
               </>
            )}

            {/* RESERVATIONS */}
            {tab === "reservations" && (
               <>
                  {!loading && myReservationsAsc.length === 0 && (
                     <p className="students-info__empty">
                        Nu există programări.
                     </p>
                  )}

                  {!loading && myReservationsAsc.length > 0 && (
                     <div className="students-info__list-wrapper">
                        <div className="students-info__list">
                           {myReservationsAsc.map((res, index) => {
                              const status = res.status || "pending";
                              return (
                                 <div
                                    key={
                                       (res.id ?? res._id ?? "res") +
                                       "-" +
                                       index
                                    }
                                    onClick={() =>
                                       openSubPopup("reservationEdit", {
                                          reservationId: res.id,
                                       })
                                    }
                                    className={`students-info__item students-info__item--${status}`}
                                 >
                                    <div className="students-info__item-left">
                                       <h3>{fullName}</h3>
                                       <p>
                                          {res.instructor?.firstName
                                             ? `cu ${res.instructor.firstName} ${res.instructor.lastName}`
                                             : "fără instructor"}
                                       </p>
                                       <span>
                                          {fmtIsoDDMMYYYY_HHMM(res.startTime)}
                                       </span>
                                    </div>
                                    <div className="students-info__item-right">
                                       {status === "completed" && (
                                          <ReactSVG
                                             className="students-info__item-icon completed"
                                             src={successIcon}
                                          />
                                       )}
                                       {status === "cancelled" && (
                                          <ReactSVG
                                             className="students-info__item-icon cancelled"
                                             src={cancelIcon}
                                          />
                                       )}
                                       {status === "pending" && (
                                          <ReactSVG
                                             className="students-info__item-icon pending"
                                             src={clockIcon}
                                          />
                                       )}
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                     </div>
                  )}
               </>
            )}

            {/* CANCELLED */}
            {tab === "cancelled" && (
               <>
                  {!loading && myCancelledAsc.length === 0 && (
                     <p className="students-info__empty">Nu există anulări.</p>
                  )}

                  {!loading && myCancelledAsc.length > 0 && (
                     <div className="students-info__list-wrapper">
                        <div className="students-info__list">
                           {myCancelledAsc.map((res, index) => (
                              <div
                                 key={
                                    (res.id ?? res._id ?? "res") + "-" + index
                                 }
                                 onClick={() =>
                                    openSubPopup("reservationEdit", {
                                       reservationId: res.id,
                                    })
                                 }
                                 className="students-info__item students-info__item--cancelled"
                              >
                                 <div className="students-info__item-left">
                                    <h3>{fullName}</h3>
                                    <p>
                                       {res.instructor?.firstName
                                          ? `cu ${res.instructor.firstName} ${res.instructor.lastName}`
                                          : "fără instructor"}
                                    </p>
                                    <span>
                                       {fmtIsoDDMMYYYY_HHMM(res.startTime)}
                                    </span>
                                 </div>
                                 <div className="students-info__item-right">
                                    <ReactSVG
                                       className="students-info__item-icon cancelled"
                                       src={cancelIcon}
                                    />
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>
                  )}
               </>
            )}

            {/* ATTEMPTS */}
            {tab === "attempts" && (
               <div className="students-info__attempts">
                  {attemptsLoading && <p>Se încarcă încercările…</p>}
                  {attemptsError && (
                     <p className="students-info__error">{attemptsError}</p>
                  )}
                  {downloadError && (
                     <p className="students-info__error">
                        Descărcare: {downloadError}
                     </p>
                  )}

                  {!attemptsLoading &&
                     !attemptsError &&
                     attempts.length === 0 && (
                        <p className="students-info__empty">
                           Nu există încercări.
                        </p>
                     )}

                  {!attemptsLoading &&
                     !attemptsError &&
                     attempts.length > 0 && (
                        <div className="students-info__list students-info__list--attempts">
                           {attempts.slice(0, 50).map((a, idx) => {
                              const eid = a.examId ?? a.id;
                              const status = String(
                                 a.status || "UNKNOWN",
                              ).toLowerCase();

                              const started = a.startedAt
                                 ? fmtIsoDDMMYYYY_HHMM(a.startedAt)
                                 : "–";
                              const finished = a.finishedAt
                                 ? fmtIsoDDMMYYYY_HHMM(a.finishedAt)
                                 : null;
                              const lineLeft = finished
                                 ? `${started} → ${finished}`
                                 : started;

                              const scoreText =
                                 a.scorePct != null
                                    ? `${Math.round(a.scorePct)}%`
                                    : a.correct != null && a.total != null
                                      ? `${a.correct}/${a.total}`
                                      : "–";

                              return (
                                 <div
                                    key={(a.id ?? eid ?? "attempt") + "-" + idx}
                                    className={`students-info__attempt students-info__attempt--${status}`}
                                    style={{
                                       position: "relative",
                                       paddingRight: 44,
                                    }}
                                 >
                                    <div>
                                       <div className="students-info__attempt-status">
                                          {status}
                                       </div>
                                       <div className="students-info__attempt-dates">
                                          {lineLeft}
                                       </div>
                                    </div>

                                    <div className="students-info__attempt-score">
                                       <div>{scoreText}</div>
                                       {a.total != null && (
                                          <div>{a.total} întrebări</div>
                                       )}
                                    </div>

                                    {eid && (
                                       <button
                                          type="button"
                                          onClick={(e) => {
                                             e.stopPropagation();
                                             handleDownloadPdf(eid);
                                          }}
                                          className="students-info__btn-icon students-info__attempt-download"
                                          title={
                                             downloadingId === eid
                                                ? "Se descarcă..."
                                                : "Descarcă rezultatul (PDF)"
                                          }
                                          disabled={downloadingId === eid}
                                          style={{
                                             position: "absolute",
                                             top: 6,
                                             right: 6,
                                             padding: 6,
                                             opacity: 0.9,
                                          }}
                                       >
                                          <ReactSVG
                                             src={downloadIcon}
                                             className={
                                                "students-info__item-icon download" +
                                                (downloadingId === eid
                                                   ? " is-loading"
                                                   : "")
                                             }
                                          />
                                       </button>
                                    )}
                                 </div>
                              );
                           })}
                        </div>
                     )}
               </div>
            )}
         </div>
      </div>
   );
}
