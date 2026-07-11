{{-- 參考 Blade：宿主只提供 mount 點與 CSRF；編輯器 JS 由 Vite 打包 --}}
<!DOCTYPE html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="csrf-token" content="{{ csrf_token() }}" />
    <title>Sigil Editor — {{ $pageKey ?? 'home' }}</title>
    @vite(['resources/js/sigil-editor.js'])
  </head>
  <body>
    <div
      id="sigil-root"
      data-page-key="{{ $pageKey ?? 'home' }}"
    ></div>
  </body>
</html>
