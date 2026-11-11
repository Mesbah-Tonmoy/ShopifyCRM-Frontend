<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { LoadingIcon } from '@/components/icons';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
  <div class="min-h-svh flex items-center justify-center bg-muted p-4">
    <Card class="w-full max-w-sm py-8 text-center">
      <CardHeader class="justify-items-center gap-2 px-8">
        <LoadingIcon size="xl" color-class="text-primary mb-4" />
        <CardTitle class="font-heading text-2xl font-semibold">Finalizing Sign-in</CardTitle>
        <CardDescription class="text-base">Please wait while we secure your session...</CardDescription>
      </CardHeader>
    </Card>
  </div>
</template>
