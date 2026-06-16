const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Navia ClientIQ Backend is running!' });
});

// Temporary route checker
const routes = [
  ['/api/auth', './routes/auth'],
  ['/api/clients', './routes/clients'],
  ['/api/dashboard', './routes/dashboard'],
  ['/api/admin-settings', './routes/adminSettings'],
  ['/api/leads', './routes/leads'],
  ['/api/interactions', './routes/interactions'],
  ['/api/import', './routes/import'],
  ['/api/reports', './routes/reports'],
  ['/api/users', './routes/users'],
  ['/api/rm', './routes/rm'],
  ['/api/ai', './routes/ai'],
  ['/api/contact-logs', './routes/contactLogs'],
];

routes.forEach(([path, file]) => {
  console.log('Loading route:', file);

  const route = require(file);

  console.log('Loaded route type:', typeof route);

  if (typeof route !== 'function') {
    console.log('ERROR: This route is not exporting router correctly:', file);
    throw new Error(`${file} is not a valid Express router`);
  }

  app.use(path, route);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});