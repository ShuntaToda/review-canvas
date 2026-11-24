/**
 * お客さま向けの画面で共通のヘッダー。幅 600 未満ではメニューを「メニュー」（≡）にたたむ（styles.css）。
 * サンプルなので、メニュー・カート・ログインのボタンは押しても何もしない（行き先はストーリーの遷移で書く）
 */
export const Header = ({ cartCount }: { cartCount: number }) => (
  <header className="site-header">
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
        {cartCount > 0 && <span className="badge">{cartCount}</span>}
      </button>
      <button type="button" className="header-button">
        ログイン
      </button>
    </div>
  </header>
);
