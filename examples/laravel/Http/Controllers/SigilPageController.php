<?php

namespace App\Http\Controllers;

use App\Models\SigilPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Validator;

/**
 * Sigil ProjectStore 後端參考
 * GET 與 PUT 單一頁面 JSON
 */
class SigilPageController extends Controller
{
    public function show(string $key): JsonResponse|Response
    {
        $page = SigilPage::query()->where('key', $key)->first();
        if ($page === null) {
            return response()->noContent(404);
        }

        return response()->json($page->doc);
    }

    public function upsert(Request $request, string $key): JsonResponse|Response
    {
        $payload = $request->all();

        $validator = Validator::make($payload, [
            'version' => 'required|integer|min:1',
            'root' => 'required|array',
            'root.id' => 'required|string',
            'root.type' => 'required|string',
            'meta' => 'sometimes|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $page = SigilPage::query()->updateOrCreate(
            ['key' => $key],
            ['doc' => $payload],
        );

        return response()->json($page->doc);
    }
}
