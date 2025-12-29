require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Mock Database (Replace this with MongoDB later)
const USERS = [
    { email: "user@test.com", password: "password123", name: "John Doe", balance: 5000.00 }
];

// --- Routes ---

// 1. Root Route (Used by Render to check health)
app.get('/', (req, res) => {
    res.send('Banking App Backend is Running!');
});

// 2. Login Route
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    console.log(`Attempting login for: ${email}`);

    const user = USERS.find(u => u.email === email && u.password === password);

    if (user) {
        res.status(200).json({
            success: true,
            message: "Login successful",
            user: {
                name: user.name,
                email: user.email,
                balance: user.balance
            }
        });
    } else {
        res.status(401).json({
            success: false,
            message: "Invalid email or password"
        });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
