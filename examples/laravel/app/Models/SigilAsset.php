<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SigilAsset extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'user_id', 'disk', 'path', 'name', 'mime_type', 'size'];

    protected function casts(): array
    {
        return ['user_id' => 'integer', 'size' => 'integer'];
    }
}
