<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-sm" title="Theme" aria-label="Change theme">
        <Moon v-if="isDark" />
        <Sun v-else />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-36">
      <DropdownMenuRadioGroup v-model="mode">
        <DropdownMenuRadioItem v-for="option in OPTIONS" :key="option.value" :value="option.value">
          <component :is="option.icon" />
          {{ option.label }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { Monitor, Moon, Sun } from '@lucide/vue';
import { useColorMode, type ColorMode } from '@/composables/useColorMode';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const { mode, isDark } = useColorMode();

const OPTIONS: { value: ColorMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];
</script>
