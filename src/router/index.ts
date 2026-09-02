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
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('@/views/AuthCallback.vue'),
    meta: { isPublic: true }
  },
  {
    // Merchant-facing board. Public and embedded in an iframe by each Shopify
    // app, so it sits outside the authenticated tree and skips the auth check.
    path: '/board/:slug',
    component: () => import('@/layouts/BoardLayout.vue'),
    meta: { isPublic: true, isBoard: true },
    children: [
      {
        // The roadmap leads, and takes the bare path so that embeds already
        // pointing at /board/{slug} land on it without changing their snippet.
        path: '',
        name: 'board-roadmap',
        component: () => import('@/views/board/BoardRoadmapView.vue'),
        // Columns should use the whole viewport rather than the reading-width cap.
        meta: { fullWidth: true },
      },
      {
        path: 'requests',
        name: 'board-requests',
        component: () => import('@/views/board/BoardRequestsView.vue'),
      },
    ],
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
        meta: { permission: 'pricing_plans.view' }
      },
      {
        path: 'pricing-plan/:id/features',
        name: 'PricingPlanFeatures',
        component: () => import('@/views/PricingPlanFeaturesPage.vue'),
        meta: { permission: 'pricing_plans.view' }
      },
      {
        path: 'integrations',
        name: 'integrations',
        component: () => import('@/views/IntegrationsPage.vue'),
        meta: { permission: 'integrations.view' }
      },
      {
        path: 'email-templates',
        name: 'email-templates',
        component: () => import('@/views/EmailTemplatesPage.vue'),
        meta: { permission: 'email_templates.view' }
      },
      {
        path: 'feature-requests',
        name: 'feature-requests',
        component: () => import('@/views/FeatureRequestsPage.vue'),
        meta: { permission: 'feature_requests.view' }
      },
      {
        path: 'board-settings',
        name: 'board-settings',
        component: () => import('@/views/BoardSettingsPage.vue'),
        meta: { permission: 'board_settings.edit' }
      },
      {
        path: 'features',
        name: 'features',
        component: () => import('@/views/FeaturesPage.vue'),
        meta: { permission: 'features.view' }
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
      }
    ]
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to, from, next) => {
  // The public board never touches CRM auth: a merchant has no admin session,
  // and an admin browsing it should get no extra privileges.
  if (to.matched.some(record => record.meta.isBoard)) {
    next()
    return
  }

  const authStore = useAuthStore()

  // Check session persistence
  await authStore.checkAuth()

  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)

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
