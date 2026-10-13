import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "./ThemeToggle";

function mockSystemTheme(theme: "light" | "dark") {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: theme === "dark" && query.includes("dark"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn()
    }))
  );
}

function renderToggle() {
  render(
    <ThemeProvider attribute="class" defaultTheme="system">
      <ThemeToggle />
      <input aria-label="Search" />
    </ThemeProvider>
  );
  return userEvent.setup();
}

function isDark() {
  return document.documentElement.classList.contains("dark");
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    mockSystemTheme("light");
  });

  it("follows the system theme until a theme is chosen", () => {
    mockSystemTheme("dark");
    renderToggle();
    expect(isDark()).toBe(true);
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });

  it("switches theme when the button is clicked", async () => {
    const user = renderToggle();
    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(isDark()).toBe(true);
    await user.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(isDark()).toBe(false);
  });

  it("switches theme with the d key", async () => {
    const user = renderToggle();
    await user.keyboard("d");
    expect(isDark()).toBe(true);
    await user.keyboard("d");
    expect(isDark()).toBe(false);
  });

  it("ignores d while typing in an input", async () => {
    const user = renderToggle();
    await user.type(screen.getByRole("textbox", { name: "Search" }), "d");
    expect(isDark()).toBe(false);
  });

  it("leaves browser shortcuts alone", async () => {
    const user = renderToggle();
    await user.keyboard("{Meta>}d{/Meta}");
    expect(isDark()).toBe(false);
  });
});
