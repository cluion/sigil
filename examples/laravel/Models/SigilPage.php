<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Sigil 頁面文件・doc 欄位為 SigilDoc JSON
 *
 * @property string $key
 * @property array<string, mixed> $doc
 */
class SigilPage extends Model
{
    protected $table = 'sigil_pages';

    protected $fillable = [
        'key',
        'doc',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'doc' => 'array',
        ];
    }
}
