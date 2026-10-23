<!DOCTYPE html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>活動頁編輯 — Sigil</title>
    @vite(['resources/js/sigil-editor.ts'])
  </head>
  <body>
    <header class="host-header">
      <div><strong>活動頁編輯</strong><span class="host-page">{{ $pageKey }}</span></div>
      <nav aria-label="頁面操作">
        <button id="backup-page" type="button" disabled>下載內容備份</button>
        <button id="reload-page" type="button">重新載入</button>
        <form id="logout-form" method="post" action="{{ url('/logout') }}">
          @csrf
          <button type="submit">登出</button>
        </form>
      </nav>
    </header>
    <aside class="host-guide" aria-label="編輯提示">
      <strong>完成你的活動頁</strong>
      <span>① 選取標題並修改內容　② 換上活動圖片　③ 檢查手機版、預覽後儲存或匯出 HTML</span>
      <small>上傳的圖片可透過網址公開讀取，請使用可公開的素材。</small>
    </aside>
    <div class="host-feedback">
      <p id="page-status" role="status" aria-live="polite">正在讀取頁面…</p>
      <a id="sign-in-again" href="{{ url('/login') }}" hidden>前往登入（請先備份修改）</a>
    </div>
    <section id="create-panel" class="host-create" hidden>
      <h1>從活動範本開始</h1>
      <p>範本包含活動標題、圖片、資訊與常見問題；建立後即可逐項編輯。</p>
      <button id="create-page" type="button">建立活動頁</button>
    </section>
    <main id="sigil-root" data-page-key="{{ $pageKey }}" aria-label="活動頁編輯器"></main>
  </body>
</html>
