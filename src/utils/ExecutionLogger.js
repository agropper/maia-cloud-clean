/**
 * Centralized execution flow logger
 * Provides numbered steps and clear visibility into application flow
 */

class ExecutionLogger {
  constructor() {
    this.stepCounter = 0;
    this.currentFlow = null;
  }

  /**
   * Start a new execution flow
   * @param {string} flowName - Name of the execution flow
   */
  startFlow(flowName) {
    this.stepCounter = 0;
    this.currentFlow = flowName;
    console.log(`🚀 [FLOW] Starting: ${flowName}`);
  }

  /**
   * Log a step in the current flow
   * @param {string} message - Step description
   * @param {any} data - Optional data to log
   */
  step(message, data = null) {
    this.stepCounter++;
    const stepNumber = this.stepCounter.toString().padStart(2, '0');
    console.log(`📋 [${stepNumber}] [${this.currentFlow}] ${message}`);
    if (data) {
      console.log(`    Data:`, data);
    }
  }

  /**
   * Log an error in the current flow
   * @param {string} message - Error description
   * @param {any} error - Error object or data
   */
  error(message, error = null) {
    this.stepCounter++;
    const stepNumber = this.stepCounter.toString().padStart(2, '0');
    console.error(`❌ [${stepNumber}] [${this.currentFlow}] ${message}`);
    if (error) {
      console.error(`    Error:`, error);
    }
  }

  /**
   * Log a success in the current flow
   * @param {string} message - Success description
   * @param {any} data - Optional data to log
   */
  success(message, data = null) {
    this.stepCounter++;
    const stepNumber = this.stepCounter.toString().padStart(2, '0');
    console.log(`✅ [${stepNumber}] [${this.currentFlow}] ${message}`);
    if (data) {
      console.log(`    Data:`, data);
    }
  }

  /**
   * End the current flow
   * @param {boolean} success - Whether the flow completed successfully
   */
  endFlow(success = true) {
    const status = success ? '✅' : '❌';
    console.log(`${status} [FLOW] Completed: ${this.currentFlow}`);
    this.currentFlow = null;
    this.stepCounter = 0;
  }
}

// Export singleton instance
export const executionLogger = new ExecutionLogger();
export default executionLogger;
