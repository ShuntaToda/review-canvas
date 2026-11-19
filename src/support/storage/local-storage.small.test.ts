// @vitest-environment jsdom
import {
  readLocalStorage,
  replaceLocalStorageWithMemory,
  writeLocalStorage,
} from "./local-storage";

afterEach(() => {
  window.localStorage.clear();
});

describe("local-storage", () => {
  test("[正常系]差し替える前は、ブラウザの localStorage に読み書きする", () => {
    writeLocalStorage("review-canvas.test", "1280");

    expect(window.localStorage.getItem("review-canvas.test")).toBe("1280");
    expect(readLocalStorage("review-canvas.test")).toBe("1280");
  });

  test("[正常系]差し替えた後の読み書きはメモリに行き、ブラウザの localStorage に残らない", () => {
    window.localStorage.setItem("review-canvas.test", "browser");
    replaceLocalStorageWithMemory();

    expect(readLocalStorage("review-canvas.test")).toBeNull();
    writeLocalStorage("review-canvas.test", "all");

    expect(readLocalStorage("review-canvas.test")).toBe("all");
    expect(window.localStorage.getItem("review-canvas.test")).toBe("browser");
  });

  test("[正常系]差し替えるたびに、空から始まる", () => {
    replaceLocalStorageWithMemory();
    writeLocalStorage("review-canvas.test", "all");
    replaceLocalStorageWithMemory();

    expect(readLocalStorage("review-canvas.test")).toBeNull();
  });
});
