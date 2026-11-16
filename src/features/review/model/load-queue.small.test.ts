import { LoadQueue } from "./load-queue";

describe("LoadQueue", () => {
  test("[正常系]上限まではすぐ始め、超えた分は枠が返るのを待って順に始める", () => {
    const queue = new LoadQueue(2);
    const started: string[] = [];

    const a = queue.request(() => started.push("a"));
    queue.request(() => started.push("b"));
    const c = queue.request(() => started.push("c"));
    queue.request(() => started.push("d"));

    expect(started).toStrictEqual(["a", "b"]);
    expect(a.started).toBe(true);
    expect(c.started).toBe(false);
    expect(queue.waiting).toBe(2);

    a.release();
    expect(started).toStrictEqual(["a", "b", "c"]);
    expect(c.started).toBe(true);
    expect(queue.running).toBe(2);
  });

  test("[正常系]待っている分の release は取り消しになり、始めない", () => {
    const queue = new LoadQueue(1);
    const started: string[] = [];
    const a = queue.request(() => started.push("a"));
    const b = queue.request(() => started.push("b"));
    queue.request(() => started.push("c"));

    b.release();
    a.release();

    expect(started).toStrictEqual(["a", "c"]);
  });

  test("[境界値]同じ枠を何度返しても、ほかの枠は減らない", () => {
    const queue = new LoadQueue(2);
    const a = queue.request(() => undefined);
    queue.request(() => undefined);

    a.release();
    a.release();

    expect(queue.running).toBe(1);
  });

  test("[正常系]reset で詰まった枠を捨て、新しい読み込みをすぐ始められる", () => {
    const queue = new LoadQueue(1);
    const started: string[] = [];
    const stuck = queue.request(() => started.push("stuck"));
    queue.request(() => started.push("waiting"));

    queue.reset();
    queue.request(() => started.push("fresh"));
    stuck.release();

    expect(started).toStrictEqual(["stuck", "fresh"]);
    expect(queue.running).toBe(1);
    expect(queue.waiting).toBe(0);
  });
});

describe("LoadQueue の断り・一時停止", () => {
  test("[正常系]start が false を返したら枠を握らず、次の待ちを始める", () => {
    const queue = new LoadQueue(1);
    const started: string[] = [];
    const a = queue.request(() => started.push("a"));
    const b = queue.request(() => false);
    queue.request(() => started.push("c"));

    a.release();

    expect(started).toStrictEqual(["a", "c"]);
    expect(b.started).toBe(true);
    expect(queue.running).toBe(1);
  });

  test("[正常系]枠が空いていても、断った分は動いている数に数えない", () => {
    const queue = new LoadQueue(1);
    const started: string[] = [];
    const declined = queue.request(() => false);
    queue.request(() => started.push("next"));

    expect(declined.started).toBe(true);
    expect(started).toStrictEqual(["next"]);
    expect(queue.running).toBe(1);
  });

  test("[正常系]止めているあいだは play 関数を持たないと分かっている分だけ始め、再開すると残りを始める", () => {
    const queue = new LoadQueue(1);
    const started: string[] = [];
    queue.setPaused(true);
    const play = queue.request(() => started.push("play"));
    const noPlay = queue.request(() => started.push("no-play"), {
      mayPlay: false,
    });

    expect(started).toStrictEqual(["no-play"]);
    expect(play.started).toBe(false);

    noPlay.release();
    expect(started).toStrictEqual(["no-play"]);

    queue.setPaused(false);
    expect(started).toStrictEqual(["no-play", "play"]);
    expect(queue.paused).toBe(false);
  });
});
