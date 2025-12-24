<script setup lang="ts">
//Dashboard page content
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-h2 font-bold text-dark">Dashboard</h1>
      <p class="text-b4 text-mid mt-1">Welcome to your Shopify CRM dashboard</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div class="bg-white rounded-lg border border-gray-200 p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-b5 text-mid uppercase">Total Apps</p>
            <p class="text-h2 font-bold text-dark mt-2">12</p>
          </div>
          <div class="w-12 h-12 bg-teal-light rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg border border-gray-200 p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-b5 text-mid uppercase">Installations</p>
            <p class="text-h2 font-bold text-dark mt-2">284</p>
          </div>
          <div class="w-12 h-12 bg-blue-light rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg border border-gray-200 p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-b5 text-mid uppercase">Active Users</p>
            <p class="text-h2 font-bold text-dark mt-2">156</p>
          </div>
          <div class="w-12 h-12 bg-green-lighter rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg border border-gray-200 p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-b5 text-mid uppercase">Revenue</p>
            <p class="text-h2 font-bold text-dark mt-2">$12.4k</p>
          </div>
          <div class="w-12 h-12 bg-orange-lighter rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-6 bg-white rounded-lg border border-gray-200 p-6">
      <h2 class="text-h4 font-semibold text-dark mb-4">Recent Activity</h2>
      <p class="text-b4 text-mid">No recent activity to display.</p>
    </div>
  </div>
</template>