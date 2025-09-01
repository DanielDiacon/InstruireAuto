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
import { openPopup } from "../Utils/popupStore";

function GroupManager() {
   const { user } = useContext(UserContext);
   const dispatch = useDispatch();
   const { list: groups, users } = useSelector((state) => state.groups);

   const [showForm, setShowForm] = useState(false);
   const [newGroupName, setNewGroupName] = useState("");
   const [confirmDeleteId, setConfirmDeleteId] = useState(null);
   const [search, setSearch] = useState({ open: false, query: "" });
   const [editingGroup, setEditingGroup] = useState({ id: null, name: "" });
   const [viewMode, setViewMode] = useState({ mode: "list", group: null });

   useEffect(() => {
      if (user?.role === "ADMIN") {
         dispatch(fetchGroups());
      }
   }, [dispatch, user]);

   const handleAddGroup = () => {
      if (!newGroupName.trim()) return;
      dispatch(addGroup({ name: newGroupName, instructorId: 1 }));
      setNewGroupName("");
      setShowForm(false);
   };

   const handleSaveGroupName = () => {
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
      dispatch(removeGroup(id));
      setConfirmDeleteId(null);
   };

   const groupedUsersByGroup = groups.map((group) => ({
      ...group,
      members: users.filter((u) => u.groupId === group.id),
   }));

   const filteredGroups = groupedUsersByGroup.filter(
      (g) =>
         g.name.toLowerCase().includes(search.query.toLowerCase()) ||
         (g.token && g.token.toLowerCase().includes(search.query.toLowerCase()))
   );

   function highlightText(text, query) {
      if (!query) return text;
      const parts = text.split(new RegExp(`(${query})`, "gi"));
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

   return (
      <div className="groups">
         <div className={`groups__header ${search.open ? "open" : ""}`}>
            <h2>Toate Grupele</h2>
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
                  >
                     <ReactSVG
                        className={`groups__icon ${
                           search.open ? "rotate45" : ""
                        }`}
                        src={search.open ? addIcon : searchIcon}
                     />
                  </button>
               </div>
               <button onClick={() => setShowForm((prev) => !prev)}>
                  <ReactSVG className="groups__icon" src={addIcon} />
               </button>
            </div>
         </div>

         {/* Grid */}
         <div className="groups__grid-wrapper">
            <div className="groups__grid">
               {/* Form above list */}
               {showForm && viewMode.mode === "list" && (
                  <div className="groups__form">
                     <input
                        type="text"
                        placeholder="Numele grupei"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                     />
                     <button onClick={handleAddGroup}>Creează</button>
                  </div>
               )}

               {/* List groups */}
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
                              <input
                                 type="text"
                                 value={
                                    editingGroup.id === group.id
                                       ? editingGroup.name
                                       : group.name
                                 }
                                 onChange={(e) =>
                                    setEditingGroup({
                                       ...editingGroup,
                                       name: e.target.value,
                                    })
                                 }
                                 className="groups__item-input"
                              />
                              <h3>{highlightText(group.name, search.query)}</h3>
                           </div>
                           <p>{group.members.length} per</p>

                           <span className="groups__item-key">
                              <ReactSVG src={keyIcon} />
                              {highlightText(group.token, search.query)}
                           </span>
                        </div>

                        <div className="groups__item-right">
                           {editingGroup.id === group.id ? (
                              <>
                                 <ReactSVG
                                    className="groups__item-icon save"
                                    src={saveIcon}
                                    onClick={handleSaveGroupName}
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
                                 />
                              </>
                           ) : (
                              <>
                                 <ReactSVG
                                    className="groups__item-icon edit"
                                    src={editIcon}
                                    onClick={() =>
                                       setEditingGroup({
                                          id: group.id,
                                          name: group.name,
                                       })
                                    }
                                 />
                                 <ReactSVG
                                    className="groups__item-icon see"
                                    src={eyeIcon}
                                    onClick={() =>
                                       setViewMode({ mode: "details", group })
                                    }
                                 />
                              </>
                           )}
                        </div>
                     </div>
                  ))}

               {/* Group details */}
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

export default GroupManager;
