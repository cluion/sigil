<?php

namespace App\Http\Controllers;

use App\Models\SigilPage;
use App\Support\SigilDocumentValidator;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use JsonException;
use stdClass;

class SigilPageController extends Controller
{
    public function show(Request $request, string $key): JsonResponse|Response
    {
        $page = SigilPage::query()
            ->where('user_id', $request->user()->getAuthIdentifier())
            ->where('key', $key)
            ->first();

        if ($page === null) {
            return response()->noContent(404);
        }

        return response()->json(['revision' => $page->revision, 'doc' => $page->doc]);
    }

    public function upsert(Request $request, string $key, SigilDocumentValidator $validator): JsonResponse
    {
        if (! $request->isJson()) {
            abort(415, 'A JSON document is required.');
        }

        $raw = $request->getContent();
        if (strlen($raw) > (int) config('sigil.document.max_bytes', 1048576)) {
            abort(413, 'The document exceeds the configured size limit.');
        }

        try {
            // JSON containers add levels beyond node depth; the validator bounds the tree itself.
            $payload = json_decode($raw, false, (int) config('sigil.document.max_depth', 32) * 2 + 8, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw ValidationException::withMessages(['doc' => '無效或巢狀過深的 JSON 文件。']);
        }

        if (! $payload instanceof stdClass
            || array_diff(array_keys(get_object_vars($payload)), ['baseRevision', 'doc']) !== []
            || ! isset($payload->baseRevision, $payload->doc)
            || ! is_int($payload->baseRevision)
            || $payload->baseRevision < 0
            || $payload->baseRevision >= 2147483647
            || ! $payload->doc instanceof stdClass) {
            throw ValidationException::withMessages(['doc' => '需要有效的 baseRevision 與文件物件。']);
        }

        $validator->validate($payload->doc);
        $owner = $request->user()->getAuthIdentifier();

        if ($payload->baseRevision === 0) {
            try {
                SigilPage::query()->create([
                    'user_id' => $owner,
                    'key' => $key,
                    'revision' => 1,
                    'doc' => $payload->doc,
                ]);
            } catch (UniqueConstraintViolationException $error) {
                // Only the page identity collision is a retryable revision conflict.
                if (! $this->isPageIdentityConflict($error)) {
                    throw $error;
                }

                return $this->conflict();
            }

            return response()->json(['revision' => 1], 201);
        }

        // One conditional UPDATE closes the check/write race; query updates bypass model casts.
        $updated = SigilPage::query()
            ->where('user_id', $owner)
            ->where('key', $key)
            ->where('revision', $payload->baseRevision)
            ->update([
                'doc' => json_encode($payload->doc, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                'revision' => $payload->baseRevision + 1,
                'updated_at' => now(),
            ]);

        if ($updated !== 1) {
            return $this->conflict();
        }

        return response()->json(['revision' => $payload->baseRevision + 1]);
    }

    private function conflict(): JsonResponse
    {
        return response()->json([
            'message' => '文件版本已變更，您的本機修改仍保留。請先備份，再決定是否重新載入。',
            'code' => 'revision_conflict',
        ], 409);
    }

    private function isPageIdentityConflict(UniqueConstraintViolationException $error): bool
    {
        $details = $error->errorInfo ?? [];
        $message = (string) ($details[2] ?? '');

        return DB::connection($error->getConnectionName())->getDriverName() === 'sqlite'
            && ($details[1] ?? null) === 19
            && $message === 'UNIQUE constraint failed: sigil_pages.user_id, sigil_pages.key';
    }
}
