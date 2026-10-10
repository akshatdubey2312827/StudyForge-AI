import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";

interface PrintContextType {
  isPrinting: boolean;
  isPreparing: boolean;
  printNote: (options: { title: string }) => Promise<void>;
  registerDiagramPromise: (promise: Promise<unknown>) => void;
}

const PrintContext = createContext<PrintContextType>({
  isPrinting: false,
  isPreparing: false,
  printNote: async () => {},
  registerDiagramPromise: () => {},
});

export function PrintProvider({ children }: { children: React.ReactNode }) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const pendingPromisesRef = useRef<Set<Promise<unknown>>>(new Set());

  const registerDiagramPromise = useCallback((promise: Promise<unknown>) => {
    pendingPromisesRef.current.add(promise);
    promise.finally(() => {
      pendingPromisesRef.current.delete(promise);
    });
  }, []);

  const printNote = useCallback(async ({ title }: { title: string }) => {
    setIsPreparing(true);
    setIsPrinting(true);

    const root = document.documentElement;
    const disableFix =
      (typeof window !== "undefined" && (window as any).__DISABLE_PRINT_THEME_SWITCH__ === true) ||
      new URLSearchParams(window.location.search).get("disable_print_fix") === "true";

    const originalTitle = document.title;
    document.title = title ? `${title} — StudyForge AI` : "StudyForge AI Notes";
    root.classList.add("print-mode");

    const wasDark = root.classList.contains("dark") || themeRef.current === "dark";
    const originalColorScheme = root.style.colorScheme;

    if (!disableFix) {
      root.style.colorScheme = "light";
      if (wasDark) {
        root.classList.remove("dark");
      }
    }

    let isCleanedUp = false;
    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      document.title = originalTitle;
      root.classList.remove("print-mode");
      if (!disableFix) {
        root.style.colorScheme = originalColorScheme || (wasDark ? "dark" : "light");
        if (wasDark) {
          root.classList.add("dark");
        }
      }
      setIsPrinting(false);
      setIsPreparing(false);
      window.removeEventListener("afterprint", cleanup);
      window.removeEventListener("focus", handleFocus);
    };

    const handleFocus = () => {
      // If the user cancelled or closed the print dialog and focus returned
      setTimeout(cleanup, 400);
    };

    const mermaidContainers = document.querySelectorAll(".mermaid-container");
    mermaidContainers.forEach((el) => el.removeAttribute("data-mermaid-rendered"));

    // Wait until every Mermaid diagram has finished rendering in light theme
    // and every chart has mounted with explicit width (await the actual render promises)
    const waitForRenders = async () => {
      // Allow React to process state updates and kick off re-render cycles
      await new Promise((r) => setTimeout(r, 80));

      // 1. Await all currently registered Mermaid render promises
      const initialPromises = Array.from(pendingPromisesRef.current);
      if (initialPromises.length > 0) {
        await Promise.allSettled(initialPromises);
      }

      // 2. Poll until DOM is confirmed ready: all Mermaid SVGs rendered, all Recharts SVGs/containers mounted
      const startTime = Date.now();
      while (Date.now() - startTime < 4800) {
        if (pendingPromisesRef.current.size > 0) {
          await Promise.allSettled(Array.from(pendingPromisesRef.current));
        }

        const mermaidContainers = document.querySelectorAll(".mermaid-container");
        const allMermaidReady = Array.from(mermaidContainers).every(
          (el) =>
            el.getAttribute("data-mermaid-rendered") === "true" ||
            el.querySelector("svg") !== null ||
            el.querySelector(".chart-fallback") !== null
        );

        const rechartsContainers = document.querySelectorAll(".recharts-responsive-container");
        const allChartsReady = Array.from(rechartsContainers).every((el) => {
          const rect = el.getBoundingClientRect();
          const hasSvg = el.querySelector("svg") !== null;
          return (rect.width > 0 && hasSvg) || el.closest(".chart-fallback") !== null;
        });

        if (allMermaidReady && allChartsReady) {
          // Extra frame for full SVG style and layout stabilization
          await new Promise((r) => requestAnimationFrame(r));
          return;
        }

        await new Promise((r) => setTimeout(r, 40));
      }
    };

    try {
      // Safety cap: at most 5000ms
      await Promise.race([
        waitForRenders(),
        new Promise((r) => setTimeout(r, 5000)),
      ]);
      setIsPreparing(false);

      // Attach afterprint and focus listeners ONLY after preparation is complete and right before print()
      // A focus/blur event during the preparation phase must NOT restore the theme early!
      window.addEventListener("afterprint", cleanup, { once: true });
      window.addEventListener("focus", handleFocus, { once: true });

      window.print();
    } catch (err) {
      console.error("Print execution failed:", err);
      cleanup();
    }

    // Fallback cleanup in case afterprint doesn't fire
    setTimeout(cleanup, 60000);
  }, []);

  return (
    <PrintContext.Provider
      value={{
        isPrinting,
        isPreparing,
        printNote,
        registerDiagramPromise,
      }}
    >
      {children}
    </PrintContext.Provider>
  );
}

export function usePrint() {
  return useContext(PrintContext);
}
