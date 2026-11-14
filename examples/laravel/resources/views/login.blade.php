<!DOCTYPE html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>登入 Sigil 活動頁後台</title>
  </head>
  <body>
    <main>
      <h1>Sigil 活動頁後台</h1>
      <p>登入後可編輯自己的活動頁。上傳圖片供活動頁使用，知道圖片網址的人即可讀取圖片。</p>
      @if ($errors->any())
        <div role="alert">{{ $errors->first() }}</div>
      @endif
      <form method="post" action="{{ url('/login') }}">
        @csrf
        <p><label for="email">電子郵件</label><br><input id="email" name="email" type="email" value="{{ old('email') }}" autocomplete="username" required maxlength="255"></p>
        <p><label for="password">密碼</label><br><input id="password" name="password" type="password" autocomplete="current-password" required></p>
        <button type="submit">登入</button>
      </form>
    </main>
  </body>
</html>
