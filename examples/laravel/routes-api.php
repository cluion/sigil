<?php

/**
 * 合併進 Laravel routes/api.php 的參考片段
 *
 * 請依專案加上 auth middleware・例如：
 *   Route::middleware('auth:sanctum')->group(...)
 */

use App\Http\Controllers\SigilPageController;
use Illuminate\Support\Facades\Route;

Route::get('/pages/{key}', [SigilPageController::class, 'show'])
    ->where('key', '[A-Za-z0-9._-]+');

Route::put('/pages/{key}', [SigilPageController::class, 'upsert'])
    ->where('key', '[A-Za-z0-9._-]+');
