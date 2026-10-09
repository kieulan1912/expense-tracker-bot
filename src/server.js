const http = require('http');
const { pool } = require('./database');

function createHealthServer() {
  return http.createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (request.url === '/health' || request.url === '/') {
      response.writeHead(200);
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (request.url === '/ready') {
      try {
        await pool.query('SELECT 1');
        response.writeHead(200);
        response.end(JSON.stringify({ status: 'ready' }));
      } catch (error) {
        response.writeHead(503);
        response.end(JSON.stringify({ status: 'not_ready' }));
      }
      return;
    }

    response.writeHead(404);
    response.end(JSON.stringify({ error: 'not_found' }));
  });
}

module.exports = { createHealthServer };
