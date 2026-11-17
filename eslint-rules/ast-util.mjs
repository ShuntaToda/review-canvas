/** 型の書き方だけの包み（実行時には何もしない）。包んだだけで検査から外れないよう、判定の前にほどく */
const TYPE_WRAPPERS = [
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
];

/** `x as T`・`x satisfies T`・`x!`・`<T>x` をほどいて、中の式を返す */
export const unwrap = (node) => {
  let current = node;
  while (current != null && TYPE_WRAPPERS.includes(current.type)) {
    current = current.expression;
  }
  return current;
};

/** 型の包みを外へたどり、包まれていない一番外の式と、その親を返す（`(Date as X).now()` の Date から、`.now` の object まで上がる） */
export const outermost = (node) => {
  let current = node;
  while (
    current.parent != null &&
    TYPE_WRAPPERS.includes(current.parent.type) &&
    current.parent.expression === current
  ) {
    current = current.parent;
  }
  return current;
};

/** メンバーの名前（`a.b`・`a["b"]`・`a[`b`]`）。計算しないと決まらないものは null */
export const propertyNameOf = (node) => {
  if (!node.computed) {
    return node.property.type === "Identifier" ? node.property.name : null;
  }
  const property = unwrap(node.property);
  if (property.type === "Literal") return String(property.value);
  if (
    property.type === "TemplateLiteral" &&
    property.expressions.length === 0
  ) {
    return property.quasis[0].value.cooked;
  }
  return null;
};

/** 型（合併・交差は部品ごと）と、その親の型をたどって、どれかが条件に合うか */
export const someTypeInChain = (type, matches) => {
  const seen = new Set();
  const visit = (current) => {
    if (seen.has(current)) return false;
    seen.add(current);
    if (current.isUnionOrIntersection()) return current.types.some(visit);
    if (matches(current)) return true;
    // 型引数つきの型（ZodError<T> など）は、もとの宣言（target）が親を持つ
    if (current.target != null && current.target !== current) {
      return visit(current.target);
    }
    return (current.getBaseTypes?.() ?? []).some(visit);
  };
  return visit(type);
};
