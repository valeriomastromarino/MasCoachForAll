import { describe, expect, it, vi } from "vitest";
import { guardBack, handleBack } from "./native";

describe("Back button", () => {
  it("lets the screen on top handle it first", () => {
    const exit = vi.fn();
    const remove = guardBack(() => true);
    handleBack(false, exit);
    expect(exit).not.toHaveBeenCalled();
    remove();
  });

  it("exits when nothing handles it and there is no page to go back to", () => {
    const exit = vi.fn();
    handleBack(false, exit);
    expect(exit).toHaveBeenCalledOnce();
  });

  it("goes back one page when it can and nobody guards", () => {
    const back = vi.fn();
    vi.stubGlobal("window", { history: { back } });
    const exit = vi.fn();
    handleBack(true, exit);
    expect(back).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("a removed guard no longer applies", () => {
    const exit = vi.fn();
    guardBack(() => true)();
    handleBack(false, exit);
    expect(exit).toHaveBeenCalledOnce();
  });
});
