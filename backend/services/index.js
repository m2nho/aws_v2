const cognitoService = require('./cognitoService');
const dynamoService = require('./dynamoService');
const stsService = require('./stsService');
const historyService = require('./historyService');
const inspectors = require('./inspectors');

module.exports = {
  cognitoService,
  dynamoService,
  stsService,
  historyService,
  inspectors,
};