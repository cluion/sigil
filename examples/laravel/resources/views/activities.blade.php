<!DOCTYPE html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>我的活動頁 — Sigil</title>
    @vite('resources/css/editor.css')
  </head>
  <body>
    <main class="host-card host-directory">
      <header>
        <h1>我的活動頁</h1>
        <div class="host-actions">
          <a class="host-primary" href="{{ route('activities.new') }}">新增活動頁</a>
          <form method="post" action="{{ route('logout') }}">
            @csrf
            <button type="submit">登出</button>
          </form>
        </div>
      </header>
      @if ($pages->isEmpty())
        <p class="host-empty">目前沒有活動頁。新增後即可在這裡找到已儲存的頁面。</p>
      @else
        <ul class="host-page-list">
          @foreach ($pages as $page)
            <li>
              <a href="{{ route('editor', ['key' => $page->key]) }}">{{ $page->activityTitle() }}</a>
              <small>最後儲存 <time datetime="{{ $page->updated_at->toAtomString() }}">{{ $page->updated_at->format('Y-m-d H:i T') }}</time></small>
            </li>
          @endforeach
        </ul>
      @endif
      @if ($pages->previousPageUrl() || $pages->hasMorePages())
        <nav aria-label="活動頁清單分頁">
          @if ($pages->previousPageUrl())
            <a href="{{ $pages->previousPageUrl() }}">上一頁</a>
          @endif
          @if ($pages->hasMorePages())
            <a href="{{ $pages->nextPageUrl() }}">下一頁</a>
          @endif
        </nav>
      @endif
    </main>
  </body>
</html>
