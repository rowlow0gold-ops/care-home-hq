<script setup lang="ts">
import { Heart } from "@lucide/vue";
</script>

<template>
  <footer class="border-t bg-card/50 mt-8">
    <div class="max-w-7xl mx-auto px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
      <div class="flex items-center gap-2">
        <Heart class="h-3.5 w-3.5 text-primary" />
        <span class="font-medium text-foreground/80">케어닥</span>
        <span class="opacity-70">— 요양원 본부 통합관리</span>
      </div>
      <div class="flex items-center gap-4">
        <NuxtLink to="/settings" class="hover:text-foreground">설정</NuxtLink>
        <a href="https://care.minhojan-world.site" target="_blank" rel="noopener" class="hover:text-foreground">API</a>
        <span>All rights reserved.</span>
      </div>
    </div>
  </footer>
</template>
