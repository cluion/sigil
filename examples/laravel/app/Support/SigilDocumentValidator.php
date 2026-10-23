<?php

declare(strict_types=1);

namespace App\Support;

use DateTimeImmutable;
use Illuminate\Validation\ValidationException;
use JsonException;
use stdClass;

/**
 * Admission policy for this native-block Laravel example, not the complete Sigil format.
 * Validate raw JSON objects without normalizing, stripping, or mutating document data.
 */
final class SigilDocumentValidator
{
    public const NODE_TYPES = ['section', 'column', 'text', 'image', 'button'];

    public const TAGS = [
        'section', 'div', 'article', 'header', 'footer', 'main', 'nav', 'aside',
        'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'b', 'i',
        'small', 'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'a', 'button',
        'img', 'figure', 'figcaption', 'hr', 'br',
    ];

    public const STYLE_PROPERTIES = [
        'box-sizing', 'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
        'display', 'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
        'align-items', 'align-self', 'align-content', 'justify-content', 'justify-items',
        'justify-self', 'gap', 'row-gap', 'column-gap', 'grid-template-columns', 'grid-template-rows',
        'grid-column', 'grid-row', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'overflow', 'overflow-x', 'overflow-y', 'overflow-wrap', 'color', 'background', 'background-color',
        'border', 'border-width', 'border-style', 'border-color', 'border-radius', 'box-shadow',
        'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
        'text-align', 'text-transform', 'text-decoration', 'white-space', 'word-break',
        'list-style', 'list-style-type', 'appearance', 'cursor', 'opacity', 'transform',
        'object-fit', 'object-position', 'aspect-ratio',
    ];

    public const STYLE_FUNCTIONS = [
        'rgb', 'rgba', 'hsl', 'hsla', 'linear-gradient', 'radial-gradient',
        'repeating-linear-gradient', 'repeating-radial-gradient', 'minmax', 'repeat',
        'calc', 'min', 'max', 'clamp', 'fit-content', 'translate', 'translatex', 'translatey',
        'scale', 'scalex', 'scaley', 'rotate',
    ];

    private const NODE_FIELDS = [
        'id', 'type', 'tagName', 'attributes', 'style', 'responsiveStyles',
        'className', 'content', 'children', 'name', 'locked', 'hidden',
    ];

    public function validate(object $doc): void
    {
        $this->object($doc, 'doc');
        try {
            $json = json_encode($doc, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS);
        } catch (JsonException) {
            $this->fail('doc', 'must contain finite, valid UTF-8 JSON values');
        }
        if (strlen($json) > (int) config('sigil.document.max_bytes', 1048576)) {
            $this->fail('doc', 'exceeds the document byte limit');
        }
        $this->fields($doc, ['version', 'root', 'meta', 'stylesheets'], 'doc');
        if (($doc->version ?? null) !== 1) {
            $this->fail('doc.version', 'must be integer 1');
        }
        $seen = [];
        $count = 0;
        $this->node($doc->root ?? null, 'doc.root', 1, $seen, $count);
        if (property_exists($doc, 'meta')) {
            $this->meta($doc->meta);
        }
        if (property_exists($doc, 'stylesheets')) {
            $this->stylesheets($doc->stylesheets);
        }
    }

    /** @param array<string, true> $seen */
    private function node(mixed $node, string $path, int $depth, array &$seen, int &$count): void
    {
        if ($depth > (int) config('sigil.document.max_depth', 32)) {
            $this->fail($path, 'exceeds the node depth limit');
        }
        if (++$count > (int) config('sigil.document.max_nodes', 5000)) {
            $this->fail($path, 'exceeds the node count limit');
        }
        $this->object($node, $path);
        $this->fields($node, self::NODE_FIELDS, $path);
        $id = $node->id ?? null;
        $this->identifier($id, "$path.id");
        if (isset($seen[$id])) {
            $this->fail("$path.id", 'must be unique within the document');
        }
        $seen[$id] = true;
        if (!in_array($node->type ?? null, self::NODE_TYPES, true)) {
            $this->fail("$path.type", 'is not a native block supported by this example');
        }
        if (property_exists($node, 'tagName') && !in_array($node->tagName, self::TAGS, true)) {
            $this->fail("$path.tagName", 'is not a supported semantic HTML tag');
        }
        foreach (['name' => 500, 'content' => 100000, 'className' => 2048] as $field => $limit) {
            if (property_exists($node, $field)) {
                $this->text($node->$field, "$path.$field", $limit);
            }
        }
        // Text content is rendered as text by Sigil, including ordinary <, >, and & characters.
        if (isset($node->className) && !preg_match('/\A(?:[A-Za-z0-9_-]+(?: +[A-Za-z0-9_-]+)*)?\z/D', $node->className)) {
            $this->fail("$path.className", 'must contain plain class-name tokens');
        }
        foreach (['locked', 'hidden'] as $field) {
            if (property_exists($node, $field) && !is_bool($node->$field)) {
                $this->fail("$path.$field", 'must be boolean');
            }
        }
        if (property_exists($node, 'attributes')) {
            $this->attributes($node->attributes, "$path.attributes");
        }
        if (property_exists($node, 'style')) {
            $this->style($node->style, "$path.style");
        }
        if (property_exists($node, 'responsiveStyles')) {
            $this->object($node->responsiveStyles, "$path.responsiveStyles");
            $this->fields($node->responsiveStyles, ['tablet', 'mobile'], "$path.responsiveStyles");
            foreach ($node->responsiveStyles as $device => $style) {
                $this->style($style, "$path.responsiveStyles.$device");
            }
        }
        if (property_exists($node, 'children')) {
            $this->list($node->children, "$path.children");
            foreach ($node->children as $index => $child) {
                $this->node($child, "$path.children.$index", $depth + 1, $seen, $count);
            }
        }
    }

    private function attributes(mixed $attributes, string $path): void
    {
        $this->object($attributes, $path);
        foreach ($attributes as $name => $value) {
            $known = in_array($name, ['id', 'class', 'title', 'role', 'alt', 'src', 'href', 'target', 'rel', 'type', 'width', 'height', 'loading'], true);
            if ((!$known && !preg_match('/\A(?:aria|data)-[a-z][a-z0-9-]*\z/D', (string) $name)) || str_starts_with((string) $name, 'data-sigil')) {
                $this->fail("$path.$name", 'is not an allowed HTML attribute');
            }
            $this->text($value, "$path.$name", 2048);
            if ($name === 'src' || $name === 'href') {
                $this->url($value, "$path.$name", $name === 'href');
            }
            if ($name === 'target' && !in_array($value, ['_self', '_blank'], true)) {
                $this->fail("$path.$name", 'must be _self or _blank');
            }
            if ($name === 'type' && $value !== 'button') {
                $this->fail("$path.$name", 'must be button');
            }
            if ($name === 'loading' && !in_array($value, ['lazy', 'eager'], true)) {
                $this->fail("$path.$name", 'must be lazy or eager');
            }
            if (in_array($name, ['width', 'height'], true) && !preg_match('/\A[1-9][0-9]{0,4}\z/D', $value)) {
                $this->fail("$path.$name", 'must be a bounded positive dimension');
            }
        }
    }

    private function url(string $value, string $path, bool $link): void
    {
        if ($value === '') {
            return;
        }
        if (preg_match('/[\x00-\x20\x7f\\\\<>"\']/', $value) || preg_match('/%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i', $value)) {
            $this->fail($path, 'contains unsafe URL characters');
        }
        if (str_starts_with($value, '/') && !str_starts_with($value, '//')) {
            return;
        }
        if ($link && str_starts_with($value, '#')) {
            return;
        }
        if ($link && str_starts_with($value, 'mailto:') && filter_var(substr($value, 7), FILTER_VALIDATE_EMAIL)) {
            return;
        }
        if ($link && preg_match('/\Atel:\+?[0-9][0-9().-]{0,31}\z/D', $value)) {
            return;
        }
        $parts = parse_url($value);
        if (!is_array($parts) || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || !filter_var($value, FILTER_VALIDATE_URL)) {
            $this->fail($path, 'must be a safe HTTP(S), root-relative, or supported link URL');
        }
    }

    private function style(mixed $style, string $path): void
    {
        $this->object($style, $path);
        foreach ($style as $property => $value) {
            if (!in_array($property, self::STYLE_PROPERTIES, true)) {
                $this->fail("$path.$property", 'is not a supported CSS property');
            }
            $this->cssValue($value, "$path.$property", $property);
        }
    }

    /**
     * Restricted CSS token grammar: ASCII words/numbers, colors, punctuation and approved
     * mathematical/color/layout functions. No escapes, comments, URLs, variables, declaration
     * delimiters or at-rules. Browser-specific semantic CSS validity is not asserted here.
     */
    private function cssValue(mixed $value, string $path, string $property): void
    {
        $this->text($value, $path, 2048);
        if (trim($value) === '') {
            $this->fail($path, 'must not be an empty CSS value');
        }
        if ($property === 'font-family') {
            $family = '(?:[A-Za-z][A-Za-z0-9 -]*|"[A-Za-z0-9 -]+"|\'[A-Za-z0-9 -]+\')';
            if (!preg_match('/\A'.$family.'(?:\s*,\s*'.$family.')*\z/D', $value)) {
                $this->fail($path, 'must be a list of plain font names');
            }
            return;
        }
        if (!preg_match('/\A[A-Za-z0-9#.,%+*\/() -]+\z/D', $value) || str_contains($value, '/*') || str_contains($value, '*/')) {
            $this->fail($path, 'contains unsupported CSS tokens');
        }
        preg_match_all('/([A-Za-z][A-Za-z0-9-]*)\s*\(/', $value, $functions);
        foreach ($functions[1] as $function) {
            if (!in_array(strtolower($function), self::STYLE_FUNCTIONS, true)) {
                $this->fail($path, 'contains an unsupported CSS function');
            }
        }
        $depth = 0;
        foreach (str_split($value) as $character) {
            if ($character === '(' && ++$depth > 16) {
                $this->fail($path, 'exceeds the CSS nesting limit');
            }
            if ($character === ')' && --$depth < 0) {
                $this->fail($path, 'contains unbalanced CSS parentheses');
            }
        }
        if ($depth !== 0) {
            $this->fail($path, 'contains unbalanced CSS parentheses');
        }
    }

    private function meta(mixed $meta): void
    {
        $this->object($meta, 'doc.meta');
        $this->fields($meta, ['title', 'device', 'updatedAt'], 'doc.meta');
        if (property_exists($meta, 'title')) {
            $this->text($meta->title, 'doc.meta.title', 1000);
        }
        if (property_exists($meta, 'device') && !in_array($meta->device, ['desktop', 'tablet', 'mobile'], true)) {
            $this->fail('doc.meta.device', 'is not a supported device');
        }
        if (property_exists($meta, 'updatedAt')) {
            $this->text($meta->updatedAt, 'doc.meta.updatedAt', 40);
            if (!preg_match('/\A\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)\z/D', $meta->updatedAt)) {
                $this->fail('doc.meta.updatedAt', 'must be an ISO 8601 timestamp');
            }
            try {
                new DateTimeImmutable($meta->updatedAt);
                $errors = DateTimeImmutable::getLastErrors();
            } catch (\Exception) {
                $this->fail('doc.meta.updatedAt', 'must be a valid timestamp');
            }
            if ($errors !== false && ($errors['warning_count'] || $errors['error_count'])) {
                $this->fail('doc.meta.updatedAt', 'must be a valid timestamp');
            }
        }
    }

    /** Stylesheets round-trip as data; this example does not claim that Sigil renders them. */
    private function stylesheets(mixed $stylesheets): void
    {
        $this->list($stylesheets, 'doc.stylesheets');
        $seen = [];
        foreach ($stylesheets as $index => $sheet) {
            $path = "doc.stylesheets.$index";
            $this->object($sheet, $path);
            $this->fields($sheet, ['id', 'rules'], $path);
            $this->identifier($sheet->id ?? null, "$path.id");
            if (isset($seen[$sheet->id])) {
                $this->fail("$path.id", 'must be unique');
            }
            $seen[$sheet->id] = true;
            $this->text($sheet->rules ?? null, "$path.rules", 65536);
            $remaining = trim($sheet->rules);
            while ($remaining !== '') {
                if (!preg_match('/\A([^{}]+)\{([^{}]*)\}\s*/', $remaining, $rule)) {
                    $this->fail("$path.rules", 'must contain flat selector/declaration rules');
                }
                $this->selector(trim($rule[1]), "$path.rules");
                foreach (explode(';', $rule[2]) as $declaration) {
                    if (trim($declaration) === '') {
                        continue;
                    }
                    if (!preg_match('/\A\s*([a-z-]+)\s*:\s*(.*?)\s*\z/sD', $declaration, $parts)) {
                        $this->fail("$path.rules", 'contains an invalid declaration');
                    }
                    $this->style((object) [$parts[1] => $parts[2]], "$path.rules");
                }
                $remaining = substr($remaining, strlen($rule[0]));
            }
        }
    }

    private function selector(string $selector, string $path): void
    {
        $token = '(?:[a-z][a-z0-9-]*|\\*|[.#][A-Za-z_][A-Za-z0-9_-]*)';
        $compound = $token.'(?:[.#][A-Za-z_][A-Za-z0-9_-]*|:(?:hover|focus|focus-visible|active|first-child|last-child))*';
        foreach (explode(',', $selector) as $part) {
            if (!preg_match('/\A'.$compound.'(?:\s+(?:[>+~]\s*)?'.$compound.'|\s*[>+~]\s*'.$compound.')*\z/D', trim($part))) {
                $this->fail($path, 'contains an unsupported CSS selector');
            }
        }
    }

    private function object(mixed $value, string $path): void
    {
        if (!$value instanceof stdClass) {
            $this->fail($path, 'must be a JSON object (not an array)');
        }
    }

    private function list(mixed $value, string $path): void
    {
        if (!is_array($value) || !array_is_list($value)) {
            $this->fail($path, 'must be a JSON list');
        }
    }

    /** @param list<string> $allowed */
    private function fields(stdClass $value, array $allowed, string $path): void
    {
        foreach (array_keys(get_object_vars($value)) as $field) {
            if (!in_array($field, $allowed, true)) {
                $this->fail("$path.$field", 'is not supported by this example');
            }
        }
    }

    private function identifier(mixed $value, string $path): void
    {
        if (!is_string($value) || !preg_match('/\A[A-Za-z0-9][A-Za-z0-9_-]{0,127}\z/D', $value)) {
            $this->fail($path, 'must be a non-empty plain identifier of at most 128 bytes');
        }
    }

    private function text(mixed $value, string $path, int $maxBytes): void
    {
        if (!is_string($value) || strlen($value) > $maxBytes || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $value)) {
            $this->fail($path, 'must be bounded text without control characters');
        }
    }

    private function fail(string $path, string $message): never
    {
        throw ValidationException::withMessages([$path => $message]);
    }
}
