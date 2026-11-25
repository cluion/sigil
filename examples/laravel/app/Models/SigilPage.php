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

    public function activityTitle(): string
    {
        $doc = $this->doc;
        $nodes = [$doc->root];
        while ($nodes !== []) {
            $node = array_pop($nodes);
            if ($node->id === 'activity-title' && trim($node->content ?? '') !== '') {
                return trim($node->content);
            }
            foreach ($node->children ?? [] as $child) {
                $nodes[] = $child;
            }
        }

        return trim($doc->meta->title ?? '') !== '' ? trim($doc->meta->title) : $this->key;
    }
}
