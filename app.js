const STORAGE_KEY = "diabetes-control-records-v1";
const DAILY_METRICS_KEY = "diabetes-control-daily-metrics-v1";
const DIGESTIVE_EVENTS_KEY = "diabetes-control-digestive-events-v1";
const STRESS_EVENTS_KEY = "diabetes-control-stress-events-v1";
const CLOSURE_KEY = "diabetes-control-last-closure";

const DEFAULT_TIMES = {
  lunch: "13:30",
  dinner: "21:30",
};

const MEAL_LABELS = {
  lunch: "Almuerzo",
  dinner: "Cena",
};

const state = {
  records: loadRecords(),
  dailyMetrics: loadDailyMetrics(),
  digestiveEvents: loadDigestiveEvents(),
  stressEvents: loadStressEvents(),
  showAllDailyMetrics: false,
  showAllDigestiveEvents: false,
  showAllStressEvents: false,
  showAllTimeline: false,
  showAllHistory: false,
  showAllRepeatedFood: false,
  insightsMonth: "all",
  monthlyMetricsChartOpen: false,
  monthlyMetricsChartMonth: "",
};

const elements = {
  todayLabel: document.getElementById("today-label"),
  notice: document.getElementById("notice"),
  statsGrid: document.getElementById("stats-grid"),
  dailyMetricsSummary: document.getElementById("daily-metrics-summary"),
  monthlyMetricsChartShell: document.getElementById("monthly-metrics-chart-shell"),
  insightsGrid: document.getElementById("insights-grid"),
  dailyMetricsBoard: document.getElementById("daily-metrics-board"),
  digestiveEventsBoard: document.getElementById("digestive-events-board"),
  stressEventsBoard: document.getElementById("stress-events-board"),
  timelineChart: document.getElementById("timeline-chart"),
  timelineMoreShell: document.getElementById("timeline-more-shell"),
  mealBreakdown: document.getElementById("meal-breakdown"),
  repeatedFoodRanking: document.getElementById("repeated-food-ranking"),
  missingSummary: document.getElementById("missing-summary"),
  historyBody: document.getElementById("history-body"),
  historyMoreShell: document.getElementById("history-more-shell"),
  exportButton: document.getElementById("export-button"),
  forceCloseButton: document.getElementById("force-close-button"),
  glucoseStart: document.getElementById("glucose-start"),
  glucoseEnd: document.getElementById("glucose-end"),
  glucoseCalculatorResult: document.getElementById("glucose-calculator-result"),
  foodPredictionInput: document.getElementById("food-prediction-input"),
  foodPredictionShell: document.getElementById("food-prediction-shell"),
  foodPredictionResult: document.getElementById("food-prediction-result"),
  dailyMetricsForm: document.getElementById("daily-metrics-form"),
  dailyMetricsMeta: document.getElementById("daily-metrics-meta"),
  dailyMetricsCancel: document.getElementById("daily-metrics-cancel"),
  digestiveEventSave: document.getElementById("digestive-event-save"),
  digestiveEventMeta: document.getElementById("digestive-event-meta"),
  stressEventSave: document.getElementById("stress-event-save"),
  stressEventMeta: document.getElementById("stress-event-meta"),
  filterFrom: document.getElementById("filter-from"),
  filterTo: document.getElementById("filter-to"),
  filterTolerance: document.getElementById("filter-tolerance"),
  historyTemplate: document.getElementById("history-row-template"),
  forms: {
    lunch: document.querySelector('[data-meal-form="lunch"]'),
    dinner: document.querySelector('[data-meal-form="dinner"]'),
  },
  toleranceForms: {
    lunch: document.querySelector('[data-tolerance-form="lunch"]'),
    dinner: document.querySelector('[data-tolerance-form="dinner"]'),
  },
  formMeta: {
    lunch: document.querySelector('[data-form-meta="lunch"]'),
    dinner: document.querySelector('[data-form-meta="dinner"]'),
  },
  toleranceMeta: {
    lunch: document.querySelector('[data-tolerance-meta="lunch"]'),
    dinner: document.querySelector('[data-tolerance-meta="dinner"]'),
  },
  cancelEditButtons: {
    lunch: document.querySelector('[data-cancel-edit="lunch"]'),
    dinner: document.querySelector('[data-cancel-edit="dinner"]'),
  },
  cancelToleranceButtons: {
    lunch: document.querySelector('[data-cancel-tolerance-edit="lunch"]'),
    dinner: document.querySelector('[data-cancel-tolerance-edit="dinner"]'),
  },
};

initialize();

function initialize() {
  runDailyClosure();
  bindEvents();
  closeRecordModal();
  updateGlucoseCalculator();
  updateFoodPrediction();
  render();
}

function updateGlucoseCalculator() {
  const start = Number(elements.glucoseStart.value);
  const end = Number(elements.glucoseEnd.value);
  const result = elements.glucoseCalculatorResult;

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    result.className = "glucose-calculator-result tone-neutral";
    result.innerHTML = "<strong>Esperando valores</strong><span>Esta calculadora solo muestra el detalle del pico y no guarda datos.</span>";
    return;
  }

  const difference = end - start;

  if (difference <= 0) {
    result.className = "glucose-calculator-result tone-neutral";
    result.innerHTML = `<strong>Sin subida</strong><span>La diferencia es de ${Math.abs(difference)} mg/dL. No se detecta un pico positivo.</span>`;
    return;
  }

  let tone = "tone-green";
  let label = "Subida estable";

  if (difference > 100) {
    tone = "tone-red";
    label = "Pico alto";
  } else if (difference >= 61) {
    tone = "tone-yellow";
    label = "Pico moderado";
  }

  result.className = `glucose-calculator-result ${tone}`;
  result.innerHTML = `<strong>${label}: +${difference} mg/dL</strong><span>Inicial ${start} mg/dL, final ${end} mg/dL.</span>`;
}

function updateFoodPrediction() {
  const input = elements.foodPredictionInput;
  const shell = elements.foodPredictionShell;
  const result = elements.foodPredictionResult;

  if (!input || !shell || !result) {
    return;
  }

  const prediction = predictMealTolerance(input.value, state.records);
  shell.className = `food-prediction-field ${prediction.tone}`;
  result.className = `food-prediction-result ${prediction.tone}`;
  result.innerHTML = `<strong>${prediction.title}</strong><span>${prediction.description}</span>`;
}

function predictMealTolerance(mealText, records) {
  const normalizedMeal = normalizeMealSearchText(mealText);
  const compactMeal = normalizeMealComparisonText(mealText);

  if (!normalizedMeal) {
    return {
      tone: "tone-neutral",
      title: "Esperando una comida",
      description: "La sugerencia se basa en tus comidas registradas y solo sirve como referencia visual.",
    };
  }

  const comparableRecords = records.filter((record) => (
    record.status === "recorded"
    && typeof record.mealText === "string"
    && record.mealText.trim()
    && ["verde", "amarillo", "rojo"].includes(record.tolerance)
  ));

  if (!comparableRecords.length) {
    return {
      tone: "tone-neutral",
      title: "Sin historial suficiente",
      description: "Todavia no hay comidas con tolerancia registrada para comparar esta opcion.",
    };
  }

  const inputKeywords = extractMealKeywords(mealText);
  const weights = { verde: 0, amarillo: 0, rojo: 0 };
  const sources = { verde: 0, amarillo: 0, rojo: 0 };
  let exactMatches = 0;
  let keywordMatches = 0;

  comparableRecords.forEach((record) => {
    const recordNormalized = normalizeMealSearchText(record.mealText);
    const recordCompact = normalizeMealComparisonText(record.mealText);
    const recordKeywords = extractMealKeywords(record.mealText);
    let score = 0;

    if (recordCompact && recordCompact === compactMeal) {
      score += 3.4;
      exactMatches += 1;
    }

    if (
      recordCompact
      && compactMeal
      && recordCompact !== compactMeal
      && (
        recordCompact.includes(compactMeal)
        || compactMeal.includes(recordCompact)
      )
    ) {
      score += 1.8;
    }

    const overlapCount = countKeywordOverlap(inputKeywords, recordKeywords);
    if (overlapCount > 0) {
      const overlapShare = overlapCount / Math.max(inputKeywords.length, recordKeywords.length, 1);
      score += 0.9 + (overlapShare * 1.6);
      keywordMatches += 1;
    }

    if (score <= 0) {
      return;
    }

    weights[record.tolerance] += score;
    sources[record.tolerance] += 1;
  });

  const totalWeight = weights.verde + weights.amarillo + weights.rojo;
  if (totalWeight <= 0) {
    return {
      tone: "tone-neutral",
      title: "Sin coincidencias claras",
      description: "No encontre comidas parecidas en tu historial como para sugerir un color confiable.",
    };
  }

  const ordered = [
    { key: "verde", weight: weights.verde, sources: sources.verde },
    { key: "amarillo", weight: weights.amarillo, sources: sources.amarillo },
    { key: "rojo", weight: weights.rojo, sources: sources.rojo },
  ].sort((left, right) => right.weight - left.weight);

  const top = ordered[0];
  const runnerUp = ordered[1];
  const share = top.weight / totalWeight;
  const mixedSignal = runnerUp.weight > 0 && Math.abs(top.weight - runnerUp.weight) / totalWeight < 0.16;
  const cautiousWinner = top.key !== "amarillo" && (share < 0.52 || mixedSignal);
  const finalKey = cautiousWinner ? "amarillo" : top.key;

  const config = {
    verde: {
      tone: "tone-green",
      title: "Tendencia favorable",
      detail: "Se parece mas a comidas que te dieron buena tolerancia.",
    },
    amarillo: {
      tone: "tone-yellow",
      title: "Tendencia intermedia",
      detail: "Hay senales mixtas o poca evidencia; conviene tomarlo con cautela.",
    },
    rojo: {
      tone: "tone-red",
      title: "Tendencia sensible",
      detail: "Se parece mas a comidas que en tu historial salieron peor.",
    },
  };

  const evidenceBits = [];
  if (exactMatches > 0) {
    evidenceBits.push(`${exactMatches} coincidencia(s) casi exacta(s)`);
  }
  if (keywordMatches > 0) {
    evidenceBits.push(`${keywordMatches} registro(s) con ingredientes parecidos`);
  }

  const label = config[finalKey];
  const evidenceText = evidenceBits.length ? ` Referencia: ${evidenceBits.join(" y ")}.` : "";

  return {
    tone: label.tone,
    title: label.title,
    description: `${label.detail} Base actual: ${top.sources} registro(s) relevantes en ${top.key}.${evidenceText}`,
  };
}

function saveTolerance(mealType) {
  const form = elements.toleranceForms[mealType];
  const now = new Date();
  const editingRecordId = form.dataset.editingRecordId || "";
  const editingRecord = editingRecordId ? findRecordById(editingRecordId) : null;
  const recordDate = editingRecord?.recordDate || form.dataset.recordDate || getActiveMealRecordDate(mealType) || getLocalDateKey(now);
  const record = editingRecord || findRecordForDate(recordDate, mealType);

  if (!record) {
    setNotice(`Primero guarda el ${MEAL_LABELS[mealType].toLowerCase()} antes de registrar tolerancia.`);
    return;
  }

  if (record.status === "missing") {
    setNotice('No se puede asignar tolerancia a un registro marcado como "no registro nada".');
    return;
  }

  record.tolerance = form.elements.tolerance.value;
  record.toleranceUpdatedAt = now.toISOString();
  record.updatedAt = record.toleranceUpdatedAt;

  upsertRecord(record);
  clearEditState(form);

  setNotice(`Tolerancia de ${MEAL_LABELS[mealType].toLowerCase()} actualizada para ${formatDate(record.recordDate)}.`);
  render();
}

function runDailyClosure(options = {}) {
  const now = new Date();
  const previousDay = shiftDate(now, -1);
  const storedLastClosure = localStorage.getItem(CLOSURE_KEY);
  const lastClosure = isValidDateKey(storedLastClosure) ? storedLastClosure : null;
  const endKey = options.forceDateKey || getLocalDateKey(previousDay);
  const derivedStartKey = lastClosure ? null : deriveClosureStartKey(endKey);
  const todayKey = getLocalDateKey(now);
  const isManualTodayClosure = options.forceDateKey === todayKey;

  if (storedLastClosure && !lastClosure) {
    localStorage.removeItem(CLOSURE_KEY);
  }

  if (!options.forceDateKey && lastClosure === endKey) {
    return { createdCount: 0, skippedFutureMeals: 0, touchedDates: [] };
  }

  const datesToClose = collectDatesToClose(lastClosure, endKey, derivedStartKey);
  if (!datesToClose.length) {
    return { createdCount: 0, skippedFutureMeals: 0, touchedDates: [] };
  }

  let changed = false;
  let createdCount = 0;
  let skippedFutureMeals = 0;
  const touchedDates = [];
  datesToClose.forEach((dateKey) => {
    const eligibleMeals = getMealsEligibleForClosure(dateKey, now, options);
    skippedFutureMeals += Object.keys(DEFAULT_TIMES).length - eligibleMeals.length;

    if (eligibleMeals.length) {
      touchedDates.push(dateKey);
    }

    eligibleMeals.forEach((mealType) => {
      if (findRecordForDate(dateKey, mealType)) {
        return;
      }

      const closureTimestamp = combineLocalDateAndTime(dateKey, DEFAULT_TIMES[mealType]).toISOString();
      state.records.push({
        id: createRecordId(),
        mealType,
        mealText: "No registró nada",
        tolerance: null,
        toleranceUpdatedAt: null,
        scheduledTime: DEFAULT_TIMES[mealType],
        recordDate: dateKey,
        createdAt: closureTimestamp,
        updatedAt: closureTimestamp,
        status: "missing",
      });
      changed = true;
      createdCount += 1;
    });
  });

  if (!isManualTodayClosure) {
    localStorage.setItem(CLOSURE_KEY, endKey);
  }
  if (changed) {
    persistRecords();
  }

  return { createdCount, skippedFutureMeals, touchedDates };
}

function render() {
  elements.todayLabel.textContent = formatDate(getLocalDateKey(new Date()));
  renderForms();
  renderDailyMetricsForm();
  renderStats();
  renderHistory();
  updateFoodPrediction();
}

function renderDailyMetricsForm() {
  const form = elements.dailyMetricsForm;
  if (!form) {
    return;
  }

  const editingMetric = form.dataset.editingMetricId ? findDailyMetricById(form.dataset.editingMetricId) : null;
  const todayKey = getLocalDateKey(new Date());

  if (editingMetric) {
    form.elements.metricDate.value = editingMetric.metricDate;
    form.elements.timeInRange.value = editingMetric.timeInRange;
    form.elements.averageGlucose.value = editingMetric.averageGlucose;
    elements.dailyMetricsMeta.textContent = `Editando indicadores del ${formatDate(editingMetric.metricDate)}. Se actualiza el mismo dia sin duplicarlo.`;
    return;
  }

  const selectedDate = form.elements.metricDate.value || todayKey;
  const existingMetric = findDailyMetricByDate(selectedDate);
  form.elements.metricDate.value = selectedDate;
  form.elements.timeInRange.value = existingMetric?.timeInRange ?? "";
  form.elements.averageGlucose.value = existingMetric?.averageGlucose ?? "";
  elements.dailyMetricsMeta.textContent = existingMetric
    ? `Ya existe un indicador para ${formatDate(selectedDate)}. Si guardas, se actualiza.`
    : "Este registro es independiente de almuerzo y cena. Puede tener otra fecha y se exporta en JSON.";
}

function renderStats() {
  const stats = computeStats(state.records);
  const dailyMetricStats = computeDailyMetricStats(state.dailyMetrics);
  const insights = computeInsightsSafely(state.records, state.dailyMetrics);

  elements.statsGrid.innerHTML = [
    createStatCard("Total de registros", String(stats.totalRecords)),
    createStatCard("Verdes", `${stats.counts.verde} (${stats.percentages.verde}%)`),
    createStatCard("Amarillos", `${stats.counts.amarillo} (${stats.percentages.amarillo}%)`),
    createStatCard("Rojos", `${stats.counts.rojo} (${stats.percentages.rojo}%)`),
    createStatCard("Pendientes", String(stats.pendingCount)),
  ].join("");
  elements.dailyMetricsSummary.innerHTML = [
    createMetricSummaryCard(
      "Promedio tiempo en rango",
      dailyMetricStats.averageTimeInRangeDisplay,
      `${dailyMetricStats.inTargetDays}/${dailyMetricStats.totalDays} día(s) en objetivo`,
      getTimeInRangeTone(dailyMetricStats.averageTimeInRange)
    ),
    createMetricSummaryCard(
      "Promedio glucosa media",
      dailyMetricStats.averageGlucoseDisplay,
      `${dailyMetricStats.glucoseInTargetDays}/${dailyMetricStats.totalDays} día(s) dentro de meta`,
      getAverageGlucoseTone(dailyMetricStats.averageGlucose)
    ),
    createMetricSummaryCard(
      "Cobertura diaria",
      String(dailyMetricStats.totalDays),
      "Registros diarios independientes exportados en JSON",
      dailyMetricStats.totalDays ? { background: "rgba(115, 184, 255, 0.9)", color: "#06111d" } : { background: "rgba(148, 163, 184, 0.7)", color: "#06111d" }
    ),
  ].join("");

  renderMonthlyMetricsChart(dailyMetricStats.sortedMetrics);
  renderInsights(insights, state.dailyMetrics);
  renderTimeline(stats.timeline);
  renderMealBreakdown(stats.breakdownByMeal, insights.mealComparison || createEmptyMealComparison());
  renderRepeatedFoodRanking(computeRepeatedFoodRanking(state.records));
  renderMissingSummary(stats.missingCount);
  renderDailyMetricsBoard(dailyMetricStats.sortedMetrics);
  renderDigestiveEventsBoard(sortDigestiveEvents(state.digestiveEvents));
  renderStressEventsBoard(sortStressEvents(state.stressEvents));
}

function renderInsights(insights, dailyMetrics) {
  if (!elements.insightsGrid) {
    return;
  }

  const monthOptions = getAvailableMetricMonths(dailyMetrics);
  if (state.insightsMonth !== "all" && !monthOptions.includes(state.insightsMonth)) {
    state.insightsMonth = "all";
  }

  const selectedMetrics = filterMetricsByMonth(dailyMetrics, state.insightsMonth);
  const selectedVariability = computeGlucoseVariability(selectedMetrics);
  const selectedHighlights = computeControlHighlights(selectedMetrics);
  const selectedMonthLabel = state.insightsMonth === "all" ? "Total" : formatMonthKey(state.insightsMonth);
  const monthSelectMarkup = `
    <label class="insight-month-filter">
      <span>Ver</span>
      <select data-insights-month-select>
        <option value="all"${state.insightsMonth === "all" ? " selected" : ""}>Total</option>
        ${monthOptions.map((monthKey) => (
          `<option value="${monthKey}"${state.insightsMonth === monthKey ? " selected" : ""}>${formatMonthKey(monthKey)}</option>`
        )).join("")}
      </select>
    </label>
  `;

  const weeklyMarkup = insights.weeklyComparison.hasComparison
    ? `
      <div class="insight-stack">
        <div class="insight-line">
          <span>Tiempo en rango</span>
          <strong>${insights.weeklyComparison.currentTimeInRangeDisplay}</strong>
        </div>
        <div class="insight-line insight-line-detail">
          <span>7 dias previos</span>
          <span>${insights.weeklyComparison.previousTimeInRangeDisplay}</span>
        </div>
        <div class="insight-trend ${insights.weeklyComparison.timeInRangeDirection}">
          ${insights.weeklyComparison.timeInRangeDeltaLabel}
        </div>
        <div class="insight-line">
          <span>Glucosa media</span>
          <strong>${insights.weeklyComparison.currentGlucoseDisplay}</strong>
        </div>
        <div class="insight-line insight-line-detail">
          <span>7 dias previos</span>
          <span>${insights.weeklyComparison.previousGlucoseDisplay}</span>
        </div>
        <div class="insight-trend ${insights.weeklyComparison.glucoseDirection}">
          ${insights.weeklyComparison.glucoseDeltaLabel}
        </div>
      </div>
    `
    : '<div class="empty-state">Se necesitan 14 indicadores diarios consecutivos para comparar dos semanas reales.</div>';

  elements.insightsGrid.innerHTML = `
    <article class="mini-panel neon-summary-mini insight-panel">
      <h3>Rachas de dias buenos</h3>
      <div class="mini-panel-body">
        <div class="insight-kpi-row">
          <div class="insight-kpi">
            <strong>${insights.streaks.greenDays}</strong>
            <span>Dias seguidos con tolerancia verde</span>
          </div>
          <div class="insight-kpi">
            <strong>${insights.streaks.timeInRangeDays}</strong>
            <span>Dias seguidos con TIR arriba de 70%</span>
          </div>
        </div>
        <div class="insight-line insight-line-detail">
          <span>Ultimo dia evaluado</span>
          <span>${insights.streaks.lastTrackedDayLabel}</span>
        </div>
      </div>
    </article>

    <article class="mini-panel neon-summary-mini insight-panel">
      <h3>Evolucion semanal</h3>
      <div class="mini-panel-body">
        ${weeklyMarkup}
      </div>
    </article>

    <article class="mini-panel neon-summary-mini insight-panel insight-panel-wide insight-panel-variability insight-panel-variability-${selectedVariability.tone}">
      <div class="insight-panel-heading">
        <h3>Variabilidad de glucosa</h3>
        ${monthSelectMarkup}
      </div>
      <div class="mini-panel-body">
        <div class="insight-line insight-line-detail">
          <span>Rango real</span>
          <span>${selectedVariability.rangeDisplay}</span>
        </div>
        <div class="insight-line insight-line-detail">
          <span>Glucosa media</span>
          <span>${selectedVariability.averageDisplay}</span>
        </div>
        <div class="insight-line insight-line-detail">
          <span>HbA1c aproximada</span>
          <span class="insight-a1c-pill" style="background:${selectedVariability.estimatedA1cTone.background};color:${selectedVariability.estimatedA1cTone.color};">
            ${selectedVariability.estimatedA1cDisplay}
          </span>
        </div>
        <div class="insight-line insight-line-detail">
          <span>Promedio tiempo en rango</span>
          <span class="insight-a1c-pill" style="background:${selectedVariability.averageTimeInRangeTone.background};color:${selectedVariability.averageTimeInRangeTone.color};">
            ${selectedVariability.averageTimeInRangeDisplay}
          </span>
        </div>
      </div>
    </article>

    <article class="mini-panel neon-summary-mini insight-panel insight-panel-day insight-panel-day-best">
      <h3>Mejor dia de control</h3>
      <div class="mini-panel-body">
        ${renderControlDayHighlight(selectedHighlights.bestDay, "Todavia no hay indicadores diarios para detectar el mejor dia.")}
      </div>
    </article>

    <article class="mini-panel neon-summary-mini insight-panel insight-panel-day insight-panel-day-worst">
      <h3>Peor dia de control</h3>
      <div class="mini-panel-body">
        ${renderControlDayHighlight(selectedHighlights.worstDay, "Todavia no hay indicadores diarios para detectar el peor dia.")}
      </div>
    </article>
  `;

  const monthSelect = elements.insightsGrid.querySelector("[data-insights-month-select]");
  if (monthSelect) {
    monthSelect.addEventListener("input", (event) => {
      state.insightsMonth = event.target.value || "all";
      render();
    });
  }
}

function renderControlDayHighlight(day, emptyMessage) {
  if (!day) {
    return `<div class="empty-state">${emptyMessage}</div>`;
  }

  return `
    <div class="insight-line">
      <span>Fecha</span>
      <strong>${formatDate(day.metricDate)}</strong>
    </div>
    <div class="insight-kpi-row">
      <div class="insight-kpi">
        <strong>${day.timeInRangeDisplay}</strong>
        <span>Tiempo en rango</span>
      </div>
      <div class="insight-kpi">
        <strong>${day.averageGlucoseDisplay}</strong>
        <span>Glucosa media</span>
      </div>
    </div>
  `;
}

function renderTimeline(timeline) {
  if (!timeline.length) {
    elements.timelineChart.innerHTML = '<div class="empty-state">Todavía no hay registros para mostrar tendencia.</div>';
    if (elements.timelineMoreShell) {
      elements.timelineMoreShell.innerHTML = "";
    }
    return;
  }

  const orderedTimeline = [...timeline].reverse();
  const visibleTimeline = state.showAllTimeline ? orderedTimeline : orderedTimeline.slice(0, 3);

  elements.timelineChart.innerHTML = visibleTimeline.map((item) => {
    const total = item.total || 1;
    const segments = [
      { name: "green", value: item.verde },
      { name: "yellow", value: item.amarillo },
      { name: "red", value: item.rojo },
      { name: "pending", value: item.pending },
      { name: "missing", value: item.missing },
    ];

    const bars = segments
      .map((segment) => `<span class="timeline-segment ${segment.name}" style="width: ${(segment.value / total) * 100}%"></span>`)
      .join("");

    return `
      <div class="timeline-row">
        <strong>${formatShortDate(item.date)}</strong>
        <div class="timeline-track">${bars}</div>
        <span>${item.total} registro(s)</span>
      </div>
    `;
  }).join("");

  if (!elements.timelineMoreShell) {
    return;
  }

  if (orderedTimeline.length <= 3) {
    elements.timelineMoreShell.innerHTML = "";
    return;
  }

  elements.timelineMoreShell.innerHTML = `
    <button class="table-action" data-action="toggle-timeline" type="button">
      ${state.showAllTimeline ? "Mostrar menos" : "Ver mas"}
    </button>
  `;

  elements.timelineMoreShell.querySelector('[data-action="toggle-timeline"]').addEventListener("click", () => {
    state.showAllTimeline = !state.showAllTimeline;
    renderStats();
  });
}

function renderMealBreakdown(breakdown, mealComparison) {
  elements.mealBreakdown.innerHTML = ["lunch", "dinner"].map((mealType) => {
    const item = breakdown[mealType];
    const comparison = mealComparison?.[mealType] || createMealComparisonBase();
    const rankLabel = mealComparison.bestMeal === mealType
      ? "Mejor franja"
      : mealComparison.worstMeal === mealType
        ? "Franja mas debil"
        : "Sin diferencia clara";
    const totalWithTolerance = item.verde + item.amarillo + item.rojo;
    const safeTotal = item.total || 1;
    const greenShare = item.total ? Math.round((item.verde / safeTotal) * 100) : 0;
    const yellowShare = item.total ? Math.round((item.amarillo / safeTotal) * 100) : 0;
    const redShare = item.total ? Math.round((item.rojo / safeTotal) * 100) : 0;
    const pendingShare = item.total ? Math.round((item.pending / safeTotal) * 100) : 0;
    const comparisonTone = mealComparison.bestMeal === mealType
      ? "success"
      : mealComparison.worstMeal === mealType
        ? "alert"
        : "neutral";

    return `
      <article class="meal-breakdown-card meal-breakdown-card-${mealType}">
        <div class="meal-breakdown-header">
          <div>
            <strong>${MEAL_LABELS[mealType]}</strong>
            <span>${item.total} registro(s)</span>
          </div>
          <span class="meal-breakdown-rank ${comparisonTone}">${rankLabel}</span>
        </div>

        <div class="meal-breakdown-chips">
          <div class="meal-breakdown-chip green">
            <span>Verde</span>
            <strong>${item.verde}</strong>
            <small>${greenShare}%</small>
          </div>
          <div class="meal-breakdown-chip yellow">
            <span>Amarillo</span>
            <strong>${item.amarillo}</strong>
            <small>${yellowShare}%</small>
          </div>
          <div class="meal-breakdown-chip red">
            <span>Rojo</span>
            <strong>${item.rojo}</strong>
            <small>${redShare}%</small>
          </div>
        </div>

        <div class="meal-breakdown-bars" aria-hidden="true">
          <span class="meal-breakdown-bar green" style="width:${greenShare}%;"></span>
          <span class="meal-breakdown-bar yellow" style="width:${yellowShare}%;"></span>
          <span class="meal-breakdown-bar red" style="width:${redShare}%;"></span>
        </div>

        <div class="meal-breakdown-meta">
          <div class="meal-breakdown-line">
            <span>Efectividad verde</span>
            <strong>${comparison.greenRateLabel}</strong>
          </div>
          <div class="meal-breakdown-line">
            <span>Con tolerancia</span>
            <strong>${totalWithTolerance}</strong>
          </div>
          <div class="meal-breakdown-line">
            <span>Pendientes</span>
            <strong>${item.pending} (${pendingShare}%)</strong>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderMissingSummary(missingCount) {
  elements.missingSummary.innerHTML = `
    <div class="mini-line"><strong>Registros faltantes</strong><span>${missingCount}</span></div>
    <div class="mini-line"><span>Creacion automatica</span><span>Al cierre del dia</span></div>
    <div class="mini-line"><span>Edicion posterior</span><span>Permitida</span></div>
  `;
}

function renderRepeatedFoodRanking(ranking) {
  if (!elements.repeatedFoodRanking) {
    return;
  }

  if (!ranking.safe.length && !ranking.risky.length) {
    elements.repeatedFoodRanking.innerHTML = `
      <div class="empty-state">
        Se necesitan al menos 2 coincidencias verdes o rojas para detectar comidas seguras o riesgosas.
      </div>
    `;
    return;
  }

  const collapsedLimit = 4;
  const hasOverflow = ranking.safe.length > collapsedLimit || ranking.risky.length > collapsedLimit;
  const extraCount = Math.max(ranking.safe.length - collapsedLimit, 0) + Math.max(ranking.risky.length - collapsedLimit, 0);

  elements.repeatedFoodRanking.innerHTML = `
    <div class="repeated-food-columns">
      <section class="repeated-food-column repeated-food-column-safe">
        <div class="repeated-food-column-header">
          <strong>Comidas seguras</strong>
          <span>Verdes consecutivos</span>
        </div>
        ${renderRepeatedFoodList(ranking.safe, "safe", collapsedLimit)}
      </section>
      <section class="repeated-food-column repeated-food-column-risk">
        <div class="repeated-food-column-header">
          <strong>Comidas riesgosas</strong>
          <span>Rojos y amarillos frecuentes</span>
        </div>
        ${renderRepeatedFoodList(ranking.risky, "risk", collapsedLimit)}
      </section>
    </div>
    ${hasOverflow
      ? `
        <div class="repeated-food-actions">
          <button class="table-action" data-action="toggle-repeated-food" type="button">
            ${state.showAllRepeatedFood ? "Mostrar menos" : `Ver mas (${extraCount} mas)`}
          </button>
        </div>
      `
      : ""}
    <p class="repeated-food-footnote">
      Se mezcla coincidencia de comida completa y palabras clave repetidas usando solo registros con tolerancia verde, amarilla o roja.
    </p>
  `;

  const toggleButton = elements.repeatedFoodRanking.querySelector('[data-action="toggle-repeated-food"]');
  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      state.showAllRepeatedFood = !state.showAllRepeatedFood;
      renderStats();
    });
  }
}

function renderRepeatedFoodList(items, tone, collapsedLimit) {
  if (!items.length) {
    return '<div class="empty-state compact">Todavia no hay suficientes repeticiones.</div>';
  }

  const visibleItems = state.showAllRepeatedFood ? items : items.slice(0, collapsedLimit);

  return visibleItems.map((item, index) => `
    <article class="repeated-food-item repeated-food-item-${tone}">
      <div class="repeated-food-item-top">
        <span class="repeated-food-rank">#${index + 1}</span>
        <span class="repeated-food-kind">${item.kindLabel}</span>
      </div>
      <strong class="repeated-food-label">${escapeHtml(item.label)}</strong>
      <div class="repeated-food-stats">
        <span>Verdes ${item.greenCount}</span>
        <span>Amarillos ${item.yellowCount} · Rojos ${item.redCount}</span>
      </div>
      <div class="repeated-food-meta">
        ${tone === "safe"
          ? `<span>Racha verde: ${item.maxGreenStreak}</span>`
          : `<span>Impacto de riesgo: ${item.riskCount}</span>`}
        <span>${item.mealTypesLabel}</span>
      </div>
    </article>
  `).join("");
}

function computeRepeatedFoodRanking(records) {
  const chronologicallySorted = [...records]
    .filter((record) => (
      record.status === "recorded"
      && ["verde", "amarillo", "rojo"].includes(record.tolerance)
      && typeof record.mealText === "string"
      && record.mealText.trim()
    ))
    .sort((left, right) => {
      const byDate = left.recordDate.localeCompare(right.recordDate);
      if (byDate !== 0) {
        return byDate;
      }

      const bySchedule = left.scheduledTime.localeCompare(right.scheduledTime);
      if (bySchedule !== 0) {
        return bySchedule;
      }

      return left.createdAt.localeCompare(right.createdAt);
    });

  const terms = new Map();

  chronologicallySorted.forEach((record) => {
    collectRecordTerms(record).forEach((term) => {
      const current = terms.get(term.key) || createRepeatedFoodTerm(term, record);
      current.appearances += 1;
      current.mealTypes.add(record.mealType);

      if (record.tolerance === "verde") {
        current.greenCount += 1;
        current.currentGreenStreak += 1;
        current.maxGreenStreak = Math.max(current.maxGreenStreak, current.currentGreenStreak);
      } else if (record.tolerance === "amarillo") {
        current.yellowCount += 1;
        current.currentGreenStreak = 0;
      } else {
        current.redCount += 1;
        current.currentGreenStreak = 0;
      }

      terms.set(term.key, current);
    });
  });

  const rankedTerms = Array.from(terms.values()).map((term) => ({
    ...term,
    riskCount: term.yellowCount + term.redCount,
    mealTypesLabel: getRepeatedFoodMealTypesLabel(term.mealTypes),
    kindLabel: term.kind === "meal" ? "Comida" : "Palabra clave",
  }));

  return {
    safe: rankedTerms
      .filter((term) => term.greenCount >= 2 && term.maxGreenStreak >= 2 && term.greenCount > term.riskCount)
      .sort((left, right) => (
        getSafeRankingScore(right) - getSafeRankingScore(left)
        || right.maxGreenStreak - left.maxGreenStreak
        || right.greenCount - left.greenCount
        || left.label.localeCompare(right.label)
      ))
      .slice(0, 6),
    risky: rankedTerms
      .filter((term) => term.riskCount >= 2 && term.riskCount > term.greenCount)
      .sort((left, right) => (
        getRiskRankingScore(right) - getRiskRankingScore(left)
        || right.riskCount - left.riskCount
        || left.label.localeCompare(right.label)
      ))
      .slice(0, 6),
  };
}

function collectRecordTerms(record) {
  const normalizedMeal = normalizeMealSearchText(record.mealText);
  if (!normalizedMeal) {
    return [];
  }

  const terms = [
    {
      key: `meal:${normalizedMeal}`,
      label: formatRankingLabel(record.mealText),
      kind: "meal",
    },
  ];

  extractMealKeywords(record.mealText).forEach((keyword) => {
    terms.push({
      key: `keyword:${keyword}`,
      label: formatRankingLabel(keyword),
      kind: "keyword",
    });
  });

  return terms;
}

function createRepeatedFoodTerm(term, record) {
  return {
    key: term.key,
    label: term.label,
    kind: term.kind,
    appearances: 0,
    greenCount: 0,
    yellowCount: 0,
    redCount: 0,
    currentGreenStreak: 0,
    maxGreenStreak: 0,
    mealTypes: new Set(record.mealType ? [record.mealType] : []),
  };
}

function getSafeRankingScore(item) {
  return (item.maxGreenStreak * 4) + (item.greenCount * 2) - item.riskCount;
}

function getRiskRankingScore(item) {
  return (item.redCount * 4) + (item.yellowCount * 2) - (item.greenCount * 2);
}

function getRepeatedFoodMealTypesLabel(mealTypes) {
  const sortedMealTypes = Array.from(mealTypes).sort();
  if (sortedMealTypes.length === 2) {
    return "Almuerzo y cena";
  }

  if (sortedMealTypes[0] === "dinner") {
    return "Cena";
  }

  return "Almuerzo";
}

function normalizeMealSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s,]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function normalizeMealComparisonText(value) {
  return normalizeMealSearchText(value).replace(/,/g, " ").replace(/\s+/g, " ").trim();
}

function extractMealKeywords(mealText) {
  const stopWords = new Set([
    "a", "al", "algo", "con", "de", "del", "despues", "dos", "el", "en", "la", "las", "lo", "los",
    "mas", "media", "mi", "mis", "o", "otra", "otro", "para", "por", "sin", "su", "sus", "un", "una",
    "unas", "uno", "unos", "y",
  ]);

  return Array.from(new Set(
    normalizeMealSearchText(mealText)
      .split(/[\s,]+/)
      .filter((token) => token.length >= 3 && !stopWords.has(token) && !/^\d+$/.test(token))
  )).slice(0, 8);
}

function countKeywordOverlap(leftKeywords, rightKeywords) {
  const rightSet = new Set(rightKeywords);
  return leftKeywords.reduce((count, keyword) => count + (rightSet.has(keyword) ? 1 : 0), 0);
}

function formatRankingLabel(value) {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  if (!compact) {
    return "Sin texto";
  }

  return compact.length > 56 ? `${compact.slice(0, 53)}...` : compact;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderDailyMetricsBoard(metrics) {
  if (!metrics.length) {
    elements.dailyMetricsBoard.innerHTML = '<div class="metric-day-empty">Todavia no hay indicadores diarios cargados.</div>';
    return;
  }

  const visibleMetrics = state.showAllDailyMetrics ? metrics : metrics.slice(0, 3);
  const toggleMarkup = metrics.length > 3
    ? `
      <div class="metric-board-actions">
        <button class="table-action" data-action="toggle-daily-metrics" type="button">
          ${state.showAllDailyMetrics ? "Mostrar menos" : `Mostrar mas (${metrics.length - 3} mas)`}
        </button>
      </div>
    `
    : "";

  elements.dailyMetricsBoard.innerHTML = visibleMetrics.map((metric) => {
    const tirTone = getTimeInRangeTone(metric.timeInRange);
    const glucoseTone = getAverageGlucoseTone(metric.averageGlucose);

    return `
      <article class="metric-day-card">
        <div class="metric-day-header">
          <div>
            <div class="metric-day-date">${formatDate(metric.metricDate)}</div>
            <div class="metric-day-caption">Actualizado ${formatDateTime(metric.updatedAt)}</div>
          </div>
          <div class="metric-day-actions">
            <button class="table-action" data-action="edit-daily-metric" data-metric-id="${metric.id}" type="button">Editar</button>
            <button class="table-action" data-action="delete-daily-metric" data-metric-id="${metric.id}" type="button">Borrar</button>
          </div>
        </div>
        <div class="metric-chip-grid">
          <div class="metric-chip" style="background:${tirTone.background};color:${tirTone.color};">
            <span class="metric-chip-label">Tiempo en rango</span>
            <strong class="metric-chip-value">${formatPercentage(metric.timeInRange)}</strong>
          </div>
          <div class="metric-chip" style="background:${glucoseTone.background};color:${glucoseTone.color};">
            <span class="metric-chip-label">Glucosa media</span>
            <strong class="metric-chip-value">${formatGlucose(metric.averageGlucose)}</strong>
          </div>
        </div>
      </article>
    `;
  }).join("") + toggleMarkup;

  elements.dailyMetricsBoard.querySelectorAll('[data-action="edit-daily-metric"]').forEach((button) => {
    button.addEventListener("click", () => {
      const metric = findDailyMetricById(button.dataset.metricId);
      if (metric) {
        populateDailyMetricForm(metric);
      }
    });
  });

  elements.dailyMetricsBoard.querySelectorAll('[data-action="delete-daily-metric"]').forEach((button) => {
    button.addEventListener("click", () => {
      const metric = findDailyMetricById(button.dataset.metricId);
      if (!metric) {
        return;
      }

      const confirmed = window.confirm(`Seguro que queres borrar los indicadores diarios del ${formatDate(metric.metricDate)}? Esta accion no se puede deshacer.`);
      if (!confirmed) {
        return;
      }

      removeDailyMetric(metric.id);
      setNotice(`Indicadores diarios borrados para ${formatDate(metric.metricDate)}.`);
      render();
    });
  });

  const toggleButton = elements.dailyMetricsBoard.querySelector('[data-action="toggle-daily-metrics"]');
  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      state.showAllDailyMetrics = !state.showAllDailyMetrics;
      renderStats();
    });
  }
}

function renderDigestiveEventsBoard(events) {
  if (!elements.digestiveEventsBoard) {
    return;
  }

  if (!events.length) {
    elements.digestiveEventsBoard.innerHTML = '<div class="metric-day-empty">Todavia no hay datos extra guardados.</div>';
    return;
  }

  const visibleEvents = state.showAllDigestiveEvents ? events : events.slice(0, 4);
  const toggleMarkup = events.length > 4
    ? `
      <div class="metric-board-actions">
        <button class="table-action" data-action="toggle-digestive-events" type="button">
          ${state.showAllDigestiveEvents ? "Mostrar menos" : `Mostrar mas (${events.length - 4} mas)`}
        </button>
      </div>
    `
    : "";

  elements.digestiveEventsBoard.innerHTML = visibleEvents.map((event) => `
    <article class="metric-day-card digestive-event-card">
      <div class="metric-day-header">
        <div>
          <div class="metric-day-date">${formatDigestiveEvent(event.eventType)}</div>
          <div class="metric-day-caption">${formatDateTime(event.recordedAt)}</div>
        </div>
        <div class="metric-day-actions">
          <button class="table-action" data-action="edit-digestive-event" data-event-id="${event.id}" type="button">Editar</button>
          <button class="table-action" data-action="delete-digestive-event" data-event-id="${event.id}" type="button">Borrar</button>
        </div>
      </div>
    </article>
  `).join("") + toggleMarkup;

  elements.digestiveEventsBoard.querySelectorAll('[data-action="edit-digestive-event"]').forEach((button) => {
    button.addEventListener("click", () => {
      const event = findDigestiveEventById(button.dataset.eventId);
      if (!event) {
        return;
      }

      const form = elements.dailyMetricsForm;
      form.dataset.editingDigestiveEventId = event.id;
      form.elements.digestiveEvent.value = event.eventType;
      elements.digestiveEventSave.textContent = "Actualizar dato extra";
      elements.digestiveEventMeta.textContent = `Editando ${formatDigestiveEvent(event.eventType).toLowerCase()} del ${formatDateTime(event.recordedAt)}.`;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      setNotice(`Editando dato extra del ${formatDateTime(event.recordedAt)}.`);
    });
  });

  elements.digestiveEventsBoard.querySelectorAll('[data-action="delete-digestive-event"]').forEach((button) => {
    button.addEventListener("click", () => {
      const event = findDigestiveEventById(button.dataset.eventId);
      if (!event) {
        return;
      }

      const confirmed = window.confirm(`Seguro que queres borrar ${formatDigestiveEvent(event.eventType).toLowerCase()} del ${formatDateTime(event.recordedAt)}? Esta accion no se puede deshacer.`);
      if (!confirmed) {
        return;
      }

      removeDigestiveEvent(event.id);
      setNotice(`Dato extra borrado del ${formatDateTime(event.recordedAt)}.`);
      renderStats();
    });
  });

  const toggleButton = elements.digestiveEventsBoard.querySelector('[data-action="toggle-digestive-events"]');
  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      state.showAllDigestiveEvents = !state.showAllDigestiveEvents;
      renderStats();
    });
  }
}

function renderStressEventsBoard(events) {
  if (!elements.stressEventsBoard) {
    return;
  }

  if (!events.length) {
    elements.stressEventsBoard.innerHTML = '<div class="metric-day-empty">Todavia no hay registros de estres guardados.</div>';
    return;
  }

  const visibleEvents = state.showAllStressEvents ? events : events.slice(0, 4);
  const toggleMarkup = events.length > 4
    ? `
      <div class="metric-board-actions">
        <button class="table-action" data-action="toggle-stress-events" type="button">
          ${state.showAllStressEvents ? "Mostrar menos" : `Mostrar mas (${events.length - 4} mas)`}
        </button>
      </div>
    `
    : "";

  elements.stressEventsBoard.innerHTML = visibleEvents.map((event) => `
    <article class="metric-day-card digestive-event-card">
      <div class="metric-day-header">
        <div>
          <div class="metric-day-date">${formatStressEvent(event.stressLevel)}</div>
          <div class="metric-day-caption">${formatDateTime(event.recordedAt)}</div>
        </div>
        <div class="metric-day-actions">
          <button class="table-action" data-action="edit-stress-event" data-event-id="${event.id}" type="button">Editar</button>
          <button class="table-action" data-action="delete-stress-event" data-event-id="${event.id}" type="button">Borrar</button>
        </div>
      </div>
    </article>
  `).join("") + toggleMarkup;

  elements.stressEventsBoard.querySelectorAll('[data-action="edit-stress-event"]').forEach((button) => {
    button.addEventListener("click", () => {
      const event = findStressEventById(button.dataset.eventId);
      if (!event) {
        return;
      }

      const form = elements.dailyMetricsForm;
      form.dataset.editingStressEventId = event.id;
      form.elements.stressEvent.value = event.stressLevel;
      elements.stressEventSave.textContent = "Actualizar estrés";
      elements.stressEventMeta.textContent = `Editando ${formatStressEvent(event.stressLevel).toLowerCase()} del ${formatDateTime(event.recordedAt)}.`;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      setNotice(`Editando registro de estres del ${formatDateTime(event.recordedAt)}.`);
    });
  });

  elements.stressEventsBoard.querySelectorAll('[data-action="delete-stress-event"]').forEach((button) => {
    button.addEventListener("click", () => {
      const event = findStressEventById(button.dataset.eventId);
      if (!event) {
        return;
      }

      const confirmed = window.confirm(`Seguro que queres borrar ${formatStressEvent(event.stressLevel).toLowerCase()} del ${formatDateTime(event.recordedAt)}? Esta accion no se puede deshacer.`);
      if (!confirmed) {
        return;
      }

      removeStressEvent(event.id);
      setNotice(`Registro de estres borrado del ${formatDateTime(event.recordedAt)}.`);
      renderStats();
    });
  });

  const toggleButton = elements.stressEventsBoard.querySelector('[data-action="toggle-stress-events"]');
  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      state.showAllStressEvents = !state.showAllStressEvents;
      renderStats();
    });
  }
}

function getFilteredRecords() {
  const from = elements.filterFrom.value;
  const to = elements.filterTo.value;
  const tolerance = elements.filterTolerance.value;

  return state.records.filter((record) => {
    if (from && record.recordDate < from) {
      return false;
    }

    if (to && record.recordDate > to) {
      return false;
    }

    if (tolerance === "all") {
      return true;
    }

    if (tolerance === "missing") {
      return record.status === "missing";
    }

    if (tolerance === "pending") {
      return record.status === "recorded" && !record.tolerance;
    }

    return record.tolerance === tolerance;
  });
}

function computeStats(records) {
  const counts = { verde: 0, amarillo: 0, rojo: 0 };
  const breakdownByMeal = {
    lunch: { total: 0, pending: 0, verde: 0, amarillo: 0, rojo: 0 },
    dinner: { total: 0, pending: 0, verde: 0, amarillo: 0, rojo: 0 },
  };
  const groupedByDate = new Map();
  let missingCount = 0;
  let pendingCount = 0;

  sortRecords(records).forEach((record) => {
    if (!groupedByDate.has(record.recordDate)) {
      groupedByDate.set(record.recordDate, {
        date: record.recordDate,
        total: 0,
        verde: 0,
        amarillo: 0,
        rojo: 0,
        pending: 0,
        missing: 0,
      });
    }

    const dayGroup = groupedByDate.get(record.recordDate);
    dayGroup.total += 1;

    if (record.status === "missing") {
      dayGroup.missing += 1;
      missingCount += 1;
      return;
    }

    breakdownByMeal[record.mealType].total += 1;

    if (!record.tolerance) {
      dayGroup.pending += 1;
      breakdownByMeal[record.mealType].pending += 1;
      pendingCount += 1;
      return;
    }

    counts[record.tolerance] += 1;
    breakdownByMeal[record.mealType][record.tolerance] += 1;
    dayGroup[record.tolerance] += 1;
  });

  const effectiveTotal = counts.verde + counts.amarillo + counts.rojo;

  return {
    totalRecords: records.length,
    counts,
    percentages: {
      verde: calculatePercentage(counts.verde, effectiveTotal),
      amarillo: calculatePercentage(counts.amarillo, effectiveTotal),
      rojo: calculatePercentage(counts.rojo, effectiveTotal),
    },
    breakdownByMeal,
    timeline: Array.from(groupedByDate.values()).slice(0, 7).reverse(),
    missingCount,
    pendingCount,
  };
}

function calculatePercentage(value, total) {
  if (!total) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function exportRecords() {
  const mealStats = computeStats(state.records);
  const dailyMetricStats = computeDailyMetricStats(state.dailyMetrics);
  const insights = computeInsightsSafely(state.records, state.dailyMetrics);
  const payload = {
    exportedAt: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    summary: {
      meals: {
        totalRecords: mealStats.totalRecords,
        counts: mealStats.counts,
        percentages: mealStats.percentages,
        pendingCount: mealStats.pendingCount,
        missingCount: mealStats.missingCount,
      },
      dailyMetrics: {
        totalDays: dailyMetricStats.totalDays,
        averageTimeInRange: dailyMetricStats.averageTimeInRange,
        averageGlucose: dailyMetricStats.averageGlucose,
        inTargetDays: dailyMetricStats.inTargetDays,
        glucoseInTargetDays: dailyMetricStats.glucoseInTargetDays,
      },
      insights: {
        streaks: insights.streaks,
        mealComparison: insights.mealComparison,
        weeklyComparison: insights.weeklyComparison.exportable,
        glucoseVariability: insights.glucoseVariability.exportable,
      },
    },
    records: sortRecords(state.records).map((record) => ({
      id: record.id,
      mealType: record.mealType,
      mealText: record.mealText,
      tolerance: record.tolerance,
      toleranceUpdatedAt: record.toleranceUpdatedAt || null,
      scheduledTime: record.scheduledTime,
      recordDate: record.recordDate,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      status: record.status,
    })),
    dailyMetrics: sortDailyMetrics(state.dailyMetrics).map((metric) => ({
      id: metric.id,
      metricDate: metric.metricDate,
      timeInRange: metric.timeInRange,
      averageGlucose: metric.averageGlucose,
      createdAt: metric.createdAt,
      updatedAt: metric.updatedAt,
    })),
    digestiveEvents: sortDigestiveEvents(state.digestiveEvents).map((event) => ({
      id: event.id,
      eventType: event.eventType,
      recordedAt: event.recordedAt,
      source: event.source,
    })),
    stressEvents: sortStressEvents(state.stressEvents).map((event) => ({
      id: event.id,
      stressLevel: event.stressLevel,
      recordedAt: event.recordedAt,
      source: event.source,
    })),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `diabetes-control-${getLocalDateKey(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);

  setNotice("Exportacion JSON lista.");
}

function sortRecords(records) {
  return [...records].sort((left, right) => {
    const byDate = right.recordDate.localeCompare(left.recordDate);
    if (byDate !== 0) {
      return byDate;
    }

    const bySchedule = left.scheduledTime.localeCompare(right.scheduledTime);
    if (bySchedule !== 0) {
      return bySchedule;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });
}

function computeInsights(records, dailyMetrics) {
  return {
    streaks: computeStreakInsights(records, dailyMetrics),
    mealComparison: computeMealComparison(records),
    weeklyComparison: computeWeeklyComparison(dailyMetrics),
    glucoseVariability: computeGlucoseVariability(dailyMetrics),
    controlHighlights: computeControlHighlights(dailyMetrics),
  };
}

function computeInsightsSafely(records, dailyMetrics) {
  try {
    return computeInsights(records, dailyMetrics);
  } catch (error) {
    console.error("No se pudieron calcular los insights avanzados.", error);
    return {
      streaks: {
        greenDays: 0,
        timeInRangeDays: 0,
        lastTrackedDay: null,
        lastTrackedDayLabel: "Sin datos",
      },
      mealComparison: createEmptyMealComparison(),
      weeklyComparison: {
        hasComparison: false,
        exportable: { hasComparison: false },
      },
      glucoseVariability: {
        deviation: null,
        deviationDisplay: "Sin datos",
        average: null,
        averageDisplay: "Sin datos",
        estimatedA1c: null,
        estimatedA1cDisplay: "Sin datos",
        estimatedA1cTone: { background: "rgba(148, 163, 184, 0.18)", color: "#e2e8f0" },
        cv: null,
        cvDisplay: "Sin datos",
        rangeDisplay: "Sin datos",
        minDisplay: "Sin datos",
        maxDisplay: "Sin datos",
        basisLabel: "Sin datos disponibles",
        levelLabel: "Sin datos disponibles",
        tone: "neutral",
        exportable: { min: null, max: null, range: null, estimatedA1c: null },
      },
      controlHighlights: {
        bestDay: null,
        worstDay: null,
      },
    };
  }
}

function computeStreakInsights(records, dailyMetrics) {
  const mealDays = getSortedUniqueDates(records.map((record) => record.recordDate));
  const metricDays = getSortedUniqueDates(dailyMetrics.map((metric) => metric.metricDate));
  const greenDays = new Set(
    records
      .filter((record) => record.status === "recorded" && record.tolerance === "verde")
      .map((record) => record.recordDate)
  );
  const metricMap = new Map(dailyMetrics.map((metric) => [metric.metricDate, Number(metric.timeInRange)]));
  const lastTrackedDay = [mealDays[0], metricDays[0]]
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left))[0] || null;

  return {
    greenDays: countConsecutiveDays(mealDays, (dateKey) => greenDays.has(dateKey)),
    timeInRangeDays: countConsecutiveDays(metricDays, (dateKey) => (metricMap.get(dateKey) || 0) >= 70),
    lastTrackedDay,
    lastTrackedDayLabel: lastTrackedDay ? formatDate(lastTrackedDay) : "Sin datos",
  };
}

function computeMealComparison(records) {
  const base = createEmptyMealComparison();

  records.forEach((record) => {
    if (record.status === "missing" || !base[record.mealType]) {
      return;
    }

    const meal = base[record.mealType];
    meal.recorded += 1;

    if (!record.tolerance) {
      meal.pending += 1;
      return;
    }

    meal.resolved += 1;
    if (record.tolerance === "verde") {
      meal.green += 1;
    }
    if (record.tolerance === "rojo") {
      meal.red += 1;
    }
  });

  ["lunch", "dinner"].forEach((mealType) => {
    const meal = base[mealType];
    meal.greenRate = meal.resolved ? roundMetric((meal.green / meal.resolved) * 100) : null;
    meal.greenRateLabel = meal.greenRate === null ? "Sin datos" : `${meal.greenRate}%`;
  });

  const resolvedMeals = ["lunch", "dinner"].filter((mealType) => base[mealType].resolved > 0);
  let bestMeal = null;
  let worstMeal = null;

  if (resolvedMeals.length === 2 && base.lunch.greenRate !== base.dinner.greenRate) {
    bestMeal = base.lunch.greenRate > base.dinner.greenRate ? "lunch" : "dinner";
    worstMeal = bestMeal === "lunch" ? "dinner" : "lunch";
  }

  return {
    ...base,
    bestMeal,
    worstMeal,
  };
}

function createMealComparisonBase() {
  return {
    recorded: 0,
    pending: 0,
    resolved: 0,
    green: 0,
    red: 0,
    greenRate: null,
    greenRateLabel: "Sin datos",
  };
}

function createEmptyMealComparison() {
  return {
    lunch: createMealComparisonBase(),
    dinner: createMealComparisonBase(),
    bestMeal: null,
    worstMeal: null,
  };
}

function computeWeeklyComparison(metrics) {
  const sortedMetrics = sortDailyMetrics(metrics).map((metric) => ({
    ...metric,
    timeInRange: Number(metric.timeInRange),
    averageGlucose: Number(metric.averageGlucose),
  }));
  const consecutiveWindow = getLatestConsecutiveMetricWindow(sortedMetrics, 14);
  const hasComparison = consecutiveWindow.length === 14;

  if (!hasComparison) {
    return {
      hasComparison: false,
      exportable: { hasComparison: false },
    };
  }

  const currentWeek = consecutiveWindow.slice(0, 7);
  const previousWeek = consecutiveWindow.slice(7, 14);

  const currentTimeInRange = roundMetric(average(currentWeek.map((metric) => metric.timeInRange)));
  const previousTimeInRange = roundMetric(average(previousWeek.map((metric) => metric.timeInRange)));
  const currentGlucose = roundMetric(average(currentWeek.map((metric) => metric.averageGlucose)));
  const previousGlucose = roundMetric(average(previousWeek.map((metric) => metric.averageGlucose)));

  return {
    hasComparison: true,
    currentTimeInRange,
    previousTimeInRange,
    currentGlucose,
    previousGlucose,
    currentTimeInRangeDisplay: formatPercentage(currentTimeInRange),
    previousTimeInRangeDisplay: formatPercentage(previousTimeInRange),
    currentGlucoseDisplay: formatGlucose(currentGlucose),
    previousGlucoseDisplay: formatGlucose(previousGlucose),
    timeInRangeDirection: getDeltaDirection(currentTimeInRange - previousTimeInRange, true),
    glucoseDirection: getDeltaDirection(currentGlucose - previousGlucose, false),
    timeInRangeDeltaLabel: formatDeltaLabel(currentTimeInRange - previousTimeInRange, "TIR", "pts"),
    glucoseDeltaLabel: formatDeltaLabel(currentGlucose - previousGlucose, "Glucosa", "mg/dL", true),
    exportable: {
      hasComparison: true,
      currentTimeInRange,
      previousTimeInRange,
      currentGlucose,
      previousGlucose,
      timeInRangeDelta: roundMetric(currentTimeInRange - previousTimeInRange),
      glucoseDelta: roundMetric(currentGlucose - previousGlucose),
    },
  };
}

function computeGlucoseVariability(metrics) {
  const sortedMetrics = sortDailyMetrics(metrics)
    .map((metric) => ({
      ...metric,
      averageGlucose: Number(metric.averageGlucose),
      timeInRange: Number(metric.timeInRange),
    }))
    .filter((metric) => Number.isFinite(metric.averageGlucose));
  const values = sortedMetrics.map((metric) => metric.averageGlucose);
  const timeInRangeValues = sortedMetrics
    .map((metric) => metric.timeInRange)
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return {
      deviation: null,
      deviationDisplay: "Sin datos",
      average: null,
      averageDisplay: "Sin datos",
      estimatedA1c: null,
      estimatedA1cDisplay: "Sin datos",
      estimatedA1cTone: { background: "rgba(148, 163, 184, 0.18)", color: "#e2e8f0" },
      averageTimeInRange: null,
      averageTimeInRangeDisplay: "Sin datos",
      averageTimeInRangeTone: { background: "rgba(148, 163, 184, 0.18)", color: "#e2e8f0" },
      cv: null,
      cvDisplay: "Sin datos",
      rangeDisplay: "Sin datos",
      minDisplay: "Sin datos",
      maxDisplay: "Sin datos",
      basisLabel: "Todavia no hay indicadores diarios",
      levelLabel: "Todavia no hay indicadores diarios",
      summaryLabel: "Cargá indicadores diarios para ver una lectura simple del promedio y la estabilidad.",
      tone: "neutral",
      exportable: { min: null, max: null, range: null, estimatedA1c: null },
    };
  }

  const avg = average(values);
  const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length;
  const deviation = roundMetric(Math.sqrt(variance));
  const cv = avg > 0 ? roundMetric((deviation / avg) * 100) : null;
  const estimatedA1c = estimateA1cFromAverageGlucose(avg);
  const averageTimeInRange = timeInRangeValues.length
    ? roundMetric(timeInRangeValues.reduce((sum, value) => sum + value, 0) / timeInRangeValues.length)
    : null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = roundMetric(max - min);
  const interpretation = describeGlucoseVariability(avg, cv);

  return {
    deviation,
    deviationDisplay: `${deviation} mg/dL`,
    average: avg,
    averageDisplay: formatGlucose(avg),
    estimatedA1c,
    estimatedA1cDisplay: formatEstimatedA1c(estimatedA1c),
    estimatedA1cTone: getEstimatedA1cTone(estimatedA1c),
    averageTimeInRange,
    averageTimeInRangeDisplay: averageTimeInRange === null ? "Sin datos" : formatPercentage(averageTimeInRange),
    averageTimeInRangeTone: getTimeInRangeTone(averageTimeInRange),
    cv,
    cvDisplay: cv === null ? "Sin datos" : `${cv}%`,
    rangeDisplay: `${formatGlucose(min)} - ${formatGlucose(max)}`,
    minDisplay: formatGlucose(min),
    maxDisplay: formatGlucose(max),
    basisLabel: "Basado en promedios diarios; no reemplaza CGM ni lecturas intradia",
    levelLabel: interpretation.levelLabel,
    summaryLabel: interpretation.summaryLabel,
    tone: interpretation.tone,
    exportable: {
      min,
      max,
      range,
      estimatedA1c,
    },
  };
}

function describeGlucoseVariability(averageGlucose, cv) {
  if (!Number.isFinite(averageGlucose) || !Number.isFinite(cv)) {
    return {
      levelLabel: "No se pudo calcular el CV",
      summaryLabel: "Faltan datos para combinar estabilidad y promedio.",
      tone: "neutral",
    };
  }

  const averageBand = averageGlucose <= 70
    ? "low"
    : averageGlucose <= 154
      ? "target"
      : averageGlucose <= 180
        ? "high"
        : "veryHigh";
  const variabilityBand = cv < 18 ? "veryStable" : cv < 36 ? "stable" : "unstable";

  if (variabilityBand === "veryStable" && averageBand === "target") {
    return {
      levelLabel: "Variabilidad muy buena y promedio en objetivo",
      summaryLabel: "Estable y en valores saludables.",
      tone: "good",
    };
  }

  if (variabilityBand === "veryStable" && averageBand === "high") {
    return {
      levelLabel: "Variabilidad muy buena, pero promedio alto",
      summaryLabel: "Estable, pero estable en valores elevados.",
      tone: "warning",
    };
  }

  if (variabilityBand === "veryStable" && averageBand === "veryHigh") {
    return {
      levelLabel: "Variabilidad muy buena, pero promedio muy alto",
      summaryLabel: "Muy estable, pero sostenido en valores demasiado altos.",
      tone: "danger",
    };
  }

  if (variabilityBand === "veryStable" && averageBand === "low") {
    return {
      levelLabel: "Variabilidad muy buena, pero promedio bajo",
      summaryLabel: "Estable, pero tirando a valores bajos.",
      tone: "warning",
    };
  }

  if (variabilityBand === "stable" && averageBand === "target") {
    return {
      levelLabel: "Variabilidad dentro de objetivo",
      summaryLabel: "Bastante estable y con promedio en objetivo.",
      tone: "good",
    };
  }

  if (variabilityBand === "stable" && averageBand === "high") {
    return {
      levelLabel: "Variabilidad aceptable, pero promedio alto",
      summaryLabel: "Relativamente estable, pero con promedio elevado.",
      tone: "warning",
    };
  }

  if (variabilityBand === "stable" && averageBand === "veryHigh") {
    return {
      levelLabel: "Variabilidad aceptable, pero promedio muy alto",
      summaryLabel: "Hay estabilidad, pero en un nivel demasiado alto.",
      tone: "danger",
    };
  }

  if (variabilityBand === "stable" && averageBand === "low") {
    return {
      levelLabel: "Variabilidad aceptable, pero promedio bajo",
      summaryLabel: "Relativamente estable, aunque en valores bajos.",
      tone: "warning",
    };
  }

  if (averageBand === "target") {
    return {
      levelLabel: "Variabilidad elevada",
      summaryLabel: "El promedio no está mal, pero hay demasiados altibajos.",
      tone: "warning",
    };
  }

  if (averageBand === "low") {
    return {
      levelLabel: "Variabilidad elevada con promedio bajo",
      summaryLabel: "Inestable y con tendencia a valores bajos.",
      tone: "danger",
    };
  }

  if (averageBand === "high") {
    return {
      levelLabel: "Variabilidad elevada y promedio alto",
      summaryLabel: "Inestable y además en valores elevados.",
      tone: "danger",
    };
  }

  return {
    levelLabel: "Variabilidad elevada y promedio muy alto",
    summaryLabel: "Inestable y sostenido en valores demasiado altos.",
    tone: "danger",
  };
}

function computeControlHighlights(metrics) {
  const normalizedMetrics = sortDailyMetrics(metrics)
    .map((metric) => ({
      ...metric,
      timeInRange: Number(metric.timeInRange),
      averageGlucose: Number(metric.averageGlucose),
    }))
    .filter((metric) => Number.isFinite(metric.timeInRange) && Number.isFinite(metric.averageGlucose));

  if (!normalizedMetrics.length) {
    return {
      bestDay: null,
      worstDay: null,
    };
  }

  const ranked = [...normalizedMetrics].sort((left, right) => {
    const tirDiff = right.timeInRange - left.timeInRange;
    if (tirDiff !== 0) {
      return tirDiff;
    }

    const glucoseDiff = left.averageGlucose - right.averageGlucose;
    if (glucoseDiff !== 0) {
      return glucoseDiff;
    }

    return right.metricDate.localeCompare(left.metricDate);
  });

  return {
    bestDay: formatControlDay(ranked[0]),
    worstDay: formatControlDay(ranked[ranked.length - 1]),
  };
}

function formatControlDay(metric) {
  if (!metric) {
    return null;
  }

  return {
    metricDate: metric.metricDate,
    timeInRange: metric.timeInRange,
    averageGlucose: metric.averageGlucose,
    timeInRangeDisplay: formatPercentage(metric.timeInRange),
    averageGlucoseDisplay: formatGlucose(metric.averageGlucose),
  };
}

function getAvailableMetricMonths(metrics) {
  return [...new Set(metrics.map((metric) => metric.metricDate.slice(0, 7)).filter(Boolean))].sort((left, right) => right.localeCompare(left));
}

function filterMetricsByMonth(metrics, monthKey) {
  if (!monthKey || monthKey === "all") {
    return metrics;
  }

  return metrics.filter((metric) => metric.metricDate.startsWith(`${monthKey}-`));
}

function formatMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("es-UY", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function getSortedUniqueDates(dates) {
  return [...new Set(dates)].sort((left, right) => right.localeCompare(left));
}

function countConsecutiveDays(sortedDates, predicate) {
  if (!sortedDates.length) {
    return 0;
  }

  let streak = 0;
  let expectedDate = sortedDates[0];

  for (const dateKey of sortedDates) {
    if (dateKey !== expectedDate) {
      break;
    }

    if (!predicate(dateKey)) {
      break;
    }

    streak += 1;
    expectedDate = getLocalDateKey(shiftDate(parseDateKey(expectedDate), -1));
  }

  return streak;
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getLatestConsecutiveMetricWindow(metrics, requiredLength) {
  if (metrics.length < requiredLength) {
    return [];
  }

  for (let startIndex = 0; startIndex <= metrics.length - requiredLength; startIndex += 1) {
    const window = [metrics[startIndex]];

    for (
      let index = startIndex + 1;
      index < metrics.length && window.length < requiredLength;
      index += 1
    ) {
      const previousDate = parseDateKey(window[window.length - 1].metricDate);
      const expectedDate = getLocalDateKey(shiftDate(previousDate, -1));
      if (metrics[index].metricDate !== expectedDate) {
        break;
      }

      window.push(metrics[index]);
    }

    if (window.length === requiredLength) {
      return window;
    }
  }

  return [];
}

function formatDeltaLabel(delta, label, unit, invertGood = false) {
  if (delta === 0) {
    return `${label} sin cambios`;
  }

  const sign = delta > 0 ? "+" : "-";
  const formatted = `${sign}${Math.abs(roundMetric(delta))} ${unit}`;
  if (invertGood) {
    return delta > 0 ? `${formatted} peor` : `${formatted} mejor`;
  }

  return delta > 0 ? `${formatted} mejor` : `${formatted} peor`;
}

function getDeltaDirection(delta, positiveIsGood) {
  if (delta === 0) {
    return "neutral";
  }

  const isPositive = delta > 0;
  const isGood = positiveIsGood ? isPositive : !isPositive;
  return isGood ? "positive" : "negative";
}

function upsertRecord(record) {
  const index = state.records.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    state.records[index] = record;
  } else {
    state.records.push(record);
  }

  persistRecords();
}

function findRecordForDate(recordDate, mealType) {
  return state.records.find((record) => record.recordDate === recordDate && record.mealType === mealType) || null;
}

function findRecordById(recordId) {
  return state.records.find((record) => record.id === recordId) || null;
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed.map(normalizeRecord).filter(Boolean);
    const { records, changed } = dedupeRecords(normalized);
    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }

    return records;
  } catch (error) {
    console.error("No se pudieron leer los datos guardados.", error);
    return [];
  }
}

function loadDailyMetrics() {
  try {
    const raw = localStorage.getItem(DAILY_METRICS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed.map(normalizeDailyMetric).filter(Boolean);
    if (normalized.length !== parsed.length) {
      localStorage.setItem(DAILY_METRICS_KEY, JSON.stringify(normalized));
    }

    return normalized;
  } catch (error) {
    console.error("No se pudieron leer los indicadores diarios guardados.", error);
    return [];
  }
}

function loadDigestiveEvents() {
  try {
    const raw = localStorage.getItem(DIGESTIVE_EVENTS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed.map(normalizeDigestiveEvent).filter(Boolean);
    if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
      localStorage.setItem(DIGESTIVE_EVENTS_KEY, JSON.stringify(normalized));
    }

    return normalized;
  } catch (error) {
    console.error("No se pudieron leer los eventos digestivos guardados.", error);
    return [];
  }
}

function loadStressEvents() {
  try {
    const raw = localStorage.getItem(STRESS_EVENTS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed.map(normalizeStressEvent).filter(Boolean);
    if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
      localStorage.setItem(STRESS_EVENTS_KEY, JSON.stringify(normalized));
    }

    return normalized;
  } catch (error) {
    console.error("No se pudieron leer los eventos de estres guardados.", error);
    return [];
  }
}

function normalizeRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const mealType = record.mealType === "lunch" || record.mealType === "dinner" ? record.mealType : null;
  const recordDate = typeof record.recordDate === "string" && isValidDateKey(record.recordDate) ? record.recordDate : null;
  const scheduledTime = typeof record.scheduledTime === "string" ? record.scheduledTime : (mealType ? DEFAULT_TIMES[mealType] : "00:00");
  const status = record.status === "missing" ? "missing" : "recorded";
  const tolerance = ["verde", "amarillo", "rojo"].includes(record.tolerance) ? record.tolerance : null;
  const nowIso = new Date().toISOString();

  if (!mealType || !recordDate) {
    return null;
  }

  return {
    id: typeof record.id === "string" ? record.id : createRecordId(),
    mealType,
    mealText: typeof record.mealText === "string" ? record.mealText : "",
    tolerance,
    toleranceUpdatedAt: typeof record.toleranceUpdatedAt === "string" ? record.toleranceUpdatedAt : null,
    scheduledTime,
    recordDate,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : nowIso,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : nowIso,
    status,
  };
}

function normalizeDailyMetric(metric) {
  if (!metric || typeof metric !== "object") {
    return null;
  }

  const metricDate = typeof metric.metricDate === "string" && isValidDateKey(metric.metricDate) ? metric.metricDate : null;
  const timeInRange = Number(metric.timeInRange);
  const averageGlucose = Number(metric.averageGlucose);
  const nowIso = new Date().toISOString();

  if (
    !metricDate
    || !Number.isFinite(timeInRange)
    || timeInRange < 0
    || timeInRange > 100
    || !Number.isFinite(averageGlucose)
    || averageGlucose < 0
    || averageGlucose > 500
  ) {
    return null;
  }

  return {
    id: typeof metric.id === "string" ? metric.id : createMetricId(),
    metricDate,
    timeInRange,
    averageGlucose,
    createdAt: typeof metric.createdAt === "string" ? metric.createdAt : nowIso,
    updatedAt: typeof metric.updatedAt === "string" ? metric.updatedAt : nowIso,
  };
}

function normalizeDigestiveEvent(event) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const eventType = event.eventType === "constipation" || event.eventType === "diarrhea" ? event.eventType : null;
  const recordedAt = typeof event.recordedAt === "string" ? event.recordedAt : null;

  if (!eventType || !recordedAt) {
    return null;
  }

  return {
    id: typeof event.id === "string" ? event.id : createDigestiveEventId(),
    eventType,
    recordedAt: normalizeStoredTimestamp(recordedAt),
    source: typeof event.source === "string" ? event.source : "manual",
  };
}

function normalizeStressEvent(event) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const stressLevel = event.stressLevel === "yes" ? event.stressLevel : null;
  const recordedAt = typeof event.recordedAt === "string" ? event.recordedAt : null;

  if (!stressLevel || !recordedAt) {
    return null;
  }

  return {
    id: typeof event.id === "string" ? event.id : createStressEventId(),
    stressLevel,
    recordedAt: normalizeStoredTimestamp(recordedAt),
    source: typeof event.source === "string" ? event.source : "manual",
  };
}

function dedupeRecords(records) {
  const bySlot = new Map();
  let changed = false;

  records.forEach((record) => {
    const key = `${record.recordDate}::${record.mealType}`;
    const existing = bySlot.get(key);

    if (!existing) {
      bySlot.set(key, record);
      return;
    }

    changed = true;
    if (compareRecordFreshness(record, existing) > 0) {
      bySlot.set(key, record);
    }
  });

  return {
    records: [...bySlot.values()],
    changed,
  };
}

function compareRecordFreshness(left, right) {
  const leftUpdated = Date.parse(left.updatedAt || left.createdAt || "");
  const rightUpdated = Date.parse(right.updatedAt || right.createdAt || "");

  if (Number.isFinite(leftUpdated) && Number.isFinite(rightUpdated) && leftUpdated !== rightUpdated) {
    return leftUpdated - rightUpdated;
  }

  if (Number.isFinite(leftUpdated) && !Number.isFinite(rightUpdated)) {
    return 1;
  }

  if (!Number.isFinite(leftUpdated) && Number.isFinite(rightUpdated)) {
    return -1;
  }

  return String(left.id).localeCompare(String(right.id));
}

function persistRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
}

function persistDailyMetrics() {
  localStorage.setItem(DAILY_METRICS_KEY, JSON.stringify(state.dailyMetrics));
}

function persistDigestiveEvents() {
  localStorage.setItem(DIGESTIVE_EVENTS_KEY, JSON.stringify(state.digestiveEvents));
}

function persistStressEvents() {
  localStorage.setItem(STRESS_EVENTS_KEY, JSON.stringify(state.stressEvents));
}

function findDigestiveEventById(eventId) {
  return state.digestiveEvents.find((event) => event.id === eventId) || null;
}

function removeDigestiveEvent(eventId) {
  state.digestiveEvents = state.digestiveEvents.filter((event) => event.id !== eventId);
  if (elements.dailyMetricsForm.dataset.editingDigestiveEventId === eventId) {
    clearDigestiveEventEditState();
  }
  persistDigestiveEvents();
}

function findStressEventById(eventId) {
  return state.stressEvents.find((event) => event.id === eventId) || null;
}

function removeStressEvent(eventId) {
  state.stressEvents = state.stressEvents.filter((event) => event.id !== eventId);
  if (elements.dailyMetricsForm.dataset.editingStressEventId === eventId) {
    clearStressEventEditState();
  }
  persistStressEvents();
}

function setNotice(message) {
  elements.notice.textContent = message;
  elements.notice.classList.toggle("is-visible", Boolean(message));
}

function clearEditState(form) {
  delete form.dataset.editingRecordId;
}

function findRecordConflict(recordDate, mealType, ignoredRecordId = "") {
  const record = findRecordForDate(recordDate, mealType);
  if (!record || record.id === ignoredRecordId) {
    return null;
  }

  return record;
}

function getActiveMealRecordDate(mealType) {
  const form = elements.forms[mealType];
  if (!form) {
    return "";
  }

  return form.elements.recordDate.value || "";
}

function renderTolerancePill(record) {
  if (record.status === "missing") {
    return '<span class="pill missing">No registró nada</span>';
  }

  if (!record.tolerance) {
    return '<span class="pill pending">Pendiente</span>';
  }

  return `<span class="pill ${record.tolerance}">${capitalize(record.tolerance)}</span>`;
}

function createStatCard(label, value) {
  return `
    <article class="stat-card">
      <strong>${value}</strong>
      <p>${label}</p>
    </article>
  `;
}

function createMetricSummaryCard(label, value, detail, tone) {
  return `
    <article class="metric-summary-card" style="background:${tone.background};color:${tone.color};">
      <strong>${value}</strong>
      <p>${label}</p>
      <p>${detail}</p>
    </article>
  `;
}

function createRecordId() {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatShortDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "short",
  }).format(new Date(year, month - 1, day));
}

function getDateAccentColor(dateKey) {
  const palette = [
    "#ff8a65",
    "#4fc3f7",
    "#ffd54f",
    "#81c784",
    "#ba68c8",
    "#ffb74d",
    "#64b5f6",
    "#f06292",
    "#4db6ac",
    "#9575cd",
  ];
  const hash = Array.from(dateKey).reduce((accumulator, character) => (
    (accumulator * 31 + character.charCodeAt(0)) % 2147483647
  ), 7);

  return palette[hash % palette.length];
}

function formatDateTime(isoString) {
  return new Intl.DateTimeFormat("es-UY", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(isoString));
}

function getLocalTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function normalizeStoredTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function combineLocalDateAndTime(dateKey, time) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function shiftDate(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getMealsEligibleForClosure(dateKey, referenceDate, options = {}) {
  if (options.forceDateKey === dateKey && dateKey !== getLocalDateKey(referenceDate)) {
    return Object.keys(DEFAULT_TIMES);
  }

  return Object.keys(DEFAULT_TIMES).filter((mealType) => (
    combineLocalDateAndTime(dateKey, DEFAULT_TIMES[mealType]) <= referenceDate
  ));
}

function collectDatesToClose(lastClosureKey, endKey, fallbackStartKey = null) {
  if (!isValidDateKey(endKey)) {
    return [];
  }

  const endDate = parseDateKey(endKey);
  const startKey = isValidDateKey(lastClosureKey)
    ? getLocalDateKey(shiftDate(parseDateKey(lastClosureKey), 1))
    : fallbackStartKey || endKey;
  if (!isValidDateKey(startKey)) {
    return [];
  }

  const startDate = parseDateKey(startKey);
  const dates = [];
  let cursor = new Date(startDate);

  while (cursor <= endDate) {
    dates.push(getLocalDateKey(cursor));
    cursor = shiftDate(cursor, 1);
  }

  return dates;
}

function deriveClosureStartKey(endKey) {
  if (!isValidDateKey(endKey)) {
    return null;
  }

  const lastTrackedDate = [
    ...state.records.map((record) => record.recordDate),
    ...state.dailyMetrics.map((metric) => metric.metricDate),
  ]
    .filter((dateKey) => isValidDateKey(dateKey) && dateKey < endKey)
    .sort((left, right) => right.localeCompare(left))[0];

  if (!lastTrackedDate) {
    return endKey;
  }

  const nextDate = getLocalDateKey(shiftDate(parseDateKey(lastTrackedDate), 1));
  return nextDate > endKey ? null : nextDate;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    !Number.isNaN(parsed.getTime())
    && parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day
  );
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getToleranceMeta(record, isEditing) {
  if (isEditing && record) {
    return `Editando tolerancia del ${formatDate(record.recordDate)}.`;
  }

  if (!record) {
    return "Primero guarda la comida para la fecha seleccionada. La tolerancia puede quedar pendiente.";
  }

  if (record.status === "missing") {
    return `Ese registro del ${formatDate(record.recordDate)} esta marcado como "no registro nada".`;
  }

  if (!record.tolerance) {
    return `Tolerancia pendiente para ${formatDate(record.recordDate)}. Podes cargarla mas tarde.`;
  }

  return `Tolerancia de ${formatDate(record.recordDate)}: ${capitalize(record.tolerance)}. Ultima actualizacion ${formatDateTime(record.toleranceUpdatedAt || record.updatedAt)}.`;
}

function renderMonthlyMetricsChart(metrics) {
  if (!elements.monthlyMetricsChartShell) {
    return;
  }

  const monthOptions = getAvailableMetricMonths(metrics);
  const hasMetrics = monthOptions.length > 0;

  if (!hasMetrics) {
    state.monthlyMetricsChartOpen = false;
    state.monthlyMetricsChartMonth = "";
  } else if (!state.monthlyMetricsChartMonth || !monthOptions.includes(state.monthlyMetricsChartMonth)) {
    state.monthlyMetricsChartMonth = monthOptions[0];
  }

  const toggleLabel = state.monthlyMetricsChartOpen ? "Ocultar grafica mensual" : "Ver grafica mensual";
  const selectedMetrics = hasMetrics
    ? sortDailyMetrics(filterMetricsByMonth(metrics, state.monthlyMetricsChartMonth)).reverse()
    : [];
  const glucoseMax = Math.max(...selectedMetrics.map((metric) => Number(metric.averageGlucose) || 0), 180);
  const monthSelectMarkup = hasMetrics
    ? `
      <label class="monthly-chart-filter">
        <span>Mes</span>
        <select data-monthly-metrics-month-select>
          ${monthOptions.map((monthKey) => (
            `<option value="${monthKey}"${state.monthlyMetricsChartMonth === monthKey ? " selected" : ""}>${formatMonthKey(monthKey)}</option>`
          )).join("")}
        </select>
      </label>
    `
    : "";

  const chartMarkup = !state.monthlyMetricsChartOpen
    ? ""
    : hasMetrics
      ? `
        <div class="monthly-chart-card">
          <div class="monthly-chart-header">
            <div>
              <h3>${formatMonthKey(state.monthlyMetricsChartMonth)}</h3>
              <p>Barras cronologicas por dia para detectar rapido control y descontrol.</p>
            </div>
            ${monthSelectMarkup}
          </div>
          <div class="monthly-chart-legend">
            <span><i class="legend-swatch tir"></i>Time in Range</span>
            <span><i class="legend-swatch glucose"></i>Average Glucose</span>
          </div>
          <div class="monthly-chart-scroll">
            <div class="monthly-chart-grid">
              ${selectedMetrics.map((metric) => renderMonthlyMetricColumn(metric, glucoseMax)).join("")}
            </div>
          </div>
        </div>
      `
      : `
        <div class="monthly-chart-card monthly-chart-empty">
          <div class="empty-state">Todavia no hay indicadores diarios para construir la grafica mensual.</div>
        </div>
      `;

  elements.monthlyMetricsChartShell.innerHTML = `
    <div class="monthly-chart-toggle-row">
      <button class="action-button ghost monthly-chart-toggle" data-action="toggle-monthly-metrics-chart" type="button"${hasMetrics ? "" : " disabled"}>
        ${toggleLabel}
      </button>
      <p class="monthly-chart-helper">${hasMetrics ? "Se despliega debajo sin cambiar la vista principal." : "Carga indicadores diarios para habilitar esta vista."}</p>
    </div>
    ${chartMarkup}
  `;

  const toggleButton = elements.monthlyMetricsChartShell.querySelector('[data-action="toggle-monthly-metrics-chart"]');
  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      state.monthlyMetricsChartOpen = !state.monthlyMetricsChartOpen;
      renderStats();
    });
  }

  const monthSelect = elements.monthlyMetricsChartShell.querySelector("[data-monthly-metrics-month-select]");
  if (monthSelect) {
    monthSelect.addEventListener("input", (event) => {
      state.monthlyMetricsChartMonth = event.target.value || monthOptions[0] || "";
      renderStats();
    });
  }
}

function renderMonthlyMetricColumn(metric, glucoseMax) {
  const dayLabel = String(parseDateKey(metric.metricDate).getDate()).padStart(2, "0");
  const tirValue = Number(metric.timeInRange) || 0;
  const glucoseValue = Number(metric.averageGlucose) || 0;
  const tirHeight = Math.max(10, Math.min(100, tirValue));
  const glucoseHeight = glucoseMax > 0 ? Math.max(10, Math.min(100, (glucoseValue / glucoseMax) * 100)) : 10;
  const tirTone = getMonthlyTirTone(tirValue);
  const glucoseTone = getMonthlyGlucoseTone(glucoseValue);

  return `
    <article class="monthly-chart-column">
      <div class="monthly-chart-bars">
        <div class="monthly-chart-bar-shell">
          <span class="monthly-chart-value">${formatPercentage(tirValue)}</span>
          <div class="monthly-chart-bar monthly-chart-bar-tir ${tirTone}" style="height:${tirHeight}%"></div>
        </div>
        <div class="monthly-chart-bar-shell">
          <span class="monthly-chart-value">${formatGlucose(glucoseValue)}</span>
          <div class="monthly-chart-bar monthly-chart-bar-glucose ${glucoseTone}" style="height:${glucoseHeight}%"></div>
        </div>
      </div>
      <div class="monthly-chart-day">${dayLabel}</div>
    </article>
  `;
}

function getMonthlyTirTone(value) {
  if (value >= 70) {
    return "is-good";
  }

  if (value >= 55) {
    return "is-mid";
  }

  return "is-alert";
}

function getMonthlyGlucoseTone(value) {
  if (value <= 154) {
    return "is-good";
  }

  if (value <= 180) {
    return "is-mid";
  }

  return "is-alert";
}

function hydrateMealFormForDate(mealType, dateKey) {
  const form = elements.forms[mealType];
  const targetDate = dateKey || getLocalDateKey(new Date());
  const record = findRecordForDate(targetDate, mealType);
  const isMissing = record?.status === "missing";

  form.elements.recordDate.value = targetDate;
  form.elements.scheduledTime.value = record?.scheduledTime || DEFAULT_TIMES[mealType];
  form.elements.markMissing.checked = false;
  form.elements.mealText.disabled = false;
  form.elements.mealText.value = isMissing ? "" : record?.mealText || "";

  if (record) {
    if (record.status === "missing") {
      elements.formMeta[mealType].textContent = `Ese ${MEAL_LABELS[mealType].toLowerCase()} quedo como "no registro nada". Podes reemplazarlo cargando la comida ahora.`;
    } else {
      elements.formMeta[mealType].textContent = `Ya existe un registro para ${formatDate(targetDate)}. Si guardas, se actualiza.`;
    }
  } else {
    elements.formMeta[mealType].textContent = "Se guarda con la fecha y hora local exacta del registro.";
  }
}

function hydrateToleranceFormForDate(mealType, dateKey) {
  const form = elements.toleranceForms[mealType];
  const targetDate = dateKey || getLocalDateKey(new Date());
  const editingRecord = form.dataset.editingRecordId ? findRecordById(form.dataset.editingRecordId) : null;
  const record = editingRecord || findRecordForDate(targetDate, mealType);
  const selectedTolerance = record?.tolerance || "verde";
  const radio = form.querySelector(`input[name="tolerance"][value="${selectedTolerance}"]`);

  form.dataset.recordDate = targetDate;

  if (radio) {
    radio.checked = true;
  }

  elements.toleranceMeta[mealType].textContent = getToleranceMeta(record, Boolean(editingRecord));
}

function getModalUI() {
  return {
    shell: document.getElementById("record-modal"),
    closeButton: document.getElementById("modal-close-button"),
    notice: document.getElementById("modal-notice"),
    mealMeta: document.getElementById("modal-meal-meta"),
    toleranceMeta: document.getElementById("modal-tolerance-meta"),
    mealForm: document.getElementById("modal-meal-form"),
    toleranceForm: document.getElementById("modal-tolerance-form"),
    quickEntryButton: document.getElementById("quick-entry-button"),
  };
}

function bindEvents() {
  Object.entries(elements.forms).forEach(([mealType, form]) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveMealRecord(mealType);
    });

    const missingToggle = form.elements.markMissing;
    const mealText = form.elements.mealText;

    missingToggle.addEventListener("change", () => {
      mealText.disabled = missingToggle.checked;
      if (missingToggle.checked) {
        mealText.value = "";
      }
    });

    form.elements.recordDate.addEventListener("input", () => {
      if (!form.dataset.editingRecordId) {
        hydrateMealFormForDate(mealType, form.elements.recordDate.value);
        hydrateToleranceFormForDate(mealType, form.elements.recordDate.value);
      }
    });
  });

  Object.entries(elements.toleranceForms).forEach(([mealType, form]) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveTolerance(mealType);
    });
  });

  Object.entries(elements.cancelEditButtons).forEach(([mealType, button]) => {
    button.addEventListener("click", () => {
      clearEditState(elements.forms[mealType]);
      render();
      setNotice(`Edicion de ${MEAL_LABELS[mealType].toLowerCase()} cancelada.`);
    });
  });

  Object.entries(elements.cancelToleranceButtons).forEach(([mealType, button]) => {
    button.addEventListener("click", () => {
      clearEditState(elements.toleranceForms[mealType]);
      render();
      setNotice(`Edicion de tolerancia de ${MEAL_LABELS[mealType].toLowerCase()} cancelada.`);
    });
  });

  elements.dailyMetricsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveDailyMetric();
  });
  elements.foodPredictionInput?.addEventListener("input", updateFoodPrediction);
  elements.digestiveEventSave.addEventListener("click", saveDigestiveEvent);
  elements.stressEventSave.addEventListener("click", saveStressEvent);
  elements.dailyMetricsForm.elements.metricDate.addEventListener("input", () => {
    if (!elements.dailyMetricsForm.dataset.editingMetricId) {
      renderDailyMetricsForm();
    }
  });
  elements.dailyMetricsCancel.addEventListener("click", () => {
    clearDailyMetricEditState();
    render();
    setNotice("Edicion de indicadores diarios cancelada.");
  });

  const modal = getModalUI();
  modal.quickEntryButton.addEventListener("click", () => {
    openRecordModal({
      dateKey: getLocalDateKey(new Date()),
      mealType: currentMealType(),
      section: "meal",
    });
  });
  modal.closeButton.addEventListener("click", closeRecordModal);
  modal.shell.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.closeModal === "true") {
      closeRecordModal();
    }
  });
  modal.mealForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveModalMeal();
  });
  modal.toleranceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveModalTolerance();
  });
  modal.mealForm.elements.markMissing.addEventListener("change", () => {
    const disabled = modal.mealForm.elements.markMissing.checked;
    modal.mealForm.elements.mealText.disabled = disabled;
    if (disabled) {
      modal.mealForm.elements.mealText.value = "";
    }
    refreshModalMeta();
  });
  ["recordDate", "mealType"].forEach((fieldName) => {
    modal.mealForm.elements[fieldName].addEventListener("input", () => {
      syncModalEditingRecord(modal.mealForm.elements.recordDate.value, modal.mealForm.elements.mealType.value);
      hydrateRecordModal(modal.mealForm.elements.recordDate.value, modal.mealForm.elements.mealType.value);
    });
  });

  elements.exportButton.addEventListener("click", exportRecords);
  elements.forceCloseButton.addEventListener("click", () => {
    const closureResult = runDailyClosure({ forceDateKey: getLocalDateKey(new Date()) });
    if (!closureResult.touchedDates.length) {
      setNotice("Se ejecuto el cierre manual para hoy. No habia faltantes para crear.");
    } else if (closureResult.createdCount > 0) {
      setNotice(`Se ejecuto el cierre manual para hoy y se marcaron ${closureResult.createdCount} faltante(s).`);
    } else {
      setNotice("Se ejecuto el cierre manual para hoy. No habia faltantes pendientes.");
    }
    render();
  });
  [elements.glucoseStart, elements.glucoseEnd].forEach((input) => {
    input.addEventListener("input", updateGlucoseCalculator);
  });
  [elements.filterFrom, elements.filterTo, elements.filterTolerance].forEach((control) => {
    control.addEventListener("input", () => {
      state.showAllHistory = false;
      renderHistory();
    });
  });
}
function renderHistory() {
  const records = sortRecords(getFilteredRecords());
  elements.historyBody.innerHTML = "";
  elements.historyMoreShell.innerHTML = "";

  if (!records.length) {
    elements.historyBody.innerHTML = '<tr><td colspan="9" class="empty-state">No hay registros con los filtros actuales.</td></tr>';
    return;
  }

  const visibleRecords = getVisibleHistoryRecords(records);

  visibleRecords.forEach((record) => {
    const dailyMetric = findDailyMetricByDate(record.recordDate);
    const row = elements.historyTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector('[data-cell="date"]').innerHTML = `
      <span class="history-date-label" style="color: ${getDateAccentColor(record.recordDate)};">
        ${formatDate(record.recordDate)}
      </span>
    `;
    row.querySelector('[data-cell="mealType"]').textContent = MEAL_LABELS[record.mealType];
    row.querySelector('[data-cell="scheduledTime"]').textContent = record.scheduledTime;
    row.querySelector('[data-cell="createdAt"]').textContent = formatDateTime(record.createdAt);
    row.querySelector('[data-cell="tolerance"]').innerHTML = renderTolerancePill(record);
    row.querySelector('[data-cell="timeInRange"]').innerHTML = renderHistoryMetricPill(
      dailyMetric ? formatPercentage(dailyMetric.timeInRange) : "Sin dato",
      dailyMetric ? getTimeInRangeTone(dailyMetric.timeInRange) : null
    );
    row.querySelector('[data-cell="averageGlucose"]').innerHTML = renderHistoryMetricPill(
      dailyMetric ? formatGlucose(dailyMetric.averageGlucose) : "Sin dato",
      dailyMetric ? getAverageGlucoseTone(dailyMetric.averageGlucose) : null
    );
    row.querySelector('[data-cell="detail"]').textContent = record.mealText;
    row.querySelector('[data-action="edit-meal"]').addEventListener("click", () => {
      openRecordModal({ record, section: "meal" });
    });
    row.querySelector('[data-action="edit-tolerance"]').addEventListener("click", () => {
      openRecordModal({ record, section: "tolerance" });
    });
    elements.historyBody.appendChild(row);
  });

  renderHistoryMoreButton(records, visibleRecords);
}

function getVisibleHistoryRecords(records) {
  if (state.showAllHistory) {
    return records;
  }

  const maxVisibleDays = 3;
  const visibleDateKeys = new Set();

  return records.filter((record) => {
    if (visibleDateKeys.has(record.recordDate)) {
      return true;
    }

    if (visibleDateKeys.size < maxVisibleDays) {
      visibleDateKeys.add(record.recordDate);
      return true;
    }

    return false;
  });
}

function renderHistoryMoreButton(records, visibleRecords) {
  const hiddenCount = records.length - visibleRecords.length;
  if (hiddenCount <= 0 && !state.showAllHistory) {
    return;
  }

  elements.historyMoreShell.innerHTML = `
    <button class="table-action" data-action="toggle-history" type="button">
      ${state.showAllHistory ? "Mostrar menos" : `Mostrar mas (${hiddenCount} registros)`}
    </button>
  `;

  elements.historyMoreShell.querySelector('[data-action="toggle-history"]').addEventListener("click", () => {
    state.showAllHistory = !state.showAllHistory;
    renderHistory();
  });
}

function renderHistoryMetricPill(label, tone) {
  if (!tone) {
    return '<span class="history-metric-pill history-metric-pill-empty">Sin dato</span>';
  }

  return `<span class="history-metric-pill" style="background:${tone.background};color:${tone.color};">${label}</span>`;
}

function populateFormForEdit(record) {
  openRecordModal({ record, section: "meal" });
}

function populateToleranceForm(record) {
  openRecordModal({ record, section: "tolerance" });
}

function saveDailyMetric() {
  const form = elements.dailyMetricsForm;
  const now = new Date();
  const metricDate = form.elements.metricDate.value || getLocalDateKey(now);
  const timeInRange = Number(form.elements.timeInRange.value);
  const averageGlucose = Number(form.elements.averageGlucose.value);
  const editingMetric = form.dataset.editingMetricId ? findDailyMetricById(form.dataset.editingMetricId) : null;
  const sameDateMetric = findDailyMetricByDate(metricDate);
  const timestamp = now.toISOString();

  if (!Number.isFinite(timeInRange) || timeInRange < 0 || timeInRange > 100) {
    setNotice("El tiempo en rango debe estar entre 0% y 100%.");
    return;
  }

  if (!Number.isFinite(averageGlucose) || averageGlucose < 0) {
    setNotice("La glucosa media debe ser un valor valido en mg/dL.");
    return;
  }

  if (averageGlucose > 500) {
    setNotice("La glucosa media no puede superar 500 mg/dL.");
    return;
  }

  if (editingMetric && sameDateMetric && sameDateMetric.id !== editingMetric.id) {
    setNotice(`Ya existe un indicador diario para ${formatDate(metricDate)}.`);
    return;
  }

  const existingMetric = editingMetric || sameDateMetric;

  const metric = existingMetric || {
    id: createMetricId(),
    metricDate,
    createdAt: timestamp,
  };

  metric.metricDate = metricDate;
  metric.timeInRange = roundMetric(timeInRange);
  metric.averageGlucose = roundMetric(averageGlucose);
  metric.updatedAt = timestamp;
  metric.createdAt = existingMetric ? existingMetric.createdAt : timestamp;

  upsertDailyMetric(metric);
  clearDailyMetricEditState();
  render();
  setNotice(
    existingMetric
      ? `Indicadores diarios actualizados para ${formatDate(metricDate)}.`
      : `Indicadores diarios guardados para ${formatDate(metricDate)}.`
  );
}

function saveDigestiveEvent() {
  const form = elements.dailyMetricsForm;
  const eventType = form.elements.digestiveEvent.value || "";
  const editingEvent = form.dataset.editingDigestiveEventId ? findDigestiveEventById(form.dataset.editingDigestiveEventId) : null;

  if (!eventType) {
    setNotice("Elegi estrenimiento o diarrea para guardar el dato extra.");
    return;
  }

  const timestamp = new Date().toISOString();
  if (editingEvent) {
    editingEvent.eventType = eventType;
  } else {
    state.digestiveEvents.push({
      id: createDigestiveEventId(),
      eventType,
      recordedAt: timestamp,
      source: "manual",
    });
  }
  const savedTimestamp = editingEvent?.recordedAt || timestamp;
  persistDigestiveEvents();
  clearDigestiveEventEditState();
  renderStats();
  setNotice(
    editingEvent
      ? `${formatDigestiveEvent(eventType)} actualizado para ${formatDateTime(savedTimestamp)}.`
      : `${formatDigestiveEvent(eventType)} registrado como dato extra para ${formatDateTime(savedTimestamp)}.`
  );
}

function saveStressEvent() {
  const form = elements.dailyMetricsForm;
  const stressLevel = form.elements.stressEvent.value || "";
  const editingEvent = form.dataset.editingStressEventId ? findStressEventById(form.dataset.editingStressEventId) : null;

  if (!stressLevel) {
    setNotice("Marca hubo estres para guardar este dato.");
    return;
  }

  const timestamp = new Date().toISOString();
  if (editingEvent) {
    editingEvent.stressLevel = stressLevel;
  } else {
    state.stressEvents.push({
      id: createStressEventId(),
      stressLevel,
      recordedAt: timestamp,
      source: "manual",
    });
  }
  const savedTimestamp = editingEvent?.recordedAt || timestamp;
  persistStressEvents();
  clearStressEventEditState();
  renderStats();
  setNotice(
    editingEvent
      ? `${formatStressEvent(stressLevel)} actualizado para ${formatDateTime(savedTimestamp)}.`
      : `${formatStressEvent(stressLevel)} registrado para ${formatDateTime(savedTimestamp)}.`
  );
}

function populateDailyMetricForm(metric) {
  const form = elements.dailyMetricsForm;
  form.dataset.editingMetricId = metric.id;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  renderDailyMetricsForm();
  setNotice(`Editando indicadores diarios del ${formatDate(metric.metricDate)}.`);
}

function clearDailyMetricEditState() {
  const form = elements.dailyMetricsForm;
  delete form.dataset.editingMetricId;
  form.reset();
  form.elements.metricDate.value = getLocalDateKey(new Date());
  clearDigestiveEventEditState();
  clearStressEventEditState();
}

function clearDigestiveEventEditState() {
  const form = elements.dailyMetricsForm;
  delete form.dataset.editingDigestiveEventId;
  form.elements.digestiveEvent.value = "";
  elements.digestiveEventSave.textContent = "Guardar dato extra";
  elements.digestiveEventMeta.textContent = "Solo se guarda si paso algo. Usa la fecha y hora actual del sistema como marca extra para el JSON.";
}

function clearStressEventEditState() {
  const form = elements.dailyMetricsForm;
  delete form.dataset.editingStressEventId;
  form.elements.stressEvent.value = "";
  elements.stressEventSave.textContent = "Guardar estrés";
  elements.stressEventMeta.textContent = "Se guarda aparte y usa la fecha y hora local exacta del momento del registro.";
}

function upsertDailyMetric(metric) {
  const index = state.dailyMetrics.findIndex((item) => item.id === metric.id);
  if (index >= 0) {
    state.dailyMetrics[index] = metric;
  } else {
    state.dailyMetrics.push(metric);
  }

  persistDailyMetrics();
}

function removeDailyMetric(metricId) {
  state.dailyMetrics = state.dailyMetrics.filter((metric) => metric.id !== metricId);

  if (elements.dailyMetricsForm.dataset.editingMetricId === metricId) {
    clearDailyMetricEditState();
  }

  persistDailyMetrics();
}

function findDailyMetricByDate(metricDate) {
  return state.dailyMetrics.find((metric) => metric.metricDate === metricDate) || null;
}

function findDailyMetricById(metricId) {
  return state.dailyMetrics.find((metric) => metric.id === metricId) || null;
}

function sortDailyMetrics(metrics) {
  return [...metrics].sort((left, right) => right.metricDate.localeCompare(left.metricDate));
}

function computeDailyMetricStats(metrics) {
  const sortedMetrics = sortDailyMetrics(metrics);
  const totalDays = sortedMetrics.length;
  const averageTimeInRange = totalDays
    ? roundMetric(sortedMetrics.reduce((sum, metric) => sum + Number(metric.timeInRange || 0), 0) / totalDays)
    : null;
  const averageGlucose = totalDays
    ? roundMetric(sortedMetrics.reduce((sum, metric) => sum + Number(metric.averageGlucose || 0), 0) / totalDays)
    : null;

  return {
    totalDays,
    averageTimeInRange,
    averageGlucose,
    averageTimeInRangeDisplay: averageTimeInRange === null ? "Sin datos" : formatPercentage(averageTimeInRange),
    averageGlucoseDisplay: averageGlucose === null ? "Sin datos" : formatGlucose(averageGlucose),
    inTargetDays: sortedMetrics.filter((metric) => Number(metric.timeInRange) >= 70).length,
    glucoseInTargetDays: sortedMetrics.filter((metric) => Number(metric.averageGlucose) <= 154).length,
    sortedMetrics,
  };
}

function createMetricId() {
  return `met_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createDigestiveEventId() {
  return `dig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createStressEventId() {
  return `str_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function roundMetric(value) {
  return Math.round(value * 10) / 10;
}

function formatDigestiveEvent(value) {
  if (value === "constipation") {
    return "Estrenimiento";
  }

  if (value === "diarrhea") {
    return "Diarrea";
  }

  return "Dato extra";
}

function formatStressEvent(value) {
  if (value === "yes") {
    return "Hubo estres";
  }

  return "Estres";
}

function compareStoredTimestamps(left, right) {
  return new Date(right).getTime() - new Date(left).getTime();
}

function sortDigestiveEvents(events) {
  return [...events].sort((left, right) => compareStoredTimestamps(left.recordedAt, right.recordedAt));
}

function sortStressEvents(events) {
  return [...events].sort((left, right) => compareStoredTimestamps(left.recordedAt, right.recordedAt));
}

function formatPercentage(value) {
  return `${roundMetric(value)}%`;
}

function formatGlucose(value) {
  return `${roundMetric(value)} mg/dL`;
}

function estimateA1cFromAverageGlucose(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return roundMetric((value + 46.7) / 28.7);
}

function formatEstimatedA1c(value) {
  return Number.isFinite(value) ? `${roundMetric(value)}%` : "Sin datos";
}

function getTimeInRangeTone(value) {
  if (!Number.isFinite(value)) {
    return { background: "rgba(148, 163, 184, 0.7)", color: "#06111d" };
  }

  const background = value >= 90
    ? interpolateColor(value, 90, 100, "#6ee7b7", "#bef264")
    : value >= 70
      ? interpolateColor(value, 70, 90, "#166534", "#8fefad")
      : interpolateMultiStop(value, [
          { value: 0, color: "#dc2626" },
          { value: 35, color: "#f97316" },
          { value: 55, color: "#ea9a3b" },
          { value: 70, color: "#b88a2f" },
        ]);

  return { background, color: getReadableTextColor(background) };
}

function getAverageGlucoseTone(value) {
  if (!Number.isFinite(value)) {
    return { background: "rgba(148, 163, 184, 0.7)", color: "#06111d" };
  }

  const background = value <= 126
    ? "#8fefad"
    : value <= 154
      ? interpolateColor(value, 126, 154, "#8fefad", "#166534")
      : interpolateMultiStop(Math.min(value, 240), [
          { value: 154, color: "#facc15" },
          { value: 180, color: "#f97316" },
          { value: 240, color: "#dc2626" },
        ]);

  return { background, color: getReadableTextColor(background) };
}

function getEstimatedA1cTone(value) {
  if (!Number.isFinite(value)) {
    return { background: "rgba(148, 163, 184, 0.18)", color: "#e2e8f0" };
  }

  const background = value <= 7
    ? interpolateColor(Math.max(value, 5), 5, 7, "#166534", "#8fefad")
    : interpolateMultiStop(Math.min(value, 12), [
        { value: 7, color: "#8fefad" },
        { value: 8, color: "#facc15" },
        { value: 9, color: "#f97316" },
        { value: 10, color: "#ef4444" },
        { value: 12, color: "#991b1b" },
      ]);

  return { background, color: getReadableTextColor(background) };
}

function interpolateMultiStop(value, stops) {
  if (value <= stops[0].value) {
    return stops[0].color;
  }

  for (let index = 1; index < stops.length; index += 1) {
    if (value <= stops[index].value) {
      return interpolateColor(value, stops[index - 1].value, stops[index].value, stops[index - 1].color, stops[index].color);
    }
  }

  return stops[stops.length - 1].color;
}

function interpolateColor(value, min, max, startColor, endColor) {
  if (max <= min) {
    return endColor;
  }

  const clampedRatio = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const start = hexToRgb(startColor);
  const end = hexToRgb(endColor);
  const mix = {
    r: Math.round(start.r + (end.r - start.r) * clampedRatio),
    g: Math.round(start.g + (end.g - start.g) * clampedRatio),
    b: Math.round(start.b + (end.b - start.b) * clampedRatio),
  };

  return rgbToHex(mix);
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((item) => item + item).join("")
    : normalized;

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((item) => item.toString(16).padStart(2, "0")).join("")}`;
}

function getReadableTextColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#06111d" : "#f8fafc";
}

function currentMealType() {
  return new Date().getHours() < 18 ? "lunch" : "dinner";
}

function getModalRecordForSelection(dateKey, mealType) {
  const modal = getModalUI();
  const editingRecordId = modal.shell.dataset.editingRecordId || "";
  const editingRecord = editingRecordId ? findRecordById(editingRecordId) : null;

  if (editingRecord && editingRecord.recordDate === dateKey && editingRecord.mealType === mealType) {
    return editingRecord;
  }

  return findRecordForDate(dateKey, mealType);
}

function renderForms() {
  const todayKey = getLocalDateKey(new Date());

  ["lunch", "dinner"].forEach((mealType) => {
    const form = elements.forms[mealType];
    if (form.dataset.editingRecordId) {
      const editingRecord = findRecordById(form.dataset.editingRecordId);
      if (editingRecord) {
        form.elements.recordDate.value = editingRecord.recordDate;
        form.elements.scheduledTime.value = editingRecord.scheduledTime;
        form.elements.markMissing.checked = false;
        form.elements.mealText.disabled = false;
        form.elements.mealText.value = editingRecord.status === "missing" ? "" : editingRecord.mealText;
        elements.formMeta[mealType].textContent = `Editando registro del ${formatDate(editingRecord.recordDate)}.`;
      } else {
        clearEditState(form);
        hydrateMealFormForDate(mealType, form.elements.recordDate.value || todayKey);
      }
    } else {
      const selectedDate = form.elements.recordDate.value || todayKey;
      hydrateMealFormForDate(mealType, selectedDate);
    }
  });

  ["lunch", "dinner"].forEach((mealType) => {
    const form = elements.toleranceForms[mealType];
    const editingRecord = form.dataset.editingRecordId ? findRecordById(form.dataset.editingRecordId) : null;
    const activeDate = getActiveMealRecordDate(mealType) || todayKey;
    hydrateToleranceFormForDate(mealType, editingRecord?.recordDate || activeDate);
  });
}

function openRecordModal({ record = null, dateKey = "", mealType = "lunch", section = "meal" }) {
  const modal = getModalUI();
  const targetDate = record?.recordDate || dateKey || getLocalDateKey(new Date());
  const targetMealType = record?.mealType || mealType;
  modal.shell.hidden = false;
  modal.shell.dataset.section = section;
  modal.shell.dataset.editingRecordId = record?.id || "";
  modal.shell.dataset.sourceRecordId = record?.id || "";
  hydrateRecordModal(targetDate, targetMealType);
  if (section === "tolerance") {
    modal.toleranceForm.scrollIntoView({ block: "nearest" });
  }
}

function closeRecordModal() {
  const modal = getModalUI();
  modal.shell.hidden = true;
  delete modal.shell.dataset.editingRecordId;
  delete modal.shell.dataset.sourceRecordId;
  modal.notice.textContent = "";
  modal.notice.classList.remove("is-visible");
}

function syncModalEditingRecord(dateKey, mealType) {
  const modal = getModalUI();
  const sourceRecordId = modal.shell.dataset.sourceRecordId || "";
  const sourceRecord = sourceRecordId ? findRecordById(sourceRecordId) : null;

  if (sourceRecord && sourceRecord.recordDate === dateKey && sourceRecord.mealType === mealType) {
    modal.shell.dataset.editingRecordId = sourceRecord.id;
    return;
  }

  delete modal.shell.dataset.editingRecordId;
}

function saveMealRecord(mealType) {
  const form = elements.forms[mealType];
  const now = new Date();
  const editingRecordId = form.dataset.editingRecordId || "";
  const editingRecord = editingRecordId ? findRecordById(editingRecordId) : null;
  const recordDate = form.elements.recordDate.value || editingRecord?.recordDate || getLocalDateKey(now);
  const scheduledTime = form.elements.scheduledTime.value || DEFAULT_TIMES[mealType];
  const markMissing = form.elements.markMissing.checked;
  const mealText = form.elements.mealText.value.trim();
  const existingRecord = editingRecord || findRecordForDate(recordDate, mealType);
  const conflictingRecord = findRecordConflict(recordDate, mealType, editingRecord?.id || "");
  const timestamp = now.toISOString();

  if (!markMissing && !mealText) {
    setNotice(`Escribi el ${MEAL_LABELS[mealType].toLowerCase()} completo o marca "no registro nada".`);
    return;
  }

  if (conflictingRecord) {
    setNotice(`Ya existe un ${MEAL_LABELS[mealType].toLowerCase()} para ${formatDate(recordDate)}. Elegi otra fecha o edita ese registro desde el historial.`);
    return;
  }

  const record = existingRecord || {
    id: createRecordId(),
    mealType,
    recordDate,
    createdAt: timestamp,
  };

  record.mealType = mealType;
  record.recordDate = recordDate;
  record.scheduledTime = scheduledTime;
  record.status = markMissing ? "missing" : "recorded";
  record.mealText = markMissing ? "No registro nada" : mealText;
  record.tolerance = markMissing ? null : existingRecord?.tolerance ?? null;
  record.toleranceUpdatedAt = markMissing ? null : existingRecord?.toleranceUpdatedAt ?? null;
  record.updatedAt = timestamp;
  record.createdAt = existingRecord ? existingRecord.createdAt : timestamp;

  upsertRecord(record);
  clearEditState(form);
  form.reset();

  setNotice(
    existingRecord
      ? `${MEAL_LABELS[mealType]} actualizado para ${formatDate(recordDate)}.`
      : `${MEAL_LABELS[mealType]} guardado para ${formatDate(recordDate)}.`
  );

  render();
}

function hydrateRecordModal(dateKey, mealType) {
  const modal = getModalUI();
  const mealForm = modal.mealForm;
  const toleranceForm = modal.toleranceForm;
  const record = getModalRecordForSelection(dateKey, mealType);
  const isMissing = record?.status === "missing";
  const selectedTolerance = record?.tolerance || "verde";

  mealForm.elements.recordDate.value = dateKey;
  mealForm.elements.mealType.value = mealType;
  mealForm.elements.scheduledTime.value = record?.scheduledTime || DEFAULT_TIMES[mealType];
  mealForm.elements.markMissing.checked = false;
  mealForm.elements.mealText.disabled = false;
  mealForm.elements.mealText.value = isMissing ? "" : record?.mealText || "";

  const toleranceRadio = toleranceForm.querySelector(`input[name="tolerance"][value="${selectedTolerance}"]`);
  if (toleranceRadio) {
    toleranceRadio.checked = true;
  }

  if (record?.status === "missing") {
    modal.notice.textContent = `${MEAL_LABELS[mealType]} de ${formatDate(dateKey)} quedo como "no registro nada". Podes cargar la comida ahora.`;
    modal.notice.classList.add("is-visible");
  } else {
    modal.notice.textContent = "";
    modal.notice.classList.remove("is-visible");
  }

  refreshModalMeta();
}

function refreshModalMeta() {
  const modal = getModalUI();
  const dateKey = modal.mealForm.elements.recordDate.value;
  const mealType = modal.mealForm.elements.mealType.value;
  const editingRecordId = modal.shell.dataset.editingRecordId || "";
  const record = getModalRecordForSelection(dateKey, mealType);
  const conflictingRecord = editingRecordId ? findRecordConflict(dateKey, mealType, editingRecordId) : null;
  const isMissing = record?.status === "missing";
  const mealTypeLabel = MEAL_LABELS[mealType].toLowerCase();

  if (conflictingRecord) {
    modal.mealMeta.textContent = `Ya existe un ${mealTypeLabel} para ${formatDate(dateKey)}. Guardar aca generaria un conflicto, asi que ese cambio queda bloqueado.`;
  } else if (record) {
    modal.mealMeta.textContent = isMissing
      ? `Ese ${mealTypeLabel} faltaba. Esta ventana te deja reemplazarlo sin ir al formulario principal.`
      : `Ya existe un registro para ${formatDate(dateKey)}. Si guardas, se actualizara.`;
  } else {
    modal.mealMeta.textContent = "Podes completar o corregir registros viejos desde esta ventana.";
  }

  if (!record) {
    modal.toleranceMeta.textContent = `Primero guarda el ${mealTypeLabel}. Despues podes registrar su tolerancia aca mismo.`;
    return;
  }

  if (record.status === "missing") {
    modal.toleranceMeta.textContent = "Ese registro esta marcado como \"no registro nada\". Carga la comida primero.";
    return;
  }

  if (!record.tolerance) {
    modal.toleranceMeta.textContent = "Tolerancia pendiente. Podes cargarla ahora.";
    return;
  }

  modal.toleranceMeta.textContent = `Tolerancia actual: ${capitalize(record.tolerance)}. Ultima actualizacion ${formatDateTime(record.toleranceUpdatedAt || record.updatedAt)}.`;
}

function saveModalMeal() {
  const modal = getModalUI();
  const now = new Date();
  const recordDate = modal.mealForm.elements.recordDate.value || getLocalDateKey(now);
  const mealType = modal.mealForm.elements.mealType.value;
  const scheduledTime = modal.mealForm.elements.scheduledTime.value || DEFAULT_TIMES[mealType];
  const markMissing = modal.mealForm.elements.markMissing.checked;
  const mealText = modal.mealForm.elements.mealText.value.trim();
  const editingRecordId = modal.shell.dataset.editingRecordId || "";
  const editingRecord = editingRecordId ? findRecordById(editingRecordId) : null;
  const existingRecord = editingRecord || findRecordForDate(recordDate, mealType);
  const conflictingRecord = findRecordConflict(recordDate, mealType, editingRecord?.id || "");
  const timestamp = now.toISOString();

  if (!markMissing && !mealText) {
    modal.notice.textContent = `Escribi el ${MEAL_LABELS[mealType].toLowerCase()} completo o marca "no registro nada".`;
    modal.notice.classList.add("is-visible");
    return;
  }

  if (conflictingRecord) {
    modal.notice.textContent = `Ya existe un ${MEAL_LABELS[mealType].toLowerCase()} para ${formatDate(recordDate)}. No se puede mover este registro a una fecha ocupada.`;
    modal.notice.classList.add("is-visible");
    return;
  }

  const record = existingRecord || {
    id: createRecordId(),
    mealType,
    recordDate,
    createdAt: timestamp,
  };

  record.mealType = mealType;
  record.recordDate = recordDate;
  record.scheduledTime = scheduledTime;
  record.status = markMissing ? "missing" : "recorded";
  record.mealText = markMissing ? "No registro nada" : mealText;
  record.tolerance = markMissing ? null : existingRecord?.tolerance ?? null;
  record.toleranceUpdatedAt = markMissing ? null : existingRecord?.toleranceUpdatedAt ?? null;
  record.updatedAt = timestamp;
  record.createdAt = existingRecord ? existingRecord.createdAt : timestamp;

  upsertRecord(record);
  modal.shell.dataset.editingRecordId = record.id;
  modal.shell.dataset.sourceRecordId = record.id;
  modal.notice.textContent = `${MEAL_LABELS[mealType]} ${existingRecord ? "actualizado" : "guardado"} para ${formatDate(recordDate)}.`;
  modal.notice.classList.add("is-visible");
  hydrateRecordModal(recordDate, mealType);
  render();
}

function saveModalTolerance() {
  const modal = getModalUI();
  const recordDate = modal.mealForm.elements.recordDate.value;
  const mealType = modal.mealForm.elements.mealType.value;
  const record = getModalRecordForSelection(recordDate, mealType);

  if (!record) {
    modal.notice.textContent = `Primero guarda el ${MEAL_LABELS[mealType].toLowerCase()} antes de registrar tolerancia.`;
    modal.notice.classList.add("is-visible");
    return;
  }

  if (record.status === "missing") {
    modal.notice.textContent = "Ese registro esta marcado como \"no registro nada\". Carga la comida primero.";
    modal.notice.classList.add("is-visible");
    return;
  }

  record.tolerance = modal.toleranceForm.elements.tolerance.value;
  record.toleranceUpdatedAt = new Date().toISOString();
  record.updatedAt = record.toleranceUpdatedAt;
  upsertRecord(record);

  modal.notice.textContent = `Tolerancia de ${MEAL_LABELS[mealType].toLowerCase()} actualizada para ${formatDate(recordDate)}.`;
  modal.notice.classList.add("is-visible");
  hydrateRecordModal(recordDate, mealType);
  render();
}

