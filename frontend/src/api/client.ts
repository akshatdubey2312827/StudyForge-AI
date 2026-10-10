import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

// In dev, VITE_API_URL is empty so requests go to the same origin (proxied by Vite → localhost:3001).
// In production, set VITE_API_URL to the deployed backend URL (e.g. https://api.studyforge.app).
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

/**
 * Shared Axios client instance with cookie credentials enabled.
 * All auth tokens are stored as httpOnly cookies managed by the browser.
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: AxiosError | null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve();
    }
  });
  failedQueue = [];
};

// ─── Response Interceptor: 401 Auto Token Refresh ────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Don't intercept refresh / logout / session checks to avoid infinite loops
    const isAuthEndpoint =
      originalRequest.url?.includes("/api/auth/refresh") ||
      originalRequest.url?.includes("/api/auth/logout") ||
      originalRequest.url?.includes("/api/auth/google") ||
      originalRequest.url?.includes("/api/auth/session");

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        // Queue concurrent requests while token is being refreshed
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => apiClient(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Call refresh endpoint with httpOnly refresh_token cookie
        await apiClient.post("/api/auth/refresh");
        processQueue(null);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError);
        // If refresh fails, clear state and redirect to login
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);
