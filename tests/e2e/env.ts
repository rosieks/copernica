/** E2E_PORT runs the test server on another port (default 8080). */
export const port = process.env.E2E_PORT ?? '8080';
export const baseURL = `http://127.0.0.1:${port}`;
