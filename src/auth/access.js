export const ROLES = Object.freeze({
   USER: "USER",
   ADMIN: "ADMIN",
   MANAGER: "MANAGER",
   INSTRUCTOR: "INSTRUCTOR",
   PROFESSOR: "PROFESSOR",
});

export const ROLE_HOME_PATH = Object.freeze({
   [ROLES.USER]: "/student",
   [ROLES.ADMIN]: "/admin",
   [ROLES.MANAGER]: "/manager",
   [ROLES.INSTRUCTOR]: "/instructor",
   [ROLES.PROFESSOR]: "/professor",
});

export const ROOT_ROLE_LINKS = Object.freeze(Object.values(ROLE_HOME_PATH));

export const ALLOW = Object.freeze({
   STUDENT: Object.freeze([ROLES.USER]),
   ADMIN: Object.freeze([ROLES.ADMIN]),
   MANAGER: Object.freeze([ROLES.MANAGER]),
   PROFESSOR: Object.freeze([ROLES.PROFESSOR]),
   INSTRUCTOR: Object.freeze([ROLES.INSTRUCTOR]),
});

const KNOWN_ROLES = new Set(Object.values(ROLES));

function normalizeRoleValue(raw) {
   return String(raw || "")
      .trim()
      .toUpperCase()
      .replace(/^ROLE_/, "");
}

export function normalizeRole(raw) {
   const normalized = normalizeRoleValue(raw);
   return KNOWN_ROLES.has(normalized) ? normalized : "";
}

export function getUserRoles(userLike) {
   const out = new Set();

   const add = (raw) => {
      const normalized = normalizeRole(raw);
      if (normalized) out.add(normalized);
   };

   add(userLike?.role);
   add(userLike?.Role);
   add(userLike?.userRole);
   add(userLike?.profile?.role);

   if (Array.isArray(userLike?.roles)) userLike.roles.forEach(add);
   if (Array.isArray(userLike?.authorities)) userLike.authorities.forEach(add);

   return Array.from(out);
}

export function getPrimaryRole(userLike) {
   return getUserRoles(userLike)[0] || "";
}

export function hasAnyRole(userLike, allowedRoles) {
   const allowed = new Set((allowedRoles || []).map(normalizeRole).filter(Boolean));
   if (!allowed.size) return false;

   return getUserRoles(userLike).some((role) => allowed.has(role));
}

export function getHomePathForRole(roleRaw) {
   const role = normalizeRole(roleRaw);
   return ROLE_HOME_PATH[role] || "/";
}

export function getHomePathForUser(userLike) {
   return getHomePathForRole(getPrimaryRole(userLike));
}
