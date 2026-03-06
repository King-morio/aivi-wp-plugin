/**
 * Token counting utilities for Claude 3.5 Sonnet
 *
 * Claude 3.5 Sonnet limits:
 * - Context window: 200,000 tokens
 * - Maximum output: 8,192 tokens
 * - Approximate characters per token: 4
 */

// Simple character-based estimation (conservative)
const CHARS_PER_TOKEN = 3.5; // Claude uses more efficient tokenization

/**
 * Estimate tokens from text length
 * This is a rough estimate - actual token count may vary
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  // Count actual characters, not bytes
  const charCount = text.length;
  return Math.ceil(charCount / CHARS_PER_TOKEN);
}

/**
 * Calculate total tokens for a message
 */
function calculateMessageTokens(message) {
  let total = 0;

  // Add system message
  if (message.system) {
    total += estimateTokens(message.system);
  }

  // Add messages
  if (message.messages && Array.isArray(message.messages)) {
    message.messages.forEach(msg => {
      total += estimateTokens(msg.content);
    });
  }

  // Add tools/tool_results if present
  if (message.tools) {
    total += estimateTokens(JSON.stringify(message.tools));
  }

  return total;
}

/**
 * Check if content exceeds limits
 */
function checkTokenLimits(content, maxTokens = 200000) {
  const estimated = estimateTokens(content);

  return {
    estimated,
    withinLimit: estimated <= maxTokens,
    limit: maxTokens,
    utilization: (estimated / maxTokens * 100).toFixed(2) + '%'
  };
}

/**
 * Truncate content to fit within token limit
 * Preserves important content at the beginning
 */
function truncateToTokenLimit(content, maxTokens = 200000, reserveForOutput = 8192) {
  const availableTokens = maxTokens - reserveForOutput;
  const estimated = estimateTokens(content);

  if (estimated <= availableTokens) {
    return content;
  }

  // Calculate how much to keep
  const keepRatio = availableTokens / estimated;
  const keepChars = Math.floor(content.length * keepRatio * 0.95); // 5% buffer

  // Try to truncate at sentence boundary
  let truncated = content.substring(0, keepChars);
  const lastSentence = truncated.lastIndexOf('. ');

  if (lastSentence > keepChars * 0.8) {
    truncated = truncated.substring(0, lastSentence + 1);
  } else {
    truncated = truncated + '...';
  }

  return truncated;
}

/**
 * Format token usage for logging
 */
function formatTokenUsage(input, output) {
  return {
    input: {
      tokens: input,
      estimatedChars: input * CHARS_PER_TOKEN
    },
    output: {
      tokens: output,
      estimatedChars: output * CHARS_PER_TOKEN
    },
    total: {
      tokens: input + output,
      estimatedChars: (input + output) * CHARS_PER_TOKEN
    }
  };
}

module.exports = {
  estimateTokens,
  calculateMessageTokens,
  checkTokenLimits,
  truncateToTokenLimit,
  formatTokenUsage,
  CHARS_PER_TOKEN
};
