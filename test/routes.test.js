const request = require('supertest');
const express = require('express');
// Use the manual mock in test/__mocks__/tmux-service.js
jest.mock('../src/tmux-service', ()=> require('./__mocks__/tmux-service'));

const routes = require('../src/routes');

const app = express();
app.use(express.json());
app.use('/api', routes);

describe('API routes', () => {
  test('GET /api/sessions returns sessions', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
