const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'https://crm.zapioapps.com/backendapp';
const API_URL = `${BASE_URL}/api`;

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

/** Thrown for a non-2xx response. `errors` carries Laravel's per-field validation messages. */
export interface ApiError extends Error {
  status?: number;
  errors?: Record<string, string[]>;
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
      const error: ApiError = new Error(data.message || 'An error occurred');
      error.status = response.status;
      error.errors = data.errors;
      throw error;
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
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(includeAuth),
      body: JSON.stringify(body),
    });

    return this.handleResponse<T>(response);
  }

  async postForm<T>(endpoint: string, formData: FormData, includeAuth = true): Promise<ApiResponse<T>> {
    const headers: HeadersInit = {
      'Accept': 'application/json',
    };

    if (includeAuth) {
      const token = localStorage.getItem('token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
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

  /**
   * Fetch a file rather than JSON, and hand back the blob plus the name the
   * server gave it.
   *
   * A plain link or window.open cannot be used for these: the API is
   * authenticated with a bearer token, which only an explicit fetch carries.
   */
  async download(endpoint: string, fallbackFilename: string): Promise<{ blob: Blob; filename: string }> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Accept': 'text/csv, application/json',
        ...(localStorage.getItem('token')
          ? { Authorization: `Bearer ${localStorage.getItem('token')}` }
          : {}),
      },
    });

    if (!response.ok) {
      // A failure still comes back as the API's JSON envelope.
      let message = 'Download failed';
      try {
        const data = await response.json();
        message = data.message || message;
      } catch {
        // Not JSON - keep the generic message.
      }

      const error: ApiError = new Error(message);
      error.status = response.status;
      throw error;
    }

    const disposition = response.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="?([^";]+)"?/i);

    return {
      blob: await response.blob(),
      filename: match?.[1] ?? fallbackFilename,
    };
  }

  /**
   * `body` is optional because most deletes address the resource in the path.
   * Some need a payload instead - deleting a store's SES tenants is keyed by
   * shop domain, which does not belong in a URL path segment.
   */
  async delete<T>(endpoint: string, body?: unknown, includeAuth = true): Promise<ApiResponse<T>> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(includeAuth),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    return this.handleResponse<T>(response);
  }
}

export const apiService = new ApiService();