import apiClientService from "./ApiClientService";

const BASE_URL = `/auth`;

export async function signup(payload) {
  const response = await apiClientService.post(BASE_URL + '/register', JSON.stringify(payload));

  if (!response.ok) {
    await throwDetailedError(response);
  }

  const data = await response.json();

  if (data.access_token) {
    // Salvezi token-ul după ce ai primit răspunsul OK
    document.cookie = `access_token=${data.access_token}; path=/; max-age=${60 * 60 * 24 * 7}`;
  }

  return data;
}

export async function signin(payload) {
  const response = await apiClientService.post(BASE_URL + '/login', JSON.stringify(payload));

  if (!response.ok) {
    await throwDetailedError(response);
  }

  const data = await response.json();

  if (data.access_token) {
    document.cookie = `access_token=${data.access_token}; path=/; max-age=${60 * 60 * 24 * 7}`;
  }

  return data;
}

export async function signout() {
  const response = await apiClientService.delete(BASE_URL + '/signout');

  if (!response.ok) {
    await throwDetailedError(response);
  }

  // Ștergi cookie-ul token la logout
  document.cookie = 'access_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure';
}

export async function fetchUserInfo() {
  const response = await apiClientService.get('/auth/me');

  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }

  return await response.json();
}

async function throwDetailedError(response) {
  const errorResponse = await response.json();
  const message = errorResponse.message || JSON.stringify(errorResponse);
  throw new Error(message);
}
