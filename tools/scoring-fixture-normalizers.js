const QUESTION_ANCHOR_DEFAULT_PASS_CHECKS = [
    'immediate_answer_placement',
    'answer_sentence_concise',
    'question_answer_alignment',
    'clear_answer_formatting'
];
const RETIRED_LEGACY_CHECK_IDS = [
    'intro_first_sentence_topic',
    'orphan_headings',
    'intro_focus_and_factuality.v1'
];

const cloneChecks = (checks) => JSON.parse(JSON.stringify(checks || {}));

const normalizeLegacyNoAnchorSemantics = (checks) => {
    const nextChecks = cloneChecks(checks);

    RETIRED_LEGACY_CHECK_IDS.forEach((checkId) => {
        delete nextChecks[checkId];
    });

    QUESTION_ANCHOR_DEFAULT_PASS_CHECKS.forEach((checkId) => {
        const check = nextChecks[checkId];
        const explanation = String(check?.explanation || '').toLowerCase();
        if (!check || check.verdict !== 'pass') return;
        if (explanation.includes('passes by default') || explanation.includes('no strict question anchor')) {
            check.verdict = 'partial';
            check.ui_verdict = 'partial';
        }
    });

    const faqStructure = nextChecks.faq_structure_opportunity;
    if (faqStructure) {
        const explanation = String(faqStructure.explanation || '').toLowerCase();
        if (faqStructure.verdict === 'pass' && (
            explanation.includes('faq schema opportunity not applicable')
            || explanation.includes('no strict q&a pairs detected')
        )) {
            faqStructure.verdict = 'fail';
            faqStructure.ui_verdict = 'fail';
        }
    }

    const faqJsonldSuggestion = nextChecks.faq_jsonld_generation_suggestion;
    if (faqJsonldSuggestion) {
        const explanation = String(faqJsonldSuggestion.explanation || '').toLowerCase();
        if (faqJsonldSuggestion.verdict === 'pass' && (
            explanation.includes('no strict question anchors detected')
            || explanation.includes('lacks explicit q&a structure')
        )) {
            faqJsonldSuggestion.verdict = 'partial';
            faqJsonldSuggestion.ui_verdict = 'partial';
        }
    }

    return nextChecks;
};

module.exports = {
    normalizeLegacyNoAnchorSemantics
};
