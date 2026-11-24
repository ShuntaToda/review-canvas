/**
 * お客さま向けの画面で共通のヘッダー。幅 600 未満ではメニューを「メニュー」（≡）にたたむ（styles.css）。
 * サンプルなので、メニュー・カート・ログインのボタンは押しても何もしない（行き先はストーリーの遷移で書く）
 */
export const Header = ({ cartCount }: { cartCount: number }) => (
  <header className="site-header">
    {/* たたんだメニューを開く画面はストーリーに無いので、押しても開かない（見た目の幅ごとの違いを見せるためのボタン） */}
    <button type="button" className="site-menu-button" aria-label="メニュー">
      ≡
    </button>
    <p className="site-brand">サンプルショップ</p>
    <nav className="site-nav">
      <a href="#products">商品</a>
      <a href="#features">特集</a>
      <a href="#mypage">マイページ</a>
    </nav>
    <div className="site-header-actions">
      <button type="button" className="header-button">
        カート
        {cartCount > 0 && (
          <>
            <span className="badge" aria-hidden="true">
              {cartCount}
            </span>
            {/* 印の数字が何かを、読み上げで分かるようにする（ボタンの名前は「カート（3 点）」） */}
            <span className="visually-hidden">（{cartCount} 点）</span>
          </>
        )}
      </button>
      <button type="button" className="header-button">
        ログイン
      </button>
    </div>
  </header>
);
