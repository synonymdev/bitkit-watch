/* Charts module. Dependencies are supplied by app.js; state access is explicit. */
((root) => {
  "use strict";
  function create({
    escapeHtml,
    formatCompactDecimal,
    formatDisplayFiatValue,
    formatWalletBtc,
    getChartLineDownIconMarkup,
    getChartLineFlatIconMarkup,
    getChartLineUpIconMarkup,
    getDisplayUnit,
    getState,
    normalizeChartRange,
    normalizeDisplayedGrowthPercent
  }) {
    function sampleSeriesPoints(points, maxPoints) {
      const source = Array.isArray(points) ? points : [];
      const limit = Math.max(2, Math.floor(Number(maxPoints) || 0));
      if (source.length <= limit) {
        return source;
      }

      const sampled = [];
      const step = (source.length - 1) / (limit - 1);
      for (let index = 0; index < limit; index += 1) {
        sampled.push(source[Math.round(index * step)]);
      }
      return sampled;
    }

    function createWalletCardMiniChartScene({ key, values, width = 464, height = 152 }) {
      const normalizedValues = normalizeSeriesValues(values);
      if (!normalizedValues.some(Number.isFinite)) {
        return null;
      }

      const tone = getSparklineTone(normalizedValues);
      const palette = getSparklinePalette(tone);
      const leftInset = 0;
      const rightInset = 0;
      const topInset = 6;
      const plotBottom = height - 1;
      const plotWidth = Math.max(1, width - leftInset - rightInset);
      const plotHeight = Math.max(1, plotBottom - topInset);
      const min = Math.min(...normalizedValues.filter(Number.isFinite));
      const max = Math.max(...normalizedValues.filter(Number.isFinite));
      const range = max - min;
      const paddedMin = range === 0 ? min : min - range * 0.08;
      const paddedMax = range === 0 ? max : max + range * 0.12;
      const paddedRange = paddedMax - paddedMin;
      const points = normalizedValues.map((value, index) => {
        if (!Number.isFinite(value)) return null;
        const x =
          normalizedValues.length === 1
            ? leftInset + plotWidth / 2
            : leftInset + (index / (normalizedValues.length - 1)) * plotWidth;
        const y =
          paddedRange === 0
            ? topInset + plotHeight * 0.72
            : plotBottom - ((value - paddedMin) / paddedRange) * plotHeight;
        return { x, y };
      });

      const safeKey = escapeHtml(String(key || "wallet-card-chart").replace(/[^a-z0-9-]/gi, "-"));
      const { line: linePath, area: areaPath } = buildChartPaths(points, plotBottom);

      return {
        tone,
        markup: `
          <svg class="wallet-card-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="presentation">
            <defs>
              <linearGradient id="wallet-card-line-${safeKey}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="${palette.lineStart}"></stop>
                <stop offset="100%" stop-color="${palette.lineEnd}"></stop>
              </linearGradient>
              <linearGradient id="wallet-card-fill-${safeKey}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="${palette.fillStart}"></stop>
                <stop offset="100%" stop-color="${palette.fillEnd}"></stop>
              </linearGradient>
            </defs>
            <path d="${areaPath}" fill="url(#wallet-card-fill-${safeKey})"></path>
            <path
              d="${linePath}"
              fill="none"
              stroke="url(#wallet-card-line-${safeKey})"
              stroke-width="2.25"
              stroke-linecap="round"
              stroke-linejoin="round"
            ></path>
          </svg>
        `,
      };
    }

    function createSparklineScene(chartDisplay, { width = 352, height = 96 } = {}) {
      const values = Array.isArray(chartDisplay?.values) ? chartDisplay.values : [];
      const key = typeof chartDisplay?.key === "string" ? chartDisplay.key : "sparkline";
      const timestamps = Array.isArray(chartDisplay?.timestamps) ? chartDisplay.timestamps : [];
      const rangeLabel =
        typeof chartDisplay?.range === "string" ? chartDisplay.range : normalizeChartRange(getState().selectedRange);
      const normalizedValues = normalizeSeriesValues(values);
      if (!normalizedValues.some(Number.isFinite)) {
        return null;
      }

      const tone = getSparklineTone(normalizedValues);
      const palette = getSparklinePalette(tone);

      const leftInset = 0;
      const rightInset = 0;
      const topInset = 8;
      const bottomInset = 36;
      const plotWidth = Math.max(1, width - leftInset - rightInset);
      const plotBottom = height - bottomInset;
      const plotHeight = Math.max(1, plotBottom - topInset);
      const min = Math.min(...normalizedValues.filter(Number.isFinite));
      const max = Math.max(...normalizedValues.filter(Number.isFinite));
      const range = max - min;
      const points = normalizedValues.map((value, index) => {
        if (!Number.isFinite(value)) return null;
        const x =
          normalizedValues.length === 1
            ? leftInset + plotWidth / 2
            : leftInset + (index / (normalizedValues.length - 1)) * plotWidth;
        const y =
          range === 0
            ? topInset + plotHeight * 0.58
            : plotBottom - ((value - min) / range) * plotHeight;
        return { x, y };
      });

      const safeKey = escapeHtml(key.replace(/[^a-z0-9-]/gi, "-"));
      const { line: linePath, area: areaPath } = buildChartPaths(points, plotBottom);
      const yAxisLabels = buildSparklineYAxisLabels(min, max, topInset, plotBottom, range);
      const xAxisLabels = buildSparklineXAxisLabels(timestamps, rangeLabel, leftInset, plotWidth, height);

      return {
        width,
        height,
        leftInset,
        rightInset,
        topInset,
        plotBottom,
        plotWidth,
        rangeLabel,
        points,
        values: normalizedValues,
        timestamps,
        tone,
        markup: `
        <svg class="sparkline-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="presentation">
          <defs>
            <linearGradient id="line-${safeKey}" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="${palette.lineStart}"></stop>
              <stop offset="100%" stop-color="${palette.lineEnd}"></stop>
            </linearGradient>
            <linearGradient id="fill-${safeKey}" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="${palette.fillStart}"></stop>
              <stop offset="100%" stop-color="${palette.fillEnd}"></stop>
            </linearGradient>
          </defs>
          <line class="sparkline-axis-line" x1="${leftInset}" y1="${plotBottom}" x2="${width - rightInset}" y2="${plotBottom}"></line>
          ${yAxisLabels
            .map(
              (label) => `
                <line class="sparkline-guide-line" x1="${leftInset}" y1="${label.y}" x2="${width - rightInset}" y2="${label.y}"></line>
              `
            )
            .join("")}
          <path d="${areaPath}" fill="url(#fill-${safeKey})"></path>
          <path
            d="${linePath}"
            fill="none"
            stroke="url(#line-${safeKey})"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          ></path>
          ${xAxisLabels
            .map(
              (label) => `
                <text class="sparkline-axis-label sparkline-axis-label--x" x="${label.x}" y="${height - 4}" text-anchor="${label.anchor}">${escapeHtml(
                  label.text
                )}</text>
              `
            )
            .join("")}
        </svg>
        <div class="sparkline-interaction" data-role="sparkline-interaction" hidden>
          <div class="sparkline-hover-line" data-role="sparkline-hover-line"></div>
          <div class="sparkline-hover-dot" data-role="sparkline-hover-dot"></div>
          <div class="sparkline-tooltip" data-role="sparkline-tooltip">
            <span class="sparkline-tooltip-value" data-role="sparkline-tooltip-value"></span>
            <span class="sparkline-tooltip-time" data-role="sparkline-tooltip-time"></span>
          </div>
        </div>
      `,
      };
    }

    function bindSparklineInteraction(container, scene) {
      container.onpointerenter = null;
      container.onpointermove = null;
      container.onpointerleave = null;
      container.onpointerdown = null;
      container.onblur = null;
      container._sparklineScene = scene || null;

      if (!scene) {
        return;
      }

      const interaction = container.querySelector("[data-role='sparkline-interaction']");
      const guideLine = container.querySelector("[data-role='sparkline-hover-line']");
      const dot = container.querySelector("[data-role='sparkline-hover-dot']");
      const tooltip = container.querySelector("[data-role='sparkline-tooltip']");
      const tooltipValue = container.querySelector("[data-role='sparkline-tooltip-value']");
      const tooltipTime = container.querySelector("[data-role='sparkline-tooltip-time']");
      if (!interaction || !guideLine || !dot || !tooltip || !tooltipValue || !tooltipTime) {
        return;
      }

      const hideInteraction = () => {
        interaction.hidden = true;
      };

      const updateInteraction = (clientX) => {
        const rect = container.getBoundingClientRect();
        if (!rect.width || !rect.height) {
          hideInteraction();
          return;
        }

        const plotLeftPx = (scene.leftInset / scene.width) * rect.width;
        const plotWidthPx = (scene.plotWidth / scene.width) * rect.width;
        const localX = clamp(clientX - rect.left, plotLeftPx, plotLeftPx + plotWidthPx);
        const pointIndex =
          scene.points.length === 1
            ? 0
            : clamp(
                Math.round(((localX - plotLeftPx) / plotWidthPx) * (scene.points.length - 1)),
                0,
                scene.points.length - 1
              );
        const point = scene.points[pointIndex];
        if (!point) { hideInteraction(); return; }
        const pointX = (point.x / scene.width) * rect.width;
        const pointY = (point.y / scene.height) * rect.height;
        const lineTop = (scene.topInset / scene.height) * rect.height;
        const lineBottom = (scene.plotBottom / scene.height) * rect.height;

        tooltipValue.textContent = formatSparklineTooltipValue(scene.values[pointIndex]);
        tooltipTime.textContent = formatSparklineTooltipTimestamp(
          scene.timestamps[pointIndex],
          scene.rangeLabel
        );

        interaction.hidden = false;
        guideLine.style.left = `${pointX}px`;
        guideLine.style.top = `${lineTop}px`;
        guideLine.style.height = `${Math.max(0, lineBottom - lineTop)}px`;
        dot.style.left = `${pointX}px`;
        dot.style.top = `${pointY}px`;

        const tooltipWidth = tooltip.offsetWidth || 140;
        const tooltipHeight = tooltip.offsetHeight || 48;
        const clampedTooltipX = clamp(pointX, tooltipWidth / 2 + 8, rect.width - tooltipWidth / 2 - 8);
        const tooltipY = Math.max(8, pointY - tooltipHeight - 18);
        tooltip.style.left = `${clampedTooltipX}px`;
        tooltip.style.top = `${tooltipY}px`;
      };

      container.onpointerenter = (event) => {
        updateInteraction(event.clientX);
      };
      container.onpointermove = (event) => {
        updateInteraction(event.clientX);
      };
      container.onpointerdown = (event) => {
        updateInteraction(event.clientX);
      };
      container.onpointerleave = hideInteraction;
      container.onblur = hideInteraction;
    }

    function getSparklineTone(values) {
      const normalizedValues = normalizeSeriesValues(values).filter(Number.isFinite);
      if (!normalizedValues.length) {
        return "up";
      }

      return normalizedValues.at(-1) < normalizedValues[0] ? "down" : "up";
    }

    function getSparklinePalette(tone) {
      if (tone === "down") {
        return {
          lineStart: "rgba(255, 68, 0, 0.92)",
          lineEnd: "rgba(255, 68, 0, 0.35)",
          fillStart: "rgba(255, 68, 0, 0.32)",
          fillEnd: "rgba(255, 68, 0, 0)",
        };
      }

      return {
        lineStart: "rgba(125, 229, 147, 0.92)",
        lineEnd: "rgba(125, 229, 147, 0.35)",
        fillStart: "rgba(125, 229, 147, 0.38)",
        fillEnd: "rgba(125, 229, 147, 0)",
      };
    }

    function buildSparklineYAxisLabels(min, max, topY, bottomY, range) {
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return [];
      }

      if (range === 0) {
        return [
          {
            y: topY + (bottomY - topY) * 0.58,
          },
        ];
      }

      const stops = [0.75, 0.5, 0.25];
      return stops.map((stop) => ({
        y: topY + (bottomY - topY) * (1 - stop),
      }));
    }

    function buildSparklineXAxisLabels(timestamps, rangeLabel, leftInset, plotWidth, height) {
      if (!timestamps.length) {
        return [];
      }

      const indexes = uniqueNumbers(
        [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
          Math.max(0, Math.round((timestamps.length - 1) * ratio))
        )
      );

      return indexes.map((index, labelIndex) => {
        const ratio = timestamps.length === 1 ? 0.5 : index / (timestamps.length - 1);
        return {
          x: leftInset + ratio * plotWidth,
          anchor: labelIndex === 0 ? "start" : labelIndex === indexes.length - 1 ? "end" : "middle",
          text: formatChartXAxisLabel(timestamps[index], rangeLabel),
        };
      });
    }

    function formatChartXAxisLabel(timestamp, rangeLabel) {
      const date = new Date(timestamp);
      if (rangeLabel === "1D") {
        return new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(date);
      }

      if (rangeLabel === "30D") {
        return new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
        }).format(date);
      }

      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "numeric",
      }).format(date);
    }

    function formatSparklineTooltipValue(value) {
      if (getDisplayUnit() === "USD") {
        return formatDisplayFiatValue(value, getState().hideBalances);
      }

      return formatWalletBtc(value, getState().hideBalances);
    }

    function formatSparklineTooltipTimestamp(timestamp, rangeLabel) {
      if (!Number.isFinite(timestamp)) {
        return "";
      }

      const date = new Date(timestamp);
      if (rangeLabel === "1D") {
        return new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(date);
      }

      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function uniqueNumbers(values) {
      return [...new Set(values.filter((value) => Number.isFinite(value)))];
    }

    function buildSmoothPath(points) {
      if (!points.length) {
        return "";
      }

      if (points.length === 1) {
        return `M ${points[0].x} ${points[0].y}`;
      }

      let path = `M ${points[0].x} ${points[0].y}`;
      for (let index = 0; index < points.length - 1; index += 1) {
        const current = points[index];
        const next = points[index + 1];
        const controlX = (current.x + next.x) / 2;
        path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
      }
      return path;
    }

    function normalizeSeriesValues(values) {
      return (Array.isArray(values) ? values : []).map((value) => Number.isFinite(value) ? value : null);
    }

    function buildChartPaths(points, bottom) {
      const segments = [];
      let segment = [];
      for (const point of points) {
        if (point) segment.push(point);
        else if (segment.length) { segments.push(segment); segment = []; }
      }
      if (segment.length) segments.push(segment);
      return {
        line: segments.map(buildSmoothPath).join(" "),
        area: segments.map((part) => `${buildSmoothPath(part)} L ${part.at(-1).x} ${bottom} L ${part[0].x} ${bottom} Z`).join(" "),
      };
    }

    function getSeriesGrowthDescriptor(values) {
      if (!Array.isArray(values) || values.some((value) => !Number.isFinite(value))) return null;
      const series = values;
      if (!series.length) {
        return null;
      }

      const first = Number(series[0]);
      const last = Number(series.at(-1));
      if (!Number.isFinite(first) || !Number.isFinite(last)) {
        return null;
      }

      if (getState().hideBalances) {
        return null;
      }

      let percent = null;
      if (first === 0) {
        percent = last === 0 ? 0 : null;
      } else {
        percent = ((last - first) / Math.abs(first)) * 100;
      }

      if (!Number.isFinite(percent)) {
        return null;
      }

      const normalizedPercent = normalizeDisplayedGrowthPercent(percent);
      const sign = normalizedPercent > 0 ? "+" : "";
      const maximumFractionDigits = Math.abs(normalizedPercent) >= 100 ? 0 : 2;

      return {
        label: `${sign}${formatCompactDecimal(normalizedPercent, maximumFractionDigits)}%`,
        chartLabel: `${normalizedPercent >= 0 ? "+" : ""}${formatCompactDecimal(
          normalizedPercent,
          maximumFractionDigits
        )}%`,
        compactTitle: Math.abs(normalizedPercent) >= 1000,
        toneClass:
          normalizedPercent < 0
            ? "is-negative"
            : normalizedPercent > 0
              ? "is-confirmed"
              : "",
        icon:
          normalizedPercent === 0
            ? getChartLineFlatIconMarkup()
            : normalizedPercent < 0
              ? getChartLineDownIconMarkup()
              : getChartLineUpIconMarkup(),
      };
    }


    return {
      sampleSeriesPoints,
      createWalletCardMiniChartScene,
      createSparklineScene,
      bindSparklineInteraction,
      getSeriesGrowthDescriptor
    };
  }
  root.BITKIT_WATCH_CHARTS = { create };
  if (typeof module === "object" && module.exports) module.exports = { create };
})(globalThis);
