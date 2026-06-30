import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { queueNextHandler } from "./queueApi";

// Mock db + notification so the handler can run without a real database.
vi.mock("./db", () => ({
  getNextReadyToExecute: vi.fn(async () => undefined),
  getPost: vi.fn(async () => undefined),
  updatePost: vi.fn(async () => {}),
  addLog: vi.fn(async () => {}),
}));

function mockRes() {
  const res: Partial<Response> & { _status: number; _json: unknown } = {
    _status: 200,
    _json: undefined,
    status(code: number) {
      this._status = code;
      return this as Response;
    },
    json(body: unknown) {
      this._json = body;
      return this as Response;
    },
  };
  return res as Response & { _status: number; _json: any };
}

describe("queue API token auth", () => {
  beforeEach(() => {
    process.env.QUEUE_API_TOKEN = "csc_q8Kx2mPv7nR4tZ9wLbY3eHfA6dG1sJ5";
  });

  it("rejects requests without a token", async () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    await queueNextHandler(req, res);
    expect(res._status).toBe(401);
  });

  it("rejects requests with a wrong token", async () => {
    const req = { headers: { authorization: "Bearer wrong-token" } } as unknown as Request;
    const res = mockRes();
    await queueNextHandler(req, res);
    expect(res._status).toBe(401);
  });

  it("accepts requests with the correct token", async () => {
    const req = {
      headers: { authorization: "Bearer csc_q8Kx2mPv7nR4tZ9wLbY3eHfA6dG1sJ5" },
    } as unknown as Request;
    const res = mockRes();
    await queueNextHandler(req, res);
    // No due post -> returns 200 with order: null
    expect(res._status).toBe(200);
    expect(res._json).toEqual({ order: null });
  });
});
