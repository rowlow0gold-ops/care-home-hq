<script setup lang="ts">
// /care-logs is now a tab inside /care — keep this redirect so older links
// (and the dashboard's KPI cards from before the restructure) still resolve.
// Forward through the ?flagged + ?branch query params the dashboard sends.
definePageMeta({
  middleware: (to) => {
    return navigateTo(
      {
        path: "/care",
        query: { ...to.query, tab: "care-logs" },
      },
      { redirectCode: 301 },
    );
  },
});
</script>

<template>
  <div />
</template>
