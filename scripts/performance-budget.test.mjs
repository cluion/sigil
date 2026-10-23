import assert from 'node:assert/strict'
import { test } from 'vitest'
import { assessBudgetStatus, matchesReferenceProtocol } from './performance-budget.mjs'

function report() {
  return {
    status: 'completed',
    protocol: { nodes: [100, 1000, 5000], mounts: 5, samples: 6, history: 100 },
    environment: { runtimeStable: true },
    runtimeErrors: [],
    workloads: [100, 1000, 5000].map((nodes) => ({
      nodes,
      mounts: Array(5).fill({}),
      samples: ['selection', 'update', 'undo', 'redo', 'save', 'export'].flatMap((operation) =>
        Array.from({ length: 30 }, () => ({ operation })),
      ),
      history: { undoSteps: 100, redoSteps: 100 },
      summary: { historyHeapDeltaMiB: 1, budgetExceedances: [] },
    })),
  }
}

test('complete reference measurement reports within-budget separately from completed', () => {
  assert.equal(assessBudgetStatus(report()), 'within-budget')
})

test('completed measurement with a recorded exceedance reports exceeded', () => {
  const value = report()
  value.workloads[2].summary.budgetExceedances.push({
    metric: 'selection.readyMs.p95',
    actual: 251,
    threshold: 250,
  })
  assert.equal(value.status, 'completed')
  assert.equal(assessBudgetStatus(value), 'exceeded')
})

test('smoke and altered sampling cannot claim the reference budgets passed', () => {
  for (const patch of [{ nodes: [100] }, { mounts: 1 }, { samples: 1 }, { history: 1 }]) {
    const value = report()
    Object.assign(value.protocol, patch)
    assert.equal(matchesReferenceProtocol(value.protocol), false)
    assert.equal(assessBudgetStatus(value), 'incomplete')
  }
})

test('missing measurements or history enumeration remain incomplete', () => {
  const missingSample = report()
  missingSample.workloads[0].samples.pop()
  assert.equal(assessBudgetStatus(missingSample), 'incomplete')
  const missingHistory = report()
  missingHistory.workloads[2].history.undoSteps = 99
  assert.equal(assessBudgetStatus(missingHistory), 'incomplete')
})

test('failed, changing-source or browser-error measurements remain incomplete', () => {
  const failed = report()
  failed.status = 'failed'
  assert.equal(assessBudgetStatus(failed), 'incomplete')
  const changed = report()
  changed.environment.runtimeStable = false
  assert.equal(assessBudgetStatus(changed), 'incomplete')
  const errored = report()
  errored.runtimeErrors.push('Unexpected rejection')
  assert.equal(assessBudgetStatus(errored), 'incomplete')
})
