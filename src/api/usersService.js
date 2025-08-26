import apiClientService from "./ApiClientService";

// Get all users
export async function getUsers() {
  const response = await apiClientService.get("/users");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server error: ${text}`);
  }
  return response.json();
}

// Get user by ID
export async function getUserById(userId) {
  const response = await apiClientService.get(`/users/${userId}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server error: ${text}`);
  }
  return response.json();
}

// Create new user
export async function createUser(userData) {
  const response = await apiClientService.post("/users", userData);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server error: ${text}`);
  }
  return response.json();
}

// Update user
export async function updateUser(userId, userData) {
  const res = await apiClientService.patch(
    `/users/${userId}`,
    JSON.stringify(userData) // convertim obiectul JS în JSON
  );

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}


// Delete user
export async function deleteUser(userId) {
  const response = await apiClientService.delete(`/users/${userId}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server error: ${text}`);
  }
  return true;
}

// Get all users in a group
export async function getUsersInGroup(groupId) {
  const response = await apiClientService.get(`/users/group/${groupId}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server error: ${text}`);
  }
  return response.json();
}
