// @vitest-environment jsdom
import {
  PENDING_RETURN_TO_STORAGE_KEY,
  savePendingReturnTo,
  takePendingReturnTo,
} from "./pending-return-to";

afterEach(() => {
  window.sessionStorage.clear();
});

describe("pending-return-to", () => {
  test("[正常系]覚えた戻り先を 1 度だけ返す", () => {
    savePendingReturnTo("/?page=blog&comment=01#x");

    expect(takePendingReturnTo()).toBe("/?page=blog&comment=01#x");
    expect(takePendingReturnTo()).toBeUndefined();
  });

  test("[正常系]覚えていなければ undefined", () => {
    expect(takePendingReturnTo()).toBeUndefined();
  });

  test("[異常系]同じサイトのパスでない値はトップにする", () => {
    window.sessionStorage.setItem(
      PENDING_RETURN_TO_STORAGE_KEY,
      "https://evil.example/",
    );

    expect(takePendingReturnTo()).toBe("/");
  });
});
