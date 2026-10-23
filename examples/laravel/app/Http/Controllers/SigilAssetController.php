<?php

namespace App\Http\Controllers;

use App\Models\SigilAsset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class SigilAssetController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $items = SigilAsset::query()
            ->where('user_id', $request->user()->getAuthIdentifier())
            ->orderByDesc('created_at')
            ->orderBy('id')
            ->get()
            ->map(fn (SigilAsset $asset): array => $this->item($asset));

        return response()->json($items);
    }

    public function store(Request $request): JsonResponse
    {
        $maxBytes = (int) config('sigil.assets.max_bytes', 4194304);
        $maxDimension = (int) config('sigil.assets.max_dimension', 4096);
        $request->validate([
            'file' => [
                'required', 'file', 'image', 'mimetypes:image/png,image/jpeg,image/webp',
                'max:'.(int) ceil($maxBytes / 1024),
                Rule::dimensions()->minWidth(1)->minHeight(1)->maxWidth($maxDimension)->maxHeight($maxDimension),
            ],
        ]);
        $file = $request->file('file');
        if ($file->getSize() > $maxBytes) {
            throw ValidationException::withMessages(['file' => '圖片超過大小限制。']);
        }

        $mime = $file->getMimeType();
        $extension = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'][$mime] ?? null;
        $decoded = @imagecreatefromstring($file->getContent());
        if ($extension === null || $decoded === false) {
            throw ValidationException::withMessages(['file' => '需要有效的 PNG、JPEG 或 WebP 圖片。']);
        }
        unset($decoded);

        $id = (string) Str::uuid();
        $owner = $request->user()->getAuthIdentifier();
        $disk = (string) config('sigil.assets.disk', 'local');
        $path = Storage::disk($disk)->putFileAs('sigil-media/'.$owner, $file, $id.'.'.$extension);
        if ($path === false) {
            throw new RuntimeException('The image could not be stored.');
        }

        $name = basename(str_replace('\\', '/', $file->getClientOriginalName()));
        $name = mb_check_encoding($name, 'UTF-8') ? mb_substr($name, 0, 255) : 'Image';
        try {
            $asset = SigilAsset::query()->create([
                'id' => $id,
                'user_id' => $owner,
                'disk' => $disk,
                'path' => $path,
                'name' => $name,
                'mime_type' => $mime,
                'size' => $file->getSize(),
            ]);
        } catch (Throwable $error) {
            try {
                if (! Storage::disk($disk)->delete($path)) {
                    report(new RuntimeException('The unrecorded upload could not be removed.'));
                }
            } catch (Throwable $cleanupError) {
                report($cleanupError);
            }
            throw $error;
        }

        return response()->json($this->item($asset), 201);
    }

    public function show(SigilAsset $asset): StreamedResponse
    {
        // Only image bytes are public; ownership-scoped metadata remains behind authentication.
        abort_unless(Storage::disk($asset->disk)->exists($asset->path), 404);

        return Storage::disk($asset->disk)->response($asset->path, null, [
            'Content-Type' => $asset->mime_type,
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ], 'inline');
    }

    private function item(SigilAsset $asset): array
    {
        $url = route('sigil.media', ['asset' => $asset->id]);

        return [
            'id' => $asset->id,
            'url' => $url,
            'name' => $asset->name,
            'mimeType' => $asset->mime_type,
            'thumbUrl' => $url,
        ];
    }
}
