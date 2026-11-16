import { applyLocalAwsEnv } from "./local-aws-env";

const FILE_VALUES = {
  AWS_ENDPOINT_URL_DYNAMODB: "http://127.0.0.1:8000",
  AWS_REGION: "ap-northeast-1",
  AWS_ACCESS_KEY_ID: "dummyAccessKeyId",
  AWS_SECRET_ACCESS_KEY: "dummySecretAccessKey",
  COMMENT_TABLE_NAME: "ReviewCanvasComment",
};

describe("applyLocalAwsEnv", () => {
  test("[正常系]シェルに AWS の資格情報があっても、.env の DynamoDB Local への接続の値で上書きし、組にならない値を外す", () => {
    const env: NodeJS.ProcessEnv = {
      AWS_ACCESS_KEY_ID: "ShellAccessKey",
      AWS_SECRET_ACCESS_KEY: "secret/with+symbols",
      AWS_SESSION_TOKEN: "token",
      AWS_PROFILE: "work",
      AWS_REGION: "us-east-1",
      COMMENT_TABLE_NAME: "FromShell",
    };

    applyLocalAwsEnv(env, FILE_VALUES);

    expect(env).toStrictEqual({
      AWS_ENDPOINT_URL_DYNAMODB: "http://127.0.0.1:8000",
      AWS_REGION: "ap-northeast-1",
      AWS_ACCESS_KEY_ID: "dummyAccessKeyId",
      AWS_SECRET_ACCESS_KEY: "dummySecretAccessKey",
      // 接続の値のほかは、シェルの値を優先したまま
      COMMENT_TABLE_NAME: "FromShell",
    });
  });

  test("[正常系].env が DynamoDB Local の宛先を持たなければ、シェルの値に触らない", () => {
    const env: NodeJS.ProcessEnv = {
      AWS_PROFILE: "work",
      AWS_REGION: "us-east-1",
    };

    applyLocalAwsEnv(env, { AWS_REGION: "ap-northeast-1" });

    expect(env).toStrictEqual({ AWS_PROFILE: "work", AWS_REGION: "us-east-1" });
  });
});
