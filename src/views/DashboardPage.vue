<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useDashboardStore } from '@/stores/dashboard';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'vue-chartjs';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const dashboardStore = useDashboardStore();

onMounted(() => {
  dashboardStore.fetchDashboardStats();
});

const chartData = computed(() => {
  // Get all unique dates from all apps to build the labels
  const allDates = new Set<string>();
  dashboardStore.chartData.forEach(dataset => {
    dataset.data.forEach(item => allDates.add(item.date));
  });
  
  const labels = Array.from(allDates);
  
  const colors = [
    { border: '#14b8a6', bg: 'rgba(20, 184, 166, 0.1)' }, // Teal
    { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' }, // Blue
    { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' }, // Purple
    { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' }, // Amber
    { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },  // Red
    { border: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' }, // Green
  ];

  const datasets = dashboardStore.chartData.map((dataset, index) => {
    const color = colors[index % colors.length]!; // Non-null assertion since modulo ensures valid index
    return {
      label: dataset.app_name,
      backgroundColor: color.bg,
      borderColor: color.border,
      pointBackgroundColor: color.border,
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: color.border,
      fill: true,
      tension: 0.4,
      data: dataset.data.map(item => item.count)
    };
  });

  return { labels, datasets };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'top' as const,
      align: 'end' as const,
      labels: {
        usePointStyle: true,
        boxWidth: 6,
        padding: 20,
        font: {
          size: 11
        }
      }
    },
    tooltip: {
      mode: 'index' as const,
      intersect: false,
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: {
        color: 'rgba(0, 0, 0, 0.05)'
      },
      ticks: {
        stepSize: 1
      }
    },
    x: {
      grid: {
        display: false
      }
    }
  }
};
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-h2 font-bold text-dark">Dashboard</h1>
      <p class="text-b4 text-mid mt-1">Welcome to your Shopify CRM dashboard</p>
    </div>

    <!-- Error State -->
    <div v-if="dashboardStore.error" class="mb-6 bg-red-50 p-4 rounded-lg border border-red-200">
      <p class="text-red-800">{{ dashboardStore.error }}</p>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <!-- Total Apps -->
      <router-link to="/apps" class="bg-white rounded-xl border border-teal-200 p-6 shadow-md shadow-teal-500/50 hover:shadow-lg transition-all duration-300 cursor-pointer block">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-bold text-mid uppercase tracking-wider">Total Apps</p>
            <div v-if="dashboardStore.loading" class="mt-2">
              <SkeletonLoader width="60px" height="32px" />
            </div>
            <p v-else class="text-3xl font-bold text-dark mt-2">{{ dashboardStore.stats?.total_apps || 0 }}</p>
          </div>
          <div class="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center">
            <svg class="w-6 h-6 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </div>
        </div>
      </router-link>

      <!-- Installations -->
      <router-link to="/installations" class="bg-white rounded-xl border border-blue-200 p-6 shadow-md shadow-blue-500/50 hover:shadow-lg transition-all duration-300 cursor-pointer block">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-bold text-mid uppercase tracking-wider">Installations</p>
            <div v-if="dashboardStore.loading" class="mt-2">
              <SkeletonLoader width="60px" height="32px" />
            </div>
            <p v-else class="text-3xl font-bold text-dark mt-2">{{ dashboardStore.stats?.total_installations || 0 }}</p>
          </div>
          <div class="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
            <svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
        </div>
      </router-link>

      <!-- Active Stores -->
      <router-link to="/installations" class="bg-white rounded-xl border border-green-200 p-6 shadow-md shadow-green-500/50 hover:shadow-lg transition-all duration-300 cursor-pointer block">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-bold text-mid uppercase tracking-wider">Active Stores</p>
            <div v-if="dashboardStore.loading" class="mt-2">
              <SkeletonLoader width="60px" height="32px" />
            </div>
            <p v-else class="text-3xl font-bold text-dark mt-2">{{ dashboardStore.stats?.active_stores || 0 }}</p>
          </div>
          <div class="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
            <svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </router-link>

      <!-- Total Users -->
      <router-link to="/accounts/users" class="bg-white rounded-xl border border-purple-200 p-6 shadow-md shadow-purple-500/50 hover:shadow-lg transition-all duration-300 cursor-pointer block">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-bold text-mid uppercase tracking-wider">Total Users</p>
            <div v-if="dashboardStore.loading" class="mt-2">
              <SkeletonLoader width="60px" height="32px" />
            </div>
            <p v-else class="text-3xl font-bold text-dark mt-2">{{ dashboardStore.stats?.total_users || 0 }}</p>
          </div>
          <div class="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center">
            <svg class="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        </div>
      </router-link>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
      <!-- Installation Chart -->
      <div class="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 shadow-md">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-lg font-bold text-dark">Installation Trends</h2>
          <span class="text-xs font-medium text-mid bg-gray-100 px-2 py-1 rounded">Last 30 Days</span>
        </div>
        <div class="h-[300px] w-full">
          <div v-if="dashboardStore.loading" class="h-full w-full flex items-center justify-center">
             <SkeletonLoader width="100%" height="100%" />
          </div>
          <Line v-else :data="chartData" :options="chartOptions" />
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-md">
        <h2 class="text-lg font-bold text-dark mb-6">Recent Activity</h2>
        <div v-if="dashboardStore.loading" class="space-y-4">
          <div v-for="i in 5" :key="i" class="flex gap-4">
            <SkeletonLoader width="40px" height="40px" custom-class="rounded-lg" />
            <div class="flex-1 space-y-2">
              <SkeletonLoader width="150px" height="14px" />
              <SkeletonLoader width="100px" height="10px" />
            </div>
          </div>
        </div>
        <div v-else-if="dashboardStore.recentActivity.length === 0" class="flex flex-col items-center justify-center py-12 text-gray-400">
           <svg class="w-12 h-12 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
           </svg>
           <p class="text-sm">No recent activity</p>
        </div>
        <div v-else class="space-y-6">
          <div v-for="activity in dashboardStore.recentActivity" :key="activity.id" class="flex gap-4">
            <div class="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0 text-teal">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-dark truncate">New install: {{ activity.store_name }}</p>
              <p class="text-xs text-mid truncate">{{ activity.app_name }} · {{ activity.created_at }}</p>
            </div>
            <div v-if="activity.is_active" class="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0"></div>
          </div>
        </div>
        <router-link to="/installations" class="mt-8 block text-center text-sm font-bold text-teal hover:text-teal-dark transition-colors">
          View All Installations
        </router-link>
      </div>
    </div>
  </div>
</template>