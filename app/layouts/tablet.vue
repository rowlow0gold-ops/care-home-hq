<script setup lang="ts">
/**
 * Layout for /tablet/* routes. Built for older caregivers on a tablet:
 *  - large fonts (base 18px), big tap targets (min 56px)
 *  - dark/light auto from system; no theme toggle to keep things simple
 *  - top bar shows my name + branch, with logout
 *  - no sidebar — every screen has at most one "back" + one action
 *
 * Login + pair pages have no top bar; they render full-screen via the slot.
 */
import { LogOut, ChevronLeft } from "@lucide/vue";

// Tablet-only PWA manifest + Apple meta so "홈 화면에 추가" creates a
// full-screen icon launcher pointing at /tablet.
useHead({
  link: [
    { rel: "manifest",          href: "/tablet-manifest.json" },
    { rel: "apple-touch-icon",  href: "/icons/tablet-192.png" },
  ],
  meta: [
    { name: "apple-mobile-web-app-capable",          content: "yes" },
    { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    { name: "apple-mobile-web-app-title",            content: "케어닥" },
    { name: "viewport",                              content: "width=device-width, initial-scale=1, viewport-fit=cover" },
  ],
});

const route   = useRoute();
const router  = useRouter();
const { me, logout } = useTablet();

const isAuthScreen = computed(() => route.path === "/tablet/pair" || route.path === "/tablet/login");
const showBack     = computed(() => route.path !== "/tablet" && !isAuthScreen.value);

async function onLogout() {
  if (!confirm("로그아웃 하시겠습니까?")) return;
  await logout();
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground tablet-root">
    <header
      v-if="!isAuthScreen"
      class="sticky top-0 z-30 bg-card border-b shadow-sm flex items-center gap-3 px-5 h-16"
    >
      <button
        v-if="showBack"
        type="button"
        class="h-12 w-12 -ml-2 rounded-lg hover:bg-muted inline-flex items-center justify-center text-foreground"
        aria-label="뒤로"
        @click="router.back()"
      >
        <ChevronLeft class="h-6 w-6" />
      </button>
      <div class="flex-1 min-w-0">
        <div class="text-base font-semibold truncate">
          {{ me?.name ?? "" }}
          <span class="text-muted-foreground font-normal ml-1.5 text-sm">
            {{ me?.branch_name ?? "" }}
          </span>
        </div>
      </div>
      <button
        type="button"
        class="h-12 px-4 rounded-lg border border-input bg-card text-sm font-medium inline-flex items-center gap-1.5 hover:bg-muted"
        @click="onLogout"
      >
        <LogOut class="h-4 w-4" />
        로그아웃
      </button>
    </header>

    <main>
      <slot />
    </main>
  </div>
</template>

<style scoped>
/* Bumps the base font for the entire tablet area so labels stay readable
   at arm's length for older caregivers. */
.tablet-root {
  font-size: 18px;
}
.tablet-root :deep(button),
.tablet-root :deep(input),
.tablet-root :deep(select),
.tablet-root :deep(textarea) {
  font-size: 17px;
}
</style>
