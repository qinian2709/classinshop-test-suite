import { createLogger } from '../utils/logger.js';

const log = createLogger('data');

/** 一个可回滚的清理动作 */
export type CleanupTask = () => Promise<void> | void;

/**
 * 测试数据登记表：用例创建数据时登记清理动作，结束后统一回收，避免污染被测环境。
 * 用法见 tests/api 中的 fixtures：每个用例拿到独立实例，afterEach 调用 runAll。
 */
export class DataRegistry {
  private readonly tasks: { label: string; task: CleanupTask }[] = [];

  register(label: string, task: CleanupTask): void {
    this.tasks.push({ label, task });
  }

  /** 后进先出执行清理；单个失败不阻断其余清理。 */
  async runAll(): Promise<void> {
    while (this.tasks.length > 0) {
      const item = this.tasks.pop()!;
      try {
        await item.task();
        log.debug(`清理成功：${item.label}`);
      } catch (err) {
        log.warn(`清理失败（忽略）：${item.label}`, err);
      }
    }
  }

  get size(): number {
    return this.tasks.length;
  }
}
