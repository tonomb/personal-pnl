import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "d" || e.repeat) return;
      // Leave browser shortcuts (bookmark) alone.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      // Typing, or a key meant for an open popup (select list, tag picker).
      if (
        active?.closest(
          'input, select, textarea, [contenteditable="true"], [data-slot="select-content"], [data-slot="popover-content"]'
        )
      ) {
        return;
      }
      e.preventDefault();
      setTheme(next);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [next, setTheme]);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Switch to ${next} theme`}
      aria-keyshortcuts="d"
      title={`Switch to ${next} theme (D)`}
      onClick={() => setTheme(next)}
    >
      {next === "dark" ? <MoonIcon /> : <SunIcon />}
    </Button>
  );
}
