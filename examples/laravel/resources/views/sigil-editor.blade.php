<!DOCTYPE html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>活動頁編輯 — Sigil</title>
    @vite(['resources/js/sigil-editor.ts'])
  </head>
  <body class="host-workspace">
    <header class="host-header">
      <div class="host-trail">
        <a id="activity-directory" href="{{ route('activities') }}">我的活動頁</a>
        <span aria-hidden="true">/</span>
        <strong id="workspace-title">活動頁編輯</strong>
      </div>
      <details id="page-options" class="host-options">
        <summary>頁面選項</summary>
        <div class="host-options-body">
          <p id="editor-guide" hidden>點選畫布上的文字或圖片就能編輯。上傳的圖片可透過網址公開讀取，請使用可公開的素材。</p>
          <nav aria-label="頁面操作">
            <button id="backup-page" type="button" hidden disabled>下載內容備份</button>
            <button id="reload-page" type="button">重新載入</button>
            <form id="logout-form" method="post" action="{{ url('/logout') }}">
              @csrf
              <button type="submit">登出</button>
            </form>
          </nav>
        </div>
      </details>
    </header>
    <div class="host-feedback">
      <p id="page-status" role="status" aria-live="polite">正在讀取頁面…</p>
      <a id="sign-in-again" href="{{ route('editor', ['key' => $pageKey]) }}" hidden>重新開啟此頁並確認登入</a>
    </div>
    <section id="create-panel" class="host-card host-create" hidden>
      <img class="host-template-cover" src="{{ url('/workshop-printmaking.webp') }}" width="1200" height="800" alt="">
      <h1>從活動範本開始</h1>
      <p>先為活動命名，再換上自己的照片、時間與地點。上傳的照片可透過網址公開讀取。</p>
      <form id="create-form" class="host-form">
        <div>
          <label for="activity-name">活動名稱</label>
          <input id="activity-name" required maxlength="200">
        </div>
        <button class="host-primary" id="create-page" type="submit">建立活動頁</button>
      </form>
    </section>
    <main id="sigil-root" data-page-key="{{ $pageKey }}" data-block-pin-scope="sigil-activities:{{ auth()->id() }}" aria-label="活動頁編輯器"></main>
    <template id="activity-switcher">
      <details class="activity-switcher">
        <summary>切換活動頁</summary>
        <p role="status"></p>
        <ul aria-label="最近儲存的活動頁"></ul>
        <a href="{{ route('activities') }}">所有活動頁</a>
        <a href="{{ route('activities.new') }}">新增活動頁</a>
      </details>
    </template>
  </body>
</html>
