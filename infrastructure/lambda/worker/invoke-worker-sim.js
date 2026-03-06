
/**
 * SIMULATION SCRIPT for AiVI Worker
 * Run this locally to debug the exact error causing "AI Unavailable"
 *
 * Usage:
 *   $env:AVI_MISTRAL_API_KEY = '{"MISTRAL_API_KEY":"YOUR_MISTRAL_KEY"}'
 *   node invoke-worker-sim.js
 */

// Mock environment variables usually present in Lambda
process.env.AVI_MISTRAL_API_KEY = process.env.AVI_MISTRAL_API_KEY || '{"MISTRAL_API_KEY":"MOCK_KEY_IF_NOT_SET"}';
process.env.MISTRAL_MODEL = 'mistral-large-latest';
process.env.RUNS_TABLE = 'aivi-runs-dev';
process.env.ARTIFACTS_BUCKET = 'aivi-artifacts-aivi-dev';
process.env.ENVIRONMENT = 'dev';

// Mock AWS SDK clients to prevent crashing on missing creds (we just want to reach the AI call)
const { mockClient } = require('aws-sdk-client-mock');
// Note: We can't easily mock the AWS SDK imports inside index.js without proxyquire,
// so we will rely on the fact that index.js likely initializes them lazily or we just want to see if it *loads*.

async function runSimulation() {
    console.log("🚀 Starting Worker Simulation...");

    try {
        console.log("📦 Attempting to require index.js...");
        const worker = require('./index.js');
        console.log("✅ index.js loaded successfully!");

        // Create a mock event trigger
        const event = {
            Records: [{
                messageId: "sim-msg-123",
                body: JSON.stringify({
                    run_id: "sim-run-" + Date.now(),
                    manifest_s3_key: "s3://mock-bucket/mock-key", // The code might fail here if it tries to download
                    site_id: "sim-site-123",
                    // Inject MANIFEST directly to bypass S3 download (supported by our code!)
                    manifest_content: {
                        title: "Simulation Test Page",
                        meta_description: "This is a test page to verify Mistral AI integration.",
                        content: "<p>Hello world, this is a test content for AI verification.</p>"
                    }
                })
            }]
        };

        const context = {
            getRemainingTimeInMillis: () => 30000
        };

        console.log("▶️ Invoking handler...");
        const result = await worker.handler(event, context);

        console.log("🏁 Handler returned:", JSON.stringify(result, null, 2));

    } catch (error) {
        console.error("❌ CRITICAL FAILURE:", error);
        console.error("Stack:", error.stack);

        if (error.code === 'MODULE_NOT_FOUND') {
            console.error("\n💡 DIAGNOSIS: Missing Dependency! Run 'npm install'");
        }
    }
}

runSimulation();
