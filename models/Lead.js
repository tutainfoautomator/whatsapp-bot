const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  phone: String,
  name: String,
  subject: String,  // Ex: "Montagem de Computador", "Manutenção", etc.
  details: String,  // Detalhes adicionais (ex: marca/modelo, uso principal)
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Lead', leadSchema);