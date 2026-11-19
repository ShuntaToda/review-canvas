// @vitest-environment jsdom

/** 差し替えた保存先は読み込んだモジュールに残るので、テストごとに読み直す（並び順に頼らない） */
const loadStorage = async () => {
  vi.resetModules();
  return import("./local-storage");
};

afterEach(() => {
  window.localStorage.clear();
});

describe("local-storage", () => {
  test("[正常系]差し替える前は、ブラウザの localStorage に読み書きし、消す", async () => {
    const { readLocalStorage, removeLocalStorage, writeLocalStorage } =
      await loadStorage();
    writeLocalStorage("review-canvas.test", "1280");

    expect(window.localStorage.getItem("review-canvas.test")).toBe("1280");
    expect(readLocalStorage("review-canvas.test")).toBe("1280");

    removeLocalStorage("review-canvas.test");

    expect(window.localStorage.getItem("review-canvas.test")).toBeNull();
  });

  test("[正常系]差し替えた後の読み書き・消すはメモリに行き、ブラウザの localStorage に残らない", async () => {
    const {
      readLocalStorage,
      removeLocalStorage,
      replaceLocalStorageWithMemory,
      writeLocalStorage,
    } = await loadStorage();
    window.localStorage.setItem("review-canvas.test", "browser");
    replaceLocalStorageWithMemory();

    expect(readLocalStorage("review-canvas.test")).toBeNull();
    writeLocalStorage("review-canvas.test", "all");

    expect(readLocalStorage("review-canvas.test")).toBe("all");
    expect(window.localStorage.getItem("review-canvas.test")).toBe("browser");

    removeLocalStorage("review-canvas.test");

    expect(readLocalStorage("review-canvas.test")).toBeNull();
    expect(window.localStorage.getItem("review-canvas.test")).toBe("browser");
  });

  test("[正常系]差し替えるたびに、空から始まる", async () => {
    const {
      readLocalStorage,
      replaceLocalStorageWithMemory,
      writeLocalStorage,
    } = await loadStorage();
    replaceLocalStorageWithMemory();
    writeLocalStorage("review-canvas.test", "all");
    replaceLocalStorageWithMemory();

    expect(readLocalStorage("review-canvas.test")).toBeNull();
  });
});
