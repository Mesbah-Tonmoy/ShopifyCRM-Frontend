<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import loginBg from '@/assets/login-bg.jpg';
import { GoogleIcon } from '@/components/icons';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const rememberMe = ref(false);

onMounted(() => {
  if (route.query.error) {
    authStore.error = route.query.error as string;
  }
});

const handleLogin = async () => {
  const success = await authStore.login({
    email: email.value,
    password: password.value,
    remember: rememberMe.value,
  });

  if (success) {
    router.push({ name: 'dashboard' });
  }
};

const isGoogleLoading = ref(false);

const loginWithGoogle = () => {
  isGoogleLoading.value = true;
  // Redirect to backend Google auth route
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://crm.zapioapps.com/backendapp';
  window.location.href = `${backendUrl}/auth/google`;
};
</script>

<template>
  <div class="flex items-center justify-center font-sans">
    <!-- Main Container - More expansive -->
    <div class="w-full flex min-h-screen">
      
      <!-- Left Side: Form with Bottom-Left Gradient -->
      <div class="w-full md:w-1/2 p-8 md:p-16 flex flex-col justify-center relative overflow-hidden bg-gradient-to-tr from-[#FFF7E6] via-white/50 to-white/20">
        <!-- Subtle decorative glow in bottom left -->
        <div class="absolute -bottom-24 -left-24 w-64 h-64 bg-yellow-200/40 rounded-full blur-[80px]"></div>
        
        <div class="md:w-[450px] md:mx-auto">
          <div class="mb-10">
            <div class="w-[100px] h-[45px] flex bg-white rounded-2xl shadow-sm mb-8 p-1.5">
              <img src="https://upload.wikimedia.org/wikipedia/commons/e/e1/Shopify_Logo.png" alt="Logo" class="w-full object-contain">
            </div>
            <h2 class="text-4xl font-bold text-gray-900 mb-3 tracking-tight">Sign in</h2>
            <p class="text-gray-500 text-base">Welcome back! Please enter your details.</p>
          </div>

          <form @submit.prevent="handleLogin" class="space-y-6">
            <div>
              <label for="email" class="block text-sm font-semibold text-gray-700 mb-2 ml-1">Email</label>
              <input
                id="email"
                v-model="email"
                type="email"
                required
                placeholder="Enter your email"
                autocomplete="email"
                class="w-full px-6 py-4 rounded-2xl border border-gray-200 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all duration-300 bg-white/60 hover:bg-white"
              />
            </div>

            <div>
              <label for="password" class="block text-sm font-semibold text-gray-700 mb-2 ml-1">Password</label>
              <input
                id="password"
                v-model="password"
                type="password"
                required
                placeholder="••••••••"
                autocomplete="current-password"
                class="w-full px-6 py-4 rounded-2xl border border-gray-200 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all duration-300 bg-white/60 hover:bg-white"
              />
            </div>

            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <input
                  id="remember_me"
                  v-model="rememberMe"
                  type="checkbox"
                  class="h-5 w-5 focus:ring-teal border-gray-300 rounded-lg cursor-pointer transition-all duration-200"
                />
                <label for="remember_me" class="ml-2.5 block text-sm font-medium text-gray-700 cursor-pointer">
                  Remember me
                </label>
              </div>
              <div class="text-sm">
                <a href="#" class="font-semibold hover:text-teal transition-colors">
                  Forgot password?
                </a>
              </div>
            </div>

            <div v-if="authStore.error" class="bg-red-50 text-red-600 text-sm p-4 rounded-2xl border border-red-100 animate-fade-in">
              {{ authStore.error }}
            </div>

            <button
              type="submit"
              :disabled="authStore.loading || isGoogleLoading"
              class="w-full py-4 px-4 bg-[#FFD66B] hover:bg-[#FFCC4D] text-gray-900 font-bold text-lg rounded-2xl shadow-xl shadow-yellow-400/20 transition-all duration-300 transform active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="authStore.loading">Signing in...</span>
              <span v-else>Sign In</span>
            </button>

            <div class="relative my-8">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-gray-200"></div>
              </div>
              <div class="relative flex justify-center text-sm">
                <span class="px-4 bg-transparent text-gray-400 font-medium">Or continue with</span>
              </div>
            </div>

            <button
              type="button"
              @click="loginWithGoogle"
              :disabled="authStore.loading || isGoogleLoading"
              class="w-full py-4 px-4 bg-white border border-gray-200 text-gray-700 font-bold rounded-2xl shadow-sm hover:bg-gray-50 hover:border-gray-300 flex items-center justify-center gap-3 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <template v-if="isGoogleLoading">
                <div class="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                Redirecting...
              </template>
              <template v-else>
                <GoogleIcon size="lg" />
                Sign in with Google
              </template>
            </button>
          </form>

          <!-- <p class="mt-10 text-center text-sm text-gray-500 font-medium">
            Don't have an account? 
            <a href="#" class="font-bold text-indigo-600 hover:text-indigo-500 transition-colors">Sign up for free</a>
          </p> -->
        </div>
      </div>

      <!-- Right Side: Image/Branding -->
      <div class="hidden md:block w-1/2 relative">
        <img :src="loginBg" alt="Shopify CRM" class="absolute inset-0 w-full h-full object-cover">
        <div class="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent"></div>
        <div class="absolute bottom-16 left-16 right-16 text-white drop-shadow-lg">
          <h3 class="text-3xl font-extrabold mb-3 leading-tight text-white drop-shadow-md">Shopify CRM</h3>
          <p class="text-white/90 text-lg font-medium">Streamlined tools for tracking installs, uninstalls, and customer subscriptions across our organization's apps.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Custom animations or refinements */
input::placeholder {
  color: #94a3b8;
}

button {
  transition: transform 0.1s ease-in-out;
}
</style>