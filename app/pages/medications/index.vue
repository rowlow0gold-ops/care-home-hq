<script setup lang="ts">
// /medications is now a tab inside /care — keep this redirect so older links
// resolve to the new location with any query params preserved.
definePageMeta({
  middleware: (to) => {
    return navigateTo(
      {
        path: "/care",
        query: { ...to.query, tab: "medications" },
      },
      { redirectCode: 301 },
    );
  },
});
</script>

<template>
  <div />
</template>
