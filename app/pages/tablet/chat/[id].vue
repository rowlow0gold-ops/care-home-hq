<script setup lang="ts">
/**
 * Legacy thread route — now the chat lives in /tablet/chat with the
 * conversation id as a query param (?conv=…). Keep this route alive to
 * preserve deep-links (e.g. 휴가 반려 → 결정자와 대화) but immediately
 * forward to the 2-pane page.
 */
definePageMeta({ layout: "tablet" });
const route = useRoute();
const router = useRouter();
onMounted(() => {
  const id = String(route.params.id ?? "");
  router.replace({ path: "/tablet/chat", query: id ? { conv: id } : {} });
});
</script>

<template>
  <div class="py-16 text-center text-sm text-muted-foreground">대화로 이동 중…</div>
</template>
