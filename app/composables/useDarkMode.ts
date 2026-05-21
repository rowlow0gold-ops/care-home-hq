/**
 * Tiny dark-mode toggle. Uses Tailwind's `class="dark"` strategy.
 * Persists choice in a cookie so SSR + reload stay consistent.
 *
 * SSR-safe: the cookie is read on both server + client, and the html
 * `class="dark"` is injected via useHead so server-rendered HTML matches
 * what the client expects (no hydration mismatch).
 */
export function useDarkMode() {
  const cookie = useCookie<"light" | "dark">("hq_theme", {
    default: () => "light",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const isDark = computed(() => cookie.value === "dark");

  // Inject the html class server-side AND keep it in sync client-side.
  useHead({
    htmlAttrs: {
      class: () => (isDark.value ? "dark" : ""),
    },
  });

  function toggle() {
    cookie.value = isDark.value ? "light" : "dark";
  }

  return { isDark, toggle };
}
