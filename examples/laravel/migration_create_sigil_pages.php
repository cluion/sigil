<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 參考 migration
 * 將檔名改為 Laravel 慣例時間戳後放入 database/migrations
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sigil_pages', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->json('doc');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sigil_pages');
    }
};
