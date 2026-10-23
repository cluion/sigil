<?php

namespace Tests\Feature;

use App\Models\SigilPage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use stdClass;
use Tests\TestCase;

class SigilPageTest extends TestCase
{
    use RefreshDatabase;

    public function test_reading_a_missing_page_does_not_create_it(): void
    {
        $this->actingAs($this->user())->getJson('/sigil/pages/activity')->assertNotFound();
        $this->assertDatabaseCount('sigil_pages', 0);
    }

    public function test_guest_cannot_create_a_page(): void
    {
        $this->putJson('/sigil/pages/activity', ['baseRevision' => 0, 'doc' => $this->doc()])
            ->assertUnauthorized();
        $this->assertDatabaseCount('sigil_pages', 0);
    }

    public function test_create_and_conditional_update_preserve_empty_maps_lists_and_document_fields(): void
    {
        $this->actingAs($this->user());
        $doc = $this->doc();
        $this->putJson('/sigil/pages/activity', ['baseRevision' => 0, 'doc' => $doc])
            ->assertCreated()->assertExactJson(['revision' => 1]);
        $created = json_decode($this->getJson('/sigil/pages/activity')->assertOk()->getContent());
        $this->assertEquals($doc, $created->doc);
        $this->assertInstanceOf(stdClass::class, $created->doc->root->style);
        $this->assertInstanceOf(stdClass::class, $created->doc->root->attributes);
        $this->assertSame([], $created->doc->root->children);

        $doc->root->name = '已更新活動';
        $this->putJson('/sigil/pages/activity', ['baseRevision' => 1, 'doc' => $doc])
            ->assertOk()->assertExactJson(['revision' => 2]);
        $updated = json_decode($this->getJson('/sigil/pages/activity')->assertOk()->getContent());
        $this->assertEquals($doc, $updated->doc);
        $this->assertInstanceOf(stdClass::class, $updated->doc->root->style);
        $this->assertSame(2, $updated->revision);
    }

    public function test_duplicate_create_and_stale_update_never_overwrite_the_winner(): void
    {
        $this->actingAs($this->user());
        $first = $this->doc();
        $second = $this->doc('Another editor');

        $this->putJson('/sigil/pages/activity', ['baseRevision' => 0, 'doc' => $first])->assertCreated();
        $this->putJson('/sigil/pages/activity', ['baseRevision' => 0, 'doc' => $second])
            ->assertConflict()->assertJsonPath('code', 'revision_conflict');

        $first->root->name = 'Winning revision';
        $this->putJson('/sigil/pages/activity', ['baseRevision' => 1, 'doc' => $first])->assertOk();
        $this->putJson('/sigil/pages/activity', ['baseRevision' => 1, 'doc' => $second])->assertConflict();
        $this->getJson('/sigil/pages/activity')->assertOk()
            ->assertJsonPath('revision', 2)->assertJsonPath('doc.root.name', 'Winning revision');
        $this->assertDatabaseCount('sigil_pages', 1);
    }

    public function test_users_have_isolated_page_keys_and_cannot_update_another_owners_page(): void
    {
        $first = $this->user('first@example.test');
        $second = $this->user('second@example.test');

        $this->actingAs($first)->putJson('/sigil/pages/activity', ['baseRevision' => 0, 'doc' => $this->doc('First')])
            ->assertCreated();
        $this->actingAs($second)->getJson('/sigil/pages/activity')->assertNotFound();
        $this->putJson('/sigil/pages/activity', ['baseRevision' => 1, 'doc' => $this->doc('Intrusion')])
            ->assertConflict();
        $this->putJson('/sigil/pages/activity', ['baseRevision' => 0, 'doc' => $this->doc('Second')])
            ->assertCreated();
        $this->getJson('/sigil/pages/activity')->assertJsonPath('doc.root.name', 'Second');
        $this->actingAs($first)->getJson('/sigil/pages/activity')->assertJsonPath('doc.root.name', 'First');
        $this->assertDatabaseCount('sigil_pages', 2);
    }

    public function test_invalid_envelope_or_document_cannot_be_saved(): void
    {
        $this->actingAs($this->user());
        $invalid = $this->doc();
        $invalid->version = 999;

        foreach ([
            ['doc' => $this->doc()],
            ['baseRevision' => '0', 'doc' => $this->doc()],
            ['baseRevision' => -1, 'doc' => $this->doc()],
            ['baseRevision' => 2147483647, 'doc' => $this->doc()],
            ['baseRevision' => 0, 'doc' => $this->doc(), 'user_id' => 99],
            ['baseRevision' => 0, 'doc' => []],
            ['baseRevision' => 0, 'doc' => $invalid],
        ] as $payload) {
            $this->putJson('/sigil/pages/activity', $payload)->assertUnprocessable();
        }
        $this->assertDatabaseCount('sigil_pages', 0);
    }

    public function test_malformed_json_and_oversized_body_are_rejected_before_writing(): void
    {
        $this->actingAs($this->user());
        $this->call('PUT', '/sigil/pages/activity', [], [], [], [
            'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
        ], '{"baseRevision":0,"doc":')->assertUnprocessable();

        config(['sigil.document.max_bytes' => 32]);
        $this->putJson('/sigil/pages/activity', ['baseRevision' => 0, 'doc' => $this->doc()])
            ->assertStatus(413);
        $this->assertDatabaseCount('sigil_pages', 0);
    }

    public function test_non_json_content_is_rejected(): void
    {
        $this->actingAs($this->user())->put('/sigil/pages/activity', ['baseRevision' => 0])
            ->assertStatus(415);
        $this->assertDatabaseCount('sigil_pages', 0);
    }

    public function test_unrelated_database_failure_is_not_reported_as_a_revision_conflict(): void
    {
        $this->actingAs($this->user());
        $this->putJson('/sigil/pages/activity', ['baseRevision' => 0, 'doc' => $this->doc()])->assertCreated();
        DB::statement('CREATE UNIQUE INDEX unrelated_revision_unique ON sigil_pages (revision)');

        $this->putJson('/sigil/pages/another', ['baseRevision' => 0, 'doc' => $this->doc()])
            ->assertStatus(500);
        $this->assertDatabaseCount('sigil_pages', 1);
    }

    public function test_failed_database_update_keeps_the_previous_revision_and_content(): void
    {
        $this->actingAs($this->user());
        $this->putJson('/sigil/pages/activity', ['baseRevision' => 0, 'doc' => $this->doc('Original')])
            ->assertCreated();
        DB::statement("CREATE TRIGGER reject_page_update BEFORE UPDATE ON sigil_pages BEGIN SELECT RAISE(FAIL, 'Simulated storage failure'); END");

        $this->putJson('/sigil/pages/activity', ['baseRevision' => 1, 'doc' => $this->doc('Unsaved')])
            ->assertStatus(500);
        $this->getJson('/sigil/pages/activity')->assertOk()
            ->assertJsonPath('revision', 1)->assertJsonPath('doc.root.name', 'Original');
    }

    private function user(string $email = 'editor@example.test'): User
    {
        return User::query()->create(['name' => 'Editor', 'email' => $email, 'password' => 'Test-password-12345']);
    }

    private function doc(string $name = 'Activity'): stdClass
    {
        $doc = json_decode('{"version":1,"root":{"id":"root","type":"section","name":"Activity","attributes":{},"style":{},"responsiveStyles":{},"children":[]},"meta":{"title":"活動頁","device":"mobile","updatedAt":"2026-10-23T00:00:00Z"},"stylesheets":[]}');
        $doc->root->name = $name;

        return $doc;
    }
}
