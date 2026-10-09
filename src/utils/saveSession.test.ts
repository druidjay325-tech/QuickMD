import { describe, it, expect } from "vitest";
import { SaveSession } from "./saveSession";
describe("有序保存", () => {
  it("前一个保存完成前不写下一版", async () => {
    const s = new SaveSession();
    const order: string[] = [];
    let finish!: () => void;
    const first = s.enqueue(async () => {
      order.push("first-start");
      await new Promise<void>((r) => (finish = r));
      order.push("first-end");
    });
    const second = s.enqueue(async () => {
      order.push("second");
    });
    await Promise.resolve();
    expect(order).toEqual(["first-start"]);
    finish();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });
  it("失败传给调用方，后续重试仍能成功", async () => {
    const s = new SaveSession();
    await expect(
      s.enqueue(async () => {
        throw Error("disk full");
      }),
    ).rejects.toThrow("disk full");
    await expect(s.enqueue(async () => "recovered")).resolves.toBe("recovered");
  });
});
