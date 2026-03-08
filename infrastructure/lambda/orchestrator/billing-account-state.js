try {
    module.exports = require('./shared/billing-account-state');
} catch (error) {
    module.exports = require('../shared/billing-account-state');
}
