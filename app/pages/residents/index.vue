<script setup lang="ts">
// /residents is merged into /care?tab=residents — keep this redirect so older
// bookmarks and deep links from elsewhere in the app still resolve.
// Note: the per-resident detail page lives at /residents/[id].vue and is
// unaffected.
definePageMeta({
  middleware: () => {
    return navigateTo("/care?tab=residents", { redirectCode: 301 });
  },
});
</script>

<template>
  <div />
</template>
