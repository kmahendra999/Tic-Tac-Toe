<?php
// Copy this file to config.php (same folder) and fill in the MySQL database you created in cPanel
// (cPanel > MySQL Databases: create a database and a user, then add the user to the database with ALL PRIVILEGES).
// config.php is never committed to git.
return [
    'dsn'  => 'mysql:host=localhost;dbname=CPANELUSER_tictactoy;charset=utf8mb4',
    'user' => 'CPANELUSER_ttt',
    'pass' => 'PUT-THE-DATABASE-PASSWORD-HERE',

    // Local testing without MySQL:
    // 'dsn' => 'sqlite:' . __DIR__ . '/data/local.sqlite',
];
