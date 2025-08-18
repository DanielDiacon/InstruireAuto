import React from "react";
import { ReactSVG } from "react-svg";
import addIcon from "../../assets/svg/add-s.svg";
import editIcon from "../../assets/svg/edit.svg";
import eyeIcon from "../../assets/svg/eye.svg";

function InstructorManager({ instructors = [], openPopup }) {
  return (
    <div className="instructori">
      <div className="instructori__btns">
        <div>
          <button onClick={() => openPopup("addInstr", { instructors })}>
            <ReactSVG className="instructori__icon" src={addIcon} />
          </button>
          <button onClick={() => openPopup("addInstr", { instructors })}>
            <ReactSVG className="instructori__icon big" src={editIcon} />
          </button>
        </div>
        <button onClick={() => openPopup("addInstr", { instructors })}>
          <ReactSVG className="instructori__icon big" src={eyeIcon} />
        </button>
      </div>
      <div className="instructori__info">
        <h3>
          {instructors.length}
          <span>de</span>
        </h3>
        <p>Instructori</p>
      </div>
    </div>
  );
}

export default InstructorManager;
