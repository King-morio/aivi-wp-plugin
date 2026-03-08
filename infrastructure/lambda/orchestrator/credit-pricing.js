try {
    module.exports = require('./shared/credit-pricing');
} catch (error) {
    module.exports = require('../shared/credit-pricing');
}
