const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

require('dotenv').config();
const BASE_URL = process.env.API_DOCS_URL || 'http://localhost:3000/docs/api';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Beam API',
      version: '1.0.0',
      description: 'Documentation for Beam backend endpoints',
    },
    servers: [
      {
        url: BASE_URL,
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: [
    path.join(__dirname, '../../routes/*.js'),
    path.join(__dirname, '../../src/index.js'),
  ],
};

module.exports = swaggerJsdoc(options);
