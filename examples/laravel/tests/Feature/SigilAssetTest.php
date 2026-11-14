<?php

namespace Tests\Feature;

use App\Models\SigilAsset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SigilAssetTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    public function test_uploaded_image_has_a_random_path_and_public_persistent_bytes(): void
    {
        $user = $this->user();
        $file = UploadedFile::fake()->image('poster.png', 160, 90);
        $bytes = $file->getContent();
        $response = $this->actingAs($user)->postJson('/sigil/assets', ['file' => $file]);
        $response->assertCreated()->assertJsonStructure(['id', 'url', 'name', 'mimeType', 'thumbUrl'])
            ->assertJsonPath('mimeType', 'image/png')->assertJsonPath('name', 'poster.png');

        $asset = SigilAsset::query()->sole();
        $this->assertSame('sigil-media/'.$user->id.'/'.$asset->id.'.png', $asset->path);
        Storage::disk('local')->assertExists($asset->path);
        $this->assertSame($response->json('url'), $response->json('thumbUrl'));
        $this->assertStringContainsString('/sigil/media/'.$asset->id, $response->json('url'));

        $this->post('/logout')->assertRedirect('/login');
        $this->getJson('/sigil/assets')->assertUnauthorized();
        $media = $this->get($response->json('url'));
        $media->assertOk()->assertHeader('Content-Type', 'image/png')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertSame($bytes, $media->streamedContent());
    }

    public function test_asset_metadata_is_scoped_to_owner_without_storage_paths(): void
    {
        $first = $this->user('first@example.test');
        $second = $this->user('second@example.test');
        $firstUpload = $this->actingAs($first)->postJson('/sigil/assets', [
            'file' => UploadedFile::fake()->image('first.jpg', 20, 20),
        ])->assertCreated();
        $this->actingAs($second)->getJson('/sigil/assets')->assertOk()->assertExactJson([]);
        $this->postJson('/sigil/assets', ['file' => UploadedFile::fake()->image('second.webp', 20, 20)])
            ->assertCreated();

        $this->actingAs($first)->getJson('/sigil/assets')->assertOk()->assertJsonCount(1)
            ->assertJsonPath('0.id', $firstUpload->json('id'))
            ->assertJsonMissingPath('0.path')->assertJsonMissingPath('0.disk')->assertJsonMissingPath('0.user_id');
    }

    public function test_svg_forged_content_and_oversized_images_are_rejected(): void
    {
        $this->actingAs($this->user());
        foreach ([
            UploadedFile::fake()->createWithContent('vector.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
            UploadedFile::fake()->createWithContent('fake.png', '<?php echo "not an image";'),
            UploadedFile::fake()->image('large.png', 10, 10)->size(4097),
            UploadedFile::fake()->image('wide.png', 4097, 1),
        ] as $file) {
            $this->postJson('/sigil/assets', ['file' => $file])->assertUnprocessable()->assertJsonValidationErrors('file');
        }
        $this->assertDatabaseCount('sigil_assets', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_invalid_image_data_is_rejected_even_with_an_image_signature(): void
    {
        $this->actingAs($this->user());
        $this->postJson('/sigil/assets', [
            'file' => UploadedFile::fake()->createWithContent('truncated.png', "\x89PNG\r\n\x1a\n"),
        ])->assertUnprocessable();
        $this->assertDatabaseCount('sigil_assets', 0);
    }

    public function test_database_failure_removes_only_the_file_created_by_that_upload(): void
    {
        $this->actingAs($this->user());
        Storage::disk('local')->put('existing.txt', 'Keep this file');
        DB::statement("CREATE TRIGGER reject_asset_insert BEFORE INSERT ON sigil_assets BEGIN SELECT RAISE(FAIL, 'Simulated storage failure'); END");

        $this->postJson('/sigil/assets', ['file' => UploadedFile::fake()->image('new.png', 20, 20)])
            ->assertStatus(500);

        $this->assertSame(['existing.txt'], Storage::disk('local')->allFiles());
        $this->assertSame('Keep this file', Storage::disk('local')->get('existing.txt'));
        $this->assertDatabaseCount('sigil_assets', 0);
    }

    public function test_missing_media_returns_404_without_revealing_metadata(): void
    {
        $this->get('/sigil/media/not-a-uuid')->assertNotFound();
        $this->get('/sigil/media/8cab6b70-a9ac-4b68-aaad-02e05325b7cc')->assertNotFound();
    }

    private function user(string $email = 'editor@example.test'): User
    {
        return User::query()->create(['name' => 'Editor', 'email' => $email, 'password' => 'Test-password-12345']);
    }
}
