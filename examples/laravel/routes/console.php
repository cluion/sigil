<?php

use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Validator;

Artisan::command('sigil:user {email} {--name=Editor} {--password-stdin : Read a single password from standard input}', function (): int {
    $email = mb_strtolower((string) $this->argument('email'));
    if ($this->option('password-stdin')) {
        $raw = stream_get_contents(STDIN, 4097);
        if ($raw === false || strlen($raw) > 4096) {
            $this->error('Unable to read a bounded password from standard input.');

            return 1;
        }
        $password = preg_replace('/\r?\n\z/', '', $raw);
    } else {
        if (! $this->input->isInteractive()) {
            $this->error('Use --password-stdin or an interactive terminal.');

            return 1;
        }
        $password = $this->secret('Password', false);
    }

    $validator = Validator::make([
        'email' => $email,
        'name' => $this->option('name'),
        'password' => $password,
    ], [
        'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
        'name' => ['required', 'string', 'max:255'],
        'password' => [
            'required', 'string', 'min:12', 'max:72', 'not_regex:/[\x00\r\n]/',
            function (string $attribute, mixed $value, \Closure $fail): void {
                // The default bcrypt driver only distinguishes the first 72 bytes.
                if (is_string($value) && strlen($value) > 72) {
                    $fail('The password must not exceed 72 bytes.');
                }
            },
        ],
    ]);
    if ($validator->fails()) {
        foreach ($validator->errors()->all() as $message) {
            $this->error($message);
        }

        return 1;
    }

    User::query()->create($validator->validated());
    $this->info('Created editor account: '.$email);

    return 0;
})->purpose('Create an editor account without putting a password in command arguments');
