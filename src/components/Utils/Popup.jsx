// src/components/Utils/Popup.jsx
import React, {
   useEffect,
   useState,
   useRef,
   useCallback,
   lazy,
   Suspense,
} from "react";
import {
   subscribePopup,
   getCurrentPopup,
   closePopup as closePopupStore,
   getCurrentSubPopup,
   closeSubPopup as requestCloseSubPopup,
} from "./popupStore";

import { ReactSVG } from "react-svg";
import addIcon from "../../assets/svg/add-s.svg";

const DEFERRED_POPUP_TYPES = new Set([
   "studentDetails",
   "reservationEdit",
   "createRezervation",
]);

function lazyWithPreload(factory) {
   const Component = lazy(factory);
   Component.preload = factory;
   return Component;
}

const AAddProg = lazyWithPreload(() => import("../Popups/AAddProg"));
const SAddProg = lazyWithPreload(() => import("../Popups/SAddProg"));
const AddInstr = lazyWithPreload(() => import("../Popups/AddInstr"));
const ADayInfoPopup = lazyWithPreload(() => import("../Popups/ADayInfo"));
const StudentInfo = lazyWithPreload(() => import("../Popups/StudentInfo"));
const ReservationEdit = lazyWithPreload(
   () => import("../Popups/EditReservation"),
);
const Profile = lazyWithPreload(() => import("../Popups/Profile"));
const EventInfoPopup = lazyWithPreload(() => import("../Popups/EventInfo"));
const InstrEventInfoPopup = lazyWithPreload(
   () => import("../Popups/InstrEventInfo"),
);
const AddManager = lazyWithPreload(() => import("../Popups/AddManager"));
const StudentsMultiSelectPopup = lazyWithPreload(
   () => import("../Popups/StudentsMultiSelectPopup"),
);
const CreateRezervation = lazyWithPreload(
   () => import("../Popups/CreateRezervation"),
);
const QuestionCategoriesPopup = lazyWithPreload(
   () => import("../Popups/QuestionCategories"),
);
const AddProfessor = lazyWithPreload(() => import("../Popups/AddProfessor"));

const POPUP_COMPONENT_BY_TYPE = {
   addProg: AAddProg,
   sAddProg: SAddProg,
   addInstr: AddInstr,
   dayInfo: ADayInfoPopup,
   studentDetails: StudentInfo,
   reservationEdit: ReservationEdit,
   profile: Profile,
   eventInfo: EventInfoPopup,
   instrEventInfo: InstrEventInfoPopup,
   addManager: AddManager,
   addProfessor: AddProfessor,
   startExam: StudentsMultiSelectPopup,
   createRezervation: CreateRezervation,
   questionCategories: QuestionCategoriesPopup,
};

const IDLE_PRELOAD_POPUPS = [
   "createRezervation",
   "reservationEdit",
   "studentDetails",
];

function preloadPopupByType(type) {
   const key = String(type || "");
   if (!key) return;
   POPUP_COMPONENT_BY_TYPE[key]?.preload?.();
}

export default function Popup() {
   const [popupState, setPopupState] = useState({
      type: getCurrentPopup()?.type || null,
      props: getCurrentPopup()?.props || {},
   });

   const [exiting, setExiting] = useState(false);
   const [contentReady, setContentReady] = useState(true);
   const panelRef = useRef(null);

   // 🔑 cheie care forțează remount pe fiecare OPEN
   const [openKey, setOpenKey] = useState(0);
   const loadingFallback = (
      <div className="popupui popupui__content">
         <div className="popupui__disclaimer">Se încarcă...</div>
      </div>
   );

   // --- mobil doar (pentru back care închide popup-ul)
   const isMobile = () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 860px)").matches;

   // guard anti-race între sesiuni (deschidere/închidere rapidă)
   const sessionIdRef = useRef(0); // crește la fiecare OPEN
   const closingByPopstateRef = useRef(false);

   // ✅ guard: nu da back() de două ori pentru același close
   const didPopHistoryRef = useRef(false);

   // ✅ IMPORTANT: management corect pentru transitionend + fallback timeout
   const pendingCloseRef = useRef({
      sid: null,
      handler: null,
   });
   const closeTimerRef = useRef(null);
   const deferredMountTimerRef = useRef(null);

   const clearPendingClose = useCallback(() => {
      // scoate listener-ul vechi (dacă există)
      const { handler } = pendingCloseRef.current || {};
      if (handler && panelRef.current) {
         panelRef.current.removeEventListener("transitionend", handler);
      }
      pendingCloseRef.current = { sid: null, handler: null };

      // scoate timeout-ul vechi (dacă există)
      if (closeTimerRef.current) {
         clearTimeout(closeTimerRef.current);
         closeTimerRef.current = null;
      }
   }, []);

   const clearDeferredMountTimer = useCallback(() => {
      if (deferredMountTimerRef.current) {
         clearTimeout(deferredMountTimerRef.current);
         deferredMountTimerRef.current = null;
      }
   }, []);

   const isPopupDummyOnTop = (sid) => {
      if (typeof window === "undefined") return false;
      const st = window.history.state;
      return !!(
         st &&
         st.__popup_dummy === true &&
         String(st.sid) === String(sid)
      );
   };

   const pushOrReplacePopupDummy = (sid) => {
      if (typeof window === "undefined") return;
      const marker = { __popup_dummy: true, sid };

      const st = window.history.state;
      if (st && st.__popup_dummy) {
         window.history.replaceState(marker, "", window.location.href);
      } else {
         window.history.pushState(marker, "", window.location.href);
      }
   };

   const maybePopPopupDummy = (sid) => {
      if (typeof window === "undefined") return;
      if (!isMobile()) return;
      if (closingByPopstateRef.current) return;
      if (didPopHistoryRef.current) return;

      if (!isPopupDummyOnTop(sid)) return;

      didPopHistoryRef.current = true;
      closingByPopstateRef.current = true;

      window.history.back();

      setTimeout(() => {
         closingByPopstateRef.current = false;
      }, 0);
   };

   const confirmCloseCurrentPopup = useCallback((options = {}) => {
      if (options?.skipConfirm) return true;
      if (popupState?.type !== "sAddProg") return true;
      if (typeof window === "undefined") return true;
      return window.confirm("Sigur doriți să ieșiți din acest popup?");
   }, [popupState?.type]);

   const handleCloseClick = (options = {}) => {
      if (!confirmCloseCurrentPopup(options)) return;

      // dacă ai subpopup (stack), îl închizi separat
      if (getCurrentSubPopup()) {
         requestCloseSubPopup();
         return;
      }

      // închidem UI imediat (store)
      closePopupStore();

      // pe mobil, scoatem dummy-ul doar dacă e pe top
      const sid = sessionIdRef.current;
      maybePopPopupDummy(sid);
   };

   // ✅ Back hardware / gesture: dacă popup e deschis, îl închidem
   useEffect(() => {
      const onPopState = () => {
         if (!isMobile()) return;

         if (!getCurrentPopup()) return;

         if (!confirmCloseCurrentPopup()) {
            // păstrăm popup-ul deschis dacă userul anulează close-ul
            pushOrReplacePopupDummy(sessionIdRef.current);
            return;
         }

         if (getCurrentSubPopup()) {
            requestCloseSubPopup();
            return;
         }

         closingByPopstateRef.current = true;
         didPopHistoryRef.current = true;
         closePopupStore();
         setTimeout(() => {
            closingByPopstateRef.current = false;
         }, 0);
      };

      window.addEventListener("popstate", onPopState);
      return () => window.removeEventListener("popstate", onPopState);
   }, [confirmCloseCurrentPopup]);

   useEffect(() => {
      if (typeof window === "undefined") return undefined;
      let timeoutId = null;
      let idleId = null;
      let canceled = false;

      const runPreload = () => {
         if (canceled) return;
         IDLE_PRELOAD_POPUPS.forEach((type) => preloadPopupByType(type));
      };

      timeoutId = window.setTimeout(runPreload, 2400);

      if (typeof window.requestIdleCallback === "function") {
         idleId = window.requestIdleCallback(runPreload, { timeout: 3500 });
      }

      return () => {
         canceled = true;
         if (
            idleId != null &&
            typeof window.cancelIdleCallback === "function"
         ) {
            window.cancelIdleCallback(idleId);
         }
         if (timeoutId != null) {
            window.clearTimeout(timeoutId);
         }
      };
   }, []);

   useEffect(() => {
      const unsubscribe = subscribePopup(({ detail }) => {
         if (detail) {
            // ===== OPEN =====
            // ✅ CRUCIAL: anulează orice "close pending" rămas din sesiunea precedentă
            clearPendingClose();
            clearDeferredMountTimer();

            sessionIdRef.current += 1;
            const sid = sessionIdRef.current;
            const popupType = detail.type;
            preloadPopupByType(popupType);
            const deferHeavyMount = DEFERRED_POPUP_TYPES.has(popupType);

            didPopHistoryRef.current = false;

            setOpenKey(sid);
            setExiting(false);
            document.body.classList.add("popup-open");
            setContentReady(!deferHeavyMount);

            setPopupState({
               type: popupType,
               props: { ...(detail.props || {}) },
            });

            if (deferHeavyMount) {
               deferredMountTimerRef.current = setTimeout(() => {
                  deferredMountTimerRef.current = null;
                  setContentReady(true);
               }, 0);
            }

            if (isMobile()) {
               pushOrReplacePopupDummy(sid);
            }
         } else if (panelRef.current) {
            // ===== CLOSE (instant) =====
            clearPendingClose();
            clearDeferredMountTimer();

            // Scoatem conținutul imediat, fără să așteptăm tranziția CSS.
            setContentReady(false);
            setExiting(false);
            document.body.classList.remove("popup-open");
            setPopupState({ type: null, props: {} });
            setContentReady(true);

            // ✅ dacă cineva a închis popup-ul direct (closePopupStore) fără handleCloseClick,
            // scoatem dummy-ul, DAR doar dacă e pe top.
            const sid = sessionIdRef.current;
            maybePopPopupDummy(sid);
         } else {
            // edge: panelRef null -> închide direct
            clearPendingClose();
            clearDeferredMountTimer();
            setPopupState({ type: null, props: {} });
            setExiting(false);
            setContentReady(true);
            document.body.classList.remove("popup-open");
         }
      });

      return () => {
         clearPendingClose();
         clearDeferredMountTimer();
         unsubscribe?.();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

   const renderContent = () => {
      switch (popupState.type) {
         case "addProg":
            return (
               <AAddProg
                  key={openKey}
                  {...popupState.props}
                  onClose={handleCloseClick}
               />
            );
         case "sAddProg":
            return (
               <SAddProg
                  key={openKey}
                  {...popupState.props}
                  onClose={handleCloseClick}
               />
            );
         case "addInstr":
            return <AddInstr key={openKey} {...popupState.props} />;
         case "dayInfo":
            return <ADayInfoPopup key={openKey} {...popupState.props} />;
         case "studentDetails":
            return <StudentInfo key={openKey} {...popupState.props} />;
         case "reservationEdit":
            return (
               <ReservationEdit
                  key={openKey}
                  {...popupState.props}
                  onClose={handleCloseClick}
               />
            );
         case "profile":
            return <Profile key={openKey} {...popupState.props} />;
         case "eventInfo":
            return <EventInfoPopup key={openKey} {...popupState.props} />;
         case "instrEventInfo":
            return <InstrEventInfoPopup key={openKey} {...popupState.props} />;
         case "addManager":
            return <AddManager key={openKey} {...popupState.props} />;
         case "addProfessor":
            return <AddProfessor key={openKey} {...popupState.props} />;
         case "startExam":
            return (
               <StudentsMultiSelectPopup key={openKey} {...popupState.props} />
            );
         case "createRezervation":
            return (
               <CreateRezervation
                  key={openKey}
                  {...popupState.props}
                  onClose={handleCloseClick}
               />
            );
         case "questionCategories":
            return (
               <QuestionCategoriesPopup
                  key={openKey}
                  {...popupState.props}
                  onClose={handleCloseClick}
               />
            );
         default:
            return null;
      }
   };

   if (!popupState.type) return null;

   return (
      <>
         <div
            className="popup-panel__overlay"
            onPointerDown={(e) => {
               if (typeof e.button === "number" && e.button !== 0) return;
               handleCloseClick();
            }}
         />
         <div
            className={`popup-panel ${exiting ? "popup-exit" : ""}`}
            ref={panelRef}
         >
            <ReactSVG
               onClick={handleCloseClick}
               className="popup-panel__close react-icon rotate45"
               src={addIcon}
            />
            <div className="popup-panel__inner">
               {contentReady ? (
                  <Suspense fallback={loadingFallback}>{renderContent()}</Suspense>
               ) : (
                  loadingFallback
               )}
            </div>
         </div>
      </>
   );
}
