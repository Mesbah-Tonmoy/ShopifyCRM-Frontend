import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { apiService } from '@/config/api';
import type { User, LoginCredentials, RegisterData, AuthResponse } from '@/types';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(localStorage.getItem('token'));
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => !!token.value && !!user.value);

  const login = async (credentials: LoginCredentials) => {
    console.log('Test Login attempt with:', credentials);
    try {
      loading.value = true;
      error.value = null;

      const response = await apiService.post<AuthResponse>('/login', credentials, false);
      
      token.value = response.data.token;
      user.value = response.data.user;
      
      localStorage.setItem('token', response.data.token);
      
      return true;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Login failed';
      return false;
    } finally {
      loading.value = false;
    }
  };

  const register = async (data: RegisterData) => {
    try {
      loading.value = true;
      error.value = null;

      const response = await apiService.post<AuthResponse>('/register', data, false);
      
      token.value = response.data.token;
      user.value = response.data.user;
      
      localStorage.setItem('token', response.data.token);
      
      return true;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Registration failed';
      return false;
    } finally {
      loading.value = false;
    }
  };

  const logout = async () => {
    try {
      await apiService.post('/logout', {});
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      user.value = null;
      token.value = null;
      localStorage.removeItem('token');
    }
  };

  const fetchUser = async () => {
    try {
      const response = await apiService.get<User>('/user');
      user.value = response.data;
    } catch (err: unknown) {
      console.error('Fetch user error:', err);
      // If token is invalid, logout
      await logout();
    }
  };

  const checkAuth = async () => {
    if (token.value && !user.value) {
      await fetchUser();
    }
  };

  return {
    user,
    token,
    loading,
    error,
    isAuthenticated,
    login,
    register,
    logout,
    fetchUser,
    checkAuth,
  };
});