'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-app.cjs');
test('broken JSON and unexpected storage shapes do not overwrite stored records', () => {
  const { storage, run } = load();
  for (const raw of ['{broken', '{}', 'null', '"text"']) {
    storage.set('diabetes-control-records-v1', raw);
    assert.equal(run('loadRecords().length'), 0);
    assert.equal(storage.get('diabetes-control-records-v1'), raw);
  }
});
test('synthetic meal data survives JSON storage round-trip', () => {
  const { storage, json } = load();
  storage.set('diabetes-control-records-v1', JSON.stringify([{ id: 'synthetic-1', mealType: 'lunch', recordDate: '2024-02-29', mealText: 'Comida ficticia para pruebas', tolerance: 'verde', scheduledTime: '13:30', createdAt: '2024-02-29T12:00:00Z', updatedAt: '2024-02-29T12:00:00Z' }]));
  const result = json('loadRecords()');
  assert.equal(result.length, 1);
  assert.equal(result[0].mealText, 'Comida ficticia para pruebas');
  assert.equal(result[0].recordDate, '2024-02-29');
});
test('invalid daily metrics are filtered while valid numeric boundary values remain', () => {
  const { put, run } = load();
  put('metric', { id: 'synthetic-1', metricDate: '2024-01-01', timeInRange: 0, averageGlucose: 0 });
  assert.equal(run('normalizeDailyMetric(metric).timeInRange'), 0);
  for (const change of [{ timeInRange: -1 }, { timeInRange: 101 }, { averageGlucose: 501 }, { metricDate: '2024-13-01' }]) {
    put('metric', { id: 'synthetic-1', metricDate: '2024-01-01', timeInRange: 50, averageGlucose: 100, ...change });
    assert.equal(run('normalizeDailyMetric(metric)'), null);
  }
});
