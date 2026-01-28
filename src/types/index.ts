// src/types/index.ts

export interface Permission {
  id: number;
  name: string;
  slug: string;
  description?: string;
}

export interface Role {
  id: number;
  name: string;
  slug: string;
  description?: string;
  permissions?: Permission[];
}

export interface User {
  id: number;
  name: string;
  email: string;
  image?: string;
  email_verified_at: string | null;
  roles?: Role[];
  created_at: string;
  updated_at: string;
}

export interface App {
  id: number;
  app_name: string;
  app_url: string | null;
  app_store_url: string | null;
  icon: string | null;
  last_synced: string | null;
  created_at: string;
  updated_at: string;
  installations_count?: number;
  active_installations_count?: number;
}

export interface Installation {
  id: number;
  app_id: number;
  store_name: string;
  store_url: string;
  email: string;
  shop_owner_name: string | null;
  currency: string;
  shopify_plan: string | null;
  app_plan: string | null;
  plan_started_at: string | null;
  plan_expires_at: string | null;
  is_active: boolean;
  install_count: number;
  installed_at: string | null;
  created_at: string;
  updated_at: string;
  app?: App;
}

export interface PaginatedResponse<T> {
  current_page: number;
  data: T[];
  first_page_url: string;
  from: number;
  last_page: number;
  last_page_url: string;
  links: Array<{
    url: string | null;
    label: string;
    active: boolean;
  }>;
  next_page_url: string | null;
  path: string;
  per_page: number;
  prev_page_url: string | null;
  to: number;
  total: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
  remember: boolean;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface AppStats {
  total_installations: number;
  active_installations: number;
  inactive_installations: number;
  installations_with_active_plan: number;
  total_reinstalls: number;
  plans_distribution: Array<{
    app_plan: string;
    count: number;
  }>;
}