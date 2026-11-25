<?php

declare(strict_types=1);

return [
    // Admission limits for this example; these are not measured performance guarantees.
    'document' => [
        'max_bytes' => 1024 * 1024,
        'max_depth' => 32,
        'max_nodes' => 5000,
    ],
    'assets' => [
        'disk' => 'local',
        'max_bytes' => 4 * 1024 * 1024,
        'max_dimension' => 4096,
    ],
];
