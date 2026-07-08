import { apiFetch, clearToken } from './api';

export type CurrentUser = {
  id: string;
  email: string;
  fullName?: string;
  countryCode?: string | null;
  roles: string[];
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = localStorage.getItem('token');
  if (!token) return null;

  try {
    return await apiFetch('/auth/me');
  } catch {
    clearToken();
    return null;
  }
}
