/**
 * @typedef {Object} CostTrend
 * @property {string} direction
 * @property {number} change_percentage
 * @property {number} change_amount
 * @property {number} current_period_cost
 * @property {number} previous_period_cost
 */

/**
 * @typedef {Object} CostTopService
 * @property {string} service_name
 * @property {number} total_cost
 * @property {number} percentage_of_total
 * @property {number} daily_average
 */

/**
 * @typedef {Object} CostStatus
 * @property {boolean} has_data
 * @property {string} [reason]
 */

/**
 * @typedef {Object} CostBaseline
 * @property {string} currency
 * @property {number} period_days
 * @property {string} window_start
 * @property {string} window_end
 * @property {number} total_cost
 * @property {number} daily_average
 * @property {CostTrend} trend
 * @property {CostTopService[]} top_services
 * @property {CostStatus} cost_status
 */

/**
 * @typedef {Object} AnomaliesSummary
 * @property {number} total_anomalies
 * @property {{ critical: number, high: number, medium: number }} by_severity
 * @property {number} max_delta_pct
 * @property {Array<{
 *   timestamp: string,
 *   group: string,
 *   baseline: number,
 *   current: number,
 *   delta: number,
 *   delta_pct: number,
 *   severity: string,
 *   anomaly_type: string
 * }>} recent
 */

/**
 * @typedef {Object} ResilienceSummary
 * @property {number} total_workloads
 * @property {number} total_monthly_resilience_cost
 * @property {Array<{ workload: string, total_monthly_resilience_cost: number }>} top_workloads
 */

/**
 * @typedef {Object} CloudCapitalReport
 * @property {string} schema_version
 * @property {string} generated_at
 * @property {{ label: string, start: string, end: string }} window
 * @property {CostBaseline} cost_baseline
 * @property {AnomaliesSummary} anomalies
 * @property {ResilienceSummary} resilience
 */

import report from "../data/report.json";

/** @returns {CloudCapitalReport} */
export function getCloudCapitalReport() {
  return report;
}
