import type { CommentAnchor } from "./comment-anchor";

/** テスト用の要素の手がかり（注文ボタン） */
export const commentAnchorDummyFrom = (
  props?: Partial<CommentAnchor>,
): CommentAnchor => ({
  version: 1,
  tag: "button",
  testId: "submit-button",
  closestTestId: { testId: "submit-button", depth: 0 },
  elementId: null,
  role: "button",
  name: "申し込む",
  text: "申し込む",
  attributes: { type: "submit" },
  state: { hasValue: null, checked: null, disabled: false },
  selector: '[data-testid="submit-button"]',
  nthPath:
    "html > body > div:nth-of-type(1) > form:nth-of-type(1) > button:nth-of-type(1)",
  ancestors: [{ tag: "form", role: "form", name: "ご注文内容", testId: null }],
  heading: "ご注文内容の確認",
  region: { kind: "form", label: "ご注文内容" },
  box: { x: 40, y: 600, width: 310, height: 48 },
  offset: { x: 0.5, y: 0.5 },
  styles: { "font-size": "16px", "font-weight": "700" },
  html: '<button type="submit" data-testid="submit-button">申し込む</button>',
  components: ["ApplicationForm", "SubmitButton"],
  story: {
    title: "Features/Application",
    name: "Default",
    importPath: "./src/features/application/Application.stories.tsx",
    args: null,
    globals: null,
  },
  ...props,
});
