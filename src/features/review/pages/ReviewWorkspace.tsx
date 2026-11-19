import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ErrorBoundary } from "react-error-boundary";
import { isUnauthorized, type ReviewMetaBranch } from "../api/review-api";
import { Canvas } from "../components/Canvas";
import { COMMENT_LIST_ID, CommentSidebar } from "../components/CommentSidebar";
import { CompareDialog } from "../components/CompareDialog";
import { DisplaySettings } from "../components/DisplaySettings";
import { DraftPopover } from "../components/DraftPopover";
import type { PinView } from "../components/Frame";
import { HelpDialog } from "../components/HelpDialog";
import { MarkdownDialog } from "../components/MarkdownDialog";
import { Minimap } from "../components/Minimap";
import {
  CanvasErrorFallback,
  BranchNotPublishedNotice,
  DeletedThreadNotice,
  NoMatchNotice,
  SessionExpiredNotice,
  StorybookMissingNotice,
  Toast,
} from "../components/Notices";
import { StorySidebar } from "../components/StorySidebar";
import { ThreadPopover } from "../components/ThreadPopover";
import { Toolbar } from "../components/Toolbar";
import { ZoomControls } from "../components/ZoomControls";
import {
  focusCanvas,
  focusCompareButton,
  isInsideStoryList,
} from "../components/canvas-dom";
import { useBranchCompare } from "../hooks/useBranchCompare";
import { useCustomWidths } from "../hooks/useCustomWidths";
import { useElementSize } from "../hooks/useElementSize";
import { useLocalSetting } from "../hooks/useLocalSetting";
import {
  commentsErrorMessage,
  reviewApi,
  useBranches,
  useComments,
} from "../hooks/useReviewData";
import { useSources } from "../hooks/useSources";
import { useStoryListOpen } from "../hooks/useStoryListOpen";
import { useStorybookBase } from "../hooks/useStorybookBase";
import { useThreadNavigation } from "../hooks/useThreadNavigation";
import {
  type AnchorBox,
  type LocatedPin,
  locatedKey,
  mergeLocatedPins,
  isUnlocatedPin,
} from "../model/anchor-locate";
import { compareViewOf, resolveCompareStoryId } from "../model/branch-compare";
import { buildBranchOptions } from "../model/branch-options";
import {
  type Camera,
  centerOn,
  nextZoomStep,
  previousZoomStep,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from "../model/camera";
import { type CameraState, resolveCamera } from "../model/camera-state";
import { buildExportJson, exportFileName } from "../model/export-json";
import {
  boundsOfRows,
  DEFAULT_FRAMES_PER_ROW,
  filterStories,
  findFrame,
  frameAt,
  FRAMES_PER_ROW_OPTIONS,
  layoutRows,
} from "../model/layout";
import { frameLoadQueue } from "../model/load-queue";
import { buildMarkdown } from "../model/markdown";
import { framePointToWorld } from "../model/pin-point";
import { popoverPosition } from "../model/popover";
import {
  isImeComposing,
  isTypingTarget,
  resolveShortcut,
  type Tool,
} from "../model/shortcuts";
import { mapSources, type StorySource } from "../model/sources";
import { EMPTY_SHOT_CATALOG, type ShotCatalog } from "../model/story-shots";
import { isComponentStory, type Story, storyKey } from "../model/storybook";
import {
  buildThreads,
  type Comment,
  type CommentAnchor,
  countByStatus,
  countPendingByStory,
  filterThreads,
  initialStatusFilter,
  type StatusFilter,
  type Thread,
} from "../model/threads";
import { buildSearch, type UrlState } from "../model/url-state";
import { isNarrowViewport } from "../model/viewport";
import type { AuthUser } from "@/support/auth";

type Draft = {
  source: StorySource;
  storyId: string;
  x: number;
  y: number;
  /** クリックした要素の手がかり（取れなければ null） */
  anchor: CommentAnchor | null;
};
type DialogKind = "markdown" | "help";

/** 書きかけの置き場で、新しいピンの本文に使う鍵（ほかはスレッドのID） */
const NEW_COMMENT_DRAFT = "new";

/** 1行に並べる数をブラウザに覚える形。知らない数は既定に戻す */
const parsePerRow = (raw: string): number | undefined => {
  const value = Number(raw);
  return FRAMES_PER_ROW_OPTIONS.includes(value) ? value : undefined;
};

/** スレッドへ移るときの倍率（今の倍率を保ちつつ、読める大きさにする） */
const focusZoom = (current: number): number =>
  Math.min(1, Math.max(0.5, current));

type ReviewWorkspaceProps = {
  /** 選んでいるブランチ（切り替えると ReviewPage が作り直す） */
  branch: string;
  /** 画面を開いたときに選ぶブランチ（URL に ?branch= を載せるかの判断） */
  defaultBranch: string;
  /** 選んでいるブランチに置いてある Storybook（置いていなければ null。コメントだけ読める） */
  published: ReviewMetaBranch | null;
  /** Storybook を置いてあるブランチ（切り替える欄の行） */
  publishedBranches: ReadonlyArray<ReviewMetaBranch>;
  /** ブランチを切り替える（いまのページと、真ん中に見えている画面は保つ） */
  onBranchChange: (
    branch: string,
    page: StorySource,
    story: string | undefined,
  ) => void;
  /** ページごとのストーリー（設定のページの ID ごと） */
  stories: Readonly<Record<StorySource, Story[]>>;
  storyErrors: Readonly<Record<StorySource, string | undefined>>;
  /** ページごとの、発行のときに撮った画像（無いページは空） */
  shots: Readonly<Record<StorySource, ShotCatalog>>;
  /** ページごとの、既定のブランチの画像（見比べる。既定のブランチを見ているとき・目録の無いページは空） */
  baseShots: Readonly<Record<StorySource, ShotCatalog>>;
  initialUrl: UrlState;
  initialComments: Comment[];
  /** ログインしている人（書いた人として残り、自分のコメントだけを編集・削除できる） */
  me: AuthUser;
  onLogout: () => void;
};

/**
 * キャンバス・コメント一覧・スレッドをまとめる作業の画面
 */
export const ReviewWorkspace = ({
  branch,
  defaultBranch,
  published,
  publishedBranches,
  onBranchChange,
  stories,
  storyErrors,
  shots,
  baseShots,
  initialUrl,
  initialComments,
  me,
  onLogout,
}: ReviewWorkspaceProps) => {
  // 選んでいるブランチの Storybook の置き場（Storybook のオリジンからの絶対の URL）
  const storybookBase = useStorybookBase();
  const sources = useSources();
  const storiesOf = (source: StorySource): Story[] => stories[source] ?? [];
  const storiesByKey = new Map(
    sources.ids.flatMap((source) =>
      storiesOf(source).map(
        (story) => [storyKey(source, story.id), story] as const,
      ),
    ),
  );

  // 共有リンクで開いたときの場所（?comment= のスレッド、なければ ?story= の画面）
  const [initial] = useState(() => {
    const thread = buildThreads(initialComments).find(
      (t) => t.root.id === initialUrl.comment,
    );
    // 設定に無いページ（設定から外した Storybook）は開かず、1 つ目のページにする
    const wanted = thread?.root.source ?? initialUrl.page;
    const page =
      wanted !== undefined && sources.has(wanted)
        ? wanted
        : (sources.ids[0] ?? "");
    // 比べる画面へのリンク（?compare=）は、その画面に寄せてから開く。既定のブランチ・知らない ID は捨てる
    const compare = resolveCompareStoryId({
      compare: initialUrl.compare,
      branch,
      defaultBranch,
      exists: (id) => storiesByKey.has(storyKey(page, id)),
    });
    const storyId = thread?.root.storyId ?? compare ?? initialUrl.story;
    const story =
      storyId === undefined
        ? undefined
        : storiesByKey.get(storyKey(page, storyId));
    const cameras = mapSources<CameraState>(sources.ids, () => ({
      kind: "initial",
    }));
    if (story !== undefined) {
      cameras[page] = {
        kind: "focus",
        storyId: story.id,
        point:
          thread === undefined
            ? { x: sources.get(story.source).defaultWidth / 2, y: 300 }
            : { x: thread.root.x, y: thread.root.y },
        zoom: thread === undefined ? 0.5 : 0.75,
        // ピンを追いかける（画面を読み込んで測り、要素を見つけたら、そこへ移る）
        ...(thread === undefined ? {} : { threadId: thread.root.id }),
      };
    }
    return {
      page,
      cameras,
      compare,
      // 見つからないスレッド（削除された・別のブランチ）へのリンクでも ID を残し、見つからないと知らせる
      threadId: thread?.root.id ?? initialUrl.comment ?? null,
      // 一覧の状態のタブ。リンクのスレッドがそのタブに出ない（?status= と合わない・未解決でない）ときは「すべて」にして開く
      status: initialStatusFilter(initialUrl.status, thread?.root.status),
      showComponents:
        story !== undefined &&
        isComponentStory(story, sources.excludeTitlePrefixes),
    };
  });

  const [page, setPage] = useState<StorySource>(initial.page);
  const [tool, setTool] = useState<Tool>("move");
  const [query, setQuery] = useState("");
  const [showComponents, setShowComponents] = useState(initial.showComponents);
  // ページごとの画面の幅（いまの幅と、見る人が自分で足した幅）
  const pageWidths = useCustomWidths(sources);
  const widthOf = pageWidths.widthOf;
  const [perRow, setPerRow] = useLocalSetting(
    "review-canvas.perRow",
    DEFAULT_FRAMES_PER_ROW,
    { parse: parsePerRow, serialize: String },
  );
  const [sidebarOpen, setSidebarOpen] = useState(
    () => !isNarrowViewport(window.innerWidth),
  );
  const [storyListOpen, setStoryListOpenState] = useStoryListOpen(
    () => window.innerWidth,
  );
  const setStoryListOpen = (open: boolean) => {
    // 一覧の中にいるまま閉じると、フォーカスが body へ落ちるので、キャンバスへ戻す
    if (!open && isInsideStoryList(document.activeElement)) focusCanvas();
    setStoryListOpenState(open);
  };

  const [cameraStates, setCameraStates] = useState(initial.cameras);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    initial.threadId,
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  // 読み込んだ画面でピンの要素を探した結果（locatedKey ごと）。見つけたピンは要素に合わせて置く
  const [located, setLocated] = useState<Readonly<Record<string, LocatedPin>>>(
    {},
  );
  // 書きかけの本文（新しいピン・スレッドごとの返信）。吹き出しを閉じても、キャンバスが落ちても残す
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** 書きかけを預ける（null で捨てる） */
  const setDraftBody = (key: string, body: string | null) =>
    setDrafts((previous) => {
      if (body === null) {
        if (!(key in previous)) return previous;
        const next = { ...previous };
        delete next[key];
        return next;
      }
      return previous[key] === body ? previous : { ...previous, [key]: body };
    });
  const [status, setStatus] = useState<StatusFilter>(initial.status);
  const [titleFilter, setTitleFilter] = useState<string | undefined>();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [toast, setToast] = useState<{ message: string } | null>(null);
  // 書き込みが 401 になった（ログインの期限切れ）。消えるお知らせではなく、ログインし直す操作と一緒に出しておく
  const [writeUnauthorized, setWriteUnauthorized] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const canvas = useElementSize<HTMLDivElement>();
  // 既定のブランチとの見比べ（印・「変わった画面だけ」・比べる画面）
  const compare = useBranchCompare({
    branch,
    defaultBranch,
    head: shots,
    base: baseShots,
    initialStoryId: initial.compare,
  });
  const searchRef = useRef<HTMLInputElement>(null);

  const commentsQuery = useComments(branch);
  const branchesQuery = useBranches(true);
  const threads = buildThreads(commentsQuery.data?.comments ?? []);
  /** ピンの位置（要素を見つけていれば要素の上、無ければ置いたときの位置） */
  const pinPointOf = ({ root }: Thread): { x: number; y: number } => {
    const result =
      located[locatedKey(root.source, widthOf(root.source), root.id)];
    if (result?.kind === "found") return { x: result.x, y: result.y };
    // 要素をまだ見つけていない（読み込む前・見つからない）ピンは、画面の枠の中に収める
    // （違う幅で書いた・画面が短くなったときに、枠の外の離れた所へ出さない）
    const frame =
      root.source === page ? findFrame(rows, root.storyId) : undefined;
    if (frame === undefined) return { x: root.x, y: root.y };
    return {
      x: Math.min(Math.max(root.x, 0), frame.w),
      y: Math.min(Math.max(root.y, 0), frame.h),
    };
  };

  /**
   * 見え方を合わせるピンの位置。要素を見つけていればそこ、無ければ置いたときの位置（枠の中に収めない。
   * 画面をまだ測っていなくても、測ったあとにピンが出る位置へ向ける）
   */
  const focusPointOf = ({ root }: Thread): { x: number; y: number } => {
    const result =
      located[locatedKey(root.source, widthOf(root.source), root.id)];
    return result?.kind === "found"
      ? { x: result.x, y: result.y }
      : { x: root.x, y: root.y };
  };

  const sessionExpired =
    writeUnauthorized || isUnauthorized(commentsQuery.error);

  // いまのページの並べ方と見え方
  const width = widthOf(page);
  const shotsOf = (source: StorySource): ShotCatalog =>
    shots[source] ?? EMPTY_SHOT_CATALOG;
  const pageWidthOptions = pageWidths.optionsOf(page);
  const rowsFor = (
    source: StorySource,
    filters: { showComponents: boolean; query: string; changedOnly?: false },
  ) => {
    const shown = filterStories(storiesOf(source), {
      ...filters,
      excludeTitlePrefixes: sources.excludeTitlePrefixes,
    });
    const visible =
      filters.changedOnly === false
        ? shown
        : compare.filter(source, widthOf(source), shown);
    // 高さは、iframe で測ったもの。まだ測っていなければ、発行のときの画像の高さ（読み込む前から、並びを本物の高さにする）
    const measured: Record<string, number> = {};
    for (const story of visible) {
      const height =
        heights[`${source}:${widthOf(source)}:${story.id}`] ??
        shotsOf(source).find(story.id, widthOf(source))?.height;
      if (height !== undefined) measured[story.id] = height;
    }
    return layoutRows(visible, {
      width: widthOf(source),
      baseHeight: sources.get(source).baseHeight,
      heights: measured,
      perRow,
    });
  };
  const rows = rowsFor(page, { showComponents, query });
  const bounds = boundsOfRows(rows);
  const viewport = canvas.size;
  const cameraContext = {
    rows,
    bounds,
    viewport,
    pointOf: (threadId: string) => {
      const thread = threads.find((t) => t.root.id === threadId);
      return thread === undefined ? undefined : focusPointOf(thread);
    },
  };
  // 見え方を合わせている画面（見えている範囲の外でも読み込み、高さを測る）
  const cameraStateOf = (
    states: Readonly<Record<StorySource, CameraState>>,
    source: StorySource,
  ): CameraState => states[source] ?? { kind: "initial" };
  const focusState = cameraStateOf(cameraStates, page);
  const focusStoryId = focusState.kind === "focus" ? focusState.storyId : null;
  const camera = resolveCamera(focusState, cameraContext);

  const updateCamera = (update: (current: Camera) => Camera) =>
    setCameraStates((previous) => ({
      ...previous,
      [page]: {
        kind: "fixed",
        camera: update(
          resolveCamera(cameraStateOf(previous, page), cameraContext),
        ),
      },
    }));
  const viewportCenter = { x: viewport.width / 2, y: viewport.height / 2 };

  // 同じ文言でも出し直せるよう、毎回新しいオブジェクトで持つ（表示時間のタイマーを掛け直すため）
  const showToast = (message: string) => setToast({ message });
  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // いま真ん中に見えている画面（URL の story= に使う）
  const centerStoryId =
    viewport.width === 0
      ? undefined
      : frameAt(rows, screenToWorld(camera, viewportCenter))?.story.id;

  // URL に載せるスレッド（削除されたスレッドは載せない。知らせを出したあと、読み直しや共有で同じ知らせを繰り返さない）
  const urlCommentId =
    activeThreadId !== null &&
    (commentsQuery.data === undefined ||
      threads.some((t) => t.root.id === activeThreadId))
      ? activeThreadId
      : null;

  // URL を、いまのページ・見ている画面・開いているスレッドに合わせる（そのまま共有できるように）
  useEffect(() => {
    const search = buildSearch({
      ...(branch === defaultBranch ? {} : { branch }),
      page,
      ...(urlCommentId === null && centerStoryId !== undefined
        ? { story: centerStoryId }
        : {}),
      ...(urlCommentId === null ? {} : { comment: urlCommentId }),
      // 一覧の状態のタブ（はじめの「未解決」は載せない）
      ...(status === "open" ? {} : { status }),
      ...(compare.storyId === undefined ? {} : { compare: compare.storyId }),
    });
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search}`,
    );
  }, [
    branch,
    defaultBranch,
    page,
    urlCommentId,
    centerStoryId,
    status,
    compare.storyId,
  ]);

  /**
   * API の失敗を、呼んだ側（入力欄・吹き出し）へそのまま伝える。失敗は消えるお知らせにせず、送った所に残して送り直せるようにする
   * （お知らせは成功のときだけ）。ログインの期限切れだけは、ログインし直す操作と一緒に出す
   */
  const report = async <T,>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action();
    } catch (error) {
      if (isUnauthorized(error)) setWriteUnauthorized(true);
      throw error;
    }
  };

  const shareUrl = (state: UrlState) =>
    `${window.location.origin}${window.location.pathname}${buildSearch({
      branch,
      ...state,
      ...(status === "open" ? {} : { status }),
    })}`;
  const copyLink = (state: UrlState) => {
    navigator.clipboard
      .writeText(shareUrl(state))
      .then(() => showToast("リンクをコピーしました"))
      .catch(() => showToast("リンクをコピーできませんでした"));
  };

  const changePage = (next: StorySource) => {
    setPage(next);
    setDraft(null);
    setTitleFilter(undefined);
  };

  /** 画面の一覧で選んだ状態へ移る（並びに出ているものだけを選べるので、絞り込みは変えない） */
  const focusStory = (story: Story) => {
    setCameraStates((previous) => ({
      ...previous,
      [page]: {
        kind: "focus",
        storyId: story.id,
        // 開いたときの初めの見え方（URL の story=）と同じく、画面の上の方を真ん中に寄せる
        point: { x: width / 2, y: 300 },
        zoom: focusZoom(camera.zoom),
      },
    }));
    setDraft(null);
    // 狭い表示では一覧がキャンバスに重なるので、選んだら閉じて画面を見せる
    if (isNarrowViewport(window.innerWidth)) setStoryListOpen(false);
  };

  const focusThread = (thread: Thread) => {
    const { root } = thread;
    const story = storiesByKey.get(storyKey(root.source, root.storyId));
    if (story === undefined) {
      showToast("この画面はいまの Storybook にありません");
    } else {
      // 絞り込みで隠れているときは、見えるように戻す
      let nextShowComponents = showComponents;
      let nextQuery = query;
      if (isComponentStory(story, sources.excludeTitlePrefixes)) {
        nextShowComponents = true;
      }
      if (
        filterStories([story], {
          showComponents: nextShowComponents,
          query: nextQuery,
          excludeTitlePrefixes: sources.excludeTitlePrefixes,
        }).length === 0
      ) {
        nextQuery = "";
      }
      // 「変わった画面だけ」で隠れているときも外す
      const hiddenByChangedOnly =
        compare.filter(root.source, widthOf(root.source), [story]).length === 0;
      if (hiddenByChangedOnly) {
        compare.setChangedOnly(root.source, widthOf(root.source), false);
      }
      setShowComponents(nextShowComponents);
      setQuery(nextQuery);
      const currentZoom = resolveCamera(
        cameraStateOf(cameraStates, root.source),
        {
          rows: rowsFor(root.source, {
            showComponents: nextShowComponents,
            query: nextQuery,
            ...(hiddenByChangedOnly ? { changedOnly: false } : {}),
          }),
          bounds: null,
          viewport,
        },
      ).zoom;
      setCameraStates((previous) => ({
        ...previous,
        [root.source]: {
          kind: "focus",
          storyId: story.id,
          point: focusPointOf(thread),
          zoom: focusZoom(currentZoom),
          // 利用者が動かすまで、ピンを追いかける
          threadId: root.id,
        },
      }));
    }
    if (root.source !== page) setTitleFilter(undefined);
    setPage(root.source);
    setActiveThreadId(root.id);
    setDraft(null);
  };

  const refresh = async () => {
    await commentsQuery.mutate();
    void branchesQuery.mutate();
  };

  const submitDraft = async (body: string) => {
    if (draft === null) return;
    const created = await report(() =>
      reviewApi.createComment({
        branch,
        source: draft.source,
        storyId: draft.storyId,
        x: Math.round(draft.x),
        y: Math.round(draft.y),
        frameWidth: widthOf(draft.source),
        ...(draft.anchor === null ? {} : { anchor: draft.anchor }),
        body,
      }),
    );
    await refresh();
    setDraft(null);
    setDraftBody(NEW_COMMENT_DRAFT, "");
    setActiveThreadId(created.id);
    showToast("コメントしました");
  };

  const activeThread = threads.find((t) => t.root.id === activeThreadId);
  // 開いていたスレッドが（ほかのタブ・ほかの人に）削除された、または削除されたスレッドへのリンクで開いた
  const activeThreadDeleted =
    activeThreadId !== null &&
    activeThread === undefined &&
    commentsQuery.data !== undefined;

  const reply = (thread: Thread) => async (body: string) => {
    await report(() =>
      reviewApi.reply({ branch, parentId: thread.root.id, body }),
    );
    await refresh();
  };

  const editComment = async (commentId: string, body: string) => {
    await report(() => reviewApi.editComment({ branch, commentId, body }));
    await refresh();
  };

  const deleteComment = async (comment: Comment) => {
    const message =
      comment.parentId === null
        ? "このスレッドを削除しますか？返信もすべて消えます。"
        : "この返信を削除しますか？";
    if (!window.confirm(message)) return;
    await report(() =>
      reviewApi.deleteComment({ branch, commentId: comment.id }),
    );
    if (comment.parentId === null) setActiveThreadId(null);
    await refresh();
    showToast("削除しました");
  };

  const toggleResolved = async (thread: Thread) => {
    const resolved = !thread.root.resolved;
    await report(() =>
      reviewApi.setResolved({ branch, commentId: thread.root.id, resolved }),
    );
    await refresh();
    showToast(resolved ? "解決にしました" : "再開しました");
  };

  const revertAiFixed = async (thread: Thread) => {
    await report(() =>
      reviewApi.setAiFixed({
        branch,
        commentId: thread.root.id,
        aiFixed: false,
      }),
    );
    await refresh();
    showToast("未解決へ差し戻しました");
  };

  // ピン（いまのページ。一覧の絞り込みに合わせ、開いているスレッドは必ず出す）
  const pageThreads = threads.filter((t) => t.root.source === page);
  const pinThreads = new Set(
    filterThreads(pageThreads, { status, stories: storiesByKey }).map(
      (t) => t.root.id,
    ),
  );
  const pinsByStory = new Map<string, PinView[]>();
  for (const thread of pageThreads) {
    if (!pinThreads.has(thread.root.id) && thread.root.id !== activeThreadId) {
      continue;
    }
    const pins = pinsByStory.get(thread.root.storyId) ?? [];
    const result = located[locatedKey(page, width, thread.root.id)];
    const missing = result?.kind === "missing";
    pins.push({
      unlocated: isUnlocatedPin(thread.root.anchor, result),
      id: thread.root.id,
      number: thread.number,
      ...pinPointOf(thread),
      status: thread.root.status,
      anchor: thread.root.anchor,
      missing,
      box: result?.kind === "found" ? result.box : null,
      label: `#${thread.number} ${thread.root.author}: ${thread.root.body}${
        missing
          ? "（指していた要素が見つかりません。置いたときの位置に出しています）"
          : ""
      }`,
    });
    pinsByStory.set(thread.root.storyId, pins);
  }

  // いまの幅の画面で、指していた要素が見つからないスレッド（一覧にもピンと同じ印を付ける）
  const missingThreadIds = new Set(
    pageThreads
      .filter(
        (t) => located[locatedKey(page, width, t.root.id)]?.kind === "missing",
      )
      .map((t) => t.root.id),
  );

  // 一覧（いまのページ・解決の状態・画面で絞り込む）
  const titleThreads = filterThreads(pageThreads, {
    status: "all",
    title: titleFilter,
    stories: storiesByKey,
  });
  const counts = countByStatus(titleThreads);
  const listed = filterThreads(titleThreads, { status, stories: storiesByKey });
  // 前へ・次へ（一覧の並び。解決にして一覧から外れた直後は、外れる前の並びで次を決める）
  const { navigation, neighbors } = useThreadNavigation({
    listed: listed.map((t) => t.root.id),
    activeId: activeThread?.root.source === page ? activeThread.root.id : null,
  });
  const goToThread = (threadId: string | undefined) => {
    const target = threads.find((t) => t.root.id === threadId);
    if (target !== undefined) focusThread(target);
  };
  const pendingByStory = countPendingByStory(pageThreads);
  // キーボードの操作（入力欄にいるときは Esc 以外を効かせない）
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialog !== null || compare.storyId !== undefined) return;
      // 日本語の変換中の Esc は変換の取り消し（書きかけを消したり閉じたりしない）
      if (isImeComposing(event)) return;
      const typing = isTypingTarget(event.target);
      if (event.key === " " && !typing) {
        event.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (typing && event.key !== "Escape") return;
      const action = resolveShortcut(event);
      if (action === undefined) return;
      // 操作モードでは、矢印キーは画面の中（スクロール・選択）に使う
      if (action.type === "pan" && tool === "interact") return;
      // ボタン・リンクなどにいるときの矢印キーは、そこでの操作に任せる（キャンバスか何も無い所にいるときだけ動かす）
      if (
        action.type === "pan" &&
        event.target instanceof HTMLElement &&
        event.target !== document.body &&
        event.target.dataset["canvasRoot"] === undefined
      ) {
        return;
      }
      event.preventDefault();
      switch (action.type) {
        case "tool":
          setTool(action.tool);
          if (action.tool !== "comment") setDraft(null);
          break;
        case "escape":
          if (draft !== null) setDraft(null);
          else if (activeThreadId !== null) setActiveThreadId(null);
          else setTool("move");
          break;
        case "zoom-in":
          updateCamera((c) => zoomAt(c, nextZoomStep(c.zoom), viewportCenter));
          break;
        case "zoom-out":
          updateCamera((c) =>
            zoomAt(c, previousZoomStep(c.zoom), viewportCenter),
          );
          break;
        case "zoom-fit":
          setCameraStates((previous) => ({
            ...previous,
            [page]: { kind: "fit" },
          }));
          break;
        case "zoom-reset":
          updateCamera((c) => zoomAt(c, 1, viewportCenter));
          break;
        case "focus-search":
          // 閉じていれば開いてから、絞り込みの欄へ移る（欄は一覧の中にある）
          if (!storyListOpen) flushSync(() => setStoryListOpen(true));
          searchRef.current?.focus();
          break;
        case "toggle-story-list":
          setStoryListOpen(!storyListOpen);
          break;
        case "toggle-sidebar":
          setSidebarOpen((open) => !open);
          break;
        case "help":
          setDialog("help");
          break;
        // 操作モードでは、J・K は画面の中の入力に使う
        case "thread-next":
          if (tool !== "interact") goToThread(neighbors.next);
          break;
        case "thread-previous":
          if (tool !== "interact") goToThread(neighbors.previous);
          break;
        case "pan":
          updateCamera((c) => ({
            ...c,
            x: c.x - action.dx,
            y: c.y - action.dy,
          }));
          break;
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") setSpaceHeld(false);
    };
    const handleBlur = () => setSpaceHeld(false);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  });

  const titles = [
    ...new Set(
      pageThreads.flatMap((t) => {
        const story = storiesByKey.get(storyKey(t.root.source, t.root.storyId));
        return story === undefined ? [] : [story.title];
      }),
    ),
  ].sort();
  const openCounts = mapSources(
    sources.ids,
    (id) =>
      threads.filter((t) => t.root.source === id && !t.root.resolved).length,
  );

  // 吹き出しの位置（ピンの位置を画面上に直す。並べ方から外れていれば出さない）
  // 指している要素の矩形があれば、吹き出しで隠さないように避ける
  const anchorOf = (
    storyId: string,
    point: { x: number; y: number },
    box: AnchorBox | null,
  ) => {
    const frame = findFrame(rows, storyId);
    if (frame === undefined) return undefined;
    const toScreen = (p: { x: number; y: number }) =>
      worldToScreen(camera, framePointToWorld(frame, p));
    const avoid =
      box === null
        ? null
        : (() => {
            const topLeft = toScreen({ x: box.x, y: box.y });
            const bottomRight = toScreen({
              x: box.x + box.width,
              y: box.y + box.height,
            });
            return {
              left: topLeft.x,
              top: topLeft.y,
              right: bottomRight.x,
              bottom: bottomRight.y,
            };
          })();
    // 画面（フレーム）の矩形。吹き出しを、見ている画面の外（左か右）に出す
    const frameTopLeft = worldToScreen(camera, { x: frame.x, y: frame.y });
    const frameBottomRight = worldToScreen(camera, {
      x: frame.x + frame.w,
      y: frame.y + frame.h,
    });
    return popoverPosition(toScreen(point), viewport, avoid, {
      left: frameTopLeft.x,
      top: frameTopLeft.y,
      right: frameBottomRight.x,
      bottom: frameBottomRight.y,
    });
  };
  const activeLocated =
    activeThread === undefined
      ? undefined
      : located[locatedKey(page, width, activeThread.root.id)];
  const threadPosition =
    activeThread !== undefined && activeThread.root.source === page
      ? anchorOf(
          activeThread.root.storyId,
          pinPointOf(activeThread),
          activeLocated?.kind === "found" ? activeLocated.box : null,
        )
      : undefined;
  const draftPosition =
    draft !== null && draft.source === page
      ? anchorOf(draft.storyId, draft, draft.anchor?.box ?? null)
      : undefined;

  const storyMissing =
    storyErrors[page] !== undefined || storiesOf(page).length === 0;
  const unavailable = !(
    published?.storybooks.find((s) => s.source === page)?.available ?? false
  );
  const commit = published?.commit;
  // 比べる画面を開いている画面（いまのページに無ければ開かない）
  const compareStory =
    compare.storyId === undefined
      ? undefined
      : storiesByKey.get(storyKey(page, compare.storyId));
  const branchOptions = buildBranchOptions({
    current: branch,
    defaultBranch,
    published: publishedBranches,
    commented: branchesQuery.data ?? [],
  });

  return (
    <div className="flex h-full flex-col">
      {/* キャンバス（Tab で巡ると長い）を飛ばして、コメント一覧へ移る */}
      {sidebarOpen && (
        <a
          href={`#${COMMENT_LIST_ID}`}
          className="sr-only z-50 rounded-md bg-ink px-3 py-1.5 text-sm text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
        >
          コメント一覧へ移る
        </a>
      )}
      <Toolbar
        page={page}
        onPageChange={changePage}
        openCounts={openCounts}
        tool={tool}
        onToolChange={(next) => {
          setTool(next);
          if (next !== "comment") setDraft(null);
        }}
        branch={branch}
        commit={commit}
        branchOptions={branchOptions}
        onBranchChange={(next) => {
          if (next !== branch) onBranchChange(next, page, centerStoryId);
        }}
        userName={me.name}
        onLogout={onLogout}
        onHelp={() => setDialog("help")}
        storyListOpen={storyListOpen}
        onToggleStoryList={() => setStoryListOpen(!storyListOpen)}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />
      <div className="relative flex min-h-0 flex-1">
        {storyListOpen && (
          <StorySidebar
            rows={rows}
            currentStoryId={centerStoryId}
            query={query}
            onQueryChange={setQuery}
            searchRef={searchRef}
            onSelectStory={focusStory}
            marks={compare.marksOf(
              page,
              width,
              storiesOf(page).map((story) => story.id),
            )}
            {...(compare.available(page)
              ? {
                  changedOnly: {
                    checked: compare.changedOnly(page, width),
                    onChange: (on: boolean) =>
                      compare.setChangedOnly(page, width, on),
                  },
                }
              : {})}
          >
            <DisplaySettings
              showComponents={showComponents}
              onShowComponentsChange={setShowComponents}
              width={width}
              widthOptions={pageWidthOptions}
              onWidthChange={(next) => pageWidths.select(page, next)}
              onWidthRemove={(target) => pageWidths.remove(page, target)}
              perRow={perRow}
              onPerRowChange={setPerRow}
            />
          </StorySidebar>
        )}
        <main className="relative min-w-0 flex-1" aria-label="キャンバス">
          {published === null ? (
            <BranchNotPublishedNotice branch={branch} />
          ) : unavailable || storyMissing ? (
            <StorybookMissingNotice source={page} />
          ) : (
            <>
              <ErrorBoundary
                resetKeys={[page]}
                // 落ちたときに返し損ねた読み込みの枠を捨ててから表示し直す（詰まって1枚も読み込まれなくならないように）
                onReset={() => frameLoadQueue.reset()}
                fallbackRender={({ resetErrorBoundary }) => (
                  <CanvasErrorFallback onRetry={resetErrorBoundary} />
                )}
              >
                <Canvas
                  focusStoryId={focusStoryId}
                  source={page}
                  shots={shotsOf(page)}
                  width={width}
                  rows={rows}
                  camera={camera}
                  viewport={viewport}
                  element={canvas.element}
                  containerRef={canvas.ref}
                  onCameraChange={updateCamera}
                  tool={tool}
                  spaceHeld={spaceHeld}
                  pinsByStory={pinsByStory}
                  pendingByStory={pendingByStory}
                  activeThreadId={activeThreadId}
                  draft={
                    draft !== null && draft.source === page
                      ? { ...draft, box: draft.anchor?.box ?? null }
                      : null
                  }
                  onMeasure={(storyId, height) => {
                    const key = `${page}:${width}:${storyId}`;
                    setHeights((previous) =>
                      previous[key] === height
                        ? previous
                        : { ...previous, [key]: height },
                    );
                  }}
                  onPlace={(storyId, point, anchor) => {
                    setDraft({ source: page, storyId, ...point, anchor });
                    setActiveThreadId(null);
                  }}
                  onLocate={(_storyId, results) =>
                    setLocated((previous) =>
                      mergeLocatedPins(
                        previous,
                        { source: page, width },
                        results,
                      ),
                    )
                  }
                  onOpenThread={(threadId) => {
                    setActiveThreadId(threadId);
                    setDraft(null);
                  }}
                  onBackgroundClick={() => {
                    setActiveThreadId(null);
                    setDraft(null);
                  }}
                  onFrameClick={() =>
                    showToast(
                      "コメントするには上の「コメント」を選んで、画面をクリックします",
                    )
                  }
                  onScreenChanged={() =>
                    showToast(
                      "画面が変わりました。もう一度クリックしてください",
                    )
                  }
                  onCompare={
                    compare.enabled
                      ? (story) => compare.open(story.id)
                      : undefined
                  }
                />
              </ErrorBoundary>
              {activeThread !== undefined && threadPosition !== undefined && (
                <ThreadPopover
                  key={activeThread.root.id}
                  thread={activeThread}
                  story={storiesByKey.get(
                    storyKey(
                      activeThread.root.source,
                      activeThread.root.storyId,
                    ),
                  )}
                  position={threadPosition}
                  currentCommit={commit}
                  currentWidth={width}
                  targetMissing={
                    located[locatedKey(page, width, activeThread.root.id)]
                      ?.kind === "missing"
                  }
                  me={me.sub}
                  drafts={drafts}
                  onDraftChange={setDraftBody}
                  navigation={{
                    position:
                      neighbors.index === -1 ? null : neighbors.index + 1,
                    total: navigation.length,
                    onPrevious:
                      neighbors.previous === undefined
                        ? undefined
                        : () => goToThread(neighbors.previous),
                    onNext:
                      neighbors.next === undefined
                        ? undefined
                        : () => goToThread(neighbors.next),
                  }}
                  onSwitchWidth={(next) => pageWidths.select(page, next)}
                  onClose={() => setActiveThreadId(null)}
                  onReply={reply(activeThread)}
                  onEdit={editComment}
                  onDelete={deleteComment}
                  onToggleResolved={() => toggleResolved(activeThread)}
                  onRevertAiFixed={() => revertAiFixed(activeThread)}
                  onCopyLink={() =>
                    copyLink({ page, comment: activeThread.root.id })
                  }
                />
              )}
              {draft !== null && draftPosition !== undefined && (
                <DraftPopover
                  // 置き直したら出し直し、入力欄へフォーカスを戻す（書きかけは預けてあるので消えない）
                  key={`${draft.storyId}:${draft.x}:${draft.y}`}
                  story={storiesByKey.get(
                    storyKey(draft.source, draft.storyId),
                  )}
                  position={draftPosition}
                  author={me.name}
                  initialBody={drafts[NEW_COMMENT_DRAFT] ?? ""}
                  onDraftChange={(body) =>
                    setDraftBody(NEW_COMMENT_DRAFT, body)
                  }
                  onSubmit={submitDraft}
                  onCancel={() => setDraft(null)}
                />
              )}
              {activeThreadDeleted && (
                <DeletedThreadNotice
                  draftBody={drafts[activeThreadId] ?? ""}
                  onClose={() => setActiveThreadId(null)}
                />
              )}
              {rows.length === 0 && !compare.changedOnly(page, width) && (
                <NoMatchNotice
                  query={query}
                  onClear={() => {
                    if (query === "") setShowComponents(true);
                    else setQuery("");
                  }}
                />
              )}
              {bounds !== null && viewport.width > 0 && (
                <Minimap
                  rows={rows}
                  bounds={bounds}
                  camera={camera}
                  viewport={viewport}
                  onNavigate={(point) =>
                    setCameraStates((previous) => ({
                      ...previous,
                      [page]: {
                        kind: "fixed",
                        camera: centerOn(point, viewport, camera.zoom),
                      },
                    }))
                  }
                />
              )}
              <ZoomControls
                zoom={camera.zoom}
                onZoomIn={() =>
                  updateCamera((c) =>
                    zoomAt(c, nextZoomStep(c.zoom), viewportCenter),
                  )
                }
                onZoomOut={() =>
                  updateCamera((c) =>
                    zoomAt(c, previousZoomStep(c.zoom), viewportCenter),
                  )
                }
                onReset={() =>
                  updateCamera((c) => zoomAt(c, 1, viewportCenter))
                }
                onFit={() =>
                  setCameraStates((previous) => ({
                    ...previous,
                    [page]: { kind: "fit" },
                  }))
                }
              />
            </>
          )}
          {tool === "comment" && !unavailable && (
            <p className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1 text-xs text-white">
              画面をクリックしてコメントを置く（Esc でやめる）
            </p>
          )}
          <Toast message={toast?.message ?? null} />
          {sessionExpired && <SessionExpiredNotice />}
        </main>
        {sidebarOpen && (
          <CommentSidebar
            page={page}
            threads={listed}
            counts={counts}
            status={status}
            onStatusChange={setStatus}
            title={titleFilter}
            titles={titles}
            onTitleChange={setTitleFilter}
            storiesById={storiesByKey}
            activeThreadId={activeThreadId}
            missingThreadIds={missingThreadIds}
            loading={commentsQuery.isLoading}
            errorMessage={
              commentsQuery.error === undefined
                ? undefined
                : commentsErrorMessage(commentsQuery.error)
            }
            onSelect={(thread) => {
              focusThread(thread);
              // 狭い表示では一覧がキャンバスに重なるので、選んだら閉じてスレッドを見せる
              if (isNarrowViewport(window.innerWidth)) {
                setSidebarOpen(false);
              }
            }}
            onExport={() => setDialog("markdown")}
            onCopyLink={() =>
              copyLink(
                activeThreadId === null
                  ? { page }
                  : { page, comment: activeThreadId },
              )
            }
          />
        )}
      </div>
      {dialog === "markdown" && (
        <MarkdownDialog
          initialScope={{ status, allPages: false, format: "issue" }}
          buildText={(scope) => {
            const input = {
              threads: filterThreads(threads, {
                status: scope.status,
                ...(scope.allPages ? {} : { source: page }),
                stories: storiesByKey,
              }),
              stories: storiesByKey,
              sources,
              branch,
              commit,
              origin: window.location.origin,
              // 置いていないブランチには Storybook のリンクを付けない
              storybookBase: published === null ? null : storybookBase,
            };
            return scope.format === "json"
              ? buildExportJson(input)
              : buildMarkdown({ ...input, format: scope.format });
          }}
          fileName={(scope) => exportFileName(branch, scope.format)}
          onCopied={(scope) =>
            showToast(
              scope.format === "json"
                ? "JSON をコピーしました"
                : "Markdown をコピーしました",
            )
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "help" && <HelpDialog onClose={() => setDialog(null)} />}
      {compareStory !== undefined && (
        <CompareDialog
          story={compareStory}
          view={compareViewOf(compare.pairOf(page), compareStory.id, width)}
          defaultBranch={defaultBranch}
          branch={branch}
          onClose={() => {
            // 閉じてから（ダイアログが開く前のフォーカスへ戻したあとで）、その画面のボタンへ戻す
            flushSync(() => compare.close());
            focusCompareButton(compareStory.id);
          }}
        />
      )}
    </div>
  );
};
