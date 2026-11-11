import { apiService } from '@/config/api';
import type { Permission, Role, User as AuthUser } from '@/types';

export type { Permission, Role };

/** A user as the accounts list returns it: the signed-in user's shape, minus timestamps. */
export type User = Pick<AuthUser, 'id' | 'name' | 'email' | 'image' | 'roles'>;

/** What the users page sends on create/update; `password` is left blank on edit to keep the current one. */
export interface UserPayload {
    name?: string;
    email?: string;
    password?: string;
    roles?: number[];
}

export interface RolePayload {
    name: string;
    description: string;
    permissions: number[];
}

export interface PermissionPayload {
    name: string;
    slug: string;
    description?: string;
}

/** User and role deletes always confirm with a message, e.g. "Role deleted successfully". */
export interface DeleteResponse {
    success: boolean;
    message: string;
    data: null;
}

export const aclService = {
    // User Management
    async getUsers() {
        return apiService.get<User[]>('/users');
    },
    async createUser(data: UserPayload) {
        return apiService.post<User>('/users', data);
    },
    async updateUser(id: number, data: UserPayload) {
        return apiService.put<User>(`/users/${id}`, data);
    },
    async deleteUser(id: number) {
        return apiService.delete<null>(`/users/${id}`) as Promise<DeleteResponse>;
    },

    // Role Management
    async getRoles() {
        return apiService.get<Role[]>('/roles');
    },
    async createRole(data: RolePayload) {
        return apiService.post<Role>('/roles', data);
    },
    async updateRole(id: number, data: RolePayload) {
        return apiService.put<Role>(`/roles/${id}`, data);
    },
    async deleteRole(id: number) {
        return apiService.delete<null>(`/roles/${id}`) as Promise<DeleteResponse>;
    },

    // Permission Management
    async getPermissions() {
        return apiService.get<Permission[]>('/permissions');
    },
    async createPermission(data: PermissionPayload) {
        return apiService.post<Permission>('/permissions', data);
    },
    async updatePermission(id: number, data: PermissionPayload) {
        return apiService.put<Permission>(`/permissions/${id}`, data);
    },
    async deletePermission(id: number) {
        return apiService.delete(`/permissions/${id}`);
    },
};
