<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_editor_requires_login_and_login_page_discloses_public_images(): void
    {
        $this->get('/editor/activity')->assertRedirect('/login');
        $this->get('/login')->assertOk()->assertSee('知道圖片網址的人即可讀取圖片');
        $this->getJson('/sigil/pages/activity')->assertUnauthorized();
        $this->getJson('/sigil/assets')->assertUnauthorized();
        $this->postJson('/sigil/assets')->assertUnauthorized();
    }

    public function test_login_authenticates_and_logout_invalidates_the_session(): void
    {
        $user = $this->user();
        $this->withSession(['_token' => 'before-login', 'marker' => 'private']);
        $previousId = session()->getId();

        $this->post('/login', ['email' => 'EDITOR@example.test', 'password' => 'Test-password-12345'])
            ->assertRedirect('/editor/activity');

        $this->assertAuthenticatedAs($user);
        $this->assertNotSame($previousId, session()->getId());
        $loggedInId = session()->getId();
        $loggedInToken = session()->token();

        $this->post('/logout')->assertRedirect('/login');
        $this->assertGuest();
        $this->assertNotSame($loggedInId, session()->getId());
        $this->assertNotSame($loggedInToken, session()->token());
        $this->assertFalse(session()->has('marker'));
        $this->getJson('/sigil/pages/activity')->assertUnauthorized();
    }

    public function test_failed_login_does_not_authenticate_and_is_rate_limited(): void
    {
        $this->user();
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/login', ['email' => 'editor@example.test', 'password' => 'wrong'])
                ->assertUnprocessable()->assertJsonValidationErrors('email');
        }
        $this->postJson('/login', ['email' => 'editor@example.test', 'password' => 'Test-password-12345'])
            ->assertStatus(429);
        $this->assertGuest();
    }

    public function test_web_writes_require_csrf_without_the_framework_test_bypass(): void
    {
        $user = $this->user();
        $this->app->instance('env', 'local');
        $this->withSession(['_token' => 'test-csrf-token']);
        $credentials = ['email' => $user->email, 'password' => 'Test-password-12345'];

        $this->postJson('/login', $credentials)->assertStatus(419);
        $this->post('/login', [...$credentials, '_token' => 'test-csrf-token'])
            ->assertRedirect('/editor/activity');
        $this->assertAuthenticatedAs($user);
        $this->putJson('/sigil/pages/activity', ['baseRevision' => 0])->assertStatus(419);
        $this->postJson('/sigil/assets')->assertStatus(419);
        $this->postJson('/logout')->assertStatus(419);
        $this->post('/logout', ['_token' => session()->token()])->assertRedirect('/login');
        $this->assertGuest();
    }

    public function test_cli_creates_a_hashed_account_and_never_overwrites_an_existing_user(): void
    {
        $this->artisan('sigil:user', ['email' => 'EDITOR@example.test', '--name' => 'Content Editor'])
            ->expectsQuestion('Password', 'Test-password-12345')
            ->expectsOutput('Created editor account: editor@example.test')
            ->assertSuccessful();

        $user = User::query()->sole();
        $this->assertSame('Content Editor', $user->name);
        $this->assertTrue(Hash::check('Test-password-12345', $user->password));
        $this->assertNotSame('Test-password-12345', $user->password);

        $this->artisan('sigil:user', ['email' => 'editor@example.test'])
            ->expectsQuestion('Password', 'Different-password-12345')
            ->assertFailed();

        $this->assertDatabaseCount('users', 1);
        $this->assertTrue(Hash::check('Test-password-12345', $user->fresh()->password));
    }

    public function test_cli_rejects_a_short_password(): void
    {
        $this->artisan('sigil:user', ['email' => 'editor@example.test'])
            ->expectsQuestion('Password', 'short')
            ->assertFailed();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_cli_rejects_passwords_beyond_bcrypt_byte_limit_and_null_bytes(): void
    {
        foreach ([str_repeat('密碼', 13), 'Test-password-12345'."\0"] as $password) {
            $this->artisan('sigil:user', ['email' => 'editor@example.test'])
                ->expectsQuestion('Password', $password)
                ->assertFailed();
        }
        $this->assertDatabaseCount('users', 0);
    }

    private function user(): User
    {
        return User::query()->create([
            'name' => 'Editor',
            'email' => 'editor@example.test',
            'password' => 'Test-password-12345',
        ]);
    }
}
