import { apiService } from '@/config/api';

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
    roles?: Role[];
}

export const aclService = {
    // User Management
    async getUsers() {
        return apiService.get<User[]>('/users');
    },
    async createUser(data: any) {
        return apiService.post<User>('/users', data);
    },
    async updateUser(id: number, data: any) {
        return apiService.put<User>(`/users/${id}`, data);
    },
    async deleteUser(id: number) {
        return apiService.delete(`/users/${id}`);
    },

    // Role Management
    async getRoles() {
        return apiService.get<Role[]>('/roles');
    },
    async createRole(data: any) {
        return apiService.post<Role>('/roles', data);
    },
    async updateRole(id: number, data: any) {
        return apiService.put<Role>(`/roles/${id}`, data);
    },
    async deleteRole(id: number) {
        return apiService.delete(`/roles/${id}`);
    },

    // Permission Management
    async getPermissions() {
        return apiService.get<Permission[]>('/permissions');
    },
    async createPermission(data: any) {
        return apiService.post<Permission>('/permissions', data);
    },
    async updatePermission(id: number, data: any) {
        return apiService.put<Permission>(`/permissions/${id}`, data);
    },
    async deletePermission(id: number) {
        return apiService.delete(`/permissions/${id}`);
    },
};
