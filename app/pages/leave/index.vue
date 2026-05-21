<script setup lang="ts">
// /leave is merged into /staff?tab=leave — keep the route as a redirect so
// older bookmarks and links still work.
definePageMeta({
  middleware: () => {
    return navigateTo("/staff?tab=leave", { redirectCode: 301 });
  },
});
</script>

<template>
  <div />
</template>
