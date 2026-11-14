<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SigilPage extends Model
{
    protected $fillable = ['user_id', 'key', 'revision', 'doc'];

    protected function casts(): array
    {
        // An array cast would change empty JSON maps into lists on the next response.
        return ['doc' => 'object', 'revision' => 'integer', 'user_id' => 'integer'];
    }
}
