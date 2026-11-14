<?php

declare(strict_types=1);

// This entry point is intentionally limited to this example's dedicated SQLite database.
function refuse(string $message): never
{
    fwrite(STDERR, "[sigil-test] Refused: {$message}\n");
    exit(78);
}

/** @param list<string> $command */
function run(array $command, string $root): never
{
    $process = proc_open($command, [STDIN, STDOUT, STDERR], $pipes, $root, null, ['bypass_shell' => true]);
    if (!is_resource($process)) {
        refuse('Unable to start the test runner.');
    }
    $code = proc_close($process);
    exit($code >= 0 ? $code : 1);
}

function databasePath(string $path, string $root): string
{
    if (!str_starts_with($path, DIRECTORY_SEPARATOR) && !preg_match('/\A[A-Za-z]:[\\\\\/]/', $path)) {
        $path = $root.DIRECTORY_SEPARATOR.$path;
    }
    $resolved = realpath($path);
    $parent = realpath(dirname($path));
    if ($resolved === false && $parent === false) {
        refuse('Unable to resolve the development database directory.');
    }
    return $resolved !== false ? $resolved : $parent.DIRECTORY_SEPARATOR.basename($path);
}

$root = realpath(__DIR__.'/..');
if ($root === false || realpath(getcwd()) !== $root) {
    refuse('Run this command from examples/laravel.');
}
$checkOnly = false;
$forward = [];
$arguments = array_slice($argv, 1);
for ($index = 0; $index < count($arguments); $index++) {
    $argument = $arguments[$index];
    if ($argument === '--check-only') {
        $checkOnly = true;
    } elseif ($argument === '--testdox') {
        $forward[] = $argument;
    } elseif (preg_match('/\A(--filter|--testsuite)(?:=(.*))?\z/D', $argument, $match)) {
        $value = $match[2] ?? ($arguments[++$index] ?? '');
        if ($value === '' || str_starts_with($value, '-') || str_contains($value, "\0")) {
            refuse('A filter or testsuite requires a non-empty value.');
        }
        if ($match[1] === '--testsuite' && !in_array($value, ['Unit', 'Feature'], true)) {
            refuse('The supported testsuites are Unit and Feature.');
        }
        $forward[] = $match[1].'='.$value;
    } else {
        // An allowlist also rejects abbreviated configuration/bootstrap and parallel options.
        $path = realpath($argument);
        $tests = $root.DIRECTORY_SEPARATOR.'tests';
        if (str_starts_with($argument, '-') || $path === false || ($path !== $tests && !str_starts_with($path, $tests.DIRECTORY_SEPARATOR)) || (!is_dir($path) && !str_ends_with($path, '.php'))) {
            refuse('Only paths inside tests/, --filter, --testsuite, --testdox and --check-only are supported.');
        }
        $forward[] = $path;
    }
}

$configuration = $root.'/phpunit.xml';
$xml = new DOMDocument();
libxml_use_internal_errors(true);
if (!$xml->load($configuration, LIBXML_NONET) || $xml->doctype !== null || $xml->documentElement?->tagName !== 'phpunit' || $xml->documentElement->getAttribute('bootstrap') !== 'vendor/autoload.php') {
    refuse('phpunit.xml must use the fixed vendor/autoload.php bootstrap without a DOCTYPE.');
}
$environment = [];
$xpath = new DOMXPath($xml);
foreach ($xpath->query('/phpunit/php/*') as $entry) {
    $name = $entry->getAttribute('name');
    $value = $entry->getAttribute('value');
    if ($entry->tagName !== 'env' || !preg_match('/\A[A-Z][A-Z0-9_]*\z/D', $name) || array_key_exists($name, $environment) || $entry->getAttribute('force') !== 'true' || preg_match('/[\x00-\x1f\x7f]/', $value)) {
        refuse('phpunit.xml must contain unique, forced environment entries only.');
    }
    $environment[$name] = $value;
}
foreach (['APP_ENV' => 'testing', 'DB_CONNECTION' => 'sqlite', 'DB_DATABASE' => 'database/sigil_testing', 'DB_URL' => ''] as $name => $expected) {
    if (($environment[$name] ?? null) !== $expected) {
        refuse("phpunit.xml must explicitly set {$name} to the dedicated testing value.");
    }
}
if (array_key_exists('APP_BASE_PATH', $environment)) {
    refuse('APP_BASE_PATH is fixed by this entry point, not phpunit.xml.');
}
$environment['APP_BASE_PATH'] = $root;
if (!is_file($root.'/vendor/autoload.php') || !is_file($root.'/vendor/bin/phpunit')) {
    refuse('Install this example\'s Composer dependencies first.');
}
require $root.'/vendor/autoload.php';

if (!is_file($root.'/.env') || !is_readable($root.'/.env')) {
    refuse('Create .env from .env.example before running tests.');
}
try {
    $development = Dotenv\Dotenv::parse(file_get_contents($root.'/.env'));
    $testing = is_file($root.'/.env.testing') ? Dotenv\Dotenv::parse(file_get_contents($root.'/.env.testing')) : [];
} catch (Throwable) {
    refuse('Unable to parse the local environment files.');
}
if (($development['DB_CONNECTION'] ?? null) !== 'sqlite' || ($development['DB_URL'] ?? null) !== '' || !is_string($development['DB_DATABASE'] ?? null) || $development['DB_DATABASE'] === '') {
    refuse('.env must explicitly identify a separate SQLite development database and an empty DB_URL.');
}
$cache = $root.'/bootstrap/cache/config.php';
if (file_exists($cache) || is_link($cache)) {
    refuse('Remove the Laravel configuration cache before running tests.');
}
foreach ([getenv('APP_CONFIG_CACHE'), $_ENV['APP_CONFIG_CACHE'] ?? null, $_SERVER['APP_CONFIG_CACHE'] ?? null, $development['APP_CONFIG_CACHE'] ?? null, $testing['APP_CONFIG_CACHE'] ?? null, $environment['APP_CONFIG_CACHE'] ?? null] as $customCache) {
    if ($customCache !== false && $customCache !== null && $customCache !== '') {
        refuse('Custom APP_CONFIG_CACHE paths are not supported.');
    }
}
$directory = $root.DIRECTORY_SEPARATOR.'database';
$database = $directory.DIRECTORY_SEPARATOR.'sigil_testing';
if (is_link($directory) || realpath($directory) !== $directory || is_link($database)) {
    refuse('The dedicated testing database and its directory must not be symlinks.');
}
if (databasePath($development['DB_DATABASE'], $root) === $database) {
    refuse('The development and testing database paths must be different.');
}
if (!file_exists($database)) {
    // Exclusive creation cannot truncate a pre-existing file or follow a dangling symlink.
    $created = @fopen($database, 'x');
    if ($created === false) {
        refuse('Unable to create the dedicated empty testing database.');
    }
    fclose($created);
}
clearstatcache(true, $database);
$stat = lstat($database);
if (!is_file($database) || is_link($database) || realpath($database) !== $database || $stat === false || $stat['nlink'] !== 1) {
    refuse('The testing database must be a regular file without additional hard links.');
}
foreach ($environment as $name => $value) {
    if (!putenv($name.'='.$value)) {
        refuse("Unable to set the testing environment variable {$name}.");
    }
    $_ENV[$name] = $value;
    $_SERVER[$name] = $value;
}

// Preserve the local safety tool when installed; other contributors need only Composer/PHP.
foreach (explode(PATH_SEPARATOR, getenv('PATH') ?: '') as $directory) {
    $safeRunner = $directory.DIRECTORY_SEPARATOR.'safe-laravel-test';
    if ($directory !== '' && is_file($safeRunner) && is_executable($safeRunner)) {
        run([$safeRunner, '--runner=phpunit', ...($checkOnly ? ['--check-only'] : []), ...$forward], $root);
    }
}

try {
    $app = require $root.'/bootstrap/app.php';
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
    $config = $app->make('config');
    $connection = $config->get('database.connections.sqlite');
    if ($app->configurationIsCached() || $config->get('app.env') !== 'testing' || $config->get('database.default') !== 'sqlite' || !is_array($connection) || ($connection['driver'] ?? null) !== 'sqlite' || ($connection['database'] ?? null) !== 'database/sigil_testing' || !in_array($connection['url'] ?? null, [null, ''], true)) {
        refuse('Laravel did not resolve the dedicated SQLite testing configuration.');
    }
    $manager = $app->make('db');
    $pdo = $manager->connection('sqlite')->getPdo();
    $main = array_filter($pdo->query('PRAGMA database_list')->fetchAll(PDO::FETCH_ASSOC), fn (array $row): bool => $row['name'] === 'main');
    if (count($main) !== 1 || realpath(reset($main)['file']) !== $database) {
        refuse('SQLite connected to an unexpected database file.');
    }
    $manager->disconnect('sqlite');
} catch (Throwable) {
    refuse('Unable to verify the Laravel testing database connection.');
}
fwrite(STDOUT, "[sigil-test] Verified the dedicated SQLite testing database.\n");
if ($checkOnly) {
    fwrite(STDOUT, "[sigil-test] Check only; no tests were started.\n");
    exit(0);
}
run([PHP_BINARY, $root.'/vendor/bin/phpunit', '--configuration', $configuration, '--bootstrap', $root.'/vendor/autoload.php', ...$forward], $root);
