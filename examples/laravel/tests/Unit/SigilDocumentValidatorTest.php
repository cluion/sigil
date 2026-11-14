<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\SigilDocumentValidator;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use stdClass;
use Tests\TestCase;

final class SigilDocumentValidatorTest extends TestCase
{
    private function document(): stdClass
    {
        return json_decode('{"version":1,"root":{"id":"root","type":"section","attributes":{},"style":{},"responsiveStyles":{"mobile":{}},"children":[{"id":"text","type":"text","content":"Hello"}]},"meta":{},"stylesheets":[]}', false, 512, JSON_THROW_ON_ERROR);
    }

    private function validator(): SigilDocumentValidator
    {
        return new SigilDocumentValidator;
    }

    #[DataProvider('validFixtureNames')]
    public function test_real_fixtures_are_accepted_without_mutation_or_loss_of_empty_maps(string $name): void
    {
        $path = __DIR__.'/../Fixtures/valid-documents/'.$name;
        self::assertFileExists($path, 'Generate fixtures from the actual TypeScript factories before acceptance.');
        $doc = json_decode(file_get_contents($path), false, 512, JSON_THROW_ON_ERROR);
        $before = json_encode($doc, JSON_THROW_ON_ERROR);

        $this->validator()->validate($doc);

        self::assertSame($before, json_encode($doc, JSON_THROW_ON_ERROR));
        self::assertEquals($doc, json_decode(json_encode($doc, JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR));
    }

    public static function validFixtureNames(): iterable
    {
        foreach (['activity.json', 'basic.json', 'official-marketing.json', 'edited-metadata.json'] as $name) {
            yield $name => [$name];
        }
    }

    #[DataProvider('invalidFields')]
    public function test_invalid_fields_are_rejected_without_mutating_the_document(array $path, mixed $value): void
    {
        $doc = $this->document();
        $target = $doc;
        foreach (array_slice($path, 0, -1) as $field) {
            $target = $target->$field;
        }
        $target->{$path[array_key_last($path)]} = $value;
        $before = serialize($doc);

        try {
            $this->validator()->validate($doc);
            self::fail('Invalid document was accepted.');
        } catch (ValidationException $error) {
            self::assertNotEmpty($error->errors());
            self::assertSame($before, serialize($doc));
        }
    }

    public static function invalidFields(): iterable
    {
        yield 'future version' => [['version'], 2];
        yield 'numeric string version' => [['version'], '1'];
        yield 'float version' => [['version'], 1.0];
        yield 'root list' => [['root'], []];
        yield 'empty ID' => [['root', 'id'], ''];
        yield 'invalid ID token' => [['root', 'id'], 'root" onclick="evil'];
        yield 'overlong ID' => [['root', 'id'], str_repeat('x', 129)];
        yield 'duplicate ID' => [['root', 'children'], [(object) ['id' => 'root', 'type' => 'text']]];
        yield 'children map' => [['root', 'children'], new stdClass];
        yield 'child primitive' => [['root', 'children'], ['text']];
        yield 'attributes list' => [['root', 'attributes'], []];
        yield 'style list' => [['root', 'style'], []];
        yield 'responsive list' => [['root', 'responsiveStyles'], []];
        yield 'responsive nested list' => [['root', 'responsiveStyles'], (object) ['mobile' => []]];
        yield 'unknown breakpoint' => [['root', 'responsiveStyles'], (object) ['desktop' => new stdClass]];
        yield 'unknown node field' => [['root', 'danger'], 'ignored?'];
        yield 'shortcode field' => [['root', 'shortcode'], (object) ['name' => 'untrusted', 'props' => new stdClass]];
        yield 'shortcode type' => [['root', 'type'], 'shortcode'];
        yield 'rich text type' => [['root', 'type'], 'rich-text'];
        yield 'HTML type' => [['root', 'type'], 'html'];
        foreach (['script', 'iframe', 'object', 'embed', 'style', 'svg', 'math', 'form', 'input', 'video', 'SCRIPT'] as $tag) {
            yield 'tag '.$tag => [['root', 'tagName'], $tag];
        }
        yield 'boolean string' => [['root', 'hidden'], 'false'];
        yield 'numeric boolean' => [['root', 'locked'], 0];
        yield 'null name' => [['root', 'name'], null];
        yield 'content object' => [['root', 'content'], new stdClass];
        yield 'content control character' => [['root', 'content'], "hello\0world"];
        yield 'overlong content' => [['root', 'content'], str_repeat('x', 100001)];
        yield 'invalid UTF8' => [['root', 'content'], "\x80"];
        yield 'nonfinite number' => [['root', 'content'], INF];
        yield 'unsafe class tokens' => [['root', 'className'], 'x" onclick="evil'];
        foreach (['onclick', 'onError', 'srcdoc', 'style', 'data-sigil-id', 'data-sigil', 'data-sigil-extra', 'xlink:href', 'NAME'] as $attribute) {
            yield 'attribute '.$attribute => [['root', 'attributes'], (object) [$attribute => 'value']];
        }
        yield 'numeric attribute' => [['root', 'attributes'], (object) ['width' => 10]];
        yield 'parent target' => [['root', 'attributes'], (object) ['target' => '_top']];
        yield 'submit button' => [['root', 'attributes'], (object) ['type' => 'submit']];
        foreach (['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:image/png;base64,AA', 'blob:https://example.com/id', '//evil.test/image', '/\\evil.test/image', "https://example.com/\nimage", 'https://example.com/%0aimage', 'https://user:pass@example.com/image', 'file:///etc/passwd', 'https://', 'mailto:test@example.com', '#image'] as $url) {
            yield 'unsafe source '.$url => [['root', 'attributes'], (object) ['src' => $url]];
        }
        foreach (['behavior', '-moz-binding', '--untrusted', 'background-image', 'position'] as $property) {
            yield 'CSS property '.$property => [['root', 'style'], (object) [$property => 'none']];
        }
        foreach (['url(https://evil.test/image)', 'URL(data:image/png;base64,AA)', 'u\\72l(test)', 'u/**/rl(test)', 'expression(alert(1))', 'var(--unsafe)', 'attr(data-secret)', 'image-set(test)', 'red; display:none', 'red!important', '<style>', 'rgb(1,2,3', 'rgb(1,2,3))', "red\n", '', str_repeat('calc(', 17).'1'.str_repeat(')', 17)] as $value) {
            yield 'unsafe CSS value '.$value => [['root', 'style'], (object) ['background' => $value]];
        }
        yield 'numeric CSS value' => [['root', 'style'], (object) ['width' => 100]];
        yield 'unsafe font family' => [['root', 'style'], (object) ['font-family' => 'Arial; color:red']];
        yield 'meta list' => [['meta'], []];
        yield 'meta unknown key' => [['meta'], (object) ['html' => '<script>']];
        yield 'meta invalid device' => [['meta'], (object) ['device' => 'print']];
        yield 'meta invalid date' => [['meta'], (object) ['updatedAt' => '2026-02-31T10:30:00Z']];
        yield 'meta invalid timestamp' => [['meta'], (object) ['updatedAt' => 'yesterday']];
        yield 'meta invalid offset' => [['meta'], (object) ['updatedAt' => '2026-10-23T10:30:00+24:00']];
        yield 'stylesheets map' => [['stylesheets'], new stdClass];
        yield 'stylesheets item list' => [['stylesheets'], [[]]];
        yield 'stylesheets duplicate IDs' => [['stylesheets'], [(object) ['id' => 'x', 'rules' => ''], (object) ['id' => 'x', 'rules' => '']]];
        foreach (['@import "https://evil.test/x.css";', 'body { background: url(https://evil.test/image); }', 'body { color: red } <script>', 'body { color: red; } /* comment */', 'body { --x: red; }', '[data-secret] { color: red; }', '.x { @media screen { color: red; } }'] as $rules) {
            yield 'unsafe stylesheet '.$rules => [['stylesheets'], [(object) ['id' => 'sheet', 'rules' => $rules]]];
        }
    }

    public function test_all_official_style_properties_and_safe_function_families_are_accepted(): void
    {
        $doc = $this->document();
        $doc->root->style = (object) [
            'font-family' => '"Open Sans", ui-sans-serif, system-ui, sans-serif',
            'background' => 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 52%, #f5f3ff 100%)',
            'grid-template-columns' => 'repeat(3, minmax(0, 1fr))',
            'padding' => 'clamp(1rem, 4vw, 3rem) 2rem',
            'width' => 'calc(100% - 2rem)',
            'transform' => 'translateY(-0.75rem)',
            'box-shadow' => '0 0.75rem 1.75rem rgba(79, 70, 229, 0.24)',
            'color' => 'hsl(240, 50%, 50%)',
        ];
        $doc->root->responsiveStyles = (object) ['tablet' => (object) ['display' => 'grid'], 'mobile' => new stdClass];
        $doc->root->content = '文字 < 10 > 5 & "quotes" are plain text, even <script>alert(1)</script>.';
        $this->validator()->validate($doc);
        self::assertInstanceOf(stdClass::class, $doc->root->responsiveStyles->mobile);
    }

    #[DataProvider('safeUrls')]
    public function test_safe_asset_and_link_urls_are_preserved(string $name, string $url): void
    {
        $doc = $this->document();
        $doc->root->attributes = (object) [$name => $url];
        $this->validator()->validate($doc);
        self::assertSame($url, $doc->root->attributes->$name);
    }

    public static function safeUrls(): iterable
    {
        foreach (['', '/placeholder.svg', '/sigil/media/01234567-89ab-cdef-0123-456789abcdef', 'https://placehold.co/120', 'http://127.0.0.1:8000/sigil/media/id', 'https://example.com/image.png?size=100&scale=2'] as $url) {
            yield 'image '.$url => ['src', $url];
        }
        foreach (['https://example.com/', '#registration', '/signup', 'mailto:events@example.com', 'tel:+886-2-12345678'] as $url) {
            yield 'link '.$url => ['href', $url];
        }
    }

    public function test_node_depth_limit_is_inclusive_and_enforced(): void
    {
        $doc = $this->document();
        $doc->root->children = [];
        $tail = $doc->root;
        for ($depth = 2; $depth <= 32; $depth++) {
            $child = (object) ['id' => 'n'.$depth, 'type' => 'section', 'children' => []];
            $tail->children[] = $child;
            $tail = $child;
        }
        $this->validator()->validate($doc);
        $tail->children[] = (object) ['id' => 'too-deep', 'type' => 'text'];
        $this->expectException(ValidationException::class);
        $this->validator()->validate($doc);
    }

    public function test_node_count_limit_is_inclusive_and_enforced(): void
    {
        $doc = $this->document();
        $doc->root->children = [];
        for ($index = 1; $index < 5000; $index++) {
            $doc->root->children[] = (object) ['id' => 'n'.$index, 'type' => 'text'];
        }
        $this->validator()->validate($doc);
        $doc->root->children[] = (object) ['id' => 'overflow', 'type' => 'text'];
        $this->expectException(ValidationException::class);
        $this->validator()->validate($doc);
    }

    public function test_document_size_uses_utf8_bytes_and_honors_the_configured_limit(): void
    {
        $doc = $this->document();
        $doc->root->content = '中文內容';
        $bytes = strlen(json_encode($doc, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        config(['sigil.document.max_bytes' => $bytes]);
        $this->validator()->validate($doc);
        config(['sigil.document.max_bytes' => $bytes - 1]);
        $this->expectException(ValidationException::class);
        $this->validator()->validate($doc);
    }

    public function test_configuration_controls_depth_and_node_count(): void
    {
        config(['sigil.document.max_depth' => 1, 'sigil.document.max_nodes' => 1]);
        $doc = $this->document();
        $doc->root->children = [];
        $this->validator()->validate($doc);
        $doc->root->children[] = (object) ['id' => 'second', 'type' => 'text'];
        $this->expectException(ValidationException::class);
        $this->validator()->validate($doc);
    }
}
