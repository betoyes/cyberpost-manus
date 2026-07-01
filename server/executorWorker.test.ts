import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getNextReadyToExecute: vi.fn(),
}));

vi.mock("./executor", () => ({
  runExecutionForPost: vi.fn(),
}));

import * as db from "./db";
import { runExecutionForPost } from "./executor";
import { tick } from "./executorWorker";

describe("executorWorker tick", () => {
  beforeEach(() => {
    vi.mocked(db.getNextReadyToExecute).mockReset();
    vi.mocked(runExecutionForPost).mockReset().mockResolvedValue(undefined);
  });

  it("does nothing when there is no post ready to execute", async () => {
    vi.mocked(db.getNextReadyToExecute).mockResolvedValue(undefined);

    await tick();

    expect(runExecutionForPost).not.toHaveBeenCalled();
  });

  it("runs the executor for the next ready post", async () => {
    vi.mocked(db.getNextReadyToExecute).mockResolvedValue({ id: 42 } as any);

    await tick();

    expect(runExecutionForPost).toHaveBeenCalledWith(42);
  });

  it("does not overlap ticks while a previous one is still running", async () => {
    let resolveFirst!: () => void;
    vi.mocked(db.getNextReadyToExecute).mockResolvedValue({ id: 1 } as any);
    vi.mocked(runExecutionForPost).mockReturnValue(
      new Promise<void>(resolve => {
        resolveFirst = resolve;
      })
    );

    const firstTick = tick();
    const secondTick = tick();

    resolveFirst();
    await Promise.all([firstTick, secondTick]);

    expect(runExecutionForPost).toHaveBeenCalledTimes(1);
  });

  it("logs and swallows errors instead of throwing", async () => {
    vi.mocked(db.getNextReadyToExecute).mockRejectedValue(new Error("db down"));

    await expect(tick()).resolves.toBeUndefined();
  });
});
