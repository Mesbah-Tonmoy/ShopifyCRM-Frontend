<script setup lang="ts">
import { ref, onMounted } from 'vue';

// Placeholder data
const pricingPlans = ref([
  {
    id: 1,
    name: 'Basic',
    price: '$29',
    period: 'per month',
    features: ['Up to 100 customers', 'Basic analytics', 'Email support', '5 GB storage']
  },
  {
    id: 2,
    name: 'Professional',
    price: '$79',
    period: 'per month',
    features: ['Up to 1000 customers', 'Advanced analytics', 'Priority support', '50 GB storage', 'API access']
  },
  {
    id: 3,
    name: 'Enterprise',
    price: '$199',
    period: 'per month',
    features: ['Unlimited customers', 'Custom analytics', '24/7 support', '500 GB storage', 'API access', 'Custom integrations']
  }
]);
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-h2 font-bold text-dark">Pricing Plans</h1>
      <p class="text-b4 text-mid mt-1">Manage your pricing plans and subscriptions</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="plan in pricingPlans"
        :key="plan.id"
        class="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow"
      >
        <h3 class="text-h4 font-semibold text-dark">{{ plan.name }}</h3>
        <div class="mt-4 flex items-baseline">
          <span class="text-h1 font-bold text-teal">{{ plan.price }}</span>
          <span class="ml-2 text-b4 text-mid">{{ plan.period }}</span>
        </div>
        <ul class="mt-6 space-y-3">
          <li
            v-for="(feature, index) in plan.features"
            :key="index"
            class="flex items-start"
          >
            <svg class="w-5 h-5 text-green mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <span class="text-b4 text-dark">{{ feature }}</span>
          </li>
        </ul>
        <button class="mt-6 w-full bg-teal text-white py-2.5 rounded-lg font-medium hover:bg-teal-dark transition-colors">
          Select Plan
        </button>
      </div>
    </div>
  </div>
</template>
