<script setup lang="ts">
// /schedule is merged into /staff?tab=schedule — keep the route as a
// redirect so older bookmarks and links still work.
definePageMeta({
  middleware: () => {
    return navigateTo("/staff?tab=schedule", { redirectCode: 301 });
  },
});
</script>

<template>
  <div />
</template>
