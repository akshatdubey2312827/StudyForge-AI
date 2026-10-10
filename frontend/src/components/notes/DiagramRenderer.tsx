import React, { useEffect, useRef } from "react";
import mermaid from "mermaid";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { Diagram, RechartsData } from "@/types";
import { useTheme } from "@/hooks/useTheme";
import { usePrint } from "@/context/PrintContext";
import { cn } from "@/lib/utils";

const CHART_COLORS = [
  "#4f46e5", "#0284c7", "#d97706", "#059669", "#db2777", "#7c3aed",
];

function ChartFallback({ message = "Chart data unavailable" }: { message?: string }) {
  return (
    <div className="flex h-48 w-full items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/60 text-sm text-slate-400 dark:text-slate-500 print:bg-slate-50 print:border-slate-200 print:text-slate-500">
      {message}
    </div>
  );
}

/**
 * Safely parses data into RechartsData whether it was received as a structured object
 * or a JSON-encoded string from MongoDB.
 */
function normalizeRechartsData(rawData: unknown): RechartsData | null {
  if (!rawData) return null;
  let parsed = rawData;

  if (typeof rawData === "string") {
    try {
      parsed = JSON.parse(rawData);
    } catch {
      return null;
    }
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as any).keys) &&
    Array.isArray((parsed as any).values) &&
    (parsed as any).keys.length > 0 &&
    (parsed as any).values.length > 0
  ) {
    return parsed as RechartsData;
  }

  return null;
}

// ─── Mermaid Renderer ─────────────────────────────────────────────────────────
function MermaidDiagram({ source }: { source: string }) {
  const { theme } = useTheme();
  const { isPrinting, registerDiagramPromise } = usePrint();
  const isDark = !isPrinting && theme === "dark";
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isRendered, setIsRendered] = React.useState(false);

  useEffect(() => {
    let isCancelled = false;
    if (!ref.current || !source) return;

    setError(false);
    setErrorMessage(null);
    setIsRendered(false);

    // Initialize mermaid according to active mode (forced light during print export)
    if (isDark) {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        themeVariables: {
          background: "#0f172a",
          primaryColor: "#1e1b4b",
          primaryBorderColor: "#6366f1",
          primaryTextColor: "#f8fafc",
          lineColor: "#94a3b8",
          secondaryColor: "#1e293b",
          tertiaryColor: "#0f172a",
          mainBkg: "#1e1b4b",
          nodeBorder: "#6366f1",
          nodeTextColor: "#f8fafc",
          fontSize: "14px",
        },
      });
    } else {
      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        themeVariables: {
          background: "#ffffff",
          primaryColor: "#eef2ff",
          primaryBorderColor: "#6366f1",
          primaryTextColor: "#0f172a",
          lineColor: "#64748b",
          fontSize: "14px",
        },
      });
    }

    // Generate a fresh unique ID per render to prevent DOM ID collision and StrictMode race conditions
    const renderId = `mermaid-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    const cleanSource = source.trim();

    const renderPromise = mermaid
      .render(renderId, cleanSource)
      .then(({ svg }) => {
        if (isCancelled) return;
        if (!svg) {
          console.error("Mermaid rendered empty SVG");
          setError(true);
          return;
        }
        if (ref.current) {
          ref.current.innerHTML = svg;
          setIsRendered(true);
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error("Mermaid render error:", err);
        setError(true);
        setErrorMessage(err?.message || "Diagram could not be rendered");
      });

    registerDiagramPromise(renderPromise);

    return () => {
      isCancelled = true;
    };
  }, [source, isDark, isPrinting, registerDiagramPromise]);

  if (error || !source) {
    return <ChartFallback message={errorMessage || "Diagram could not be rendered"} />;
  }

  return (
    <div
      ref={ref}
      data-mermaid-rendered={isRendered}
      className="mermaid-container w-full overflow-auto print:overflow-visible flex justify-center py-2"
    />
  );
}

// ─── Recharts Bar ─────────────────────────────────────────────────────────────
function RechartsBar({ data }: { data: unknown }) {
  const { theme } = useTheme();
  const { isPrinting } = usePrint();
  const isDark = !isPrinting && theme === "dark";
  const chartData = normalizeRechartsData(data);

  if (!chartData) {
    return <ChartFallback />;
  }

  return (
    <div data-chart-rendered="true" className="w-full flex justify-center overflow-visible">
      <ResponsiveContainer className="recharts-responsive-container" width={isPrinting ? 620 : "100%"} height={260}>
        <BarChart data={chartData.values} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#f1f5f9"} />
          <XAxis
            dataKey="name"
            tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 11 }}
            angle={-35}
            textAnchor="end"
          />
          <YAxis tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: isDark ? "#0f172a" : "#ffffff",
              border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
              borderRadius: 8,
              color: isDark ? "#f8fafc" : "#0f172a",
              boxShadow: isDark ? "0 4px 6px -1px rgb(0 0 0 / 0.5)" : "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
            labelStyle={{ color: isDark ? "#f8fafc" : "#0f172a", fontWeight: "bold" }}
          />
          {chartData.keys.map((key, i) => (
            <Bar key={key} dataKey={key} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Recharts Pie ─────────────────────────────────────────────────────────────
function RechartsPie({ data }: { data: unknown }) {
  const { theme } = useTheme();
  const { isPrinting } = usePrint();
  const isDark = !isPrinting && theme === "dark";
  const chartData = normalizeRechartsData(data);

  if (!chartData) {
    return <ChartFallback />;
  }

  const valueKey = chartData.keys[0] || "value";

  return (
    <div data-chart-rendered="true" className="w-full flex justify-center overflow-visible">
      <ResponsiveContainer className="recharts-responsive-container" width={isPrinting ? 620 : "100%"} height={260}>
        <PieChart>
          <Pie
            data={chartData.values}
            cx="50%"
            cy="50%"
            outerRadius={95}
            dataKey={valueKey}
            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
            labelLine={{ stroke: isDark ? "#64748b" : "#94a3b8" }}
          >
            {chartData.values.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: isDark ? "#0f172a" : "#ffffff",
              border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
              borderRadius: 8,
              color: isDark ? "#f8fafc" : "#0f172a",
              boxShadow: isDark ? "0 4px 6px -1px rgb(0 0 0 / 0.5)" : "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
          />
          <Legend wrapperStyle={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Recharts Line ────────────────────────────────────────────────────────────
function RechartsLine({ data }: { data: unknown }) {
  const { theme } = useTheme();
  const { isPrinting } = usePrint();
  const isDark = !isPrinting && theme === "dark";
  const chartData = normalizeRechartsData(data);

  if (!chartData) {
    return <ChartFallback />;
  }

  return (
    <div data-chart-rendered="true" className="w-full flex justify-center overflow-visible">
      <ResponsiveContainer className="recharts-responsive-container" width={isPrinting ? 620 : "100%"} height={260}>
        <LineChart data={chartData.values} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#f1f5f9"} />
          <XAxis
            dataKey="name"
            tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 11 }}
            angle={-35}
            textAnchor="end"
          />
          <YAxis tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: isDark ? "#0f172a" : "#ffffff",
              border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
              borderRadius: 8,
              color: isDark ? "#f8fafc" : "#0f172a",
              boxShadow: isDark ? "0 4px 6px -1px rgb(0 0 0 / 0.5)" : "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
          />
          <Legend wrapperStyle={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: 12 }} />
          {chartData.keys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main DiagramRenderer ─────────────────────────────────────────────────────
interface DiagramRendererProps {
  diagram: Diagram;
  className?: string;
}

export function DiagramRenderer({ diagram, className }: DiagramRendererProps) {
  const { type, data, title } = diagram;

  const content = React.useMemo(() => {
    switch (type) {
      case "mermaid":
        return <MermaidDiagram source={typeof data === "string" ? data : String(data ?? "")} />;
      case "recharts_bar":
        return <RechartsBar data={data} />;
      case "recharts_pie":
        return <RechartsPie data={data} />;
      case "recharts_line":
        return <RechartsLine data={data} />;
      default:
        return <ChartFallback message={`Unsupported diagram type: ${type}`} />;
    }
  }, [type, data]);

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm dark:shadow-none transition-colors duration-150 print:border-slate-300 print:bg-white print:shadow-none print:break-inside-avoid print:p-4",
        className,
      )}
    >
      {title && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 print:text-slate-700">
          {title}
        </p>
      )}
      {content}
    </div>
  );
}
