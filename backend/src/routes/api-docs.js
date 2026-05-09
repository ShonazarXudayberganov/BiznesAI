/**
 * API documentation viewer endpoint'lari (public).
 *
 *   GET /api/docs           — HTML view (browser'da o'qish uchun)
 *   GET /api/docs/json      — barcha endpoint'lar JSON formatda
 *   GET /api/docs/openapi   — OpenAPI 3.0 spec (qisman, swagger-ui'da ishlatish uchun)
 */
const express = require('express');
const apiDocs = require('../services/apiDocs');

const router = express.Router();

// HTML view (public, auth talab qilmaydi)
router.get('/', (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(apiDocs.renderHtml());
  } catch (e) {
    res.status(500).send('Docs render xato: ' + e.message);
  }
});

// JSON dump
router.get('/json', (req, res) => {
  try {
    const all = apiDocs.getAllEndpoints();
    res.json({
      ok: true,
      count: all.length,
      endpoints: all,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Minimal OpenAPI 3.0
router.get('/openapi', (req, res) => {
  try {
    const all = apiDocs.getAllEndpoints();
    const paths = {};
    for (const ep of all) {
      // OpenAPI uses {param} format, but Express uses :param
      const pathKey = ep.full_path.replace(/:(\w+)/g, '{$1}');
      if (!paths[pathKey]) paths[pathKey] = {};
      paths[pathKey][ep.method.toLowerCase()] = {
        summary: ep.doc ? ep.doc.split('\n')[0].slice(0, 100) : `${ep.method} ${ep.full_path}`,
        description: ep.doc || '',
        tags: [ep.file.replace('.js', '')],
        security: ep.auth_required ? [{ bearerAuth: [] }] : [],
        responses: {
          '200': { description: 'Success' },
          '401': { description: 'Unauthorized' },
          '500': { description: 'Server error' },
        },
      };
    }
    res.json({
      openapi: '3.0.0',
      info: {
        title: 'BiznesAI REST API',
        version: '1.0.0',
        description: 'AI-powered business analytics platform',
      },
      servers: [
        { url: '/api', description: 'Current server' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      paths,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
