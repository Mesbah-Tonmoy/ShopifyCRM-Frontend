<template>
  <Avatar :class="cn('rounded-lg', props.class)">
    <AvatarImage v-if="image" :src="image" :alt="name ?? ''" />
    <AvatarFallback class="rounded-lg">{{ initial }}</AvatarFallback>
  </Avatar>
</template>

<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const props = defineProps<{
  name?: string | null;
  image?: string | null;
  class?: HTMLAttributes['class'];
}>();

const initial = computed(() => props.name?.charAt(0).toUpperCase() || 'U');
</script>
