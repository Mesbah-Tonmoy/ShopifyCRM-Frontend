// src/services/api.ts
const API_URL = import.meta.env.VITE_API_URL || 'https://crm.zapioapps.com/backendapp/api';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

class ApiService {
  private getHeaders(includeAuth = true): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (includeAuth) {
      const token = localStorage.getItem('token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'An error occurred');
    }

    return data;
  }

  async get<T>(endpoint: string, includeAuth = true): Promise<ApiResponse<T>> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'GET',
      headers: this.getHeaders(includeAuth),
    });

    return this.handleResponse<T>(response);
  }

  async post<T>(endpoint: string, body: unknown, includeAuth = true): Promise<ApiResponse<T>> {
    console.log('**** ', endpoint, body);
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(includeAuth),
      body: JSON.stringify(body),
    });

    return this.handleResponse<T>(response);
  }

  async put<T>(endpoint: string, body: unknown, includeAuth = true): Promise<ApiResponse<T>> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'PUT',
      headers: this.getHeaders(includeAuth),
      body: JSON.stringify(body),
    });

    return this.handleResponse<T>(response);
  }

  async delete<T>(endpoint: string, includeAuth = true): Promise<ApiResponse<T>> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(includeAuth),
    });

    return this.handleResponse<T>(response);
  }
}

export const apiService = new ApiService();