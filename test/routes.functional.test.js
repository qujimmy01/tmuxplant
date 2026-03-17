const request = require('supertest');
const express = require('express');
// Use the manual mock in test/__mocks__/tmux-service.js
jest.mock('../src/tmux-service', ()=> require('./__mocks__/tmux-service'));

const routes = require('../src/routes');

const app = express();
app.use(express.json());
app.use('/api', routes);

describe('API functional tests (with mocked tmux-service)', () => {
  test('POST /api/sessions creates session', async () => {
    const res = await request(app).post('/api/sessions').send({ name: 'newsession', startDir: '/tmp' });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('DELETE /api/sessions/:name kills session', async () => {
    const res = await request(app).delete('/api/sessions/some');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/sessions/:name/windows creates window', async () => {
    const res = await request(app).post('/api/sessions/s1/windows').send({ windowName: 'win1' });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('POST /api/broadcast handles targets', async () => {
    const res = await request(app).post('/api/broadcast').send({ targets: ['t1','t2'], keys: 'ls -la' });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/ssh returns hosts', async () => {
    const res = await request(app).get('/api/ssh');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
