<!DOCTYPE html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>登入 Sigil 活動頁後台</title>
    @vite('resources/css/editor.css')
  </head>
  <body>
    <main class="host-card host-login">
      <h1>Sigil 活動頁後台</h1>
      <p>登入後可建立或繼續編輯自己的活動頁。</p>
      <form class="host-form" method="post" action="{{ url('/login') }}">
        @csrf
        <div>
          <label for="email">電子郵件</label>
          <input id="email" name="email" type="email" value="{{ old('email') }}" autocomplete="username" required maxlength="255"
            @error('email') aria-invalid="true" aria-describedby="email-error" @enderror>
          @error('email') <p id="email-error" class="host-error" role="alert">{{ $message }}</p> @enderror
        </div>
        <div>
          <label for="password">密碼</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required
            @error('password') aria-invalid="true" aria-describedby="password-error" @enderror>
          @error('password') <p id="password-error" class="host-error" role="alert">{{ $message }}</p> @enderror
        </div>
        <button class="host-primary" type="submit">登入</button>
      </form>
      <p class="host-note">上傳圖片供活動頁使用，知道圖片網址的人即可讀取圖片。</p>
    </main>
  </body>
</html>
