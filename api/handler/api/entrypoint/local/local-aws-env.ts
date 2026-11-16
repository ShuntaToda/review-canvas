/** .env から、シェルの値より優先して使う DynamoDB Local への接続の値 */
const LOCAL_AWS_KEYS = [
  "AWS_ENDPOINT_URL_DYNAMODB",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
] as const;

/**
 * ローカルで DynamoDB Local へつなぐとき、.env の接続の値をシェルの値より優先する。
 * dotenv はシェルにある値を上書きしないため、シェルに AWS の資格情報（一時的な資格情報・プロファイル）があると、
 * それが DynamoDB Local へ送られて接続に失敗する（DynamoDB Local は英数字以外のキーを拒む）。
 * .env が DynamoDB Local の宛先を持たないときは何もしない
 */
export const applyLocalAwsEnv = (
  env: NodeJS.ProcessEnv,
  fileValues: Readonly<Record<string, string>>,
): void => {
  if (fileValues["AWS_ENDPOINT_URL_DYNAMODB"] === undefined) return;
  for (const key of LOCAL_AWS_KEYS) {
    const value = fileValues[key];
    if (value !== undefined) env[key] = value;
  }
  // .env の鍵と組にならない値は、残すと SDK がそちらを使う
  delete env["AWS_SESSION_TOKEN"];
  delete env["AWS_PROFILE"];
};
