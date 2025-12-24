import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'

const routes = [
  {
    path: '/',
    name: 'login',
    component: () => import('@/views/auth/LoginPage.vue'),
    meta: {
      isPublic: true,
    }
  },
  {
    path: '/',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/DashboardPage.vue'),
      },
      {
        path: 'apps',
        name: 'apps',
        component: () => import('@/views/AppsPage.vue'),
      },
      {
        path: 'installations',
        name: 'installations',
        component: () => import('@/views/InstallationsPage.vue'),
      },
      {
        path: 'pricing-plan',
        name: 'pricing-plan',
        component: () => import('@/views/PricingPlanPage.vue'),
      },
      {
        path: 'email-templates',
        name: 'email-templates',
        component: () => import('@/views/EmailTemplatesPage.vue'),
      },
      {
        path: 'accounts/users',
        name: 'accounts-users',
        component: () => import('@/views/accounts/AccountsUsersPage.vue'),
      },
      {
        path: 'accounts/permissions',
        name: 'accounts-permissions',
        component: () => import('@/views/accounts/AccountsPermissionsPage.vue'),
      },
      {
        path: 'accounts/roles',
        name: 'accounts-roles',
        component: () => import('@/views/accounts/AccountsRolesPage.vue'),
      },
    ]
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router

