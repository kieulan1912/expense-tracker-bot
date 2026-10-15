const { aiGatewayMethods } = require('../repositories/ai_gateway_contract');
const { createPortUseCases } = require('./create_port_use_cases');

function createAiUseCases(gateway) {
  return createPortUseCases('AI gateway', gateway, aiGatewayMethods);
}

module.exports = { createAiUseCases };
