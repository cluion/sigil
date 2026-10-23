<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sigil_pages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->string('key', 120);
            $table->unsignedInteger('revision');
            $table->json('doc');
            $table->timestamps();
            $table->unique(['user_id', 'key'], 'sigil_pages_owner_key_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sigil_pages');
    }
};
