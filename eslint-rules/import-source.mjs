/**
 * import の先の名前を取り出す。文字列のほか、式の入らないテンプレートリテラル（import(`ulid`)）も文字列として読む。
 * 計算しないと決まらないものは null
 */
export const importSourceOf = (node) => {
  if (node == null) return null;
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
};
