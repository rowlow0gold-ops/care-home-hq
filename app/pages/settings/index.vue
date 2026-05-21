<script setup lang="ts">
useHead({ title: "설정 · 케어닥 HQ" });
const { me } = useAuth();
</script>
<template>
  <div class="px-8 py-6 max-w-3xl">
    <h1 class="text-2xl font-bold mb-2">설정</h1>
    <p class="text-sm text-muted-foreground mb-6">계정·테넌트·지점 설정.</p>

    <Card title="내 계정">
      <dl class="grid grid-cols-3 gap-y-2 text-sm">
        <dt class="text-muted-foreground">이름</dt><dd class="col-span-2">{{ me?.name }}</dd>
        <dt class="text-muted-foreground">이메일</dt><dd class="col-span-2">{{ me?.email }}</dd>
        <dt class="text-muted-foreground">역할</dt><dd class="col-span-2">{{ me?.role }}</dd>
        <dt class="text-muted-foreground">테넌트 ID</dt><dd class="col-span-2 font-mono text-xs">{{ me?.tenant_id }}</dd>
      </dl>
    </Card>
  </div>
</template>
