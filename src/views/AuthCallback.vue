<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

onMounted(async () => {
  const token = route.query.token as string;

  if (token) {
    try {
      // 1. Set the token in the store and localStorage
      authStore.token = token;
      localStorage.setItem('token', token);

      // 2. Fetch the user info to complete the authentication state
      // This will also verify if the token is valid
      await authStore.fetchUser();
      
      // 3. Redirect to dashboard on success
      router.push({ name: 'dashboard' });
    } catch (error) {
      console.error('Failed to authenticate after Google redirect:', error);
      // If fetching user fails, clear everything and go back to login
      localStorage.removeItem('token');
      authStore.token = null;
      router.push({ 
        name: 'login', 
        query: { error: 'Session initialization failed. Please try again.' } 
      });
    }
  } else {
    // No token found in URL, possibly an error passed from backend
    const errorMsg = route.query.error as string || 'Authentication failed. No token received.';
    console.error('Auth Callback Error:', errorMsg);
    router.push({ 
      name: 'login', 
      query: { error: errorMsg } 
    });
  }
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-[#f0f2f5] font-sans">
    <div class="text-center p-8 bg-white/80 backdrop-blur-xl rounded-[32px] shadow-xl border border-white/40 max-w-sm w-full mx-4">
      <div class="relative w-20 h-20 mx-auto mb-6">
        <div class="absolute inset-0 border-4 border-sky-100 rounded-full"></div>
        <div class="absolute inset-0 border-4 border-sky-600 rounded-full border-t-transparent animate-spin"></div>
      </div>
      
      <h2 class="text-2xl font-bold text-gray-900 mb-2">Finalizing Sign-in</h2>
      <p class="text-gray-500">Please wait while we secure your session...</p>
      
      <div class="mt-8 flex justify-center gap-2">
        <div class="w-2 h-2 bg-sky-600 rounded-full animate-bounce" style="animation-delay: 0s"></div>
        <div class="w-2 h-2 bg-sky-600 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
        <div class="w-2 h-2 bg-sky-600 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
