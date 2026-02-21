const express = require('express'); 
const cors = require('cors'); 
const helmet = require('helmet'); 
require('dotenv').config(); 

const app = express(); 

app.use(helmet()); 
app.use(cors()); 
app.use(express.json()); 

app.get('/api/health', (req, res) => res.json({ status: 'ok' })); 


const PORT = process.env.PORT || 3000; 
app.listen(PORT, () => console.log('API running on port ' + PORT));
