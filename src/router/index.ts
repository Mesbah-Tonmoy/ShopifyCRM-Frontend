import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'
import { useAuthStore } from '@/stores/auth'

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
        meta: { permission: 'apps.view' }
      },
      {
        path: 'installations',
        name: 'installations',
        component: () => import('@/views/InstallationsPage.vue'),
        meta: { permission: 'installations.view' }
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
        meta: { permission: 'email_templates.view' }
      },
      {
        path: 'accounts/users',
        name: 'accounts-users',
        component: () => import('@/views/accounts/AccountsUsersPage.vue'),
        meta: { permission: 'users.view' }
      },
      {
        path: 'accounts/permissions',
        name: 'accounts-permissions',
        component: () => import('@/views/accounts/AccountsPermissionsPage.vue'),
        meta: { permission: 'permissions.view' }
      },
      {
        path: 'accounts/roles',
        name: 'accounts-roles',
        component: () => import('@/views/accounts/AccountsRolesPage.vue'),
        meta: { permission: 'roles.view' }
      },
    ]
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  // Check session persistence
  await authStore.checkAuth()

  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)
  const isPublic = to.matched.some(record => record.meta.isPublic)

  if (requiresAuth && !authStore.isAuthenticated) {
    next({ name: 'login' })
  } else if (to.name === 'login' && authStore.isAuthenticated) {
    next({ name: 'dashboard' })
  } else {
    // Check for specific permission
    const requiredPermission = to.meta.permission as string | undefined;
    if (requiredPermission && !authStore.hasPermission(requiredPermission)) {
      console.warn(`User lacks permission: ${requiredPermission}`);
      next({ name: 'dashboard' }) // Redirect to dashboard or unauthorized page
    } else {
      next()
    }
  }
})

export default router

