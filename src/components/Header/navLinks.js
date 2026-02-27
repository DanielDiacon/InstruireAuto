// src/components/Header/navLinks.js

// Icons comune
import homeIcon from "../../assets/svg/material-symbols--home-outline.svg";
import calendarIcon from "../../assets/svg/mdi--calendar-outline.svg";
import addIcon from "../../assets/svg/mdi--calendar-plus-outline.svg";
import accIcon from "../../assets/svg/acc.svg";
import clockIcon from "../../assets/svg/clock.svg";
import groupsIcon from "../../assets/svg/material-symbols--group-outline.svg";
import instrGroupsIcon from "../../assets/svg/material-symbols--group-add-outline.svg";
import instrIcon from "../../assets/svg/mdi--account-cog-outline.svg";
import managerIcon from "../../assets/svg/mdi--account-star-outline.svg";
import examIcon from "../../assets/svg/mdi--book-clock-outline.svg";
import categoriiIcon from "../../assets/svg/mdi--category-plus-outline.svg";

// Student
import testIcon from "../../assets/svg/material-symbols--book-outline.svg";
import examStudentIcon from "../../assets/svg/mdi--book-clock-outline.svg";

// Instructor
import todayIcon from "../../assets/svg/material-symbols--today-outline.svg";

// Professor
import studentsIcon from "../../assets/svg/graduate.svg";
import { normalizeRole, ROLES } from "../../auth/access";

export function getLinksForRole(roleRaw) {
   const role = normalizeRole(roleRaw);

   const map = {
      [ROLES.USER]: [
         { link: "/student", text: "Acasă", icon: homeIcon },
         { link: "/student/calendar", text: "Calendar", icon: calendarIcon },
         { popup: "sAddProg", text: "Programare", icon: addIcon },
         { link: "/student/test", text: "Testare", icon: testIcon },
         { link: "/student/exam", text: "Examen", icon: examStudentIcon },
         { popup: "profile", text: "Profil", icon: accIcon },
      ],

      [ROLES.INSTRUCTOR]: [
         { link: "/instructor", text: "Acasă", icon: homeIcon },
         { link: "/instructor/calendar", text: "Calendar", icon: calendarIcon },
         { link: "/instructor/today", text: "Azi", icon: todayIcon },
         { link: "/instructor/groups", text: "Grupe", icon: groupsIcon },
         { popup: "profile", text: "Profil", icon: accIcon },
      ],

      [ROLES.PROFESSOR]: [
         { link: "/professor", text: "Acasă", icon: homeIcon },
         { link: "/professor/students", text: "Studenți", icon: studentsIcon },
         { link: "/professor/groups", text: "Grupe", icon: groupsIcon },
         { popup: "profile", text: "Profil", icon: accIcon },
      ],

      [ROLES.MANAGER]: [
         { link: "/manager", text: "Acasă", icon: homeIcon },
         {
            link: "/manager/calendarplus",
            text: "Calendar+",
            icon: calendarIcon,
         },
         //{ popup: "addProg", text: "Programare", icon: addIcon },
         { popup: "addInstr", text: "Instructori", icon: instrIcon },
         { popup: "addProfessor", text: "Profesori", icon: instrIcon },
         { popup: "startExam", text: "Examen", icon: examIcon },
         { link: "/manager/groups", text: "Grupe", icon: groupsIcon },
         {
            link: "/manager/instr-groups",
            text: "Ins. Grupe",
            icon: instrGroupsIcon,
         },
         { link: "/manager/history", text: "Istoric", icon: clockIcon },
         {
            popup: "questionCategories",
            text: "Categorii",
            icon: categoriiIcon,
         },
      ],

      [ROLES.ADMIN]: [
         { link: "/admin", text: "Acasă", icon: homeIcon },
         { link: "/admin/calendarplus", text: "Calendar+", icon: calendarIcon },
         //{ popup: "addProg", text: "Programare", icon: addIcon },
         { popup: "addInstr", text: "Instructori", icon: instrIcon },
         { popup: "addProfessor", text: "Profesori", icon: instrIcon },
         { popup: "addManager", text: "Manageri", icon: managerIcon },
         { link: "/admin/groups", text: "Grupe", icon: groupsIcon },
         {
            link: "/admin/instr-groups",
            text: "Ins. Grupe",
            icon: instrGroupsIcon,
         },
         { link: "/admin/history", text: "Istoric", icon: clockIcon },
         {
            popup: "questionCategories",
            text: "Categorii",
            icon: categoriiIcon,
         },
      ],
   };

   return map[role] || [];
}
