import { analyzeFeedback } from './ai.js';
import { hash } from './service.js';

// SQLite owns the queue. No browser lifetime or in-memory task list is required for durability.
export function createPipeline(service, config, options = {}) {
  const analyze = options.analyze ?? analyzeFeedback;
  let stopped = true, active = null, timer;
  const tick = () => {
    if (stopped || active) return active ?? Promise.resolve();
    active = (async () => {
      while (!stopped) {
        const job = service.takePreparation();
        if (!job) break;
        try {
          const prepared = await analyze(service, job.requestId, 'AI Agent Lab', config);
          service.routeByRisk(job.requestId, hash(JSON.stringify(prepared)));
          service.finishPreparation(job.requestId, job.jobId, true);
        } catch (error) {
          service.finishPreparation(job.requestId, job.jobId, false, {retryable: error.retryable === true, message: error.status ? error.message : "Không xử lý được kết quả AI. Feedback vẫn được giữ; có thể soạn thủ công."});
        }
      }
    })().finally(() => { active = null; });
    return active;
  };
  return {
    enqueue(id, actor) {
      const result = service.enqueuePreparation(id, actor);
      // Don't start inside the request transaction. The HTTP response does not wait for AI.
      if (!stopped) setImmediate(() => { void tick().catch(() => {}); });
      return result;
    },
    start() {
      if (!stopped) return;
      service.recoverPreparations(); stopped = false;
      timer = setInterval(() => { void tick().catch(() => {}); }, 5000); timer.unref();
      void tick().catch(() => {});
    },
    async stop() { stopped = true; clearInterval(timer); await active; },
    tick,
  };
}
