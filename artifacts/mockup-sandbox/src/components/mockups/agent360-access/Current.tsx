import "./_group.css";

export function Current() {
  return (
    <main className="agent360-access">
      <div className="aa-background" />
      <div className="aa-grid" />
      <div className="aa-vignette" />
      <div className="aa-scene" aria-hidden="true">
        <div className="aa-particles" />
        <div className="aa-core" />
        <div className="aa-cube">
          <i className="aa-face aa-front" /><i className="aa-face aa-back" /><i className="aa-face aa-right" />
          <i className="aa-face aa-left" /><i className="aa-face aa-top" /><i className="aa-face aa-bottom" />
        </div>
      </div>
      <div className="aa-scanlines" />

      <section className="aa-content" aria-label="Авторизация">
        <div className="aa-card">
          <div className="aa-card-inner">
            <div className="aa-mark"><span className="aa-mark-icon" /> Агент-мультитул 360</div>
            <h1 className="aa-title">Авторизация</h1>
            <p className="aa-subtitle">Установите защищенное соединение</p>
            <button className="aa-social" type="button"><span className="aa-google">G</span>Продолжить через Google</button>
            <div className="aa-divider">ИЛИ</div>
            <form onSubmit={(event) => event.preventDefault()}>
              <label className="aa-field"><span className="aa-label">Электронная почта</span><input className="aa-input" type="email" placeholder="sys.admin@domain.com" /></label>
              <label className="aa-field"><span className="aa-label">Пароль</span><input className="aa-input" type="password" placeholder="••••••••" /></label>
              <button className="aa-submit" type="submit">Продолжить</button>
            </form>
            <p className="aa-footer">Новый агент?<button type="button">Создать профиль</button></p>
          </div>
        </div>
      </section>

      <aside className="aa-status" aria-label="Статус системы">
        <div className="aa-status-online"><span className="aa-dot" />Система в сети</div>
        <div>Ядро: защищено</div><div>Версия: 3.6.0.44</div>
        <div className="aa-status-app">Агент-мультитул 360</div>
      </aside>
    </main>
  );
}