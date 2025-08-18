const getCookie = (name) => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
};

const sendRequest = async (method, endpoint, data = null, contentType = null) => {
  const defaultContentType = 'application/json; charset=UTF-8';

  const requestOptions = {
    method: method.toUpperCase(),
    headers: {
      'Authorization': `Bearer ${getCookie('access_token')}`,
      'Content-type': contentType ?? defaultContentType,
    },
  };

  if (data) {
    if (data instanceof FormData) {
      delete requestOptions.headers['Content-type'];
    }
    requestOptions.body = data;
  }

  try {
    const response = await fetch(
      'https://instruireauto.site/api' + endpoint,
      method === 'GET'
        ? {
            headers: {
              'Authorization': `Bearer ${getCookie('access_token')}`,
            },
          }
        : requestOptions
    );

    if (response.type === 'cors' && response.redirected) {
      window.location.href = response.url;
    }

    return response;
  } catch (error) {
    console.error('API call error:', error);
    throw error;
  }
};

const apiClientService = {
  get: (endpoint) => sendRequest('GET', endpoint),
  post: (endpoint, data, contentType = null) => sendRequest('POST', endpoint, data, contentType),
  put: (endpoint, data, contentType = null) => sendRequest('PUT', endpoint, data, contentType),
  patch: (endpoint, data, contentType = null) => sendRequest('PATCH', endpoint, data, contentType),
  delete: (endpoint) => sendRequest('DELETE', endpoint),
};

export default apiClientService;
