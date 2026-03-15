const STORAGE_KEY = "diabetes-control-records-v1";
const DAILY_METRICS_KEY = "diabetes-control-daily-metrics-v1";
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
  showAllDailyMetrics: false,
  showAllHistory: false,
};

const elements = {
  todayLabel: document.getElementById("today-label"),
  notice: document.getElementById("notice"),
  statsGrid: document.getElementById("stats-grid"),
  dailyMetricsSummary: document.getElementById("daily-metrics-summary"),
  dailyMetricsBoard: document.getElementById("daily-metrics-board"),
  timelineChart: document.getElementById("timeline-chart"),
  mealBreakdown: document.getElementById("meal-breakdown"),
  missingSummary: document.getElementById("missing-summary"),
  historyBody: document.getElementById("history-body"),
  historyMoreShell: document.getElementById("history-more-shell"),
  exportButton: document.getElementById("export-button"),
  forceCloseButton: document.getElementById("force-close-button"),
  dailyMetricsForm: document.getElementById("daily-metrics-form"),
  dailyMetricsMeta: document.getElementById("daily-metrics-meta"),
  dailyMetricsCancel: document.getElementById("daily-metrics-cancel"),
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
  render();
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
      setNotice(`Edición de ${MEAL_LABELS[mealType].toLowerCase()} cancelada.`);
    });
  });

  Object.entries(elements.cancelToleranceButtons).forEach(([mealType, button]) => {
    button.addEventListener("click", () => {
      clearEditState(elements.toleranceForms[mealType]);
      render();
      setNotice(`Edición de tolerancia de ${MEAL_LABELS[mealType].toLowerCase()} cancelada.`);
    });
  });

  elements.exportButton.addEventListener("click", exportRecords);
  elements.forceCloseButton.addEventListener("click", () => {
    runDailyClosure({ forceDateKey: getLocalDateKey(new Date()) });
    setNotice("Se ejecutó el cierre diario manualmente para hoy.");
    render();
  });

  [elements.filterFrom, elements.filterTo, elements.filterTolerance].forEach((control) => {
    control.addEventListener("input", renderHistory);
  });
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
  const timestamp = now.toISOString();

  if (!markMissing && !mealText) {
    setNotice(`Escribí el ${MEAL_LABELS[mealType].toLowerCase()} completo o marcá “no registró nada”.`);
    return;
  }

  const record = existingRecord || {
    id: createRecordId(),
    mealType,
    recordDate,
    createdAt: timestamp,
  };

  record.scheduledTime = scheduledTime;
  record.status = markMissing ? "missing" : "recorded";
  record.mealText = markMissing ? "No registró nada" : mealText;
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

function saveTolerance(mealType) {
  const form = elements.toleranceForms[mealType];
  const now = new Date();
  const editingRecordId = form.dataset.editingRecordId || "";
  const editingRecord = editingRecordId ? findRecordById(editingRecordId) : null;
  const recordDate = editingRecord?.recordDate || getLocalDateKey(now);
  const record = editingRecord || findRecordForDate(recordDate, mealType);

  if (!record) {
    setNotice(`Primero guardá el ${MEAL_LABELS[mealType].toLowerCase()} antes de registrar tolerancia.`);
    return;
  }

  if (record.status === "missing") {
    setNotice(`No se puede asignar tolerancia a un registro marcado como “no registró nada”.`);
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
  const lastClosure = localStorage.getItem(CLOSURE_KEY);
  const endKey = options.forceDateKey || getLocalDateKey(previousDay);

  if (!options.forceDateKey && lastClosure === endKey) {
    return;
  }

  const datesToClose = collectDatesToClose(lastClosure, endKey);
  if (!datesToClose.length) {
    return;
  }

  let changed = false;
  datesToClose.forEach((dateKey) => {
    ["lunch", "dinner"].forEach((mealType) => {
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
    });
  });

  localStorage.setItem(CLOSURE_KEY, endKey);
  if (changed) {
    persistRecords();
  }
}

function render() {
  elements.todayLabel.textContent = formatDate(getLocalDateKey(new Date()));
  renderForms();
  renderDailyMetricsForm();
  renderStats();
  renderHistory();
}

function renderForms() {
  const todayKey = getLocalDateKey(new Date());

  ["lunch", "dinner"].forEach((mealType) => {
    const form = elements.forms[mealType];
    if (form.dataset.editingRecordId) {
      elements.formMeta[mealType].textContent = `Editando registro del ${formatDate(findRecordById(form.dataset.editingRecordId).recordDate)}.`;
    } else {
      const record = findRecordForDate(todayKey, mealType);
      const isMissing = record?.status === "missing";

      form.elements.scheduledTime.value = record?.scheduledTime || DEFAULT_TIMES[mealType];
      form.elements.markMissing.checked = Boolean(isMissing);
      form.elements.mealText.disabled = Boolean(isMissing);
      form.elements.mealText.value = isMissing ? "" : record?.mealText || "";

      elements.formMeta[mealType].textContent = record
        ? `Última actualización: ${formatDateTime(record.updatedAt)}`
        : "Se guardará con la fecha y hora local exacta del registro.";
    }
  });

  ["lunch", "dinner"].forEach((mealType) => {
    const form = elements.toleranceForms[mealType];
    const editingRecord = form.dataset.editingRecordId ? findRecordById(form.dataset.editingRecordId) : null;
    const record = editingRecord || findRecordForDate(todayKey, mealType);
    const selectedTolerance = record?.tolerance || "verde";
    const radio = form.querySelector(`input[name="tolerance"][value="${selectedTolerance}"]`);

    if (radio) {
      radio.checked = true;
    }

    elements.toleranceMeta[mealType].textContent = getToleranceMeta(record, Boolean(editingRecord));
  });
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
    elements.dailyMetricsMeta.textContent = `Editando indicadores del ${formatDate(editingMetric.metricDate)}. Se actualizará el mismo día sin duplicarlo.`;
    return;
  }

  const selectedDate = form.elements.metricDate.value || todayKey;
  const existingMetric = findDailyMetricByDate(selectedDate);
  form.elements.metricDate.value = selectedDate;
  form.elements.timeInRange.value = existingMetric?.timeInRange ?? "";
  form.elements.averageGlucose.value = existingMetric?.averageGlucose ?? "";
  elements.dailyMetricsMeta.textContent = existingMetric
    ? `Ya existe un indicador para ${formatDate(selectedDate)}. Si guardás, se actualizará.`
    : "Este registro es independiente de almuerzo y cena. Puede tener otra fecha y se exporta en JSON.";
}

function renderStats() {
  const stats = computeStats(state.records);
  const dailyMetricStats = computeDailyMetricStats(state.dailyMetrics);

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

  renderTimeline(stats.timeline);
  renderMealBreakdown(stats.breakdownByMeal);
  renderMissingSummary(stats.missingCount);
  renderDailyMetricsBoard(dailyMetricStats.sortedMetrics);
}

function renderTimeline(timeline) {
  if (!timeline.length) {
    elements.timelineChart.innerHTML = '<div class="empty-state">Todavía no hay registros para mostrar tendencia.</div>';
    return;
  }

  elements.timelineChart.innerHTML = timeline.map((item) => {
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
}

function renderMealBreakdown(breakdown) {
  elements.mealBreakdown.innerHTML = ["lunch", "dinner"].map((mealType) => {
    const item = breakdown[mealType];
    return `
      <div class="mini-line"><strong>${MEAL_LABELS[mealType]}</strong><span>${item.total} total</span></div>
      <div class="mini-line"><span>Pendiente</span><span>${item.pending}</span></div>
      <div class="mini-line"><span>Verde</span><span>${item.verde}</span></div>
      <div class="mini-line"><span>Amarillo</span><span>${item.amarillo}</span></div>
      <div class="mini-line"><span>Rojo</span><span>${item.rojo}</span></div>
    `;
  }).join("");
}

function renderMissingSummary(missingCount) {
  elements.missingSummary.innerHTML = `
    <div class="mini-line"><strong>Registros faltantes</strong><span>${missingCount}</span></div>
    <div class="mini-line"><span>Creación automática</span><span>Al cierre del día</span></div>
    <div class="mini-line"><span>Edición posterior</span><span>Permitida</span></div>
  `;
}

function renderDailyMetricsBoard(metrics) {
  if (!metrics.length) {
    elements.dailyMetricsBoard.innerHTML = '<div class="metric-day-empty">Todavía no hay indicadores diarios cargados.</div>';
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

function populateFormForEdit(record) {
  const form = elements.forms[record.mealType];
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.dataset.editingRecordId = record.id;
  form.elements.scheduledTime.value = record.scheduledTime;
  form.elements.markMissing.checked = record.status === "missing";
  form.elements.mealText.disabled = record.status === "missing";
  form.elements.mealText.value = record.status === "missing" ? "" : record.mealText;

  setNotice(`Editando ${MEAL_LABELS[record.mealType].toLowerCase()} del ${formatDate(record.recordDate)}. Guardá para aplicar cambios.`);
  elements.formMeta[record.mealType].textContent = `Editando registro del ${formatDate(record.recordDate)}. Al guardar, se actualizará ese día.`;
}

function populateToleranceForm(record) {
  const form = elements.toleranceForms[record.mealType];

  if (record.status === "missing") {
    setNotice("Ese registro está marcado como “no registró nada”, así que no admite tolerancia.");
    return;
  }

  form.dataset.editingRecordId = record.id;
  const selectedTolerance = record.tolerance || "verde";
  const radio = form.querySelector(`input[name="tolerance"][value="${selectedTolerance}"]`);
  if (radio) {
    radio.checked = true;
  }

  form.scrollIntoView({ behavior: "smooth", block: "start" });
  elements.toleranceMeta[record.mealType].textContent = `Editando tolerancia del ${formatDate(record.recordDate)}.`;
  setNotice(`Cargando tolerancia para ${MEAL_LABELS[record.mealType].toLowerCase()} del ${formatDate(record.recordDate)}.`);
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
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `diabetes-control-${getLocalDateKey(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);

  setNotice("Exportación JSON lista.");
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
    return Array.isArray(parsed) ? parsed : [];
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
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("No se pudieron leer los indicadores diarios guardados.", error);
    return [];
  }
}

function persistRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
}

function persistDailyMetrics() {
  localStorage.setItem(DAILY_METRICS_KEY, JSON.stringify(state.dailyMetrics));
}

function setNotice(message) {
  elements.notice.textContent = message;
  elements.notice.classList.toggle("is-visible", Boolean(message));
}

function clearEditState(form) {
  delete form.dataset.editingRecordId;
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

function formatDateTime(isoString) {
  return new Intl.DateTimeFormat("es-UY", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(isoString));
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

function collectDatesToClose(lastClosureKey, endKey) {
  const endDate = parseDateKey(endKey);
  const startDate = lastClosureKey ? shiftDate(parseDateKey(lastClosureKey), 1) : endDate;
  const dates = [];
  let cursor = new Date(startDate);

  while (cursor <= endDate) {
    dates.push(getLocalDateKey(cursor));
    cursor = shiftDate(cursor, 1);
  }

  return dates;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getToleranceMeta(record, isEditing) {
  if (isEditing && record) {
    return `Editando tolerancia del ${formatDate(record.recordDate)}.`;
  }

  if (!record) {
    return "Primero guardá la comida. La tolerancia puede quedar pendiente.";
  }

  if (record.status === "missing") {
    return "Ese registro está marcado como “no registró nada”.";
  }

  if (!record.tolerance) {
    return "Tolerancia pendiente. Podés cargarla más tarde.";
  }

  return `Última tolerancia registrada: ${capitalize(record.tolerance)} el ${formatDateTime(record.toleranceUpdatedAt || record.updatedAt)}.`;
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
      setNotice(`Edición de ${MEAL_LABELS[mealType].toLowerCase()} cancelada.`);
    });
  });

  Object.entries(elements.cancelToleranceButtons).forEach(([mealType, button]) => {
    button.addEventListener("click", () => {
      clearEditState(elements.toleranceForms[mealType]);
      render();
      setNotice(`Edición de tolerancia de ${MEAL_LABELS[mealType].toLowerCase()} cancelada.`);
    });
  });

  elements.exportButton.addEventListener("click", exportRecords);
  elements.forceCloseButton.addEventListener("click", () => {
    runDailyClosure({ forceDateKey: getLocalDateKey(new Date()) });
    setNotice("Se ejecutó el cierre diario manualmente para hoy.");
    render();
  });

  [elements.filterFrom, elements.filterTo, elements.filterTolerance].forEach((control) => {
    control.addEventListener("input", renderHistory);
  });
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
  const timestamp = now.toISOString();

  if (!markMissing && !mealText) {
    setNotice(`Escribí el ${MEAL_LABELS[mealType].toLowerCase()} completo o marcá “no registró nada”.`);
    return;
  }

  const record = existingRecord || {
    id: createRecordId(),
    mealType,
    recordDate,
    createdAt: timestamp,
  };

  record.scheduledTime = scheduledTime;
  record.status = markMissing ? "missing" : "recorded";
  record.mealText = markMissing ? "No registró nada" : mealText;
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
      }
    } else {
      const selectedDate = form.elements.recordDate.value || todayKey;
      hydrateMealFormForDate(mealType, selectedDate);
    }
  });

  ["lunch", "dinner"].forEach((mealType) => {
    const form = elements.toleranceForms[mealType];
    const editingRecord = form.dataset.editingRecordId ? findRecordById(form.dataset.editingRecordId) : null;
    const record = editingRecord || findRecordForDate(todayKey, mealType);
    const selectedTolerance = record?.tolerance || "verde";
    const radio = form.querySelector(`input[name="tolerance"][value="${selectedTolerance}"]`);

    if (radio) {
      radio.checked = true;
    }

    elements.toleranceMeta[mealType].textContent = getToleranceMeta(record, Boolean(editingRecord));
  });
}

function populateFormForEdit(record) {
  const form = elements.forms[record.mealType];
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.dataset.editingRecordId = record.id;
  form.elements.recordDate.value = record.recordDate;
  form.elements.scheduledTime.value = record.scheduledTime;
  form.elements.markMissing.checked = false;
  form.elements.mealText.disabled = false;
  form.elements.mealText.value = record.status === "missing" ? "" : record.mealText;

  setNotice(`Editando ${MEAL_LABELS[record.mealType].toLowerCase()} del ${formatDate(record.recordDate)}. Guardá para aplicar cambios.`);
  elements.formMeta[record.mealType].textContent = `Editando registro del ${formatDate(record.recordDate)}. Al guardar, se actualizará ese día.`;
}

function clearEditState(form) {
  delete form.dataset.editingRecordId;
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
      elements.formMeta[mealType].textContent = `Ese ${MEAL_LABELS[mealType].toLowerCase()} quedó como “no registró nada”. Podés reemplazarlo cargando la comida ahora.`;
    } else {
      elements.formMeta[mealType].textContent = `Ya existe un registro para ${formatDate(targetDate)}. Si guardás, se actualizará.`;
    }
  } else {
    elements.formMeta[mealType].textContent = "Se guardará con la fecha y hora local exacta del registro.";
  }
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
      setNotice(`Edición de ${MEAL_LABELS[mealType].toLowerCase()} cancelada.`);
    });
  });

  Object.entries(elements.cancelToleranceButtons).forEach(([mealType, button]) => {
    button.addEventListener("click", () => {
      clearEditState(elements.toleranceForms[mealType]);
      render();
      setNotice(`Edición de tolerancia de ${MEAL_LABELS[mealType].toLowerCase()} cancelada.`);
    });
  });

  elements.dailyMetricsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveDailyMetric();
  });
  elements.dailyMetricsForm.elements.metricDate.addEventListener("input", () => {
    if (!elements.dailyMetricsForm.dataset.editingMetricId) {
      renderDailyMetricsForm();
    }
  });
  elements.dailyMetricsCancel.addEventListener("click", () => {
    clearDailyMetricEditState();
    render();
    setNotice("Edición de indicadores diarios cancelada.");
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
      hydrateRecordModal(modal.mealForm.elements.recordDate.value, modal.mealForm.elements.mealType.value);
    });
  });

  elements.exportButton.addEventListener("click", exportRecords);
  elements.forceCloseButton.addEventListener("click", () => {
    runDailyClosure({ forceDateKey: getLocalDateKey(new Date()) });
    setNotice("Se ejecutó el cierre diario manualmente para hoy.");
    render();
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
    row.querySelector('[data-cell="date"]').textContent = formatDate(record.recordDate);
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

  const visibleDateKeys = new Set();

  return records.filter((record) => {
    if (visibleDateKeys.has(record.recordDate)) {
      return true;
    }

    if (visibleDateKeys.size < 2) {
      visibleDateKeys.add(record.recordDate);
      return true;
    }

    return false;
  });
}

function renderHistoryMoreButton(records, visibleRecords) {
  const hiddenCount = records.length - visibleRecords.length;
  if (hiddenCount <= 0) {
    return;
  }

  elements.historyMoreShell.innerHTML = `
    <button class="table-action" data-action="toggle-history" type="button">
      ${state.showAllHistory ? "Mostrar menos" : `Ver mas (${hiddenCount} registros)`}
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

function openRecordModal({ record = null, dateKey = "", mealType = "lunch", section = "meal" }) {
  const modal = getModalUI();
  const targetDate = record?.recordDate || dateKey || getLocalDateKey(new Date());
  const targetMealType = record?.mealType || mealType;
  modal.shell.hidden = false;
  modal.shell.dataset.section = section;
  hydrateRecordModal(targetDate, targetMealType);
  if (section === "tolerance") {
    modal.toleranceForm.scrollIntoView({ block: "nearest" });
  }
}

function closeRecordModal() {
  const modal = getModalUI();
  modal.shell.hidden = true;
  modal.notice.textContent = "";
  modal.notice.classList.remove("is-visible");
}

function hydrateRecordModal(dateKey, mealType) {
  const modal = getModalUI();
  const mealForm = modal.mealForm;
  const toleranceForm = modal.toleranceForm;
  const record = findRecordForDate(dateKey, mealType);
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
    modal.notice.textContent = `${MEAL_LABELS[mealType]} de ${formatDate(dateKey)} quedó como “no registró nada”. Podés cargar la comida ahora.`;
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
  const record = findRecordForDate(dateKey, mealType);
  const isMissing = record?.status === "missing";
  const mealTypeLabel = MEAL_LABELS[mealType].toLowerCase();

  if (record) {
    modal.mealMeta.textContent = isMissing
      ? `Ese ${mealTypeLabel} faltaba. Esta ventana te deja reemplazarlo sin ir al formulario principal.`
      : `Ya existe un registro para ${formatDate(dateKey)}. Si guardás, se actualizará.`;
  } else {
    modal.mealMeta.textContent = "Podés completar o corregir registros viejos desde esta ventana.";
  }

  if (!record) {
    modal.toleranceMeta.textContent = `Primero guardá el ${mealTypeLabel}. Después podés registrar su tolerancia acá mismo.`;
    return;
  }

  if (record.status === "missing") {
    modal.toleranceMeta.textContent = "Ese registro está marcado como “no registró nada”. Cargá la comida primero.";
    return;
  }

  if (!record.tolerance) {
    modal.toleranceMeta.textContent = "Tolerancia pendiente. Podés cargarla ahora.";
    return;
  }

  modal.toleranceMeta.textContent = `Tolerancia actual: ${capitalize(record.tolerance)}. Última actualización ${formatDateTime(record.toleranceUpdatedAt || record.updatedAt)}.`;
}

function saveModalMeal() {
  const modal = getModalUI();
  const now = new Date();
  const recordDate = modal.mealForm.elements.recordDate.value || getLocalDateKey(now);
  const mealType = modal.mealForm.elements.mealType.value;
  const scheduledTime = modal.mealForm.elements.scheduledTime.value || DEFAULT_TIMES[mealType];
  const markMissing = modal.mealForm.elements.markMissing.checked;
  const mealText = modal.mealForm.elements.mealText.value.trim();
  const existingRecord = findRecordForDate(recordDate, mealType);
  const timestamp = now.toISOString();

  if (!markMissing && !mealText) {
    modal.notice.textContent = `Escribí el ${MEAL_LABELS[mealType].toLowerCase()} completo o marcá “no registró nada”.`;
    modal.notice.classList.add("is-visible");
    return;
  }

  const record = existingRecord || {
    id: createRecordId(),
    mealType,
    recordDate,
    createdAt: timestamp,
  };

  record.scheduledTime = scheduledTime;
  record.status = markMissing ? "missing" : "recorded";
  record.mealText = markMissing ? "No registró nada" : mealText;
  record.tolerance = markMissing ? null : existingRecord?.tolerance ?? null;
  record.toleranceUpdatedAt = markMissing ? null : existingRecord?.toleranceUpdatedAt ?? null;
  record.updatedAt = timestamp;
  record.createdAt = existingRecord ? existingRecord.createdAt : timestamp;

  upsertRecord(record);
  modal.notice.textContent = `${MEAL_LABELS[mealType]} guardado para ${formatDate(recordDate)}.`;
  modal.notice.classList.add("is-visible");
  hydrateRecordModal(recordDate, mealType);
  render();
}

function saveModalTolerance() {
  const modal = getModalUI();
  const recordDate = modal.mealForm.elements.recordDate.value;
  const mealType = modal.mealForm.elements.mealType.value;
  const record = findRecordForDate(recordDate, mealType);

  if (!record) {
    modal.notice.textContent = `Primero guardá el ${MEAL_LABELS[mealType].toLowerCase()} antes de registrar tolerancia.`;
    modal.notice.classList.add("is-visible");
    return;
  }

  if (record.status === "missing") {
    modal.notice.textContent = "Ese registro está marcado como “no registró nada”. Cargá la comida primero.";
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
    setNotice("La glucosa media debe ser un valor válido en mg/dL.");
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

function roundMetric(value) {
  return Math.round(value * 10) / 10;
}

function formatPercentage(value) {
  return `${roundMetric(value)}%`;
}

function formatGlucose(value) {
  return `${roundMetric(value)} mg/dL`;
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
