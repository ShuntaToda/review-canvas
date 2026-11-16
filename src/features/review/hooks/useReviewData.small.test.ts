import { ReviewApiError } from "../api/review-api";
import {
  COMMENTS_REFRESH_INTERVAL,
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
