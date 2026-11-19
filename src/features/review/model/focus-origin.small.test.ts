import { isFocusVisible, nextFocusedByPointer } from "./focus-origin";

describe("nextFocusedByPointer", () => {
  test("[正常系]ポインタで押したら、ポインタで移ったフォーカスとして覚える", () => {
    expect(nextFocusedByPointer(false, { type: "pointerdown" })).toBe(true);
  });

  test.each(["Tab", "Enter", "ArrowDown", "a"])(
    "[正常系]%j を押したら、キーボードで操作したとして外す",
    (key) => {
      expect(nextFocusedByPointer(true, { type: "keydown", key })).toBe(false);
    },
  );

  test.each([" ", "Shift", "Control", "Alt", "Meta"])(
    "[境界値]%j は掴む操作・修飾キーなので、覚えた値を変えない",
    (key) => {
      expect(nextFocusedByPointer(true, { type: "keydown", key })).toBe(true);
      expect(nextFocusedByPointer(false, { type: "keydown", key })).toBe(false);
    },
  );
});

describe("isFocusVisible", () => {
  test("[正常系]:focus-visible に合うかを返し、読めない環境ではキーボードとみなす", () => {
    expect(isFocusVisible({ matches: () => true })).toBe(true);
    expect(isFocusVisible({ matches: () => false })).toBe(false);
    expect(
      isFocusVisible({
        matches: (selector) => {
          throw new SyntaxError(selector);
        },
      }),
    ).toBe(true);
  });
});
