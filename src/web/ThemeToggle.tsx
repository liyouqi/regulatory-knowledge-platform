import { Moon, Sun } from "lucide-react";

export type ThemeMode = "dark" | "light";

export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: ThemeMode;
  onToggle: () => void;
}) {
  const light = theme === "light";
  return (
    <button
      aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
      aria-pressed={light}
      className="theme-toggle"
      onClick={onToggle}
      type="button"
    >
      {light ? (
        <Moon aria-hidden="true" size={15} />
      ) : (
        <Sun aria-hidden="true" size={15} />
      )}
      <span>{light ? "Dark" : "Light"}</span>
    </button>
  );
}
