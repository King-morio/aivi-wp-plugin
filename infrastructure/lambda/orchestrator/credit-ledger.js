try {
    module.exports = require('./shared/credit-ledger');
} catch (error) {
    module.exports = require('../shared/credit-ledger');
}
