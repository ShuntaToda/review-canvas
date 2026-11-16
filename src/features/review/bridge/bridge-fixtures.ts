import type { CommentAnchor } from "../model/threads";

/** テスト用の要素の手がかり（注文ボタン。API の commentAnchorDummyFrom と同じ形） */
export const commentAnchorFixture = (
  props?: Partial<CommentAnchor>,
): CommentAnchor => ({
  version: 1,
  tag: "button",
  testId: "submit-button",
  closestTestId: { testId: "submit-button", depth: 0 },
  elementId: null,
  role: "button",
  name: "注文する",
  text: "注文する",
  attributes: { type: "submit" },
  state: { hasValue: null, checked: null, disabled: false },
  selector: '[data-testid="submit-button"]',
  nthPath: "html > body > form:nth-of-type(1) > button:nth-of-type(1)",
  ancestors: [{ tag: "form", role: "form", name: null, testId: null }],
  heading: null,
  region: null,
  box: { x: 40, y: 600, width: 310, height: 48 },
  offset: { x: 0.5, y: 0.5 },
  styles: { "font-size": "16px" },
  html: '<button type="submit" data-testid="submit-button">注文する</button>',
  components: [],
  story: {
    title: "Shop/OrderForm",
    name: "Default",
    importPath: null,
    args: null,
    globals: null,
  },
  ...props,
});
