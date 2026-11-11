<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import loginBg from '@/assets/login-bg.jpg';
import { GoogleIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import AppAlert from '@/components/common/AppAlert.vue';

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
  <!-- Full-screen split, as before: the form on the left half, the photo filling the right -->
  <div class="flex min-h-svh w-full">
    <!-- Left Side: Form -->
    <div class="relative flex w-full flex-col justify-center overflow-hidden bg-background p-8 md:w-1/2 md:p-16">
      <!-- Soft glow in the bottom-left corner, in the theme colour so it works in dark mode -->
      <div aria-hidden="true" class="pointer-events-none absolute -bottom-24 -left-24 size-64 rounded-full bg-primary/15 blur-[80px]" />

      <!-- Bordered panel around the form -->
      <div class="relative flex flex-col gap-10 rounded-3xl border bg-card p-8 md:mx-auto md:w-[450px] md:p-10">
        <div class="flex flex-col gap-3">
          <!-- Brand logo: needs a light chip to stay legible in both themes -->
          <div class="mb-5 flex h-[45px] w-[100px] rounded-xl bg-white p-1.5 ring-1 ring-foreground/10">
            <img src="https://upload.wikimedia.org/wikipedia/commons/e/e1/Shopify_Logo.png" alt="Logo" class="w-full object-contain">
          </div>
          <h2 class="font-heading text-2xl font-semibold tracking-tight text-foreground">Sign in</h2>
          <p class="text-base text-muted-foreground">Welcome back! Please enter your details.</p>
        </div>

        <form @submit.prevent="handleLogin">
          <FieldGroup>
            <Field>
              <FieldLabel for="email">Email</FieldLabel>
              <Input
                id="email"
                v-model="email"
                type="email"
                required
                placeholder="Enter your email"
                autocomplete="email"
              />
            </Field>

            <Field>
              <FieldLabel for="password">Password</FieldLabel>
              <Input
                id="password"
                v-model="password"
                type="password"
                required
                placeholder="••••••••"
                autocomplete="current-password"
              />
            </Field>

            <div class="flex items-center justify-between">
              <Field orientation="horizontal" class="w-auto gap-2.5">
                <Checkbox id="remember_me" v-model="rememberMe" />
                <FieldLabel for="remember_me">Remember me</FieldLabel>
              </Field>
              <div class="text-sm">
                <a href="#" class="font-semibold text-foreground transition-colors hover:text-primary">
                  Forgot password?
                </a>
              </div>
            </div>

            <AppAlert v-if="authStore.error" tone="danger">
              {{ authStore.error }}
            </AppAlert>

            <Button
              type="submit"
              size="lg"
              class="w-full"
              :disabled="authStore.loading || isGoogleLoading"
            >
              <span v-if="authStore.loading">Signing in...</span>
              <span v-else>Sign In</span>
            </Button>

            <FieldSeparator class="my-1 *:data-[slot=field-separator-content]:bg-card">
              Or continue with
            </FieldSeparator>

            <Button
              type="button"
              variant="outline"
              size="lg"
              class="w-full"
              @click="loginWithGoogle"
              :disabled="authStore.loading || isGoogleLoading"
            >
              <template v-if="isGoogleLoading">
                <Spinner />
                Redirecting...
              </template>
              <template v-else>
                <GoogleIcon />
                Sign in with Google
              </template>
            </Button>
          </FieldGroup>
        </form>
      </div>
    </div>

    <!-- Right Side: Image/Branding (text sits on the photo, so it stays white in both themes) -->
    <div class="relative hidden md:block md:w-1/2">
      <img :src="loginBg" alt="Shopify CRM" class="absolute inset-0 h-full w-full object-cover">
      <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
      <div class="absolute bottom-16 left-16 right-16 text-white drop-shadow-lg">
        <h3 class="font-heading mb-3 text-3xl font-semibold leading-tight text-white drop-shadow-md">Shopify CRM</h3>
        <p class="text-lg font-medium text-white/90">Streamlined tools for tracking installs, uninstalls, and customer subscriptions across our organization's apps.</p>
      </div>
    </div>
  </div>
</template>
