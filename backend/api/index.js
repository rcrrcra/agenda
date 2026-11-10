// Ponto de entrada da Vercel (função serverless). O Nest é compilado para `dist/` no build
// (`npm run vercel-build`); aqui só reaproveitamos a instância entre invocações "quentes".
let handler;

module.exports = async (req, res) => {
  if (!handler) {
    const { createApp } = require("../dist/bootstrap");
    const app = await createApp();
    await app.init();
    handler = app.getHttpAdapter().getInstance();
  }
  return handler(req, res);
};
