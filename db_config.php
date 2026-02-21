<?php
// db_config.php
$servername = "localhost";
$username = "root";
$password = "shaunpoi@u"; // Your specific password
$dbname = "college_erp";

// Create connection
$conn = new mysqli($servername, $username, $password, $dbname);

// Check connection
if ($conn->connect_error) {
    die(json_encode(["status" => "error", "message" => "Database Connection Failed: " . $conn->connect_error]));
}
?>