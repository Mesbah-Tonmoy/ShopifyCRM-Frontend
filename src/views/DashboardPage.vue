<script setup lang="ts">
import { onMounted, computed, shallowRef, type Component } from 'vue';
import { useMutationObserver } from '@vueuse/core';
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
  Filler,
  type ChartOptions
} from 'chart.js';
import { Line } from 'vue-chartjs';
import { CircleCheck, Clock, Layers, LayoutGrid, Plus, Users } from '@lucide/vue';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import AppAlert from '@/components/common/AppAlert.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { toneDotClasses } from '@/lib/tones';

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

type StatKey = keyof NonNullable<typeof dashboardStore.stats>;

const statTiles: { label: string; to: string; key: StatKey; icon: Component }[] = [
  { label: 'Total Apps', to: '/apps', key: 'total_apps', icon: LayoutGrid },
  { label: 'Installations', to: '/installations', key: 'total_installations', icon: Layers },
  { label: 'Active Stores', to: '/installations', key: 'active_stores', icon: CircleCheck },
  { label: 'Total Users', to: '/accounts/users', key: 'total_users', icon: Users },
];

// Chart.js paints on a canvas, which cannot read CSS variables, so the theme
// tokens are resolved to rgba() strings. Painting the token onto a 1x1 canvas
// converts any CSS colour (oklch, alpha, ...) into sRGB bytes Chart.js can parse.
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });

const themeColor = (token: string, alpha = 1): string => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (!probe || !value) return value;

  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 255] = probe.getImageData(0, 0, 1, 1).data;

  return `rgba(${r}, ${g}, ${b}, ${Number(((a / 255) * alpha).toFixed(3))})`;
};

// --chart-1 is the lightest shade and faint on a white card, so start from the mid tones.
const SERIES_TOKENS = ['--chart-2', '--chart-4', '--chart-3', '--chart-5', '--chart-1'];

const readPalette = () => ({
  series: SERIES_TOKENS.map((token) => ({ line: themeColor(token), fill: themeColor(token, 0.1) })),
  surface: themeColor('--card'),
  border: themeColor('--border'),
  mutedForeground: themeColor('--muted-foreground'),
  popover: themeColor('--popover'),
  popoverForeground: themeColor('--popover-foreground'),
});

// Re-resolve the tokens when the theme class on <html> changes (dark mode).
const palette = shallowRef(readPalette());

useMutationObserver(
  document.documentElement,
  () => {
    palette.value = readPalette();
  },
  { attributes: true, attributeFilter: ['class', 'data-theme'] }
);

const chartData = computed(() => {
  // Get all unique dates from all apps to build the labels
  const allDates = new Set<string>();
  dashboardStore.chartData.forEach(dataset => {
    dataset.data.forEach(item => allDates.add(item.date));
  });

  const labels = Array.from(allDates);

  const { series, surface } = palette.value;

  const datasets = dashboardStore.chartData.map((dataset, index) => {
    const color = series[index % series.length]!; // Non-null assertion since modulo ensures valid index
    return {
      label: dataset.app_name,
      backgroundColor: color.fill,
      borderColor: color.line,
      pointBackgroundColor: color.line,
      pointBorderColor: surface,
      pointHoverBackgroundColor: surface,
      pointHoverBorderColor: color.line,
      fill: true,
      tension: 0.4,
      data: dataset.data.map(item => item.count)
    };
  });

  return { labels, datasets };
});

const chartOptions = computed<ChartOptions<'line'>>(() => {
  const { border, mutedForeground, popover, popoverForeground } = palette.value;

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          usePointStyle: true,
          boxWidth: 6,
          padding: 20,
          color: mutedForeground,
          font: {
            size: 11
          }
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: popover,
        titleColor: popoverForeground,
        bodyColor: popoverForeground,
        borderColor: border,
        borderWidth: 1,
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        border: {
          color: border
        },
        grid: {
          color: border
        },
        ticks: {
          stepSize: 1,
          color: mutedForeground
        }
      },
      x: {
        border: {
          color: border
        },
        grid: {
          display: false
        },
        ticks: {
          color: mutedForeground
        }
      }
    }
  };
});
</script>

<template>
  <div>
    <PageHeader
      title="Dashboard"
      description="Welcome to your Shopify CRM dashboard"
    />

    <!-- Error State -->
    <AppAlert v-if="dashboardStore.error" tone="danger" class="mb-6">
      {{ dashboardStore.error }}
    </AppAlert>

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <RouterLink
        v-for="tile in statTiles"
        :key="tile.label"
        :to="tile.to"
        class="group block rounded-2xl"
      >
        <Card class="h-full transition-colors group-hover:bg-muted/50">
          <CardContent class="flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{{ tile.label }}</p>
              <div v-if="dashboardStore.loading" class="mt-2">
                <SkeletonLoader width="60px" height="32px" />
              </div>
              <p v-else class="font-heading text-3xl font-semibold text-foreground mt-2">{{ dashboardStore.stats?.[tile.key] || 0 }}</p>
            </div>
            <div class="flex size-12 items-center justify-center rounded-xl bg-muted text-foreground">
              <component :is="tile.icon" class="size-6" />
            </div>
          </CardContent>
        </Card>
      </RouterLink>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
      <!-- Installation Chart -->
      <Card class="lg:col-span-2">
        <CardHeader>
          <CardTitle>Installation Trends</CardTitle>
          <CardAction>
            <Badge variant="secondary">Last 30 Days</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div class="h-[300px] w-full">
            <div v-if="dashboardStore.loading" class="h-full w-full flex items-center justify-center">
              <SkeletonLoader width="100%" height="100%" />
            </div>
            <Line v-else :data="chartData" :options="chartOptions" />
          </div>
        </CardContent>
      </Card>

      <!-- Recent Activity -->
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent class="flex-1">
          <div v-if="dashboardStore.loading" class="space-y-4">
            <div v-for="i in 5" :key="i" class="flex gap-4">
              <SkeletonLoader width="40px" height="40px" custom-class="rounded-lg" />
              <div class="flex-1 space-y-2">
                <SkeletonLoader width="150px" height="14px" />
                <SkeletonLoader width="100px" height="10px" />
              </div>
            </div>
          </div>
          <Empty v-else-if="dashboardStore.recentActivity.length === 0" class="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clock />
              </EmptyMedia>
              <EmptyTitle class="text-sm font-normal text-muted-foreground">No recent activity</EmptyTitle>
            </EmptyHeader>
          </Empty>
          <div v-else class="space-y-6">
            <div v-for="activity in dashboardStore.recentActivity" :key="activity.id" class="flex gap-4">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                <Plus class="size-5" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-foreground truncate">New install: {{ activity.store_name }}</p>
                <p class="text-xs text-muted-foreground truncate">{{ activity.app_name }} · {{ activity.created_at }}</p>
              </div>
              <div v-if="activity.is_active" :class="['size-2 rounded-full mt-1.5 shrink-0', toneDotClasses.success]"></div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button as-child variant="link" class="w-full">
            <RouterLink to="/installations">
              View All Installations
            </RouterLink>
          </Button>
        </CardFooter>
      </Card>
    </div>
  </div>
</template>
