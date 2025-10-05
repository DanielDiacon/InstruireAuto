// src/components/AppBootstrap/PreloadAppData.jsx
import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";

// Thunk-urile tale existente (aceleași pe care le apela Calendarul)
import { fetchInstructors } from "../../store/instructorsSlice";
import { fetchUsers } from "../../store/usersSlice";
import { fetchStudents } from "../../store/studentsSlice";
import { fetchCars } from "../../store/carsSlice";
import { fetchInstructorsGroups } from "../../store/instructorsGroupSlice";
import { fetchAllReservations } from "../../store/reservationsSlice";

/**
 * Preîncarcă toate datele globale necesare aplicației o singură dată,
 * astfel încât celelalte componente să NU depindă de Calendar.
 */
export default function PreloadAppData() {
   const dispatch = useDispatch();
   const bootstrappedRef = useRef(false);

   useEffect(() => {
      if (bootstrappedRef.current) return;
      bootstrappedRef.current = true;

      (async () => {
         try {
            // pornește în paralel
            await Promise.all([
               dispatch(fetchInstructors()),
               dispatch(fetchUsers()),
               dispatch(fetchStudents()),
               dispatch(fetchCars()),
               dispatch(fetchInstructorsGroups()),
               // ia toate rezervările (ajustează param. după API-ul tău)
               dispatch(fetchAllReservations({ scope: "all", pageSize: 5000 })),
               dispatch(fetchAllReservations({ scope: "all", pageSize: 5000 })),
            ]);
            // console.info("[Bootstrap] Date globale încărcate.");
         } catch (e) {
            console.error(
               "[Bootstrap] Eroare la preluarea datelor globale:",
               e
            );
         }
      })();
   }, [dispatch]);

   return null; // nu randăm nimic vizual
}
