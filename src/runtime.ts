// Pages has no API. Keep its browser-only workspace separate from cloud accounts.
export const localOnly = import.meta.env.VITE_LOCAL_ONLY === 'true';
export const localAccount = { id: 'pages-local', email: 'This browser' };
// Account sessions stay on the API's origin, including on browsers that block third-party cookies.
export const cloudAppUrl = 'https://parker.simonstoryparker.workers.dev/';
