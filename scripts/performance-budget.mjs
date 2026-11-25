const counts = [100, 1000, 5000]
const operations = ['selection', 'update', 'undo', 'redo', 'save', 'export']

export function matchesReferenceProtocol(protocol) {
  return (
    protocol.nodes.length === counts.length &&
    protocol.nodes.every((count, index) => count === counts[index]) &&
    protocol.mounts === 5 &&
    protocol.samples === 6 &&
    protocol.history === 100
  )
}

// A successful smoke run is still incomplete evidence for the reference product budgets.
export function assessBudgetStatus(report) {
  if (
    report.status !== 'completed' ||
    !matchesReferenceProtocol(report.protocol) ||
    report.environment.runtimeStable !== true ||
    report.runtimeErrors.length > 0 ||
    report.workloads.length !== counts.length
  ) {
    return 'incomplete'
  }
  for (const [index, workload] of report.workloads.entries()) {
    if (
      workload.nodes !== counts[index] ||
      workload.mounts.length !== 5 ||
      operations.some(
        (name) => workload.samples.filter((sample) => sample.operation === name).length !== 30,
      ) ||
      workload.history?.undoSteps !== 100 ||
      workload.history?.redoSteps !== 100 ||
      !Number.isFinite(workload.summary?.historyHeapDeltaMiB) ||
      !Array.isArray(workload.summary?.budgetExceedances)
    ) {
      return 'incomplete'
    }
  }
  return report.workloads.some((workload) => workload.summary.budgetExceedances.length > 0)
    ? 'exceeded'
    : 'within-budget'
}
