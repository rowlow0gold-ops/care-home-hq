/**
 * Tiny dark-mode toggle. Uses Tailwind's `class="dark"` strategy.
 * Persists choice in a cookie so SSR + reload stay consistent.
 */
export function useDarkMode() {
  const cookie = useCookie<"light" | "dark">("hq_theme", {
    default: () => "light",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const isDark = computed(() => cookie.value === "dark");

  function apply() {
    if (import.meta.client) {
      document.documentElement.classList.toggle("dark", isDark.value);
    }
  }

  function toggle() {
    cookie.value = isDark.value ? "light" : "dark";
    apply();
  }

  if (import.meta.client) {
    onMounted(apply);
  }

  return { isDark, toggle };
}
