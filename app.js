const express = require('express');
const app = express();
const PORT = 3000;

// Middleware to parse request bodies
app.use(express.urlencoded({ extended: true }));

// Serve your HTML file
app.get('/', (req, res) => {
  res.sendFile('login.html', { root: __dirname });
});

// Handle POST request from the form
app.post('/submit-form', (req, res) => {
  const { username, password } = req.body;
  console.log('Username:', username);
  console.log('Password:', password);
  // Process login logic here
  res.send('Login successful');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
