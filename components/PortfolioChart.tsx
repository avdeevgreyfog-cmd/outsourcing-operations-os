"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";

type PortfolioRow = { object: string; revenue: number; contribution: number };
const compactRub = (value: number) => new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(value) + " ₽";
const fullRub = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value) + " ₽";

export function PortfolioChart({ rows }: { rows: PortfolioRow[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const node = ref.current;
    const chart = echarts.init(node, undefined, { renderer: "canvas" });
    const draw = () => {
      const css = getComputedStyle(document.documentElement);
      const text = css.getPropertyValue("--text").trim();
      const muted = css.getPropertyValue("--muted").trim();
      const border = css.getPropertyValue("--border").trim();
      const accent = css.getPropertyValue("--accent").trim();
      const good = css.getPropertyValue("--good").trim();
      const panel = css.getPropertyValue("--panel").trim();
      const margins = rows.map((row) => row.revenue ? row.contribution / row.revenue * 100 : 0);
      chart.setOption({
        animationDuration: 280,
        aria: { enabled: true, description: "Сравнение выручки и contribution margin по объектам" },
        color: [accent, good],
        grid: { left: 18, right: 28, top: 50, bottom: 18, containLabel: true },
        tooltip: {
          trigger: "axis",
          backgroundColor: panel,
          borderColor: border,
          borderWidth: 1,
          textStyle: { color: text, fontSize: 11 },
          axisPointer: { type: "shadow", shadowStyle: { color: css.getPropertyValue("--panel-2").trim() } },
          formatter: (params: unknown) => {
            const items = params as Array<{ dataIndex: number; marker: string; seriesName: string; value: number }>;
            const index = items[0]?.dataIndex ?? 0;
            return `<strong>${rows[index]?.object ?? ""}</strong><br/>Выручка: ${fullRub(rows[index]?.revenue ?? 0)}<br/>Вклад в прибыль: ${fullRub(rows[index]?.contribution ?? 0)}<br/>Маржа: ${margins[index]?.toFixed(1) ?? "0"}%`;
          },
        },
        legend: { top: 4, left: 4, itemWidth: 13, itemHeight: 7, textStyle: { color: muted, fontSize: 10 }, data: ["Выручка", "Маржинальность"] },
        xAxis: { type: "category", data: rows.map((row) => row.object), axisLine: { lineStyle: { color: border } }, axisTick: { show: false }, axisLabel: { color: muted, fontSize: 10, interval: 0, width: 94, overflow: "truncate" } },
        yAxis: [
          { type: "value", name: "₽", nameTextStyle: { color: muted, fontSize: 10 }, splitLine: { lineStyle: { color: border } }, axisLabel: { color: muted, fontSize: 9, formatter: (value: number) => compactRub(value).replace(" ₽", "") } },
          { type: "value", name: "%", min: 0, max: Math.max(30, Math.ceil(Math.max(...margins, 0) / 5) * 5), nameTextStyle: { color: muted, fontSize: 10 }, splitLine: { show: false }, axisLabel: { color: muted, fontSize: 9, formatter: "{value}%" } },
        ],
        series: [
          { name: "Выручка", type: "bar", data: rows.map((row) => row.revenue), barMaxWidth: 30, itemStyle: { color: accent, borderRadius: [3, 3, 0, 0] } },
          { name: "Маржинальность", type: "line", yAxisIndex: 1, smooth: 0.25, showSymbol: true, symbolSize: 6, data: margins.map((value) => Number(value.toFixed(2))), lineStyle: { color: good, width: 2 }, itemStyle: { color: good }, emphasis: { focus: "series" } },
        ],
      }, true);
    };
    draw();
    const resize = () => chart.resize();
    const themeObserver = new MutationObserver(draw);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); themeObserver.disconnect(); chart.dispose() };
  }, [rows]);
  return <div ref={ref} className="chart-box"/>;
}
