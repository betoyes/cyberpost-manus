import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../email", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("../db", () => ({
  getSetting: vi.fn(),
}));

import { sendEmail } from "../email";
import * as db from "../db";
import { notifyOwner } from "./notification";

describe("notifyOwner", () => {
  beforeEach(() => {
    vi.mocked(sendEmail).mockReset();
    vi.mocked(db.getSetting).mockReset();
    delete process.env.EMAIL_OWNER;
  });

  it("rejects empty title/content before resolving a recipient", async () => {
    await expect(notifyOwner({ title: "", content: "x" })).rejects.toThrow(
      "Notification title is required."
    );
    expect(db.getSetting).not.toHaveBeenCalled();
  });

  it("prefers settings.approval_email over EMAIL_OWNER", async () => {
    process.env.EMAIL_OWNER = "fallback@example.com";
    vi.mocked(db.getSetting).mockResolvedValue("owner@example.com");
    vi.mocked(sendEmail).mockResolvedValue(true);

    const result = await notifyOwner({ title: "Hi", content: "Body" });

    expect(result).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@example.com", subject: "Hi" })
    );
  });

  it("falls back to EMAIL_OWNER when no approval_email setting exists", async () => {
    process.env.EMAIL_OWNER = "fallback@example.com";
    vi.mocked(db.getSetting).mockResolvedValue(null);
    vi.mocked(sendEmail).mockResolvedValue(true);

    await notifyOwner({ title: "Hi", content: "Body" });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "fallback@example.com" })
    );
  });

  it("throws when no recipient is configured at all", async () => {
    vi.mocked(db.getSetting).mockResolvedValue(null);

    await expect(notifyOwner({ title: "Hi", content: "Body" })).rejects.toThrow(
      "Owner email is not configured"
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("escapes HTML special characters in the body", async () => {
    vi.mocked(db.getSetting).mockResolvedValue("owner@example.com");
    vi.mocked(sendEmail).mockResolvedValue(true);

    await notifyOwner({ title: "Hi", content: "<script>alert(1)</script>" });

    const call = vi.mocked(sendEmail).mock.calls[0][0];
    expect(call.html).not.toContain("<script>");
    expect(call.html).toContain("&lt;script&gt;");
    expect(call.text).toBe("<script>alert(1)</script>");
  });

  it("propagates the false return from sendEmail on delivery failure", async () => {
    vi.mocked(db.getSetting).mockResolvedValue("owner@example.com");
    vi.mocked(sendEmail).mockResolvedValue(false);

    const result = await notifyOwner({ title: "Hi", content: "Body" });

    expect(result).toBe(false);
  });
});
