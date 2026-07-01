import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

import { sendEmail } from "./email";

describe("sendEmail", () => {
  beforeEach(() => {
    mockSend.mockReset();
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "CybersecCAST <noreply@example.com>";
  });

  it("throws when RESEND_API_KEY is not configured", async () => {
    delete process.env.RESEND_API_KEY;

    await expect(
      sendEmail({ to: "a@b.com", subject: "s", html: "<p>x</p>" })
    ).rejects.toThrow("RESEND_API_KEY is not configured");
  });

  it("throws when EMAIL_FROM is not configured", async () => {
    delete process.env.EMAIL_FROM;

    await expect(
      sendEmail({ to: "a@b.com", subject: "s", html: "<p>x</p>" })
    ).rejects.toThrow("EMAIL_FROM is not configured");
  });

  it("sends the email and returns true on success", async () => {
    mockSend.mockResolvedValue({ data: { id: "123" }, error: null });

    const result = await sendEmail({
      to: "owner@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledWith({
      from: "CybersecCAST <noreply@example.com>",
      to: "owner@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
      text: "Hello",
    });
  });

  it("returns false when the provider reports an error", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "bad" } });

    const result = await sendEmail({
      to: "owner@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
    });

    expect(result).toBe(false);
  });

  it("returns false when the provider call throws", async () => {
    mockSend.mockRejectedValue(new Error("network down"));

    const result = await sendEmail({
      to: "owner@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
    });

    expect(result).toBe(false);
  });
});
