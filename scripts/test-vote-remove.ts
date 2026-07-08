import http from 'http';

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';
const PATH = '/api/vote-remove';

/**
 * Helper to make a POST request.
 */
function makePostRequest(
  headers: Record<string, string>,
  body: any
): Promise<{ statusCode: number; data: string }> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: HOST,
      port: PORT,
      path: PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          data,
        });
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log(`🌌 Starting API Smoke Tests on http://${HOST}:${PORT}${PATH}...`);
  let passed = true;

  // Test 1: Unauthenticated request (should get 401)
  try {
    const res = await makePostRequest({}, { roomId: 'test-room', targetId: 'test-target' });
    if (res.statusCode === 401) {
      console.log('  ✔ [Test 1] Unauthenticated request correctly received 401 Unauthorized.');
    } else {
      console.error(`  ✘ [Test 1] Failed. Expected status 401, but received ${res.statusCode}.`);
      passed = false;
    }
  } catch (error: any) {
    console.error('  ✘ [Test 1] Request error:', error.message);
    console.error('      Make sure the local server is running with `pnpm dev` before testing.');
    process.exit(1);
  }

  // Test 2: Invalid request (authenticated but missing parameters, should get 400)
  try {
    const res = await makePostRequest(
      { Authorization: 'Bearer mock-token' },
      {} // Empty body
    );
    if (res.statusCode === 400) {
      console.log('  ✔ [Test 2] Invalid request (missing params) correctly received 400 Bad Request.');
    } else {
      console.error(`  ✘ [Test 2] Failed. Expected status 400, but received ${res.statusCode}.`);
      passed = false;
    }
  } catch (error: any) {
    console.error('  ✘ [Test 2] Request error:', error.message);
    passed = false;
  }

  if (passed) {
    console.log('\n✨ All smoke tests passed successfully!');
    process.exit(0);
  } else {
    console.error('\n❌ Smoke tests failed.');
    process.exit(1);
  }
}

runTests();
