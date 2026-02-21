<?php
// login.php
header('Content-Type: application/json');
require_once 'db_config.php'; // Loads your database connection

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    
    // 1. Get data from your HTML form
    $user = $_POST['username'];
    $pass = $_POST['password'];
    $role = $_POST['role'];

    // 2. Protect against hacking (SQL Injection)
    $user = mysqli_real_escape_string($conn, $user);
    $pass = mysqli_real_escape_string($conn, $pass);
    $role = mysqli_real_escape_string($conn, $role);

    // 3. The Query (Checks if user exists)
    $sql = "SELECT * FROM users WHERE username = '$user' AND password = '$pass' AND role = '$role'";
    $result = $conn->query($sql);

    // 4. Send answer back to index.php
    if ($result->num_rows > 0) {
        $row = $result->fetch_assoc();
        echo json_encode([
            "status" => "success",
            "role" => $row['role'],
            "name" => $row['full_name'] // Assumes you have a 'full_name' column
        ]);
    } else {
        echo json_encode([
            "status" => "error",
            "message" => "Invalid Username, Password, or Role!"
        ]);
    }
}
$conn->close();
?>