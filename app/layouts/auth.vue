<template>
  <div class="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-background">
    <!-- Decorative background -->
    <div
      aria-hidden="true"
      class="absolute inset-0 -z-10 opacity-30 dark:opacity-20"
      style="
        background-image:
          radial-gradient(circle at 20% 30%, hsl(var(--primary) / 0.18) 0px, transparent 40%),
          radial-gradient(circle at 80% 70%, hsl(var(--primary) / 0.12) 0px, transparent 45%);
      "
    />
    <div
      aria-hidden="true"
      class="absolute inset-0 -z-10 opacity-40 dark:opacity-25"
      style="
        background-image:
          linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px);
        background-size: 32px 32px;
      "
    />
    <slot />
  </div>
</template>
