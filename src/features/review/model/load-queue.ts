/** 順番待ちの1件。release で、待っていれば取り消し、始まっていれば枠を返す（何度呼んでもよい） */
export type LoadTicket = {
  readonly started: boolean;
  release: () => void;
};

/**
 * 枠が空いたときに呼ぶ関数。false を返すと断ったことになり、枠はそのまま次へ回す
 * （待っているあいだに見えている範囲から外れた画面が、枠を握ったままにならないように）
 */
type Start = () => unknown;

type Entry = {
  state: "waiting" | "running" | "done";
  start: Start;
  mayPlay: boolean;
};

/**
 * 同時に読み込む数を絞る順番待ち。iframe（Storybook の画面）を一度に読み込みすぎてブラウザが固まらないようにする。
 * 枠は「読み込み・play 関数が終わった」「時間切れ」「外した」のどれかで返す（返し忘れて詰まらないよう、1件ごとに持つ）
 */
export class LoadQueue {
  readonly #max: number;

  readonly #maxPlaying: number;

  #running = new Set<Entry>();

  #waiting: Entry[] = [];

  #paused = false;

  /**
   * max は同時に読み込む数。maxPlaying は、そのうち play 関数を持つ（かもしれない）ストーリーの数（省くと max と同じ）
   */
  constructor(max: number, { maxPlaying = max }: { maxPlaying?: number } = {}) {
    this.#max = max;
    this.#maxPlaying = maxPlaying;
  }

  /**
   * 枠が空いたら start を呼ぶ。
   * mayPlay は play 関数を持つ（かもしれない）ストーリーか。止めているあいだは、持たないと分かっている分だけを始める
   */
  request(
    start: Start,
    { mayPlay = true }: { mayPlay?: boolean } = {},
  ): LoadTicket {
    const entry: Entry = { state: "waiting", start, mayPlay };
    this.#waiting.push(entry);
    this.#fill();
    return {
      get started() {
        return entry.state !== "waiting";
      },
      release: () => this.#release(entry),
    };
  }

  /**
   * play 関数を持つ（かもしれない）ストーリーを新しく始めるのを止める・再開する。
   * 親の入力欄で書いているあいだに、play 関数にフォーカスを取られないようにする（動いている分はそのまま）
   */
  setPaused(paused: boolean): void {
    if (this.#paused === paused) return;
    this.#paused = paused;
    this.#fill();
  }

  /** 待ちも動いている分も捨てて、空の状態に戻す（キャンバスを表示し直すとき） */
  reset(): void {
    for (const entry of [...this.#running, ...this.#waiting]) {
      entry.state = "done";
    }
    this.#running.clear();
    this.#waiting = [];
  }

  #fill() {
    while (this.#running.size < this.#max) {
      const playing = [...this.#running].filter((e) => e.mayPlay).length;
      const canPlay = !this.#paused && playing < this.#maxPlaying;
      const index = this.#waiting.findIndex(
        (entry) => canPlay || !entry.mayPlay,
      );
      if (index === -1) return;
      const [entry] = this.#waiting.splice(index, 1);
      if (entry === undefined) return;
      entry.state = "running";
      this.#running.add(entry);
      if (entry.start() === false) {
        entry.state = "done";
        this.#running.delete(entry);
      }
    }
  }

  #release(entry: Entry) {
    if (entry.state === "waiting") {
      entry.state = "done";
      this.#waiting = this.#waiting.filter((waiting) => waiting !== entry);
      return;
    }
    if (entry.state !== "running") return;
    entry.state = "done";
    this.#running.delete(entry);
    this.#fill();
  }

  get running(): number {
    return this.#running.size;
  }

  get waiting(): number {
    return this.#waiting.length;
  }

  get paused(): boolean {
    return this.#paused;
  }
}

/**
 * キャンバス全体で共有する順番待ち（同時に 3 つまで）。
 * キャンバスはふだん発行のときの画像を並べ、iframe は触る画面だけなので、待たせすぎないよう同時に読み込む。
 * ただし play 関数を持つ（かもしれない）ストーリーは 1 つずつにする。同じページの中ではフォーカスが1つしかなく、
 * play 関数を同時に動かすと互いのフォーカスを取り合って Storybook で直に開いたときと違う状態になるため、描画が終わるまで枠を握る。
 * play 関数を持たないと分かっているストーリー（発行のときの目録・前に読み込んだときに分かる）は、残りの枠で同時に読み込む。
 * 読み込んでから持たないと分かったストーリーは、その時点で枠を返す（Frame）
 */
export const frameLoadQueue = new LoadQueue(3, { maxPlaying: 1 });
