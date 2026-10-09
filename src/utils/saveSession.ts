/** 保存请求有序执行；返回 Promise 必须把失败交给调用方。 */
export class SaveSession {
  private tail: Promise<void> = Promise.resolve();
  private generation = 0;
  nextGeneration() {
    return ++this.generation;
  }
  currentGeneration() {
    return this.generation;
  }
  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  idle() {
    return this.tail;
  }
}
