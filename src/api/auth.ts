import { apiClient } from "./client";
import type { User } from "@/types";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/**
 * Initiates Google OAuth by triggering a full browser redirect.
 */
export function redirectToGoogleOAuth(): void {
  window.location.href = `${API_BASE_URL}/api/auth/google`;
}

/**
 * Fetches the current authenticated session from the backend.
 * Returns the User if valid, or null if unauthenticated / 401.
 */
export async function getSession(): Promise<{ user: User } | null> {
  try {
    const res = await apiClient.get<{ user: User }>("/api/auth/session");
    return res.data;
  } catch (err: any) {
    if (err?.response?.status === 401) {
      return null;
    }
    throw err;
  }
}

/**
 * Refreshes the access token using the httpOnly refresh cookie.
 */
export async function refreshSession(): Promise<void> {
  await apiClient.post("/api/auth/refresh");
}

/**
 * Logs out the current user, clearing cookies on the backend.
 */
export async function logout(): Promise<void> {
  await apiClient.post("/api/auth/logout");
}
