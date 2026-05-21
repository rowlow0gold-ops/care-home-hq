<script setup lang="ts">
// Hydrate theme so the html class is applied before paint
useDarkMode();
</script>

<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <Toaster />
  </div>
</template>
