<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\SigilAssetController;
use App\Http\Controllers\SigilPageController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/editor/activity');
Route::get('/login', [AuthController::class, 'login'])->name('login')->middleware('guest');
Route::post('/login', [AuthController::class, 'store'])->middleware(['guest', 'throttle:10,1']);

Route::get('/sigil/media/{asset}', [SigilAssetController::class, 'show'])
    ->whereUuid('asset')->name('sigil.media');

Route::middleware('auth')->group(function (): void {
    Route::post('/logout', [AuthController::class, 'destroy'])->name('logout');
    Route::get('/editor/{key?}', fn (string $key = 'activity') => view('sigil-editor', ['pageKey' => $key]))
        ->where('key', '[A-Za-z0-9][A-Za-z0-9._-]{0,119}')->name('editor');
    Route::get('/sigil/pages/{key}', [SigilPageController::class, 'show'])
        ->where('key', '[A-Za-z0-9][A-Za-z0-9._-]{0,119}');
    Route::put('/sigil/pages/{key}', [SigilPageController::class, 'upsert'])
        ->where('key', '[A-Za-z0-9][A-Za-z0-9._-]{0,119}');
    Route::get('/sigil/assets', [SigilAssetController::class, 'index']);
    Route::post('/sigil/assets', [SigilAssetController::class, 'store'])->middleware('throttle:30,1');
});
