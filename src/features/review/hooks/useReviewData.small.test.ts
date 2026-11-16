import { ReviewApiError } from "../api/review-api";
import {
  COMMENTS_REFRESH_INTERVAL,
  commentsErrorMessage,
  retryCommentsOnError,
} from "./useReviewData";

const errorOf = (
  status: number,
  errorName?: ConstructorParameters<typeof ReviewApiError>[0]["errorName"],
) => new ReviewApiError({ status, errorName, message: "x" });

describe("retryCommentsOnError", () => {
  test.each([0, 500, 502])(
    "[正常系]失敗（%s）は定期の取り直しと同じ間隔で読み直す",
    (status) => {
      const schedule = vi.fn();
      const revalidate = vi.fn();

      retryCommentsOnError(errorOf(status), revalidate, schedule);

      expect(schedule).toHaveBeenCalledExactlyOnceWith(
        revalidate,
        COMMENTS_REFRESH_INTERVAL,
      );
    },
  );

  test("[正常系]ログインし直しが要る失敗（401）は読み直さない", () => {
    const schedule = vi.fn();

    retryCommentsOnError(errorOf(401), vi.fn(), schedule);

    expect(schedule).not.toHaveBeenCalled();
  });

  test("[正常系]使ってよい人ではない失敗（403・ReviewerNotAllowedError）は読み直さない", () => {
    const schedule = vi.fn();

    retryCommentsOnError(
      errorOf(403, "ReviewerNotAllowedError"),
      vi.fn(),
      schedule,
    );

    expect(schedule).not.toHaveBeenCalled();
  });

  test("[正常系]入力の誤り（400。受け付けないブランチ名など）は読み直さない", () => {
    const schedule = vi.fn();

    retryCommentsOnError(errorOf(400), vi.fn(), schedule);

    expect(schedule).not.toHaveBeenCalled();
  });

  test("[正常系]本人ではない失敗（403・CommentNotAuthorError）は読み直す（ログインの問題ではない）", () => {
    const schedule = vi.fn();

    retryCommentsOnError(
      errorOf(403, "CommentNotAuthorError"),
      vi.fn(),
      schedule,
    );

    expect(schedule).toHaveBeenCalledOnce();
  });
});

describe("commentsErrorMessage", () => {
  test("[正常系]読み直さない失敗（400）では「読み直します」と出さない", () => {
    const message = commentsErrorMessage(errorOf(400));

    expect(message).not.toContain("読み直します");
    expect(message).toContain("ブランチ");
  });

  test("[正常系]読み直す失敗（500・つながらない）では、読み直すことを伝える", () => {
    expect(commentsErrorMessage(errorOf(500))).toContain(
      "10 秒ごとに読み直します",
    );
    expect(commentsErrorMessage(errorOf(0))).toContain(
      "10 秒ごとに読み直します",
    );
  });

  test("[正常系]ログインし直しが要る失敗（401）・使ってよい人ではない失敗は、その案内を出す", () => {
    expect(commentsErrorMessage(errorOf(401))).toContain("ログインし直して");
    expect(
      commentsErrorMessage(errorOf(403, "ReviewerNotAllowedError")),
    ).toContain("このアカウントでは使えません");
  });
});
