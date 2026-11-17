import { ruleTester } from "../rule-tester.mjs";
import { useCaseShape } from "./use-case-shape.mjs";

const filename = "/repo/api/use-case/create-comment-use-case.ts";
const valid = `
export type CreateCommentUseCase = UseCase<Input, Output>;
export class CreateCommentUseCaseImpl implements CreateCommentUseCase {
  async execute(input: Input): Promise<Output> { return input; }
}`;

ruleTester.run("use-case-shape", useCaseShape, {
  valid: [
    { filename, code: valid },
    // ユースケースでないファイル（共有の関数・型）は、クラスを持たなければよい
    {
      filename: "/repo/api/use-case/thread-view.ts",
      code: "export const toView = () => 1;",
    },
  ],
  invalid: [
    {
      filename: "/repo/api/use-case/thread-view.ts",
      code: "export class ThreadView {}",
      errors: [{ messageId: "classOutsideUseCaseFile" }],
    },
    {
      filename,
      code: "export type CreateCommentUseCase = UseCase<Input, Output>;",
      errors: [{ messageId: "missingClass" }],
    },
    {
      filename,
      code: `${valid}\nclass Helper {}`,
      errors: [{ messageId: "tooManyClasses" }],
    },
    {
      filename,
      code: valid.replace("CreateCommentUseCaseImpl", "CommentCreator"),
      errors: [{ messageId: "wrongClassName" }],
    },
    {
      filename,
      code: valid.replace("export class", "class"),
      errors: [{ messageId: "notExported" }],
    },
    {
      filename,
      code: valid.replace(" implements CreateCommentUseCase", ""),
      errors: [{ messageId: "missingImplements" }],
    },
    {
      filename,
      code: valid.replace("async execute", "async run"),
      errors: [{ messageId: "missingExecute" }],
    },
    {
      filename,
      code: valid.replace(
        "export type CreateCommentUseCase =",
        "type CreateCommentUseCase =",
      ),
      errors: [{ messageId: "missingType" }],
    },
  ],
});
