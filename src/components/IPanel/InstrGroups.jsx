import React, { useState, useEffect, useContext } from "react";
import { ReactSVG } from "react-svg";
import addIcon from "../../assets/svg/add-s.svg";
import saveIcon from "../../assets/svg/save2.svg";
import editIcon from "../../assets/svg/edit.svg";
import eyeIcon from "../../assets/svg/eye.svg";
import keyIcon from "../../assets/svg/key.svg";
import searchIcon from "../../assets/svg/search.svg";
import { UserContext } from "../../UserContext";
import { useDispatch, useSelector } from "react-redux";
import {
   fetchGroups,
   addGroup,
   updateGroup,
   removeGroup,
} from "../../store/groupsSlice";
import { getInstructors } from "../../api/instructorsService";
import { openPopup } from "../Utils/popupStore";

function InstrGroups() {
   const { user } = useContext(UserContext);
   const dispatch = useDispatch();
   const { list: groups, users } = useSelector((state) => state.groups);

   const isReadOnly = user?.role !== "ADMIN";
   const isInstructor = user?.role === "INSTRUCTOR";

   const [showForm, setShowForm] = useState(false);
   const [newGroupName, setNewGroupName] = useState("");
   const [confirmDeleteId, setConfirmDeleteId] = useState(null);
   const [search, setSearch] = useState({ open: false, query: "" });
   const [editingGroup, setEditingGroup] = useState({ id: null, name: "" });
   const [viewMode, setViewMode] = useState({ mode: "list", group: null });

   const [myInstructor, setMyInstructor] = useState(undefined); // undefined = încă se încarcă; null = nu există

   useEffect(() => {
      dispatch(fetchGroups());
   }, [dispatch]);

   useEffect(() => {
      let cancelled = false;
      (async () => {
         if (!isInstructor) {
            setMyInstructor(null);
            return;
         }
         try {
            const all = await getInstructors();
            const mine = all.find((i) => String(i.userId) === String(user.id));
            if (!cancelled) setMyInstructor(mine || null);
         } catch (e) {
            console.error("[InstrGroups] getInstructors failed:", e);
            if (!cancelled) setMyInstructor(null);
         }
      })();
      return () => {
         cancelled = true;
      };
   }, [user, isInstructor]);

   const handleAddGroup = () => {
      if (isReadOnly) return;
      if (!newGroupName.trim()) return;
      dispatch(addGroup({ name: newGroupName, instructorId: 1 }));
      setNewGroupName("");
      setShowForm(false);
   };

   const handleSaveGroupName = () => {
      if (isReadOnly) return;
      if (!editingGroup.name.trim()) return;
      dispatch(
         updateGroup({
            id: editingGroup.id,
            name: editingGroup.name,
            instructorId: 1,
         })
      );
      setEditingGroup({ id: null, name: "" });
   };

   const handleDeleteGroup = (id) => {
      if (isReadOnly) return;
      dispatch(removeGroup(id));
      setConfirmDeleteId(null);
   };

   // —— FILTRARE: instructor vede doar grupele lui ——
   const baseGroups = (() => {
      if (!isInstructor) return groups;
      if (!myInstructor?.id) return []; // dacă nu e încărcat sau nu există, baza e goală
      return groups.filter((g) => {
         const gInstrId =
            g?.instructorId ?? g?.instructor_id ?? g?.instructor?.id ?? null;
         const gInstrUserId =
            g?.instructorUserId ??
            g?.instructor_user_id ??
            g?.instructor?.userId ??
            null;

         const byInstrId =
            gInstrId != null && String(gInstrId) === String(myInstructor.id);
         const byInstrUser =
            gInstrUserId != null && String(gInstrUserId) === String(user.id);

         return byInstrId || byInstrUser;
      });
   })();

   // atașez membrii (studenții) fiecărei grupe
   const groupedUsersByGroup = baseGroups.map((group) => ({
      ...group,
      members: users.filter((u) => String(u.groupId) === String(group.id)),
   }));

   // căutare după nume de grup sau token
   const filteredGroups = groupedUsersByGroup.filter(
      (g) =>
         (g.name || "")
            .toLowerCase()
            .includes((search.query || "").toLowerCase()) ||
         (g.token || "")
            .toLowerCase()
            .includes((search.query || "").toLowerCase())
   );

   function highlightText(text, query) {
      if (!query) return text;
      const parts = String(text || "").split(new RegExp(`(${query})`, "gi"));
      return parts.map((part, index) =>
         part.toLowerCase() === query.toLowerCase() ? (
            <i key={index} className="highlight">
               {part}
            </i>
         ) : (
            part
         )
      );
   }

   const handleOpenStudentPopup = (student) => {
      openPopup("studentDetails", { student });
   };

   // —— Mesaje „nu sunt grupe” ——
   const renderEmptyListMessage = () => {
      // dacă instructorul încă se încarcă
      if (isInstructor && myInstructor === undefined) {
         return (
            <p className="groups__empty" style={{ gridColumn: "1 / -1" }}>
               Se încarcă grupele...
            </p>
         );
      }

      // nimic după căutare
      if (filteredGroups.length === 0 && (search.query || "").trim()) {
         return (
            <p className="groups__empty" style={{ gridColumn: "1 / -1" }}>
               Nicio grupă găsită pentru „{search.query}”.
            </p>
         );
      }

      // instructor fără grupe
      if (isInstructor && filteredGroups.length === 0) {
         // dacă nu există profil de instructor
         if (myInstructor === null) {
            return (
               <p className="groups__empty" style={{ gridColumn: "1 / -1" }}>
                  Nu ești asociat la niciun profil de instructor. Contactează
                  administratorul.
               </p>
            );
         }
         // profil există, dar nu are grupe
         return (
            <p className="groups__empty" style={{ gridColumn: "1 / -1" }}>
               Nu ai grupe în acest moment.
            </p>
         );
      }

      // alți utilizatori fără grupe
      if (filteredGroups.length === 0) {
         return (
            <p className="groups__empty" style={{ gridColumn: "1 / -1" }}>
               Nu există grupe în acest moment.
            </p>
         );
      }

      return null;
   };

   return (
      <div className="groups ipanel">
         <div className={`groups__header ${search.open ? "open" : ""}`}>
            <h2>{isInstructor ? "Grupele mele" : "Toate Grupele"}</h2>
            <div className="groups__right">
               <div className="groups__search">
                  <input
                     type="text"
                     placeholder="Caută grupă..."
                     className="groups__input"
                     value={search.query}
                     onChange={(e) =>
                        setSearch({ ...search, query: e.target.value })
                     }
                  />
                  <button
                     onClick={() =>
                        setSearch({ ...search, open: !search.open })
                     }
                     title={
                        search.open ? "Închide căutarea" : "Deschide căutarea"
                     }
                  >
                     <ReactSVG
                        className={`groups__icon ${
                           search.open ? "rotate45" : ""
                        }`}
                        src={search.open ? addIcon : searchIcon}
                     />
                  </button>
               </div>

               {!isReadOnly && (
                  <button onClick={() => setShowForm((prev) => !prev)}>
                     <ReactSVG className="groups__icon" src={addIcon} />
                  </button>
               )}
            </div>
         </div>

         <div className="groups__grid-wrapper">
            <div className="groups__grid">
               {/* LISTĂ GRUPE */}
               {viewMode.mode === "list" &&
                  filteredGroups.map((group) => (
                     <div
                        key={group.id}
                        className={`groups__item ${
                           editingGroup.id === group.id ? "active" : ""
                        }`}
                     >
                        <div className="groups__item-left">
                           <div className="groups__item-left-top">
                              {!isReadOnly && editingGroup.id === group.id ? (
                                 <input
                                    type="text"
                                    value={editingGroup.name}
                                    onChange={(e) =>
                                       setEditingGroup({
                                          ...editingGroup,
                                          name: e.target.value,
                                       })
                                    }
                                    className="groups__item-input"
                                 />
                              ) : (
                                 <h3>
                                    {highlightText(group.name, search.query)}
                                 </h3>
                              )}
                           </div>

                           <p>{group.members.length} pers</p>

                           <span className="groups__item-key">
                              <ReactSVG src={keyIcon} />
                              {highlightText(group.token, search.query)}
                           </span>
                        </div>

                        <div className="groups__item-right">
                           {!isReadOnly && editingGroup.id === group.id ? (
                              <>
                                 <ReactSVG
                                    className="groups__item-icon save"
                                    src={saveIcon}
                                    onClick={handleSaveGroupName}
                                    title="Salvează numele"
                                 />
                                 <div className="groups__item-delete">
                                    <button
                                       onClick={() =>
                                          setConfirmDeleteId(group.id)
                                       }
                                       className={`delete-btn ${
                                          confirmDeleteId === group.id
                                             ? "hidden"
                                             : ""
                                       }`}
                                    >
                                       Șterge
                                    </button>
                                    <div
                                       className={`delete-confirmation ${
                                          confirmDeleteId === group.id
                                             ? ""
                                             : "hidden"
                                       }`}
                                    >
                                       <button
                                          onClick={() =>
                                             handleDeleteGroup(group.id)
                                          }
                                          className="delete-confirm"
                                       >
                                          Da
                                       </button>
                                       <button
                                          onClick={() =>
                                             setConfirmDeleteId(null)
                                          }
                                          className="cancel-confirm"
                                       >
                                          Nu
                                       </button>
                                    </div>
                                 </div>
                                 <ReactSVG
                                    className="groups__item-icon rotate45"
                                    src={addIcon}
                                    onClick={() =>
                                       setEditingGroup({ id: null, name: "" })
                                    }
                                    title="Renunță"
                                 />
                              </>
                           ) : (
                              <>
                                 {!isReadOnly && (
                                    <ReactSVG
                                       className="groups__item-icon edit"
                                       src={editIcon}
                                       onClick={() =>
                                          setEditingGroup({
                                             id: group.id,
                                             name: group.name,
                                          })
                                       }
                                       title="Editează"
                                    />
                                 )}
                                 <ReactSVG
                                    className="groups__item-icon see"
                                    src={eyeIcon}
                                    onClick={() =>
                                       setViewMode({ mode: "details", group })
                                    }
                                    title="Vezi studenții"
                                 />
                              </>
                           )}
                        </div>
                     </div>
                  ))}

               {/* ——— Mesaj „nu sunt grupe” când lista e goală ——— */}
               {viewMode.mode === "list" && filteredGroups.length === 0 && (
                  <div style={{ gridColumn: "1 / -1" }}>
                     {renderEmptyListMessage()}
                  </div>
               )}

               {/* DETALII GRUP */}
               {viewMode.mode === "details" && viewMode.group && (
                  <>
                     <button
                        className="groups__back-btn"
                        onClick={() =>
                           setViewMode({ mode: "list", group: null })
                        }
                     >
                        Înapoi la grupe
                     </button>

                     {viewMode.group.members.length > 0 ? (
                        viewMode.group.members.map((student) => (
                           <div
                              key={student.id}
                              className="students__item"
                              onClick={() => handleOpenStudentPopup(student)}
                              title="Vezi detalii student"
                           >
                              <h3>
                                 {student.firstName} {student.lastName}
                              </h3>
                              <h3>{student.email}</h3>
                              <p>{student.phone || "–"}</p>
                           </div>
                        ))
                     ) : (
                        <p
                           className="groups__empty"
                           style={{ gridColumn: "1 / -1" }}
                        >
                           Nu sunt studenți în această grupă.
                        </p>
                     )}
                  </>
               )}
            </div>
         </div>
      </div>
   );
}

export default InstrGroups;
